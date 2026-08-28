import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

/**
 * Contrato da view publica `candidatos_publico`.
 *
 * A view e recriada de tempos em tempos, e cada recriacao e uma chance de perder
 * uma clausula em silencio. Ja aconteceu na direcao oposta: a 20260803142851
 * existe porque `fonte_dados` repassava marcador operacional interno para a
 * linha "Fontes:" da ficha, dois dias antes do lancamento publico.
 *
 * Este teste compara a definicao NOVA com a definicao de REGISTRO por parse, nao
 * por leitura humana, e exige que a unica diferenca seja a coluna acrescentada
 * no fim. Ele nao depende de banco: le os proprios arquivos de migration.
 */

const MIGRATIONS = join(process.cwd(), "supabase", "migrations")

/** A definicao efetivamente aplicada, de onde a nova tem de derivar. */
const REGISTRO = "20260803142851_fonte_dados_prefixo_interno_fora_da_superficie_publica.sql"
/** A migration de schema puro desta etapa. */
const NOVA = "20260809060000_verificacao_campos_schema_publico.sql"

function ler(nome: string): string {
  return readFileSync(join(MIGRATIONS, nome), "utf8")
}

/**
 * Statements sem os comentarios. Guarda de statement tem de julgar SQL, nao
 * prosa: o proprio arquivo explica por escrito por que nunca se deve usar
 * `DROP VIEW` aqui, e um grep cru acusaria essa frase.
 */
function statements(nome: string): string {
  return ler(nome)
    .split("\n")
    .filter((linha) => !linha.trimStart().startsWith("--"))
    .join("\n")
}

/** Recorta o corpo do CREATE OR REPLACE VIEW, do SELECT ate o `;`. */
function corpoDaView(sql: string): string {
  const inicio = sql.indexOf("CREATE OR REPLACE VIEW public.candidatos_publico")
  assert.notEqual(inicio, -1, "CREATE OR REPLACE VIEW public.candidatos_publico nao encontrado")
  const recorte = sql.indexOf("publicavel = true", inicio)
  assert.notEqual(recorte, -1, "clausula `publicavel = true` nao encontrada na view")
  const fim = sql.indexOf(";", recorte)
  assert.notEqual(fim, -1, "fim do statement da view nao encontrado")
  return sql.slice(inicio, fim + 1)
}

/**
 * Lista as colunas de saida na ordem. Colunas derivadas sao reduzidas ao alias,
 * que e o que o consumidor publico enxerga.
 */
function colunasDaView(corpo: string): string[] {
  // `indexOf`/`lastIndexOf` devolvendo -1 e continuando produziria um recorte
  // truncado que passa nas asserções seguintes por acidente.
  const inicioSelect = corpo.indexOf("SELECT")
  assert.notEqual(inicioSelect, -1, "SELECT nao encontrado no corpo da view")
  const fimSelect =
    corpo.lastIndexOf("FROM public.") >= 0
      ? corpo.lastIndexOf("FROM public.")
      : corpo.lastIndexOf("FROM candidatos")
  assert.notEqual(fimSelect, -1, "clausula FROM nao encontrada no corpo da view")
  const select = corpo.slice(inicioSelect + "SELECT".length, fimSelect)

  const colunas: string[] = []
  let profundidade = 0
  let atual = ""
  for (const ch of select) {
    if (ch === "(") profundidade += 1
    if (ch === ")") profundidade -= 1
    if (ch === "," && profundidade === 0) {
      colunas.push(atual)
      atual = ""
      continue
    }
    atual += ch
  }
  colunas.push(atual)

  return colunas
    .map((bruta) => {
      const limpa = bruta.replace(/\s+/g, " ").trim()
      const alias = limpa.match(/ AS ([a-z_]+)$/)
      return alias ? alias[1] : limpa
    })
    .filter(Boolean)
}

describe("contrato da view candidatos_publico", () => {
  const registro = corpoDaView(ler(REGISTRO))
  const nova = corpoDaView(ler(NOVA))
  const colunasRegistro = colunasDaView(registro)
  const colunasNova = colunasDaView(nova)

  it("o parse achou uma lista de colunas nao trivial nos dois lados", () => {
    // Sem isto, todas as comparacoes abaixo passariam com listas vazias.
    assert.ok(colunasRegistro.length >= 20, `so ${colunasRegistro.length} colunas no registro`)
    assert.equal(colunasNova.length, colunasRegistro.length + 1)
  })

  it("as colunas do registro são preservadas na mesma ordem", () => {
    assert.deepEqual(colunasNova.slice(0, colunasRegistro.length), colunasRegistro)
  })

  it("a única coluna acrescentada é verificacao_campos, e ela vai no FIM", () => {
    // CREATE OR REPLACE VIEW so aceita acrescimo no fim: remover, renomear,
    // reordenar ou trocar tipo de coluna existente falha no Postgres.
    assert.equal(colunasNova.at(-1), "verificacao_campos")
    assert.equal(colunasRegistro.includes("verificacao_campos"), false)
  })

  it("security_invoker = true continua explícito", () => {
    assert.match(nova, /WITH \(security_invoker = true\)/)
  })

  it("o filtro de marcador interno em fonte_dados sobrevive", () => {
    // Regressao de 03/08/2026: sem este filtro, entrada com prefixo `interno:`
    // vaza para a linha "Fontes:" da ficha publica.
    assert.match(nova, /WHERE f\.valor NOT LIKE 'interno:%'\) AS fonte_dados/)
  })

  it("a idade derivada sobrevive", () => {
    assert.match(nova, /COALESCE\(idade, EXTRACT\(year FROM age\(CURRENT_DATE/)
  })

  it("o recorte publicável sobrevive", () => {
    assert.match(nova, /WHERE status <> 'removido'::text AND publicavel = true/)
  })

  it("o GRANT da view é reemitido", () => {
    assert.match(ler(NOVA), /GRANT SELECT ON public\.candidatos_publico TO anon, authenticated;/)
  })

  it("o GRANT de coluna em candidatos existe, senão a ficha inteira degrada", () => {
    // 20260712003000 revogou SELECT na tabela e devolveu coluna a coluna; coluna
    // nova nasce sem privilegio. Sem este grant a leitura publica daria 42501,
    // que nao casa com isMissingVerificationColumnError e nao cai no fallback.
    assert.match(
      ler(NOVA),
      /GRANT SELECT \(verificacao_campos\) ON TABLE public\.candidatos TO anon, authenticated;/,
    )
  })

  it("não há DROP VIEW entre os statements", () => {
    // DROP derrubaria o COMMENT ON VIEW de 20260725170000, o GRANT e as
    // dependentes v_comparador e v_ficha_candidato.
    assert.doesNotMatch(statements(NOVA), /DROP\s+VIEW/i)
    // E o arquivo continua explicando por escrito por que nao se usa DROP aqui.
    assert.match(ler(NOVA), /Nunca trocar isto por DROP VIEW/)
  })

  it("a migration é schema puro: nenhum statement de escrita", () => {
    assert.doesNotMatch(statements(NOVA), /\b(INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM|MERGE\s+INTO)\b/i)
  })

  it("a migration não carrega anotação de escrita auditada", () => {
    // Sem DML nao ha o que anotar, e o token dentro de comentario jogaria o
    // arquivo no ramo de validacao de anotacao de check-migrations-allowlist.
    assert.equal(ler(NOVA).includes("@write"), false)
  })

  it("a migration nova ordena depois de todas as já aplicadas", () => {
    // O risco que esta guarda cobre é um só: `supabase db push` aplicando a NOVA
    // FORA DE ORDEM em relação ao que o banco já tem. Por isso a comparação é
    // contra as migrations que a antecedem, e não contra "é a última do
    // diretório": a partir de 09/08/2026 existem migrations com timestamp MAIOR
    // e ainda não aplicadas, e exigir que a NOVA fosse a última do repositório
    // transformaria essa guarda numa que reprova toda migration futura.
    //
    // Entrada nova em `POSTERIORES` é ato deliberado: significa que o arquivo
    // foi criado depois da NOVA e ainda não foi aplicado. Migration com
    // timestamp menor continua sendo reprovada, que é o caso perigoso.
    const POSTERIORES = [
      // Criada em 17/08/2026 e NAO aplicada: da coluna a ancora de identidade
      // da candidatura de 2026 (sq_candidato_2026), com CHECK de formato e
      // indice unico parcial. NAO toca em candidatos_publico: a coluna e
      // interna e nao entra na view nem no DTO publico.
      "20260817053000_ancora_identidade_sq_candidato_2026.sql",
      "20260809070000_verificacao_campos_b2_cleber_gilberto.sql",
      // Trilha A, criada em 10/08/2026 e NÃO aplicada: corrige `eleito_por` da
      // candidatura indeferida do Lula em 2018, que diverge do raw do TSE.
      "20260810085000_lula_2018_registro_indeferido_eleito_por.sql",
      // Trilha C, criadas em 10/08/2026 e NAO aplicadas: chave por votacao,
      // despublicacao das defeituosas e dataset v2 de votacoes-chave.
      "20260810090000_votacoes_chave_chave_por_votacao.sql",
      "20260810090100_despublicar_votacoes_chave_defeituosas.sql",
      "20260810090200_votacoes_chave_dataset_v2.sql",
      // Trilha B, criada em 10/08/2026 e NAO aplicada: re-run de patrimonio do
      // ciclo 2026, com as 8 fichas cujos bens o TSE publicou depois de 04/08.
      "20260810093000_rerun_patrimonio_2026_tse_publicou.sql",
      // Criada em 10/08/2026 e NAO aplicada: patrimonio do cabo-daciolo em 2006
      // (declaracao de R$ 0,00) e 2008 (ausencia oficial de declaracao).
      "20260810094000_daciolo_patrimonio_2006_2008.sql",
      // PF Ajustes, financiamento: contrato de estado por pleito, remediacao
      // dos grants automaticos do Supabase e carga global reconciliada.
      "20260810120000_financiamento_verificacoes_por_pleito.sql",
      "20260810120500_financiamento_verificacoes_acl_exato.sql",
      "20260810120600_financiamento_funcoes_acl_exato.sql",
      "20260810121000_financiamento_reconciliado_universo.sql",
      // Aprovada editorialmente em 11/08/2026 e NAO aplicada: carga judicial
      // adicional de 69 CNJs em 21 fichas, com identidade e payload congelados.
      "20260810122000_processos_curadoria_djen.sql",
      // Aprovada editorialmente em 11/08/2026 e NAO aplicada: carga procedural
      // complementar de 66 CNJs em 25 fichas, sem inferencia de merito.
      "20260810123000_processos_curadoria_djen_66.sql",
      // Aprovada editorialmente em 11/08/2026 e NAO aplicada: oito resultados
      // TSE limitados ao recorte consultado, sem afirmar ausencia de carreira.
      "20260810124000_destaques_trajetoria_tse_8.sql",
      // Item 7, Senado: carga exata por sessao e contrato que impede o retorno
      // do matcher frouxo por proposicao. Ambas seguem NAO aplicadas.
      "20260811100000_votacoes_senado_chave_exata.sql",
      "20260811100100_votacoes_senado_contrato_exato.sql",
      // Itens 4/14: fecha os estados residuais das 194 fichas sem converter
      // falta de identidade ou de fonte em ausencia confirmada.
      "20260811101000_destaques_estados_residuais_194.sql",
      // Itens 4/14: corrige datas e proveniencia oficial das cinco trajetorias
      // de Cadu Xavier e Ricardo Cappelli, sem criar novo card.
      "20260811101100_historico_fontes_oficiais_cadu_cappelli.sql",
      // Item 2: reconcilia seis processos legados sem URL, neutraliza cinco e
      // despublica um claim sem fonte oficial, preservando bloqueio explicito.
      "20260811101200_processos_legados_fontes_oficiais.sql",
      // Integridade de identidade/timeline: schema de quarentena e curadoria
      // das cinco fichas. Ambas seguem NAO aplicadas.
      "20260811102000_quarentena_identidade_timeline_schema.sql",
      "20260811102100_integridade_identidade_timeline_5.sql",
      // Compatibilidade da view financiamento_publico depois que a quarentena
      // passou a usar despublicado_em em security_invoker.
      "20260812123000_financiamento_publico_acl_despublicado.sql",
      // Fecha a proveniencia das cinco celulas de Destaques do perfil Orleans
      // criado pelo split de identidade, sem herdar dados do governador homonimo.
      "20260812124000_orleans_destaques_proveniencia.sql",
      // Roteia duas das cinco proveniencias do Orleans para as fontes que a
      // superficie consulta de fato, sem tocar no conteudo ja gravado.
      "20260812125000_orleans_proveniencia_chaves_canonicas.sql",
      // A disputa presidencial passa a ter as 13 candidaturas escolhidas em
      // convencao: entram tres fichas novas com nome civil placeholder e
      // cabo-daciolo sai para Governador/AM. So DML em `candidatos`, nenhuma
      // coluna nova e nenhuma mudanca na definicao da view.
      "20260812130000_presidenciaveis_13_convencoes.sql",
      // Chapas 2026: schema aditivo próprio e carga de candidatos/chapas. A
      // view candidatos_publico é apenas consumida pela view de chapas; nenhuma
      // das duas migrations redefine seu contrato.
      "20260813040000_chapas_2026_schema.sql",
      "20260813040100_chapas_2026_tse_snapshot.sql",
      // Hardening da leitura pública de trajetória: troca somente a policy de
      // historico_politico para ocultar linhas despublicadas. Não toca nesta view.
      "20260813040200_harden_historico_politico_publico_rls.sql",
      // Follow-up de chapas: corrige somente biografias em candidatos; a view
      // pública continua com o mesmo contrato e apenas reflete o novo texto.
      "20260813111700_chapas_2026_biografias_coerentes.sql",
      // Hardening RLS de patrimonio_ausencia_oficial (achado high do master
      // review de 15/08): só habilita RLS e cria policy de leitura pública na
      // tabela de recibos de ausência patrimonial. Não toca nesta view.
      "20260815061000_harden_patrimonio_ausencia_oficial_rls.sql",
      // Crédito de foto: schema/view e backfill ficam separados para não criar
      // uma nova migration mista. A segunda usa somente UPDATE em candidatos.
      "20260815130000_foto_credito_schema_publico.sql",
      "20260815130100_foto_credito_backfill.sql",
      // Higiene de advisors: fixa search_path de duas trigger functions e cria
      // os dois índices de FK de chapas_2026. Não toca na view pública.
      "20260815190000_higiene_advisors_lows.sql",
      // Patrimônio 2026 dos presidenciáveis: upsert de curadoria na tabela
      // patrimonio para alimentar a série existente. Não redefine esta view.
      "20260815223000_backfill_patrimonio_presidenciaveis_2026.sql",
      // Patrimônio do AC: cinco upserts e duas ausências oficiais em tabelas
      // próprias de patrimônio. Não redefine candidatos_publico.
      "20260816010000_backfill_patrimonio_onda_g_ac_2026.sql",
      // Snapshot pós-registro: substitui apenas as linhas de chapas_2026 pelo
      // pacote oficial de 15/08. Não altera a definição desta view.
      "20260816011000_chapas_2026_tse_pos_registro.sql",
      // Gastos do Executivo: cria uma tabela filha com RLS por candidato
      // publicável. Não acrescenta coluna nem redefine candidatos_publico.
      "20260816014600_gastos_executivo_schema.sql",
      // Patrimônio nacional 2026: upsert positivo das identidades fechadas por
      // SQ/CPF na série existente. Não redefine a view pública.
      "20260816055200_backfill_patrimonio_nacional_2026.sql",
      // Vocabulário de situacao_candidatura: normaliza as onze grafias da coluna
      // em três valores mais NULL e cria o CHECK candidatos_situacao_candidatura_dominio.
      // Só UPDATE em candidatos e um ALTER TABLE ADD CONSTRAINT; não acrescenta,
      // remove nem renomeia coluna, então não redefine esta view. A view continua
      // publicando a mesma coluna `c.situacao_candidatura`, agora com domínio fechado.
      "20260816230000_vocabulario_situacao_candidatura.sql",
      "20260816230100_vocabulario_situacao_candidatura_check.sql",
      // Move a extensao unaccent de public para extensions, fechando o advisor
      // "Extension in Public". E um DO com guard em pg_extension: nao toca em
      // tabela, coluna nem view, entao nao redefine candidatos_publico.
      "20260818172010_unaccent_sai_do_public_para_extensions.sql",
      // Alinha a policy de leitura de `financiamento` com o filtro que a view
      // publica ja aplicava. Toca RLS de outra tabela, nao a definicao desta view.
      "20260818193909_financiamento_policy_alinha_com_a_view_publica.sql",
      "20260819140000_formacao_instituicao_schema_publico.sql",
      "20260819140100_urls_consulta_djen.sql",
      "20260819140200_formacao_instituicao_higiene.sql",
      "20260819140300_renan_santos_processos_assunto_absolvido.sql",
      "20260819140400_formacao_cury_marcal.sql",
      // Busca reversa por doador: tabela derivada com trgm, RPC so service_role.
      // Nao redefine candidatos_publico. Nome bate com o ledger (MCP apply_migration).
      "20260820164117_doador_reverse_rpc_server_only_trgm.sql",
      // Gastos do Executivo: troca o grão mensal de órgão para unidade gestora
      // e acrescenta contagens de sigilo de portador e estabelecimento. Não
      // redefine candidatos_publico. O dado continua sendo do órgão, não da pessoa.
      // Aplicada em 21/08/2026 como 20260820010000 (versão do arquivo, não MCP).
      // O rename para 20170000 era só para ficar depois do topo 20164117 enquanto
      // a UG estava pendente; o ledger já tem 20010000, então o filename volta.
      "20260820010000_gastos_executivo_ug.sql",
      // Quotas públicas atômicas: três RPCs com pg_advisory_xact_lock para
      // short-link, analytics/event e alerts/subscribe. Não redefine
      // candidatos_publico; só cria/substitui funções de cota por IP.
      "20260821010000_reserve_ip_quotas_atomicas.sql",
      // Restaura rótulos CEAPS de alan-rick e mailza-assis gravados com U+FFFD.
      // Só UPDATE em gastos_parlamentares; não redefine candidatos_publico.
      // Filename bate com o ledger de produção (MCP apply_migration).
      "20260821214601_ceaps_categoria_utf8.sql",
      // Corrige textos em tabelas satélite e acrescenta gates de encoding.
      // Não redefine candidatos_publico nem altera sua lista de colunas.
      "20260823160000_public_text_encoding_cleanup.sql",
      // Curadoria da issue #96: corrige fontes em pontos_atencao e despublica
      // cinco claims sem lastro. Não redefine candidatos_publico.
      "20260825123000_fix_public_attention_sources_issue_96.sql",
      // Quarentena expandida e snapshot TSE de 27/08. O schema só relaxa as
      // constraints internas de chapas_2026; a view pública continua
      // excluindo identidade_status='duplicidade_oficial'.
      "20260828025028_chapas_2026_quarentena_schema.sql",
      "20260828025037_chapas_2026_tse_20260827.sql",
    ]
    const versao = (nome: string) => nome.split("_", 1)[0]

    const anteriores = readdirSync(MIGRATIONS)
      .filter((nome) => nome.endsWith(".sql"))
      .filter((nome) => !POSTERIORES.includes(nome) && nome !== NOVA)
      .map(versao)
      .sort()

    assert.ok(
      anteriores.every((v) => v < versao(NOVA)),
      "existe migration não declarada com timestamp maior que a NOVA",
    )
    for (const posterior of POSTERIORES) {
      assert.ok(
        versao(posterior) > versao(NOVA),
        `${posterior} está declarada como posterior mas ordena antes da NOVA`,
      )
    }
  })

  it("o rollback é versionado, executável e desfaz as quatro coisas", () => {
    // Recovery que vive em `output/` não sobrevive a um PR: `.gitignore:15`
    // ignora o diretório inteiro. O rollback e o harness que o prova passaram a
    // ser versionados justamente porque é deles que a aplicação futura depende.
    const rollback = readFileSync(
      join(
        process.cwd(),
        "supabase/rollback/20260809060000_verificacao_campos_schema_publico.rollback.sql",
      ),
      "utf8",
    )
    const statementsRb = rollback
      .split("\n")
      .filter((linha) => !linha.trimStart().startsWith("--"))
      .join("\n")

    // 1. a view volta sem a coluna, e por DROP CASCADE, porque CREATE OR REPLACE
    //    não remove coluna (`ERROR: cannot drop columns from view`).
    assert.match(statementsRb, /DROP VIEW IF EXISTS public\.candidatos_publico CASCADE;/)
    // as três views recriadas, porque o CASCADE leva as duas dependentes junto
    for (const view of ["candidatos_publico", "v_ficha_candidato", "v_comparador"]) {
      assert.match(statementsRb, new RegExp(`CREATE VIEW public\\.${view}`), view)
      assert.match(statementsRb, new RegExp(`GRANT SELECT ON public\\.${view}`), view)
    }
    // o COMMENT, que o DROP destrói, é reemitido
    assert.match(statementsRb, /COMMENT ON VIEW public\.candidatos_publico IS/)
    // 2. revoga o privilégio de coluna
    assert.match(
      statementsRb,
      /REVOKE SELECT \(verificacao_campos\) ON TABLE public\.candidatos FROM anon, authenticated;/,
    )
    // 3. derruba a coluna, com guarda fail-closed no próprio SQL, não comentada
    assert.match(statementsRb, /ALTER TABLE public\.candidatos DROP COLUMN verificacao_campos;/)
    assert.match(statementsRb, /RAISE EXCEPTION/)
    assert.match(statementsRb, /rollback abortado/)
    // 4. reconcilia o ledger
    assert.match(
      statementsRb,
      /DELETE FROM supabase_migrations\.schema_migrations WHERE version = '20260809060000';/,
    )
    // sem fronteira de transação própria, pela mesma razão da forward
    // `psql` aceita `begin;` minusculo, entao a guarda precisa do flag `i`.
    assert.doesNotMatch(statementsRb, /^\s*(BEGIN|COMMIT)\s*;/im)

    // e o harness que prova os dois ramos também é versionado
    const harness = readFileSync(join(process.cwd(), "scripts/audit/provar-rollback.sh"), "utf8")
    assert.match(harness, /RAMO 1/)
    assert.match(harness, /RAMO 2/)
    assert.match(harness, /IDENTICOS/)
  })

  it("a retida 20260807052000 continua sendo a única com dado de ficha", () => {
    // Guarda contra a tentacao de regenerar a retida junto: ela e congelada por
    // tests/migrations-retidas-gate.test.ts e carrega a saida pre-contrato.
    const retida = ler("20260807052000_b2_current_profiles_tse_2026.sql")
    assert.match(retida, /MIGRATION RETIDA/)
    assert.match(retida, /INSERT INTO _pf_current_profile/)
  })
})

describe("contrato da view candidatos_publico: crédito de foto", () => {
  const anterior = corpoDaView(ler("20260809060000_verificacao_campos_schema_publico.sql"))
  const nova = corpoDaView(ler("20260815130000_foto_credito_schema_publico.sql"))
  const colunasAnteriores = colunasDaView(anterior)
  const colunasNovas = colunasDaView(nova)

  it("preserva todas as colunas anteriores e acrescenta foto_credito no fim", () => {
    assert.deepEqual(colunasNovas.slice(0, colunasAnteriores.length), colunasAnteriores)
    assert.equal(colunasNovas.length, colunasAnteriores.length + 1)
    assert.equal(colunasNovas.at(-1), "foto_credito")
  })

  it("preserva security_invoker, filtro público e fonte_dados sem marcador interno", () => {
    assert.match(nova, /WITH \(security_invoker = true\)/)
    assert.match(nova, /WHERE f\.valor NOT LIKE 'interno:%'\) AS fonte_dados/)
    assert.match(nova, /WHERE status <> 'removido'::text AND publicavel = true/)
  })

  it("concede leitura da coluna e da view sem derrubar dependentes", () => {
    const migration = ler("20260815130000_foto_credito_schema_publico.sql")
    assert.match(migration, /GRANT SELECT \(foto_credito\) ON TABLE public\.candidatos TO anon, authenticated;/)
    assert.match(migration, /GRANT SELECT ON public\.candidatos_publico TO anon, authenticated;/)
    assert.doesNotMatch(statements("20260815130000_foto_credito_schema_publico.sql"), /DROP\s+VIEW/i)
  })
})

describe("contrato da view candidatos_publico: formação instituição", () => {
  const anterior = corpoDaView(ler("20260815130000_foto_credito_schema_publico.sql"))
  const nova = corpoDaView(ler("20260819140000_formacao_instituicao_schema_publico.sql"))
  const colunasAnteriores = colunasDaView(anterior)
  const colunasNovas = colunasDaView(nova)

  it("preserva todas as colunas anteriores e acrescenta formacao_instituicao no fim", () => {
    assert.deepEqual(colunasNovas.slice(0, colunasAnteriores.length), colunasAnteriores)
    assert.equal(colunasNovas.length, colunasAnteriores.length + 1)
    assert.equal(colunasNovas.at(-1), "formacao_instituicao")
  })

  it("concede leitura da coluna e da view sem derrubar dependentes", () => {
    const migration = ler("20260819140000_formacao_instituicao_schema_publico.sql")
    assert.match(migration, /GRANT SELECT \(formacao_instituicao\) ON TABLE public\.candidatos TO anon, authenticated;/)
    assert.match(migration, /GRANT SELECT ON public\.candidatos_publico TO anon, authenticated;/)
    assert.doesNotMatch(statements("20260819140000_formacao_instituicao_schema_publico.sql"), /DROP\s+VIEW/i)
  })
})

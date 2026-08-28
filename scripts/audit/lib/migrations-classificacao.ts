/**
 * Classificação de migration em schema e curadoria, e previsão de replay.
 *
 * Issue #136. `supabase/migrations/` não é ordenado por dependência: migration
 * que consome uma entidade vem antes da que a cria. A `20260507130000` lê
 * `eduardo-paes`, a `20260511112000` também, e quem insere esse candidato é a
 * `20260522160000`, quinze arquivos depois. Num banco vazio, a primeira faz
 * `RETURN` silencioso por ter guard, e a segunda estoura a pós-condição por não
 * ter, o que derruba o replay na 179ª.
 *
 * O CLI do Supabase não ajuda: `supabase/config.toml` tem `schema_paths = []`,
 * `[db.seed] enabled = false`, e a ordem é o prefixo do nome do arquivo, sem
 * exceção. Não existe manifesto nativo para pular ou reordenar. Por isso a
 * separação é convenção verificada por gate, e este módulo é o gate.
 *
 * O módulo é PURO: recebe o texto do SQL e devolve o veredito. Não lê disco,
 * não toca banco. Quem lê arquivo é `scripts/audit/classificar-migrations.ts`.
 */

export type ClasseMigration = "schema" | "curadoria"

/**
 * Por que uma migration não sobrevive a um replay em banco vazio.
 *
 * `quebra_sem_guard` é o caso da `20260511112000`: ela trata candidato ausente
 * como violação de invariante, quando num banco vazio é só banco vazio.
 */
export type VeredictoReplay = "replicavel" | "quebra_sem_guard"

export interface ClassificacaoMigration {
  arquivo: string
  classe: ClasseMigration
  replay: VeredictoReplay
  /** Tabelas de conteúdo que a migration escreve, ordenadas. */
  tabelasDeConteudo: string[]
  /** Tem o padrão `IF ... IS NULL THEN ... RETURN`. */
  temGuard: boolean
  /** Tem `RAISE EXCEPTION`, ou seja, trata desvio como falha dura. */
  temRaiseException: boolean
  /** Lê `candidatos` por FROM/JOIN ou SELECT INTO. */
  leCandidatos: boolean
  /** DDL persistente junto de escrita de conteúdo, o caso difícil. */
  mista: boolean
  /**
   * Cria, altera ou remove objeto persistente. É o que decide se a migration
   * pode ficar de fora de um replay de estrutura: sem ela, o objeto não existe.
   */
  temDdlPersistente: boolean
}

/**
 * Tabelas cujo conteúdo é dado de ficha. Escrever aqui é curadoria.
 *
 * Medido em 08/08/2026 varrendo os alvos de DML das 374 migrations. A lista é
 * fechada de propósito: tabela nova que passe a receber carga precisa entrar
 * aqui conscientemente, e `tests/migrations-classificacao.test.ts` reprova
 * quando aparece alvo de DML fora dela e fora de `TABELAS_DE_ESTADO`.
 */
export const TABELAS_DE_CONTEUDO: readonly string[] = [
  "candidatos",
  "candidate_changes",
  "candidate_photo_updates",
  "chapas_2026",
  "contradicoes",
  "financiamento",
  "financiamento_verificacoes",
  "gastos_parlamentares",
  "historico_politico",
  "legislacao_mandato_executivo",
  "mudancas_partido",
  "noticias",
  "noticias_candidato",
  "patrimonio",
  "patrimonio_ausencia_oficial",
  "patrimonio_quarentena",
  "financiamento_quarentena",
  "pontos_atencao",
  "posicoes_declaradas",
  "processos",
  "projetos_lei",
  "votacoes_chave",
  "votos_candidato",
]

/**
 * Tabelas que guardam estado de ferramenta, não dado de ficha. Escrever nelas
 * não torna a migration curadoria: nenhuma ficha pública muda por causa disso, e
 * elas não alteram a ficha por si. Snapshots de rollback podem referenciar
 * candidatos, mas continuam sendo estado privado de reversão, não conteúdo.
 */
export const TABELAS_DE_ESTADO: readonly string[] = [
  "alert_subscribers",
  "analytics_launch_events",
  "coleta_log",
  "financiamento_doador_search",
  "identidade_timeline_quarentena_snapshot",
  "news_refresh_lotes",
  "quiz_result_short_links",
  "schema_migrations",
]

// `MERGE INTO` entra como DML: e escrita valida de Postgres 15+ e a vistoria do
// PR #142 apontou que o parser antigo a deixava passar como se nao escrevesse.
// `ONLY` opcional pelo mesmo motivo (rodada 2): `UPDATE ONLY projetos_lei`
// capturava "only", que caia na lista de nao-tabelas, e a escrita sumia.
const RE_DML =
  /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|MERGE\s+INTO)\s+(?:ONLY\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi
// UNIQUE/CONCURRENTLY entre CREATE e INDEX, e DOMAIN/AGGREGATE/OPERATOR/RULE
// como objetos: as formas que a vistoria provou escaparem do regex anterior
// (`CREATE UNIQUE INDEX` da 20260710222500 nao contava como DDL persistente).
// GRANT/REVOKE/COMMENT tambem sao estrutura persistente: o diff de pg_dump do
// modo --comparar provou que uma migration so de GRANT (20260531000424) ficava
// fora do conjunto e o schema divergia exatamente naquela ACL.
const RE_DDL_PERSISTENTE =
  /\b(?:CREATE|ALTER|DROP)\s+(?:OR\s+REPLACE\s+)?(?:UNIQUE\s+)?(?:INDEX\s+CONCURRENTLY|TABLE|INDEX|VIEW|MATERIALIZED\s+VIEW|FUNCTION|PROCEDURE|TRIGGER|POLICY|TYPE|DOMAIN|SEQUENCE|EXTENSION|SCHEMA|AGGREGATE|OPERATOR|RULE)\b|\b(?:GRANT|REVOKE)\b|\bCOMMENT\s+ON\b/i
const RE_TEMP_TABLE = /\bCREATE\s+(?:TEMP|TEMPORARY)\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?/gi
const RE_RAISE_EXCEPTION = /\bRAISE\s+EXCEPTION\b/i
const RE_LE_CANDIDATOS = /\b(?:FROM|JOIN|INTO\s+\w+\s+FROM)\s+(?:public\.)?candidatos\b/i

/**
 * Guard de candidato ausente, agora ciente do bloco (vistoria do PR #142).
 *
 * O regex antigo aceitava qualquer `RETURN` numa janela de 500 caracteres, o
 * que casava um `RETURN` DEPOIS do `END IF`, fora do caminho de ausencia. O
 * parser agora recorta do `IF ... IS NULL/=0 THEN` ate o `END IF` (ou `ELSE`)
 * correspondente e exige o `RETURN` DENTRO desse trecho, com `RAISE EXCEPTION`
 * antes do `RETURN` desqualificando o bloco: quem estoura antes de retornar
 * nao esta tratando banco vazio, esta reprovando ele.
 */
export function temGuardDeAusencia(corpo: string): boolean {
  const abre = /\bIF\b[^;]{0,200}?(?:\bIS\s+NULL\b|=\s*0\b)\s+THEN\b/gi
  // Tokens do corpo do bloco, com END IF testado ANTES de IF para o "IF" de
  // "END IF" nao abrir nivel fantasma.
  const token = /\bEND\s+IF\b|\bELSIF\b|\bELSE\b|\bIF\b[\s\S]{0,200}?\bTHEN\b|\bRETURN\s*;|\bRAISE\s+EXCEPTION\b/gi

  while (abre.exec(corpo) !== null) {
    // Rodada 2 da vistoria: o corte no primeiro END IF fazia um IF interno com
    // RETURN proprio "proteger" o IF externo que ainda ia estourar. O scanner
    // rastreia profundidade: so RETURN no NIVEL DO GUARD conta (RETURN dentro
    // de IF aninhado e condicional, nao garante o no-op), e qualquer RAISE
    // EXCEPTION visto antes dele, em qualquer nivel, desqualifica.
    token.lastIndex = abre.lastIndex
    let profundidade = 0
    let houveRaise = false
    let m: RegExpExecArray | null
    let guardado = false
    let fimDoBloco = corpo.length

    while ((m = token.exec(corpo)) !== null) {
      const t = m[0].toUpperCase().replace(/\s+/g, " ")
      if (/^END IF$/.test(t)) {
        if (profundidade === 0) {
          fimDoBloco = token.lastIndex // fim do bloco do guard
          break
        }
        profundidade--
      } else if (t === "ELSIF" || t === "ELSE") {
        if (profundidade === 0) {
          fimDoBloco = token.lastIndex
          break // saiu do ramo de ausencia
        }
      } else if (t.startsWith("IF")) {
        profundidade++
      } else if (/^RETURN/.test(t)) {
        if (profundidade === 0 && !houveRaise) {
          guardado = true
          break
        }
      } else if (/^RAISE EXCEPTION/.test(t)) {
        houveRaise = true
      }
    }

    if (guardado) return true

    // Rodada 3 da vistoria: sem este avanco, a proxima iteracao do abre.exec
    // reencontrava um `IF ... IS NULL THEN RETURN` ANINHADO dentro do bloco
    // recem-reprovado e o tratava como guard independente, "protegendo" uma
    // migration que ainda chega ao RAISE EXCEPTION. O bloco reprovado e pulado
    // inteiro; guards legitimos em blocos IRMAOS continuam sendo avaliados.
    if (fimDoBloco > abre.lastIndex) abre.lastIndex = fimDoBloco
  }
  return false
}

/**
 * Palavras que o regex de DML captura mas que não são tabela.
 *
 * `DO UPDATE SET` de um `ON CONFLICT` casa como `UPDATE set`, e é o caso que
 * apareceu em `20260406150000`. Sem esta lista, o gate acusa tabela nova
 * chamada `set`.
 */
const NAO_SAO_TABELAS = new Set([
  "set", // `ON CONFLICT DO UPDATE SET`, visto em 20260406150000
  "of", // `CREATE TRIGGER ... BEFORE INSERT OR UPDATE OF coluna`, que é DDL
  "on",
  "conflict",
  "only",
  "from",
  "into",
  "where",
])

/**
 * Remove comentário de linha e literal entre aspas simples.
 *
 * Os dois existem pelo mesmo motivo: prosa que contém SQL. O comentário é
 * óbvio; o literal menos, e foi ele que fez o gate enxergar tabelas chamadas
 * `of`, `que` e `incomplete`, vindas de mensagens de `RAISE NOTICE`. Corpo
 * dollar-quoted (`$$ ... $$`) NÃO é removido, porque ali dentro mora SQL de
 * verdade, que é justamente o que precisa ser lido.
 */
export function stripComentarios(sql: string): string {
  // Comentário de fim de linha também sai (vistoria do PR #142): num
  // `SELECT 1; -- INSERT INTO foo`, o filtro por linha inteira deixava o
  // comentário vivo e `foo` virava alvo de escrita. O scanner rastreia aspas
  // simples (com `''` de escape) inclusive ATRAVÉS de linhas, para não cortar
  // um `--` que mora dentro de literal.
  const linhas = sql.split("\n")
  const limpas: string[] = []
  let dentroDeLiteral = false
  for (const linha of linhas) {
    let corte = linha.length
    for (let i = 0; i < linha.length; i++) {
      const c = linha[i]
      if (c === "'") {
        if (dentroDeLiteral && linha[i + 1] === "'") {
          i++ // aspas escapada dentro do literal
          continue
        }
        dentroDeLiteral = !dentroDeLiteral
        continue
      }
      if (!dentroDeLiteral && c === "-" && linha[i + 1] === "-") {
        corte = i
        break
      }
    }
    limpas.push(linha.slice(0, corte))
  }
  // `''` dentro de literal é aspas escapada, então consome os pares antes.
  return limpas.join("\n").replace(/'(?:[^']|'')*'/g, "''")
}

export function tabelasTemporarias(sql: string): Set<string> {
  const temps = new Set<string>()
  for (const m of sql.matchAll(RE_TEMP_TABLE)) temps.add(m[1].toLowerCase())
  return temps
}

/**
 * Alvos de DML de uma migration, sem os comentários e sem as temp tables
 * declaradas nela mesma (rascunho de transação não é persistência).
 */
export function alvosDeEscrita(sql: string): string[] {
  const corpo = stripComentarios(sql)
  const temps = tabelasTemporarias(corpo)
  const alvos = new Set<string>()
  for (const m of corpo.matchAll(RE_DML)) {
    const tabela = m[1].toLowerCase()
    if (!temps.has(tabela) && !NAO_SAO_TABELAS.has(tabela)) alvos.add(tabela)
  }
  return [...alvos].sort()
}

export function classificarMigration(arquivo: string, sql: string): ClassificacaoMigration {
  const corpo = stripComentarios(sql)
  const alvos = alvosDeEscrita(sql)
  const tabelasDeConteudo = alvos.filter((t) => TABELAS_DE_CONTEUDO.includes(t))

  // Precedência de dados: um único INSERT em tabela de conteúdo faz a migration
  // ser curadoria, ainda que 90% dela seja DDL. A classe existe para responder
  // "posso replayar isto num banco vazio", e quem quebra é o dado.
  const classe: ClasseMigration = tabelasDeConteudo.length > 0 ? "curadoria" : "schema"

  const temGuard = temGuardDeAusencia(corpo)
  const temRaiseException = RE_RAISE_EXCEPTION.test(corpo)
  const leCandidatos = RE_LE_CANDIDATOS.test(corpo) || /\bINTO\s+\w+\s*\n?\s*FROM\s+(?:public\.)?candidatos\b/i.test(corpo)
  const temDdlPersistente = RE_DDL_PERSISTENTE.test(corpo)
  const mista = classe === "curadoria" && temDdlPersistente

  return {
    arquivo,
    classe,
    replay: preverReplay({ classe, temGuard, temRaiseException, leCandidatos }),
    tabelasDeConteudo,
    temGuard,
    temRaiseException,
    leCandidatos,
    mista,
    temDdlPersistente,
  }
}

/**
 * Previsão estática local de uma migration no replay linear completo.
 *
 * Não é veredito para subconjuntos como `schema` ou `com-ddl`: dependências
 * entre arquivos só são conhecidas pelo harness real. Aqui, schema não depende
 * de linha. Curadoria com guard vira no-op. Curadoria que lê `candidatos` e
 * trata a ausência com `RAISE EXCEPTION` sem guard é a quebra prevista, o
 * retrato da `20260511112000`.
 */
export function preverReplay(m: {
  classe: ClasseMigration
  temGuard: boolean
  temRaiseException: boolean
  leCandidatos: boolean
}): VeredictoReplay {
  if (m.classe === "schema") return "replicavel"
  if (m.temGuard) return "replicavel"
  if (m.leCandidatos && m.temRaiseException) return "quebra_sem_guard"
  return "replicavel"
}

export interface ResumoClassificacao {
  total: number
  schema: number
  curadoria: number
  mistas: number
  replicaveis: number
  quebram: number
  /**
   * Primeira migration que a PREVISÃO ESTÁTICA marca como quebra. A previsão é
   * conservadora de propósito e marca mais cedo do que o replay real quebra
   * (52ª contra 179ª): pós-condição que passa num banco vazio é indistinguível,
   * por texto, de uma que estoura. O número comparável ao replay real é o de
   * `MEDICAO_REPLAY`; este aqui serve ao gate de conjunto, não à posição.
   */
  primeiraQuebra: string | null
  limpasAteAPrimeiraQuebra: number
}

/**
 * Medição de 09/08/2026, reproduzível com `scripts/audit/replay-migrations.sh`.
 *
 * Custo zero: o script sobe containers Postgres 17 próprios com nome único por
 * execução, nunca usa `--linked` e um trap remove só o que a execução criou. Os
 * números existem para que regressão apareça como número, não como sensação.
 */
export const MEDICAO_REPLAY = Object.freeze({
  // 16/08/2026: última linha medida (gastos_executivo, 80 limpas).
  data: "2026-08-16",
  comando: "scripts/audit/replay-migrations.sh",

  /**
   * Replay linear de tudo, na ordem do nome do arquivo. Bate exatamente com o
   * que a issue #136 mediu de forma independente via `supabase db reset`.
   */
  linearLimpas: 178,
  linearPrimeiraQuebra: "20260511112000_promote_projetos_lei_acm_eduardo_camara_completo.sql",

  /**
   * Conjunto com DDL persistente (`--com-ddl`), depois de o parser aprender
   * CREATE UNIQUE INDEX, GRANT/REVOKE e COMMENT ON (vistoria do PR #142).
   */
  ddlSetTamanho: 76,

  /**
   * Replay do schema depois da separacao aditiva das cinco mistas aplicadas e
   * da exclusao das duas mistas retidas, que nao pertencem ao schema de
   * producao. O conjunto inteiro precisa aplicar sem uma unica falha.
   */
  // 79 -> 80 em 16/08/2026: gastos_executivo cria tabela, índice, constraints,
  // policy e grants. Medido no schema-gate local: 80 limpas, zero falhas e
  // schema_dump_sha256 623dbd3538fc00775062feca957e41f73476f2cb79c7793895592efd033f1a57.
  // 78 -> 79 em 15/08/2026: a higiene de search_path e os dois indices de FK
  // (20260815190000) aplicam limpo no replay do schema. Medido, nao estimado:
  // o schema-gate local deu "aplicadas limpo: 79, falhas 0".
  // P-PATRIMONIO-2026 (20260815223000) e DML puro e nao entra neste conjunto;
  // medicao local de 15/08 preservou 79 aplicadas, zero falhas e o hash.
  // P-AC-POS-REGISTRO (20260816010000 e 20260816011000) tambem e DML puro;
  // medicao local de 16/08 preservou o conjunto e o hash pre-gastos.
  // 79 -> 80 em 16/08/2026: gastos_executivo entra no conjunto DDL. Medicao
  // re-executada no merge com a main pos-#210: 80 limpas, 0 falhas, e o
  // schema_dump_sha256 continua o mesmo (as migrations do #210 sao DML).
  // 81 -> 82 em 18/08/2026: a 20260818172010 (unaccent sai de public) e DDL
  // persistente e entra na classe de schema. MEDIDO no gate do CI, run
  // 32165874941: `--schema-gate` devolveu "aplicadas limpo: 82" e "falhas: 0".
  // 82 -> 83 em 18/08/2026: a 20260818193909 (policy de financiamento) e DDL
  // persistente. MEDIDO no gate, run 32178043147: `--schema-gate` devolveu
  // "aplicadas limpo: 83" e "falhas: 0".
  // 83 -> 84 em 19/08/2026: a 20260819140000 acrescenta formacao_instituicao
  // em candidatos, candidatos_publico e v_comparador. MEDIDO no schema-gate
  // local: aplicadas limpo 84, falhas 0, hash
  // 69c4e5e0e72a6f855954bed5b7c77565f3c4b73541cfc499bf1fc107b26e5e7d.
  // 84 -> 85 em 20/08/2026: a 20260820010000 (gastos_executivo_ug) troca o
  // grão mensal de órgão para unidade gestora e acrescenta contagens de
  // sigilo. Classe schema (ALTER TABLE). MEDIDO no schema-gate local e no
  // run 32378830303: aplicadas limpo 85, falhas 0, hash
  // 18730634f32f3c9c75fb04b7161f76ea6b482e5c1feeabd5fad9e1251a9338b6.
  // 85 -> 86 em 20/08/2026: doador_reverse_rpc_server_only_trgm cria tabela de
  // busca, indice trgm, RPC e grants. Schema persistente; o backfill e estado
  // derivado, nao curadoria de ficha. MEDIDO no schema-gate local: aplicadas
  // limpo 86, falhas 0, hash
  // 2a58088b22dd5103f88476ca867cb2fc28bb94411506226d488757acab582662.
  // 86 -> 87 em 21/08/2026: a 20260821010000 reserva cota e grava na mesma
  // transação (short-link, analytics, alertas). Classe schema (CREATE FUNCTION
  // + GRANT). MEDIDO no schema-gate local: aplicadas limpo 87, falhas 0, hash
  // f82a30bfc495c71fa56f123b93bdd2a77250d96bbb4a3abd7b9a7f0220a56566.
  // 87 -> 88 em 28/08/2026: o schema de quarentena expande somente os CHECKs
  // de chapas_2026. A medição e o hash final pertencem ao schema-gate do PR.
  schemaReplayTamanho: 88,
  // 80 -> 81 em 17/08/2026: a 20260817053000 e classe schema (ALTER TABLE mais
  // indice) e entra no replay de schema. Medido pelo --schema-gate no CI, que
  // reportou 'aplicadas limpo: 81, puladas: 334, falhas: 0'.

  /**
   * Prova estrutural do modo `--comparar`: diff de `pg_dump --schema-only`
   * linha a linha entre o replay linear completo e o replay só-DDL, ambos
   * tolerantes. A vistoria derrubou a prova anterior (contagem de objetos) com
   * razão; esta compara colunas, índices, constraints, policies e grants.
   *
   * Resultado: EQUIVALENTE com três linhas de delta conhecidas: a constraint e
   * o comentário `candidatos_status_dominio`, da mista `20260805120633`, e a
   * constraint `votacoes_chave_senado_exige_evento_exato_check`, cujo contrato
   * aplica somente depois da carga de dados 20260811100000. Qualquer linha
   * além dessas três faz o `--comparar` sair com código 1.
   */
  // Medido em 09/08/2026 na mesma rodada que acrescentou a 20260809060000. O
  // valor anterior (159) ja estava defasado antes desta mudanca, e nenhum teste
  // o afirma; `ADD COLUMN` nao acrescenta linha `CREATE`, entao a coluna nova
  // nao mexeu na contagem.
  compararCreatesComparados: 179,
  compararDeltasConhecidos: 2,
  compararDeltaCausa: "20260805120633_status_fora_do_dominio_e_check.sql",
})

/**
 * Migrations que criam objeto persistente E carregam dado de ficha no mesmo
 * arquivo. São elas que impedem o replay de estrutura de rodar limpo hoje: pular
 * a migration pelo dado remove também a tabela, e rodar a migration inteira
 * esbarra na pós-condição de dado.
 *
 * A lista é FECHADA. Migration nova que misture as duas coisas reprova em
 * `tests/migrations-classificacao.test.ts`, que é o ponto: o passado fica como
 * está, e o problema para de crescer.
 */
export const MISTAS_CONHECIDAS: readonly string[] = [
  "20260403113000_harden_child_rls_and_uniques.sql",
  "20260406150000_alerts_email_mvp.sql",
  "20260406192000_historico_cargo_canonico_and_unique.sql",
  "20260407143000_historico_tipo_evento.sql",
  // As tres abaixo entraram quando o parser aprendeu CREATE UNIQUE INDEX
  // (vistoria do PR #142): ja eram mistas, o regex e que nao via.
  "20260410113000_dedupe_sancoes_attention_points.sql",
  "20260419090000_disambiguate_quiz_votacoes_titles.sql",
  "20260419110000_fix_auxilio_brasil_quiz_proposicao.sql",
  "20260427183000_seed_legislacao_mandato_executivo_eduardo_leite_rs_completo.sql",
  "20260428160000_seed_legislacao_mandato_executivo_lula_federal_atual_completo.sql",
  "20260428161000_seed_legislacao_mandato_executivo_tarcisio_sp_ampliado_parcial.sql",
  "20260710222500_sc_state_completion.sql",
  "20260711180000_public_document_privacy_hardening.sql",
  "20260712003000_public_security_invoker_compatibility.sql",
  "20260725153000_schema_motivo_despublicacao_e_cpf_formato.sql",
  "20260725160000_gate_gravidade_fonte_pontos_atencao.sql",
  "20260725190000_fonte_substancia_documento_pontos_atencao.sql",
  "20260726160000_despublicar_historico_por_homonimo.sql",
  // Entrou quando o parser aprendeu COMMENT ON como DDL persistente.
  "20260726180000_identidade_jeronimo_e_homonimo_dorinha.sql",
  "20260730170000_quarentena_patrimonio_financiamento_homonimo.sql",
  "20260803142851_fonte_dados_prefixo_interno_fora_da_superficie_publica.sql",
  "20260805120633_status_fora_do_dominio_e_check.sql",
  "20260805123929_aplicar_decisoes_editoriais_20260805.sql",
  "20260807050000_a2_money_reconciled_194_profiles.sql",
  "20260807052000_b2_current_profiles_tse_2026.sql",
  "20260807181000_patrimonio_ausencia_oficial.sql",
]

/**
 * As 7 mistas que efetivamente falham no replay `--com-ddl`, medidas em
 * 09/08/2026 depois de o parser aprender UNIQUE INDEX e COMMENT ON (por isso a
 * lista cresceu de 5: `20260710222500` e `20260726180000` sempre falharam, o
 * regex antigo e que nao as via no conjunto). As demais mistas passam porque a
 * parte de dado delas tolera banco vazio.
 *
 * Duas destas (`20260807050000` e `20260807052000`) são migrations retidas, que
 * já estão deliberadamente fora do banco e têm gate próprio em
 * `tests/migrations-retidas-gate.test.ts`. Sobram CINCO para separar quando
 * houver decisão do dono.
 */
export const BLOQUEADORES_REPLAY_DDL: readonly string[] = [
  "20260710222500_sc_state_completion.sql",
  "20260726160000_despublicar_historico_por_homonimo.sql",
  "20260726180000_identidade_jeronimo_e_homonimo_dorinha.sql",
  "20260805123929_aplicar_decisoes_editoriais_20260805.sql",
  "20260807050000_a2_money_reconciled_194_profiles.sql",
  "20260807052000_b2_current_profiles_tse_2026.sql",
  "20260807181000_patrimonio_ausencia_oficial.sql",
]

/** Espera `classificacoes` já ordenada pelo nome do arquivo. */
export function resumir(classificacoes: readonly ClassificacaoMigration[]): ResumoClassificacao {
  const primeiraQuebraIndex = classificacoes.findIndex((c) => c.replay === "quebra_sem_guard")
  return {
    total: classificacoes.length,
    schema: classificacoes.filter((c) => c.classe === "schema").length,
    curadoria: classificacoes.filter((c) => c.classe === "curadoria").length,
    mistas: classificacoes.filter((c) => c.mista).length,
    replicaveis: classificacoes.filter((c) => c.replay === "replicavel").length,
    quebram: classificacoes.filter((c) => c.replay === "quebra_sem_guard").length,
    primeiraQuebra: primeiraQuebraIndex >= 0 ? classificacoes[primeiraQuebraIndex].arquivo : null,
    limpasAteAPrimeiraQuebra:
      primeiraQuebraIndex >= 0 ? primeiraQuebraIndex : classificacoes.length,
  }
}

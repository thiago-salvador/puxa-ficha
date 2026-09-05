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

  it("a migration de verificacao_campos ordena após suas dependências de view e ACL", () => {
    // Estado aplicado pertence ao ledger, não à posição final do diretório.
    // A regra local protege a ordem das dependências reais desta migration;
    // adicionar uma migration posterior não altera essa relação histórica.
    const dependencias = [
      REGISTRO,
      "20260712003000_public_security_invoker_compatibility.sql",
    ]
    const arquivos = new Set(readdirSync(MIGRATIONS))
    assert.ok(arquivos.has(NOVA), "migration de verificacao_campos ausente")
    const versao = (nome: string) => nome.split("_", 1)[0]
    for (const dependencia of dependencias) {
      assert.ok(arquivos.has(dependencia), `dependência ausente: ${dependencia}`)
      assert.ok(versao(dependencia) < versao(NOVA), `${dependencia} deve ordenar antes de ${NOVA}`)
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

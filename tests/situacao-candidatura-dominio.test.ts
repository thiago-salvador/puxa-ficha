import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"
import {
  SITUACAO_CANDIDATURA_DOMINIO,
  SITUACAO_JULGAMENTO_INDEFERIDO,
  SITUACAO_JULGAMENTO_PUBLICADO,
} from "../src/lib/situacao-candidatura"
import { analyzePublishedConsistency, type PublishedRow } from "../src/lib/published-consistency"
import { resolveCargoDisputadoProveniencia } from "../src/lib/candidatura-proveniencia"
import { classificarMigration } from "../scripts/audit/lib/migrations-classificacao"

/**
 * Contrato do vocabulario de `situacao_candidatura`.
 *
 * O campo era TEXT livre e acumulou onze grafias para tres sentidos. A
 * migration 20260903100000 fechou o dominio no banco; este teste existe para
 * que o lado TypeScript e o CHECK nao possam divergir em silencio, que e
 * exatamente como as onze grafias apareceram.
 */

const MIGRATIONS = join(process.cwd(), "supabase", "migrations")
/** Par 1: so dado. Par 2: so schema. A separacao e exigida pelo gate de classificacao. */
const DADOS = "20260903100000_vocabulario_situacao_candidatura.sql"

function sql(arquivo: string): string {
  return readFileSync(join(MIGRATIONS, arquivo), "utf8")
}

/**
 * A migration MAIS RECENTE que instala o CHECK, resolvida por varredura em vez
 * de constante.
 *
 * Por que nao um literal: a versao anterior deste arquivo apontava para
 * 20260903100100 e so por isso ficava verde. Em 03/09/2026 a migration
 * 20260903210000 alargou o dominio para os quatro estados de julgamento, e o
 * teste seguiu comparando o TypeScript com o CHECK ANTIGO, que e exatamente a
 * divergencia silenciosa que ele existe para impedir. Resolvendo pela maior
 * versao, uma migration nova que mexa no dominio entra na comparacao sozinha, e
 * quem esquecer o lado TypeScript reprova no CI.
 */
function arquivoDoCheckMaisRecente(): string {
  const candidatos = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => /ADD CONSTRAINT\s+candidatos_situacao_candidatura_dominio/.test(sql(f)))
    .sort()
  assert.ok(candidatos.length > 0, "nenhuma migration instala candidatos_situacao_candidatura_dominio")
  return candidatos[candidatos.length - 1]
}

const CHECK = arquivoDoCheckMaisRecente()

/** Statements sem comentario: a prosa do arquivo cita valores aposentados de proposito. */
function statements(arquivo: string): string {
  return sql(arquivo)
    .split("\n")
    .filter((linha) => !linha.trimStart().startsWith("--"))
    .join("\n")
}

/** Os literais do `CHECK (situacao_candidatura IN (...))`. */
function dominioDoCheck(): string[] {
  const texto = statements(CHECK)
  const inicio = texto.indexOf("ADD CONSTRAINT\n    candidatos_situacao_candidatura_dominio") >= 0
    ? texto.indexOf("ADD CONSTRAINT\n    candidatos_situacao_candidatura_dominio")
    : texto.search(/ADD CONSTRAINT\s+candidatos_situacao_candidatura_dominio/)
  assert.notEqual(inicio, -1, "constraint nao encontrada na migration")
  const abre = texto.indexOf("IN (", inicio)
  assert.notEqual(abre, -1, "lista IN (...) do CHECK nao encontrada")
  const fecha = texto.indexOf(")", abre + "IN (".length)
  assert.notEqual(fecha, -1, "fim da lista IN (...) nao encontrado")
  const lista = texto.slice(abre + "IN (".length, fecha)
  return [...lista.matchAll(/'([^']*)'/g)].map((m) => m[1])
}

function row(overrides: Partial<PublishedRow> = {}): PublishedRow {
  return {
    slug: "candidata",
    nome_urna: "Candidata",
    cargo_disputado: "Governador",
    estado: "SP",
    partido_sigla: "ABC",
    status: "candidato",
    situacao_candidatura: "aguardando julgamento",
    foto_url: "/foto.jpg",
    ...overrides,
  }
}

describe("dominio de situacao_candidatura", () => {
  it("o CHECK do banco e a lista do TypeScript sao o mesmo conjunto, na mesma ordem", () => {
    // Parse defensivo antes da comparacao: lista vazia dos dois lados passaria
    // por acidente, que e o modo de falha classico deste tipo de guarda.
    const doCheck = dominioDoCheck()
    assert.ok(doCheck.length >= 3, `so ${doCheck.length} valor(es) lidos do CHECK`)
    assert.deepEqual(doCheck, [...SITUACAO_CANDIDATURA_DOMINIO])
  })

  it("os valores aposentados nao voltam pelo CHECK", () => {
    // 'pre-candidato' e valor de `status`, nao deste campo. 'APTO [2022]' e
    // residuo de pleito antigo. 'renuncia', 'cassado' e 'falecido' sao estados
    // que o TSE ainda nao emitiu para esta coorte: entram numa PR deliberada,
    // com a mesma friccao que os quatro de julgamento tiveram, nao de carona.
    for (const morto of ["pre-candidato", "desistente", "renuncia", "cassado", "falecido", "apto"]) {
      assert.equal(
        SITUACAO_CANDIDATURA_DOMINIO.includes(morto as never),
        false,
        `${morto} nao pode estar no dominio`,
      )
    }
  })

  it("os quatro estados de julgamento estao no dominio, e so eles", () => {
    // Espelho de SITUACAO_JULGAMENTO_PUBLICADO. A regressao coberta: alguem
    // acrescenta um quinto estado de julgamento ao CHECK e esquece do subconjunto
    // que `candidatura-proveniencia.ts` consome para decidir o selo.
    assert.deepEqual(
      [...SITUACAO_JULGAMENTO_PUBLICADO],
      ["deferido", "deferido com recurso", "indeferido", "indeferido com recurso"],
    )
    for (const estado of SITUACAO_JULGAMENTO_PUBLICADO) {
      assert.ok(
        SITUACAO_CANDIDATURA_DOMINIO.includes(estado),
        `${estado} esta em SITUACAO_JULGAMENTO_PUBLICADO mas nao no dominio`,
      )
    }
    for (const estado of SITUACAO_JULGAMENTO_INDEFERIDO) {
      assert.ok(
        SITUACAO_JULGAMENTO_PUBLICADO.includes(estado),
        `${estado} esta em INDEFERIDO mas nao em PUBLICADO`,
      )
    }
  })

  it("o CHECK comparado e o da migration mais recente, nao o do par de 100100", () => {
    // Guarda do proprio guard: se `arquivoDoCheckMaisRecente` voltar a apontar
    // para o par original, esta comparacao morre em silencio de novo.
    assert.equal(CHECK, "20260903210000_vocabulario_situacao_julgamento_publicado.sql")
  })

  it("nenhum valor do dominio dispara a regra de situacao stale", () => {
    // STALE_SITUACAO em published-consistency.ts e anomalia DURA: ano ou "APTO"
    // no campo significa residuo de pleito antigo vazando para o ar.
    for (const valor of SITUACAO_CANDIDATURA_DOMINIO) {
      const report = analyzePublishedConsistency([row({ situacao_candidatura: valor })])
      assert.deepEqual(report.hard, [], `${valor} produziu anomalia dura`)
    }
  })

  it("todo valor do dominio e aceito pelo gate de consistencia publica", () => {
    // A regressao que este teste cobre: alguem acrescenta valor ao CHECK e
    // esquece do gate, que passa a avisar sobre uma ficha perfeitamente valida.
    for (const valor of SITUACAO_CANDIDATURA_DOMINIO) {
      const report = analyzePublishedConsistency([row({ situacao_candidatura: valor })])
      const fora = report.soft.filter((s) => s.startsWith("situacao fora do conjunto esperado"))
      assert.deepEqual(fora, [], `${valor} caiu como fora do conjunto esperado`)
    }
  })

  it("a proveniencia de cada valor continua sendo a que a ficha ja mostrava", () => {
    // Esta e a garantia que torna a migration segura de aplicar: para as 175
    // fichas no ar, o selo depois da normalizacao e byte a byte o de antes.
    // 'aguardando julgamento' segue casando com o ramo de pedido pendente, e
    // 'candidatura declarada'/'incerto' seguem caindo em declaracao editorial.
    assert.equal(
      resolveCargoDisputadoProveniencia({ status: "pre-candidato", situacao_candidatura: "aguardando julgamento" }),
      "registro_tse_pendente",
    )
    assert.equal(
      resolveCargoDisputadoProveniencia({ status: "pre-candidato", situacao_candidatura: "candidatura declarada" }),
      "declaracao_editorial",
    )
    assert.equal(
      resolveCargoDisputadoProveniencia({ status: "pre-candidato", situacao_candidatura: "incerto" }),
      "declaracao_editorial",
    )
  })

  it("cada estado de julgamento produz um selo, e indeferido nao vira declaracao editorial", () => {
    // A regressao concreta que este teste cobre: sem o ramo de julgamento,
    // 'indeferido' cai no `return "declaracao_editorial"` do fim da funcao e a
    // ficha de quem teve registro NEGADO passa a exibir "Candidatura declarada",
    // apagando o pedido de registro que existiu.
    const esperado: Record<string, string> = {
      deferido: "registro_tse",
      "deferido com recurso": "registro_tse",
      indeferido: "registro_tse_indeferido",
      "indeferido com recurso": "registro_tse_indeferido",
    }
    for (const estado of SITUACAO_JULGAMENTO_PUBLICADO) {
      assert.equal(
        resolveCargoDisputadoProveniencia({ status: "candidato", situacao_candidatura: estado }),
        esperado[estado],
        `selo errado para ${estado}`,
      )
    }
  })

  it("julgamento publicado vence snapshot de chapa que diz apenas #NE", () => {
    // Sem esta precedencia, as 4 fichas indeferidas seguiriam exibindo "Pedido de
    // registro no TSE", porque `chapas_2026.tse_situacao_codigo` e '#NE' em todas
    // as linhas (medido em 03/09/2026) e o ramo da chapa rodava primeiro.
    assert.equal(
      resolveCargoDisputadoProveniencia({
        status: "candidato",
        situacao_candidatura: "indeferido",
        chapa_2026: { tse_situacao_codigo: "#NE", fonte_sha256: "qualquer" },
      }),
      "registro_tse_indeferido",
    )
    // Mas um snapshot que TRAGA julgamento proprio volta a mandar: a excecao vale
    // so para codigo que nao afirma nada.
    assert.equal(
      resolveCargoDisputadoProveniencia({
        status: "candidato",
        situacao_candidatura: "indeferido",
        chapa_2026: { tse_situacao_codigo: "2", fonte_sha256: "qualquer" },
      }),
      "registro_tse",
    )
  })

  it("a migration nao carimba ultima_atualizacao", () => {
    // Normalizacao de vocabulario nao e reapuracao. Carimbar 265 fichas diria ao
    // leitor da ficha que o dado foi conferido hoje, o que seria falso.
    assert.doesNotMatch(statements(DADOS), /ultima_atualizacao/)
  })

  it("a migration declara toda escrita com @write", () => {
    // Espelha o gate de check-migrations-allowlist: statement de escrita sem
    // anotacao e escrita invisivel.
    const linhas = statements(DADOS).split("\n")
    const escritas = linhas.filter((l) => /^\s*(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b/i.test(l))
    assert.equal(escritas.length, 7, `esperava 7 statements de escrita (6 em candidatos + recibo de pre-imagem em coleta_log), achou ${escritas.length}`)
    const anotacoes = sql(DADOS).split("\n").filter((l) => /^--\s*@write\b/.test(l.trim()))
    assert.equal(anotacoes.length, escritas.length)
    for (const a of anotacoes) {
      if (/tabela=coleta_log/.test(a)) {
        assert.match(a, /ref=migration:20260903100000/)
        continue
      }
      assert.match(a, /tabela=candidatos/)
      assert.match(a, /ref=vocabulario-situacao-20260816/)
      assert.match(a, /campos=situacao_candidatura$/)
    }
  })

  it("o bloco de conferencia falha alto em vez de avisar baixo", () => {
    const texto = sql(DADOS)
    assert.match(texto, /RAISE EXCEPTION 'vocabulario_situacao: % linha\(s\) ainda fora do dominio'/)
    assert.match(sql(CHECK), /conname = 'candidatos_situacao_candidatura_dominio'\s+AND contype = 'c'/)
    // O censo exato e condicional de proposito, para o replay linear a partir de
    // banco vazio nao reprovar; a invariante estrutural, nao.
    assert.match(texto, /RAISE NOTICE 'vocabulario_situacao: tabela com % linha\(s\)/)
  })

  it("o par continua separado: dado num arquivo, DDL no outro", () => {
    // A regressao concreta: juntar os dois de volta faz `classificarMigration`
    // marcar o arquivo como mista, e `migrations-classificacao.test.ts` reprova.
    // Foi assim que este par nasceu, e o gate pegou antes do push.
    const dados = classificarMigration(DADOS, sql(DADOS))
    const check = classificarMigration(CHECK, sql(CHECK))

    assert.equal(dados.classe, "curadoria")
    assert.equal(dados.temDdlPersistente, false, "o arquivo de dado nao pode ter DDL persistente")
    assert.equal(dados.mista, false)

    assert.equal(check.classe, "schema")
    assert.deepEqual(check.tabelasDeConteudo, [], "o arquivo de schema nao pode escrever em tabela de conteudo")
    assert.equal(check.mista, false)
  })

  it("o arquivo de dado sobrevive ao replay a partir de banco vazio", () => {
    // Sem o guard de tabela vazia, a previsao estatica marca a migration como
    // `quebra_sem_guard` e ela entra no conjunto congelado de quebras.
    const dados = classificarMigration(DADOS, sql(DADOS))
    assert.equal(dados.temGuard, true, "falta o guard de banco vazio no bloco de conferencia")
    assert.equal(dados.replay, "replicavel")
    assert.equal(classificarMigration(CHECK, sql(CHECK)).replay, "replicavel")
  })
})

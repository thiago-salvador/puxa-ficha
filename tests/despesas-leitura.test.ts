import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { afterEach, describe, it } from "node:test"
import { FINANCIAMENTO_DESPESAS_COLUNAS_PUBLICAS } from "../src/lib/financiamento-despesas-contrato"
import {
  DESPESAS_RELEITURA_REVALIDATE_SECONDS,
  DESPESAS_VIEW_PUBLICA,
  idsParaReleituraDeDespesas,
  lerDespesasPublicas,
  mesclarDespesasRelidas,
  sanitizarDoacoes,
  sanitizarFornecedores,
  sanitizarLinhaDespesas,
} from "../src/lib/financiamento-despesas-leitura"

const originalWarn = console.warn
afterEach(() => {
  console.warn = originalWarn
})

interface Chamadas {
  relacao: string[]
  colunas: string[]
  ids: string[][]
}

function clienteFalso(resposta: () => Promise<{ data: unknown; error: unknown }>, chamadas?: Chamadas) {
  return {
    from(relacao: string) {
      chamadas?.relacao.push(relacao)
      return {
        select(colunas: string) {
          chamadas?.colunas.push(colunas)
          return {
            in(_coluna: string, ids: string[]) {
              chamadas?.ids.push(ids)
              return { order: () => ({ abortSignal: () => resposta() }) }
            },
          }
        },
      }
    },
  }
}

const LINHA_BASE = {
  id: "11111111-1111-4111-8111-111111111111",
  candidato_id: "22222222-2222-4222-8222-222222222222",
  ano_eleicao: 2026,
  sq_candidato: "SQ-TESTE-1",
  uf: "sp",
  municipio_codigo: null,
  cargo_candidatura: "Governador",
  estado_coleta: "declarado",
  total_despesas_contratadas: "1500.50",
  total_despesas_pagas: null,
  total_doacoes_a_terceiros: 200,
  recursos_financeiros: 1000,
  recursos_estimaveis: "500",
  divida_campanha: null,
  sobra_financeira: null,
  concentracao_despesas: [{ tipo: "Publicidade", quantidade: 3, valor: 900.5 }],
  maiores_fornecedores: [],
  doacoes_a_terceiros: [],
  prestacao_parcial: true,
  data_entrega: "2026-09-20",
  fonte: "TSE",
  fonte_url: "https://divulgacandcontas.tse.jus.br/",
  coletado_em: "2026-09-28T12:00:00.000Z",
}

describe("leitura das despesas de campanha", () => {
  const falhas: Array<[string, () => Promise<{ data: unknown; error: unknown }>]> = [
    ["42P01 (relação inexistente)", async () => ({ data: null, error: { code: "42P01", message: "relation does not exist" } })],
    ["PGRST205 (tabela fora do cache do schema)", async () => ({ data: null, error: { code: "PGRST205", message: "not in schema cache" } })],
    ["42501 (permissão negada)", async () => ({ data: null, error: { code: "42501", message: "permission denied" } })],
    ["42703 (coluna ausente)", async () => ({ data: null, error: { code: "42703", message: "column does not exist" } })],
    ["timeout", async () => ({ data: null, error: { message: "financiamento_despesas_publico timed out after 15000ms" } })],
    ["exceção lançada pelo cliente", async () => { throw new Error("fetch failed") }],
    ["resposta sem lista de linhas", async () => ({ data: { inesperado: true }, error: null })],
  ]

  // Só relação inexistente é "ausente"; permissão e coluna faltando com a view
  // já aplicada são falha de configuração e ficam "indisponivel".
  const VIEW_AUSENTE = new Set(["42P01 (relação inexistente)", "PGRST205 (tabela fora do cache do schema)"])
  for (const [nome, resposta] of falhas) {
    const esperado = VIEW_AUSENTE.has(nome) ? "ausente" : "indisponivel"
    it(`qualquer erro omite a seção, sem linhas (${esperado}): ${nome}`, async () => {
      const avisos: string[] = []
      console.warn = (...args: unknown[]) => { avisos.push(args.map(String).join(" ")) }
      const leitura = await lerDespesasPublicas(clienteFalso(resposta), ["cand-1"], "candidata")
      assert.deepEqual(leitura, { status: esperado, rows: null })
      assert.equal(avisos.length, 1, "um aviso de log por falha")
      assert.match(avisos[0], /financiamento_despesas_publico\(candidata\) (ausente|indisponível)/)
    })
  }

  it("lê a view pública com exatamente as colunas públicas e sanitiza as linhas", async () => {
    const chamadas: Chamadas = { relacao: [], colunas: [], ids: [] }
    const leitura = await lerDespesasPublicas(
      clienteFalso(async () => ({ data: [LINHA_BASE], error: null }), chamadas),
      ["cand-1", "cand-2"],
    )
    assert.deepEqual(chamadas.relacao, [DESPESAS_VIEW_PUBLICA])
    assert.equal(chamadas.colunas[0], FINANCIAMENTO_DESPESAS_COLUNAS_PUBLICAS.join(","))
    assert.deepEqual(chamadas.ids, [["cand-1", "cand-2"]])
    assert.equal(leitura.status, "ok")
    assert.equal(leitura.rows?.length, 1)
    const linha = leitura.rows?.[0]
    assert.equal(linha?.total_despesas_contratadas, 1500.5, "numeric em string vira número")
    assert.equal(linha?.total_despesas_pagas, null, "null da fonte continua null, nunca zero")
    assert.equal(linha?.recursos_estimaveis, 500)
    assert.equal(linha?.uf, "SP")
    assert.equal(linha?.prestacao_parcial, true)
  })

  it("linha malformada torna a leitura inteira indisponível, com aviso", async () => {
    const avisos: string[] = []
    console.warn = (...args: unknown[]) => { avisos.push(args.map(String).join(" ")) }
    const leitura = await lerDespesasPublicas(
      clienteFalso(async () => ({ data: [LINHA_BASE, { id: "linha-sem-campos" }], error: null })),
      ["cand-1"],
    )
    assert.deepEqual(leitura, { status: "indisponivel", rows: null })
    assert.equal(avisos.length, 1)
    assert.match(avisos[0], /indisponível, seção de despesas omitida: linha de despesas/)
  })

  it("total 100 com item de concentração inválido: indisponível, nunca 'ok' com detalhamento incompleto", async () => {
    const avisos: string[] = []
    console.warn = (...args: unknown[]) => { avisos.push(args.map(String).join(" ")) }
    const linha = {
      ...LINHA_BASE,
      total_despesas_contratadas: 100,
      concentracao_despesas: [{ tipo: "Publicidade", quantidade: 1, valor: "cem" }],
    }
    const leitura = await lerDespesasPublicas(clienteFalso(async () => ({ data: [linha], error: null })), ["cand-1"])
    assert.deepEqual(leitura, { status: "indisponivel", rows: null })
    assert.equal(avisos.length, 1, "um aviso de log")
    assert.match(avisos[0], /financiamento_despesas_publico\(ficha\) indisponível/)
  })

  for (const [coluna, invalido] of [
    ["concentracao_despesas", [{ tipo: "Publicidade", quantidade: 1, valor: -5 }]],
    ["maiores_fornecedores", [{ tipo: "PJ", nome: "12345678901234", quantidade: 1, valor: 10 }]],
    ["maiores_fornecedores", [{ tipo: "OUTRO", quantidade: 1, valor: 10 }]],
    ["doacoes_a_terceiros", [{ destinatario_tipo: "invalido", valor: 1 }]],
    ["doacoes_a_terceiros", null],
  ] as const) {
    it(`item inválido em ${coluna} (${JSON.stringify(invalido)}) invalida a linha`, () => {
      assert.equal(sanitizarLinhaDespesas({ ...LINHA_BASE, [coluna]: invalido }), null)
    })
  }

  it("lista vazia é leitura ok (não confundir com indisponível)", async () => {
    const leitura = await lerDespesasPublicas(clienteFalso(async () => ({ data: [], error: null })), ["cand-1"])
    assert.deepEqual(leitura, { status: "ok", rows: [] })
  })

  it("linha só sai com estado de coleta válido e ligada a candidatura", () => {
    assert.equal(sanitizarLinhaDespesas({ ...LINHA_BASE, estado_coleta: "qualquer" }), null)
    assert.equal(sanitizarLinhaDespesas({ ...LINHA_BASE, sq_candidato: null }), null)
    assert.equal(sanitizarLinhaDespesas({ ...LINHA_BASE, coletado_em: undefined }), null)
    assert.equal(sanitizarLinhaDespesas("texto"), null)
  })

  it("lista branca descarta chaves desconhecidas e chaves com cara de documento", () => {
    const linha = sanitizarLinhaDespesas({
      ...LINHA_BASE,
      cpf_cnpj_fornecedor: "12345678901234",
      documento: "12345678901",
      concentracao_despesas: [{ tipo: "Serviços", quantidade: 2, valor: 10, cnpj: "12345678000199", extra: "x" }],
      maiores_fornecedores: [
        { tipo: "PJ", nome: "Gráfica Exemplo Ltda", quantidade: 1, valor: 50, cnpj: "12345678000199", documento: "1" },
        { tipo: "PF_agregado", quantidade_prestadores: 4, quantidade: 6, valor: 70, cpf: "12345678901", nome: "Fulana" },
      ],
      doacoes_a_terceiros: [
        { destinatario_tipo: "partido", destinatario_nome: "Partido Exemplo", uf: "SP", cargo: null, partido: "PEX", valor: 30, cnpj: "12345678000199", candidato_slug: "alguem" },
      ],
    })
    assert.ok(linha)
    const codificado = JSON.stringify(linha)
    assert.doesNotMatch(codificado, /cpf|cnpj|documento|extra|12345678/i)
    assert.deepEqual(linha.maiores_fornecedores[1], {
      tipo: "PF_agregado",
      quantidade_prestadores: 4,
      quantidade: 6,
      valor: 70,
    })
    assert.deepEqual(Object.keys(linha.concentracao_despesas[0]).sort(), ["quantidade", "tipo", "valor"])
    assert.deepEqual(Object.keys(linha.doacoes_a_terceiros[0]).sort(), [
      "candidato_slug",
      "cargo",
      "destinatario_nome",
      "destinatario_tipo",
      "partido",
      "uf",
      "valor",
    ])
  })

  it("remove sequências de 11 e 14 dígitos dos textos (MEI, razão social)", () => {
    const fornecedores = sanitizarFornecedores([
      { tipo: "PJ", nome: "JOAO DA SILVA 12345678901", quantidade: 1, valor: 10 },
      { tipo: "PJ", nome: "MARIA 12.345.678/0001-99 ME", quantidade: 1, valor: 20 },
      { tipo: "PJ", nome: "12345678901234", quantidade: 1, valor: 30 },
    ])
    assert.deepEqual(fornecedores.map((item) => (item.tipo === "PJ" ? item.nome : null)), ["JOAO DA SILVA", "MARIA ME"])
    assert.doesNotMatch(JSON.stringify(fornecedores), /\d{11}/)
  })

  it("destinatário 'outro' nunca leva nome, e o slug fica null sem SQ oficial resolvido", () => {
    const doacoes = sanitizarDoacoes([
      { destinatario_tipo: "outro", destinatario_nome: "Pessoa Física Exemplo", valor: 5, candidato_slug: "pessoa" },
      { destinatario_tipo: "candidato", destinatario_nome: "Candidato Exemplo", uf: "RJ", valor: 8, candidato_slug: "candidato-exemplo" },
      { destinatario_tipo: "invalido", destinatario_nome: "Ignorado", valor: 1 },
      { destinatario_tipo: "partido", destinatario_nome: "Sem valor" },
    ])
    assert.equal(doacoes.length, 2)
    assert.equal(doacoes[0].destinatario_nome, null)
    assert.ok(doacoes.every((item) => item.candidato_slug === null))
  })

  it("categoria vazia vira 'Não informada'; valor não numérico invalida a linha inteira", async () => {
    const linha = sanitizarLinhaDespesas({
      ...LINHA_BASE,
      concentracao_despesas: [{ tipo: "", quantidade: 1, valor: 5 }],
    })
    assert.deepEqual(linha?.concentracao_despesas, [{ tipo: "Não informada", quantidade: 1, valor: 5 }])
    const invalida = sanitizarLinhaDespesas({
      ...LINHA_BASE,
      concentracao_despesas: [
        { tipo: "", quantidade: 1, valor: 5 },
        { tipo: "Outros", quantidade: 1, valor: "abc" },
      ],
    })
    assert.equal(invalida, null)
  })

  it("documentos com separadores saem dos textos: espaço, ponto, barra e hífen", () => {
    const fornecedores = sanitizarFornecedores([
      { tipo: "PJ", nome: "JOAO 123 456 789 01", quantidade: 1, valor: 10 },
      { tipo: "PJ", nome: "MARIA 123.456.789/01 ME", quantidade: 1, valor: 20 },
      { tipo: "PJ", nome: "LOJA 12 345 678 0001 90 LTDA", quantidade: 1, valor: 30 },
    ])
    assert.deepEqual(fornecedores.map((item) => (item.tipo === "PJ" ? item.nome : null)), ["JOAO", "MARIA ME", "LOJA LTDA"])
  })
})

describe("cache da ficha com despesas indisponíveis", () => {
  it("só ficha com status indisponível e ids conhecidos pede releitura", () => {
    assert.deepEqual(idsParaReleituraDeDespesas({ financiamento_despesas_status: "indisponivel", financiamento_despesas_candidato_ids: ["a", "b"] }), ["a", "b"])
    assert.equal(idsParaReleituraDeDespesas({ financiamento_despesas_status: "indisponivel", financiamento_despesas_candidato_ids: [] }), null)
    assert.equal(idsParaReleituraDeDespesas({ financiamento_despesas_status: "ausente", financiamento_despesas_candidato_ids: ["a"] }), null)
    assert.equal(idsParaReleituraDeDespesas({ financiamento_despesas_status: "ok", financiamento_despesas_candidato_ids: ["a"] }), null)
    assert.equal(idsParaReleituraDeDespesas(null), null)
  })

  it("mescla a releitura sem tocar o resto da ficha", () => {
    const ficha = { nome: "x", financiamento_despesas: null, financiamento_despesas_status: "indisponivel" as const, financiamento_despesas_candidato_ids: ["a"] }
    const mesclada = mesclarDespesasRelidas(ficha, { status: "ok", rows: [] })
    assert.deepEqual(mesclada, { nome: "x", financiamento_despesas: [], financiamento_despesas_status: "ok", financiamento_despesas_candidato_ids: ["a"] })
    assert.equal(ficha.financiamento_despesas_status, "indisponivel", "a ficha em cache não é mutada")
  })

  it("api.ts relê só as despesas com cache curto e chave própria; a chave da ficha subiu de versão", () => {
    const fonte = readFileSync("src/lib/api.ts", "utf8")
    const inicio = fonte.indexOf("const getCachedCandidatoBySlugResource = unstableCacheWithSingleFlight(")
    assert.ok(inicio > 0, "loader em cache não encontrado")
    assert.match(fonte.slice(inicio, inicio + 12_000), /"financiamento-despesas-v1-20260929"/)
    assert.match(fonte, /"public-candidato-ficha-despesas-releitura"/)
    assert.match(fonte, /revalidate: DESPESAS_RELEITURA_REVALIDATE_SECONDS/)
    assert.equal(DESPESAS_RELEITURA_REVALIDATE_SECONDS, 60)
  })

  it("a leitura de despesas fica fora da tupla posicional do Promise.all", () => {
    const fonte = readFileSync("src/lib/api.ts", "utf8")
    assert.match(fonte, /const despesas = await lerDespesasPublicas\(supabase, personLevelIds, slug\)/)
    assert.doesNotMatch(fonte, /financiamento_despesas_publico\(\$\{slug\}\)/)
  })
})

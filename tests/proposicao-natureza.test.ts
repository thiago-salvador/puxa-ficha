import test, { describe } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  SIGLAS_OUTRA_PROPOSICAO,
  SIGLAS_PROJETO_LEI,
  contarPorNatureza,
  isProjetoLei,
  naturezaDaProposicao,
  normalizeSiglaTipo,
  rotuloDoAcervo,
} from "../src/lib/proposicao-natureza"
import {
  applyCamaraExpenseSourceFilter,
  parseDeclaredCountFromLinks,
  requireCamaraArray,
  readCamaraExpenseSnapshot,
} from "../scripts/lib/ingest-camara"

describe("cache de despesas Câmara interrompido", () => {
  function withPages(pages: Record<string, unknown>, run: (dir: string) => void) {
    const dir = mkdtempSync(join(tmpdir(), "camara-cache-test-"))
    const yearDir = join(dir, "123", "2026")
    mkdirSync(yearDir, { recursive: true })
    try {
      for (const [name, body] of Object.entries(pages)) {
        writeFileSync(join(yearDir, name), JSON.stringify(body))
      }
      run(dir)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  test("não aceita a última página quando a fonte aponta continuação", () => {
    withPages({ "pagina-1.json": { dados: [{ valorLiquido: 12 }], links: [{ rel: "next", href: "https://dadosabertos.camara.leg.br/api/v2/deputados/123/despesas?pagina=2" }] } }, (dir) => {
      assert.equal(readCamaraExpenseSnapshot(dir, 123, 2026, 57), null)
    })
  })

  test("não aceita páginas com lacuna na sequência", () => {
    withPages({ "pagina-2.json": { dados: [], links: [] } }, (dir) => {
      assert.throws(() => readCamaraExpenseSnapshot(dir, 123, 2026, 57), /sequência/)
    })
  })

  test("reaproveita uma resposta vazia completa sem manifesto", () => {
    withPages({ "pagina-1.json": { dados: [], links: [] } }, (dir) => {
      assert.deepEqual(readCamaraExpenseSnapshot(dir, 123, 2026, 57)?.despesas, [])
    })
  })
})

describe("natureza da proposicao (#138)", () => {
  test("as duas listas nao se sobrepoem", () => {
    const colisoes = [...SIGLAS_PROJETO_LEI].filter((s) => SIGLAS_OUTRA_PROPOSICAO.has(s))
    assert.deepEqual(colisoes, [], "sigla nao pode ser projeto de lei e acessoria ao mesmo tempo")
  })

  test("normativo classifica como projeto_lei", () => {
    for (const sigla of ["PL", "PLP", "PEC", "PDL", "PLV", "PRC"]) {
      assert.equal(naturezaDaProposicao(sigla), "projeto_lei", sigla)
    }
  })

  test("atividade parlamentar classifica como outra_proposicao", () => {
    for (const sigla of ["REQ", "RIC", "INC", "EMC", "EMP", "PFC"]) {
      assert.equal(naturezaDaProposicao(sigla), "outra_proposicao", sigla)
    }
  })

  test("sigla desconhecida ou vazia nao vira projeto de lei", () => {
    assert.equal(naturezaDaProposicao("XYZ"), "outra_proposicao")
    assert.equal(naturezaDaProposicao(""), "outra_proposicao")
    assert.equal(naturezaDaProposicao(null), "outra_proposicao")
    assert.equal(naturezaDaProposicao(undefined), "outra_proposicao")
  })

  test("normaliza caixa e espaco", () => {
    assert.equal(normalizeSiglaTipo("  pl "), "PL")
    assert.equal(isProjetoLei(" pl "), true)
  })

  /**
   * O acervo curado do `eduardo-paes` na migration 20260507130000 e a referencia
   * de "o que este projeto trata como acervo": 339 linhas, das quais so 81 sao
   * PL. Se o classificador contasse tudo como projeto de lei, a ficha
   * continuaria prometendo 339 projetos de lei que nao existem.
   */
  test("recorte medido do acervo curado do eduardo-paes", () => {
    // Rodada 2 da vistoria: a fixture anterior somava 335 porque o grep que a
    // gerou não tinha REC na alternância. As 339 linhas da migration são estas,
    // reconferidas com REC incluído (4 ocorrências).
    const acervo = [
      ...Array<string>(93).fill("RIC"),
      ...Array<string>(81).fill("PL"),
      ...Array<string>(70).fill("EMC"),
      ...Array<string>(68).fill("REQ"),
      ...Array<string>(8).fill("PDC"),
      ...Array<string>(7).fill("INC"),
      ...Array<string>(4).fill("REC"),
      ...Array<string>(3).fill("PEC"),
      ...Array<string>(2).fill("PLP"),
      ...Array<string>(2).fill("PFC"),
      "EMP",
    ]

    assert.equal(acervo.length, 339, "as 339 linhas da migration 20260507130000")

    const contagem = contarPorNatureza(acervo)
    assert.equal(contagem.total, 339)
    assert.equal(contagem.projetosLei, 81 + 8 + 3 + 2, "PL + PDC + PEC + PLP")
    assert.equal(contagem.outrasProposicoes, 339 - 94)
  })

  test("contarPorNatureza em lista vazia", () => {
    assert.deepEqual(contarPorNatureza([]), { total: 0, projetosLei: 0, outrasProposicoes: 0 })
  })
})

describe("cardinalidade declarada pela Camara (#138)", () => {
  test("le o total do link rel=last com itens=1", () => {
    const links = [
      { rel: "self", href: "https://dadosabertos.camara.leg.br/api/v2/proposicoes?itens=1&pagina=1" },
      { rel: "last", href: "https://dadosabertos.camara.leg.br/api/v2/proposicoes?itens=1&pagina=2089" },
    ]
    assert.equal(parseDeclaredCountFromLinks(links, 1), 2089)
  })

  test("sem link last, o total e o que veio na pagina unica", () => {
    assert.equal(parseDeclaredCountFromLinks([{ rel: "self", href: "x" }], 7), 7)
    assert.equal(parseDeclaredCountFromLinks(undefined, 0), 0)
  })

  test("link last sem pagina utilizavel devolve null", () => {
    const links = [{ rel: "last", href: "https://dadosabertos.camara.leg.br/api/v2/proposicoes?itens=1" }]
    assert.equal(parseDeclaredCountFromLinks(links, 1), null)
  })
})

describe("contrato de paginação da Câmara", () => {
  test("HTTP 200 com dados em formato inválido não vira vazio", () => {
    assert.throws(
      () => requireCamaraArray({ dados: null as unknown as never[], links: [] }, "https://camara.test/despesas"),
      /dados não é uma lista/,
    )
  })
})

test("lookup de despesas preserva fonte diversa na mesma chave candidato/ano", async () => {
  const rows = [
    { id: "viagem", candidato_id: "candidato-1", ano: 2024, fonte: "Portal da Transparência" },
    { id: "camara", candidato_id: "candidato-1", ano: 2024, fonte: "Camara" },
  ]
  const filters: Array<[string, unknown]> = [
    ["candidato_id", "candidato-1"],
    ["ano", 2024],
  ]
  const query = {
    eq(column: string, value: unknown) {
      filters.push([column, value])
      return this
    },
    async single() {
      const data = rows.find((row) => filters.every(([column, value]) => row[column as keyof typeof row] === value)) ?? null
      return { data }
    },
  }

  const { data } = await applyCamaraExpenseSourceFilter(query).single()
  assert.equal(data?.id, "camara")
  assert.deepEqual(filters, [
    ["candidato_id", "candidato-1"],
    ["ano", 2024],
    ["fonte", "Camara"],
  ])
})

describe("rótulo do acervo (vistoria PRs #141/#142)", () => {
  test("só projeto de lei mantém o rótulo clássico", () => {
    assert.equal(rotuloDoAcervo(["PL", "PEC", "PLP"]), "Projetos de lei")
  })

  test("qualquer proposição acessória muda o rótulo", () => {
    assert.equal(rotuloDoAcervo(["PL", "REQ"]), "Proposições de autoria")
    assert.equal(rotuloDoAcervo(["RIC"]), "Proposições de autoria")
  })

  test("acervo vazio fica no rótulo padrão", () => {
    assert.equal(rotuloDoAcervo([]), "Projetos de lei")
  })
})

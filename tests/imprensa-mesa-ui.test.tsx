import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { describe, it } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type { ImprensaPageRow } from "@/lib/imprensa-cache"

const require = createRequire(import.meta.url)
require.extensions[".css"] = (module) => {
  const target: Record<string, unknown> = {}
  const styles = new Proxy(target, { get: (object, property) => property === "default" ? object.default : property })
  target.default = styles
  module.exports = styles
}

const model = require("../src/components/imprensa/mesa/mesa-model") as typeof import("@/components/imprensa/mesa/mesa-model")
const { ImprensaRows } = require("../src/components/imprensa/ImprensaRows") as typeof import("@/components/imprensa/ImprensaRows")
const { MesaCoverage } = require("../src/components/imprensa/mesa/MesaCoverage") as typeof import("@/components/imprensa/mesa/MesaCoverage")
const { MesaRowDetails } = require("../src/components/imprensa/mesa/MesaRowDetails") as typeof import("@/components/imprensa/mesa/MesaRowDetails")
const { computeImprensaFacts, buildImprensaFactCards } = require("../src/lib/imprensa-facts") as typeof import("@/lib/imprensa-facts")

const GENERATED_AT = "2026-09-28T17:02:00Z"
const DASHES = /[\u2013\u2014]/

/** Linha completa da Mesa para testes; cada teste sobrescreve só o que importa. */
function mesaRow(overrides: Partial<ImprensaPageRow> & { slug: string }): ImprensaPageRow {
  const base: ImprensaPageRow = {
    slug: overrides.slug,
    nome: `Pessoa ${overrides.slug}`,
    nomeOriginal: `PESSOA ${overrides.slug.toUpperCase()}`,
    cargo: "Governador",
    uf: "BA",
    partido: "PARTIDO",
    fichaUrl: `/candidato/${overrides.slug}`,
    chapa: {
      estado: "publicado",
      suplentesEstado: "nao_aplicavel",
      viceNome: "Vice Exemplo",
      viceNomeOriginal: "VICE EXEMPLO",
      viceSituacao: null,
      suplentes: [],
      fonteUrl: "https://tse.jus.br/chapa",
      fonteSha256: "a".repeat(64),
      snapshotEm: "2026-09-20T12:00:00Z",
    },
    sites: { estado: "publicado", quantidade: 1, fonteUrl: "https://tse.jus.br/sites", fonteSha256: "b".repeat(64), coletadoEm: "2026-09-20T12:00:00Z" },
    processos: { estado: "vazio_confirmado", buscaEstado: "vazio_confirmado", quantidade: 0, quantidadeOmitida: 0, quantidadeEmConfirmacao: 0 },
    patrimonio: { estado: "publicado", ano: 2026, total: 1_000_000, valorEstado: "valor_informado", anoAnterior: 2022, totalAnterior: 400_000, variacaoPct: 150, fonteUrl: "https://dadosabertos.tse.jus.br" },
    gastos: { estado: "sem_dado", ultimoAno: null, ultimoAnoTotal: null, anosEmRevisao: [] },
    tcu: { estado: "vazio_verificado", registros: 0, consultadoEm: "2026-09-18T12:00:00Z", fonteUrl: "https://tcu.gov.br" },
    sancoes: { estado: "vazio-confirmado", quantidade: 0, consultadoEm: "2026-09-18T12:00:00Z", fonteUrl: "https://portaldatransparencia.gov.br" },
  }
  return { ...base, ...overrides }
}

/** Recorte variado: publicado, sem dado, homônimo, Senado, sanção, cota. */
function mesaSample(): ImprensaPageRow[] {
  return [
    mesaRow({ slug: "ana", nome: "Ana", processos: { estado: "publicado", buscaEstado: "encontrado", quantidade: 3, quantidadeOmitida: 0, quantidadeEmConfirmacao: 1 } }),
    mesaRow({
      slug: "bruno",
      nome: "Bruno",
      patrimonio: { estado: "sem_dado", ano: null, total: null, valorEstado: null, anoAnterior: null, totalAnterior: null, variacaoPct: null, fonteUrl: null },
      processos: { estado: "indeterminado", buscaEstado: "indeterminado", quantidade: null },
      sancoes: { estado: "nao-verificado", quantidade: null, consultadoEm: null, fonteUrl: null },
      tcu: { estado: "nao_verificado", registros: null, consultadoEm: null, fonteUrl: null },
      chapa: { ...mesaRow({ slug: "x" }).chapa, estado: "sem_dado", viceNome: null, viceNomeOriginal: null },
    }),
    mesaRow({
      slug: "carla",
      nome: "Carla",
      cargo: "Senador",
      patrimonio: { estado: "publicado", ano: 2026, total: 25_000_000, valorEstado: "valor_informado", anoAnterior: 2018, totalAnterior: 2_000_000, variacaoPct: 1150, fonteUrl: null },
      chapa: { ...mesaRow({ slug: "x" }).chapa, estado: "publicado", suplentesEstado: "publicado", viceNome: null, viceNomeOriginal: null, suplentes: ["Suplente Um", "Suplente Dois"] },
      gastos: { estado: "publicado", ultimoAno: 2025, ultimoAnoTotal: 412_000, anosEmRevisao: [2024] },
      sancoes: { estado: "com-registros", quantidade: 2, consultadoEm: "2026-09-18T12:00:00Z", fonteUrl: "https://portaldatransparencia.gov.br" },
      tcu: { estado: "encontrado_em_revisao", registros: 1, consultadoEm: "2026-09-18T12:00:00Z", fonteUrl: "https://tcu.gov.br" },
    }),
    mesaRow({ slug: "davi", nome: "Davi", cargo: "Presidente", uf: null, patrimonio: { estado: "publicado", ano: 2026, total: 0, valorEstado: "sem_bens_declarados", anoAnterior: null, totalAnterior: null, variacaoPct: null, fonteUrl: null } }),
  ]
}

describe("Mesa: filtros de um campo só", () => {
  it("cada ?com= devolve exatamente o número do card de fatos que aponta para ele", () => {
    const rows = mesaSample()
    const cards = buildImprensaFactCards(computeImprensaFacts(rows))
    for (const card of cards) {
      if (!card.mesaQuery.com) continue
      const count = rows.filter((row) => model.matchesMesaCom(row, card.mesaQuery.com!)).length
      assert.equal(count, card.value, `filtro ${card.mesaQuery.com}`)
    }
    assert.equal(rows.filter((row) => model.matchesMesaCom(row, "variacao-100")).length, 2)
  })

  it("rejeita valores desconhecidos na URL", () => {
    assert.equal(model.parseMesaCom("tudo"), null)
    assert.equal(model.parseMesaCom("sancao"), "sancao")
    assert.equal(model.parseMesaSort("ranking"), "padrao")
    assert.equal(model.parseMesaSort("variacao"), "variacao")
  })

  it("mantém cargo e UF na URL e tira a ordem padrão", () => {
    assert.equal(model.mesaSearchWith("?cargo=Governador&uf=BA", "variacao", "processo"), "?cargo=Governador&uf=BA&ordem=variacao&com=processo")
    assert.equal(model.mesaSearchWith("?uf=BA&ordem=gasto&com=cota", "padrao", null), "?uf=BA")
    assert.equal(model.mesaSearchWith("", "padrao", null), "")
  })
})

describe("Mesa: ordenação", () => {
  it("ordena do maior para o menor e deixa quem não tem o dado no fim", () => {
    const rows = mesaSample()
    assert.deepEqual(model.sortMesaRows(rows, "patrimonio").map((row) => row.slug), ["carla", "ana", "davi", "bruno"])
    assert.deepEqual(model.sortMesaRows(rows, "variacao").map((row) => row.slug), ["carla", "ana", "davi", "bruno"], "sem comparação fica no fim, em cargo e nome")
    const processos = model.sortMesaRows(rows, "processos")
    assert.equal(processos[0].slug, "ana")
    assert.equal(processos.at(-1)!.slug, "bruno", "identidade não confirmada não vira zero")
    assert.deepEqual(processos.map((row) => row.slug), ["ana", "davi", "carla", "bruno"], "busca feita e vazia é zero confirmado, antes de quem não tem o dado")
    assert.deepEqual(model.sortMesaRows(rows, "sancoes").map((row) => row.slug), ["carla", "davi", "ana", "bruno"], "sem consulta fica no fim")
  })

  it("ordem padrão é cargo e depois nome", () => {
    assert.deepEqual(model.sortMesaRows(mesaSample(), "padrao").map((row) => row.cargo), ["Presidente", "Governador", "Governador", "Senador"])
  })
})

describe("Mesa: cobertura e citação", () => {
  it("cada família soma o denominador e não conta o que não se aplica", () => {
    const rows = mesaSample()
    for (const family of model.computeMesaCoverage(rows)) {
      const sum = Object.values(family.counts).reduce((total, value) => total + value, 0)
      assert.equal(sum, family.total, family.id)
      assert.equal(family.total, rows.length, family.id)
    }
    const processos = model.computeMesaCoverage(rows).find((family) => family.id === "processos")!
    assert.deepEqual(processos.counts, { publicado: 1, nada_consta: 2, parcial: 0, sem_confirmacao: 1 })
  })

  it("citação nomeia só as fontes consultadas, com link absoluto e data", () => {
    const [ana, bruno] = mesaSample()
    const citation = model.buildMesaCitation(ana, GENERATED_AT)
    assert.match(citation, /^PESSOA ANA \(PARTIDO, Governador, BA\)\./)
    assert.match(citation, /TSE \(declaração de bens de 2026\)/)
    assert.match(citation, /tribunais/)
    assert.match(citation, /https:\/\/puxaficha\.com\.br\/candidato\/ana/)
    assert.match(citation, /Dados de 28\/09\/2026\./)
    const semConsulta = model.buildMesaCitation(bruno, null)
    assert.doesNotMatch(semConsulta, /CGU|TCU|tribunais|Dados de/)
    assert.doesNotMatch(citation + semConsulta, DASHES)
  })

  it("formata valores sem travessão e com sinal", () => {
    assert.equal(model.formatPct(-12), "-12%")
    assert.equal(model.formatPct(310), "+310%")
    assert.doesNotMatch(model.formatBrlCompact(12_400_000), DASHES)
  })

  it("pronto para citar segue a regra anterior da Mesa", () => {
    const [ana, bruno, , davi] = mesaSample()
    assert.equal(model.isMesaRowPublishable(ana), false, "registro com fonte em confirmação pede conferência")
    assert.equal(model.isMesaRowPublishable(bruno), false)
    assert.equal(model.isMesaRowPublishable(davi), true)
  })
})

describe("Mesa: tabela renderizada", () => {
  function render(props: Partial<Parameters<typeof ImprensaRows>[0]> = {}) {
    return renderToStaticMarkup(React.createElement(ImprensaRows, { rows: mesaSample(), generatedAt: GENERATED_AT, ...props }))
  }

  it("uma linha de tabela por candidato, com selo no computador e no celular", () => {
    const html = render()
    const tbody = html.slice(html.indexOf("<tbody>"), html.indexOf("</tbody>"))
    assert.equal(tbody.match(/<tr/g)?.length, 4)
    assert.equal(html.match(/Pronto para citar/g)?.length, 4, "Carla e Davi: tabela e cartão")
    assert.equal(html.match(/Conferir antes de citar/g)?.length, 4)
    assert.match(html, /aria-expanded="false"/)
    assert.doesNotMatch(html, DASHES)
  })

  it("sem dado nunca aparece como zero e processo traz a ressalva", () => {
    const html = render()
    assert.match(html, /Sem declaração publicada/)
    assert.match(html, /Identidade não confirmada/)
    assert.match(html, /Sem gasto publicado/)
    assert.match(html, /Processo não é condenação/)
    assert.match(html, /\+1\.150%/)
    assert.match(html, /Declarou não ter bens/)
    assert.doesNotMatch(html, /sem_dado|vazio_confirmado|nao-verificado/)
  })

  it("filtro e ordem vindos da URL já chegam aplicados", () => {
    const html = render({ initialCom: "sancao", initialSort: "patrimonio" })
    const tbody = html.slice(html.indexOf("<tbody>"), html.indexOf("</tbody>"))
    assert.equal(tbody.match(/<tr/g)?.length, 1)
    assert.match(tbody, /Carla/)
    assert.match(html, /aria-pressed="true"[^>]*>Com sanção federal/)
    assert.match(html, /aria-sort="descending"/)
  })

  it("linha aberta mostra fontes, SHA-256, citação, atalhos e contato de correção", () => {
    const html = renderToStaticMarkup(React.createElement(MesaRowDetails, { row: mesaSample()[2], generatedAt: GENERATED_AT, id: "x" }))
    assert.match(html, /SHA-256 a{64}/)
    assert.match(html, /Copiar citação/)
    assert.match(html, /href="\/comparar\?c1=carla"/)
    assert.match(html, /href="\/candidato\/carla\?tab=justica"/)
    assert.match(html, /contato@puxaficha\.com\.br/)
    assert.match(html, /Suplente Um, Suplente Dois/)
    assert.match(html, /Fora do total, em revisão: 2024/)
    assert.doesNotMatch(html, DASHES)
    assert.doesNotMatch(html, /imprensa@/)
  })

  it("cobertura explica o homônimo como proteção e escreve cada contagem", () => {
    const html = renderToStaticMarkup(React.createElement(MesaCoverage, { families: model.computeMesaCoverage(mesaSample()), homonimos: 1 }))
    assert.match(html, /1 busca achou um nome igual/)
    assert.match(html, /não publicamos sem confirmar que é a mesma pessoa/)
    assert.equal(html.match(/<h3>/g)?.length, 5)
    assert.doesNotMatch(html, DASHES)
  })
})

import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { describe, it } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

const require = createRequire(import.meta.url)
require.extensions[".css"] = (module) => {
  const target: Record<string, unknown> = {}
  const styles = new Proxy(target, { get: (object, property) => property === "default" ? object.default : property })
  target.default = styles
  module.exports = styles
}

const { ImprensaFacts } = require("../src/components/imprensa/ImprensaFacts") as typeof import("@/components/imprensa/ImprensaFacts")
const { ImprensaSubnav } = require("../src/components/imprensa/ImprensaSubnav") as typeof import("@/components/imprensa/ImprensaSubnav")
const { DataStateLegend } = require("../src/components/imprensa/DataStateLegend") as typeof import("@/components/imprensa/DataStateLegend")
const { TrustFooter } = require("../src/components/imprensa/TrustFooter") as typeof import("@/components/imprensa/TrustFooter")
const { CiteBox } = require("../src/components/imprensa/CiteBox") as typeof import("@/components/imprensa/CiteBox")
const { computeImprensaFacts } = require("../src/lib/imprensa-facts") as typeof import("@/lib/imprensa-facts")

type Row = Parameters<typeof computeImprensaFacts>[0][number]

function row(overrides: Partial<Row> = {}): Row {
  return {
    cargo: "Governador",
    patrimonio: { estado: "publicado", ano: 2026, total: 1_000_000, valorEstado: null, anoAnterior: 2022, totalAnterior: 400_000, variacaoPct: 150, fonteUrl: null },
    processos: { estado: "vazio_confirmado", buscaEstado: "vazio_confirmado", quantidade: 0 },
    sancoes: { estado: "vazio-confirmado", quantidade: 0, consultadoEm: null, fonteUrl: null },
    tcu: { estado: "vazio_verificado", registros: 0, consultadoEm: null, fonteUrl: null },
    gastos: { estado: "sem_dado", ultimoAno: null, ultimoAnoTotal: null, anosEmRevisao: [] },
    chapa: { estado: "publicado", suplentesEstado: "nao_aplicavel", viceNome: "Vice", viceNomeOriginal: "VICE", suplentes: [], fonteUrl: null, fonteSha256: null, snapshotEm: null },
    ...overrides,
  }
}

function text(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")
}

describe("ImprensaFacts", () => {
  const facts = computeImprensaFacts([row(), row()])

  it("mostra o card com zero, com denominador e ressalva", () => {
    const html = renderToStaticMarkup(<ImprensaFacts facts={facts} scopeLabel="Bahia" recorte={{ uf: "BA" }} />)
    const visible = text(html)
    assert.match(visible, /Bahia · 2 candidatos/)
    assert.match(visible, /0 candidatos em cadastro federal de sanções/)
    assert.match(visible, /2 consultados sem registro; 0 sem consulta\./)
    assert.match(visible, /CEIS, CNEP ou CEAF, da CGU\./)
    assert.match(visible, /Processo não é condenação\. Processo disciplinar não é processo judicial nem condenação\. Homônimo não confirmado não entra\./)
    assert.match(html, /href="\/imprensa\/mesa\?uf=BA&amp;ordem=variacao"/)
    assert.match(html, /href="\/imprensa\/mesa\?uf=BA&amp;com=sancao"/)
    assert.doesNotMatch(visible, /[\u2013\u2014]/)
  })

  it("não mostra zeros quando o recorte não tem linhas", () => {
    const html = renderToStaticMarkup(<ImprensaFacts facts={computeImprensaFacts([])} scopeLabel="Acre" />)
    assert.match(text(html), /Nenhum candidato neste recorte/)
    assert.doesNotMatch(html, /data-fact=/)
  })

  it("renderiza só os cards pedidos e pode omitir o link", () => {
    const html = renderToStaticMarkup(<ImprensaFacts facts={facts} scopeLabel="Brasil" ids={["processos"]} linkToMesa={false} />)
    assert.equal(html.match(/data-fact=/g)?.length, 1)
    assert.doesNotMatch(html, /href=/)
  })
})

describe("ImprensaSubnav", () => {
  it("marca a página atual, leva o recorte e mostra o selo de data", () => {
    const html = renderToStaticMarkup(<ImprensaSubnav current="mesa" recorte={{ uf: "BA" }} generatedAt="2026-09-28T17:02:00.000Z" />)
    assert.match(html, /<a[^>]*aria-current="page"[^>]*href="\/imprensa\/mesa\?uf=BA&amp;turno=2"/)
    assert.match(html, /href="\/imprensa\/1o-turno"/)
    assert.equal(html.match(/aria-current=/g)?.length, 1)
    assert.match(html, /href="\/imprensa\/uf\/ba"/)
    assert.match(html, /<time dateTime="2026-09-28T17:02:00.000Z">Dados de 28\/09, 14:02<\/time>/)
  })

  it("avisa quando a data dos dados não está disponível", () => {
    assert.match(renderToStaticMarkup(<ImprensaSubnav current="sala" />), /Data dos dados indisponível/)
  })
})

describe("DataStateLegend e TrustFooter", () => {
  it("usa as quatro palavras da legenda", () => {
    const visible = text(renderToStaticMarkup(<DataStateLegend />))
    for (const label of ["Publicado", "Buscado, nada consta", "Parcial ou em revisão", "Sem confirmação ou sem dado"]) assert.ok(visible.includes(label), label)
  })

  it("mostra o contato como texto, sem prazo de resposta nem endereço inexistente", () => {
    const html = renderToStaticMarkup(<TrustFooter homonimos={357} />)
    const visible = text(html)
    assert.match(visible, /contato@puxaficha\.com\.br/)
    assert.match(visible, /357 buscas de processo acharam nomes iguais/)
    assert.match(visible, /Apache 2\.0/)
    assert.match(visible, /SHA-256/)
    assert.match(html, /href="\/metodologia"/)
    assert.match(html, /href="\/imprensa\/frescor"/)
    assert.doesNotMatch(visible, /imprensa@|prazo/i)
    assert.doesNotMatch(visible, /[\u2013\u2014]/)
  })
})

describe("CiteBox", () => {
  it("mostra a citação, o botão e a região de aviso", () => {
    const html = renderToStaticMarkup(<CiteBox citation="Fonte: Puxa Ficha, com dados do TSE." />)
    assert.match(html, /Fonte: Puxa Ficha, com dados do TSE\./)
    assert.match(html, /<button type="button"[^>]*>Copiar citação<\/button>/)
    assert.match(html, /aria-live="polite"/)
  })
})

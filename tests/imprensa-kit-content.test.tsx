/* cspell:disable */
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

const content = require("../src/app/(site)/imprensa/kit/content") as typeof import("@/app/(site)/imprensa/kit/content")
const { CopyText } = require("../src/components/imprensa/kit/CopyText") as typeof import("@/components/imprensa/kit/CopyText")
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

// 1.234 candidatos: 1.000 com patrimônio publicado, 37 com processo publicado, 11 homônimos.
const rows: Row[] = [
  ...Array.from({ length: 1000 }, () => row()),
  ...Array.from({ length: 37 }, () => row({ patrimonio: { estado: "sem_dado", ano: null, total: null, valorEstado: null, anoAnterior: null, totalAnterior: null, variacaoPct: null, fonteUrl: null }, processos: { estado: "publicado", buscaEstado: "encontrado", quantidade: 2 } })),
  ...Array.from({ length: 11 }, () => row({ patrimonio: { estado: "sem_dado", ano: null, total: null, valorEstado: null, anoAnterior: null, totalAnterior: null, variacaoPct: null, fonteUrl: null }, processos: { estado: "indeterminado", buscaEstado: "indeterminado", quantidade: 0 } })),
  ...Array.from({ length: 186 }, () => row({ patrimonio: { estado: "sem_dado", ano: null, total: null, valorEstado: null, anoAnterior: null, totalAnterior: null, variacaoPct: null, fonteUrl: null } })),
]
const generatedAt = "2026-09-28T17:02:00.000Z"
const numbers = content.kitNumbers(computeImprensaFacts(rows), generatedAt)

function words(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

function allStrings(): string[] {
  const out: string[] = [content.projectCitation, content.founderBio]
  for (const n of [numbers, null]) {
    out.push(content.kitOneLine(n))
    for (const text of content.kitPressTexts(n)) out.push(text.label, ...text.paragraphs)
    for (const q of content.kitQuestions(n)) out.push(q.question, q.answer, q.sourceLabel ?? "")
  }
  for (const format of content.citationFormats) out.push(format.label, format.citation)
  return out
}

describe("kit de imprensa: números calculados", () => {
  it("tira cada número das linhas do dataset e a data do generatedAt", () => {
    assert.deepEqual(numbers, { total: 1234, patrimonios: 1000, comProcesso: 37, homonimos: 11, data: "28/09/2026" })
  })

  it("insere os números nos textos, na frase e na FAQ de homônimos", () => {
    const [t50, t100, t250] = content.kitPressTexts(numbers)
    assert.match(content.kitOneLine(numbers), /sobre os 1\.234 candidatos a presidente, governador e Senado/)
    assert.match(t50.paragraphs.join(" "), /1\.234 candidatos/)
    assert.match(t100.paragraphs.join(" "), /patrimônio ao TSE de 1\.000 candidatos e processos com link do tribunal de 37\./)
    const long = t250.paragraphs.join(" ")
    assert.match(long, /Nos dados de 28\/09\/2026/)
    assert.match(long, /37 candidatos têm processo publicado/)
    assert.match(long, /11 buscas estão nessa situação/)
    const homonimo = content.kitQuestions(numbers).find((q) => q.question === "Como o site trata homônimos?")
    assert.match(homonimo?.answer ?? "", /11 buscas de processo estão nessa situação/)
  })

  it("usa o singular quando o número é 1", () => {
    const one = content.kitNumbers(computeImprensaFacts([row({ processos: { estado: "publicado", buscaEstado: "encontrado", quantidade: 1 } })]), generatedAt)
    const long = content.kitPressTexts(one)[2].paragraphs.join(" ")
    assert.match(long, /1 candidato tem processo publicado/)
    assert.match(content.kitOneLine(one), /sobre 1 candidato a presidente/)
  })

  it("sem dataset, não mostra zero no lugar do número", () => {
    assert.equal(content.kitNumbers(null, generatedAt), null)
    assert.equal(content.kitNumbers(computeImprensaFacts([]), generatedAt), null)
    const texts = [content.kitOneLine(null), ...content.kitPressTexts(null).flatMap((text) => text.paragraphs), ...content.kitQuestions(null).map((q) => q.answer)]
    for (const text of texts) assert.doesNotMatch(text.replace(/2026/g, ""), /\d/, text)
  })
})

describe("kit de imprensa: redação", () => {
  it("mantém os tamanhos aproximados de 50, 100 e 250 palavras", () => {
    const [t50, t100, t250] = content.kitPressTexts(numbers).map((text) => words(text.paragraphs.join(" ")))
    assert.ok(t50 >= 40 && t50 <= 60, `50 palavras: ${t50}`)
    assert.ok(t100 >= 85 && t100 <= 115, `100 palavras: ${t100}`)
    assert.ok(t250 >= 200 && t250 <= 275, `250 palavras: ${t250}`)
  })

  it("mantém as ressalvas em todos os textos", () => {
    for (const text of content.kitPressTexts(numbers)) {
      const joined = text.paragraphs.join(" ")
      assert.match(joined, /não recomenda voto/, text.label)
      assert.match(joined, /Processo não é condenação/, text.label)
      assert.match(joined, /[Aa]usência de dado não é zero/, text.label)
    }
    assert.match(content.kitPressTexts(numbers)[1].paragraphs.join(" "), /Confira a fonte original/)
    assert.match(content.kitPressTexts(numbers)[2].paragraphs.join(" "), /confira o dado na fonte original/)
  })

  it("não usa travessão, meia-risca nem endereço inventado", () => {
    for (const text of allStrings()) {
      assert.doesNotMatch(text, /[–—]/, text)
      assert.doesNotMatch(text, /imprensa@/, text)
    }
  })

  it("cita o projeto com o texto aprovado e marca os campos do formato", () => {
    assert.equal(content.projectCitation, "Puxa Ficha (puxaficha.com.br), consulta pública de dados oficiais sobre candidaturas de 2026")
    assert.deepEqual(content.citationFormats.map((format) => format.label), ["Projeto", "Pacote do estado", "Candidato ou dado"])
    assert.match(content.citationFormats[2].citation, /<nome do candidato>/)
    assert.match(content.citationFormats[1].citation, /<sigla da UF>/)
  })

  it("mantém a FAQ existente e acrescenta homônimos e estados do dado", () => {
    const questions = content.kitQuestions(numbers)
    assert.equal(questions.length, 12)
    assert.equal(questions[0].question, "O que é o Puxa Ficha?")
    assert.equal(questions[9].question, "Um processo significa condenação?")
    const estados = questions.find((q) => q.question === "O que significa cada estado do dado?")
    assert.equal(estados?.sourceHref, "/imprensa/frescor")
  })

  it("mantém a bio aprovada sem alteração", () => {
    assert.equal(content.founderBio, "Thiago Salvador é diretor de Operações e IA na Zaaz, empresa de creator economy com sede em Seattle, e vive em São Paulo. Criou o Puxa Ficha para reunir em um só lugar o que as fontes oficiais dizem sobre cada candidato.")
  })
})

describe("CopyText", () => {
  it("renderiza os parágrafos e um botão de copiar com nome acessível", () => {
    const html = renderToStaticMarkup(<CopyText label="250 palavras" paragraphs={["Primeiro.", "Segundo."]} />)
    assert.match(html, /<p>Primeiro\.<\/p><p>Segundo\.<\/p>/)
    assert.match(html, /<button type="button"[^>]*>Copiar texto<span[^>]*> de 250 palavras<\/span><\/button>/)
    assert.match(html, /role="status"/)
    assert.match(html, /aria-labelledby="([^"]+)"[\s\S]*id="\1"/)
  })
})

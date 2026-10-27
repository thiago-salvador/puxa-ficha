import "./helpers/css-modules"
import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"

import { HomeArquivo2026 } from "@/components/HomeArquivo2026"
import { disputaFinal, formatarGeradoTse, getNumerosArquivo, getResultado2Turno, metadadosDaHome } from "@/lib/arquivo-home"

describe("resultado oficial do 2º turno", () => {
  const resultado = getResultado2Turno()

  it("só traz arquivos finais do TSE, cada disputa com um eleito", () => {
    assert.equal(resultado.status, "final")
    assert.ok(resultado.disputas.length > 0)
    for (const d of resultado.disputas) {
      assert.match(d.fonte.url, /^https:\/\/resultados\.tse\.jus\.br\/oficial\/ele2026\//, d.fonte.url)
      assert.match(d.fonte.sha256, /^[0-9a-f]{64}$/)
      assert.equal(d.candidatos.filter((c) => c.eleito).length, 1, `${d.cargo} ${d.uf}`)
      const soma = d.candidatos.reduce((total, c) => total + (c.percentual_validos ?? 0), 0)
      assert.ok(Math.abs(soma - 100) < 0.01, `${d.cargo} ${d.uf} soma ${soma}`)
      const [primeiro, segundo] = d.candidatos
      assert.ok(primeiro.eleito && (primeiro.votos ?? 0) > (segundo.votos ?? 0), "eleito vem primeiro e com mais votos")
    }
  })

  it("acha a disputa presidencial com eleito e derrotado", () => {
    const presidente = disputaFinal(resultado, "Presidente", "BR")
    assert.ok(presidente)
    assert.notEqual(presidente.eleito.slug, presidente.derrotado.slug)
    assert.equal(disputaFinal(resultado, "Presidente", "SP"), null)
    assert.equal(disputaFinal(resultado, "PRESIDENTE", "br")?.eleito.slug, presidente.eleito.slug)
  })

  it("formata o horário de geração do TSE", () => {
    assert.equal(formatarGeradoTse("25/10/2026 23:27:02"), "25/10/2026, 23h27")
    assert.equal(formatarGeradoTse("formato novo"), "formato novo")
  })
})

describe("números do arquivo", () => {
  it("todo número é inteiro positivo e diz de onde veio", () => {
    const n = getNumerosArquivo()
    for (const grupo of [n.dados, n.operacao, n.construcao]) {
      for (const [chave, item] of Object.entries(grupo)) {
        assert.ok(Number.isInteger(item.valor) && item.valor > 0, chave)
        assert.ok(item.fonte.trim().length > 10, `${chave} sem fonte`)
      }
    }
    const { fichas } = n.dados
    assert.equal(fichas.presidente + fichas.governador + fichas.senador, fichas.valor)
  })
})

describe("HomeArquivo2026", () => {
  const resultado = getResultado2Turno()
  const presidente = disputaFinal(resultado, "Presidente", "BR")!
  const html = renderToStaticMarkup(<HomeArquivo2026 nomes={{ [presidente.eleito.slug]: "Eleito Teste", [presidente.derrotado.slug]: "Derrotado Teste" }} />)

  it("abre com o fato e a fonte do TSE", () => {
    assert.match(html, /Eleito Teste eleito presidente/)
    // O hero é só do eleito: o derrotado não aparece.
    assert.doesNotMatch(html, /Derrotado Teste/)
    assert.ok(html.includes(presidente.fonte.url.replaceAll("&", "&amp;")))
    assert.match(html, /data-pf-home-hero="arquivo"/)
  })

  it("lista os governadores do 2º turno, com quem cada um venceu, e os números com fonte", () => {
    const governadores = resultado.disputas.filter((d) => d.cargo === "Governador").length
    assert.equal(html.match(/data-pf-arquivo-governador=/g)?.length ?? 0, governadores)
    assert.match(html, /O que o Puxa Ficha reuniu/)
    assert.match(html, /Concebido, construído e mantido por Thiago Salvador, de março a outubro de 2026/)
    assert.match(html, /De onde vêm estes números/)
  })
})

describe("metadados da home", () => {
  it("com o arquivo ligado o título e a descrição são os do arquivo", () => {
    const m = metadadosDaHome(true)
    assert.equal(m.title, "Puxa Ficha | Arquivo das eleições 2026")
    assert.match(m.description, /resultado oficial do 2º turno/)
  })
  it("sem o arquivo volta o título da campanha do 2º turno", () => {
    const m = metadadosDaHome(false)
    assert.equal(m.title, "Puxa Ficha | 2º turno das eleições 2026")
    assert.doesNotMatch(m.description, /Arquivo/)
  })
})

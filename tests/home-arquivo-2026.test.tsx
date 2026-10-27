import "./helpers/css-modules"
import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"

import { Arquivo2TurnoHero } from "@/components/Arquivo2Turno"
import { HomeArquivo2026 } from "@/components/HomeArquivo2026"
import { diasEntre, disputaFinal, formatarGeradoTse, getNumerosArquivo, getResultado2Turno, metadadosDaHome } from "@/lib/arquivo-home"

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

  it("a série semanal cobre a coleta inteira, uma contagem por semana", () => {
    const { serie_semanal: serie, operacao } = getNumerosArquivo()
    assert.ok(serie.semanas.length > 20)
    for (const valores of [serie.coleta, serie.mudancas, serie.noticias]) {
      assert.equal(valores.length, serie.semanas.length)
      assert.ok(valores.every((v) => Number.isInteger(v) && v >= 0))
    }
    // Semanas começam na segunda e andam de 7 em 7 dias, da semana da primeira coleta à do corte.
    serie.semanas.forEach((s, i) => {
      assert.equal(new Date(`${s}T00:00:00Z`).getUTCDay(), 1, s)
      if (i > 0) assert.equal(diasEntre(serie.semanas[i - 1], s), 8)
    })
    assert.ok(serie.semanas[0] <= operacao.registros_coleta.inicio)
    assert.ok(serie.semanas.at(-1)! <= operacao.registros_coleta.fim)
    assert.equal(serie.coleta.reduce((a, b) => a + b, 0), operacao.registros_coleta.valor)
    assert.equal(serie.mudancas.reduce((a, b) => a + b, 0) <= operacao.mudancas_rastreadas.valor, true)
  })

  it("a linha do tempo vem em ordem, dentro do período, e cada marco diz a fonte", () => {
    const { marcos, operacao } = getNumerosArquivo()
    assert.ok(marcos.length >= 3)
    assert.deepEqual(marcos.map((m) => m.data), [...marcos.map((m) => m.data)].sort())
    assert.equal(marcos[0].data, operacao.registros_coleta.inicio)
    for (const m of marcos) {
      assert.match(m.data, /^2026-\d{2}-\d{2}$/)
      assert.ok(m.titulo.trim() && m.fonte.trim(), m.data)
    }
  })

  it("conta os dias com o primeiro e o último", () => {
    assert.equal(diasEntre("2026-03-29", "2026-03-29"), 1)
    assert.equal(diasEntre("2026-03-29", "2026-10-25"), 211)
  })
})

describe("Arquivo2TurnoHero, topo de /2o-turno", () => {
  const resultado = getResultado2Turno()
  const presidente = disputaFinal(resultado, "Presidente", "BR")!
  const html = renderToStaticMarkup(<Arquivo2TurnoHero nomes={{ [presidente.eleito.slug]: "Eleito Teste", [presidente.derrotado.slug]: "Derrotado Teste" }} />)

  it("abre com o fato e a fonte do TSE", () => {
    assert.match(html, /Eleito Teste eleito presidente/)
    // O hero é só do eleito: o derrotado não aparece.
    assert.doesNotMatch(html, /Derrotado Teste/)
    assert.ok(html.includes(presidente.fonte.url.replaceAll("&", "&amp;")))
    assert.match(html, /data-pf-home-hero="arquivo"/)
  })

  it("lista os governadores do 2º turno, com quem cada um venceu, e leva de volta ao projeto", () => {
    const governadores = resultado.disputas.filter((d) => d.cargo === "Governador").length
    assert.equal(html.match(/data-pf-arquivo-governador=/g)?.length ?? 0, governadores)
    assert.match(html, /href="\/"[^>]*>O projeto Puxa Ficha/)
    assert.doesNotMatch(html, /O que o Puxa Ficha reuniu/)
  })
})

describe("HomeArquivo2026, a home do projeto", () => {
  const n = getNumerosArquivo()
  const html = renderToStaticMarkup(<HomeArquivo2026 />)

  it("abre com o projeto, sem o resultado do 2º turno, e leva até ele", () => {
    assert.match(html, /data-pf-home-hero="arquivo"/)
    assert.match(html, new RegExp(`${diasEntre(n.operacao.registros_coleta.inicio, n.operacao.registros_coleta.fim)} dias puxando a ficha de ${n.dados.fichas.valor} candidatos`))
    assert.match(html, /Concebido, construído e mantido por Thiago Salvador, de março a outubro de 2026/)
    assert.doesNotMatch(html, /eleito presidente/)
    assert.match(html, /href="\/2o-turno"/)
  })

  it("mostra os números com fonte, os dois gráficos semanais e a linha do tempo inteira", () => {
    assert.match(html, /O que o Puxa Ficha reuniu/)
    assert.match(html, /data-pf-arquivo-grafico="grafico-noticias"/)
    assert.match(html, /data-pf-arquivo-grafico="grafico-mudancas"/)
    // Cada gráfico tem uma área de dica por semana e a tabela com as mesmas semanas.
    assert.equal(html.match(/<title>Semana de /g)?.length, n.serie_semanal.semanas.length * 2)
    for (const m of n.marcos) assert.ok(html.includes(m.titulo), m.titulo)
    assert.match(html, /De onde vêm estes números/)
  })

  it("lista as seções arquivadas, todas com link interno", () => {
    const secoes = html.match(/data-pf-arquivo-secoes[\s\S]*?<\/ul>/)?.[0] ?? ""
    for (const href of ["/2o-turno", "/1o-turno", "/comparar", "/quiz", "/dados-abertos"]) {
      assert.ok(secoes.includes(`href="${href}"`), href)
    }
  })
})

describe("metadados da home", () => {
  it("com o arquivo ligado o título e a descrição são os do arquivo", () => {
    const m = metadadosDaHome(true)
    assert.equal(m.title, "Puxa Ficha | Arquivo das eleições 2026")
    assert.match(m.description, /de março a outubro de 2026/)
  })
  it("sem o arquivo volta o título da campanha do 2º turno", () => {
    const m = metadadosDaHome(false)
    assert.equal(m.title, "Puxa Ficha | 2º turno das eleições 2026")
    assert.doesNotMatch(m.description, /Arquivo/)
  })
})

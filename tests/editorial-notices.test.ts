import test from "node:test"
import assert from "node:assert/strict"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { DataFreshnessNotice } from "../src/components/DataFreshnessNotice"
import { DataSourceNotice } from "../src/components/DataSourceNotice"
import type { SectionFreshnessInfo } from "../src/lib/types"

function makeFreshnessInfo(
  status: SectionFreshnessInfo["status"],
  message: string,
): SectionFreshnessInfo {
  return {
    key: "patrimonio",
    label: "Patrimônio",
    status,
    referenceDate: "2026-04-08",
    referenceYear: 2026,
    verifiedAt: "2026-04-08T12:00:00Z",
    sourceLabel: "TSE",
    message,
  }
}

test("DataFreshnessNotice mapeia status para tone e preserva data attrs", () => {
  const cases: Array<{
    status: SectionFreshnessInfo["status"]
    expectedTone: string
    expectedLabel: string
  }> = [
    { status: "current", expectedTone: "neutral", expectedLabel: "Verificação recente" },
    { status: "stale", expectedTone: "caution", expectedLabel: "Verificação desatualizada" },
    { status: "historical", expectedTone: "neutral", expectedLabel: "Último dado disponível" },
    { status: "missing", expectedTone: "neutral", expectedLabel: "Sem dado estruturado" },
    { status: "not_applicable", expectedTone: "neutral", expectedLabel: "Não se aplica" },
  ]

  for (const c of cases) {
    const html = renderToStaticMarkup(
      createElement(DataFreshnessNotice, {
        info: makeFreshnessInfo(c.status, `Mensagem ${c.status}`),
      }),
    )
    assert.ok(html.includes(`data-pf-freshness-status="${c.status}"`), `status attr for ${c.status}`)
    assert.ok(html.includes(`data-pf-notice-tone="${c.expectedTone}"`), `tone attr for ${c.status}`)
    assert.ok(html.includes(c.expectedLabel), `label text for ${c.status}`)
    assert.ok(html.includes(`Mensagem ${c.status}`), `message text for ${c.status}`)
  }
})

test("DataFreshnessNotice nomeia resultado inconclusivo sem reclassificar stale temporal", () => {
  const inconclusive = renderToStaticMarkup(
    createElement(DataFreshnessNotice, {
      info: makeFreshnessInfo("stale", "Resultado indeterminado no escopo consultado."),
    }),
  )
  const temporal = renderToStaticMarkup(
    createElement(DataFreshnessNotice, {
      info: makeFreshnessInfo("stale", "Verificação antiga aguardando atualização."),
    }),
  )

  assert.match(inconclusive, /Resultado inconclusivo/)
  assert.doesNotMatch(inconclusive, /Verificação desatualizada/)
  assert.match(temporal, /Verificação desatualizada/)
})

test("DataSourceNotice degradado usa NoticePanel de cautela", () => {
  const html = renderToStaticMarkup(
    createElement(DataSourceNotice, {
      status: "degraded",
      message: "Fonte externa indisponível nesta coleta.",
    }),
  )

  assert.ok(html.includes('data-pf-notice-tone="caution"'))
  assert.ok(html.includes("Fonte indisponível"))
  assert.ok(html.includes("Fonte externa indisponível nesta coleta."))
})

test("DataFreshnessNotice de não aplicabilidade exibe fonte, data e escopo", () => {
  const html = renderToStaticMarkup(
    createElement(DataFreshnessNotice, {
      info: {
        ...makeFreshnessInfo("not_applicable", "Não há mandato federal neste recorte."),
        sourceLabel: "Câmara dos Deputados; Senado Federal",
        scope: "candidato; acervo federal parlamentar",
        evidence_sources: ["camara", "senado"],
        source_urls: ["https://www.camara.leg.br/deputados/quem-sao", "https://www25.senado.leg.br/web/senadores/pesquisa"],
      },
    }),
  )
  assert.match(html, /Não há mandato federal neste recorte\./)
  assert.match(html, /Fonte: Câmara dos Deputados; Senado Federal\./)
  assert.match(html, /Verificado em 08\/04\/2026\./)
  assert.match(html, /Escopo: candidato; acervo federal parlamentar\./)
  assert.match(html, /Fonte 1/)
  assert.match(html, /Fonte 2/)
})

test("DataSourceNotice live não renderiza nada", () => {
  const html = renderToStaticMarkup(
    createElement(DataSourceNotice, {
      status: "live",
    }),
  )

  assert.equal(html, "")
})

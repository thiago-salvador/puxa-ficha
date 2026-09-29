import assert from "node:assert/strict"
import { test } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { AntesDeVotar } from "../src/components/AntesDeVotar"
import { INVALIDATED_GUIDE_FACT_IDS } from "../src/lib/guia-votacao-validation"
import {
  GUIDE_FACTS, UFS, TRE_URLS, getVotingHours, getGuideFactStatus,
  getGuideFacts, buildGuideColinhaHref, type SourceEvidence,
} from "../src/lib/guia-votacao"
import { parseColinhaState } from "../src/lib/colinha"
import {
  extractGuideExcerpt, guideDigest, guideEvidenceMatches, fetchGuideSource,
} from "../scripts/audit/conferir-guia-votacao"

test("27 UFs têm horários independentes e TRE correspondente", () => {
  assert.equal(UFS.length, 27)
  const behind = new Set(["AM", "MT", "MS", "RO", "RR"])
  for (const uf of UFS) {
    const hours = getVotingHours(uf)!
    const start = uf === "AC" ? 6 : behind.has(uf) ? 7 : 8
    assert.match(hours.label, new RegExp(`${start}h às ${start + 9}h`))
    assert.equal(TRE_URLS[uf], `https://www.tre-${uf.toLowerCase()}.jus.br/`)
    const link = new URL(buildGuideColinhaHref(uf.toLowerCase()), "https://puxaficha.com.br")
    assert.equal(parseColinhaState(link.searchParams).uf, uf)
    assert.equal(link.hash, "#antes-de-votar")
    assert.match(hours.sourceExcerptSha256, /^[a-f0-9]{64}$/)
  }
  assert.match(getVotingHours("AM")!.label, /6h às 15h/)
  assert.match(getVotingHours("PE")!.label, /Fernando de Noronha, 9h às 18h/)
  assert.equal(getVotingHours("XX"), null)
  assert.equal(getGuideFacts(null).length, GUIDE_FACTS.length)
  assert.equal(buildGuideColinhaHref("XX"), "/colinha#antes-de-votar")
})

test("relógio simulado vence no prazo e cada fato expira separadamente", context => {
  context.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-04T16:59:59-03:00").getTime() })
  const fact = GUIDE_FACTS[0]
  assert.equal(getGuideFactStatus(fact), "valid")
  assert.equal(getGuideFactStatus({ ...fact, reviewUntil: "2026-09-28T00:00:00Z" }), "expired")
  context.mock.timers.tick(1_000)
  assert.equal(getGuideFactStatus(fact), "expired")
  assert.equal(getGuideFactStatus({ ...fact, reviewUntil: "inválido" }), "expired")
})

test("mudança na norma invalida horas locais sem ocultar os documentos", () => {
  const invalidated = INVALIDATED_GUIDE_FACT_IDS as string[]
  const original = [...invalidated]
  try {
    invalidated.splice(0, invalidated.length, "legal-time-zones")
    const now = new Date("2026-09-29T15:00:00-03:00")
    assert.equal(getGuideFactStatus(getVotingHours("AC")!, now), "invalidated")
    assert.equal(getGuideFactStatus(GUIDE_FACTS.find(fact => fact.id === "documents")!, now), "valid")
  } finally { invalidated.splice(0, invalidated.length, ...original) }
})

test("HTML estático mostra a fonte e não publica fatos antes do relógio do cliente", () => {
  const html = renderToStaticMarkup(<AntesDeVotar uf="AC" />)
  assert.match(html, /Confira no TSE/)
  assert.doesNotMatch(html, /6h às 15h|4 de outubro de 2026/)
  assert.match(html, /referrerPolicy="no-referrer"/i)
  assert.match(html, /abre em nova aba/)
})

const evidence: SourceEvidence = {
  sourceUrl: "https://www.tse.jus.br/",
  sourceExcerpt: "Documentos Documento com foto.",
  sourceExcerptSha256: guideDigest("Documentos Documento com foto."),
  checkedAt: "2026-09-29", reviewUntil: "2026-10-04T20:00:00Z",
  extractStart: "Documentos", extractEnd: "Próxima seção", endExclusive: true,
}
const resource = (body: string, status = 200) => ({ body: Buffer.from(body), status, finalUrl: evidence.sourceUrl })

test("auditor extrai seção e detecta mudança, acréscimo, ausência e bloqueio", () => {
  const page = "<h3>Documentos</h3><p>Documento com foto.</p><h3>Próxima seção</h3>"
  assert.equal(extractGuideExcerpt(resource(page), evidence), evidence.sourceExcerpt)
  assert.equal(guideEvidenceMatches(resource(page), evidence), true)
  assert.equal(guideEvidenceMatches(resource(page.replace("com foto", "sem foto")), evidence), false)
  assert.equal(guideEvidenceMatches(resource(page.replace("<h3>Próxima", "<p>Nova regra.</p><h3>Próxima")), evidence), false)
  assert.throws(() => extractGuideExcerpt(resource("<h3>Outra seção</h3>"), evidence), /inicial ausente/)
  assert.throws(() => extractGuideExcerpt(resource("<h3>Documentos</h3>"), evidence), /final ausente/)
  assert.equal(guideEvidenceMatches(resource(page, 403), evidence), false)
})

test("transporte mantém domínio oficial ao recuperar bloqueio do www", async context => {
  const requested: string[] = []
  context.mock.method(globalThis, "fetch", async (url: string) => {
    requested.push(url)
    return new Response("Fonte oficial", { status: requested.length === 1 ? 403 : 200 })
  })
  const result = await fetchGuideSource("https://www.tse.jus.br/pagina")
  assert.equal(result.status, 200)
  assert.deepEqual(requested, ["https://www.tse.jus.br/pagina", "https://tse.jus.br/pagina"])
})

test("transporte rejeita redirecionamento externo e falha HTTP", async context => {
  context.mock.method(globalThis, "fetch", async () => {
    const response = new Response("Conteúdo", { status: 200 })
    Object.defineProperty(response, "url", { value: "https://example.com/" })
    return response
  })
  await assert.rejects(fetchGuideSource("https://www.tre-ac.jus.br/"), /outro domínio/)
  context.mock.restoreAll()
  context.mock.method(globalThis, "fetch", async () => new Response("Negado", { status: 403 }))
  await assert.rejects(fetchGuideSource("https://www.tre-ac.jus.br/"), /HTTP 403/)
})

import assert from "node:assert/strict"
import { test } from "node:test"
import { NextRequest } from "next/server"
import { createColinhaCardGetHandler } from "../src/app/api/colinha/card/route"
import { buildColinhaCard } from "../src/lib/colinha-card"
import type { ColinhaCandidate } from "../src/lib/colinha"

const candidate: ColinhaCandidate = {
  ano: 2026, sq_candidato: "101", uf: "SP", cargo: "deputado_federal",
  nome_urna: "Teste", numero_urna: "1234", partido_sigla: "ABC",
  situacao_registro: "DEFERIDO", foto_path: null,
}
const candidates: ColinhaCandidate[] = [
  candidate,
  { ...candidate, sq_candidato: "102", cargo: "deputado_estadual", nome_urna: "Estadual", numero_urna: "5678" },
  { ...candidate, sq_candidato: "103", cargo: "senador", nome_urna: "Senador 1", numero_urna: "111" },
  { ...candidate, sq_candidato: "104", cargo: "senador", nome_urna: "Senador 2", numero_urna: "222" },
  { ...candidate, sq_candidato: "105", cargo: "governador", nome_urna: "Governador", numero_urna: "33" },
  { ...candidate, sq_candidato: "106", cargo: "presidente", uf: "BR", nome_urna: "Presidente", numero_urna: "44" },
]
const deps = {
  rateLimiter: { check: () => ({ allowed: true, remaining: 1, resetAt: Date.now() + 1000 }), reset() {} },
  queryCandidates: async () => [candidate],
  buildCard: buildColinhaCard,
}

test("card rejeita UF inválida, SQ malformado e senador duplicado", async () => {
  const handler = createColinhaCardGetHandler(deps)
  for (const query of ["uf=XX&df=101", "uf=SP&df=abc", "uf=SP&s1=101&s2=101"]) {
    const response = await handler(new NextRequest(`https://puxaficha.com.br/api/colinha/card?format=feed&${query}`))
    assert.equal(response.status, 400, query)
  }
})

test("card retorna 429 quando o limiter recusa", async () => {
  const handler = createColinhaCardGetHandler({
    ...deps,
    rateLimiter: { check: () => ({ allowed: false, remaining: 0, resetAt: Date.now() + 10_000 }), reset() {} },
  })
  const response = await handler(new NextRequest("https://puxaficha.com.br/api/colinha/card?format=feed&uf=SP&df=101"))
  assert.equal(response.status, 429)
  assert.equal(response.headers.get("cache-control"), "no-store")
})

test("card de texto válido contém os seis slots", async () => {
  const handler = createColinhaCardGetHandler({ ...deps, queryCandidates: async () => candidates })
  const response = await handler(new NextRequest("https://puxaficha.com.br/api/colinha/card?format=text&uf=SP&df=101&de=102&s1=103&s2=104&g=105&p=106"))
  assert.equal(response.status, 200)
  assert.match(response.headers.get("content-type") ?? "", /text\/plain/)
  const body = await response.text()
  for (const label of ["Deputado federal", "Deputado estadual ou distrital", "Senador 1", "Senador 2", "Governador", "Presidente"]) {
    assert.match(body, new RegExp(label))
  }
})

test("card rejeita formato desconhecido", async () => {
  const handler = createColinhaCardGetHandler(deps)
  const response = await handler(new NextRequest("https://puxaficha.com.br/api/colinha/card?format=pdf&uf=SP&df=101"))
  assert.equal(response.status, 400)
})

test("card retorna 503 quando a fonte falha", async () => {
  const handler = createColinhaCardGetHandler({ ...deps, queryCandidates: async () => { throw new Error("database unavailable") } })
  const response = await handler(new NextRequest("https://puxaficha.com.br/api/colinha/card?format=text&uf=SP&df=101"))
  assert.equal(response.status, 503)
  assert.equal(response.headers.get("cache-control"), "no-store")
})

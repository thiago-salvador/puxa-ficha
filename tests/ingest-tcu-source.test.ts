import assert from "node:assert/strict"
import test from "node:test"

import { fetchTCUInabilitados } from "../scripts/lib/ingest-tcu"

test("TCU consulta inabilitados na Plataforma de Certidões por POST", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = []
  const fetchImpl: typeof fetch = async (url, init) => {
    requests.push({ url: String(url), init })
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  }

  assert.deepEqual(await fetchTCUInabilitados("00000000000", fetchImpl), [])
  assert.equal(requests.length, 1)
  const request = requests[0]
  assert.equal(
    request.url,
    "https://certidoes.apps.tcu.gov.br/api/publico/responsaveis-inabilitados",
  )
  assert.equal(request.init?.method, "POST")
  assert.deepEqual(JSON.parse(String(request.init?.body)), { cpf: "00000000000" })
})

test("TCU não converte payload inválido em lista vazia", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify({ erro: "indisponível" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })

  assert.equal(await fetchTCUInabilitados("00000000000", fetchImpl), null)
})

import assert from "node:assert/strict"
import { test } from "node:test"
import {
  analyzePublishedConsistency,
  probeAnonLeak,
  type PublishedRow,
} from "../src/lib/published-consistency"

function row(overrides: Partial<PublishedRow> = {}): PublishedRow {
  return {
    slug: "candidata",
    nome_urna: "Candidata",
    cargo_disputado: "Governador",
    estado: "SP",
    partido_sigla: "ABC",
    status: "candidato",
    situacao_candidatura: "aguardando julgamento",
    foto_url: "/foto.jpg",
    ...overrides,
  }
}

test("pedido de registro 2026 aguardando julgamento é estado público canônico", () => {
  const report = analyzePublishedConsistency([row()])
  assert.deepEqual(report.hard, [])
  assert.deepEqual(report.soft, [])
})

test("probe anon estrito reprova timeout parcial e não aceita evidência incompleta", async () => {
  const result = await probeAnonLeak("https://example.test", "anon-key", {
    timeoutMs: 1,
    fetchImpl: async (input) => {
      const path = new URL(String(input)).pathname
      if (path.endsWith("/candidatos")) throw new Error("socket timeout")
      return new Response(null, { status: 401 })
    },
  })
  assert.equal(result.length, 1)
  assert.match(result[0]!, /candidatos/)
  assert.match(result[0]!, /timeout\/erro parcial reprova/)
})

test("probe anon estrito não trata HTTP 500 como superfície verificada", async () => {
  const result = await probeAnonLeak("https://example.test", "anon-key", {
    fetchImpl: async () => new Response(null, { status: 500 }),
  })
  assert.equal(result.length, 9)
  assert.match(result[0]!, /HTTP 500 inesperado/)
})

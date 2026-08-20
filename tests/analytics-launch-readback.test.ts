import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { afterEach, beforeEach, describe, it } from "node:test"

// Mesmo padrao dos outros testes de rota: o store importa `server-only`, que
// lanca quando carregado direto no runner.
const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as never

const { createAnalyticsLaunchReadbackGetHandler } = require(
  "../src/app/api/internal/analytics-launch-readback/route",
) as typeof import("../src/app/api/internal/analytics-launch-readback/route")

const CINCO = [
  "Candidate Click",
  "Comparison Start",
  "Quiz Complete",
  "External Source Click",
  "Search Zero Results",
] as const

const TOKEN = "internal-secret-token-123456"
const URL_BASE = "https://puxaficha.com.br/api/internal/analytics-launch-readback"
const PROOF_VALIDO = "execucao-alta-entropia-01"

type EventName = (typeof CINCO)[number]

interface ReadbackEvento {
  eventName: EventName
  proofId: string | null
}

function emptyCounts(): Record<EventName, number> {
  return Object.fromEntries(CINCO.map((name) => [name, 0])) as Record<EventName, number>
}

function readerFromEvents(events: ReadbackEvento[]) {
  return async (input: { sinceIso: string; proofId: string }) => {
    const counts = emptyCounts()
    for (const event of events) {
      if (event.proofId === input.proofId) {
        counts[event.eventName] += 1
      }
    }
    return {
      counts,
      missing: CINCO.filter((name) => counts[name] <= 0),
    }
  }
}

function criarHandler(opcoes: {
  events?: ReadbackEvento[]
  reader?: (input: { sinceIso: string; proofId: string }) => Promise<{
    counts: Record<EventName, number>
    missing: EventName[]
  }>
} = {}) {
  const chamadas: Array<{ sinceIso: string; proofId: string }> = []
  const reader =
    opcoes.reader ??
    readerFromEvents(opcoes.events ?? [])

  const handler = createAnalyticsLaunchReadbackGetHandler({
    readAnalyticsLaunchCounts: async (input) => {
      chamadas.push({ sinceIso: input.sinceIso, proofId: input.proofId })
      return reader(input)
    },
  })

  return { handler, chamadas }
}

function requisicao(url: string, headers: Record<string, string> = {}) {
  return new Request(url, { method: "GET", headers })
}

function requisicaoAutenticada(query = "") {
  return requisicao(`${URL_BASE}${query}`, {
    "x-pf-revalidate-secret": TOKEN,
  })
}

describe("/api/internal/analytics-launch-readback exige proofId", () => {
  const envAnterior = process.env.PF_INTERNAL_TOKEN

  beforeEach(() => {
    process.env.PF_INTERNAL_TOKEN = TOKEN
  })

  afterEach(() => {
    if (envAnterior === undefined) {
      delete process.env.PF_INTERNAL_TOKEN
    } else {
      process.env.PF_INTERNAL_TOKEN = envAnterior
    }
  })

  it("sem proofId, com token valido: 400 missing_proof_id, sem ready: true, store nao chamado", async () => {
    const { handler, chamadas } = criarHandler()

    const resposta = await handler(requisicaoAutenticada())
    const corpo = await resposta.json()

    assert.equal(resposta.status, 400)
    assert.deepEqual(corpo, { ok: false, reason: "missing_proof_id" })
    assert.notEqual(corpo.ready, true)
    assert.deepEqual(chamadas, [])
  })

  it("proofId vazio: 400 missing_proof_id e store nao chamado", async () => {
    const { handler, chamadas } = criarHandler()

    const resposta = await handler(requisicaoAutenticada("?proofId="))
    const corpo = await resposta.json()

    assert.equal(resposta.status, 400)
    assert.deepEqual(corpo, { ok: false, reason: "missing_proof_id" })
    assert.notEqual(corpo.ready, true)
    assert.deepEqual(chamadas, [])
  })

  it("proofId invalido (ab): 400 invalid_proof_id e store nao chamado", async () => {
    const { handler, chamadas } = criarHandler()

    const resposta = await handler(requisicaoAutenticada("?proofId=ab"))
    const corpo = await resposta.json()

    assert.equal(resposta.status, 400)
    assert.equal(corpo.reason, "invalid_proof_id")
    assert.deepEqual(chamadas, [])
  })

  it("proofId valido chama o store com exatamente esse id e ready segue missing", async () => {
    const { handler, chamadas } = criarHandler({
      reader: async () => ({
        counts: emptyCounts(),
        missing: [...CINCO],
      }),
    })

    const resposta = await handler(requisicaoAutenticada(`?proofId=${PROOF_VALIDO}`))
    const corpo = await resposta.json()

    assert.equal(resposta.status, 200)
    assert.equal(chamadas.length, 1)
    assert.equal(chamadas[0].proofId, PROOF_VALIDO)
    assert.equal(corpo.ready, false)
    assert.deepEqual(corpo.missing, [...CINCO])
  })

  it("sem token: 401, como hoje", async () => {
    const { handler, chamadas } = criarHandler()

    const resposta = await handler(requisicao(URL_BASE))
    const corpo = await resposta.json()

    assert.equal(resposta.status, 401)
    assert.equal(corpo.ok, false)
    assert.deepEqual(chamadas, [])
  })
})

describe("isolamento: eventos organicos nao viram ready de outra execucao", () => {
  const envAnterior = process.env.PF_INTERNAL_TOKEN

  beforeEach(() => {
    process.env.PF_INTERNAL_TOKEN = TOKEN
  })

  afterEach(() => {
    if (envAnterior === undefined) {
      delete process.env.PF_INTERNAL_TOKEN
    } else {
      process.env.PF_INTERNAL_TOKEN = envAnterior
    }
  })

  const organicos: ReadbackEvento[] = CINCO.map((eventName) => ({
    eventName,
    proofId: null,
  }))

  it("sem proofId na query: 400 (nao conta a ultima hora)", async () => {
    const { handler, chamadas } = criarHandler({ events: organicos })

    const resposta = await handler(requisicaoAutenticada())
    const corpo = await resposta.json()

    assert.equal(resposta.status, 400)
    assert.equal(corpo.reason, "missing_proof_id")
    assert.deepEqual(chamadas, [])
  })

  it("cinco eventos organicos (proof_id null) + zero do id da execucao: ready false e missing com os cinco nomes", async () => {
    const { handler } = criarHandler({ events: organicos })

    const resposta = await handler(requisicaoAutenticada(`?proofId=${PROOF_VALIDO}`))
    const corpo = await resposta.json()

    assert.equal(resposta.status, 200)
    assert.equal(corpo.ready, false)
    assert.deepEqual(corpo.missing, [...CINCO])
  })

  it("os mesmos cinco nomes com proof_id igual a query: ready true e missing vazio", async () => {
    const daExecucao: ReadbackEvento[] = CINCO.map((eventName) => ({
      eventName,
      proofId: PROOF_VALIDO,
    }))
    const { handler } = criarHandler({ events: daExecucao })

    const resposta = await handler(requisicaoAutenticada(`?proofId=${PROOF_VALIDO}`))
    const corpo = await resposta.json()

    assert.equal(resposta.status, 200)
    assert.equal(corpo.ready, true)
    assert.deepEqual(corpo.missing, [])
  })
})

describe("contrato da prova de lancamento", () => {
  it("readProofIdFromUrl consulta so pf_analytics_proof", () => {
    const src = readFileSync("src/lib/analytics-client.ts", "utf8")
    assert.match(src, /function readProofIdFromUrl/)
    assert.match(src, /searchParams\.get\("pf_analytics_proof"\)/)
    assert.match(src, /openssl rand -hex 16/)
    assert.match(src, /não é gate de lançamento/)
  })

  it("a rota nao trata proofId como opcional e o GET documenta o contrato", () => {
    const src = readFileSync(
      "src/app/api/internal/analytics-launch-readback/route.ts",
      "utf8",
    )
    assert.match(src, /missing_proof_id/)
    assert.match(src, /openssl rand -hex 16/)
    assert.match(src, /não é gate de lançamento/)
    assert.match(src, /PF_INTERNAL_TOKEN/)
  })

  it("o select do store sempre filtra por proof_id e nao ha if (input.proofId)", () => {
    const src = readFileSync("src/lib/analytics-launch-store.ts", "utf8")
    assert.match(src, /\.eq\("proof_id"/)
    assert.doesNotMatch(src, /if \(input\.proofId\)/)
  })
})

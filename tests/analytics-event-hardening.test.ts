import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { beforeEach, describe, it } from "node:test"

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

const { createAnalyticsEventPostHandler } = require(
  "../src/app/api/analytics/event/route",
) as typeof import("../src/app/api/analytics/event/route")
const { hashTrustedClientIp } = require(
  "../src/lib/client-ip",
) as typeof import("../src/lib/client-ip")
const { ANALYTICS_LAUNCH_RETENTION_DAYS, analyticsLaunchRetentionCutoffIso } = require(
  "../src/lib/analytics-launch-store",
) as typeof import("../src/lib/analytics-launch-store")

type AnalyticsIpHashCount =
  | { status: "ok"; count: number }
  | { status: "coluna_ausente" }

const URL_ROTA = "https://puxaficha.com.br/api/analytics/event"
const IP = "203.0.113.42"
const AGORA = Date.parse("2026-08-03T12:00:00.000Z")

interface Gravado {
  eventName: string
  ipHash?: string | null
}

function criarHandler(opcoes: {
  contagem?: AnalyticsIpHashCount | (() => Promise<AnalyticsIpHashCount>)
  gravarLanca?: boolean
}) {
  const gravados: Gravado[] = []
  const consultas: Array<{ ipHash: string; sinceIso: string }> = []
  const limiteEmMemoria = { chamadas: 0 }

  const handler = createAnalyticsEventPostHandler({
    recordAnalyticsLaunchEvent: async (input) => {
      if (opcoes.gravarLanca) throw new Error("insert falhou")
      gravados.push({ eventName: input.eventName, ipHash: input.ipHash })
    },
    countRecentAnalyticsEventsByIpHash: async (ipHash, sinceIso) => {
      consultas.push({ ipHash, sinceIso })
      const contagem = opcoes.contagem ?? { status: "ok" as const, count: 0 }
      return typeof contagem === "function" ? contagem() : contagem
    },
    rateLimiter: {
      check: () => {
        limiteEmMemoria.chamadas += 1
        return { allowed: true, remaining: 119, resetAt: AGORA + 60_000 }
      },
      reset: () => {},
    },
    now: () => AGORA,
  })

  return { handler, gravados, consultas, limiteEmMemoria }
}

function requisicao(headers: Record<string, string>) {
  return new Request(URL_ROTA, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-vercel-forwarded-for": IP,
      ...headers,
    },
    body: JSON.stringify({ eventName: "Quiz Complete", payload: { surface: "quiz" } }),
  })
}

function requisicaoDoNavegador() {
  return requisicao({ origin: "https://puxaficha.com.br", "sec-fetch-site": "same-origin" })
}

describe("/api/analytics/event exige prova de mesma origem", () => {
  it("request sem Origin e recusada (era 200 ate 2026-08-03)", async () => {
    const { handler, gravados } = criarHandler({})

    const resposta = await handler(requisicao({}))

    assert.equal(resposta.status, 403)
    assert.equal(resposta.headers.get("x-pf-block-reason"), "csrf_origin_missing")
    assert.deepEqual(gravados, [], "nada pode ser gravado quando a origem nao foi provada")
  })

  it("request do proprio site continua passando", async () => {
    const { handler, gravados } = criarHandler({})

    const resposta = await handler(requisicaoDoNavegador())

    assert.equal(resposta.status, 200)
    assert.deepEqual(await resposta.json(), { ok: true })
    assert.equal(gravados.length, 1)
    assert.equal(gravados[0].eventName, "Quiz Complete")
  })

  it("origem de terceiro continua recusada", async () => {
    const { handler, gravados } = criarHandler({})

    const resposta = await handler(requisicao({ origin: "https://evil.example" }))

    assert.equal(resposta.status, 403)
    assert.equal(resposta.headers.get("x-pf-block-reason"), "csrf_origin_not_allowed")
    assert.deepEqual(gravados, [])
  })
})

describe("/api/analytics/event limita por camada duravel", () => {
  it("consulta a contagem por ip_hash na janela de 60s", async () => {
    const { handler, consultas } = criarHandler({})

    await handler(requisicaoDoNavegador())

    assert.equal(consultas.length, 1)
    assert.equal(consultas[0].ipHash, hashTrustedClientIp(new Headers({ "x-vercel-forwarded-for": IP }), "analytics-event"))
    assert.equal(consultas[0].sinceIso, new Date(AGORA - 60_000).toISOString())
  })

  it("estourou a janela na tabela vira 429 mesmo com o balde em memoria liberando", async () => {
    const { handler, gravados, limiteEmMemoria } = criarHandler({
      contagem: { status: "ok", count: 120 },
    })

    const resposta = await handler(requisicaoDoNavegador())

    assert.equal(resposta.status, 429)
    assert.equal(resposta.headers.get("retry-after"), "60")
    assert.deepEqual(await resposta.json(), { error: "Too many requests" })
    assert.deepEqual(gravados, [])
    assert.equal(limiteEmMemoria.chamadas, 1, "o pre-filtro em memoria roda antes e liberou")
  })

  it("abaixo do teto passa e grava o ip_hash junto do evento", async () => {
    const { handler, gravados } = criarHandler({ contagem: { status: "ok", count: 119 } })

    const resposta = await handler(requisicaoDoNavegador())

    assert.equal(resposta.status, 200)
    assert.equal(gravados.length, 1)
    assert.equal(
      gravados[0].ipHash,
      hashTrustedClientIp(new Headers({ "x-vercel-forwarded-for": IP }), "analytics-event"),
    )
  })

  it("falha da contagem fecha o portao em 503 sem gravar", async () => {
    const { handler, gravados } = criarHandler({
      contagem: async () => {
        throw new Error("connection reset by peer")
      },
    })

    const resposta = await handler(requisicaoDoNavegador())

    assert.equal(resposta.status, 503)
    assert.deepEqual(await resposta.json(), { ok: false, reason: "rate_limit_failed" })
    assert.deepEqual(gravados, [])
  })

  it("sem a coluna ainda (migration nao aplicada) o evento e gravado sem ip_hash", async () => {
    const { handler, gravados } = criarHandler({ contagem: { status: "coluna_ausente" } })

    const resposta = await handler(requisicaoDoNavegador())

    assert.equal(resposta.status, 200)
    assert.equal(gravados.length, 1)
    assert.equal(
      gravados[0].ipHash,
      null,
      "sem coluna, gravar o hash quebraria o insert e perderia o evento",
    )
  })

  it("falha ao gravar continua respondendo 503 store_failed", async () => {
    const { handler } = criarHandler({ gravarLanca: true })

    const resposta = await handler(requisicaoDoNavegador())

    assert.equal(resposta.status, 503)
    assert.deepEqual(await resposta.json(), { ok: false, reason: "store_failed" })
  })
})

describe("hashTrustedClientIp", () => {
  let headers: Headers

  beforeEach(() => {
    headers = new Headers({ "x-vercel-forwarded-for": IP })
  })

  it("nao carrega o IP em claro", () => {
    const hash = hashTrustedClientIp(headers, "analytics-event")

    assert.equal(hash.length, 48)
    assert.match(hash, /^[0-9a-f]{48}$/)
    assert.ok(!hash.includes(IP))
    assert.ok(!hash.includes("203"))
  })

  it("e estavel para o mesmo cliente e a mesma rota", () => {
    assert.equal(
      hashTrustedClientIp(headers, "analytics-event"),
      hashTrustedClientIp(new Headers({ "x-vercel-forwarded-for": IP }), "analytics-event"),
    )
  })

  it("separa baldes por namespace, para o mesmo visitante nao ser correlacionavel entre rotas", () => {
    assert.notEqual(
      hashTrustedClientIp(headers, "analytics-event"),
      hashTrustedClientIp(headers, "outra-rota"),
    )
  })

  it("IPs diferentes caem em baldes diferentes", () => {
    assert.notEqual(
      hashTrustedClientIp(headers, "analytics-event"),
      hashTrustedClientIp(new Headers({ "x-vercel-forwarded-for": "198.51.100.7" }), "analytics-event"),
    )
  })
})

describe("retencao de analytics_launch_events", () => {
  it("a janela e de 90 dias, a mesma declarada na politica de privacidade e no comentario da tabela", () => {
    // Se este numero mudar, a secao 06 de /privacidade e o COMMENT ON TABLE da
    // migration de retencao viram promessa falsa: os tres precisam andar juntos.
    assert.equal(ANALYTICS_LAUNCH_RETENTION_DAYS, 90)
  })

  it("o corte cai exatamente 90 dias antes do instante informado", () => {
    const agora = new Date("2026-08-04T12:00:00.000Z")

    assert.equal(analyticsLaunchRetentionCutoffIso(agora), "2026-05-06T12:00:00.000Z")
  })
})

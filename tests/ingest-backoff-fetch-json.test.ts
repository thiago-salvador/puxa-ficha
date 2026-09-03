import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"

import { fetchJSON, proximaEsperaMs, type FetchRelogio } from "../scripts/lib/helpers"

/**
 * A escada de espera de `fetchJSON` existe para atravessar queda de minutos na
 * origem federal (`fetch failed` do undici, sem status HTTP). Os testes rodam a
 * escada inteira com relogio falso: esperar os 23s reais em suite nao e opcao.
 */

const fetchOriginal = globalThis.fetch

afterEach(() => {
  globalThis.fetch = fetchOriginal
})

function relogioFalso(): FetchRelogio & { esperas: number[]; avancar: (ms: number) => void } {
  let agora = 0
  const esperas: number[] = []
  return {
    esperas,
    now: () => agora,
    avancar: (ms: number) => {
      agora += ms
    },
    sleep: async (ms: number) => {
      esperas.push(ms)
      agora += ms
    },
    // Jitter neutro: 0.5 devolve a base exata da escada.
    random: () => 0.5,
  }
}

function erroDeRede(): Error {
  return new TypeError("fetch failed")
}

function respostaJson(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  })
}

describe("proximaEsperaMs", () => {
  it("segue a escada 2s, 6s, 15s, 30s e repete o teto", () => {
    const semJitter = () => 0.5
    assert.equal(proximaEsperaMs(0, semJitter), 2_000)
    assert.equal(proximaEsperaMs(1, semJitter), 6_000)
    assert.equal(proximaEsperaMs(2, semJitter), 15_000)
    assert.equal(proximaEsperaMs(3, semJitter), 30_000)
    assert.equal(proximaEsperaMs(9, semJitter), 30_000)
  })

  it("aplica jitter de +-25% em torno da base", () => {
    assert.equal(proximaEsperaMs(0, () => 0), 1_500)
    assert.equal(proximaEsperaMs(0, () => 1), 2_500)
  })
})

describe("fetchJSON: backoff em erro de rede", () => {
  it("percorre a escada inteira antes de desistir", async () => {
    const relogio = relogioFalso()
    let chamadas = 0
    globalThis.fetch = async () => {
      chamadas++
      throw erroDeRede()
    }

    await assert.rejects(
      fetchJSON("https://origem.test/x", undefined, 4, 15_000, { relogio }),
      /fetch failed/,
    )
    assert.equal(chamadas, 4)
    assert.deepEqual(relogio.esperas, [2_000, 6_000, 15_000])
  })

  it("volta ao verde quando a origem responde numa tentativa seguinte", async () => {
    const relogio = relogioFalso()
    let chamadas = 0
    globalThis.fetch = async () => {
      chamadas++
      if (chamadas < 3) throw erroDeRede()
      return respostaJson(200, { ok: true })
    }

    const dados = await fetchJSON<{ ok: boolean }>("https://origem.test/x", undefined, 4, 15_000, {
      relogio,
    })
    assert.deepEqual(dados, { ok: true })
    assert.equal(chamadas, 3)
    assert.deepEqual(relogio.esperas, [2_000, 6_000])
  })

  it("nao espera quando ha sucesso na primeira tentativa", async () => {
    const relogio = relogioFalso()
    globalThis.fetch = async () => respostaJson(200, { ok: true })

    await fetchJSON("https://origem.test/x", undefined, 4, 15_000, { relogio })
    assert.deepEqual(relogio.esperas, [])
  })
})

describe("fetchJSON: desistencia por orcamento", () => {
  it("nao dorme alem do orcamento restante e devolve o erro corrente", async () => {
    const relogio = relogioFalso()
    let chamadas = 0
    globalThis.fetch = async () => {
      chamadas++
      // Cada tentativa consome os 15s do prazo antes de estourar.
      relogio.avancar(15_000)
      throw erroDeRede()
    }

    // Orcamento default = retries * timeoutMs = 60s. Depois da terceira
    // tentativa ja se passaram 53s e a espera de 15s nao cabe: desiste ali.
    await assert.rejects(
      fetchJSON("https://origem.test/x", undefined, 4, 15_000, { relogio }),
      /fetch failed/,
    )
    assert.equal(chamadas, 3)
    assert.deepEqual(relogio.esperas, [2_000, 6_000])
    assert.ok(relogio.now() <= 60_000, `gastou ${relogio.now()}ms, acima do orcamento de 60s`)
  })

  it("respeita um orcamento menor passado pelo chamador", async () => {
    const relogio = relogioFalso()
    let chamadas = 0
    globalThis.fetch = async () => {
      chamadas++
      throw erroDeRede()
    }

    await assert.rejects(
      fetchJSON("https://origem.test/x", undefined, 4, 15_000, { relogio, budgetMs: 5_000 }),
      /fetch failed/,
    )
    // 2s cabe nos 5s; os 6s seguintes nao.
    assert.equal(chamadas, 2)
    assert.deepEqual(relogio.esperas, [2_000])
  })
})

describe("fetchJSON: classificacao de status", () => {
  it("mantem Retry-After no 429", async () => {
    const relogio = relogioFalso()
    let chamadas = 0
    globalThis.fetch = async () => {
      chamadas++
      if (chamadas === 1) return respostaJson(429, {}, { "retry-after": "3" })
      return respostaJson(200, { ok: true })
    }

    await fetchJSON("https://origem.test/x", undefined, 4, 15_000, { relogio })
    assert.deepEqual(relogio.esperas, [3_000])
  })

  it("repete 5xx com a mesma escada", async () => {
    const relogio = relogioFalso()
    let chamadas = 0
    globalThis.fetch = async () => {
      chamadas++
      if (chamadas < 2) return respostaJson(503, {})
      return respostaJson(200, { ok: true })
    }

    await fetchJSON("https://origem.test/x", undefined, 4, 15_000, { relogio })
    assert.deepEqual(relogio.esperas, [2_000])
  })

  it("falha rapido em 4xx determinista, sem gastar a escada", async () => {
    const relogio = relogioFalso()
    let chamadas = 0
    globalThis.fetch = async () => {
      chamadas++
      return respostaJson(404, {})
    }

    await assert.rejects(
      fetchJSON("https://origem.test/x", undefined, 4, 15_000, { relogio }),
      /HTTP 404/,
    )
    assert.equal(chamadas, 1)
    assert.deepEqual(relogio.esperas, [])
  })

  it("preserva a mensagem de timeout do AbortError", async () => {
    const relogio = relogioFalso()
    globalThis.fetch = async () => {
      const err = new Error("aborted")
      err.name = "AbortError"
      throw err
    }

    await assert.rejects(
      fetchJSON("https://origem.test/x", undefined, 2, 15_000, { relogio }),
      /Timeout \(15000ms\): https:\/\/origem\.test\/x/,
    )
  })
})

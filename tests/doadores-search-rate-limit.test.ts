import assert from "node:assert/strict"
import test from "node:test"
import {
  DOADORES_SEARCH_RATE_LIMIT_MAX,
  DOADORES_SEARCH_RATE_LIMIT_WINDOW_MS,
  doadoresSearchRateLimiter,
  retryAfterSeconds,
} from "../src/lib/doadores-search-rate-limit"

function headersComIp(ip: string): Pick<Headers, "get"> {
  return {
    get: (name: string) => (name.toLowerCase() === "x-vercel-forwarded-for" ? ip : null),
  }
}

test("permite até o teto na janela e recusa a partir dele", async () => {
  doadoresSearchRateLimiter.reset()
  const agora = 1_000_000
  for (let i = 0; i < DOADORES_SEARCH_RATE_LIMIT_MAX; i++) {
    const decisao = await doadoresSearchRateLimiter.check(headersComIp("203.0.113.7"), agora)
    assert.equal(decisao.allowed, true, `busca ${i + 1} deveria passar`)
  }
  const recusa = await doadoresSearchRateLimiter.check(headersComIp("203.0.113.7"), agora)
  assert.equal(recusa.allowed, false)
  assert.equal(recusa.remaining, 0)
})

test("IPs distintos não dividem o mesmo balde", async () => {
  doadoresSearchRateLimiter.reset()
  const agora = 1_000_000
  for (let i = 0; i < DOADORES_SEARCH_RATE_LIMIT_MAX; i++) {
    await doadoresSearchRateLimiter.check(headersComIp("203.0.113.7"), agora)
  }
  const outroIp = await doadoresSearchRateLimiter.check(headersComIp("198.51.100.9"), agora)
  assert.equal(outroIp.allowed, true)
})

test("janela expira e libera de novo", async () => {
  doadoresSearchRateLimiter.reset()
  const agora = 1_000_000
  for (let i = 0; i < DOADORES_SEARCH_RATE_LIMIT_MAX; i++) {
    await doadoresSearchRateLimiter.check(headersComIp("203.0.113.7"), agora)
  }
  const depoisDaJanela = agora + DOADORES_SEARCH_RATE_LIMIT_WINDOW_MS + 1
  const liberada = await doadoresSearchRateLimiter.check(headersComIp("203.0.113.7"), depoisDaJanela)
  assert.equal(liberada.allowed, true)
})

test("retryAfterSeconds arredonda para cima e nunca devolve zero", () => {
  assert.equal(retryAfterSeconds({ allowed: false, remaining: 0, resetAt: 1_500 }, 1_000), 1
  )
  assert.equal(retryAfterSeconds({ allowed: false, remaining: 0, resetAt: 61_000 }, 1_000), 60)
  assert.equal(retryAfterSeconds({ allowed: false, remaining: 0, resetAt: 900 }, 1_000), 1)
})

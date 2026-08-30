import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { createFixedWindowIpRateLimiter } from "../src/lib/request-rate-limit"

function headersDe(ip: string) {
  return new Headers({ "x-forwarded-for": ip })
}

/**
 * O `check()` varria o Map inteiro em toda chamada, o que fazia o custo por
 * request crescer com o numero de IPs distintos na janela. A varredura passou a
 * rodar so acima de um teto de buckets. Estes testes travam o contrato
 * observavel, que e o que nao pode mudar com essa troca.
 */
describe("createFixedWindowIpRateLimiter", () => {
  it("conta por IP e bloqueia no limite", () => {
    const limiter = createFixedWindowIpRateLimiter({ namespace: "t1", max: 3, windowMs: 1000 })
    const t0 = 1_000_000
    assert.deepEqual(limiter.check(headersDe("1.1.1.1"), t0).allowed, true)
    assert.deepEqual(limiter.check(headersDe("1.1.1.1"), t0).allowed, true)
    assert.deepEqual(limiter.check(headersDe("1.1.1.1"), t0).allowed, true)
    assert.deepEqual(limiter.check(headersDe("1.1.1.1"), t0).allowed, false)
    // Outro IP tem balde proprio.
    assert.deepEqual(limiter.check(headersDe("2.2.2.2"), t0).allowed, true)
  })

  it("libera de novo depois da janela, mesmo sem varrer o Map", () => {
    const limiter = createFixedWindowIpRateLimiter({ namespace: "t2", max: 1, windowMs: 1000 })
    const t0 = 2_000_000
    assert.equal(limiter.check(headersDe("3.3.3.3"), t0).allowed, true)
    assert.equal(limiter.check(headersDe("3.3.3.3"), t0 + 999).allowed, false)
    const depois = limiter.check(headersDe("3.3.3.3"), t0 + 1001)
    assert.equal(depois.allowed, true, "bucket expirado tem que ser ignorado")
    assert.equal(depois.resetAt, t0 + 1001 + 1000)
  })

  it("mantém remaining e resetAt coerentes", () => {
    const limiter = createFixedWindowIpRateLimiter({ namespace: "t3", max: 2, windowMs: 500 })
    const t0 = 3_000_000
    const a = limiter.check(headersDe("4.4.4.4"), t0)
    assert.deepEqual({ allowed: a.allowed, remaining: a.remaining, resetAt: a.resetAt }, {
      allowed: true,
      remaining: 1,
      resetAt: t0 + 500,
    })
    const b = limiter.check(headersDe("4.4.4.4"), t0 + 10)
    assert.equal(b.remaining, 0)
    assert.equal(b.resetAt, t0 + 500)
    const c = limiter.check(headersDe("4.4.4.4"), t0 + 20)
    assert.equal(c.allowed, false)
    assert.equal(c.remaining, 0)
  })

  it("aguenta milhares de IPs distintos sem mudar de comportamento", () => {
    const podas: number[] = []
    const limiter = createFixedWindowIpRateLimiter({
      namespace: "t4",
      max: 1,
      windowMs: 1000,
      onPrune: (visitedBuckets) => podas.push(visitedBuckets),
    })
    const t0 = 4_000_000
    for (let i = 0; i < 12_000; i += 1) {
      const ip = `10.${(i >> 16) & 0xff}.${(i >> 8) & 0xff}.${i & 0xff}`
      assert.equal(limiter.check(headersDe(ip), t0).allowed, true)
    }
    assert.equal(podas.length, 1, "a rajada acima do teto nao pode provocar uma poda por request")
    assert.ok(podas[0] > 10_000, "a primeira poda precisa inspecionar os buckets existentes")
    limiter.check(headersDe("192.0.2.1"), t0 + 999)
    assert.equal(podas.length, 1, "nao pode repetir a varredura dentro da mesma janela")
    // Depois da janela, um IP qualquer do lote volta a ser aceito.
    assert.equal(limiter.check(headersDe("10.0.0.1"), t0 + 2000).allowed, true)
    assert.equal(podas.length, 2, "a janela seguinte pode remover os buckets expirados")
    // E dentro da janela o mesmo IP continua bloqueado.
    assert.equal(limiter.check(headersDe("10.0.0.1"), t0 + 2001).allowed, false)
  })

  it("reset() zera tudo", () => {
    const limiter = createFixedWindowIpRateLimiter({ namespace: "t5", max: 1, windowMs: 1000 })
    const t0 = 5_000_000
    assert.equal(limiter.check(headersDe("5.5.5.5"), t0).allowed, true)
    assert.equal(limiter.check(headersDe("5.5.5.5"), t0).allowed, false)
    limiter.reset()
    assert.equal(limiter.check(headersDe("5.5.5.5"), t0).allowed, true)
  })

  it("configuração inválida falha alto", () => {
    const limiter = createFixedWindowIpRateLimiter({ namespace: "t6", max: 0, windowMs: 1000 })
    assert.throws(() => limiter.check(headersDe("6.6.6.6")), /Invalid rate limit configuration/)
  })
})

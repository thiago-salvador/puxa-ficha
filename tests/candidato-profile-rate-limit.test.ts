import assert from "node:assert/strict"
import test from "node:test"
import { createFixedWindowIpRateLimiter, rateLimitExceededResponse } from "@/lib/request-rate-limit"

/**
 * As tres rotas publicas de leitura de ficha ganharam rate limit em 18/08/2026,
 * vespera do lancamento. Antes disso nao havia nenhum.
 *
 * O que a auditoria daquele dia mediu, e que decidiu quais rotas tratar:
 * `/api/candidato-slugs` (revalidate 300) e `/api/search-index` voltam da CDN
 * com `x-vercel-cache: HIT` e nao geram invocacao de funcao por request. Ja
 * `/api/candidato-profile/[slug]` e as duas filhas sao `force-dynamic`, entao
 * cada request bate na funcao. Com 207 fichas publicadas, varrer a base inteira
 * custava 207 invocacoes, sem nada segurando a repeticao em loop.
 *
 * O objetivo nao e esconder dado. O conteudo e publico por projeto e existe para
 * ser lido. O que se protege e conta e disponibilidade no dia de maior trafego,
 * e por isso o teto e alto o suficiente para nunca encostar em leitor real.
 */

const cab = (ip: string): Pick<Headers, "get"> =>
  new Headers({ "x-forwarded-for": ip, "x-vercel-forwarded-for": ip })

test("o teto nao encosta em navegacao humana rapida", () => {
  const lim = createFixedWindowIpRateLimiter({ namespace: "t1", max: 100, windowMs: 60_000 })
  // 60 fichas em um minuto e mais do que um leitor abre clicando depressa.
  for (let i = 0; i < 60; i++) {
    assert.equal(lim.check(cab("203.0.113.10"), 1_000).allowed, true, `parou na ${i + 1}`)
  }
})

test("varredura em loop e barrada ao passar do teto", () => {
  const lim = createFixedWindowIpRateLimiter({ namespace: "t2", max: 100, windowMs: 60_000 })
  for (let i = 0; i < 100; i++) lim.check(cab("203.0.113.11"), 1_000)
  const d = lim.check(cab("203.0.113.11"), 1_000)
  assert.equal(d.allowed, false)
  assert.equal(d.remaining, 0)
})

test("um IP barrado nao derruba os outros", () => {
  const lim = createFixedWindowIpRateLimiter({ namespace: "t3", max: 100, windowMs: 60_000 })
  for (let i = 0; i < 101; i++) lim.check(cab("203.0.113.12"), 1_000)
  assert.equal(lim.check(cab("203.0.113.12"), 1_000).allowed, false)
  assert.equal(lim.check(cab("198.51.100.7"), 1_000).allowed, true)
})

test("a janela reabre depois de um minuto", () => {
  const lim = createFixedWindowIpRateLimiter({ namespace: "t4", max: 100, windowMs: 60_000 })
  for (let i = 0; i < 101; i++) lim.check(cab("203.0.113.13"), 1_000)
  assert.equal(lim.check(cab("203.0.113.13"), 1_000).allowed, false)
  assert.equal(lim.check(cab("203.0.113.13"), 62_000).allowed, true)
})

test("a resposta de recusa diz quando tentar de novo e nao vai para cache", () => {
  const lim = createFixedWindowIpRateLimiter({ namespace: "t5", max: 1, windowMs: 60_000 })
  lim.check(cab("203.0.113.14"), 1_000)
  const d = lim.check(cab("203.0.113.14"), 1_000)
  const r = rateLimitExceededResponse(d, 1_000)
  assert.equal(r.status, 429)
  // Sem retry-after o cliente legitimo fica no escuro, e sem no-store a CDN
  // poderia servir o 429 para quem nunca estourou o limite.
  assert.equal(r.headers.get("retry-after"), "60")
  assert.equal(r.headers.get("cache-control"), "no-store")
})

test("as tres rotas de leitura de ficha declaram limitador", async () => {
  const { readFile } = await import("node:fs/promises")
  const rotas = [
    "src/app/api/candidato-profile/[slug]/route.ts",
    "src/app/api/candidato-profile/[slug]/projetos-lei/route.ts",
    "src/app/api/candidato-profile/[slug]/legislacao-executivo/route.ts",
  ]
  for (const r of rotas) {
    const txt = await readFile(new URL(`../${r}`, import.meta.url), "utf8")
    assert.match(txt, /createFixedWindowIpRateLimiter/, `${r} sem limitador`)
    assert.match(txt, /rateLimitExceededResponse\(decisao\)/, `${r} nao recusa`)
    // A checagem tem que vir ANTES do trabalho caro, senao limita depois de pagar.
    const posCheck = txt.indexOf(".check(request.headers)")
    const posAwait = txt.indexOf("await getCandidato") >= 0
      ? txt.indexOf("await getCandidato")
      : txt.indexOf("await get")
    assert.ok(posCheck > 0 && posCheck < posAwait, `${r} checa depois da consulta`)
  }
})

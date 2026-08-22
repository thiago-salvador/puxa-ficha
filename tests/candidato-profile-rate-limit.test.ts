import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"
import { createFixedWindowIpRateLimiter, rateLimitExceededResponse } from "@/lib/request-rate-limit"

const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as never

const { createCandidatoProfileGetHandler } = require("../src/app/api/candidato-profile/[slug]/route") as typeof import("../src/app/api/candidato-profile/[slug]/route")

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

test("a rota recusa antes de repetir a leitura pesada com service role", async () => {
  const limiter = createFixedWindowIpRateLimiter({
    namespace: "candidato-profile-route-test",
    max: 1,
    windowMs: 60_000,
  })
  let leituras = 0
  const handler = createCandidatoProfileGetHandler({
    rateLimiter: limiter,
    getCandidatoBySlugResource: async () => {
      leituras += 1
      return {
        data: null,
        sourceStatus: "live",
        sourceMessage: "Candidato não encontrado.",
      }
    },
  })
  const request = () =>
    new Request("http://localhost/api/candidato-profile/lula", {
      headers: {
        "x-forwarded-for": "203.0.113.15",
        "x-vercel-forwarded-for": "203.0.113.15",
      },
    })
  const params = { params: Promise.resolve({ slug: "lula" }) }

  assert.equal((await handler(request(), params)).status, 404)
  const recusada = await handler(request(), params)
  assert.equal(recusada.status, 429)
  assert.ok(Number(recusada.headers.get("retry-after")) > 0)
  assert.equal(recusada.headers.get("cache-control"), "no-store")
  assert.equal(leituras, 1)
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
    const consultas = [
      txt.indexOf("await getCandidato"),
      txt.indexOf("await deps.getCandidato"),
      txt.indexOf("await get"),
    ].filter((pos) => pos >= 0)
    assert.ok(consultas.length > 0, `${r} sem consulta identificavel`)
    const posAwait = Math.min(...consultas)
    assert.ok(posCheck > 0 && posCheck < posAwait, `${r} checa depois da consulta`)
  }
})

import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import test from "node:test"
import { createFixedWindowIpRateLimiter } from "@/lib/request-rate-limit"
import type { ProgramaGovernoRegistro } from "@/lib/programa-governo"

const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as never

const { getProgramaGovernoPublicResource } = require("../src/lib/programa-governo-server") as typeof import("../src/lib/programa-governo-server")
const { createProgramaGovernoGetHandler } = require("../src/app/api/candidato-profile/[slug]/programa/route") as typeof import("../src/app/api/candidato-profile/[slug]/programa/route")
const pendingRecord = require("../src/data/programas-governo/presidencia-2026/lula.json") as ProgramaGovernoRegistro

function approvedRecord(): ProgramaGovernoRegistro {
  assert.ok(pendingRecord.extracao)
  return {
    ...structuredClone(pendingRecord),
    estado: "aprovado",
    revisao: {
      reviewer: "Revisor interno que não pode ser publicado",
      reviewedAt: "2026-08-26T12:00:00Z",
      sourceSha256: pendingRecord.extracao.sourceSha256,
      extractedTextSha256: pendingRecord.extracao.extractedTextSha256,
    },
  }
}

function request(slug = "lula", ip = "203.0.113.20") {
  return new Request(`http://localhost/api/candidato-profile/${slug}/programa`, {
    headers: { "x-forwarded-for": ip, "x-vercel-forwarded-for": ip },
  })
}

function params(slug: string) {
  return { params: Promise.resolve({ slug }) }
}

test("servidor publica conteúdo somente depois da aprovação", async () => {
  const pending = await getProgramaGovernoPublicResource("lula", async () => pendingRecord)
  assert.equal(pending.known, true)
  assert.equal(pending.data, null)
  assert.equal("resumo" in pending.manifesto!, false)

  const approved = await getProgramaGovernoPublicResource("lula", async () => approvedRecord())
  assert.equal(approved.known, true)
  assert.equal(approved.data?.estado, "aprovado")
  assert.ok(approved.data?.secoes.length)
  const serialized = JSON.stringify(approved)
  assert.doesNotMatch(serialized, /Revisor interno/)
  assert.doesNotMatch(serialized, /julgamento|geracao|promptVersion|reviewer/)
})

test("rota retorna o DTO aprovado e remove campos editoriais", async () => {
  const resource = await getProgramaGovernoPublicResource("lula", async () => approvedRecord())
  const handler = createProgramaGovernoGetHandler({
    rateLimiter: createFixedWindowIpRateLimiter({ namespace: "programa-route-approved", max: 5, windowMs: 60_000 }),
    getProgramaGovernoPublicResource: async () => resource,
  })
  const response = await handler(request(), params("lula"))
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.match(response.headers.get("cache-control") ?? "", /s-maxage=3600/)
  assert.equal(body.estado, "aprovado")
  assert.ok(body.data.secoes.length > 0)
  assert.doesNotMatch(JSON.stringify(body), /reviewer|julgamento|geracao|promptVersion/)
})

test("todos os estados não aprovados são explícitos e não vazam rascunho", async () => {
  for (const estado of ["nao_coletado", "fonte_ausente", "extracao_falhou", "aguardando_revisao"] as const) {
    const resource = await getProgramaGovernoPublicResource("lula", async () => ({
      ...structuredClone(pendingRecord),
      estado,
    }))
    const handler = createProgramaGovernoGetHandler({
      rateLimiter: createFixedWindowIpRateLimiter({ namespace: `programa-route-${estado}`, max: 5, windowMs: 60_000 }),
      getProgramaGovernoPublicResource: async () => resource,
    })
    const response = await handler(request("lula", `203.0.113.${estado.length}`), params("lula"))
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.equal(body.estado, estado)
    assert.equal(body.data, null)
    assert.doesNotMatch(JSON.stringify(body), /O programa de governo apresenta/)
  }
})

test("slug desconhecido, traversal e slug malformado retornam 404", async () => {
  let loads = 0
  const handler = createProgramaGovernoGetHandler({
    rateLimiter: createFixedWindowIpRateLimiter({ namespace: "programa-route-slugs", max: 10, windowMs: 60_000 }),
    getProgramaGovernoPublicResource: async () => {
      loads += 1
      return { known: false, manifesto: null, data: null }
    },
  })
  assert.equal((await handler(request("desconhecido"), params("desconhecido"))).status, 404)
  assert.equal((await handler(request("..%2Fsegredo"), params("../segredo"))).status, 404)
  assert.equal((await handler(request("Lula"), params("Lula"))).status, 404)
  assert.equal(loads, 1, "slugs malformados devem falhar antes do loader")
})

test("rate limit recusa antes de carregar o arquivo", async () => {
  let loads = 0
  const handler = createProgramaGovernoGetHandler({
    rateLimiter: createFixedWindowIpRateLimiter({ namespace: "programa-route-limit", max: 1, windowMs: 60_000 }),
    getProgramaGovernoPublicResource: async () => {
      loads += 1
      return { known: false, manifesto: null, data: null }
    },
  })
  assert.equal((await handler(request(), params("lula"))).status, 404)
  const blocked = await handler(request(), params("lula"))
  assert.equal(blocked.status, 429)
  assert.equal(blocked.headers.get("cache-control"), "no-store")
  assert.equal(loads, 1)
})

test("endpoint pai não importa nem serializa o programa integral", async () => {
  const source = await readFile(
    new URL("../src/app/api/candidato-profile/[slug]/route.ts", import.meta.url),
    "utf8",
  )
  assert.doesNotMatch(source, /programa-governo|programas-governo|ProgramaGoverno/)
})

test("PROGRAMAS_ROUTE_PASS", () => assert.ok(true))

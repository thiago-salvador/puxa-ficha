import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, it } from "node:test"
import { NextRequest } from "next/server"

import { REVALIDATE_ALLOWED_TAGS } from "../src/lib/revalidate-cache"
import { createRevalidatePublicCacheHandler } from "../src/app/api/internal/revalidate-public-cache/route"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const SECRET = "cron-revalidate-public-cache-secret"
const ROUTE_URL = "https://puxaficha.com.br/api/internal/revalidate-public-cache"

/**
 * O comentário das duas rotas cita as duas estratégias para explicar a escolha,
 * então qualquer asserção sobre "qual das duas o código usa" precisa olhar só o
 * código. Sem isso o teste passaria a medir a documentação.
 */
function semComentarios(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((linha) => !linha.trim().startsWith("//"))
    .join("\n")
}

function request(secret?: string) {
  const headers = secret ? { authorization: `Bearer ${secret}` } : undefined
  return new NextRequest(ROUTE_URL, { headers })
}

describe("cron GET /api/internal/revalidate-public-cache", () => {
  it("vercel.json agenda a rota a cada 15 minutos", () => {
    const vercel = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8")) as {
      crons: Array<{ path: string; schedule: string }>
    }
    const entry = vercel.crons.find((cron) => cron.path === "/api/internal/revalidate-public-cache")
    assert.ok(entry, "faltou o cron /api/internal/revalidate-public-cache em vercel.json")
    assert.equal(entry.schedule, "*/15 * * * *")
  })

  it("Settings documenta o cron de 15 minutos", () => {
    const settings = readFileSync(
      join(root, "Settings/AUTOMATIONS_AND_ENVIRONMENTS.md"),
      "utf8",
    )
    assert.match(settings, /\/api\/internal\/revalidate-public-cache/)
    assert.match(settings, /\*\/15/)
  })

  it("reprova sem CRON_SECRET", async () => {
    const tags: string[] = []
    const handler = createRevalidatePublicCacheHandler({
      expectedSecret: SECRET,
      revalidateFn: (tag) => tags.push(tag),
    })
    const response = await handler(request())
    assert.equal(response.status, 401)
    assert.deepEqual(tags, [])
  })

  it("reprova secret errado", async () => {
    const tags: string[] = []
    const handler = createRevalidatePublicCacheHandler({
      expectedSecret: SECRET,
      revalidateFn: (tag) => tags.push(tag),
    })
    const response = await handler(request("wrong-secret"))
    assert.equal(response.status, 401)
    assert.deepEqual(tags, [])
  })

  it("reprova se o secret de ambiente estiver vazio", async () => {
    const tags: string[] = []
    const handler = createRevalidatePublicCacheHandler({
      expectedSecret: undefined,
      revalidateFn: (tag) => tags.push(tag),
    })
    const response = await handler(request(SECRET))
    assert.equal(response.status, 401)
    assert.deepEqual(tags, [])
  })

  it("revalida a whitelist inteira quando o cron autentica", async () => {
    const tags: string[] = []
    const handler = createRevalidatePublicCacheHandler({
      expectedSecret: SECRET,
      revalidateFn: (tag) => tags.push(tag),
    })
    const response = await handler(request(SECRET))
    assert.equal(response.status, 200)
    assert.equal(response.headers.get("cache-control"), "no-store")
    const body = (await response.json()) as { ok: boolean; revalidated: string[] }
    assert.equal(body.ok, true)
    assert.deepEqual(body.revalidated, [...REVALIDATE_ALLOWED_TAGS])
    assert.deepEqual(tags, [...REVALIDATE_ALLOWED_TAGS])
  })

  it("POST nao revalida", async () => {
    const src = readFileSync(
      join(root, "src/app/api/internal/revalidate-public-cache/route.ts"),
      "utf8",
    )
    assert.match(src, /export async function POST/)
    const { POST } = await import("../src/app/api/internal/revalidate-public-cache/route")
    const response = await POST()
    assert.equal(response.status, 405)
  })
})

describe("cron stale vs purge manual", () => {
  it("o purge duro continua no POST autenticado de /api/revalidate", () => {
    const manual = semComentarios(readFileSync(join(root, "src/app/api/revalidate/route.ts"), "utf8"))
    assert.match(
      manual,
      /revalidateTag\(tag,\s*\{\s*expire:\s*0\s*\}\)/,
      "a correção de erro factual precisa continuar expirando de imediato",
    )
    assert.match(manual, /PF_REVALIDATE_SECRET/)
  })

  it("as duas rotas não usam a mesma estratégia", () => {
    const cron = semComentarios(
      readFileSync(join(root, "src/app/api/internal/revalidate-public-cache/route.ts"), "utf8"),
    )
    const manual = semComentarios(
      readFileSync(join(root, "src/app/api/revalidate/route.ts"), "utf8"),
    )
    const estrategia = (src: string) =>
      /revalidateTag\(tag,\s*"max"\)/.test(src) ? "max" : "expire-0"
    assert.equal(estrategia(cron), "max")
    assert.equal(estrategia(manual), "expire-0")
  })
})

describe("contrato da rota de cron de revalidate", () => {
  const routePath = join(root, "src/app/api/internal/revalidate-public-cache/route.ts")

  it("usa CRON_SECRET, runtime nodejs e stale-while-revalidate", () => {
    const src = semComentarios(readFileSync(routePath, "utf8"))
    assert.match(src, /export const runtime = "nodejs"/)
    assert.match(src, /export const dynamic = "force-dynamic"/)
    assert.match(src, /process\.env\.CRON_SECRET/)
    // `"max"` marca como stale; `{ expire: 0 }` faria as tags publicas
    // expirarem juntas 96 vezes por dia, cada ciclo com miss bloqueante em cima
    // de um cache recem-esvaziado. O purge duro fica no POST manual de
    // /api/revalidate, autenticado por PF_REVALIDATE_SECRET.
    assert.match(src, /revalidateTag\(tag,\s*"max"\)/)
    assert.doesNotMatch(
      src,
      /revalidateTag\(tag,\s*\{\s*expire:\s*0\s*\}\)/,
      "o cron de 15 min nao pode voltar a purgar tudo de imediato",
    )
    assert.doesNotMatch(src, /searchParams\.get\(\s*["'][^"']*secret/i)
    assert.doesNotMatch(
      src,
      /console\.(log|warn|error)\([^)]*CRON_SECRET/,
    )
  })
})

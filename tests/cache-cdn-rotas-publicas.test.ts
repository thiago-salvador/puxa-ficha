import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as never

const { createCandidatoProfileGetHandler, PROFILE_CDN_CACHE_TAG } =
  require("../src/lib/candidato-profile-route") as typeof import("../src/lib/candidato-profile-route")
const { socialCardVersionToken } =
  require("../src/lib/social-card-version") as typeof import("../src/lib/social-card-version")

/**
 * 2026-09-29: ficha, JSON do perfil e /doadores saíram do caminho
 * "função em todo hit". Estes testes seguram o contrato de cache: resposta viva
 * vai para o CDN com a tag que o POST /api/revalidate apaga; degradada, 404 de
 * fonte fora do ar e release-verify nunca vão.
 */

const liberado = {
  check: async () => ({ allowed: true, remaining: 99, resetAt: Date.now() + 60_000 }),
} as never

const ficha = { slug: "fulano", nome_urna: "Fulano", ultima_atualizacao: "2026-09-29T10:00:00Z" }

function handler(opts: {
  sourceStatus?: "live" | "degraded"
  data?: unknown
  token?: string | null
  onBypass?: () => void
}) {
  const resource = { data: opts.data === undefined ? ficha : opts.data, sourceStatus: opts.sourceStatus ?? "live" }
  return createCandidatoProfileGetHandler({
    getCandidatoBySlugResource: async () => resource as never,
    getCandidatoBySlugResourceBypassingCache: async () => {
      opts.onBypass?.()
      return resource as never
    },
    resolveReleaseVerifyCacheBypassToken: () => opts.token ?? null,
    getCandidateSitesTseBySlug: async () => null,
    rateLimiter: liberado,
  })
}

/** Código sem comentários: as regras abaixo valem para o que roda, não para a prosa. */
const code = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")

const ctx = { params: Promise.resolve({ slug: "fulano" }) }
const get = (headers: Record<string, string> = {}) =>
  new Request("https://puxaficha.com.br/api/candidato-profile/fulano", { headers })

test("perfil vivo vai para o CDN com a tag que o revalidate apaga", async () => {
  const res = await handler({})(get(), ctx)
  assert.equal(res.status, 200)
  assert.match(res.headers.get("cache-control") ?? "", /^public, .*s-maxage=43200/)
  assert.equal(res.headers.get("vercel-cache-tag"), PROFILE_CDN_CACHE_TAG)
  assert.equal(PROFILE_CDN_CACHE_TAG, "public-candidato-ficha")
})

test("perfil degradado nunca vai para o CDN", async () => {
  const res = await handler({ sourceStatus: "degraded" })(get(), ctx)
  assert.match(res.headers.get("cache-control") ?? "", /no-store/)
  assert.equal(res.headers.get("vercel-cache-tag"), null)
})

test("slug inexistente com fonte viva cacheia pouco; fonte fora do ar não cacheia", async () => {
  const vivo = await handler({ data: null })(get(), ctx)
  assert.equal(vivo.status, 404)
  assert.match(vivo.headers.get("cache-control") ?? "", /s-maxage=300/)

  const fora = await handler({ data: null, sourceStatus: "degraded" })(get(), ctx)
  assert.equal(fora.status, 503)
  assert.match(fora.headers.get("cache-control") ?? "", /no-store/)
})

test("release-verify só abre com o token certo e sai no-store", async () => {
  let bypassed = 0
  const h = handler({ token: "tok", onBypass: () => bypassed++ })

  const certo = await h(get({ "x-pf-release-verify-cache-bypass": "tok" }), ctx)
  assert.equal(bypassed, 1)
  assert.match(certo.headers.get("cache-control") ?? "", /no-store/)

  const errado = await h(get({ "x-pf-release-verify-cache-bypass": "outro" }), ctx)
  assert.equal(bypassed, 1)
  assert.match(errado.headers.get("cache-control") ?? "", /s-maxage=43200/)
})

test("sem token (produção) o header de bypass é ignorado", async () => {
  let bypassed = 0
  const res = await handler({ token: null, onBypass: () => bypassed++ })(
    get({ "x-pf-release-verify-cache-bypass": "qualquer" }),
    ctx,
  )
  assert.equal(bypassed, 0)
  assert.match(res.headers.get("cache-control") ?? "", /s-maxage=43200/)
})

test("versão do card segue a última atualização da ficha", () => {
  const a = socialCardVersionToken("2026-09-29T10:00:00Z")
  const b = socialCardVersionToken("2026-09-29T10:00:01Z")
  assert.notEqual(a, b)
  assert.equal(a, socialCardVersionToken("2026-09-29T10:00:00.000Z"))
  assert.equal(socialCardVersionToken(null), "3")
  assert.equal(socialCardVersionToken("não é data"), "3")
})

test("o card não fura o CDN com valor por abertura", () => {
  const src = code("src/components/SocialCardModal.tsx")
  assert.doesNotMatch(src, /Date\.now\(\)/)
  assert.doesNotMatch(src, /v=3`/)
})

test("a ficha é ISR sob demanda e não lê request no servidor", () => {
  const page = code("src/app/(site)/candidato/[slug]/page.tsx")
  assert.doesNotMatch(page, /force-dynamic/)
  assert.match(page, /export const revalidate = 43200/)
  assert.match(page, /export function generateStaticParams\(\)[\s\S]*?\{\s*return \[\]\s*\}/)

  const api = code("src/lib/api.ts")
  assert.doesNotMatch(api, /from "next\/headers"/)
})

test("/doadores é estática e a busca vai para a API com cache de CDN", () => {
  const page = code("src/app/(site)/doadores/page.tsx")
  assert.doesNotMatch(page, /searchParams|from "next\/headers"|force-dynamic/)

  const api = readFileSync("src/app/api/doadores/busca/route.ts", "utf8")
  assert.match(api, /"vercel-cache-tag": CDN_CACHE_TAG/)
  assert.match(api, /const CDN_CACHE_TAG = "doador-reverse"/)
  assert.match(api, /doadoresSearchRateLimiter\.check\(request\.headers\)/)
})

test("o revalidate apaga as mesmas tags no CDN e falha alto se não conseguir", () => {
  const route = readFileSync("src/app/api/revalidate/route.ts", "utf8")
  assert.match(route, /await dangerouslyDeleteByTag\(\[\.\.\.result\.revalidated\]\)/)
  assert.match(route, /cdn_purge_failed/)
})

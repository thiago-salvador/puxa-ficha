import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

const ROOT = process.cwd()
const SITE_APP = join(ROOT, "src/app/(site)")

const PUBLIC_OG_ROUTE_FILES = [
  "opengraph-image/route.tsx",
  "comparar/opengraph-image/route.tsx",
  "governadores/opengraph-image/route.tsx",
  "quiz/resultado/og/route.tsx",
  "candidato/[slug]/opengraph-image/route.tsx",
  "candidato/[slug]/timeline/opengraph-image/route.tsx",
  "rankings/[slug]/opengraph-image/route.tsx",
  "uf/[uf]/opengraph-image/route.tsx",
]

describe("Open Graph image public routes", () => {
  it("serves every metadata image path through explicit route handlers", () => {
    for (const relPath of PUBLIC_OG_ROUTE_FILES) {
      assert.ok(existsSync(join(SITE_APP, relPath)), `${relPath} must exist`)
    }
  })

  it("rankings index does not point metadata at the dynamic-ranking slug collision", () => {
    const src = readFileSync(join(SITE_APP, "rankings/page.tsx"), "utf-8")

    assert.doesNotMatch(src, /["']\/rankings\/opengraph-image["']/)
    assert.match(src, /["']\/opengraph-image["']/)
  })

  it("quiz page points social metadata at the quiz OG route", () => {
    const src = readFileSync(join(SITE_APP, "quiz/page.tsx"), "utf-8")

    assert.match(src, /buildAbsoluteUrl\(["']\/quiz\/resultado\/og["']\)/)
    assert.match(src, /twitter:\s*buildTwitterMetadata\(\{ title, description, image \}\)/)
    assert.doesNotMatch(src, /const image = ["']\/opengraph-image["']/)
  })

  it("shared editorial OG renderer uses Puxa Ficha brand primitives", () => {
    const src = readFileSync(join(ROOT, "src/lib/og.tsx"), "utf-8")

    assert.match(src, /const FONT_HEADING = "PF Anton"/)
    assert.match(src, /const SLASHES = "\/ "\.repeat\(120\)/)
    assert.match(src, /puxaficha\.com\.br/)
    assert.match(src, /Dados públicos em contexto/)
  })

  it("shared OG renderers emit CDN cache headers", () => {
    const src = readFileSync(join(ROOT, "src/lib/og.tsx"), "utf-8")

    assert.match(src, /const ogImageCacheHeaders = \{/)
    assert.match(src, /s-maxage=86400/)
    assert.match(src, /stale-while-revalidate=3600/)
    assert.match(src, /headers = ogImageCacheHeaders/)
  })

  it("dynamic quiz/comparador OG routes use short cache, nofollow and rate limit", () => {
    const ogLib = readFileSync(join(ROOT, "src/lib/og.tsx"), "utf-8")
    const quizOg = readFileSync(join(SITE_APP, "quiz/resultado/og/route.tsx"), "utf-8")
    const compararOg = readFileSync(join(SITE_APP, "comparar/og/route.tsx"), "utf-8")

    assert.match(ogLib, /dynamicOgImageCacheHeaders/)
    assert.match(ogLib, /s-maxage=300/)
    assert.match(ogLib, /noindex, nofollow/)
    assert.match(quizOg, /quizResultOgRateLimiter/)
    assert.match(quizOg, /dynamicOgImageCacheHeaders/)
    assert.match(compararOg, /comparadorOgRateLimiter/)
    assert.match(compararOg, /dynamicOgImageCacheHeaders/)
  })
})

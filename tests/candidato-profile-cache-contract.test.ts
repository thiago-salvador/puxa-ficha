import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

const route = readFileSync("src/app/api/candidato-profile/[slug]/route.ts", "utf8")
const handler = readFileSync("src/lib/candidato-profile-route.ts", "utf8")
const revalidate = readFileSync("src/app/api/revalidate/route.ts", "utf8")

describe("cache da API publica de candidato", () => {
  it("a função roda só em cache miss, sem ISR próprio", () => {
    assert.match(route, /export const dynamic = "force-dynamic"/)
    assert.doesNotMatch(route, /export const revalidate\s*=/)
  })

  // 2026-09-29: a resposta viva vai para o CDN com a tag
  // public-candidato-ficha, e o POST /api/revalidate apaga essa tag no CDN junto
  // com o unstable_cache. Isso substitui o no-store da #57, que existia porque o
  // revalidate limpava os dados e deixava a resposta HTTP antiga no CDN.
  it("nao permite que o CDN preserve uma ficha anterior ao revalidate", () => {
    assert.match(handler, /PROFILE_CDN_CACHE_TAG = "public-candidato-ficha"/)
    assert.match(handler, /"vercel-cache-tag": PROFILE_CDN_CACHE_TAG/)
    assert.match(revalidate, /await dangerouslyDeleteByTag\(\[\.\.\.result\.revalidated\]\)/)
    assert.doesNotMatch(`${route}\n${handler}`, /s-maxage=3600/)
  })

  it("resposta degradada ou de release-verify nunca vai para o CDN", () => {
    assert.match(handler, /const live = resource\.sourceStatus === "live" && !bypass/)
    assert.match(handler, /PROFILE_NO_STORE = "private, no-store, no-cache, must-revalidate, max-age=0"/)
  })
})

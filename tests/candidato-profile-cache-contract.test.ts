import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

const route = readFileSync("src/app/api/candidato-profile/[slug]/route.ts", "utf8")

describe("cache da API publica de candidato", () => {
  it("deixa a tag public-candidato-ficha como unica camada persistente", () => {
    assert.match(route, /export const dynamic = "force-dynamic"/)
    assert.doesNotMatch(route, /export const revalidate\s*=/)
  })

  it("nao permite que CDN ou navegador preservem uma ficha anterior ao revalidate", () => {
    assert.match(
      route,
      /cache-control": "private, no-store, no-cache, must-revalidate, max-age=0"/,
    )
    assert.doesNotMatch(route, /s-maxage=3600/)
  })
})

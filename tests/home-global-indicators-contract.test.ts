import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

const homeSource = readFileSync("src/app/(site)/page.tsx", "utf8")

describe("home global indicators contract", () => {
  it("loads the complete public roster only for the hero metrics", () => {
    assert.match(homeSource, /getCandidatosComResumoResource\(\)/)
    assert.match(
      homeSource,
      /getHomeHeroMetrics\(\s*todosResumos,\s*todosResumosResource\.sourceStatus\s*\)/
    )
  })

  it("keeps grid, comparator, and JSON-LD on the presidential cohort", () => {
    assert.match(
      homeSource,
      /resumo\.candidato\.cargo_disputado === "Presidente"/
    )
    assert.match(
      homeSource,
      /getCandidatosComparaveisResource\("Presidente"\)/
    )
    assert.match(homeSource, /itemListElement: candidatos\.slice\(0, 12\)/)
    assert.match(homeSource, /<DeferredCandidatoGrid\s+candidatos=\{candidatos\}/)
  })
})

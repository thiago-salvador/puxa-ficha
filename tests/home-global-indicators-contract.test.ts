import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

const homeSource = readFileSync("src/app/(site)/page.tsx", "utf8")
const heroMetricsSource = readFileSync("src/lib/home-hero-metrics.ts", "utf8")

describe("home global indicators contract", () => {
  it("loads the complete public roster only for the hero metrics", () => {
    assert.match(homeSource, /getCandidatosComResumoResource\(\)/)
    assert.match(
      homeSource,
      /getHomeHeroMetrics\(\s*todosResumos,\s*todosResumosResource\.sourceStatus\s*\)/
    )
  })

  it("counts presidents, governors and flag-gated senators in the hero", () => {
    assert.match(
      heroMetricsSource,
      /HERO_CARGOS = new Map\(\[\s*\["presidente", "Presidente"\],\s*\["governador", "Governador"\],\s*\["senador", "Senador"\],?\s*\]\)/
    )
    assert.match(heroMetricsSource, /shouldExposeCargo\(cargo, env\)/)
  })

  it("keeps the finalists comparison, comparator, and JSON-LD on the presidential cohort", () => {
    assert.match(
      homeSource,
      /resumo\.candidato\.cargo_disputado === "Presidente"/
    )
    assert.match(
      homeSource,
      /getCandidatosComparaveisResource\("Presidente"\)/
    )
    // JSON-LD e o link do comparador usam o recorte da coorte presidencial (finalistas
    // com resultado publicado; todos sem resultado). Desde 05/10 a grade genérica deu
    // lugar ao duelo e ao lado a lado dos finalistas, montados com os mesmos mapas.
    assert.match(homeSource, /recortarFinalistas\(candidatos\)/)
    assert.match(homeSource, /itemListElement: candidatosGrade\.slice\(0, 12\)/)
    assert.match(homeSource, /linkCompararFinalistas\(candidatosGrade\)/)
    assert.match(homeSource, /buildCandidatoGridMaps\(resumosPresidencia\)/)
    assert.match(homeSource, /<LadoALado2Turno[\s\S]*?processos=\{processos\}[\s\S]*?\/>/)
  })
})

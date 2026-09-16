import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { getHomeHeroMetrics } from "../src/lib/home-hero-metrics"

function resumo(
  cargo_disputado: string,
  patrimonio: number | null,
  processos: number
) {
  return { patrimonio, processos, candidato: { cargo_disputado } }
}

describe("home hero global metrics", () => {
  it("sums presidents and governors only", () => {
    assert.deepEqual(
      getHomeHeroMetrics(
        [
          resumo("Presidente", 100, 2),
          resumo("Governador", null, 0),
          resumo("Governador", 50, 1),
        ],
        "live"
      ),
      {
        totalCandidatos: 3,
        totalPatrimonio: 150,
        totalProcessos: 3,
      }
    )
  })

  it("excludes vice-president and vice-governor from every hero total", () => {
    assert.deepEqual(
      getHomeHeroMetrics(
        [
          resumo("Presidente", 100, 1),
          resumo("Governador", 40, 2),
          resumo("Vice-Presidente", 999, 50),
          resumo("Vice-Governador", 888, 40),
        ],
        "live"
      ),
      {
        totalCandidatos: 2,
        totalPatrimonio: 140,
        totalProcessos: 3,
      }
    )
  })

  it("counts senators only when SENADO_ENABLED is on", () => {
    const resumos = [
      resumo("Presidente", 100, 1),
      resumo("Governador", 40, 2),
      resumo("Senador", 10, 4),
      resumo("Senador", null, 0),
    ]
    assert.deepEqual(
      getHomeHeroMetrics(resumos, "live", { SENADO_ENABLED: "true" }),
      { totalCandidatos: 4, totalPatrimonio: 150, totalProcessos: 7 }
    )
    assert.deepEqual(getHomeHeroMetrics(resumos, "live", {}), {
      totalCandidatos: 2,
      totalPatrimonio: 140,
      totalProcessos: 3,
    })
  })

  it("keeps the known roster count but does not publish partial zeros", () => {
    assert.deepEqual(
      getHomeHeroMetrics(
        [
          resumo("Presidente", null, 0),
          resumo("Vice-Presidente", null, 0),
          resumo("Governador", null, 0),
        ],
        "degraded"
      ),
      {
        totalCandidatos: 2,
        totalPatrimonio: null,
        totalProcessos: null,
      }
    )
  })

  it("does not publish a false zero when the roster itself is unavailable", () => {
    assert.deepEqual(getHomeHeroMetrics([], "degraded"), {
      totalCandidatos: null,
      totalPatrimonio: null,
      totalProcessos: null,
    })
  })
})

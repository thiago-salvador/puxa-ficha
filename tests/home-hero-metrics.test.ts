import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { getHomeHeroMetrics } from "../src/lib/home-hero-metrics"

describe("home hero global metrics", () => {
  it("sums the complete public roster", () => {
    assert.deepEqual(
      getHomeHeroMetrics(
        [
          { patrimonio: 100, processos: 2 },
          { patrimonio: null, processos: 0 },
          { patrimonio: 50, processos: 1 },
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

  it("keeps the known roster count but does not publish partial zeros", () => {
    assert.deepEqual(
      getHomeHeroMetrics(
        [
          { patrimonio: null, processos: 0 },
          { patrimonio: null, processos: 0 },
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

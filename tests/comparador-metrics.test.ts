import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { sumTotalGastoByCandidatoId } from "../src/lib/gastos-parlamentares-aggregate"
import { countVotosRowsByCandidatoId } from "../src/lib/votos-candidato-aggregate"
import { buildAggregateRankingEntries } from "../src/lib/rankings"
import { formatComparadorMetricForOg } from "../src/lib/comparador-og-format"
import type { CandidatoComparavel } from "../src/lib/types"
import { formatCompact } from "../src/lib/utils"

describe("comparador metrics", () => {
  it("sums gastos parlamentares per candidato across multiple rows", () => {
    const map = sumTotalGastoByCandidatoId([
      { candidato_id: "a", total_gasto: 100 },
      { candidato_id: "a", total_gasto: 50 },
      { candidato_id: "b", total_gasto: null },
      { candidato_id: "c", total_gasto: 200 },
    ])
    assert.equal(map.get("a"), 150)
    assert.equal(map.get("c"), 200)
    assert.equal(map.has("b"), false)
  })

  it("counts votos rows per candidato", () => {
    const map = countVotosRowsByCandidatoId([
      { candidato_id: "a" },
      { candidato_id: "a" },
      { candidato_id: "b" },
    ])
    assert.equal(map.get("a"), 2)
    assert.equal(map.get("b"), 1)
  })

  it("matches ranking aggregate entries when using summed gastos rows", () => {
    const candidatos = [
      {
        id: "1",
        nome_urna: "A",
        slug: "a",
        partido_sigla: "PT",
        cargo_disputado: "Presidente",
        estado: null,
        foto_url: null,
      },
      {
        id: "2",
        nome_urna: "B",
        slug: "b",
        partido_sigla: "PSOL",
        cargo_disputado: "Presidente",
        estado: null,
        foto_url: null,
      },
    ]
    const totalsMap = sumTotalGastoByCandidatoId([
      { candidato_id: "1", total_gasto: 30 },
      { candidato_id: "1", total_gasto: 70 },
    ])
    const rows = candidatos.map((c) => ({
      candidato_id: c.id,
      metricValue: totalsMap.has(c.id) ? (totalsMap.get(c.id) ?? null) : null,
    }))
    const entries = buildAggregateRankingEntries({ candidatos, rows })
    assert.equal(entries.find((e) => e.candidato.slug === "a")?.metricValue, 100)
    assert.equal(entries.find((e) => e.candidato.slug === "b")?.metricValue, null)
  })

  it("formats OG metric strings for comparador eixos", () => {
    const base: CandidatoComparavel = {
      id: "1",
      nome_urna: "X",
      slug: "x",
      partido_sigla: "PT",
      cargo_disputado: "Presidente",
      estado: null,
      foto_url: null,
      idade: 50,
      formacao: null,
      total_processos: 0,
      mudancas_partido: 0,
      total_pontos_atencao: 0,
      alertas_graves: 0,
      patrimonio_declarado: 1_500_000,
      evolucao_patrimonial_pct: 12,
      total_gasto_parlamentar: 2_000_000,
      total_votos_mapeados: 3,
    }
    assert.equal(formatComparadorMetricForOg("patrimonio", base), formatCompact(1_500_000))
    assert.equal(formatComparadorMetricForOg("votos", base), "3")
    assert.equal(formatComparadorMetricForOg("gastos", base), formatCompact(2_000_000))
    assert.equal(
      formatComparadorMetricForOg("patrimonio", { ...base, patrimonio_declarado: null }),
      "Sem dado"
    )
  })
})

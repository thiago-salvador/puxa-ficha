import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import { sumTotalGastoByCandidatoId } from "../src/lib/gastos-parlamentares-aggregate"
import { countVotosRowsByCandidatoId } from "../src/lib/votos-candidato-aggregate"
import { buildAggregateRankingEntries } from "../src/lib/rankings"
import { formatComparadorMetricForOg } from "../src/lib/comparador-og-format"
import {
  COMPARADOR_NAO_SE_APLICA,
  deveMostrarBlocoCongresso,
  maiorEntreNumerosReais,
} from "../src/lib/comparador-display"
import { hasFederalLegislativeHistory } from "../src/lib/legislative-history"
import type { CandidatoComparavel } from "../src/lib/types"
import { formatCompact } from "../src/lib/utils"

function comparavel(over: Partial<CandidatoComparavel> = {}): CandidatoComparavel {
  return {
    id: "1",
    nome_urna: "X",
    slug: "x",
    partido_sigla: "PT",
    cargo_disputado: "Presidente",
    cargo_atual: "Presidente da República",
    estado: null,
    foto_url: null,
    idade: 50,
    formacao: null,
    total_processos: 0,
    mudancas_partido: 0,
    alertas_graves: 0,
    patrimonio_declarado: 1_500_000,
    evolucao_patrimonial_pct: 12,
    total_gasto_parlamentar: 2_000_000,
    tem_historico_legislativo: false,
    ...over,
  }
}

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
    const base = comparavel()
    assert.equal(formatComparadorMetricForOg("patrimonio", base), formatCompact(1_500_000))
    assert.equal(formatComparadorMetricForOg("gastos", base), formatCompact(2_000_000))
    assert.equal(
      formatComparadorMetricForOg("patrimonio", { ...base, patrimonio_declarado: null }),
      "Sem dado"
    )
    assert.equal(
      formatComparadorMetricForOg("gastos", { ...base, total_gasto_parlamentar: null }),
      COMPARADOR_NAO_SE_APLICA
    )
  })
})

describe("comparador B v1: N/A e MAIOR", () => {
  it("não dá MAIOR contra null nem quando só um lado tem número", () => {
    assert.equal(maiorEntreNumerosReais(100, [100, null]), false)
    assert.equal(maiorEntreNumerosReais(null, [100, null]), false)
    assert.equal(maiorEntreNumerosReais(100, [100]), false)
  })

  it("dá MAIOR só entre valores reais distintos", () => {
    assert.equal(maiorEntreNumerosReais(200, [100, 200]), true)
    assert.equal(maiorEntreNumerosReais(100, [100, 200]), false)
    assert.equal(maiorEntreNumerosReais(100, [100, 100]), false)
    assert.equal(maiorEntreNumerosReais(0, [0, 50]), false)
    assert.equal(maiorEntreNumerosReais(50, [0, 50]), true)
  })

  it("mostra o bloco Congresso com CEAP ou histórico legislativo", () => {
    assert.equal(
      deveMostrarBlocoCongresso([
        { total_gasto_parlamentar: null, tem_historico_legislativo: false },
        { total_gasto_parlamentar: null, tem_historico_legislativo: false },
      ]),
      false,
    )
    assert.equal(
      deveMostrarBlocoCongresso([
        { total_gasto_parlamentar: 10, tem_historico_legislativo: false },
        { total_gasto_parlamentar: null, tem_historico_legislativo: false },
      ]),
      true,
    )
    assert.equal(
      deveMostrarBlocoCongresso([
        { total_gasto_parlamentar: null, tem_historico_legislativo: true },
        { total_gasto_parlamentar: null, tem_historico_legislativo: false },
      ]),
      true,
    )
  })

  it("esconde o bloco Congresso quando os dois são vereadores sem CEAP", () => {
    const vereador = hasFederalLegislativeHistory([{ cargo: "Vereador", cargo_canonico: null }])
    assert.equal(vereador, false)
    assert.equal(
      deveMostrarBlocoCongresso([
        { total_gasto_parlamentar: null, tem_historico_legislativo: vereador },
        { total_gasto_parlamentar: null, tem_historico_legislativo: vereador },
      ]),
      false,
    )
  })

  it("esconde o bloco Congresso quando os dois são deputado estadual sem CEAP", () => {
    const estadual = hasFederalLegislativeHistory([
      { cargo: "Deputado Estadual", cargo_canonico: "Deputado Estadual" },
    ])
    assert.equal(estadual, false)
    assert.equal(
      deveMostrarBlocoCongresso([
        { total_gasto_parlamentar: null, tem_historico_legislativo: estadual },
        { total_gasto_parlamentar: null, tem_historico_legislativo: estadual },
      ]),
      false,
    )
  })

  it("mostra o bloco Congresso quando um tem CEAP ou histórico federal", () => {
    const federal = hasFederalLegislativeHistory([{ cargo: "Deputado Federal", cargo_canonico: null }])
    const senador = hasFederalLegislativeHistory([{ cargo: "Senador", cargo_canonico: null }])
    assert.equal(federal, true)
    assert.equal(senador, true)
    assert.equal(
      deveMostrarBlocoCongresso([
        { total_gasto_parlamentar: null, tem_historico_legislativo: federal },
        { total_gasto_parlamentar: null, tem_historico_legislativo: false },
      ]),
      true,
    )
    assert.equal(
      deveMostrarBlocoCongresso([
        { total_gasto_parlamentar: 1_200_000, tem_historico_legislativo: false },
        { total_gasto_parlamentar: null, tem_historico_legislativo: false },
      ]),
      true,
    )
  })

  it("não mostra linha de gastos da estrutura de governo no comparador", () => {
    const fonte = readFileSync("src/components/ComparadorPanel.tsx", "utf8")
    const display = readFileSync("src/lib/comparador-display.ts", "utf8")
    assert.doesNotMatch(fonte, /Gastos da estrutura de governo/)
    assert.doesNotMatch(fonte, /tem_gastos_executivo/)
    assert.doesNotMatch(fonte, /deveMostrarBlocoExecutivo/)
    assert.doesNotMatch(display, /deveMostrarBlocoExecutivo/)
    assert.doesNotMatch(display, /COMPARADOR_GASTO_EXECUTIVO_PRESENTE/)
    assert.match(fonte, /Cota parlamentar \(CEAP\/CEAPS\)/)
    assert.match(fonte, /deveMostrarBlocoCongresso/)
    assert.match(fonte, /COMPARADOR_NAO_SE_APLICA/)
  })
})

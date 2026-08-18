import assert from "node:assert/strict"
import { test } from "node:test"
import {
  historicoInclusiveYearRangesOverlap,
  inferHistoricoObsSource,
  isTseAdjacentYearOverlappingMandatePair,
} from "../scripts/lib/historico-runtime-duplicate-rules"

test("inferHistoricoObsSource classifica TSE, Wikidata e manual", () => {
  assert.equal(inferHistoricoObsSource("ELEITO (TSE 2022)"), "tse")
  assert.equal(inferHistoricoObsSource("Importado automaticamente de Wikidata"), "wikidata")
  assert.equal(inferHistoricoObsSource(null), "manual")
  assert.equal(inferHistoricoObsSource(""), "manual")
  assert.equal(inferHistoricoObsSource("Mandato atual (Planalto)"), "manual")
})

test("historicoInclusiveYearRangesOverlap: intervalos fechados e abertos", () => {
  assert.equal(historicoInclusiveYearRangesOverlap(1998, 2002, 1999, 2007), true)
  assert.equal(historicoInclusiveYearRangesOverlap(2022, null, 2023, null), true)
  assert.equal(historicoInclusiveYearRangesOverlap(2018, 2022, 2019, null), true)
  assert.equal(historicoInclusiveYearRangesOverlap(2008, 2012, 2013, 2016), false)
})

test("isTseAdjacentYearOverlappingMandatePair: Presidente 2022 aberto vs 2023 aberto (caso lula)", () => {
  assert.equal(
    isTseAdjacentYearOverlappingMandatePair(
      "ELEITO (TSE 2022); 3o mandato",
      "Mandato atual (Planalto + TSE 2026-04-11)",
      2022,
      2023,
      null,
      null,
    ),
    true,
  )
})

test("isTseAdjacentYearOverlappingMandatePair: DF 1998–2002 vs 1999–2007 (caso eduardo-paes)", () => {
  assert.equal(
    isTseAdjacentYearOverlappingMandatePair("ELEITO (TSE 1998)", "ELEITO (TSE 1999)", 1998, 1999, 2002, 2007),
    true,
  )
})

test("isTseAdjacentYearOverlappingMandatePair: não aplica a manual+TSE", () => {
  assert.equal(
    isTseAdjacentYearOverlappingMandatePair("ELEITO (TSE 2018)", "Curadoria manual", 2018, 2019, 2022, 2022),
    false,
  )
})

test("isTseAdjacentYearOverlappingMandatePair: mesmo ano (Δ0) não entra na regra", () => {
  assert.equal(
    isTseAdjacentYearOverlappingMandatePair("ELEITO (TSE 2020)", "ELEITO (TSE 2020)", 2020, 2020, 2024, 2024),
    false,
  )
})

test("isTseAdjacentYearOverlappingMandatePair: TSE+TSE com inícios adjacentes mas sem sobreposição de mandato", () => {
  assert.equal(
    isTseAdjacentYearOverlappingMandatePair("Candidatura (TSE 2008)", "ELEITO (TSE 2009)", 2008, 2009, 2008, 2012),
    false,
  )
})

test("isTseAdjacentYearOverlappingMandatePair: coluna proveniencia=tse sem substring TSE nas observacoes", () => {
  assert.equal(
    isTseAdjacentYearOverlappingMandatePair(
      "Mandato via ingest estruturado",
      "Segundo registo",
      2022,
      2023,
      null,
      null,
      "tse",
      "tse",
    ),
    true,
  )
})

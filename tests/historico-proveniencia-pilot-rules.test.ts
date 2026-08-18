import assert from "node:assert/strict"
import { test } from "node:test"
import {
  computePilotProvenanceForBackfill,
  evaluateP2ePre1994NullObsWikidata,
  isWikidataSubstringP2dEligible,
} from "../scripts/lib/historico-proveniencia-pilot-rules"

test("pilot: wikidata por marcador", () => {
  assert.equal(
    computePilotProvenanceForBackfill("Importado automaticamente de Wikidata P39 em 2026-04-06"),
    "wikidata",
  )
})

test("pilot: TSE com (TSE AAAA) sem curadoria", () => {
  assert.equal(computePilotProvenanceForBackfill("ELEITO (TSE 2022)"), "tse")
})

test("pilot: TSE em prosa sem parenteses -> ambiguo", () => {
  assert.equal(computePilotProvenanceForBackfill("Mandato federal (TSE + curadoria 13.csv)"), null)
})

test("pilot: curadoria com (TSE 2022) -> ambiguo", () => {
  assert.equal(
    computePilotProvenanceForBackfill("Mandato (TSE 2022); curadoria 12.csv"),
    null,
  )
})

test("pilot: vazio -> manual", () => {
  assert.equal(computePilotProvenanceForBackfill(null), "manual")
  assert.equal(computePilotProvenanceForBackfill("   "), "manual")
})

test("pilot: texto sem TSE nem wikidata -> manual", () => {
  assert.equal(computePilotProvenanceForBackfill("Vice-prefeito de Natal (O Globo)"), "manual")
})

test("P2e: pre-1994 null obs + Q-id -> wikidata", () => {
  assert.equal(
    evaluateP2ePre1994NullObsWikidata({
      proveniencia: null,
      observacoes: null,
      periodo_inicio: 1991,
      wikidata_id: "Q744798",
    }),
    "wikidata",
  )
  assert.equal(
    evaluateP2ePre1994NullObsWikidata({
      proveniencia: null,
      observacoes: null,
      periodo_inicio: 1994,
      wikidata_id: "Q1",
    }),
    null,
  )
  assert.equal(
    evaluateP2ePre1994NullObsWikidata({
      proveniencia: null,
      observacoes: "nota",
      periodo_inicio: 1990,
      wikidata_id: "Q1",
    }),
    null,
  )
  assert.equal(
    evaluateP2ePre1994NullObsWikidata({
      proveniencia: "manual",
      observacoes: null,
      periodo_inicio: 1990,
      wikidata_id: "Q1",
    }),
    null,
  )
  assert.equal(
    evaluateP2ePre1994NullObsWikidata({
      proveniencia: null,
      observacoes: null,
      periodo_inicio: 1990,
      wikidata_id: "",
    }),
    null,
  )
})

test("P2d: marcador Wikidata substring", () => {
  assert.equal(isWikidataSubstringP2dEligible("Fonte: WIKIDATA P39"), true)
  assert.equal(isWikidataSubstringP2dEligible("Importado automaticamente de Wikidata P39 em 2026-04-06"), true)
  assert.equal(isWikidataSubstringP2dEligible(null), false)
  assert.equal(isWikidataSubstringP2dEligible("   "), false)
  assert.equal(isWikidataSubstringP2dEligible("Só curadoria sem marcador"), false)
})

import test from "node:test"
import assert from "node:assert/strict"
import {
  buildSqExceptionsMapFromEntries,
  classifyPatrimonioSupportedYear,
  collectPatrimonioGapNoRowPairsFromCohortAuditJson,
  eligiblePatrimonioSupportedYearsFromSeed,
  missingSupportedPatrimonioYears,
  type PatrimonioRowLite,
} from "../scripts/lib/patrimonio-supported-canary"
import type { SqExceptionEntry } from "../scripts/lib/dinheiro-cohort-coverage-audit"

test("eligiblePatrimonioSupportedYearsFromSeed intersects DEFAULT_ANOS only", () => {
  assert.deepEqual(
    eligiblePatrimonioSupportedYearsFromSeed({ "2008": "x", "2010": "a", "2022": "b" }),
    [2010, 2022],
  )
})

test("missingSupportedPatrimonioYears is set difference", () => {
  assert.deepEqual(missingSupportedPatrimonioYears([2010, 2014], [2010]), [2014])
})

test("classify: row with bens → P1", () => {
  const rows = new Map<number, PatrimonioRowLite>([[2014, { ano_eleicao: 2014, valor_total: 100, bens_count: 1 }]])
  assert.equal(
    classifyPatrimonioSupportedYear({
      slug: "x",
      year: 2014,
      rowsByYear: rows,
      exceptions: [],
    }),
    "P1",
  )
})

test("classify: row zero sem bens → P2", () => {
  const rows = new Map<number, PatrimonioRowLite>([[2022, { ano_eleicao: 2022, valor_total: 0, bens_count: 0 }]])
  assert.equal(
    classifyPatrimonioSupportedYear({ slug: "x", year: 2022, rowsByYear: rows, exceptions: [] }),
    "P2",
  )
})

test("classify: no row + no-bens-at-source → P3", () => {
  const exc: SqExceptionEntry = {
    slug: "a",
    ano: 2016,
    reason: "no-bens-at-source",
    detail: "TSE",
    confirmed: "2026-04-15",
  }
  assert.equal(
    classifyPatrimonioSupportedYear({ slug: "a", year: 2016, rowsByYear: new Map(), exceptions: [exc] }),
    "P3",
  )
})

test("classify: homonym exception sem row → P4", () => {
  const exc: SqExceptionEntry = {
    slug: "b",
    ano: 2024,
    reason: "homonym-false-positive",
    detail: "x",
    confirmed: "2026-04-13",
  }
  assert.equal(
    classifyPatrimonioSupportedYear({ slug: "b", year: 2024, rowsByYear: new Map(), exceptions: [exc] }),
    "P4",
  )
})

test("buildSqExceptionsMapFromEntries preserva multiplas excecoes por slug e ano", () => {
  const entries: SqExceptionEntry[] = [
    {
      slug: "a",
      ano: 2024,
      reason: "no-bens-at-source",
      detail: "bens",
      confirmed: "2026-04-13",
    },
    {
      slug: "a",
      ano: 2024,
      reason: "no-receita-at-source",
      detail: "receita",
      confirmed: "2026-04-13",
    },
  ]

  assert.deepEqual(buildSqExceptionsMapFromEntries(entries).get("a|2024"), entries)
})

test("classify: sem row nem exceção → GAP", () => {
  assert.equal(
    classifyPatrimonioSupportedYear({
      slug: "c",
      year: 2020,
      rowsByYear: new Map(),
      exceptions: [],
    }),
    "GAP",
  )
})

test("collectPatrimonioGapNoRowPairsFromCohortAuditJson extrai só gap_no_row", () => {
  const pairs = collectPatrimonioGapNoRowPairsFromCohortAuditJson({
    entries: [
      {
        years: [
          { slug: "a", ano: 2020, patrimonio: "materialized" },
          { slug: "b", ano: 2018, patrimonio: "gap_no_row" },
          { slug: "b", ano: 2020, patrimonio: "exception_no_bens_at_source" },
        ],
      },
    ],
  })
  assert.deepEqual(pairs, [{ slug: "b", ano: 2018 }])
})

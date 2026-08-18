import test from "node:test"
import assert from "node:assert/strict"
import {
  buildYearRowsForCandidate,
  classifyFinanciamentoYear,
  classifyPatrimonioYear,
  eligibleSupportedYearsFromSeed,
  exceptionForSlugYear,
  exceptionsForSlugYear,
  loadSqExceptionsMap,
} from "../scripts/lib/dinheiro-cohort-coverage-audit"
import type { SqExceptionEntry } from "../scripts/lib/dinheiro-cohort-coverage-audit"

test("eligibleSupportedYearsFromSeed: interseção com DEFAULT_ANOS", () => {
  assert.deepEqual(
    eligibleSupportedYearsFromSeed({ "2014": "x", "2024": "y", "2002": "z" }),
    [2014, 2024],
  )
  assert.deepEqual(eligibleSupportedYearsFromSeed({}), [])
})

test("classifyPatrimonioYear: exceção no-bens prevalece sobre linha", () => {
  const exc: SqExceptionEntry = {
    slug: "a",
    ano: 2014,
    reason: "no-bens-at-source",
    detail: "d",
    confirmed: "2026-01-01",
  }
  assert.equal(
    classifyPatrimonioYear({ hasPatrimonioRow: true, exceptions: [exc] }),
    "exception_no_bens_at_source",
  )
  assert.equal(
    classifyPatrimonioYear({ hasPatrimonioRow: false, exceptions: [exc] }),
    "exception_no_bens_at_source",
  )
})

test("classifyPatrimonioYear: homónimo", () => {
  const exc: SqExceptionEntry = {
    slug: "a",
    ano: 2016,
    reason: "homonym-false-positive",
    detail: "d",
    confirmed: "2026-01-01",
  }
  assert.equal(
    classifyPatrimonioYear({ hasPatrimonioRow: false, exceptions: [exc] }),
    "exception_homonym_false_positive",
  )
})

test("classifyPatrimonioYear: ignora no-receita-at-source (razão de financiamento)", () => {
  const exc: SqExceptionEntry = {
    slug: "vice",
    ano: 2022,
    reason: "no-receita-at-source",
    detail: "Vice-Governador",
    confirmed: "2026-04-16",
  }
  // Sem linha em `patrimonio` e sem exceção de patrimônio → gap_no_row.
  assert.equal(
    classifyPatrimonioYear({ hasPatrimonioRow: false, exceptions: [exc] }),
    "gap_no_row",
  )
  // Com linha em `patrimonio` a razão de financiamento é irrelevante → materialized.
  assert.equal(
    classifyPatrimonioYear({ hasPatrimonioRow: true, exceptions: [exc] }),
    "materialized",
  )
})

test("classifyFinanciamentoYear: no-bens não aplica a financiamento", () => {
  const exc: SqExceptionEntry = {
    slug: "a",
    ano: 2014,
    reason: "no-bens-at-source",
    detail: "d",
    confirmed: "2026-01-01",
  }
  assert.equal(classifyFinanciamentoYear({ hasFinanciamentoRow: true, exceptions: [exc] }), "materialized")
  assert.equal(classifyFinanciamentoYear({ hasFinanciamentoRow: false, exceptions: [exc] }), "gap_no_row")
})

test("classifyFinanciamentoYear: no-receita-at-source classifica como exceção própria", () => {
  const exc: SqExceptionEntry = {
    slug: "vice",
    ano: 2022,
    reason: "no-receita-at-source",
    detail: "Vice-Governador — receita da chapa sob o SQ do titular",
    confirmed: "2026-04-16",
  }
  assert.equal(
    classifyFinanciamentoYear({ hasFinanciamentoRow: false, exceptions: [exc] }),
    "exception_no_receita_at_source",
  )
  assert.equal(
    classifyFinanciamentoYear({ hasFinanciamentoRow: true, exceptions: [exc] }),
    "exception_no_receita_at_source",
  )
})

test("classifyFinanciamentoYear: homónimo bloqueia interpretação", () => {
  const exc: SqExceptionEntry = {
    slug: "a",
    ano: 2016,
    reason: "suspect-homonym-pending-verification",
    detail: "d",
    confirmed: null,
  }
  assert.equal(
    classifyFinanciamentoYear({ hasFinanciamentoRow: true, exceptions: [exc] }),
    "exception_homonym_pending_verification",
  )
})

test("classificadores por dimensão: múltiplas exceções no mesmo (slug, ano)", () => {
  const excs: SqExceptionEntry[] = [
    {
      slug: "marcos-vieira",
      ano: 2016,
      reason: "no-bens-at-source",
      detail: "Bens ausentes",
      confirmed: "2026-04-13",
    },
    {
      slug: "marcos-vieira",
      ano: 2016,
      reason: "no-receita-at-source",
      detail: "Vice-Prefeito — receita da chapa sob SQ do Prefeito",
      confirmed: "2026-04-16",
    },
  ]
  assert.equal(
    classifyPatrimonioYear({ hasPatrimonioRow: false, exceptions: excs }),
    "exception_no_bens_at_source",
  )
  assert.equal(
    classifyFinanciamentoYear({ hasFinanciamentoRow: false, exceptions: excs }),
    "exception_no_receita_at_source",
  )
})

test("buildYearRowsForCandidate: uma linha por ano elegível", () => {
  const exceptions = new Map<string, SqExceptionEntry[]>()
  const rows = buildYearRowsForCandidate({
    slug: "x",
    cargo_disputado: "Governador",
    estado: "RS",
    sqByYear: { "2022": "sq1", "2024": "sq2" },
    patrimonioYears: new Set([2022]),
    financiamentoYears: new Set([2024]),
    exceptions,
  })
  assert.equal(rows.length, 2)
  assert.equal(rows[0]?.ano, 2022)
  assert.equal(rows[0]?.patrimonio, "materialized")
  assert.equal(rows[0]?.financiamento, "gap_no_row")
  assert.deepEqual(rows[0]?.exceptions, [])
  assert.equal(rows[1]?.ano, 2024)
  assert.equal(rows[1]?.patrimonio, "gap_no_row")
  assert.equal(rows[1]?.financiamento, "materialized")
})

test("buildYearRowsForCandidate: exceções multi-razão são expostas na linha", () => {
  const excs: SqExceptionEntry[] = [
    {
      slug: "marcos-vieira",
      ano: 2016,
      reason: "no-bens-at-source",
      detail: "Bens",
      confirmed: "2026-04-13",
    },
    {
      slug: "marcos-vieira",
      ano: 2016,
      reason: "no-receita-at-source",
      detail: "Receitas",
      confirmed: "2026-04-16",
    },
  ]
  const exceptions = new Map<string, SqExceptionEntry[]>([["marcos-vieira|2016", excs]])
  const rows = buildYearRowsForCandidate({
    slug: "marcos-vieira",
    cargo_disputado: "Governador",
    estado: "SC",
    sqByYear: { "2016": "240000001401" },
    patrimonioYears: new Set(),
    financiamentoYears: new Set(),
    exceptions,
  })
  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.patrimonio, "exception_no_bens_at_source")
  assert.equal(rows[0]?.financiamento, "exception_no_receita_at_source")
  assert.deepEqual(
    rows[0]?.exceptions.map((e) => e.reason).sort(),
    ["no-bens-at-source", "no-receita-at-source"],
  )
})

test("loadSqExceptionsMap: lê ficheiro do repo sem erro", () => {
  const map = loadSqExceptionsMap()
  assert.ok(map.size > 0)
  const arr = exceptionsForSlugYear(map, "sergio-moro-gov-pr", 2016)
  assert.equal(arr.length >= 1, true)
  assert.equal(arr[0]?.reason, "homonym-false-positive")
  // Alias singular legado.
  const single = exceptionForSlugYear(map, "sergio-moro-gov-pr", 2016)
  assert.equal(single?.reason, "homonym-false-positive")
})

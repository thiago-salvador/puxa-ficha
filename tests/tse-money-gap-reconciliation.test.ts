import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import {
  findUnplannedMoneyGaps,
  hasPlannedMoneyRow,
} from "../scripts/check-dinheiro-reconciliation"

const migration = readFileSync(
  "supabase/migrations/20260711223000_tse_money_gap_jenilson_wanderlei.sql",
  "utf8",
)

const expectedPatrimonio = [
  ["jenilson-leite", 2014],
  ["jenilson-leite", 2018],
  ["jenilson-leite", 2022],
  ["jenilson-leite", 2024],
  ["wanderlei-barbosa", 2010],
  ["wanderlei-barbosa", 2018],
  ["wanderlei-barbosa", 2022],
] as const

const expectedFinanciamento = [
  ["jenilson-leite", 2014],
  ["jenilson-leite", 2018],
  ["jenilson-leite", 2022],
  ["jenilson-leite", 2024],
  ["wanderlei-barbosa", 2010],
  ["wanderlei-barbosa", 2022],
] as const

test("money reconciliation materializes every TSE-supported gap", () => {
  assert.match(migration, /INSERT INTO public\.patrimonio/)
  assert.match(migration, /INSERT INTO public\.financiamento/)
  assert.match(migration, /ON CONFLICT \(candidato_id, ano_eleicao\) DO UPDATE/g)

  const patrimonioSection = migration.split("INSERT INTO public.financiamento")[0]
  const financiamentoSection = migration.split("INSERT INTO public.financiamento")[1]

  for (const [slug, year] of expectedPatrimonio) {
    assert.match(patrimonioSection, new RegExp(`\\('${slug}', ${year},`))
  }
  for (const [slug, year] of expectedFinanciamento) {
    assert.match(financiamentoSection, new RegExp(`\\('${slug}', ${year},`))
  }

  assert.doesNotMatch(patrimonioSection, /\('wanderlei-barbosa', 2014,/)
  assert.doesNotMatch(financiamentoSection, /\('wanderlei-barbosa', 2014,/)
  assert.doesNotMatch(financiamentoSection, /\('wanderlei-barbosa', 2018,/)
  assert.match(migration, /TSE money reconciliation incomplete/)
})

test("money reconciliation does not persist donor document identifiers", () => {
  assert.doesNotMatch(migration, /cpf_hash|cnpj/i)
  assert.doesNotMatch(migration, /\d{3}\.\d{3}\.\d{3}-\d{2}/)
  assert.doesNotMatch(migration, /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/)
})

test("unsupported Wanderlei years are documented as official-source exceptions", () => {
  const exceptions = JSON.parse(readFileSync("data/sq-exceptions.json", "utf8")) as {
    entries: Array<{ slug: string; ano: number; reason: string }>
  }
  const rows = exceptions.entries.filter((entry) => entry.slug === "wanderlei-barbosa")

  assert.ok(rows.some((row) => row.ano === 2014 && row.reason === "no-bens-at-source"))
  assert.ok(rows.some((row) => row.ano === 2014 && row.reason === "no-receita-at-source"))
  assert.ok(rows.some((row) => row.ano === 2018 && row.reason === "no-receita-at-source"))
})

test("SC reconciliation uses base tables and persists Laís trajectory", () => {
  const scMigration = readFileSync(
    "supabase/migrations/20260710222500_sc_state_completion.sql",
    "utf8",
  )

  assert.doesNotMatch(scMigration, /UPDATE public\.candidatos_publico/)
  assert.doesNotMatch(scMigration, /FROM public\.candidatos_publico/)
  assert.match(scMigration, /UPDATE public\.candidatos SET/)
  assert.match(scMigration, /Pré-candidata ao Governo de Santa Catarina/)
  assert.match(scMigration, /ON CONFLICT \(candidato_id, cargo, periodo_inicio\) DO UPDATE/)

  const moneyBlock = scMigration.split("-- Reproduce the canonical TSE money ingest")[1]
  const patrimonioBlock = moneyBlock.split("INSERT INTO public.financiamento")[0]
  const financiamentoBlock = moneyBlock.split("INSERT INTO public.financiamento")[1]
  const expectedCounts = {
    "gelson-merisio": [3, 3],
    "jorginho-mello": [4, 4],
    "ralf-zimmer": [2, 2],
    "joao-rodrigues": [7, 8],
    "marcos-vieira": [6, 6],
  } as const

  for (const [slug, [patrimonioCount, financiamentoCount]] of Object.entries(expectedCounts)) {
    assert.equal(patrimonioBlock.match(new RegExp(`\\('${slug}',`, "g"))?.length ?? 0, patrimonioCount)
    assert.equal(
      financiamentoBlock.match(new RegExp(`\\('${slug}',`, "g"))?.length ?? 0,
      financiamentoCount,
    )
  }

  assert.doesNotMatch(moneyBlock, /\d{3}\.\d{3}\.\d{3}-\d{2}/)
  assert.doesNotMatch(moneyBlock, /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/)
  assert.doesNotMatch(moneyBlock, /"(?:cpf_hash|cnpj)"\s*:/i)
})

test("money gate recognizes only table-scoped planned rows", () => {
  assert.equal(hasPlannedMoneyRow(migration, "patrimonio", "wanderlei-barbosa", 2018), true)
  assert.equal(hasPlannedMoneyRow(migration, "financiamento", "wanderlei-barbosa", 2018), false)

  const report = {
    generated_at: new Date().toISOString(),
    entries: [
      {
        years: [
          {
            slug: "wanderlei-barbosa",
            ano: 2018,
            patrimonio: "gap_no_row",
            financiamento: "exception_no_receita_at_source",
          },
        ],
      },
    ],
  }
  assert.deepEqual(findUnplannedMoneyGaps(report, migration), [])
})

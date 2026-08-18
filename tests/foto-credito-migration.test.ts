import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { classificarMigration } from "../scripts/audit/lib/migrations-classificacao"

const ROOT = process.cwd()
const schemaPath = join(ROOT, "supabase/migrations/20260815130000_foto_credito_schema_publico.sql")
const backfillPath = join(ROOT, "supabase/migrations/20260815130100_foto_credito_backfill.sql")
const evidencePath = join(ROOT, "QA/evidencias/2026-08-15-creditos-fotos-commons.json")
const schema = readFileSync(schemaPath, "utf8")
const backfill = readFileSync(backfillPath, "utf8")
const evidence = JSON.parse(readFileSync(evidencePath, "utf8")) as {
  totais: { fichas: number; creditos_completos: number; pendencias: number }
  registros: Array<{
    slug: string
    autor: string | null
    licenca: string | null
    fonte_url: string | null
    status: "completo" | "pendente_api_arquivo_ausente"
  }>
}

describe("migration de crédito de fotos", () => {
  it("mantém schema e backfill em migrations separadas e não mistas", () => {
    assert.doesNotMatch(schema, /\b(INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM)\b/i)
    assert.doesNotMatch(backfill, /\b(CREATE|ALTER|DROP)\s+(TABLE|VIEW|INDEX)\b/i)
    assert.equal(classificarMigration(schemaPath, schema).mista, false)
    assert.equal(classificarMigration(backfillPath, backfill).mista, false)
  })

  it("cria coluna nullable e documenta o shape sem inventar fallback", () => {
    assert.match(schema, /ADD COLUMN IF NOT EXISTS foto_credito jsonb;/)
    assert.doesNotMatch(schema, /foto_credito jsonb\s+NOT NULL/i)
    for (const field of ["origem", "autor", "licenca", "licenca_url", "fonte_url"]) {
      assert.match(schema, new RegExp(field))
    }
    assert.match(schema, /Null significa crédito ainda não comprovado/)
  })

  it("congela o universo medido de 134 fichas e retém a única pendência", () => {
    assert.deepEqual(evidence.totais, { fichas: 134, creditos_completos: 133, pendencias: 1 })
    assert.equal(evidence.registros.length, 134)
    const completos = evidence.registros.filter((row) => row.status === "completo")
    const pendentes = evidence.registros.filter((row) => row.status !== "completo")
    assert.equal(completos.length, 133)
    assert.deepEqual(pendentes.map((row) => row.slug), ["paulo-martins-gov-pr"])
    for (const row of completos) {
      assert.ok(row.autor, `${row.slug}: autor ausente`)
      assert.ok(row.licenca, `${row.slug}: licença ausente`)
      assert.ok(row.fonte_url?.startsWith("https://commons.wikimedia.org/"), `${row.slug}: fonte inválida`)
      assert.match(backfill, new RegExp(`@write tabela=candidatos slug=${row.slug} campos=foto_credito`))
    }
    assert.doesNotMatch(backfill, /@write tabela=candidatos slug=paulo-martins-gov-pr/)
  })

  it("materializa 133 créditos Commons e 28 créditos de URL direta do TSE", () => {
    assert.equal((backfill.match(/"origem":"wikimedia_commons"/g) ?? []).length, 133)
    assert.equal((backfill.match(/"origem":"tse"/g) ?? []).length, 28)
    assert.match(backfill, /c\.foto_url = creditos_fotos_20260815\.foto_url/)
    assert.match(backfill, /c\.foto_credito IS DISTINCT FROM creditos_fotos_20260815\.credito/)
  })
})

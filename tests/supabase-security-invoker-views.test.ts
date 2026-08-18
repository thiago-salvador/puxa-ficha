import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

const MIGRATION_PATH =
  "supabase/migrations/20260602144500_set_security_invoker_for_public_aggregate_views.sql"

describe("Supabase security invoker public aggregate views migration", () => {
  const sql = readFileSync(MIGRATION_PATH, "utf8")

  it("moves only the two proven aggregate public views to security invoker", () => {
    assert.match(
      sql,
      /ALTER\s+VIEW\s+public\.v_ficha_candidato\s+SET\s*\(\s*security_invoker\s*=\s*true\s*\);/i,
    )
    assert.match(
      sql,
      /ALTER\s+VIEW\s+public\.v_comparador\s+SET\s*\(\s*security_invoker\s*=\s*true\s*\);/i,
    )

    const alterViewStatements = sql.match(/ALTER\s+VIEW\b/gi) ?? []
    assert.equal(alterViewStatements.length, 2)
  })

  it("does not include views whose base grants need redesign first", () => {
    assert.doesNotMatch(sql, /\bcandidatos_identidade_tier1_auditavel\b/i)
    assert.doesNotMatch(sql, /\bcandidatos_publico\b/i)
    assert.doesNotMatch(sql, /\bfinanciamento_publico\b/i)
  })

  it("does not change grants, tables, policies, data, or functions", () => {
    assert.doesNotMatch(sql, /\bGRANT\b/i)
    assert.doesNotMatch(sql, /\bREVOKE\b/i)
    assert.doesNotMatch(sql, /\bALTER\s+TABLE\b/i)
    assert.doesNotMatch(sql, /\bCREATE\s+POLICY\b/i)
    assert.doesNotMatch(sql, /\bINSERT\b|\bUPDATE\b|\bDELETE\b/i)
    assert.doesNotMatch(sql, /\bCREATE\s+(OR\s+REPLACE\s+)?FUNCTION\b/i)
  })
})

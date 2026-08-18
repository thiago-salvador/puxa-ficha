import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { describe, it } from "node:test"

function readSource(file: string): string {
  return readFileSync(file, "utf-8")
}

function migrationSources(): Array<{ file: string; source: string }> {
  return readdirSync("supabase/migrations")
    .filter((file) => file.endsWith(".sql"))
    .map((file) => ({
      file,
      source: readSource(path.join("supabase/migrations", file)),
    }))
}

function sourceFilesUnder(root: string): string[] {
  return readdirSync(root, { recursive: true })
    .map((entry) => path.join(root, String(entry)))
    .filter((entry) => /\.(ts|tsx)$/.test(entry))
}

describe("launch security static contract", () => {
  it("mantém service role fora do client bundle público", () => {
    const supabase = readSource("src/lib/supabase.ts")
    assert.match(supabase, /^import "server-only"/)
    assert.match(supabase, /SUPABASE_SERVICE_ROLE_KEY/)

    const publicClientFiles = [
      ...sourceFilesUnder("src/components"),
      ...sourceFilesUnder("src/app"),
    ]

    for (const file of publicClientFiles) {
      assert.equal(
        readSource(file).includes("SUPABASE_SERVICE_ROLE_KEY"),
        false,
        `${file} must not reference SUPABASE_SERVICE_ROLE_KEY`
      )
    }
  })

  it("mantém tabelas privadas de alertas com RLS e sem política pública", () => {
    const alertsMigration = readSource("supabase/migrations/20260406150000_alerts_email_mvp.sql")
    for (const table of [
      "alert_subscribers",
      "alert_subscriptions",
      "candidate_changes",
      "notification_log",
    ]) {
      assert.match(alertsMigration, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, "i"))
    }
    assert.equal(/CREATE\s+POLICY/i.test(alertsMigration), false)
  })

  it("mantém policies públicas explícitas como SELECT, não ALL", () => {
    const policyStatements = migrationSources()
      .flatMap(({ file, source }) =>
        Array.from(source.matchAll(/CREATE\s+POLICY[\s\S]*?;/gi)).map((match) => ({
          file,
          sql: match[0],
        }))
      )

    assert.ok(policyStatements.length > 0, "expected at least one policy statement")
    for (const { file, sql } of policyStatements) {
      assert.match(sql, /FOR\s+SELECT/i, `${file} public policy must be explicit FOR SELECT`)
      assert.doesNotMatch(sql, /FOR\s+ALL/i, `${file} must not expose public FOR ALL policy`)
    }
  })
})

/** SQL composer for the guarded production driver; never opens a database connection. */
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { transactionBody } from "./lib/master-review-transaction"

const REMEDIATION_FILES = [
  { version: "20260905230738", name: "freshness_closeout_candidaturas_data", rollback: "supabase/rollback/20260905230738_freshness_closeout_candidaturas_data.rollback.sql", readback: "supabase/readback/20260905230738_freshness_closeout_candidaturas_data.readback.sql" },
  { version: "20260905230739", name: "chapas_publicas_titular_publico", rollback: "supabase/rollback/20260905230739_chapas_publicas_titular_publico.rollback.sql", readback: "supabase/readback/20260905230739_chapas_publicas_titular_publico.readback.sql" },
] as const
export const PREDECESSOR = "20260905220200"
export const digest = (sql: string) => `sha256:${createHash("sha256").update(sql).digest("hex")}`
const lit = (value: string) => `'${value.replaceAll("'", "''")}'`
const encoded = (value: string) => `convert_from(decode(${lit(Buffer.from(value).toString("base64"))}, 'base64'), 'UTF8')`

export function renderFreshnessCloseoutTransaction(mode: "apply" | "dry-run" | "rollback" | "verify", sha: string, root = process.cwd()): string {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error("Invalid expected SHA")
  if (!["apply", "dry-run", "rollback", "verify"].includes(mode)) throw new Error("Invalid mode")
  const read = (path: string) => readFileSync(resolve(root, path), "utf8")
  const predecessorDigest = digest(read(`supabase/migrations/${PREDECESSOR}_private_cron_execution_receipts.sql`))
  const files = REMEDIATION_FILES.map((file) => ({ ...file,
    raw: read(`supabase/migrations/${file.version}_${file.name}.sql`), rollbackSql: read(file.rollback), readbackSql: read(file.readback),
  }))
  // Parse all artifacts before returning any SQL, even for a later migration.
  const bodies = files.map((file) => ({ ...file, body: transactionBody(file.raw), rollbackBody: transactionBody(file.rollbackSql), readbackBody: transactionBody(file.readbackSql) }))
  const expected = (applied: boolean) => [
    [PREDECESSOR, predecessorDigest],
    ...(applied ? files.map((file) => [file.version, digest(file.raw)]) : []),
  ]
  const guard = (applied: boolean) => {
    const top = applied ? files.at(-1)!.version : PREDECESSOR
    const checks = expected(applied).map(([version, key]) => `(SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version=${lit(version)} AND idempotency_key=${lit(key)}) <> 1`)
    if (!applied) checks.push(`EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version IN (${files.map((file) => lit(file.version)).join(",")}))`)
    return `DO $ledger$ BEGIN IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM ${lit(top)} OR ${checks.join(" OR ")} THEN RAISE EXCEPTION 'freshness-closeout: ledger or digest drift'; END IF; END $ledger$;`
  }
  const sql = [mode === "verify" ? "BEGIN READ ONLY;" : "BEGIN;"]
  sql.push("SET LOCAL standard_conforming_strings = on;")
  sql.push("SET LOCAL pf.replay = 'false';")
  if (mode !== "verify") sql.push("SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:freshness-closeout', 0));")
  sql.push(guard(mode === "rollback" || mode === "verify"))
  if (mode === "apply" || mode === "dry-run") {
    for (const file of bodies) {
      sql.push(file.body)
      sql.push(`INSERT INTO supabase_migrations.schema_migrations(version, statements, name, created_by, idempotency_key, rollback) VALUES (${lit(file.version)}, ARRAY[${encoded(file.raw)}], ${lit(file.name)}, ${lit(`Thiago Salvador <contato.thiagosalvador@gmail.com> via freshness-closeout:${sha}`)}, ${lit(digest(file.raw))}, ARRAY[${encoded(file.rollbackSql)}]);`)
      sql.push(file.readbackBody)
    }
    sql.push(guard(true))
  } else if (mode === "verify") {
    sql.push(...bodies.map((file) => file.readbackBody))
  } else {
    // Read back all guards before reversing anything. Failed rollback stays atomic.
    sql.push(...bodies.map((file) => file.readbackBody))
    for (const file of [...bodies].reverse()) {
      sql.push(file.rollbackBody)
      sql.push(`DELETE FROM supabase_migrations.schema_migrations WHERE version=${lit(file.version)};`)
    }
    sql.push(guard(false))
  }
  sql.push(mode === "dry-run" || mode === "verify" ? "ROLLBACK;" : "COMMIT;")
  return `${sql.join("\n")}\n`
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [mode = "dry-run", sha = ""] = process.argv.slice(2)
  process.stdout.write(renderFreshnessCloseoutTransaction(mode as Parameters<typeof renderFreshnessCloseoutTransaction>[0], sha))
}

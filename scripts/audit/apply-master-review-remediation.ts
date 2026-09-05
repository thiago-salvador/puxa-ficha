/** SQL composer for the guarded production driver; never opens a database connection. */
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { transactionBody } from "./lib/master-review-transaction"

const REMEDIATION_FILES = [
  { version: "20260905220000", name: "publicacao_tabelas_filhas", rollback: "supabase/rollback/20260905220000_publicacao_tabelas_filhas.rollback.sql", readback: "supabase/readback/20260905220000_publicacao_tabelas_filhas.readback.sql" },
  { version: "20260905220100", name: "request_ip_quota", rollback: "scripts/audit/rollback-request-ip-quota.sql", readback: "scripts/audit/readback-request-ip-quota.sql" },
  { version: "20260905220200", name: "private_cron_execution_receipts", rollback: "scripts/audit/rollback-private-cron-execution-receipts.sql", readback: "scripts/audit/readback-private-cron-execution-receipts.sql" },
] as const
export const PREDECESSOR = "20260905150000"
export const digest = (sql: string) => `sha256:${createHash("sha256").update(sql).digest("hex")}`
const lit = (value: string) => `'${value.replaceAll("'", "''")}'`
const encoded = (value: string) => `convert_from(decode(${lit(Buffer.from(value).toString("base64"))}, 'base64'), 'UTF8')`

export function renderRemediationTransaction(mode: "apply" | "dry-run" | "rollback" | "verify", sha: string, root = process.cwd()): string {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error("Invalid expected SHA")
  if (!["apply", "dry-run", "rollback", "verify"].includes(mode)) throw new Error("Invalid mode")
  const read = (path: string) => readFileSync(resolve(root, path), "utf8")
  const predecessorDigest = digest(read(`supabase/migrations/${PREDECESSOR}_corrigir_textos_julgamento.sql`))
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
    return `DO $ledger$ BEGIN IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM ${lit(top)} OR ${checks.join(" OR ")} THEN RAISE EXCEPTION 'master-review: ledger or digest drift'; END IF; END $ledger$;`
  }
  const sql = [mode === "verify" ? "BEGIN READ ONLY;" : "BEGIN;"]
  sql.push("SET LOCAL standard_conforming_strings = on;")
  if (mode !== "verify") sql.push("SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:master-review-remediation', 0));")
  sql.push(guard(mode === "rollback" || mode === "verify"))
  if (mode === "apply" || mode === "dry-run") {
    for (const file of bodies) {
      sql.push(file.body)
      sql.push(`INSERT INTO supabase_migrations.schema_migrations(version, statements, name, created_by, idempotency_key, rollback) VALUES (${lit(file.version)}, ARRAY[${encoded(file.raw)}], ${lit(file.name)}, ${lit(`Thiago Salvador <contato.thiagosalvador@gmail.com> via master-review:${sha}`)}, ${lit(digest(file.raw))}, ARRAY[${encoded(file.rollbackSql)}]);`)
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
    sql.push(transactionBody(read("supabase/readback/20260905220000_publicacao_tabelas_filhas.rollback.readback.sql")))
    sql.push(`DO $rollback$ BEGIN IF to_regclass('public.request_ip_quotas') IS NOT NULL OR to_regprocedure('public.reserve_request_ip_quota(text,integer,integer)') IS NOT NULL OR to_regclass('public.cron_execution_receipts') IS NOT NULL OR to_regclass('public.cron_execution_receipts_retired_20260905220200') IS NULL THEN RAISE EXCEPTION 'master-review: rollback objects drift'; END IF; END $rollback$;`)
    sql.push(guard(false))
  }
  sql.push(mode === "dry-run" || mode === "verify" ? "ROLLBACK;" : "COMMIT;")
  return `${sql.join("\n")}\n`
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [mode = "dry-run", sha = ""] = process.argv.slice(2)
  process.stdout.write(renderRemediationTransaction(mode as Parameters<typeof renderRemediationTransaction>[0], sha))
}

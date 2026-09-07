/** Composes the exact, guarded release transaction; never connects to a database. */
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { transactionBody } from "./lib/master-review-transaction"

export const SIQUEIRA_PREDECESSOR = "20260907180000"
export const SIQUEIRA_MIGRATIONS = [
  { version: "20260907193000", name: "chapas_divulgacand_fonte_direta" },
  { version: "20260907193100", name: "siqueira_to_publication" },
] as const
const AUTHOR = "Thiago Salvador <contato.thiagosalvador@gmail.com> via siqueira-publication:"
const digest = (text: string) => `sha256:${createHash("sha256").update(text).digest("hex")}`
const lit = (text: string) => `'${text.replaceAll("'", "''")}'`
const encoded = (text: string) => `convert_from(decode(${lit(Buffer.from(text).toString("base64"))}, 'base64'), 'UTF8')`

export function renderSiqueiraPublicationTransaction(
  mode: "apply" | "dry-run" | "verify",
  sha: string,
  root = process.cwd(),
): string {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error("Invalid expected SHA")
  if (!["apply", "dry-run", "verify"].includes(mode)) throw new Error("Invalid mode")
  const read = (path: string) => readFileSync(resolve(root, path), "utf8")
  const predecessorDigest = digest(read(`supabase/migrations/${SIQUEIRA_PREDECESSOR}_danilo_nome_urna.sql`))
  const files = SIQUEIRA_MIGRATIONS.map((file) => {
    const base = `${file.version}_${file.name}`
    const raw = read(`supabase/migrations/${base}.sql`)
    const rollback = read(`supabase/rollback/${base}.rollback.sql`)
    const readback = read(`supabase/readback/${base}.readback.sql`)
    return { ...file, raw, rollback, readback, body: transactionBody(raw), readbackBody: transactionBody(readback) }
  })
  // Parse rollback artifacts too, before returning any executable SQL.
  for (const file of files) transactionBody(file.rollback)
  const applied = mode === "verify"
  const top = applied ? files.at(-1)!.version : SIQUEIRA_PREDECESSOR
  const expected = [
    [SIQUEIRA_PREDECESSOR, predecessorDigest],
    ...(applied ? files.map((file) => [file.version, digest(file.raw)]) : []),
  ]
  const checks = expected.map(([version, hash]) => `(SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version=${lit(version)} AND idempotency_key=${lit(hash)}) <> 1`)
  if (!applied) checks.push(`EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version IN (${files.map((file) => lit(file.version)).join(",")}))`)
  const guard = `DO $ledger$ BEGIN IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM ${lit(top)} OR ${checks.join(" OR ")} THEN RAISE EXCEPTION 'siqueira-publication: ledger or digest drift'; END IF; END $ledger$;`
  const sql = [applied ? "BEGIN READ ONLY;" : "BEGIN;", "SET LOCAL standard_conforming_strings = on;", "SET LOCAL pf.replay = 'false';"]
  if (!applied) sql.push("SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations', 0));", "LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;")
  sql.push(guard)
  for (const file of files) {
    if (!applied) {
      sql.push(file.body)
      sql.push(`INSERT INTO supabase_migrations.schema_migrations(version, statements, name, created_by, idempotency_key, rollback) VALUES (${lit(file.version)}, ARRAY[${encoded(file.raw)}], ${lit(file.name)}, ${lit(AUTHOR + sha)}, ${lit(digest(file.raw))}, ARRAY[${encoded(file.rollback)}]);`)
    }
    sql.push(file.readbackBody)
    sql.push(`DO $proof$ BEGIN IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version=${lit(file.version)} AND idempotency_key=${lit(digest(file.raw))} AND name=${lit(file.name)} AND statements=ARRAY[${encoded(file.raw)}] AND rollback=ARRAY[${encoded(file.rollback)}] AND created_by=${lit(AUTHOR + sha)}) <> 1 THEN RAISE EXCEPTION 'siqueira-publication: stored migration provenance mismatch'; END IF; END $proof$;`)
  }
  sql.push(`DO $authors$ BEGIN IF (SELECT count(DISTINCT created_by) FROM supabase_migrations.schema_migrations WHERE version IN (${files.map((file) => lit(file.version)).join(",")})) <> 1 THEN RAISE EXCEPTION 'siqueira-publication: inconsistent applied SHA'; END IF; END $authors$;`)
  sql.push(mode === "apply" ? "COMMIT;" : "ROLLBACK;")
  return `${sql.join("\n")}\n`
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [mode = "dry-run", sha = ""] = process.argv.slice(2)
  process.stdout.write(renderSiqueiraPublicationTransaction(mode as Parameters<typeof renderSiqueiraPublicationTransaction>[0], sha))
}

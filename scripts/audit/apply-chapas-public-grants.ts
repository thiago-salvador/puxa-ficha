/** Guarded composer for the ACL-only production migration. */
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { transactionBody } from "./lib/master-review-transaction"

const PREDECESSOR = "20260912160100"
const VERSION = "20260912160200"
const NAME = "grant_chapas_publico_columns"
const AUTHOR = "Thiago Salvador <contato.thiagosalvador@gmail.com> via chapas-public-grants:"
const digest = (text: string) => `sha256:${createHash("sha256").update(text).digest("hex")}`
const lit = (text: string) => `'${text.replaceAll("'", "''")}'`
const encoded = (text: string) => `convert_from(decode(${lit(Buffer.from(text).toString("base64"))}, 'base64'), 'UTF8')`

export function renderChapasPublicGrantsTransaction(mode: "apply" | "dry-run" | "verify", sha: string, root = process.cwd()) {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error("Invalid expected SHA")
  const read = (p: string) => readFileSync(resolve(root, p), "utf8")
  const raw = read(`supabase/migrations/${VERSION}_${NAME}.sql`)
  const rollback = read(`supabase/rollback/${VERSION}_${NAME}.rollback.sql`)
  const readback = read(`supabase/readback/${VERSION}_${NAME}.readback.sql`)
  transactionBody(raw); transactionBody(rollback); transactionBody(readback)
  const predecessorRaw = read(`supabase/migrations/${PREDECESSOR}_chapas_rr_vice_inapto.sql`)
  const predecessor = `SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version=${lit(PREDECESSOR)} AND idempotency_key=${lit(digest(predecessorRaw))}`
  const hash = digest(raw)
  const applied = mode === "verify"
  const ledger = applied
    ? `DO $ledger$ BEGIN IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version=${lit(VERSION)} AND idempotency_key=${lit(hash)}) <> 1 OR (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM ${lit(VERSION)} THEN RAISE EXCEPTION 'chapas grants: applied ledger drift'; END IF; END $ledger$;`
    : `DO $ledger$ BEGIN IF (${predecessor}) <> 1 OR (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM ${lit(PREDECESSOR)} THEN RAISE EXCEPTION 'chapas grants: predecessor ledger drift'; END IF; END $ledger$;`
  const sql = [applied ? "BEGIN READ ONLY;" : "BEGIN;", "SET LOCAL standard_conforming_strings = on;"]
  if (!applied) sql.push("SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations', 0));", "LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;", ledger, transactionBody(raw), `INSERT INTO supabase_migrations.schema_migrations(version,statements,name,created_by,idempotency_key,rollback) VALUES (${lit(VERSION)}, ARRAY[${encoded(raw)}], ${lit(NAME)}, ${lit(AUTHOR + sha)}, ${lit(hash)}, ARRAY[${encoded(rollback)}]);`)
  else sql.push(ledger)
  sql.push(transactionBody(readback), `DO $proof$ BEGIN IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version=${lit(VERSION)} AND name=${lit(NAME)} AND idempotency_key=${lit(hash)} AND created_by=${lit(AUTHOR + sha)} AND statements=ARRAY[${encoded(raw)}] AND rollback=ARRAY[${encoded(rollback)}]) <> 1 THEN RAISE EXCEPTION 'chapas grants: ledger provenance mismatch'; END IF; END $proof$;`, mode === "apply" ? "COMMIT;" : "ROLLBACK;")
  return `${sql.join("\n")}\n`
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [mode = "dry-run", sha = ""] = process.argv.slice(2)
  process.stdout.write(renderChapasPublicGrantsTransaction(mode as "apply" | "dry-run" | "verify", sha))
}

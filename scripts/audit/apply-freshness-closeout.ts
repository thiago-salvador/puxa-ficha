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
const AUTHOR_PREFIX = "Thiago Salvador <contato.thiagosalvador@gmail.com> via freshness-closeout:"

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
  const versions = files.map((file) => lit(file.version)).join(",")
  const appliedSha = `(SELECT substring(created_by FROM ${AUTHOR_PREFIX.length + 1}) FROM supabase_migrations.schema_migrations WHERE version=${lit(files[0].version)})`
  const authorGuard = `DO $author$ BEGIN IF
    (SELECT count(DISTINCT created_by) FROM supabase_migrations.schema_migrations WHERE version IN (${versions})) <> 1
    OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version IN (${versions})
      AND left(created_by,${AUTHOR_PREFIX.length})=${lit(AUTHOR_PREFIX)}
      AND substring(created_by FROM ${AUTHOR_PREFIX.length + 1}) ~ '^[a-f0-9]{40}$') <> ${files.length}
    THEN RAISE EXCEPTION 'freshness-closeout: applied SHA or ledger author drift'; END IF; END $author$;`
  const receiptKey = (operation: "apply" | "rollback") => `freshness-closeout:${files.map((file) => file.version).join("+")}:${operation}`
  const receiptDetails = (operation: "apply" | "rollback", gitSha: string) => {
    const details = {
      contract_version: 1, operation, reason: "Preservative freshness closeout for issues 253 and 261",
      predecessor: {version: PREDECESSOR, digest: predecessorDigest},
      artifacts: files.map((file) => ({version: file.version, migration_digest: digest(file.raw), readback_digest: digest(file.readbackSql), rollback_digest: digest(file.rollbackSql)})),
      postconditions: operation === "apply" ? "both migration readbacks passed" : "rollback CAS and retained-row postconditions passed",
      data_writes: operation === "apply" ? {candidates_updated: 2, candidates_inserted: 1, slates_inserted: 1} : {candidates_updated: 3, candidates_deleted: 0, slates_deleted: 0},
    }
    return `(${encoded(JSON.stringify(details))}::jsonb || jsonb_build_object('git_sha',${gitSha}${operation === "rollback" ? ", 'applied_git_sha',current_setting('pf.freshness_applied_sha')" : ""}))`
  }
  const absentReceipt = (operation: "apply" | "rollback") => `DO $receipt$ BEGIN IF EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao=${lit(receiptKey(operation))}) THEN RAISE EXCEPTION 'freshness-closeout: receipt already exists'; END IF; END $receipt$;`
  const receiptGuard = (operation: "apply" | "rollback", gitSha: string) => `DO $receipt$ BEGIN IF
    (SELECT count(*) FROM public.coleta_log WHERE execucao=${lit(receiptKey(operation))}) <> 1
    OR (SELECT count(*) FROM public.coleta_log WHERE execucao=${lit(receiptKey(operation))}
      AND fonte='escrita:apply-freshness-closeout' AND escopo='global' AND alvo='candidatos+chapas_2026'
      AND natureza='escrita' AND candidato_id IS NULL AND resultado='encontrado' AND volume=${operation === "apply" ? 4 : 3}
      AND executado_em IS NOT NULL AND duracao_ms IS NULL
      AND url='https://github.com/thiago-salvador/puxa-ficha/commit/' || ${gitSha}
      AND detalhe::jsonb=${receiptDetails(operation, gitSha)}) <> 1
    THEN RAISE EXCEPTION 'freshness-closeout: receipt missing, duplicated or altered'; END IF; END $receipt$;`
  const insertReceipt = (operation: "apply" | "rollback", gitSha: string) => `INSERT INTO public.coleta_log
    (fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao,natureza)
    VALUES ('escrita:apply-freshness-closeout','global','candidatos+chapas_2026',NULL,'encontrado',${operation === "apply" ? 4 : 3},
      ${receiptDetails(operation, gitSha)}::text,'https://github.com/thiago-salvador/puxa-ficha/commit/' || ${gitSha},${lit(receiptKey(operation))},'escrita');`
  const sql = [mode === "verify" ? "BEGIN READ ONLY;" : "BEGIN;"]
  sql.push("SET LOCAL standard_conforming_strings = on;")
  sql.push("SET LOCAL pf.replay = 'false';")
  if (mode !== "verify") sql.push("SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:freshness-closeout', 0));")
  sql.push(guard(mode === "rollback" || mode === "verify"))
  if (mode === "apply" || mode === "dry-run") {
    sql.push(absentReceipt("apply"), absentReceipt("rollback"))
    for (const file of bodies) {
      sql.push(file.body)
      sql.push(`INSERT INTO supabase_migrations.schema_migrations(version, statements, name, created_by, idempotency_key, rollback) VALUES (${lit(file.version)}, ARRAY[${encoded(file.raw)}], ${lit(file.name)}, ${lit(`${AUTHOR_PREFIX}${sha}`)}, ${lit(digest(file.raw))}, ARRAY[${encoded(file.rollbackSql)}]);`)
      sql.push(file.readbackBody)
    }
    // All domain and public-role readbacks precede the receipt, in this transaction.
    sql.push(guard(true), authorGuard, insertReceipt("apply", appliedSha), receiptGuard("apply", appliedSha))
  } else if (mode === "verify") {
    sql.push(...bodies.map((file) => file.readbackBody), authorGuard, receiptGuard("apply", appliedSha))
  } else {
    // Read back all guards before reversing anything. Failed rollback stays atomic.
    sql.push(...bodies.map((file) => file.readbackBody), authorGuard, receiptGuard("apply", appliedSha), absentReceipt("rollback"))
    sql.push(`SELECT set_config('pf.freshness_applied_sha',${appliedSha},true);`)
    for (const file of [...bodies].reverse()) {
      sql.push(file.rollbackBody)
      sql.push(`DELETE FROM supabase_migrations.schema_migrations WHERE version=${lit(file.version)};`)
    }
    // Append the reversal fact. Never remove or rewrite the original apply receipt.
    sql.push(guard(false), insertReceipt("rollback", lit(sha)), receiptGuard("rollback", lit(sha)))
  }
  sql.push(mode === "dry-run" || mode === "verify" ? "ROLLBACK;" : "COMMIT;")
  return `${sql.join("\n")}\n`
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [mode = "dry-run", sha = ""] = process.argv.slice(2)
  process.stdout.write(renderFreshnessCloseoutTransaction(mode as Parameters<typeof renderFreshnessCloseoutTransaction>[0], sha))
}

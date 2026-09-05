import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { digest, PREDECESSOR, renderFreshnessCloseoutTransaction } from "../scripts/audit/apply-freshness-closeout"
import { transactionBody } from "../scripts/audit/lib/master-review-transaction"

const read=(path: string)=>readFileSync(path,"utf8")

test("driver preserva literalmente SHA, main, árvore limpa, projeto e TLS canônicos", () => {
  const canonical=read("scripts/audit/apply-master-review-remediation-production.sh")
  const driver=read("scripts/audit/apply-freshness-closeout-production.sh")
  assert.equal(driver.replaceAll("apply-freshness-closeout.ts","apply-master-review-remediation.ts").replaceAll("freshness-closeout mode","master-review mode"),canonical)
})

test("compositor fecha dados, schema e ledger em uma transação e desativa replay", () => {
  assert.equal(PREDECESSOR,"20260905220200")
  for(const mode of ["apply","dry-run","verify","rollback"] as const) {
    assert.throws(()=>renderFreshnessCloseoutTransaction(mode,"wrong"),/SHA/)
    const sql=renderFreshnessCloseoutTransaction(mode,"a".repeat(40))
    assert.ok(transactionBody(sql).length>0)
    assert.ok(sql.startsWith(mode==="verify"?"BEGIN READ ONLY;":"BEGIN;"))
    assert.ok(sql.endsWith(mode==="dry-run"||mode==="verify"?"ROLLBACK;\n":"COMMIT;\n"))
    assert.match(sql,/SET LOCAL pf\.replay = 'false';/)
    assert.match(sql,/SET LOCAL standard_conforming_strings = on;/)
    for(const file of ["20260905220200_private_cron_execution_receipts","20260905230738_freshness_closeout_candidaturas_data","20260905230739_chapas_publicas_titular_publico"]) assert.ok(sql.includes(digest(read(`supabase/migrations/${file}.sql`))))
    if(mode!=="verify") assert.match(sql,/pg_advisory_xact_lock/)
    if(mode==="verify") assert.doesNotMatch(sql,/INSERT INTO supabase_migrations/)
    assert.doesNotMatch(sql,/DELETE FROM public\.(candidatos|chapas_2026|historico_politico)/)
  }
})

test("workflow só oferece apply/dry-run/verify, testa PG17 antes do segredo e fixa SHA", () => {
  const yaml=read(".github/workflows/apply-freshness-closeout-production.yml")
  const options=yaml.match(/options:\n((?:\s+- [^\n]+\n)+)/)?.[1]
  assert.ok(options)
  assert.deepEqual(options.trim().split("\n").map(line=>line.trim().replace(/^- /,"")),["dry-run","apply","verify"])
  assert.match(yaml,/group: production-db-migrations/)
  assert.match(yaml,/persist-credentials: false/)
  assert.ok(yaml.includes('test "$PF_EXPECTED_SHA" = "$DISPATCH_SHA"'))
  assert.ok(yaml.includes("ref: ${{ inputs.expected_sha }}"))
  assert.ok(yaml.indexOf("PF_PROVAR_FRESHNESS_CLOSEOUT_PG17: '1'")<yaml.indexOf("secrets.SUPABASE_DB_URL"))
  assert.ok(yaml.includes("tests/freshness-closeout-package-pg17.test.ts"))
})

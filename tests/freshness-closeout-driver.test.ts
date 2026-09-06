import assert from "node:assert/strict"
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import test from "node:test"
import { digest, PREDECESSOR, renderFreshnessCloseoutTransaction } from "../scripts/audit/apply-freshness-closeout"
import { transactionBody } from "../scripts/audit/lib/master-review-transaction"

const read=(path: string)=>readFileSync(path,"utf8")
const driverRoot=resolve(import.meta.dirname,"..")
const driverSha="a".repeat(40)
const syntheticSecret="fixture-secret-never-log"

function runGuardedDriver(name: string, overrides: Record<string,string>={}, mode="dry-run") {
  const fixture=mkdtempSync(join(tmpdir(),"pf-freshness-driver-"))
  try {
    for(const dir of ["scripts/audit/lib","bin"]) mkdirSync(join(fixture,dir),{recursive:true})
    const driver=`scripts/audit/${name}`
    writeFileSync(join(fixture,driver),readFileSync(join(driverRoot,driver)))
    writeFileSync(join(fixture,"scripts/audit/lib/configure-libpq-from-url.sh"),readFileSync(join(driverRoot,"scripts/audit/lib/configure-libpq-from-url.sh")))
    // Only external process boundaries are replaced. Bash guards and Node URL
    // parsing execute unmodified; no network or database connection is possible.
    writeFileSync(join(fixture,"bin/git"),`#!${process.execPath}\nconst a=process.argv.slice(2),e=process.env;if(a[0]==='rev-parse')console.log(e.PF_FAKE_HEAD);else if(a[0]==='status')console.log(e.PF_FAKE_DIRTY??'');else if(a[0]==='ls-remote')console.log(e.PF_FAKE_REMOTE+'\\trefs/heads/main');else process.exit(9);\n`,{mode:0o755})
    writeFileSync(join(fixture,"bin/node"),`#!${process.execPath}\nconst a=process.argv.slice(2),e=process.env,fs=require('node:fs');if(a[0]==='--import'){fs.appendFileSync(e.PF_FAKE_LOG,'composer\\n');process.stdout.write('SELECT 1;\\n');}else if(e.PF_FAKE_NODE_EXIT){process.stderr.write(e.PF_DATABASE_URL);process.exit(Number(e.PF_FAKE_NODE_EXIT));}else {const r=require('node:child_process').spawnSync(process.execPath,a,{stdio:'inherit'});process.exit(r.status??1);}\n`,{mode:0o755})
    writeFileSync(join(fixture,"bin/psql"),`#!${process.execPath}\nconst fs=require('node:fs');fs.appendFileSync(process.env.PF_FAKE_LOG,'psql\\n');fs.readFileSync(0);\n`,{mode:0o755})
    writeFileSync(join(fixture,"scripts/audit/backup-closeout-production.sh"),'#!/usr/bin/env bash\nset -euo pipefail\n[[ "$PGSSLMODE" == verify-full && "$PGHOST" == db.wskpzsobvqwhnbsdsmok.supabase.co && -n "$1" ]]\nprintf "backup\\n" >> "$PF_FAKE_LOG"\n')
    const env={...process.env,PATH:`${join(fixture,"bin")}:${process.env.PATH}`,PF_DATABASE_URL:`postgresql://postgres:${syntheticSecret}@db.wskpzsobvqwhnbsdsmok.supabase.co:5432/postgres`,PF_EXPECTED_SHA:driverSha,GITHUB_REF:"refs/heads/main",PF_FAKE_HEAD:driverSha,PF_FAKE_REMOTE:driverSha,PF_FAKE_LOG:join(fixture,"calls"),...overrides}
    const result=spawnSync("bash",[driver,mode,join(fixture,"private-backup")],{cwd:fixture,env,encoding:"utf8",timeout:15_000})
    const calls=existsSync(env.PF_FAKE_LOG)?readFileSync(env.PF_FAKE_LOG,"utf8").trim().split("\n"):[]
    assert.ok(!(result.stdout+result.stderr).includes(syntheticSecret),"never expose the password, even if a failing runtime emits the full URL")
    assert.ok(!(result.stdout+result.stderr).includes(env.PF_DATABASE_URL),"never expose the raw database URL")
    return {result,calls}
  } finally {rmSync(fixture,{recursive:true,force:true})}
}

test("driver preserva literalmente SHA, main, árvore limpa, projeto e TLS canônicos", () => {
  const canonical=read("scripts/audit/apply-master-review-remediation-production.sh")
  const driver=read("scripts/audit/apply-freshness-closeout-production.sh")
  assert.equal(driver.replaceAll("apply-freshness-closeout.ts","apply-master-review-remediation.ts").replaceAll("freshness-closeout mode","master-review mode"),canonical)
})

for(const driver of ["apply-freshness-closeout-production.sh","apply-master-review-remediation-production.sh"]) {
  test(`${driver}: recusas reais de SHA/HEAD/dirty/ref/remote ocorrem antes de qualquer ação`,()=>{
    const cases: [Record<string,string>,RegExp][]=[
      [{PF_EXPECTED_SHA:"short"},/SHA invalido/],
      [{PF_FAKE_HEAD:"b".repeat(40)},/checkout divergiu/],
      [{PF_FAKE_DIRTY:" M user.txt"},/checkout sujo/],
      [{GITHUB_REF:"refs/heads/other"},/somente main/],
      [{PF_FAKE_REMOTE:"b".repeat(40)},/topo remoto/],
    ]
    for(const [overrides,message] of cases) for(const mode of ["dry-run","backup"]) {
      const {result,calls}=runGuardedDriver(driver,overrides,mode)
      assert.equal(result.status,2)
      assert.match(result.stderr,message)
      assert.deepEqual(calls,[])
    }
  })
  test(`${driver}: URL inválida, conflito de projeto e runtime têm diagnóstico seguro distinto`,()=>{
    const cases: [Record<string,string>,RegExp][]=[
      [{PF_DATABASE_URL:`not-a-url-${syntheticSecret}`},/URL invalida/],
      [{PF_DATABASE_URL:`postgresql://postgres:${syntheticSecret}@db.wskpzsobvqwhnbsdsmok.supabase.co:5432/postgres?sslmode=disable`},/URL invalida/],
      [{PF_DATABASE_URL:`postgresql://postgres%ZZ:${syntheticSecret}@db.wskpzsobvqwhnbsdsmok.supabase.co:5432/postgres`},/URL invalida/],
      [{PF_DATABASE_URL:`postgresql://postgres.other:${syntheticSecret}@db.wskpzsobvqwhnbsdsmok.supabase.co:5432/postgres`},/projeto diverge entre host e usuario/],
      [{PF_DATABASE_URL:`postgresql://postgres:${syntheticSecret}@unknown.example:5432/postgres`},/URL nao identifica projeto Supabase/],
      [{PF_DATABASE_URL:`postgresql://postgres:${syntheticSecret}@db.other.supabase.co:5432/postgres`},/banco nao e producao/],
      [{PF_FAKE_NODE_EXIT:"1"},/runtime.*codigo 1/],
      [{PF_FAKE_NODE_EXIT:"127"},/runtime.*codigo 127/],
    ]
    for(const [overrides,message] of cases) {
      const {result,calls}=runGuardedDriver(driver,overrides)
      assert.equal(result.status,2)
      assert.match(result.stderr,message)
      assert.deepEqual(calls,[])
    }
  })
  test(`${driver}: controle positivo chega ao compositor; backup só despacha após TLS validado`,()=>{
    const normal=runGuardedDriver(driver)
    assert.equal(normal.result.status,0,normal.result.stderr)
    assert.deepEqual([...normal.calls].sort(),["composer","psql"])
    const backup=runGuardedDriver(driver,{},"backup")
    assert.equal(backup.result.status,0,backup.result.stderr)
    assert.deepEqual(backup.calls,["backup"])
  })
}

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

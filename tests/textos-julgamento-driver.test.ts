import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import test from "node:test"

const root = resolve(import.meta.dirname, "..")
const sha = "a".repeat(40)
const version = "20260905150000"
const predecessor = "20260904220000"
const stem = "corrigir_textos_julgamento"
const hash = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`

function run(mode: "apply" | "rollback", overrides: Record<string, string> = {}) {
  const fixture = mkdtempSync(join(tmpdir(), "pf-textos-driver-"))
  try {
    for (const dir of ["scripts/audit/lib", "scripts/audit/certs", "supabase/migrations", "supabase/rollback", "supabase/readback", "bin"]) mkdirSync(join(fixture, dir), { recursive: true })
    const driver = `scripts/audit/${mode}-textos-julgamento-production.sh`
    assert.ok(existsSync(join(root, driver)), `driver ${mode} deve existir`)
    writeFileSync(join(fixture, driver), readFileSync(join(root, driver)))
    writeFileSync(join(fixture, "scripts/audit/lib/configure-libpq-from-url.sh"), readFileSync(join(root, "scripts/audit/lib/configure-libpq-from-url.sh")))
    const migration = "BEGIN;\nSELECT 'forward';\nCOMMIT;\n"
    const previous = "BEGIN;\nSELECT 'predecessor';\nCOMMIT;\n"
    writeFileSync(join(fixture, `supabase/migrations/${version}_${stem}.sql`), migration)
    writeFileSync(join(fixture, `supabase/migrations/${predecessor}_corrigir_profissao_alvaro_dias_rn.sql`), previous)
    writeFileSync(join(fixture, `supabase/rollback/${version}_${stem}.rollback.sql`), `BEGIN;\nDELETE FROM supabase_migrations.schema_migrations WHERE version='${version}';\nCOMMIT;\n`)
    writeFileSync(join(fixture, `supabase/readback/${version}_${stem}.readback.sql`), "SELECT 'forward-readback';\n")
    writeFileSync(join(fixture, `supabase/readback/${version}_${stem}.rollback.readback.sql`), "SELECT 'rollback-readback';\n")
    const git = `#!${process.execPath}\nconst a=process.argv.slice(2);if(a[0]==='rev-parse')console.log(process.env.PF_FAKE_HEAD);else if(a[0]==='status')console.log(process.env.PF_FAKE_DIRTY??'');else if(a[0]==='ls-remote')console.log(process.env.PF_FAKE_REMOTE+'\\trefs/heads/main');else process.exit(9);\n`
    const psql = `#!${process.execPath}\nconst fs=require('node:fs');const a=process.argv.slice(2);const e=process.env;fs.appendFileSync(e.PF_FAKE_LOG,JSON.stringify({args:a,host:e.PGHOST,hostaddr:e.PGHOSTADDR,port:e.PGPORT,user:e.PGUSER,database:e.PGDATABASE,ssl:e.PGSSLMODE,cert:e.PGSSLROOTCERT,options:e.PGOPTIONS,service:e.PGSERVICE})+'\\n');if(a.includes('-c'))console.log(e.PF_FAKE_LEDGER);else if(a.includes('-')&&!a.includes('-c'))fs.writeFileSync(e.PF_FAKE_SQL,fs.readFileSync(0));if(e.PF_FAKE_PSQL_FAIL==='1')process.exit(7);\n`
    writeFileSync(join(fixture, "bin/git"), git, { mode: 0o755 })
    writeFileSync(join(fixture, "bin/psql"), psql, { mode: 0o755 })
    const initial = `${predecessor}|1|${hash(previous)}|0|`
    const applied = `${version}|1|${hash(previous)}|1|${hash(migration)}`
    const env = {
      ...process.env, PATH: `${join(fixture, "bin")}:${process.env.PATH}`,
      PF_DATABASE_URL: "postgresql://postgres:fixture-secret@db.wskpzsobvqwhnbsdsmok.supabase.co:5432/postgres",
      PF_EXPECTED_SHA: sha, GITHUB_REF: "refs/heads/main", PF_FAKE_HEAD: sha, PF_FAKE_REMOTE: sha,
      PF_FAKE_LEDGER: mode === "apply" ? initial : applied,
      PGHOSTADDR: "203.0.113.9", PGSERVICE: "hostile", PGOPTIONS: "-c search_path=hostile", PGSSLMODE: "disable",
      PF_FAKE_LOG: join(fixture, "calls.jsonl"), PF_FAKE_SQL: join(fixture, "transaction.sql"),
      ...overrides,
    }
    if (env.PF_FAKE_LEDGER === "APPLIED") env.PF_FAKE_LEDGER = applied
    if (env.PF_FAKE_LEDGER === "BAD_PREDECESSOR_DIGEST") env.PF_FAKE_LEDGER = (mode === "apply" ? initial : applied).replace(hash(previous), "sha256:" + "0".repeat(64))
    if (env.PF_FAKE_LEDGER === "BAD_MIGRATION_DIGEST") env.PF_FAKE_LEDGER = applied.replace(hash(migration), "sha256:" + "0".repeat(64))
    const result = spawnSync("bash", [driver], { cwd: fixture, env, encoding: "utf8", timeout: 15_000 })
    const calls = existsSync(env.PF_FAKE_LOG) ? readFileSync(env.PF_FAKE_LOG, "utf8").trim().split("\n").map((line) => JSON.parse(line)) : []
    const sql = existsSync(env.PF_FAKE_SQL) ? readFileSync(env.PF_FAKE_SQL, "utf8") : ""
    assert.doesNotMatch(result.stdout + result.stderr, /fixture-secret/)
    return { result, calls, sql }
  } finally { rmSync(fixture, { recursive: true, force: true }) }
}

test("drivers e workflows manuais existem com predecessor medido e prova PG17", () => {
  for (const mode of ["apply", "rollback"] as const) {
    const driver = join(root, `scripts/audit/${mode}-textos-julgamento-production.sh`)
    assert.ok(existsSync(driver), `${mode} ainda não implementado`)
    assert.equal(spawnSync("bash", ["-n", driver]).status, 0)
    const source = readFileSync(driver, "utf8")
    assert.match(source, /previous_version=20260904220000/)
    assert.match(source, /version=20260905150000/)
    assert.match(source, /previous_digest="sha256:\$\(shasum/)
    const workflow = readFileSync(join(root, `.github/workflows/${mode}-textos-julgamento-production.yml`), "utf8")
    assert.match(workflow, /workflow_dispatch:/)
    assert.doesNotMatch(workflow, /\n  (?:push|pull_request|schedule):/)
    for (const required of ["environment: production", "production-db-migrations", "node-version: 24", "persist-credentials: false", 'test "$PF_EXPECTED_SHA" = "$DISPATCH_SHA"']) assert.ok(workflow.includes(required), required)
    assert.ok(workflow.indexOf("provar-textos-julgamento-pg17.sh") < workflow.indexOf(`${mode}-textos-julgamento-production.sh`))
  }
})

test("pré-condições de checkout, main remoto e projeto abortam antes de psql", () => {
  for (const mode of ["apply", "rollback"] as const) {
    for (const overrides of [
      { PF_EXPECTED_SHA: "short" }, { PF_FAKE_HEAD: "b".repeat(40) }, { PF_FAKE_REMOTE: "b".repeat(40) },
      { PF_FAKE_DIRTY: " M user.txt" }, { GITHUB_REF: "refs/heads/other" },
      { PF_DATABASE_URL: "postgresql://postgres:fixture-secret@db.other.supabase.co:5432/postgres" },
      { PF_DATABASE_URL: "postgresql://postgres:fixture-secret@db.wskpzsobvqwhnbsdsmok.supabase.co:5432/postgres?sslmode=disable" },
    ] as Array<Record<string, string>>) {
      const { result, calls } = run(mode, overrides)
      assert.notEqual(result.status, 0)
      assert.equal(calls.length, 0)
    }
  }
})

test("ledger divergente e erro de consulta não produzem transação mutável", () => {
  for (const mode of ["apply", "rollback"] as const) {
    for (const overrides of [{ PF_FAKE_LEDGER: "99999999999999|0||0|" }, { PF_FAKE_LEDGER: "BAD_PREDECESSOR_DIGEST" }, { PF_FAKE_LEDGER: "BAD_MIGRATION_DIGEST" }, { PF_FAKE_PSQL_FAIL: "1" }] as Array<Record<string, string>>) {
      const { result, calls, sql } = run(mode, overrides)
      assert.notEqual(result.status, 0)
      assert.equal(calls.length, 1)
      assert.equal(sql, "")
      assert.match(calls[0].options, /default_transaction_read_only=on/)
    }
  }
})

test("aplicação e rollback montam transação com lock, ledger e readback sem herdar redirecionamento", () => {
  for (const mode of ["apply", "rollback"] as const) {
    const { result, calls, sql } = run(mode)
    assert.equal(result.status, 0, result.stderr)
    assert.equal(calls.length, 3)
    for (const call of calls) {
      assert.equal(call.host, "db.wskpzsobvqwhnbsdsmok.supabase.co")
      assert.equal(call.hostaddr, undefined)
      assert.equal(call.service, undefined)
      assert.equal(call.ssl, "verify-full")
      assert.equal(call.database, "postgres")
      assert.doesNotMatch(call.options, /hostile/)
    }
    assert.match(sql, /^BEGIN;/)
    assert.match(sql, /pg_advisory_xact_lock\(hashtextextended\('puxa-ficha:textos-julgamento-production'/)
    assert.match(sql, /ledger divergiu sob lock/)
    assert.match(sql, /ledger final divergiu/)
    assert.match(sql, /COMMIT;\s*$/)
    assert.match(calls[2].options, /default_transaction_read_only=on/)
    assert.ok(calls[2].args.some((arg: string) => arg.endsWith(mode === "apply" ? ".readback.sql" : ".rollback.readback.sql")))
    if (mode === "apply") {
      assert.match(sql, /INSERT INTO supabase_migrations.schema_migrations/)
      assert.match(sql, /Thiago Salvador/)
      assert.match(sql, /forward-readback/)
    } else {
      assert.match(sql, /rollback-readback/)
    }
  }
})

test("reaplicação com digest exato só faz readback", () => {
  const { result, calls, sql } = run("apply", { PF_FAKE_LEDGER: "APPLIED" })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(calls.length, 2)
  assert.equal(sql, "")
  assert.match(calls[1].options, /default_transaction_read_only=on/)
})

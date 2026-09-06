import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, rmSync, mkdirSync, existsSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { spawnSync } from "node:child_process"
import test from "node:test"

test("backup só aceita snapshot completo e preserva exclusivamente artefato cifrado", () => {
  const dir = mkdtempSync(join(tmpdir(), "pf-backup-test-"))
  try {
    const bin = join(dir, "bin")
    mkdirSync(bin)
    const fake = (name: string, content: string) => {
      const path = join(bin, name)
      writeFileSync(path, `#!/usr/bin/env bash\nset -euo pipefail\n${content}\n`)
      chmodSync(path, 0o700)
    }
    fake("pg_dump", 'test "$PGOPTIONS" = "-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000"\nfor arg in "$@"; do case "$arg" in --file=*) printf "synthetic private snapshot" > "${arg#--file=}" ;; esac; done')
    fake("pg_restore", 'if [[ "${PF_TEST_INCOMPLETE:-}" != 1 ]]; then printf "1; TABLE DATA public candidatos owner\\n2; TABLE DATA public chapas_2026 owner\\n3; TABLE DATA supabase_migrations schema_migrations owner\\n"; fi')
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, BACKUP_ENCRYPTION_KEY: "synthetic-test-key", PF_EXPECTED_SHA: "a".repeat(40), PGSSLMODE: "verify-full", PGSSLROOTCERT: resolve("scripts/audit/certs/supabase-root-2021.crt"), PGDATABASE: "postgres", PGHOST: "db.wskpzsobvqwhnbsdsmok.supabase.co", PGPORT: "5432" }
    const run = (name: string, overrides = {}) => spawnSync("bash", ["scripts/audit/backup-closeout-production.sh", join(dir, name)], { env: { ...env, ...overrides }, encoding: "utf8" })
    const good = run("good")
    assert.equal(good.status, 0, good.stderr)
    assert.deepEqual(readdirSync(join(dir, "good")).sort(), ["closeout.dump.enc", "closeout.dump.enc.sha256"])
    assert.ok(!readFileSync(join(dir, "good", "closeout.dump.enc")).includes(Buffer.from("synthetic private snapshot")))
    assert.notEqual(run("incomplete", { PF_TEST_INCOMPLETE: "1" }).status, 0)
    assert.ok(!existsSync(join(dir, "incomplete", "closeout.dump.enc")))
    assert.notEqual(run("missing-key", { BACKUP_ENCRYPTION_KEY: "" }).status, 0)
    assert.notEqual(run("wrong-host", { PGHOST: "example.com" }).status, 0)
    assert.notEqual(run("unsafe-tls", { PGSSLMODE: "prefer" }).status, 0)
    assert.notEqual(run("good").status, 0, "não sobrescreve backup existente")
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test("workflow preserva backup antes de dry-run e apply, sem upload de plaintext", () => {
  const yaml = readFileSync(".github/workflows/apply-freshness-closeout-production.yml", "utf8")
  const backup = yaml.indexOf("run: bash scripts/audit/apply-freshness-closeout-production.sh backup")
  const upload = yaml.indexOf("name: Preservar somente backup cifrado")
  const dryrun = yaml.indexOf("run: bash scripts/audit/apply-freshness-closeout-production.sh dry-run")
  const apply = yaml.indexOf("name: Executar modo autorizado")
  assert.ok(backup > 0 && backup < upload && upload < dryrun && dryrun < apply)
  assert.match(yaml, /retention-days: 14/)
  assert.match(yaml, /if-no-files-found: error/)
  assert.doesNotMatch(yaml, /path:.*\*|freshness-backup\/closeout\.dump\n/)
})

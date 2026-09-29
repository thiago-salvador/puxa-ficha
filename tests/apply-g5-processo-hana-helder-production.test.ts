import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import test from "node:test"

const version = "20260929110000"
const name = "g5_processo_hana_helder"
const runnerPath = "scripts/audit/apply-g5-processo-hana-helder-production.sh"
const runner = readFileSync(runnerPath, "utf8")
const workflow = readFileSync(".github/workflows/apply-g5-processo-hana-helder-production.yml", "utf8")
const migration = readFileSync(`supabase/migrations/${version}_${name}.sql`, "utf8")
const readback = readFileSync(`supabase/readback/${version}_${name}.readback.sql`, "utf8")
const recortes = JSON.parse(readFileSync("scripts/audit/recortes.json", "utf8")) as {
  recortes: Array<{ nome: string; desde?: string; ate: string; allowlist: string }>
}

test("runner G5 fixa a migration, o predecessor no topo do ledger e o projeto de produção", () => {
  for (const value of [
    "base_version=20260929100000",
    "${base_version}_financiamento_despesas.sql",
    `version=${version}`,
    `name=${name}`,
    "wskpzsobvqwhnbsdsmok",
    "pg_advisory_xact_lock",
    "INSERT INTO supabase_migrations.schema_migrations",
    "PGSSLMODE=verify-full",
    "default_transaction_read_only=on",
    "git ls-remote",
    "checkout sujo",
    "gerar_sql ROLLBACK",
    "gerar_sql COMMIT",
  ]) {
    assert.ok(runner.includes(value), value)
  }
  assert.doesNotMatch(runner, /supabase db push|apply_migration/)
  // O ensaio sempre precede a gravação no modo apply.
  const apply = runner.slice(runner.lastIndexOf("gerar_sql ROLLBACK"))
  assert.ok(apply.indexOf("gerar_sql COMMIT") > 0)
})

test("workflow G5 é manual, só main, ensaia antes de gravar e revalida só depois do apply", () => {
  for (const value of [
    "workflow_dispatch:",
    "environment: production",
    "group: production-db-migrations",
    "cancel-in-progress: false",
    'test "$PF_EXPECTED_SHA" = "$DISPATCH_SHA"',
    "persist-credentials: false",
    "if: github.ref == 'refs/heads/main'",
    "permissions:\n  contents: read",
    "- dry-run\n          - apply",
  ]) {
    assert.ok(workflow.includes(value), value)
  }
  assert.doesNotMatch(workflow, /^\s+(push|schedule|pull_request|pull_request_target):/m)
  const ensaio = workflow.indexOf("apply-g5-processo-hana-helder-production.sh dry-run")
  const grava = workflow.indexOf("apply-g5-processo-hana-helder-production.sh apply")
  assert.ok(ensaio > 0 && grava > ensaio, "dry-run antes do apply")
  assert.match(workflow.slice(workflow.lastIndexOf("- name: Aplicar"), grava), /if: \$\{\{ github\.event\.inputs\.mode == 'apply' \}\}/)
  const inicio = workflow.indexOf("  revalidate:")
  assert.ok(inicio > grava)
  const job = workflow.slice(inicio)
  assert.ok(job.includes("needs: [apply]"))
  assert.ok(job.includes("github.event.inputs.mode == 'apply'"))
  assert.ok(job.includes('["public-candidato-ficha"]'))
  assert.doesNotMatch(workflow.slice(0, inicio), /PF_REVALIDATE_SECRET/)
  assert.doesNotMatch(job, /SUPABASE_DB_URL/)
})

test("migration e readback conferem as duas fichas, a primeira frase exata e os recibos", () => {
  const frase = "Pedidos julgados improcedentes em 1ª instância; remessa necessária no TRF1."
  assert.equal([...frase].length, 75)
  assert.ok(readback.includes(`left(p.descricao, 75) = '${frase}'`))
  for (const slug of ["hana-ghassan", "tse-2026-140002550779"]) {
    assert.ok(migration.includes(`('${slug}'`), slug)
    assert.ok(readback.includes(`('${slug}'`), slug)
  }
  assert.match(readback, /version = '20260929110000'/)
  assert.match(readback, /IF n <> 2 THEN RAISE EXCEPTION 'readback g5-processo: recibos atuais/)
  assert.match(readback, /coleta_log_ultima/)
  // O recibo de hana-ghassan explica o processo deixado fora da ficha.
  assert.match(migration, /0815591-94\.2026\.8\.14\.0000\) fora da ficha porque a candidata consta só como autoridade coatora/)
  assert.doesNotMatch(migration + readback, /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/)
})

test("G5 tem recorte próprio, sem sobreposição", () => {
  const recorte = recortes.recortes.find((r) => r.nome === "g5-processo-hana-helder-20260929")
  assert.ok(recorte)
  assert.equal(recorte.desde, version)
  assert.equal(recorte.ate, version)
  assert.equal(recorte.allowlist, "scripts/audit/allowlist-g5-processo-hana-helder-20260929.json")
})

test("runner G5 recusa conectar sem contexto explícito de deploy", () => {
  const env = { ...process.env }
  delete env.PF_DATABASE_URL
  delete env.PF_EXPECTED_SHA
  delete env.GITHUB_REF
  const result = spawnSync("bash", [runnerPath], { env, encoding: "utf8" })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /PF_DATABASE_URL e obrigatoria/)
})

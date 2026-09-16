import assert from "node:assert/strict"
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { spawnSync } from "node:child_process"
import test from "node:test"
import { parse } from "yaml"

const root = process.cwd()
const runnerPath = join(root, "scripts/audit/apply-senado-2026-release.sh")
const generatorPath = join(root, "scripts/audit/lib/senado-2026-release-sql.py")
const workflowPath = join(root, ".github/workflows/apply-senado-2026-production.yml")
const proofPath = join(root, "scripts/audit/provar-senado-2026-release-pg17.sh")

const versions = [
  "20260914000000",
  "20260915090000",
  "20260915190000",
  "20260915210000",
  "20260915210100",
  "20260915220000",
]
const fakeSha = "a".repeat(40)

function migrationFor(version: string): string {
  const matches = readdirSync(join(root, "supabase/migrations")).filter((name) => name.startsWith(`${version}_`))
  assert.equal(matches.length, 1, `versão ${version} precisa de exatamente uma migration`)
  return basename(matches[0], ".sql")
}

function releaseArgs(overrides: Partial<Record<string, string>> = {}): string[] {
  const args = [fakeSha]
  for (const version of versions) {
    const name = migrationFor(version)
    args.push(
      version,
      overrides[version] ?? join(root, "supabase/migrations", `${name}.sql`),
      join(root, "supabase/rollback", `${name}.rollback.sql`),
      join(root, "supabase/readback", `${name}.readback.sql`),
    )
  }
  return args
}

function generate(args: string[]) {
  return spawnSync("python3", [generatorPath, ...args], { cwd: root, encoding: "utf8" })
}

test("conjunto do release tem versões únicas, migration, rollback, readback e rollback readback", () => {
  const all = readdirSync(join(root, "supabase/migrations")).filter((name) => name.endsWith(".sql"))
  const byVersion = new Map<string, number>()
  for (const name of all) byVersion.set(name.slice(0, 14), (byVersion.get(name.slice(0, 14)) ?? 0) + 1)
  for (const [version, count] of byVersion) assert.equal(count, 1, `versão duplicada em supabase/migrations: ${version}`)
  assert.ok(!existsSync(join(root, "supabase/migrations/20260915210000_historico_politico_proveniencia_senado.sql")))
  for (const version of versions) {
    const name = migrationFor(version)
    for (const path of [
      `supabase/rollback/${name}.rollback.sql`,
      `supabase/readback/${name}.readback.sql`,
      `supabase/readback/${name}.rollback.readback.sql`,
    ]) {
      assert.ok(existsSync(join(root, path)), `${path} ausente`)
    }
    const rollback = readFileSync(join(root, `supabase/rollback/${name}.rollback.sql`), "utf8")
    assert.match(rollback, /pg_advisory_xact_lock\(hashtextextended\('puxa-ficha:production-db-migrations',0\)\)/)
    assert.match(rollback, new RegExp(`IS DISTINCT FROM '${version}'`))
    assert.match(rollback, new RegExp(`DELETE FROM supabase_migrations\\.schema_migrations WHERE version = '${version}'`))
    assert.match(rollback, /RAISE EXCEPTION '[^']*(recusado|bloqueado)/)
    assert.doesNotMatch(rollback, /\bCASCADE\b/)
  }
})

test("roster do Senado documenta e prova a dependência do grant em candidatos com RLS", () => {
  const migration = readFileSync(join(root, "supabase/migrations/20260914000000_senado_roster.sql"), "utf8")
  const readback = readFileSync(join(root, "supabase/readback/20260914000000_senado_roster.readback.sql"), "utf8")
  assert.match(migration, /GRANT SELECT \(id, slug, sq_candidato_2026\) ON public\.candidatos TO anon, authenticated;/)
  assert.match(migration, /RLS habilitado[\s\S]*publicavel = true/)
  assert.match(readback, /relrowsecurity/)
  assert.match(readback, /polname='Leitura pública'/)
  assert.match(readback, /LIKE '%\(publicavel = true\)%'/)
  assert.match(readback, /policy permissiva de leitura em candidatos sem publicavel = true/)
})

test("roster do Senado não rebaixa a constraint de publicação mínima para NOT VALID", () => {
  const migration = readFileSync(join(root, "supabase/migrations/20260914000000_senado_roster.sql"), "utf8")
  const rollback = readFileSync(join(root, "supabase/rollback/20260914000000_senado_roster.rollback.sql"), "utf8")
  const readback = readFileSync(join(root, "supabase/readback/20260914000000_senado_roster.readback.sql"), "utf8")
  const rollbackReadback = readFileSync(join(root, "supabase/readback/20260914000000_senado_roster.rollback.readback.sql"), "utf8")
  for (const sql of [migration, rollback]) {
    assert.match(sql, /\) NOT VALID;[\s\S]*?DO \$\$[\s\S]*?VALIDATE CONSTRAINT candidatos_publicacao_minima_2026_check;/)
    assert.doesNotMatch(sql, /EXCEPTION WHEN check_violation/)
  }
  assert.match(readback, /conname='candidatos_publicacao_minima_2026_check'\s*AND convalidated/)
  assert.match(rollbackReadback, /conname='candidatos_publicacao_minima_2026_check'\s*AND convalidated/)
})

test("runner de produção aceita somente o conjunto fechado e o ledger no topo atual", () => {
  const runner = readFileSync(runnerPath, "utf8")
  assert.match(
    runner,
    /versions=\(20260914000000 20260915090000 20260915190000 20260915210000 20260915210100 20260915220000\)/,
  )
  assert.match(runner, /\[\[ "\$state" != "20260912160200\|0" \]\]/)
  assert.match(runner, /default_transaction_read_only=on/)
  assert.match(
    runner,
    /where version in \('20260914000000','20260915090000','20260915190000','20260915210000','20260915210100','20260915220000'\)/,
  )
  assert.equal((runner.match(/psql -X -v ON_ERROR_STOP=1 -f -/g) ?? []).length, 1)
  assert.match(runner, /release_sql="\$\(python3 "\$ROOT\/scripts\/audit\/lib\/senado-2026-release-sql\.py"/)
  assert.match(runner, /wskpzsobvqwhnbsdsmok/)
  assert.match(runner, /PGSSLMODE=verify-full/)
  assert.match(runner, /git status --porcelain/)
  assert.match(runner, /git rev-parse HEAD/)
  assert.match(runner, /refs\/heads\/main/)
  assert.doesNotMatch(runner, /supabase db push/)
  assert.doesNotMatch(runner, /publicavel\s*=\s*true/)
})

test("runner falha antes de conectar sem SHA e banco explícitos", () => {
  const env = { ...process.env }
  delete env.PF_DATABASE_URL
  delete env.PF_EXPECTED_SHA
  const result = spawnSync("bash", [runnerPath], { cwd: root, env, encoding: "utf8" })
  assert.notEqual(result.status, 0)
  assert.match(`${result.stdout}${result.stderr}`, /PF_DATABASE_URL e obrigatoria/)
})

test("gerador emite uma transação por migration com CAS, ledger, readback e guarda de publicavel", () => {
  const result = generate(releaseArgs())
  assert.equal(result.status, 0, result.stderr)
  const sql = result.stdout
  assert.equal((sql.match(/^BEGIN;$/gm) ?? []).length, 6)
  assert.equal((sql.match(/^COMMIT;$/gm) ?? []).length, 7)
  assert.equal((sql.match(/^BEGIN READ ONLY;$/gm) ?? []).length, 1)
  assert.equal((sql.match(/INSERT INTO supabase_migrations\.schema_migrations/g) ?? []).length, 6)
  assert.equal((sql.match(/ledger divergiu sob lock antes de/g) ?? []).length, 6)
  assert.equal((sql.match(/candidatos\/publicavel mudou em/g) ?? []).length, 6)
  assert.match(sql, /IS DISTINCT FROM '20260912160200'[\s\S]*<> 0\n/)
  assert.match(sql, /ledger final divergiu/)
  let cursor = 0
  for (const version of versions) {
    const marker = sql.indexOf(`-- release senado 2026: ${version}_`, cursor)
    assert.ok(marker >= cursor, `${version} fora de ordem`)
    const block = sql.slice(marker, sql.indexOf("\nCOMMIT;", marker))
    const insert = block.indexOf("INSERT INTO supabase_migrations.schema_migrations")
    assert.ok(block.indexOf("ledger divergiu sob lock") < insert, `${version}: CAS precisa vir antes do ledger`)
    assert.ok(block.indexOf("candidatos/publicavel mudou") > insert, `${version}: readback e guarda depois do ledger`)
    assert.match(block, new RegExp(`'github-actions:${fakeSha}'`))
    const inner = block.slice(block.indexOf("BEGIN;\n") + "BEGIN;\n".length)
    assert.match(block, /^-- release senado 2026: \d{14}_\w+\nBEGIN;\n/)
    assert.doesNotMatch(inner, /^(BEGIN|COMMIT);$/m, `${version}: BEGIN/COMMIT interno precisa ser removido`)
    cursor = marker + 1
  }
})

test("gerador recusa ordem trocada, DML e controle de transação interno", () => {
  const swapped = releaseArgs()
  const a = swapped.slice(1, 5)
  const b = swapped.slice(5, 9)
  swapped.splice(1, 8, ...b, ...a)
  const outOfOrder = generate(swapped)
  assert.notEqual(outOfOrder.status, 0)
  assert.match(outOfOrder.stderr, /fora do conjunto fechado ou fora de ordem/)

  const dir = mkdtempSync(join(tmpdir(), "pf-senado-release-"))
  try {
    const name = migrationFor("20260915210100")
    const base = readFileSync(join(root, "supabase/migrations", `${name}.sql`), "utf8")
    const dml = join(dir, `${name}.sql`)
    writeFileSync(dml, `${base}\nUPDATE public.candidatos SET publicavel = true;\n`)
    const withDml = generate(releaseArgs({ "20260915210100": dml }))
    assert.notEqual(withDml.status, 0)
    assert.match(withDml.stderr, /contém DML/)

    writeFileSync(dml, `${base}\nROLLBACK;\n`)
    const withRollback = generate(releaseArgs({ "20260915210100": dml }))
    assert.notEqual(withRollback.status, 0)
    assert.match(withRollback.stderr, /controle de transação não suportado/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("workflow manual não aceita versões ou comandos arbitrários", () => {
  const workflow = readFileSync(workflowPath, "utf8")
  assert.match(workflow, /workflow_dispatch:/)
  assert.match(workflow, /expected_sha:/)
  assert.match(workflow, /environment: production/)
  assert.match(workflow, /PF_DATABASE_URL: \$\{\{ secrets\.SUPABASE_DB_URL \}\}/)
  assert.match(workflow, /test "\$DISPATCH_REF" = "refs\/heads\/main"/)
  assert.match(workflow, /persist-credentials: false/)
  assert.match(workflow, /actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/)
  assert.match(workflow, /actions\/setup-node@820762786026740c76f36085b0efc47a31fe5020/)
  assert.match(workflow, /cancel-in-progress: false/)
  assert.match(workflow, /apply-senado-2026-release\.sh/)
  assert.doesNotMatch(workflow, /inputs:\s*[\s\S]*versions:/)
  assert.doesNotMatch(workflow, /supabase db push/)
})

test("workflow expõe o segredo do banco só aos passos que o usam", () => {
  type Step = { name?: string; run?: string; uses?: string; env?: Record<string, string> }
  const parsed = parse(readFileSync(workflowPath, "utf8")) as {
    env?: Record<string, string>
    jobs: { apply: { env?: Record<string, string>; steps: Step[] } }
  }
  const job = parsed.jobs.apply
  const secretRef = "${{ secrets.SUPABASE_DB_URL }}"

  assert.equal(parsed.env?.PF_DATABASE_URL, undefined, "segredo no env do workflow")
  assert.equal(job.env?.PF_DATABASE_URL, undefined, "segredo no env do job alcança npm ci e actions de terceiros")

  const withSecret = job.steps.filter((step) =>
    Object.values(step.env ?? {}).some((value) => String(value).includes("secrets.SUPABASE_DB_URL")),
  )
  assert.deepEqual(
    withSecret.map((step) => step.name),
    ["Validar ref e input", "Aplicar conjunto fechado"],
  )
  for (const step of withSecret) {
    assert.equal(step.env?.PF_DATABASE_URL, secretRef)
    assert.equal(step.uses, undefined, "segredo não pode ir para action de terceiros")
  }

  const install = job.steps.find((step) => /\bnpm ci\b/.test(step.run ?? ""))
  assert.ok(install, "passo de instalação ausente")
  assert.match(install.run ?? "", /npm ci --ignore-scripts/)
  assert.equal(install.env?.PF_DATABASE_URL, undefined)
})

test("PG17: aplica, recusa reaplicação, reverte com recusa de perda e reaplica", {
  skip: process.env.PF_PROVAR_SENADO_RELEASE_PG17 !== "1",
  timeout: 600_000,
}, () => {
  const result = spawnSync("bash", [proofPath], { cwd: root, encoding: "utf8", timeout: 590_000 })
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.match(result.stdout, /PASS: release senado 2026 provado em PG17 descartável/)
})

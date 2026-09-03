import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const root = process.cwd()
const versionA = "20260903100000"
const versionB = "20260903100100"
const applyPath = join(root, "scripts/audit/apply-vocabulario-situacao-production.sh")
const rollbackRunnerPath = join(root, "scripts/audit/rollback-vocabulario-situacao-production.sh")
const provaPath = join(root, "scripts/audit/provar-vocabulario-situacao-pg17.sh")
const applyWorkflowPath = join(root, ".github/workflows/apply-vocabulario-situacao-production.yml")
const rollbackWorkflowPath = join(root, ".github/workflows/rollback-vocabulario-situacao-production.yml")
const migrationAPath = join(root, `supabase/migrations/${versionA}_vocabulario_situacao_candidatura.sql`)
const rollbackPath = join(root, `supabase/rollback/${versionB}_vocabulario_situacao_candidatura.rollback.sql`)
const readbackPath = join(root, `supabase/readback/${versionB}_vocabulario_situacao_candidatura.readback.sql`)
const rollbackReadbackPath = join(root, `supabase/readback/${versionB}_vocabulario_situacao_candidatura.rollback.readback.sql`)

test("apply aplica o par numa transação, com predecessor 20260902200000 e dois registros no ledger", () => {
  const runner = readFileSync(applyPath, "utf8")
  assert.match(runner, /version_a=20260903100000/)
  assert.match(runner, /version_b=20260903100100/)
  assert.match(runner, /previous_version=20260902200000/)
  assert.match(runner, /previous_digest=sha256:15418497551ce486a7d77c429783e4a647ed8a4dc61f712ec34c0a5f369228c7/)
  assert.match(runner, /wskpzsobvqwhnbsdsmok/)
  assert.match(runner, /pg_advisory_xact_lock/)
  assert.match(runner, /vocabulario-situacao-production/)
  assert.match(runner, /ledger_row\(version_a, name_a, digest_a, raw_a\)/)
  assert.match(runner, /ledger_row\(version_b, name_b, digest_b, raw_b\)/)
  assert.match(runner, /BEGIN e um COMMIT externos/)
  assert.match(runner, /PGSSLMODE=verify-full/)
  assert.doesNotMatch(runner, /supabase db push|apply_migration/)
  assert.doesNotMatch(runner, /patrimonio|elizeu/i)
})

test("rollback runner exige o par exato no topo e devolve o ledger ao predecessor", () => {
  const runner = readFileSync(rollbackRunnerPath, "utf8")
  assert.match(runner, /version_b=20260903100100/)
  assert.match(runner, /previous_version=20260902200000/)
  assert.match(runner, /rollback do vocabulario exige o par exato no topo do ledger/)
  assert.match(runner, /rollback\.readback\.sql/)
  assert.doesNotMatch(runner, /patrimonio|elizeu/i)
})

test("workflows limitam a escrita a main, produção e um SHA fechado, e provam em PG17 antes", () => {
  for (const [path, script] of [
    [applyWorkflowPath, "apply-vocabulario-situacao-production\\.sh"],
    [rollbackWorkflowPath, "rollback-vocabulario-situacao-production\\.sh"],
  ] as const) {
    const workflow = readFileSync(path, "utf8")
    assert.match(workflow, /workflow_dispatch:/)
    assert.match(workflow, /expected_sha:/)
    assert.match(workflow, /environment: production/)
    assert.match(workflow, /production-db-migrations/)
    assert.match(workflow, /test "\$PF_EXPECTED_SHA" = "\$DISPATCH_SHA"/)
    assert.match(workflow, /bash scripts\/audit\/provar-vocabulario-situacao-pg17\.sh/)
    assert.match(workflow, new RegExp(`bash scripts/audit/${script}`))
    assert.equal((workflow.match(/SUPABASE_DB_URL/g) ?? []).length, 1)
    assert.doesNotMatch(workflow, /elizeu|patrim/i)
  }
})

test("a migration de dado grava a pré-imagem antes de escrever, e o rollback a consome", () => {
  const migration = readFileSync(migrationAPath, "utf8")
  const preImagem = migration.indexOf("execucao = 'migration:20260903100000'")
  const primeiraEscrita = migration.indexOf("SET situacao_candidatura = 'aguardando julgamento'")
  assert.ok(preImagem > 0 && primeiraEscrita > preImagem, "o recibo de pré-imagem precisa vir antes do primeiro UPDATE")
  assert.match(migration, /jsonb_object_agg\(id::text, situacao_candidatura\)/)
  assert.match(migration, /IF total <> 328 THEN/)
  assert.match(migration, /213 OR n_declarada <> 53 OR n_incerto <> 18 OR n_nulas <> 44/)

  const rollback = readFileSync(rollbackPath, "utf8")
  assert.match(rollback, /DROP CONSTRAINT candidatos_situacao_candidatura_dominio/)
  assert.match(rollback, /jsonb_each_text\(r\.detalhe::jsonb\)/)
  assert.match(rollback, /DELETE FROM supabase_migrations\.schema_migrations\s+WHERE version IN \('20260903100000', '20260903100100'\)/)
  assert.match(rollback, /nao voltaram a pre-imagem/)

  const readback = readFileSync(readbackPath, "utf8")
  assert.match(readback, /version IN \('20260903100000', '20260903100100'\)/)
  assert.match(readback, /convalidated/)
  assert.match(readback, /rico-pinheiro/)
  assert.match(readFileSync(rollbackReadbackPath, "utf8"), /diferentes da pre-imagem/)
})

test("prova em PG17 usa o censo exato de 02/09 e a mesma imagem por digest", () => {
  const prova = readFileSync(provaPath, "utf8")
  assert.match(prova, /postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317/)
  assert.match(prova, /== "328"/)
  assert.match(prova, /213\/53\/18\/44/)
  assert.match(prova, /206\/0\/3/)
  assert.match(prova, /== "251"/)
  assert.match(prova, /rollback nao devolveu a pre-imagem byte a byte/)
})

test("apply e rollback falham antes de conectar sem contexto explícito", () => {
  const env = { ...process.env }
  delete env.PF_DATABASE_URL
  delete env.PF_EXPECTED_SHA
  delete env.GITHUB_REF
  for (const runner of [applyPath, rollbackRunnerPath]) {
    const result = spawnSync("bash", [runner], { cwd: root, env, encoding: "utf8" })
    assert.notEqual(result.status, 0)
    assert.match(`${result.stdout}${result.stderr}`, /PF_DATABASE_URL e obrigatoria/)
  }
})

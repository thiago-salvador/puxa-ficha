import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const root = process.cwd()
const applyPath = join(root, "scripts/audit/apply-tse-local-schema-20260927-production.sh")
const workflowPath = join(root, ".github/workflows/apply-tse-local-schema-20260927-production.yml")

test("runner fecha duas migrations de schema sobre o predecessor desta branch", () => {
  const runner = readFileSync(applyPath, "utf8")
  assert.match(runner, /base_version=20260927060100/)
  assert.match(runner, /\$\{base_version\}_patrimonio_2026_pacote_tse\.sql/)
  assert.match(runner, /versions=\(20260927095346 20260927095347\)/)
  assert.match(runner, /names=\(financiamento_publico_categorias_origem patrimonio_cas_hash\)/)
  assert.match(runner, /supabase\/migrations\/\$\{v\}_\$\{n\}\.sql/)
  assert.match(runner, /supabase\/rollback\/\$\{v\}_\$\{n\}\.rollback\.sql/)
  assert.match(runner, /supabase\/readback\/\$\{v\}_\$\{n\}\.readback\.sql/)
  for (const [version, name] of [
    ["20260927095346", "financiamento_publico_categorias_origem"],
    ["20260927095347", "patrimonio_cas_hash"],
  ]) {
    for (const artifact of [
      `supabase/migrations/${version}_${name}.sql`,
      `supabase/rollback/${version}_${name}.rollback.sql`,
      `supabase/readback/${version}_${name}.readback.sql`,
    ]) assert.ok(existsSync(join(root, artifact)), `artefato esperado: ${artifact}`)
  }
})

test("runner mantém as proteções de SHA, checkout, projeto, TLS, lock e ledger", () => {
  const runner = readFileSync(applyPath, "utf8")
  assert.match(runner, /git status --porcelain=v1 --untracked-files=normal/)
  assert.match(runner, /git ls-remote .*refs\/heads\/main/)
  assert.match(runner, /git rev-parse HEAD/)
  assert.match(runner, /database_ref[\s\S]*wskpzsobvqwhnbsdsmok/)
  assert.match(runner, /PGSSLMODE=verify-full/)
  assert.match(runner, /pg_advisory_xact_lock\(hashtextextended\('puxa-ficha:production-db-migrations'/)
  assert.match(runner, /LOCK TABLE supabase_migrations\.schema_migrations IN SHARE ROW EXCLUSIVE MODE/)
  assert.match(runner, /ledger divergiu sob lock/)
  assert.match(runner, /gerar_sql ROLLBACK/)
  assert.match(runner, /rodar_readbacks/)
  assert.match(runner, /corpo = re\.sub/)
  assert.match(runner, /print\(corpo/)
  assert.match(runner, /gerar_sql COMMIT/)
  assert.match(runner, /tse-local-schema-20260927/)
  assert.doesNotMatch(runner, /processos-patrimonio-20260927|processos_curadoria_djen/)
})

test("workflow limita a escrita a main e produção, sem expor segredo no job", () => {
  const workflow = readFileSync(workflowPath, "utf8")
  assert.match(workflow, /name: .*tse-local-schema-20260927/)
  assert.match(workflow, /Duas migrations de schema/)
  assert.match(workflow, /workflow_dispatch:/)
  assert.match(workflow, /expected_sha:/)
  assert.match(workflow, /environment: production/)
  assert.match(workflow, /group: production-db-migrations/)
  assert.match(workflow, /if: github\.ref == 'refs\/heads\/main'/)
  assert.match(workflow, /test "\$PF_EXPECTED_SHA" = "\$DISPATCH_SHA"/)
  const stepsStart = workflow.indexOf("    steps:")
  assert.notEqual(stepsStart, -1)
  assert.doesNotMatch(workflow.slice(0, stepsStart), /secrets\.|SUPABASE_DB_URL/)
  const dryRun = workflow.indexOf("bash scripts/audit/apply-tse-local-schema-20260927-production.sh dry-run")
  const apply = workflow.indexOf("bash scripts/audit/apply-tse-local-schema-20260927-production.sh apply")
  assert.ok(dryRun >= 0 && apply > dryRun, "dry-run deve sempre anteceder apply")
  const applyStep = workflow.lastIndexOf("- name: Aplicar", apply)
  const dryRunStep = workflow.slice(workflow.lastIndexOf("- name: Ensaio", dryRun), applyStep)
  assert.doesNotMatch(dryRunStep, /^\s+if:/m, "dry-run não pode ser condicional")
  assert.match(workflow.slice(applyStep, apply), /if: \$\{\{ github\.event\.inputs\.mode == 'apply' \}\}/)
  assert.match(workflow, /environment: production[\s\S]*?PF_DATABASE_URL: \$\{\{ secrets\.SUPABASE_DB_URL \}\}/)
})

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const ROOT = process.cwd()
const VERSION = "20260830143500"
const migration = readFileSync(join(ROOT, `supabase/migrations/${VERSION}_jhc_voto_artigo_17.sql`), "utf8")
const rollback = readFileSync(join(ROOT, `supabase/rollback/${VERSION}_jhc_voto_artigo_17.rollback.sql`), "utf8")
const forward = readFileSync(join(ROOT, `supabase/readback/${VERSION}_jhc_voto_artigo_17.readback.sql`), "utf8")
const backward = readFileSync(join(ROOT, `supabase/readback/${VERSION}_jhc_voto_artigo_17.rollback.readback.sql`), "utf8")
const applyRunner = readFileSync(join(ROOT, "scripts/audit/apply-jhc-artigo-17-production.sh"), "utf8")
const rollbackRunner = readFileSync(join(ROOT, "scripts/audit/rollback-jhc-artigo-17-production.sh"), "utf8")
const applyWorkflow = readFileSync(join(ROOT, ".github/workflows/apply-jhc-artigo-17-production.yml"), "utf8")
const rollbackWorkflow = readFileSync(join(ROOT, ".github/workflows/rollback-jhc-artigo-17-production.yml"), "utf8")
const irreversibleManifest = JSON.parse(readFileSync(join(ROOT, ".github/merge-queue/irreversible-change-manifest.json"), "utf8")) as {
  scope: { releases: Array<Record<string, unknown>> }
}

test("migration de JHC limita a escrita ao par auditado e preserva as demais linhas", () => {
  assert.match(migration, /candidato_id = 'ba62f5d0-3e39-40a7-a0af-ee1d86e97e75'::uuid/)
  assert.match(migration, /votacao_id = '274f2ae4-58dc-43bb-b98c-c170b0fb132c'::uuid/)
  assert.match(migration, /AND voto = 'ausente'/)
  assert.match(migration, /SET voto = 'artigo_17'/)
  assert.match(migration, /be44d3a0-492b-4e68-9ed7-d812d7ce0e48/)
  assert.match(migration, /2026-08-15T14:10:32\.481313\+00:00/)
  assert.match(migration, /contradicao_descricao IS NULL/)
  assert.match(migration, /jhc_artigo_17_snapshot/)
  assert.match(migration, /other_digest IS DISTINCT FROM before_digest/)
  assert.match(migration, /created_at divergente/)
  assert.equal((migration.match(/UPDATE public\.votos_candidato/g) ?? []).length, 1)
})

test("forward, rollback, ledger e receipts formam um par fechado", () => {
  assert.match(rollback, /SET voto = 'ausente'/)
  assert.match(rollback, /voto_atual <> 'artigo_17'/)
  assert.match(rollback, /linha alvo divergiu do estado aplicado/)
  assert.equal((rollback.match(/UPDATE public\.votos_candidato/g) ?? []).length, 1)
  assert.match(forward, /version = '20260830143500'/)
  assert.match(forward, /execucao = 'migration:20260830143500'/)
  assert.match(backward, /execucao = 'rollback:20260830143500'/)
  assert.match(backward, /ledger_count <> 0/)
  assert.doesNotMatch(rollback, /DELETE FROM public\.coleta_log/)
})

test("runners de produção fecham SHA, projeto, predecessor, digest, lock e readbacks", () => {
  for (const runner of [applyRunner, rollbackRunner]) {
    assert.match(runner, /PF_EXPECTED_SHA/)
    assert.match(runner, /refs\/heads\/main/)
    assert.match(runner, /git ls-remote/)
    assert.match(runner, /wskpzsobvqwhnbsdsmok/)
    assert.match(runner, /PGSSLMODE=verify-full/)
    assert.match(runner, /20260830120000/)
    assert.match(runner, /sha256:166ac4c9b3d766f9173358f201525f0250419853f4a249e7fa166b55c9710ebc/)
    assert.match(runner, /puxa-ficha:jhc-artigo-17-production/)
    assert.match(runner, /idempotency_key/)
  }
  assert.match(applyRunner, /jhc_voto_artigo_17\.readback\.sql/)
  assert.match(rollbackRunner, /DELETE FROM supabase_migrations\.schema_migrations/)
  assert.match(rollbackRunner, /jhc_voto_artigo_17\.rollback\.readback\.sql/)
})

test("workflows de produção são manuais, serializados e provam PG17 antes de escrever", () => {
  for (const workflow of [applyWorkflow, rollbackWorkflow]) {
    assert.match(workflow, /workflow_dispatch:/)
    assert.match(workflow, /environment: production/)
    assert.match(workflow, /group: production-db-migrations/)
    assert.match(workflow, /provar-jhc-artigo-17-pg17\.sh/)
    assert.match(workflow, /actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/)
    assert.match(workflow, /actions\/setup-node@820762786026740c76f36085b0efc47a31fe5020/)
  }
  assert.match(applyWorkflow, /apply-jhc-artigo-17-production\.sh/)
  assert.match(rollbackWorkflow, /rollback-jhc-artigo-17-production\.sh/)
})

test("manifesto irreversível nomeia a release e seus artefatos operacionais", () => {
  const release = irreversibleManifest.scope.releases.find((entry) => entry.name === "jhc-artigo-17")
  assert.deepEqual(release, {
    name: "jhc-artigo-17",
    predecessor: "20260830120000",
    versions: [VERSION],
    apply_artifact: "scripts/audit/apply-jhc-artigo-17-production.sh",
    apply_workflow: ".github/workflows/apply-jhc-artigo-17-production.yml",
    rollback_artifact: "scripts/audit/rollback-jhc-artigo-17-production.sh",
    rollback_workflow: ".github/workflows/rollback-jhc-artigo-17-production.yml",
  })
})

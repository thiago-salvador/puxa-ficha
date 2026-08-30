import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const root = resolve(import.meta.dirname, "..")
const fixture = JSON.parse(readFileSync(resolve(root, "data/qid-profissao/profissao-declarada-qid-20260830.json"), "utf8"))
const migration = readFileSync(resolve(root, "supabase/migrations/20260830120000_backfill_profissao_declarada_qid_wikidata.sql"), "utf8")
const rollback = readFileSync(resolve(root, "supabase/rollback/20260830120000_backfill_profissao_declarada_qid_wikidata.rollback.sql"), "utf8")
const readback = readFileSync(resolve(root, "supabase/readback/20260830120000_backfill_profissao_declarada_qid_wikidata.readback.sql"), "utf8")
const applyRunner = readFileSync(resolve(root, "scripts/audit/apply-profissao-qid-production.sh"), "utf8")
const rollbackRunner = readFileSync(resolve(root, "scripts/audit/rollback-profissao-qid-production.sh"), "utf8")
const applyWorkflow = readFileSync(resolve(root, ".github/workflows/apply-profissao-qid-production.yml"), "utf8")
const rollbackWorkflow = readFileSync(resolve(root, ".github/workflows/rollback-profissao-qid-production.yml"), "utf8")
const irreversibleManifest = JSON.parse(readFileSync(resolve(root, ".github/merge-queue/irreversible-change-manifest.json"), "utf8"))

test("profissao declarada usa apenas TSE 2026 e deixa sem fonte como NULL", () => {
  assert.equal(fixture.records.length, 63)
  assert.equal(fixture.records.filter((record: { target_value: string | null }) => record.target_value !== null).length, 39)
  assert.equal(fixture.records.filter((record: { target_value: string | null }) => record.target_value === null).length, 24)
  assert.ok(fixture.records.every((record: { previous_value: string }) => /^Q\d+$/.test(record.previous_value)))
  assert.ok(fixture.records.every((record: { source_kind: string; target_value: string | null }) =>
    record.source_kind === "tse_2026_declared_occupation"
      ? record.target_value !== null
      : record.source_kind === "no_verified_tse_2026_link" && record.target_value === null,
  ))
  assert.equal(fixture.records.find((record: { slug: string }) => record.slug === "eduardo-paes")?.target_value, "OUTROS")
  assert.equal(fixture.records.find((record: { slug: string }) => record.slug === "geraldo-alckmin")?.target_value, "MÉDICO")
  assert.equal(fixture.records.find((record: { slug: string }) => record.slug === "adriana-accorsi")?.target_value, null)
})

test("migration e rollback têm receipt e sentinela contra sobrescrita posterior", () => {
  assert.doesNotMatch(migration, /SET profissao_declarada = 'Político'/)
  assert.match(migration, /source_sha256/)
  assert.match(migration, /ultima_atualizacao=s\.migration_em/)
  assert.match(migration, /INSERT INTO public\.coleta_log/)
  assert.match(readback, /official<>39 OR nulled<>24/)
  assert.match(rollback, /r\.current_updated_at=r\.executado_em/)
  assert.match(rollback, /previous_updated_at/)
  assert.match(rollback, /rollback recusado/)
})

test("runners de produção fecham projeto, SHA, predecessor, hash, lock e readbacks", () => {
  for (const runner of [applyRunner, rollbackRunner]) {
    assert.match(runner, /wskpzsobvqwhnbsdsmok/)
    assert.match(runner, /refs\/heads\/main/)
    assert.match(runner, /git ls-remote/)
    assert.match(runner, /PGSSLMODE=verify-full/)
    assert.match(runner, /20260830120000/)
    assert.match(runner, /20260829100100/)
    assert.match(runner, /previous_digest/)
    assert.match(runner, /pg_advisory_xact_lock/)
    assert.match(runner, /idempotency_key/)
  }
  assert.match(applyRunner, /backfill_profissao_declarada_qid_wikidata\.readback\.sql/)
  assert.match(applyRunner, /ja aplicada, ledger e readback conferem/)
  assert.match(rollbackRunner, /rollback\.readback\.sql/)
  assert.match(rollbackRunner, /ledger final divergiu/)
})

test("workflows manuais provam PostgreSQL 17 antes de tocar produção", () => {
  for (const workflow of [applyWorkflow, rollbackWorkflow]) {
    assert.match(workflow, /workflow_dispatch:/)
    assert.match(workflow, /environment: production/)
    assert.match(workflow, /group: production-db-migrations/)
    assert.match(workflow, /install-postgresql-client-17/)
    assert.match(workflow, /provar-migration-profissao-qid\.sh/)
    assert.match(workflow, /actions\/checkout@[a-f0-9]{40}/)
    assert.match(workflow, /actions\/setup-node@[a-f0-9]{40}/)
  }
  assert.ok(applyWorkflow.indexOf("provar-migration-profissao-qid.sh") < applyWorkflow.indexOf("apply-profissao-qid-production.sh"))
  assert.ok(rollbackWorkflow.indexOf("provar-migration-profissao-qid.sh") < rollbackWorkflow.indexOf("rollback-profissao-qid-production.sh"))
})

test("manifesto irreversível encadeia a migration de profissão depois do predecessor exato", () => {
  const release = irreversibleManifest.scope.releases.find((item: { name: string }) => item.name === "profissao-qid-tse-2026")
  assert.deepEqual(release, {
    name: "profissao-qid-tse-2026",
    predecessor: "20260829100100",
    versions: ["20260830120000"],
    apply_artifact: "scripts/audit/apply-profissao-qid-production.sh",
    apply_workflow: ".github/workflows/apply-profissao-qid-production.yml",
    rollback_artifact: "scripts/audit/rollback-profissao-qid-production.sh",
    rollback_workflow: ".github/workflows/rollback-profissao-qid-production.yml",
  })
})

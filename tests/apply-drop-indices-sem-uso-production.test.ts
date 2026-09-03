import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const root = process.cwd()
const version = "20260903120000"
const applyPath = join(root, "scripts/audit/apply-drop-indices-sem-uso-production.sh")
const rollbackRunnerPath = join(root, "scripts/audit/rollback-drop-indices-sem-uso-production.sh")
const provaPath = join(root, "scripts/audit/provar-drop-indices-sem-uso-pg17.sh")
const applyWorkflowPath = join(root, ".github/workflows/apply-drop-indices-sem-uso-production.yml")
const rollbackWorkflowPath = join(root, ".github/workflows/rollback-drop-indices-sem-uso-production.yml")
const migrationPath = join(root, `supabase/migrations/${version}_drop_indices_sem_uso.sql`)
const rollbackPath = join(root, `supabase/rollback/${version}_drop_indices_sem_uso.rollback.sql`)
const readbackPath = join(root, `supabase/readback/${version}_drop_indices_sem_uso.readback.sql`)
const rollbackReadbackPath = join(root, `supabase/readback/${version}_drop_indices_sem_uso.rollback.readback.sql`)

/**
 * Os onze nomes são a lista fechada. Ela aparece em cinco arquivos e o teste
 * confere os cinco: divergência entre eles seria remover um índice sem
 * rollback, ou prometer devolver um que ninguém removeu.
 */
const ALVOS = [
  "financiamento_quarentena_candidato_id_ano_eleicao_idx",
  "gastos_executivo_candidato_orgao_mes_idx",
  "idx_alert_subscribers_email_request_ip_sent_at",
  "idx_alert_subscribers_last_verification_email_sent_at",
  "idx_indicadores_estado_ano",
  "idx_mudancas_partido_despublicado",
  "news_refresh_lotes_continuacao_expired_idx",
  "news_refresh_lotes_continuacao_pending_idx",
  "news_refresh_lotes_processing_expired_idx",
  "news_refresh_lotes_retryable_idx",
  "patrimonio_quarentena_candidato_id_ano_eleicao_idx",
] as const

test("a migration derruba exatamente os onze e confere o que sobrou", () => {
  const migration = readFileSync(migrationPath, "utf8")
  for (const alvo of ALVOS) {
    assert.match(
      migration,
      new RegExp(`DROP INDEX IF EXISTS public\\.${alvo};`),
      `a migration não derruba ${alvo}`,
    )
  }
  assert.equal(
    (migration.match(/^DROP INDEX /gm) ?? []).length,
    ALVOS.length,
    "a migration derruba um número de índices diferente de onze",
  )
  // O retrato do antes é o que permite reprovar remoção fora da lista.
  assert.match(migration, /CREATE TEMP TABLE _indices_antes_20260903120000 ON COMMIT DROP/)
  assert.match(migration, /indice\(s\) fora da lista foram removidos/)
  assert.match(migration, /indice\(s\) da lista continuam presentes/)
  assert.match(migration, /idx_scan = 0/)
  // Schema puro: nada de escrita em tabela de conteúdo.
  assert.doesNotMatch(migration, /\b(INSERT INTO|UPDATE|DELETE FROM)\s+(public\.)?candidatos\b/i)
})

test("o rollback recria os onze com o DDL exato e devolve o ledger ao predecessor", () => {
  const rollback = readFileSync(rollbackPath, "utf8")
  for (const alvo of ALVOS) {
    assert.match(
      rollback,
      new RegExp(`CREATE INDEX IF NOT EXISTS ${alvo}\\b`),
      `o rollback não recria ${alvo}`,
    )
  }
  assert.match(
    rollback,
    /DELETE FROM supabase_migrations\.schema_migrations\s+WHERE version = '20260903120000'/,
  )
  // A fidelidade é provada por indexdef, não por presença.
  assert.match(rollback, /indexdef diferente do medido em producao/)
  assert.match(rollback, /USING btree \(candidato_id, orgao_codigo, mes_extrato DESC\)/)
  assert.match(rollback, /WHERE \(last_email_request_ip_hash IS NOT NULL\)/)
})

test("os dois readbacks cobrem ledger, ausência dos onze e os índices irmãos", () => {
  const readback = readFileSync(readbackPath, "utf8")
  assert.match(readback, /ledger sem a migration no topo/)
  assert.match(readback, /indice\(s\) fora da lista de remocao sumiram/)
  for (const irmao of [
    "idx_alert_subscribers_verified",
    "idx_indicadores_estado",
    "idx_indicadores_fonte",
    "idx_mudancas_candidato",
    "gastos_executivo_candidato_mes_idx",
    "news_refresh_lotes_pkey",
    "alert_subscribers_pkey",
  ]) {
    assert.ok(readback.includes(irmao), `o readback não protege o índice irmão ${irmao}`)
  }

  const rollbackReadback = readFileSync(rollbackReadbackPath, "utf8")
  assert.match(rollbackReadback, /esperado o predecessor 20260903100100/)
  assert.match(rollbackReadback, /indexdef diferente do medido em producao/)
  for (const alvo of ALVOS) {
    assert.ok(rollbackReadback.includes(alvo), `o readback de rollback não confere ${alvo}`)
  }
})

test("apply aplica numa transação, com predecessor 20260903100100, lock e ledger", () => {
  const runner = readFileSync(applyPath, "utf8")
  assert.match(runner, /version=20260903120000/)
  assert.match(runner, /previous_version=20260903100100/)
  assert.match(
    runner,
    /previous_digest=sha256:493799435353cbe9b9f074f7b4847bee31c2a8f35bcf6f2a0dbad0992e7e116f/,
  )
  assert.match(runner, /wskpzsobvqwhnbsdsmok/)
  assert.match(runner, /pg_advisory_xact_lock/)
  assert.match(runner, /drop-indices-sem-uso-production/)
  assert.match(runner, /BEGIN e um COMMIT externos/)
  assert.match(runner, /PGSSLMODE=verify-full/)
  assert.doesNotMatch(runner, /supabase db push|apply_migration/)
  assert.doesNotMatch(runner, /vocabulario|situacao_candidatura/i)
})

test("rollback runner exige a migration exata no topo e devolve o ledger", () => {
  const runner = readFileSync(rollbackRunnerPath, "utf8")
  assert.match(runner, /version=20260903120000/)
  assert.match(runner, /previous_version=20260903100100/)
  assert.match(runner, /rollback do drop de indices exige a migration exata no topo do ledger/)
  assert.match(runner, /rollback\.readback\.sql/)
  assert.doesNotMatch(runner, /vocabulario|situacao_candidatura/i)
})

test("workflows limitam a escrita a main, produção e um SHA fechado, e provam em PG17 antes", () => {
  for (const [path, script] of [
    [applyWorkflowPath, "apply-drop-indices-sem-uso-production\\.sh"],
    [rollbackWorkflowPath, "rollback-drop-indices-sem-uso-production\\.sh"],
  ] as const) {
    const workflow = readFileSync(path, "utf8")
    assert.match(workflow, /workflow_dispatch:/)
    assert.match(workflow, /expected_sha:/)
    assert.match(workflow, /environment: production/)
    assert.match(workflow, /production-db-migrations/)
    assert.match(workflow, /test "\$PF_EXPECTED_SHA" = "\$DISPATCH_SHA"/)
    assert.match(workflow, /bash scripts\/audit\/provar-drop-indices-sem-uso-pg17\.sh/)
    assert.match(workflow, new RegExp(`bash scripts/audit/${script}`))
    assert.equal((workflow.match(/SUPABASE_DB_URL/g) ?? []).length, 1)
  }
})

test("prova em PG17 mede as sete tabelas antes e depois, com a mesma imagem por digest", () => {
  const prova = readFileSync(provaPath, "utf8")
  assert.match(
    prova,
    /postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317/,
  )
  assert.match(prova, /== "21"/, "a contagem do pré-estado das sete tabelas saiu da prova")
  assert.match(prova, /== "10"/, "a contagem pós-drop saiu da prova")
  assert.match(prova, /forward readback aceitou o pre-estado/)
  assert.match(prova, /forward readback aceitou irmao removido/)
  assert.match(prova, /rollback aceitou migration posterior/)
  assert.match(prova, /indexdef apos rollback difere do estado inicial/)
  for (const alvo of ALVOS) {
    assert.ok(prova.includes(alvo), `a fixture da prova não cria ${alvo}`)
  }
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

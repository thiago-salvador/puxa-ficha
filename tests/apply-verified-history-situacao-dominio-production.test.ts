import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

import { SITUACAO_CANDIDATURA_DOMINIO } from "../src/lib/situacao-candidatura"
import { observeVerifiedCandidateChange, type VerifiedChangeObservation } from "../scripts/lib/verified-candidate-changes"

const root = process.cwd()
const version = "20260924120000"
const previousVersion = "20260924003000"
const migrationsDir = join(root, "supabase/migrations")
const originalPath = join(migrationsDir, "20260908160000_verified_candidate_updates.sql")
const migrationPath = join(migrationsDir, `${version}_verified_history_situacao_dominio.sql`)
const rollbackPath = join(root, `supabase/rollback/${version}_verified_history_situacao_dominio.rollback.sql`)
const readbackPath = join(root, `supabase/readback/${version}_verified_history_situacao_dominio.readback.sql`)
const rollbackReadbackPath = join(root, `supabase/readback/${version}_verified_history_situacao_dominio.rollback.readback.sql`)
const applyPath = join(root, "scripts/audit/apply-verified-history-situacao-dominio-production.sh")
const workflowPath = join(root, ".github/workflows/apply-verified-history-situacao-dominio-production.yml")
const proofPath = join(root, "scripts/audit/provar-verified-history-situacao-dominio-pg17.sh")

const FUNCTION_HEADER = "FUNCTION public.observe_verified_candidate_change("

/** Corpo da RPC, do CREATE ao GRANT, como está no arquivo. */
function rpcDefinition(sql: string): string {
  const start = sql.search(/CREATE (?:OR REPLACE )?FUNCTION public\.observe_verified_candidate_change\(/)
  assert.notEqual(start, -1, "definição da RPC não encontrada")
  const grant = sql.indexOf("GRANT EXECUTE ON FUNCTION public.observe_verified_candidate_change", start)
  assert.notEqual(grant, -1, "GRANT da RPC não encontrado")
  return sql.slice(start, sql.indexOf("\n", grant) + 1)
}

/** Lista de situações aceitas pela RPC, na ordem escrita. */
function rpcSituacoes(sql: string): string[] {
  const definition = rpcDefinition(sql)
  const branch = definition.indexOf("ELSIF p_field = 'situacao' THEN")
  assert.notEqual(branch, -1, "ramo da situação não encontrado")
  const open = definition.indexOf("NOT IN (", branch)
  const close = definition.indexOf(")", open)
  assert.ok(open > branch && close > open, "lista NOT IN da situação não encontrada")
  const values = [...definition.slice(open, close).matchAll(/'([^']*)'/g)].map((m) => m[1])
  assert.ok(values.length >= 3, `só ${values.length} valor(es) lidos da RPC`)
  return values
}

/** A definição vigente é a da última migration, em ordem de arquivo, que cria ou troca a RPC. */
function currentRpcMigration(): string {
  const files = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()
  const defining = files.filter((name) => readFileSync(join(migrationsDir, name), "utf8").includes(FUNCTION_HEADER))
  assert.ok(defining.length >= 2, "esperadas a definição original e a troca da lista")
  return join(migrationsDir, defining.at(-1)!)
}

test("a lista original da RPC não tinha 'pendente de julgamento' (a falha da coleta semanal)", () => {
  const original = rpcSituacoes(readFileSync(originalPath, "utf8"))
  assert.equal(original.includes("pendente de julgamento"), false)
  assert.ok(SITUACAO_CANDIDATURA_DOMINIO.includes("pendente de julgamento"))
  assert.notDeepEqual(original, [...SITUACAO_CANDIDATURA_DOMINIO])
})

test("a RPC vigente aceita exatamente o domínio de situacao_candidatura, na mesma ordem", () => {
  assert.deepEqual(rpcSituacoes(readFileSync(migrationPath, "utf8")), [...SITUACAO_CANDIDATURA_DOMINIO])
  // Guarda para frente: quem trocar a RPC de novo carrega o domínio inteiro.
  assert.deepEqual(rpcSituacoes(readFileSync(currentRpcMigration(), "utf8")), [...SITUACAO_CANDIDATURA_DOMINIO])
})

test("fora a lista da situação, a RPC é a mesma da definição original", () => {
  const normalize = (sql: string) => rpcDefinition(sql)
    .replace(/^CREATE (?:OR REPLACE )?FUNCTION/, "CREATE FUNCTION")
    .replace(/NOT IN \(\s*'aguardando julgamento'[^)]*\)/, "NOT IN (<dominio>)")
    .replace(/\s+/g, " ")
  assert.equal(normalize(readFileSync(migrationPath, "utf8")), normalize(readFileSync(originalPath, "utf8")))
  const migration = readFileSync(migrationPath, "utf8")
  assert.match(migration, /SECURITY DEFINER SET search_path = pg_catalog, public/)
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.observe_verified_candidate_change\(uuid,text,integer,text,text,text\) FROM PUBLIC, anon, authenticated;/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.observe_verified_candidate_change\(uuid,text,integer,text,text,text\) TO service_role;/)
})

test("o rollback restaura a lista original byte a byte e remove só a linha do ledger", () => {
  const rollback = readFileSync(rollbackPath, "utf8")
  assert.equal(
    rpcDefinition(rollback).replace(/^CREATE OR REPLACE FUNCTION/, "CREATE FUNCTION"),
    rpcDefinition(readFileSync(originalPath, "utf8")),
  )
  assert.match(rollback, /DELETE FROM supabase_migrations\.schema_migrations WHERE version = '20260924120000'/)
  assert.doesNotMatch(rollback, /DELETE FROM public\.|DROP TABLE|TRUNCATE/)
})

test("o readback confere o domínio vivo, aceita 'pendente de julgamento' e rejeita valor fora dele", () => {
  const readback = readFileSync(readbackPath, "utf8")
  const esperado = readback.slice(readback.indexOf("esperado constant text[] := ARRAY["), readback.indexOf("];"))
  assert.deepEqual([...esperado.matchAll(/'([^']*)'/g)].map((m) => m[1]), [...SITUACAO_CANDIDATURA_DOMINIO])
  assert.match(readback, /candidatos_situacao_candidatura_dominio/)
  assert.match(readback, /'Pendente de Julgamento'/)
  assert.match(readback, /WHEN foreign_key_violation OR read_only_sql_transaction THEN NULL;/)
  assert.match(readback, /ARRAY\['renuncia', 'cancelado', 'falecido', 'cassado', 'apto', 'pendente'\]/)
  assert.match(readback, /'Invalid verified registration status'/)
  const rollbackReadback = readFileSync(rollbackReadbackPath, "utf8")
  assert.match(rollbackReadback, /pendente de julgamento still accepted/)
})

test("migration e readbacks cabem no runner transacional", () => {
  for (const path of [migrationPath, readbackPath, rollbackReadbackPath, rollbackPath]) {
    const sql = readFileSync(path, "utf8")
    assert.equal((sql.match(/^\s*BEGIN(?: READ ONLY)?;\s*$/gim) ?? []).length, 1, path)
    assert.equal((sql.match(/^\s*COMMIT;\s*$/gim) ?? []).length, 1, path)
    assert.doesNotMatch(sql, /^\s*(ROLLBACK;|SET ROLE)/im, path)
  }
  // A migration só troca a função: nenhuma linha de dado muda.
  const migration = readFileSync(migrationPath, "utf8")
  const outsideFunction = migration.replace(rpcDefinition(migration), "")
  assert.doesNotMatch(outsideFunction, /\b(INSERT INTO|UPDATE public\.|DELETE FROM|TRUNCATE)\b/)
})

test(`apply exige o predecessor ${previousVersion} e calcula o digest dele do arquivo`, () => {
  const runner = readFileSync(applyPath, "utf8")
  assert.match(runner, new RegExp(`version=${version}`))
  assert.match(runner, new RegExp(`previous_version=${previousVersion}`))
  assert.match(runner, /_senado_exercicio_reaberto\.sql/)
  assert.match(runner, /_verified_history_situacao_dominio\.sql/)
  assert.match(runner, /previous_digest="sha256:\$\(shasum -a 256 "\$previous_migration"/)
  assert.doesNotMatch(runner, /sha256:[0-9a-f]{8,}/)
  assert.match(runner, /wskpzsobvqwhnbsdsmok/)
  assert.match(runner, /PGSSLMODE=verify-full/)
  assert.doesNotMatch(runner, /supabase db push|apply_migration/)
  // O predecessor é a migration imediatamente anterior em ordem de arquivo.
  const files = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()
  const own = files.indexOf(`${version}_verified_history_situacao_dominio.sql`)
  assert.equal(files[own - 1], `${previousVersion}_senado_exercicio_reaberto.sql`)
})

test("workflow limita a escrita a main, produção e um SHA fechado", () => {
  const workflow = readFileSync(workflowPath, "utf8")
  assert.match(workflow, /workflow_dispatch:/)
  assert.match(workflow, /expected_sha:/)
  assert.match(workflow, /environment: production/)
  assert.match(workflow, /production-db-migrations/)
  assert.match(workflow, /test "\$PF_EXPECTED_SHA" = "\$DISPATCH_SHA"/)
  assert.match(workflow, /bash scripts\/audit\/apply-verified-history-situacao-dominio-production\.sh/)
  assert.match(readFileSync(proofPath, "utf8"), /tests\/verified-history-situacao-dominio\.pg\.sql/)
})

test("o coletor manda 'pendente de julgamento' para a RPC em vez de pular", async () => {
  const observation: VerifiedChangeObservation = {
    candidateId: "00000000-0000-4000-8000-000000000001", field: "situacao", year: 2026,
    value: "pendente de julgamento", sq: "123456", uf: "RN", identityVerified: true,
    sourceUrl: "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand_complementar/consulta_cand_complementar_2026.zip",
  }
  const calls: string[] = []
  const result = await observeVerifiedCandidateChange(observation, {
    confirmPersisted: async () => true,
    rpc: async (_name, args) => {
      calls.push(args.p_value)
      return { data: "changed", error: null }
    },
  })
  assert.equal(result, "changed")
  assert.deepEqual(calls, ["pendente de julgamento"])
  // O que o coletor manda e o que a RPC aceita são o mesmo conjunto.
  const aceitos = rpcSituacoes(readFileSync(currentRpcMigration(), "utf8"))
  for (const valor of SITUACAO_CANDIDATURA_DOMINIO) assert.ok(aceitos.includes(valor), valor)
})

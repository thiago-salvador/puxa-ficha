import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const version = "20260906065729_corrigir_completude_fichas_residual"
const migration = readFileSync(`supabase/migrations/${version}.sql`, "utf8")
const readback = readFileSync(`supabase/readback/${version}.readback.sql`, "utf8")
const rollback = readFileSync(`supabase/rollback/${version}.rollback.sql`, "utf8")
const rollbackReadback = readFileSync(`supabase/readback/${version}.rollback.readback.sql`, "utf8")

test("completude residual preserva onze linhas homônimas antes de despublicar", () => {
  assert.match(migration, /identidade_timeline_quarentena_snapshot/)
  assert.match(migration, /migration_version='20260906065729'/)
  assert.match(migration, /snapshot esperado=11/)
  assert.match(migration, /to_jsonb\(h\)=s\.preimage/)
  assert.match(migration, /to_jsonb\(m\)=s\.preimage/)
  assert.match(migration, /to_jsonb\(f\)=s\.preimage/)
  assert.match(readback, /postimage divergente/)
})

test("quatro zeros de bens carregam identidade e URL oficial exatas", () => {
  for (const [sq, path] of [
    ["250001263474", "/2020/62057/2030402020/candidato/250001263474"],
    ["250000881915", "/2020/71072/2030402020/candidato/250000881915"],
    ["10000000002", "/2014/AC/680/candidato/10000000002"],
    ["70000000161", "/2014/DF/680/candidato/70000000161"],
  ]) {
    assert.match(migration, new RegExp(sq))
    assert.match(migration, new RegExp(path))
  }
  assert.match(migration, /st_DIVULGA_BENS=true, bens=\[\] e totalDeBens=0/)
  assert.match(migration, /execucao='migration:20260906065729'/)
  assert.match(readback, /ausências oficiais esperadas=4/)
})

test("rollback restaura pré-imagens e remove somente o delta desta migration", () => {
  assert.match(rollback, /to_jsonb\(t\)=s\.postimage/)
  assert.match(rollback, /DELETE FROM public\.patrimonio_ausencia_oficial WHERE execucao='migration:20260906065729'/)
  assert.match(rollback, /DELETE FROM public\.identidade_timeline_quarentena_snapshot WHERE migration_version='20260906065729'/)
  assert.match(rollbackReadback, /restaurados=11 ausencias_removidas=4/)
})

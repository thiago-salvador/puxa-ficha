import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const ROOT = process.cwd()
const migration = readFileSync(join(ROOT, "supabase/migrations/20260813111700_chapas_2026_biografias_coerentes.sql"), "utf8")
const readback = readFileSync(join(ROOT, "supabase/readback/20260813111700_chapas_2026_biografias_coerentes.readback.sql"), "utf8")
const rollback = readFileSync(join(ROOT, "supabase/rollback/20260813111700_chapas_2026_biografias_coerentes.rollback.sql"), "utf8")
const view = readFileSync(join(ROOT, "src/app/(site)/candidato/[slug]/CandidatoFichaView.tsx"), "utf8")
const api = readFileSync(join(ROOT, "src/lib/api.ts"), "utf8")
const slugs = ["eduardo-girao", "francisco-dias", "geraldo-alckmin", "luiz-carlos-teodoro", "rafael-greca", "raquel-bricio"]

test("migration corrige exatamente as seis biografias incompatíveis", () => {
  assert.match(migration, /compare-and-swap: esperava atualizar 6 biografias antigas exatas/)
  assert.match(migration, /c\.biografia=e\.biografia_antiga/)
  assert.match(migration, /c\.ultima_atualizacao='2026-08-13T07:37:13Z'/)
  assert.match(migration, /GET DIAGNOSTICS atualizadas = ROW_COUNT/)
  for (const trecho of ["PFL", "PMDB/MDB", "mudança institucional de sigla", "12 de outubro de 1991", "cursa Direito", "em 2020", "em 2022"]) {
    assert.match(migration, new RegExp(trecho))
  }
  assert.equal((migration.match(/^\s*-- @write tabela=candidatos slug=/gm) ?? []).length, 6)
  for (const slug of slugs) assert.match(migration, new RegExp(slug))
  assert.doesNotMatch(migration, /^BEGIN;|^COMMIT;/m)
  assert.match(readback, /esperava 6 biografias novas exatas/)
  assert.match(readback, /c\.biografia=e\.biografia_nova/)
  assert.doesNotMatch(readback, /position\(/i)
  assert.match(rollback, /rollback recusado: esperava restaurar 6 biografias novas exatas/)
  assert.match(rollback, /GET DIAGNOSTICS restauradas = ROW_COUNT/)
  assert.match(rollback, /DELETE FROM supabase_migrations\.schema_migrations WHERE version='20260813111700'/)
})

test("card sempre rotula titular e vice uma única vez", () => {
  assert.match(view, /data-pf-chapa-titular/)
  assert.match(view, /data-pf-chapa-vice/)
  assert.match(view, /Titular:\{" "\}/)
  assert.match(view, /Vice:\{" "\}/)
  assert.doesNotMatch(view, /const chapaParceiro/)
  assert.doesNotMatch(view, /\{chapaParceiro\?\.label\}/)
})

test("cache da ficha muda junto com biografia e card", () => {
  assert.equal((api.match(/chapas-bio-card-20260813/g) ?? []).length, 2)
})

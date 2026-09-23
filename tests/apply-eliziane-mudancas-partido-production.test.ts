import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

import { hasIncompletePartyTimeline } from "../src/lib/candidate-integrity"
import {
  countPartySwitches,
  formatPartyTransitionLabel,
  hasSameYearPartyReversal,
  normalizePartyTimelineForDisplay,
  partiesMatchForTimeline,
} from "../src/lib/party-switches"
import type { MudancaPartido } from "../src/lib/types"

const root = process.cwd()
const version = "20260923233000"
const previousVersion = "20260923175946"
const applyPath = join(root, "scripts/audit/apply-eliziane-mudancas-partido-production.sh")
const workflowPath = join(root, ".github/workflows/apply-eliziane-mudancas-partido-production.yml")
const migrationPath = join(root, `supabase/migrations/${version}_eliziane_mudancas_partido.sql`)
const rollbackPath = join(root, `supabase/rollback/${version}_eliziane_mudancas_partido.rollback.sql`)
const readbackPath = join(root, `supabase/readback/${version}_eliziane_mudancas_partido.readback.sql`)
const CANDIDATO = "b8e8b3d1-1e2e-482f-b0dd-dbf927c5c681"

test(`apply exige o predecessor ${previousVersion} e calcula o digest dele do arquivo`, () => {
  const runner = readFileSync(applyPath, "utf8")
  assert.match(runner, new RegExp(`version=${version}`))
  assert.match(runner, new RegExp(`previous_version=${previousVersion}`))
  assert.match(runner, /_eliziane_partido_tse_2026\.sql/)
  assert.match(runner, /previous_digest="sha256:\$\(shasum -a 256 "\$previous_migration"/)
  assert.doesNotMatch(runner, /sha256:[0-9a-f]{8,}/)
  assert.match(runner, /wskpzsobvqwhnbsdsmok/)
  assert.match(runner, /PGSSLMODE=verify-full/)
  assert.match(runner, /alert_cohort_subscriptions/)
  assert.doesNotMatch(runner, /supabase db push|apply_migration/)
})

test("workflow limita a escrita a main, produção e um SHA fechado", () => {
  const workflow = readFileSync(workflowPath, "utf8")
  assert.match(workflow, /workflow_dispatch:/)
  assert.match(workflow, /expected_sha:/)
  assert.match(workflow, /environment: production/)
  assert.match(workflow, /production-db-migrations/)
  assert.match(workflow, /test "\$PF_EXPECTED_SHA" = "\$DISPATCH_SHA"/)
  assert.match(workflow, /bash scripts\/audit\/apply-eliziane-mudancas-partido-production\.sh/)
})

test("migration e readback cabem no runner transacional", () => {
  for (const path of [migrationPath, readbackPath]) {
    const sql = readFileSync(path, "utf8")
    assert.equal((sql.match(/^\s*BEGIN(?: READ ONLY)?;\s*$/gim) ?? []).length, 1, path)
    assert.equal((sql.match(/^\s*COMMIT;\s*$/gim) ?? []).length, 1, path)
    assert.doesNotMatch(sql, /^\s*(ROLLBACK;|SET ROLE)/im, path)
  }
  const migration = readFileSync(migrationPath, "utf8")
  const guardAssinante = migration.indexOf("alert_cohort_subscriptions")
  const primeiraEscrita = migration.indexOf("INSERT INTO public.mudancas_partido")
  assert.ok(guardAssinante > 0 && guardAssinante < primeiraEscrita, "guard de assinante vem antes da escrita")
  assert.match(migration, /FOR UPDATE;/)
  assert.match(migration, /current_setting\('pf\.replay', true\) = 'true'/)
  const rollback = readFileSync(rollbackPath, "utf8")
  assert.match(rollback, /DELETE FROM public\.candidate_changes/)
  assert.match(rollback, /DELETE FROM supabase_migrations\.schema_migrations WHERE version = '20260923233000'/)
})

function linhasDaMigration(): MudancaPartido[] {
  const sql = readFileSync(migrationPath, "utf8")
  const tuplas = [...sql.matchAll(
    /\(row_ids\[(\d)\],'([^']+)','([^']+)',(\d{4}),(?:date '([\d-]+)'|NULL),\s*'([^']+)'/g,
  )]
  return tuplas.map((m) => ({
    id: `linha-${m[1]}`,
    candidato_id: CANDIDATO,
    partido_anterior: m[2],
    partido_novo: m[3],
    ano: Number(m[4]),
    data_mudanca: m[5] ?? null,
    contexto: m[6],
  })) as MudancaPartido[]
}

test("as quatro linhas formam uma trajetória contínua que termina no partido da ficha", () => {
  const linhas = linhasDaMigration()
  assert.equal(linhas.length, 4)
  for (let i = 1; i < linhas.length; i++) {
    assert.ok(partiesMatchForTimeline(linhas[i].partido_anterior, linhas[i - 1].partido_novo))
  }
  assert.equal(new Set(linhas.map((l) => `${l.ano}|${l.partido_novo}`)).size, 4, "respeita a unicidade (ano, partido_novo)")
  assert.equal(hasSameYearPartyReversal(linhas), false)
  assert.equal(hasIncompletePartyTimeline(linhas, "PT", "PT"), false)

  const exibidas = normalizePartyTimelineForDisplay(linhas)
  assert.equal(exibidas.length, 4)
  // O nome exibido acompanha o ano: PPS até 2016, Cidadania na saída de 2023.
  assert.deepEqual(exibidas.map(formatPartyTransitionLabel), [
    "PPS → REDE",
    "REDE → PPS",
    "CIDADANIA → PSD",
    "PSD → PT",
  ])
  assert.equal(countPartySwitches(linhas), 4)
})

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

import { normalizeHistoricoPoliticoForDisplay } from "../src/lib/historico-dedupe"
import type { HistoricoPolitico } from "../src/lib/types"
import { deriveSenadoMandatoEvidence } from "../scripts/lib/senado-mandato-evidence"

const root = process.cwd()
const version = "20260924003000"
const previousVersion = "20260923233000"
const applyPath = join(root, "scripts/audit/apply-senado-exercicio-reaberto-production.sh")
const workflowPath = join(root, ".github/workflows/apply-senado-exercicio-reaberto-production.yml")
const migrationPath = join(root, `supabase/migrations/${version}_senado_exercicio_reaberto.sql`)
const rollbackPath = join(root, `supabase/rollback/${version}_senado_exercicio_reaberto.rollback.sql`)
const readbackPath = join(root, `supabase/readback/${version}_senado_exercicio_reaberto.readback.sql`)
const allowlistPath = join(root, "scripts/audit/allowlist-senado-exercicio-reaberto-20260924.json")

type Alvo = {
  slug: string
  candidatoId: string
  uf: string
  senadoCodigo: string
  codigoMandato: string
  anteriorId: string
  anteriorInicio: number
  anteriorFim: number
  novoId: string
  novoInicio: number
  exercicioAberto: string
  exercicioAbertoInicio: string
  exercicioAnterior: string
  exercicioAnteriorFim: string
}

function alvosDaMigration(): Alvo[] {
  const sql = readFileSync(migrationPath, "utf8")
  const tuplas = [...sql.matchAll(
    /\('(tse-2026-\d+)','([0-9a-f-]{36})','\d+','([A-Z]{2})','(\d+)','(\d+)','([0-9a-f-]{36})',(\d{4}),(\d{4}),\d,'([0-9a-f-]{36})',(\d{4}),'(\d+)',date '([\d-]+)','(\d+)',date '([\d-]+)','[A-Z]+','[0-9a-f]{64}'\)/g,
  )]
  return tuplas.map((m) => ({
    slug: m[1], candidatoId: m[2], uf: m[3], senadoCodigo: m[4], codigoMandato: m[5],
    anteriorId: m[6], anteriorInicio: Number(m[7]), anteriorFim: Number(m[8]),
    novoId: m[9], novoInicio: Number(m[10]), exercicioAberto: m[11], exercicioAbertoInicio: m[12],
    exercicioAnterior: m[13], exercicioAnteriorFim: m[14],
  }))
}

test(`apply exige o predecessor ${previousVersion} e calcula o digest dele do arquivo`, () => {
  const runner = readFileSync(applyPath, "utf8")
  assert.match(runner, new RegExp(`version=${version}`))
  assert.match(runner, new RegExp(`previous_version=${previousVersion}`))
  assert.match(runner, /_eliziane_mudancas_partido\.sql/)
  assert.match(runner, /previous_digest="sha256:\$\(shasum -a 256 "\$previous_migration"/)
  assert.doesNotMatch(runner, /sha256:[0-9a-f]{8,}/)
  assert.match(runner, /wskpzsobvqwhnbsdsmok/)
  assert.match(runner, /PGSSLMODE=verify-full/)
  assert.doesNotMatch(runner, /supabase db push|apply_migration/)
})

test("workflow limita a escrita a main, produção e um SHA fechado", () => {
  const workflow = readFileSync(workflowPath, "utf8")
  assert.match(workflow, /workflow_dispatch:/)
  assert.match(workflow, /expected_sha:/)
  assert.match(workflow, /environment: production/)
  assert.match(workflow, /production-db-migrations/)
  assert.match(workflow, /test "\$PF_EXPECTED_SHA" = "\$DISPATCH_SHA"/)
  assert.match(workflow, /bash scripts\/audit\/apply-senado-exercicio-reaberto-production\.sh/)
})

test("migration e readback cabem no runner transacional", () => {
  for (const path of [migrationPath, readbackPath]) {
    const sql = readFileSync(path, "utf8")
    assert.equal((sql.match(/^\s*BEGIN(?: READ ONLY)?;\s*$/gim) ?? []).length, 1, path)
    assert.equal((sql.match(/^\s*COMMIT;\s*$/gim) ?? []).length, 1, path)
    assert.doesNotMatch(sql, /^\s*(ROLLBACK;|SET ROLE)/im, path)
  }
  const migration = readFileSync(migrationPath, "utf8")
  assert.match(migration, /FOR UPDATE OF c/)
  assert.match(migration, /current_setting\('pf\.replay', true\) = 'true'/)
  assert.match(migration, /ON COMMIT DROP/)
  // Só INSERT em historico_politico: nenhuma linha existente muda.
  assert.doesNotMatch(migration, /UPDATE public\.historico_politico|DELETE FROM public\.historico_politico/)
  // historico_politico não alimenta candidate_changes: nada a limpar do digest.
  assert.doesNotMatch(migration, /(INSERT INTO|DELETE FROM) public\.candidate_changes/)
  const rollback = readFileSync(rollbackPath, "utf8")
  assert.match(rollback, /DELETE FROM supabase_migrations\.schema_migrations WHERE version = '20260924003000'/)
})

test("dez alvos, um INSERT anotado por slug, coerentes com a allowlist e com os readbacks", () => {
  const alvos = alvosDaMigration()
  assert.equal(alvos.length, 10)
  assert.equal(new Set(alvos.map((a) => a.slug)).size, 10)
  assert.equal(new Set(alvos.map((a) => a.novoId)).size, 10)
  const migration = readFileSync(migrationPath, "utf8")
  const readback = readFileSync(readbackPath, "utf8")
  const allowlist = JSON.parse(readFileSync(allowlistPath, "utf8")) as { coorte: string[] }
  assert.deepEqual([...allowlist.coorte].sort(), alvos.map((a) => a.slug).sort())
  for (const alvo of alvos) {
    assert.match(migration, new RegExp(`@write tabela=historico_politico slug=${alvo.slug} `))
    assert.match(migration, new RegExp(`senador/${alvo.senadoCodigo}/mandatos\\.json`))
    assert.ok(readback.includes(alvo.novoId), `${alvo.slug}: readback confere a linha nova`)
    assert.ok(readback.includes(alvo.anteriorId), `${alvo.slug}: readback confere a linha anterior`)
    assert.ok(readback.includes(`${alvo.slug}:${alvo.novoInicio}-atual/${alvo.uf}/`), alvo.slug)
    // O exercício aberto começa depois do anterior e no ano gravado.
    assert.ok(alvo.exercicioAbertoInicio > alvo.exercicioAnteriorFim, alvo.slug)
    assert.equal(Number(alvo.exercicioAbertoInicio.slice(0, 4)), alvo.novoInicio, alvo.slug)
    assert.equal(Number(alvo.exercicioAnteriorFim.slice(0, 4)), alvo.anteriorFim, alvo.slug)
    assert.equal(alvo.anteriorInicio, 2019, alvo.slug)
  }
})

test("a linha de Eliziane é a mesma que o importador deriva do payload do Senado", () => {
  const payload = JSON.parse(readFileSync(join(root, "tests/fixtures/senado-mandatos-5718.json"), "utf8"))
  const mandatos = [payload.MandatoParlamentar.Parlamentar.Mandatos.Mandato].flat()
  const eliziane = alvosDaMigration().find((a) => a.senadoCodigo === "5718")!
  const mandato = mandatos.find((m: Record<string, unknown>) => m.CodigoMandato === eliziane.codigoMandato)
  const evidence = deriveSenadoMandatoEvidence(mandato)
  assert.deepEqual(evidence.periodos.map((p) => [p.inicio, p.fim, p.inicioData, p.fimData]), [
    [eliziane.anteriorInicio, eliziane.anteriorFim, "2019-02-01", eliziane.exercicioAnteriorFim],
    [eliziane.novoInicio, null, eliziane.exercicioAbertoInicio, null],
  ])
  assert.equal(evidence.eleitoPor, "voto direto")
  assert.equal(evidence.partido, null)
})

test("na ficha, o mandato volta a aparecer como atual sem apagar o primeiro intervalo", () => {
  for (const alvo of alvosDaMigration()) {
    const base = { candidato_id: alvo.candidatoId, cargo: "Senador", partido: "", estado: alvo.uf, eleito_por: "voto direto", observacoes: null, tipo_evento: "mandato", proveniencia: "senado" }
    const anterior = { ...base, id: alvo.anteriorId, periodo_inicio: alvo.anteriorInicio, periodo_fim: alvo.anteriorFim } as unknown as HistoricoPolitico
    const novo = { ...base, id: alvo.novoId, periodo_inicio: alvo.novoInicio, periodo_fim: null } as unknown as HistoricoPolitico
    const exibidas = normalizeHistoricoPoliticoForDisplay([anterior, novo])
      .map((row) => `${row.periodo_inicio}-${row.periodo_fim ?? "atual"}`)
      .sort()
    assert.deepEqual(exibidas, [`${alvo.anteriorInicio}-${alvo.anteriorFim}`, `${alvo.novoInicio}-atual`].sort(), alvo.slug)
  }
})

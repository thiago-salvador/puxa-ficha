import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import test from "node:test"
import {
  buildPlan,
  findReintroductionTargets,
  readManifest,
  type QuarantineEntry,
} from "../scripts/apply-quiz-position-quarantine"

const expectedGlobalIndexes = [
  10, 11, 17, 19, 26, 33, 41, 70, 74, 91, 92, 108, 116, 119,
  130, 150, 152, 159, 186, 187, 188, 218, 240, 276, 287, 288,
  300, 304,
]

function rowsFor(entries: QuarantineEntry[]) {
  return entries.map((entry) => ({
    ...entry,
    id: `row-${entry.global_index}`,
    descricao: `descrição original ${entry.global_index}`,
    fonte: `fonte original ${entry.global_index}`,
    verificado: true,
    gerado_por: "seed",
    created_at: "2026-01-01T00:00:00.000Z",
  }))
}

function syntheticEntries(entries: QuarantineEntry[]) {
  return entries.map((entry) => ({
    ...entry,
    expected_descricao_sha256: createHash("sha256").update(`descrição original ${entry.global_index}`, "utf8").digest("hex"),
  }))
}

test("manifesto contém exatamente o lote insuficiente e o homônimo extra", () => {
  const entries = syntheticEntries(readManifest())
  assert.deepEqual(entries.map((entry) => entry.global_index).sort((a, b) => a - b), expectedGlobalIndexes)
  assert.equal(entries.some((entry) => [24, 25, 205].includes(entry.global_index)), false)

  const alvaro = entries.find((entry) => entry.global_index === 188)
  assert.deepEqual(
    { candidate_id: alvaro?.candidate_id, slug: alvaro?.slug, tema: alvaro?.tema },
    {
      candidate_id: "c89aaf3b-a9a7-4a95-856a-5b65df38cc80",
      slug: "alvaro-dias-rn",
      tema: "transferencia_renda",
    },
  )
})

test("plano usa a chave nominal e altera apenas verificado", () => {
  const entries = syntheticEntries(readManifest())
  const plan = buildPlan(entries, rowsFor(entries))

  assert.equal(plan.length, 28)
  assert.equal(plan.every((item) => item.status === "update"), true)
  assert.equal(plan.every((item) => item.after.verificado === false), true)
  for (const item of plan) {
    for (const field of ["candidate_id", "tema", "posicao", "descricao", "fonte", "url_fonte", "gerado_por", "created_at"] as const) {
      assert.equal(item.after[field], item.before[field], `${field} mudou em ${item.entry.global_index}`)
    }
  }
})

test("plano falha fechado quando a posição original diverge", () => {
  const entries = syntheticEntries(readManifest())
  const rows = rowsFor(entries)
  rows[0].posicao = rows[0].posicao === "a_favor" ? "contra" : "a_favor"
  assert.throws(() => buildPlan(entries, rows), /CAS: posição ausente ou divergente/)
})

test("plano falha fechado quando a descrição auditada diverge", () => {
  const entries = syntheticEntries(readManifest())
  const rows = rowsFor(entries)
  rows[0].descricao = "descrição corrigida depois da auditoria"
  assert.throws(() => buildPlan(entries, rows), /CAS: descrição divergente/)
})

test("guard bloqueia reintrodução futura verificada e ignora migration histórica", () => {
  const [entry] = readManifest()
  const future = `insert into posicoes_declaradas (candidato_id, tema, posicao, url_fonte, verificado) values ('${entry.candidate_id}', '${entry.tema}', '${entry.posicao}', '${entry.url_fonte}', true);`
  const futureQuarantined = future.replace("true", "false")
  const violations = findReintroductionTargets([
    { name: "20260404200000_positions.sql", source: future },
    { name: "20260917190001_reintroduce.sql", source: future },
    { name: "20260917190002_allowed.sql", source: futureQuarantined },
  ])
  assert.deepEqual(violations, ["20260917190001_reintroduce.sql:10"])
})

test("a atualização aplicada é restrita à flag de verificação", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../scripts/apply-quiz-position-quarantine.ts", import.meta.url), "utf8"))
  assert.match(source, /\.update\(\{ verificado: false \}\)/)
  assert.doesNotMatch(source, /\.update\(\{[^}]*descricao/)
  assert.doesNotMatch(source, /\.update\(\{[^}]*url_fonte/)
})

test("migration publica as 28 chaves e bloqueia reativação no banco", async () => {
  const [source, entries] = await Promise.all([
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../supabase/migrations/20260917190000_quiz_position_quarantine_guard.sql", import.meta.url), "utf8")),
    Promise.resolve(readManifest()),
  ])
  for (const entry of entries) {
    assert.match(source, new RegExp(entry.candidate_id))
    assert.match(source, new RegExp(entry.url_fonte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  }
  assert.match(source, /CREATE TABLE IF NOT EXISTS public\.quiz_position_quarantine/)
  assert.match(source, /CREATE OR REPLACE FUNCTION public\.block_quiz_position_reactivation/)
  assert.match(source, /BEFORE INSERT OR UPDATE OF verificado, candidato_id, tema, posicao, url_fonte/)
  assert.match(source, /NEW\.verificado := false/)
  assert.match(source, /SECURITY INVOKER/)
})

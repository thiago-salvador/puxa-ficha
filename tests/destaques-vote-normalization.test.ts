import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { normalizeDestaquesVote } from "../scripts/lib/destaques-vote-normalization"
import { DESTAQUES_EXPECTED_PAIRS } from "../scripts/lib/destaques-votacoes-provenance"

test("normalização de destaques é idempotente inclusive artigo_17 persistido", () => {
  for (const [input, expected] of [["Sim", "sim"], ["Não", "não"], ["Abstenção", "abstencao"], ["Obstrução", "obstrucao"], ["Ausente", "ausente"], ["Artigo 17", "artigo_17"]]) {
    assert.equal(normalizeDestaquesVote(input), expected)
    assert.equal(normalizeDestaquesVote(expected), expected)
  }
  assert.equal(normalizeDestaquesVote("Artigo 17"), normalizeDestaquesVote("artigo_17"))
  for (const input of [undefined, null, "", "artigo 18", "artigo17", "não coletado"]) {
    assert.equal(normalizeDestaquesVote(input), null)
  }
})

test("snapshot exige cardinalidade exata do universo vigente de destaques", () => {
  const sql = readFileSync("scripts/audit/data-freshness-snapshot.sql", "utf8")
  const count = sql.match(/count\(\*\) FILTER \(WHERE log\.escopo = 'candidato' AND log\.detalhe LIKE 'provenance_v1:%'\) = (\d+)/)
  assert.ok(count)
  assert.equal(Number(count[1]), DESTAQUES_EXPECTED_PAIRS)
})

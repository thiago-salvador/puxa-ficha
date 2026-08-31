import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import test from "node:test"
import {
  buildDestaquesRunManifest,
  compareDestaquesRuns,
  validateDestaquesRunManifest,
  type DestaquesRunManifest,
} from "../scripts/lib/destaques-votacoes-provenance"

const RUN_A = "QA/evidencias/2026-08-30-destaques-votacoes/run-c/manifest.json"
const RUN_B = "QA/evidencias/2026-08-30-destaques-votacoes/run-d/manifest.json"

function load(path: string): DestaquesRunManifest {
  const root = dirname(path)
  const manifest = JSON.parse(readFileSync(path, "utf8")) as DestaquesRunManifest
  return validateDestaquesRunManifest(manifest, (artifact) => readFileSync(join(root, artifact)))
}

test("dupla leitura cobre o universo real e repete hashes de fonte, votação e par", () => {
  const receipt = compareDestaquesRuns(load(RUN_A), load(RUN_B))
  assert.deepEqual(receipt.summary, {
    votacoes: 23,
    pairs: 154,
    candidates: 30,
    sources: 93,
    pares_encontrados: 151,
    pares_sem_achado: 3,
    pares_divergentes: 1,
    votacoes_mapeadas: 21,
    votacoes_sem_id_oficial: 2,
  })
  assert.equal(receipt.source_hashes_match, true)
  assert.equal(receipt.vote_hashes_match, true)
  assert.equal(receipt.pair_hashes_match, true)
  assert.match(receipt.comparison_sha256, /^[a-f0-9]{64}$/)
})

test("gate rejeita evidência sem hash bruto e artefato correspondente", () => {
  const manifest = JSON.parse(readFileSync(RUN_A, "utf8")) as DestaquesRunManifest
  manifest.sources[0].payload_raw_sha256 = ""
  assert.throws(
    () => validateDestaquesRunManifest(manifest, (artifact) => readFileSync(join(dirname(RUN_A), artifact))),
    /SHA-256 ausente/,
  )
})

test("gate rejeita timestamp único de execução para respostas oficiais distintas", () => {
  const run = load(RUN_A)
  const sharedTimestamp = run.sources[0].checked_at
  run.checked_at = sharedTimestamp
  run.sources = run.sources.map((source) => ({ ...source, checked_at: sharedTimestamp }))
  run.pairs = run.pairs.map((pair) => ({ ...pair, checked_at: sharedTimestamp }))
  assert.throws(
    () => buildDestaquesRunManifest({
      schema_version: run.schema_version,
      source_id: run.source_id,
      execution_id: run.execution_id,
      checked_at: run.checked_at,
      database_project_ref: run.database_project_ref,
      sources: run.sources,
      votacoes: run.votacoes,
      pairs: run.pairs,
    }),
    /fontes distintas não podem compartilhar um único timestamp/,
  )
})

test("cada par referencia o timestamp da resposta oficial que o sustentou", () => {
  const run = load(RUN_B)
  const firstPair = run.pairs[0]
  firstPair.checked_at = new Date(Date.parse(firstPair.checked_at) + 1).toISOString()
  assert.throws(
    () => buildDestaquesRunManifest({
      schema_version: run.schema_version,
      source_id: run.source_id,
      execution_id: run.execution_id,
      checked_at: run.checked_at,
      database_project_ref: run.database_project_ref,
      sources: run.sources,
      votacoes: run.votacoes,
      pairs: run.pairs,
    }),
    /checked_at não corresponde à resposta oficial usada/,
  )
})

test("dupla leitura exige execution_id realmente distinto", () => {
  const runA = load(RUN_A)
  const runB = load(RUN_B)
  runB.execution_id = runA.execution_id
  assert.throws(() => compareDestaquesRuns(runA, runB), /execution_id deve ser distinto/)
})

test("resultado nunca degrada para indeterminado e lista os três pares não confirmados", () => {
  const run = load(RUN_B)
  assert.equal(run.pairs.some((pair) => String(pair.resultado) === "indeterminado"), false)
  assert.deepEqual(
    run.pairs
      .filter((pair) => pair.resultado === "sem_achado_no_escopo")
      .map((pair) => `${pair.candidate_slug}:${pair.votacao_id_api}`)
      .sort(),
    ["flavio-bolsonaro:6756", "jhc:2123843-93", "joao-rodrigues:340812-195"],
  )
})

test("as cinco lacunas de metadata só ganham ID quando a fonte oficial é unívoca", () => {
  const run = load(RUN_B)
  const gaps = run.votacoes.filter((vote) => vote.fonte_anterior === null || vote.votacao_id_api_anterior === null)
  assert.equal(gaps.length, 5)
  assert.deepEqual(
    gaps
      .map((vote) => [vote.titulo, vote.votacao_id_api_recoletada, vote.resultado])
      .sort((left, right) => String(left[0]).localeCompare(String(right[0]))),
    [
      ["Impeachment de Dilma", null, "sem_achado_no_escopo"],
      ["Reforma Tributaria", "2196833-326", "encontrado"],
      ["Orçamento Secreto (Emendas de Relator)", null, "sem_achado_no_escopo"],
      ["Arcabouco Fiscal", "2357053-47", "encontrado"],
      ["Privatização da Eletrobras", "2270789-73", "encontrado"],
    ].sort((left, right) => String(left[0]).localeCompare(String(right[0]))),
  )
})

import assert from "node:assert/strict"
import test from "node:test"
import { gzipSync } from "node:zlib"
import {
  buildDestaquesRunManifest,
  DESTAQUES_SCHEMA_VERSION,
  sha256Json,
  sha256Raw,
  type DestaquesPairReceipt,
  type DestaquesRunManifest,
  type DestaquesSourceReceipt,
  type DestaquesVoteReceipt,
} from "../scripts/lib/destaques-votacoes-provenance"
import { buildRefresh } from "../scripts/audit/generate-destaques-evidence-refresh"

// Cobre o defeito reportado depois do #356: o guard de deriva em apply.sql
// comparava a TABELA INTEIRA `votos_candidato` (669 linhas em produção)
// contra `_expected_pairs` (181 linhas do manifesto), então a diferença
// simétrica sempre enxergava as centenas de pares de coorte 2026 que o
// coletor já exclui a montante (scripts/audit/coletar-destaques-votacoes.ts)
// e o apply sempre abortava com "pares mudaram desde a dupla leitura" — em
// produção real, não só em teste. Este arquivo simula uma tabela de produção
// COM linhas fora de escopo e prova que o guard corrigido: (a) ignora
// contaminação fora de escopo que não mudou de tamanho, (b) ainda pega
// deriva real dentro do escopo curado, (c) ainda pega deriva na CONTAGEM
// fora de escopo (proteção nova, para uma escrita concorrente de coorte não
// passar despercebida só porque o escopo do guard principal ficou mais
// estreito).

const PROJECT_REF = "wskpzsobvqwhnbsdsmok"
const VOTACAO_ID = "11111111-1111-1111-1111-111111111111"
const CANDIDATO_ID = "22222222-2222-2222-2222-222222222222"
const PAIR_ROW_ID = "33333333-3333-3333-3333-333333333333"
const CAMARA_URL = "https://dadosabertos.camara.leg.br/api/v2/votacoes/999/votos"
const TEST_UNIVERSE = { votacoes: 1, pairs: 1, candidates: 1 }

function buildFixtureRun(input: { executionId: string; checkedAt: string; sourceCheckedAt: string }): {
  manifest: DestaquesRunManifest
  gz: Buffer
} {
  const rawPayload = Buffer.from(JSON.stringify({ dados: [{ deputado_: { id: 123 }, tipoVoto: "Sim" }] }), "utf8")
  const rawHash = sha256Raw(rawPayload)
  const gz = gzipSync(rawPayload)

  const source: DestaquesSourceReceipt = {
    source_key: "camara:votacao1:999",
    votacao_id: VOTACAO_ID,
    casa: "camara",
    url: CAMARA_URL,
    checked_at: input.sourceCheckedAt,
    http_status: 200,
    artifact_path: `raw/${rawHash}.json.gz`,
    payload_raw_sha256: rawHash,
  }

  const votePayload = {
    votacao_id: VOTACAO_ID,
    fonte_recoletada: "camara",
    votacao_id_api_recoletada: "999",
    resultado: "encontrado" as const,
    sources: [{ source_key: source.source_key, payload_raw_sha256: rawHash }],
  }
  const vote: DestaquesVoteReceipt = {
    votacao_id: VOTACAO_ID,
    titulo: "Votação de teste",
    casa: "camara",
    fonte_anterior: "camara",
    votacao_id_api_anterior: "999",
    fonte_recoletada: "camara",
    votacao_id_api_recoletada: "999",
    resultado: "encontrado",
    source_keys: [source.source_key],
    payload_sha256: sha256Json(votePayload),
    detalhe: "fixture de teste",
  }

  const pair: DestaquesPairReceipt = {
    pair_key: `${CANDIDATO_ID}:${VOTACAO_ID}`,
    database_row_id: PAIR_ROW_ID,
    candidato_id: CANDIDATO_ID,
    candidate_slug: "fulano-teste",
    votacao_id: VOTACAO_ID,
    votacao_id_api: "999",
    casa: "camara",
    url: CAMARA_URL,
    checked_at: input.sourceCheckedAt,
    resultado: "encontrado",
    voto_anterior: "sim",
    contradicao_anterior: false,
    contradicao_descricao_anterior: null,
    created_at_anterior: "2026-01-01T00:00:00.000Z",
    voto_oficial: "sim",
    voto_confere: true,
    payload_sha256: "a".repeat(64),
  }

  const manifest = buildDestaquesRunManifest({
    schema_version: DESTAQUES_SCHEMA_VERSION,
    source_id: "destaques-votacoes",
    execution_id: input.executionId,
    checked_at: input.checkedAt,
    database_project_ref: PROJECT_REF,
    sources: [source],
    votacoes: [vote],
    pairs: [pair],
  }, TEST_UNIVERSE)

  return { manifest, gz }
}

function buildFixture() {
  const runA = buildFixtureRun({
    executionId: "destaques-votacoes:fixture-a",
    checkedAt: "2026-09-17T10:05:00.000Z",
    sourceCheckedAt: "2026-09-17T10:00:00.000Z",
  })
  const runB = buildFixtureRun({
    executionId: "destaques-votacoes:fixture-b",
    checkedAt: "2026-09-17T10:15:00.000Z",
    sourceCheckedAt: "2026-09-17T10:10:00.000Z",
  })
  return { runA, runB, now: new Date("2026-09-17T10:20:00.000Z") }
}

/** Linha de `_expected_pairs` derivada do par do manifesto (mesmo shape que buildRefresh monta). */
function expectedPairRow(pair: DestaquesPairReceipt) {
  return {
    id: pair.database_row_id, candidato_id: pair.candidato_id, votacao_id: pair.votacao_id,
    voto: pair.voto_anterior, contradicao: pair.contradicao_anterior,
    contradicao_descricao: pair.contradicao_descricao_anterior, created_at: pair.created_at_anterior,
  }
}

/**
 * Simula, em JS, exatamente o que o guard em SQL faria contra uma tabela de
 * produção: diferença simétrica só dentro do escopo (`scopeCandidatoIds`) +
 * contagem exata fora do escopo. Não é um parser de SQL — é a mesma lógica
 * do guard reimplementada para rodar sem Postgres.
 */
function simulateGuard(production: Array<Record<string, unknown>>, expectedPairs: Array<Record<string, unknown>>, scopeCandidatoIds: string[], expectedExcludedPairs: number) {
  const inScope = production.filter((row) => scopeCandidatoIds.includes(row.candidato_id as string))
  const outOfScope = production.filter((row) => !scopeCandidatoIds.includes(row.candidato_id as string))
  const key = (row: Record<string, unknown>) => JSON.stringify(row, Object.keys(row).sort())
  const inScopeKeys = new Set(inScope.map(key))
  const expectedKeys = new Set(expectedPairs.map(key))
  const pairsDrifted = inScopeKeys.size !== expectedKeys.size || [...inScopeKeys].some((k) => !expectedKeys.has(k))
  const excludedCountMismatch = outOfScope.length !== expectedExcludedPairs
  return { pairsDrifted, excludedCountMismatch }
}

test("guard de deriva ignora contaminação fora de escopo que não mudou de tamanho", () => {
  const { runA, runB, now } = buildFixture()
  const result = buildRefresh({
    runA: runA.manifest, runB: runB.manifest,
    readA: () => runA.gz, readB: () => runB.gz,
    executionId: "destaques-votacoes:fixture-refresh",
    evidencePath: "fixture de teste", projectRef: PROJECT_REF,
    expectedExcludedPairs: 3, universe: TEST_UNIVERSE, now,
  })
  assert.deepEqual(result.scopeCandidatoIds, [CANDIDATO_ID])

  const expectedRow = expectedPairRow(runB.manifest.pairs[0])
  const productionComContaminacao = [
    expectedRow,
    { id: "44444444-4444-4444-4444-444444444444", candidato_id: "aaaaaaaa-0000-0000-0000-000000000001", votacao_id: VOTACAO_ID, voto: "sim", contradicao: false, contradicao_descricao: null, created_at: "2026-01-01T00:00:00.000Z" },
    { id: "55555555-5555-5555-5555-555555555555", candidato_id: "aaaaaaaa-0000-0000-0000-000000000002", votacao_id: VOTACAO_ID, voto: "não", contradicao: false, contradicao_descricao: null, created_at: "2026-01-01T00:00:00.000Z" },
    { id: "66666666-6666-6666-6666-666666666666", candidato_id: "aaaaaaaa-0000-0000-0000-000000000003", votacao_id: VOTACAO_ID, voto: "sim", contradicao: false, contradicao_descricao: null, created_at: "2026-01-01T00:00:00.000Z" },
  ]
  const outcome = simulateGuard(productionComContaminacao, [expectedRow], result.scopeCandidatoIds, 3)
  assert.equal(outcome.pairsDrifted, false, "contaminação fora de escopo não deveria contar como deriva")
  assert.equal(outcome.excludedCountMismatch, false)
})

test("guard de deriva ainda pega deriva real dentro do escopo curado", () => {
  const { runA, runB, now } = buildFixture()
  const result = buildRefresh({
    runA: runA.manifest, runB: runB.manifest,
    readA: () => runA.gz, readB: () => runB.gz,
    executionId: "destaques-votacoes:fixture-refresh",
    evidencePath: "fixture de teste", projectRef: PROJECT_REF,
    expectedExcludedPairs: 0, universe: TEST_UNIVERSE, now,
  })
  const expectedRow = expectedPairRow(runB.manifest.pairs[0])
  const linhaAdulterada = { ...expectedRow, voto: "não" } // voto mudou desde a dupla leitura
  const outcome = simulateGuard([linhaAdulterada], [expectedRow], result.scopeCandidatoIds, 0)
  assert.equal(outcome.pairsDrifted, true, "voto adulterado dentro do escopo precisa ser detectado")
})

test("guard de deriva pega mudança na contagem fora de escopo (escrita concorrente de coorte)", () => {
  const { runA, runB, now } = buildFixture()
  const result = buildRefresh({
    runA: runA.manifest, runB: runB.manifest,
    readA: () => runA.gz, readB: () => runB.gz,
    executionId: "destaques-votacoes:fixture-refresh",
    evidencePath: "fixture de teste", projectRef: PROJECT_REF,
    expectedExcludedPairs: 3, universe: TEST_UNIVERSE, now,
  })
  const expectedRow = expectedPairRow(runB.manifest.pairs[0])
  const foraDeEscopoAgora4 = [
    expectedRow,
    { id: "70000000-0000-0000-0000-000000000001", candidato_id: "aaaaaaaa-0000-0000-0000-000000000001", votacao_id: VOTACAO_ID, voto: "sim", contradicao: false, contradicao_descricao: null, created_at: "2026-01-01T00:00:00.000Z" },
    { id: "70000000-0000-0000-0000-000000000002", candidato_id: "aaaaaaaa-0000-0000-0000-000000000002", votacao_id: VOTACAO_ID, voto: "sim", contradicao: false, contradicao_descricao: null, created_at: "2026-01-01T00:00:00.000Z" },
    { id: "70000000-0000-0000-0000-000000000003", candidato_id: "aaaaaaaa-0000-0000-0000-000000000003", votacao_id: VOTACAO_ID, voto: "sim", contradicao: false, contradicao_descricao: null, created_at: "2026-01-01T00:00:00.000Z" },
    { id: "70000000-0000-0000-0000-000000000004", candidato_id: "aaaaaaaa-0000-0000-0000-000000000004", votacao_id: VOTACAO_ID, voto: "sim", contradicao: false, contradicao_descricao: null, created_at: "2026-01-01T00:00:00.000Z" },
  ]
  const outcome = simulateGuard(foraDeEscopoAgora4, [expectedRow], result.scopeCandidatoIds, 3)
  assert.equal(outcome.pairsDrifted, false)
  assert.equal(outcome.excludedCountMismatch, true, "4 linhas fora de escopo contra 3 esperadas precisa abortar")
})

test("apply.sql gerado restringe o guard ao escopo e não compara a tabela inteira", () => {
  const { runA, runB, now } = buildFixture()
  const result = buildRefresh({
    runA: runA.manifest, runB: runB.manifest,
    readA: () => runA.gz, readB: () => runB.gz,
    executionId: "destaques-votacoes:fixture-refresh",
    evidencePath: "fixture de teste", projectRef: PROJECT_REF,
    expectedExcludedPairs: 488, universe: TEST_UNIVERSE, now,
  })
  // Padrão exato do defeito original: comparar a tabela inteira, sem WHERE,
  // contra o conjunto esperado. Se esta string voltar a aparecer, o guard
  // voltou a abortar sempre que existir qualquer linha fora do escopo.
  assert.doesNotMatch(result.applySql, /FROM public\.votos_candidato EXCEPT ALL/)
  assert.match(result.applySql, /FROM public\.votos_candidato WHERE candidato_id IN \(SELECT candidato_id FROM _scope_candidatos\) EXCEPT ALL/)
  assert.match(result.applySql, /count\(\*\) FROM public\.votos_candidato WHERE candidato_id NOT IN \(SELECT candidato_id FROM _scope_candidatos\)\) <> 488/)
  assert.match(result.applySql, /CREATE TEMP TABLE _scope_candidatos ON COMMIT DROP/)
})

test("expectedExcludedPairs inválido é recusado antes de gerar SQL", () => {
  const { runA, runB, now } = buildFixture()
  for (const invalid of [-1, 1.5, Number.NaN]) {
    assert.throws(() => buildRefresh({
      runA: runA.manifest, runB: runB.manifest,
      readA: () => runA.gz, readB: () => runB.gz,
      executionId: "destaques-votacoes:fixture-refresh",
      evidencePath: "fixture de teste", projectRef: PROJECT_REF,
      expectedExcludedPairs: invalid, universe: TEST_UNIVERSE, now,
    }), /contagem de pares fora de escopo inválida/)
  }
})

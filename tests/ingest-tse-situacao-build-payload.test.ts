import assert from "node:assert/strict"
import test from "node:test"

import {
  buildIngestPayload,
  type CandidateSnapshot,
  type MatchedData,
} from "../scripts/lib/ingest-tse-situacao"

// Fase 14.2 (2026-04-14, Caminho 2): payload final do ingest tem que:
//   - so gravar cpf quando DB nao tem CPF valido
//   - so reescrever situacao_candidatura quando info.ano === pleito corrente
//   - preservar guard cpf-inconsistente
//   - demograficos sao fill-only (so se DB null)

const BASE_MATCHED: MatchedData = {
  cpf: "12345678901",
  situacao: "APTO",
  detalhe: "",
  ano: 2022,
  // buildIngestPayload nao acessa `cand`; cast bypassa strict check do TS.
  cand: {} as unknown as MatchedData["cand"],
  match_method: "sq-preloaded",
  ds_cargo: "GOVERNADOR",
  sg_uf: "BA",
  uf_nascimento: "BA",
  data_nascimento: "1980-01-01",
  genero: "MASCULINO",
  grau_instrucao: "SUPERIOR COMPLETO",
  estado_civil: "CASADO(A)",
  cor_raca: "PARDA",
  ocupacao: "ADVOGADO",
  email: "foo@bar.com",
}

const EMPTY_SNAPSHOT: CandidateSnapshot = {
  cpf: null,
  situacao_candidatura: null,
  naturalidade: null,
  data_nascimento: null,
  formacao: null,
  profissao_declarada: null,
  genero: null,
  estado_civil: null,
  cor_raca: null,
  email_campanha: null,
}

function snapshot(overrides: Partial<CandidateSnapshot> = {}): CandidateSnapshot {
  return { ...EMPTY_SNAPSHOT, ...overrides }
}

test("buildIngestPayload: DB vazio, preenche cpf + demograficos, nao toca situacao se ano historico", () => {
  const { payload, blockedReasons } = buildIngestPayload(
    { ...BASE_MATCHED, ano: 2022 },
    snapshot(),
    2026
  )
  assert.equal(payload.cpf, "12345678901")
  assert.equal(payload.data_nascimento, "1980-01-01")
  assert.equal(payload.genero, "MASCULINO")
  assert.equal(payload.formacao, "SUPERIOR COMPLETO")
  assert.equal(payload.estado_civil, "CASADO(A)")
  assert.equal(payload.cor_raca, "PARDA")
  assert.equal(payload.profissao_declarada, "ADVOGADO")
  assert.equal(payload.email_campanha, "foo@bar.com")
  assert.equal(
    payload.naturalidade,
    undefined,
    "Fase 14 closure (invariante 13.7): naturalidade nunca e gravada a partir de uf_nascimento (TSE so tem UF, pior que NULL)"
  )
  assert.equal(
    payload.situacao_candidatura,
    undefined,
    "ano 2022 nao e pleito corrente (2026), nao escreve situacao"
  )
  assert.deepEqual(blockedReasons, [])
})

test("buildIngestPayload: DB ja tem CPF valido igual, nao reescreve cpf (Fase 14.2)", () => {
  const { payload, blockedReasons } = buildIngestPayload(
    BASE_MATCHED,
    snapshot({ cpf: "12345678901" }),
    2026
  )
  assert.equal(
    payload.cpf,
    undefined,
    "Fase 14.2: se DB ja tem CPF, nao sobrescreve mesmo quando bate"
  )
  assert.deepEqual(blockedReasons, [])
})

test("buildIngestPayload: DB tem CPF valido diferente, block cpf-inconsistente + nao reescreve", () => {
  const { payload, blockedReasons } = buildIngestPayload(
    BASE_MATCHED,
    snapshot({ cpf: "33333333333" }),
    2026
  )
  assert.equal(
    payload.cpf,
    undefined,
    "fail-safe: DB tem CPF, nao apaga"
  )
  assert.deepEqual(
    blockedReasons,
    ["cpf-inconsistente:33333333333->12345678901"],
    "guard cpf-inconsistente preservado"
  )
})

test("buildIngestPayload: DB tem CPF invalido (menos de 11 digitos), preenche com matched", () => {
  const { payload, blockedReasons } = buildIngestPayload(
    BASE_MATCHED,
    snapshot({ cpf: "123" }),
    2026
  )
  assert.equal(
    payload.cpf,
    "12345678901",
    "CPF invalido no DB tratado como vazio, aceita fill"
  )
  assert.deepEqual(blockedReasons, [])
})

test("buildIngestPayload: ano === pleito corrente, situacao_candidatura reescrita", () => {
  const { payload } = buildIngestPayload(
    { ...BASE_MATCHED, ano: 2026, situacao: "APTO" },
    snapshot(),
    2026
  )
  assert.equal(payload.situacao_candidatura, "APTO [2026]")
})

test("buildIngestPayload: ano === pleito corrente, situacao com detalhe concatenada", () => {
  const { payload } = buildIngestPayload(
    { ...BASE_MATCHED, ano: 2026, situacao: "DEFERIDO", detalhe: "COM RECURSO" },
    snapshot(),
    2026
  )
  assert.equal(payload.situacao_candidatura, "DEFERIDO (COM RECURSO) [2026]")
})

test("buildIngestPayload: ano historico 2022, NUNCA reescreve situacao_candidatura (Fase 14.2 blast radius fix)", () => {
  const { payload } = buildIngestPayload(
    { ...BASE_MATCHED, ano: 2022, situacao: "APTO" },
    snapshot({ situacao_candidatura: "pre-candidato" }),
    2026
  )
  assert.equal(
    payload.situacao_candidatura,
    undefined,
    "linha TSE 2022 nao toca situacao_candidatura 2026"
  )
})

test("buildIngestPayload: ano historico 2020, NUNCA reescreve situacao_candidatura", () => {
  const { payload } = buildIngestPayload(
    { ...BASE_MATCHED, ano: 2020, situacao: "APTO" },
    snapshot(),
    2026
  )
  assert.equal(payload.situacao_candidatura, undefined)
})

test("buildIngestPayload: ano historico 2024 municipal, NUNCA reescreve situacao_candidatura", () => {
  const { payload } = buildIngestPayload(
    { ...BASE_MATCHED, ano: 2024, situacao: "APTO" },
    snapshot(),
    2026
  )
  assert.equal(payload.situacao_candidatura, undefined)
})

test("buildIngestPayload: DB ja tem demograficos, nao reescreve (fill-only)", () => {
  const { payload } = buildIngestPayload(
    BASE_MATCHED,
    snapshot({
      data_nascimento: "1970-05-15",
      naturalidade: "Curitiba/PR",
      genero: "FEMININO",
      formacao: "MESTRADO",
      estado_civil: "SOLTEIRO(A)",
      cor_raca: "BRANCA",
      profissao_declarada: "MEDICO",
      email_campanha: "old@old.com",
    }),
    2026
  )
  assert.equal(payload.data_nascimento, undefined)
  assert.equal(payload.naturalidade, undefined)
  assert.equal(payload.genero, undefined)
  assert.equal(payload.formacao, undefined)
  assert.equal(payload.estado_civil, undefined)
  assert.equal(payload.cor_raca, undefined)
  assert.equal(payload.profissao_declarada, undefined)
  assert.equal(payload.email_campanha, undefined)
})

test("buildIngestPayload: matched sem CPF, nao adiciona campo cpf ao payload", () => {
  const { payload, blockedReasons } = buildIngestPayload(
    { ...BASE_MATCHED, cpf: "" },
    snapshot(),
    2026
  )
  assert.equal(payload.cpf, undefined)
  assert.deepEqual(blockedReasons, [])
})

test("buildIngestPayload: matched com CPF lixo (#NULO#), nao adiciona (getValidCPF filtra)", () => {
  const { payload, blockedReasons } = buildIngestPayload(
    { ...BASE_MATCHED, cpf: "#NULO#" },
    snapshot(),
    2026
  )
  assert.equal(payload.cpf, undefined, "Fase 14.4: CPF lixo tratado como vazio")
  assert.deepEqual(blockedReasons, [])
})

test("buildIngestPayload: caso canonico rafael-greca (DB com CPF correto, matched com CPF correto)", () => {
  // Fase 14.1 + 14.2: apos fix de prioridade, o match final pro rafael-greca
  // eh sq-preloaded com CPF 11111111111, mesmo do DB. buildIngestPayload nao
  // deve adicionar cpf ao payload (DB ja tem) e nao deve bloquear (match).
  const { payload, blockedReasons } = buildIngestPayload(
    {
      ...BASE_MATCHED,
      ano: 2020,
      cpf: "11111111111",
      situacao: "APTO",
      match_method: "sq-preloaded",
    },
    snapshot({
      cpf: "11111111111",
      data_nascimento: "1956-03-17",
      naturalidade: "Curitiba/PR",
    }),
    2026
  )
  assert.equal(payload.cpf, undefined, "DB ja tem o CPF correto, nao sobrescreve")
  assert.equal(
    payload.situacao_candidatura,
    undefined,
    "ano 2020 nao e pleito corrente, nao reescreve situacao"
  )
  assert.deepEqual(blockedReasons, [], "sem cpf-inconsistente, sem block")
  // Campos demograficos ja estao no DB, fill-only nao toca
  assert.equal(payload.data_nascimento, undefined)
  assert.equal(payload.naturalidade, undefined)
})

test("buildIngestPayload: default pleitoCorrente=2026 quando argumento omitido", () => {
  const { payload } = buildIngestPayload(
    { ...BASE_MATCHED, ano: 2026, situacao: "APTO" },
    snapshot()
  )
  assert.equal(payload.situacao_candidatura, "APTO [2026]")
})

test("buildIngestPayload: matched sem situacao, nao adiciona campo (mesmo em pleito corrente)", () => {
  const { payload } = buildIngestPayload(
    { ...BASE_MATCHED, ano: 2026, situacao: "" },
    snapshot(),
    2026
  )
  assert.equal(payload.situacao_candidatura, undefined)
})

// Fase 14 closure (invariante 13.7 do spec): naturalidade NUNCA e gravada
// a partir de uf_nascimento. TSE so tem SG_UF_NASCIMENTO (2 chars), que e
// pior que NULL pra curadoria downstream. Se o ingest gravasse "BA" como
// naturalidade, isso quebraria busca por cidade-natal e contaminaria display
// publico. Regra duradoura: fill so vem de curadoria ou Wikidata/Wikipedia.

test("buildIngestPayload: invariante 13.7 - nunca grava naturalidade mesmo com uf_nascimento e DB null", () => {
  const { payload } = buildIngestPayload(
    { ...BASE_MATCHED, uf_nascimento: "BA" },
    snapshot({ naturalidade: null }),
    2026
  )
  assert.equal(
    payload.naturalidade,
    undefined,
    "DB vazio + TSE UF presente NAO preenche naturalidade"
  )
})

test("buildIngestPayload: invariante 13.7 - nunca grava naturalidade mesmo com UF=AM explicito", () => {
  const { payload } = buildIngestPayload(
    { ...BASE_MATCHED, uf_nascimento: "AM" },
    snapshot({ naturalidade: null }),
    2026
  )
  assert.equal(payload.naturalidade, undefined, "caso canonico maria-do-carmo")
})

test("buildIngestPayload: invariante 13.7 - uf_nascimento vazio tambem nao grava", () => {
  const { payload } = buildIngestPayload(
    { ...BASE_MATCHED, uf_nascimento: "" },
    snapshot({ naturalidade: null }),
    2026
  )
  assert.equal(payload.naturalidade, undefined)
})

test("buildIngestPayload: invariante 13.7 - DB ja tem naturalidade curada, preserva intacta", () => {
  const { payload } = buildIngestPayload(
    { ...BASE_MATCHED, uf_nascimento: "BA" },
    snapshot({ naturalidade: "Salvador/BA" }),
    2026
  )
  assert.equal(
    payload.naturalidade,
    undefined,
    "fill-only preservado: DB curado nao e sobrescrito"
  )
})

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  TEMAS_QUIZ,
  calcularCelulas,
  type CandidatoCoverage,
} from "../scripts/audit/lib/coverage-model"

function candidato(overrides: Partial<CandidatoCoverage> = {}): CandidatoCoverage {
  return {
    slug: "clariana",
    nome_urna: "Clariana",
    partido_sigla: "PODEMOS",
    cargo_disputado: "Presidente",
    estado: null,
    foto: true,
    bio: true,
    redes: true,
    idade: 40,
    naturalidade: "Brasil",
    formacao: "Superior",
    profissao: "Política",
    historico: [],
    temSqNoSeed: false,
    temIdCamaraNoSeed: false,
    temIdSenadoNoSeed: false,
    mudancas: 0,
    patrimonioAnos: [],
    patrimonioAnosComBens: [],
    patrimonioAusenciasOficiais: [],
    financiamentoAnos: [],
    financiamentoAnosComDoadores: [],
    votos: 0,
    contradicoes: 0,
    processos: 0,
    alertas: 0,
    projetos: 0,
    projetosCamara: 0,
    destaquesVisiveis: 0,
    destaquesTotais: 0,
    gastosAnos: [],
    legislacaoExecutivo: 0,
    noticias: 0,
    posicoesTemasVerificados: [],
    posicoesTemasPendentes: [],
    posicoesTemasSemDeclaracao: [],
    sancoes: 0,
    itensRevisar: [],
    ...overrides,
  }
}

test("régua deriva os sete temas oficiais do quiz", () => {
  assert.equal(TEMAS_QUIZ.length, 7)
})

test("PODEMOS fecha espectro via sigla canônica PODE", () => {
  assert.equal(calcularCelulas(candidato()).espectro.state, "ok")
})

test("sete recibos de não declaração fecham posições sem inventar declaração", () => {
  const cell = calcularCelulas(candidato({ posicoesTemasSemDeclaracao: [...TEMAS_QUIZ] })).posicoes
  assert.equal(cell.state, "ok")
  assert.match(cell.text, /^0\/7 · 7 omissões confirmadas$/)
})

test("cobertura parcial combina posições verificadas e omissões confirmadas", () => {
  const cell = calcularCelulas(candidato({
    posicoesTemasVerificados: [TEMAS_QUIZ[0]],
    posicoesTemasSemDeclaracao: [TEMAS_QUIZ[1]],
  })).posicoes
  assert.equal(cell.state, "partial")
})

test("snapshot SQL lê recibos do campo de verificação", () => {
  const sql = readFileSync(new URL("../scripts/audit/coverage-snapshot.sql", import.meta.url), "utf8")
  assert.match(sql, /posicoes_quiz_temas_sem_declaracao/)
})

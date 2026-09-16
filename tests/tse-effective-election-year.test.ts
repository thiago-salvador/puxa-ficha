import assert from "node:assert/strict"
import test from "node:test"

import {
  effectiveElectionContextKey,
  electionYearFromDate,
  resolveEffectiveElectionContext,
} from "../scripts/lib/tse-effective-election-year"

test("eleição suplementar publica o ano da data sem mudar o ciclo do arquivo", () => {
  assert.deepEqual(resolveEffectiveElectionContext({
    ano_eleicao: "2018",
    dt_eleicao: "15/11/2020",
    nm_tipo_eleicao: "ELEIÇÃO SUPLEMENTAR",
  }), {
    sourceYear: 2018,
    effectiveYear: 2020,
    electionDate: "15/11/2020",
    supplementary: true,
  })
})

test("candidatura ordinária que coexiste mantém o ano do ciclo", () => {
  assert.deepEqual(resolveEffectiveElectionContext({
    ano_eleicao: 2014,
    dt_eleicao: "26/10/2014",
    nm_tipo_eleicao: "ELEIÇÃO ORDINÁRIA",
  }), {
    sourceYear: 2014,
    effectiveYear: 2014,
    electionDate: "26/10/2014",
    supplementary: false,
  })
})

test("SQ mantém dois registros suplementares separados no mesmo pleito", () => {
  const base = {
    ano_eleicao: 2022,
    dt_eleicao: "21/06/2026",
    nm_tipo_eleicao: "ELEIÇÃO SUPLEMENTAR",
    uf: "RR",
    cargo: "VICE-GOVERNADOR",
  }
  assert.notEqual(
    effectiveElectionContextKey({ ...base, sq_candidato: "230002529994" }),
    effectiveElectionContextKey({ ...base, sq_candidato: "230002529903" }),
  )
})

test("datas inválidas não fabricam ano efetivo", () => {
  assert.equal(electionYearFromDate("31/02/2020"), null)
  assert.equal(electionYearFromDate(""), null)
  assert.equal(resolveEffectiveElectionContext({
    ano_eleicao: 2018,
    dt_eleicao: "31/02/2020",
    nm_tipo_eleicao: "ELEIÇÃO SUPLEMENTAR",
  }).effectiveYear, 2018)
})

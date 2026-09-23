import assert from "node:assert/strict"
import { test } from "node:test"
import {
  buildColinhaUrl,
  formatColinhaText,
  isCandidateBlocked,
  parseColinhaState,
  resolveColinhaChoices,
  SLOT_ORDER,
  type ColinhaCandidate,
} from "../src/lib/colinha"

function candidate(sq: string, cargo: string, uf = "SP", numero = "13"): ColinhaCandidate {
  return {
    ano: 2026,
    sq_candidato: sq,
    uf,
    cargo,
    nome_urna: `Candidatura ${sq}`,
    numero_urna: numero,
    partido_sigla: "ABC",
    situacao_registro: "DEFERIDO",
    foto_path: null,
  }
}

const six = [
  candidate("101", "deputado_federal", "SP", "1234"),
  candidate("102", "deputado_estadual", "SP", "12345"),
  candidate("103", "senador", "SP", "123"),
  candidate("104", "senador", "SP", "124"),
  candidate("105", "governador", "SP", "12"),
  candidate("106", "presidente", "BR", "13"),
]

test("roundtrip mantém seis posições na ordem da urna", () => {
  const parsed = parseColinhaState(new URLSearchParams("uf=SP&df=101&de=102&s1=103&s2=104&g=105&p=106"))
  const encoded = buildColinhaUrl("https://puxaficha.com.br/colinha?extra=1", parsed)
  assert.equal(encoded, "https://puxaficha.com.br/colinha?uf=SP&df=101&de=102&s1=103&s2=104&g=105&p=106")
  assert.deepEqual(parseColinhaState(new URL(encoded).searchParams), parsed)
  const choices = resolveColinhaChoices(parsed, six)
  assert.deepEqual(SLOT_ORDER.map((slot) => choices[slot]?.sq_candidato), ["101", "102", "103", "104", "105", "106"])
  assert.deepEqual(formatColinhaText(parsed, choices, encoded).split("\n").slice(1, 7).map((line) => line.split(":")[0]), [
    "Deputado federal", "Deputado estadual ou distrital", "Senador 1", "Senador 2", "Governador", "Presidente",
  ])
})

test("SQ inválido, repetido e inexistente não viram escolha", () => {
  const state = parseColinhaState(new URLSearchParams("uf=SP&df=abc&de=999&s1=103&s2=103&g=105&p=106"))
  assert.equal(state.df, null)
  assert.equal(state.s2, null)
  const choices = resolveColinhaChoices(state, six)
  assert.equal(choices.de, null)
  assert.equal(choices.s1?.sq_candidato, "103")
  assert.equal(choices.s2, null)
})

test("escolha cruza SQ, cargo e UF, não só número", () => {
  const state = parseColinhaState(new URLSearchParams("uf=SP&df=201&de=102"))
  const choices = resolveColinhaChoices(state, [candidate("201", "deputado_federal", "RR", "1234"), ...six])
  assert.equal(choices.df, null)
  assert.equal(choices.de?.sq_candidato, "102")
})

test("candidatura indeferida, cassada, renunciante ou substituída não entra na imagem", () => {
  for (const status of ["INDEFERIDO", "CASSADO", "RENÚNCIA", "SUBSTITUÍDO"]) {
    assert.equal(isCandidateBlocked(status), true, status)
    const state = parseColinhaState(new URLSearchParams("uf=SP&s1=103"))
    assert.equal(resolveColinhaChoices(state, [{ ...six[2], situacao_registro: status }]).s1, null)
  }
})

test("parâmetro duplicado ou UF fora do Brasil não é aceito", () => {
  assert.equal(parseColinhaState(new URLSearchParams("uf=SP&df=101&df=102")).df, null)
  assert.equal(parseColinhaState(new URLSearchParams("uf=XX&df=101")).df, null)
})

import assert from "node:assert/strict"
import test from "node:test"

import {
  significantTokens,
  checkNameCompatibility,
  assessWeakMatch,
} from "../scripts/lib/discovery-plausibility"

// --- significantTokens ---

test("significantTokens strips filler words and normalizes", () => {
  assert.deepEqual(significantTokens("Eduardo Braga Granata"), [
    "EDUARDO",
    "BRAGA",
    "GRANATA",
  ])
  assert.deepEqual(significantTokens("Luiz Eduardo da Silva Braga"), [
    "LUIZ",
    "EDUARDO",
    "SILVA",
    "BRAGA",
  ])
  assert.deepEqual(significantTokens("Maria do Carmo Seffair"), [
    "MARIA",
    "CARMO",
    "SEFFAIR",
  ])
})

test("significantTokens handles accented names", () => {
  assert.deepEqual(significantTokens("Jerônimo Rodrigues de Jesus"), [
    "JERONIMO",
    "RODRIGUES",
    "JESUS",
  ])
})

// --- checkNameCompatibility ---

test("checkNameCompatibility: exact match scores 1.0", () => {
  const result = checkNameCompatibility(
    "Eduardo Braga Granata",
    "EDUARDO BRAGA GRANATA"
  )
  assert.equal(result.score, 1.0)
  assert.equal(result.reasons.length, 0)
})

test("checkNameCompatibility: homonym LUIZ EDUARDO DA SILVA BRAGA scores low", () => {
  const result = checkNameCompatibility(
    "Eduardo Braga Granata",
    "LUIZ EDUARDO DA SILVA BRAGA"
  )
  // First name displaced (EDUARDO not first), extra identity tokens (LUIZ, SILVA)
  assert.ok(result.score < 0.3, `score ${result.score} should be < 0.3`)
  assert.ok(result.reasons.length > 0)
})

test("checkNameCompatibility: JERONIMO PEREIRA FLORES vs Jeronimo Rodrigues de Jesus", () => {
  const result = checkNameCompatibility(
    "Jeronimo Rodrigues de Jesus",
    "JERONIMO PEREIRA FLORES"
  )
  // First name matches but surnames diverge completely
  assert.ok(result.score < 0.5, `score ${result.score} should be < 0.5`)
})

test("checkNameCompatibility: CLEITON ALVES DA SILVA vs Cleitinho Azevedo", () => {
  const result = checkNameCompatibility(
    "Cleitinho Azevedo",
    "CLEITON ALVES DA SILVA"
  )
  // First names differ (CLEITINHO vs CLEITON), surnames differ entirely
  assert.ok(result.score < 0.3, `score ${result.score} should be < 0.3`)
})

test("checkNameCompatibility: MARIA DO CARMO MELO DE FRANCA vs Maria do Carmo Seffair", () => {
  const result = checkNameCompatibility(
    "Maria do Carmo Seffair",
    "MARIA DO CARMO MELO DE FRANCA"
  )
  // First name matches (MARIA), CARMO matches, but SEFFAIR missing, MELO/FRANCA extra
  assert.ok(result.score < 0.6, `score ${result.score} should be < 0.6`)
})

// --- assessWeakMatch: NEGATIVE cases (homonyms that must not be auto-accepted) ---

test("assessWeakMatch rejects eduardo-braga 2024 homonym", () => {
  const result = assessWeakMatch(
    "Eduardo Braga Granata",
    "LUIZ EDUARDO DA SILVA BRAGA",
    "VEREADOR",
    2024
  )
  assert.ok(
    result.status === "rejected" || result.status === "suspect",
    `expected rejected/suspect, got ${result.status}`
  )
  assert.notEqual(result.status, "accepted")
})

test("assessWeakMatch rejects jeronimo 2024 homonym", () => {
  const result = assessWeakMatch(
    "Jeronimo Rodrigues de Jesus",
    "JERONIMO PEREIRA FLORES",
    "VEREADOR",
    2024
  )
  assert.ok(
    result.status === "rejected" || result.status === "suspect",
    `expected rejected/suspect, got ${result.status}`
  )
  assert.notEqual(result.status, "accepted")
})

test("assessWeakMatch rejects cleitinho 2024 homonym", () => {
  const result = assessWeakMatch(
    "Cleitinho Azevedo",
    "CLEITON ALVES DA SILVA",
    "VEREADOR",
    2024
  )
  assert.ok(
    result.status === "rejected" || result.status === "suspect",
    `expected rejected/suspect, got ${result.status}`
  )
  assert.notEqual(result.status, "accepted")
})

test("assessWeakMatch rejects maria-do-carmo 2024 homonym", () => {
  const result = assessWeakMatch(
    "Maria do Carmo Seffair",
    "MARIA DO CARMO MELO DE FRANCA",
    "VEREADOR",
    2024
  )
  assert.ok(
    result.status === "rejected" || result.status === "suspect",
    `expected rejected/suspect, got ${result.status}`
  )
  assert.notEqual(result.status, "accepted")
})

// --- assessWeakMatch: POSITIVE cases (legitimate matches that should still pass) ---

test("assessWeakMatch accepts name-urna-uf when nome_completo matches well", () => {
  // A case where name-urna-uf finds the right person in a state/federal election
  const result = assessWeakMatch(
    "Eduardo Braga Granata",
    "EDUARDO BRAGA GRANATA",
    "SENADOR",
    2018
  )
  assert.equal(result.status, "accepted")
})

test("assessWeakMatch accepts when names match with minor differences", () => {
  // Same person, slightly different registrations
  const result = assessWeakMatch(
    "Jeronimo Rodrigues de Jesus",
    "JERONIMO RODRIGUES DE JESUS",
    "DEPUTADO ESTADUAL",
    2014
  )
  assert.equal(result.status, "accepted")
})

test("assessWeakMatch accepts prefeito match in municipal year when name is exact", () => {
  // PREFEITO is municipal but if name fully matches, it's the same person
  const result = assessWeakMatch(
    "David Almeida Loureiro",
    "DAVID ALMEIDA LOUREIRO",
    "PREFEITO",
    2020
  )
  assert.equal(result.status, "accepted")
})

// --- Edge cases ---

test("assessWeakMatch: municipal cargo in non-municipal year doesn't trigger municipal penalty", () => {
  // Hypothetical: VEREADOR in a federal year (shouldn't happen but tests the guard)
  const result = assessWeakMatch(
    "Eduardo Braga Granata",
    "EDUARDO BRAGA GRANATA",
    "VEREADOR",
    2018 // federal year
  )
  assert.equal(result.status, "accepted")
})

test("assessWeakMatch: PREFEITO with matching name in municipal year is accepted", () => {
  const result = assessWeakMatch(
    "Joao Campos de Araujo",
    "JOAO CAMPOS DE ARAUJO",
    "PREFEITO",
    2020
  )
  assert.equal(result.status, "accepted")
})

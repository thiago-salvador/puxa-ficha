import assert from "node:assert/strict"
import test from "node:test"

import {
  shouldSkipExistingMatch,
  shouldSkipLowerPriorityInSameYear,
} from "../scripts/lib/ingest-tse-situacao"

test("shouldSkipExistingMatch: sem existing, nao descarta (aceita o match)", () => {
  assert.equal(shouldSkipExistingMatch(undefined, 2022, "12345678901"), false)
  assert.equal(shouldSkipExistingMatch(undefined, 2022, null), false)
  assert.equal(shouldSkipExistingMatch(undefined, 2022, ""), false)
})

test("shouldSkipExistingMatch: existing de ano mais recente com CPF valido, descarta linha antiga sempre", () => {
  const existing = { ano: 2024, cpf: "12345678901" }
  assert.equal(shouldSkipExistingMatch(existing, 2022, "98765432100"), true)
  assert.equal(shouldSkipExistingMatch(existing, 2022, ""), true)
  assert.equal(shouldSkipExistingMatch(existing, 2020, "98765432100"), true)
})

test("shouldSkipExistingMatch: Fase 4 merge condicional, existing novo sem CPF, linha antiga com CPF, ACEITA", () => {
  const existing = { ano: 2024, cpf: "" }
  assert.equal(shouldSkipExistingMatch(existing, 2022, "12345678901"), false)
})

test("shouldSkipExistingMatch: Fase 4 merge condicional tambem vale para ano=2026", () => {
  const existing = { ano: 2026, cpf: "" }
  assert.equal(shouldSkipExistingMatch(existing, 2022, "12345678901"), false)
})

test("shouldSkipExistingMatch: existing novo sem CPF E linha antiga sem CPF, descarta (nada a merge)", () => {
  const existing = { ano: 2024, cpf: "" }
  assert.equal(shouldSkipExistingMatch(existing, 2022, ""), true)
  assert.equal(shouldSkipExistingMatch(existing, 2022, null), true)
})

test("shouldSkipExistingMatch: existing com CPF invalido (menos de 11 digitos) tratado como vazio", () => {
  const existing = { ano: 2024, cpf: "123" }
  assert.equal(shouldSkipExistingMatch(existing, 2022, "12345678901"), false)
})

test("shouldSkipExistingMatch: linha com CPF invalido (menos de 11 digitos) tratada como sem CPF", () => {
  const existing = { ano: 2024, cpf: "" }
  assert.equal(shouldSkipExistingMatch(existing, 2022, "123"), true)
})

test("shouldSkipExistingMatch: mesmo ano, existing tem CPF, linha sem CPF, descarta", () => {
  const existing = { ano: 2022, cpf: "12345678901" }
  assert.equal(shouldSkipExistingMatch(existing, 2022, ""), true)
})

test("shouldSkipExistingMatch: mesmo ano, existing tem CPF, linha tambem tem, aceita (sobrescreve)", () => {
  const existing = { ano: 2022, cpf: "12345678901" }
  assert.equal(shouldSkipExistingMatch(existing, 2022, "98765432100"), false)
})

test("shouldSkipExistingMatch: existing de ano mais antigo, sempre aceita linha mais recente", () => {
  const existing = { ano: 2020, cpf: "12345678901" }
  assert.equal(shouldSkipExistingMatch(existing, 2022, ""), false)
  assert.equal(shouldSkipExistingMatch(existing, 2022, "98765432100"), false)
  assert.equal(shouldSkipExistingMatch(existing, 2024, "98765432100"), false)
})

test("shouldSkipExistingMatch: CPF com pontuacao e normalizado antes da validacao", () => {
  const existing = { ano: 2024, cpf: "" }
  assert.equal(
    shouldSkipExistingMatch(existing, 2022, "123.456.789-01"),
    false,
    "14 chars com pontuacao normaliza para 11 digitos validos"
  )
})

// Fase 14.1 (2026-04-14): bug de prioridade do resolver. Quando o mesmo slug
// matcha duas linhas do mesmo ano via metodos diferentes (sq-preloaded vs
// name-unique), a linha de maior prioridade tem que ganhar independente da
// ordem de iteracao do CSV.

test("shouldSkipLowerPriorityInSameYear: sem existing, nao descarta", () => {
  assert.equal(
    shouldSkipLowerPriorityInSameYear(undefined, 2020, "sq-preloaded"),
    false
  )
  assert.equal(
    shouldSkipLowerPriorityInSameYear(undefined, 2020, "name-unique"),
    false
  )
})

test("shouldSkipLowerPriorityInSameYear: anos diferentes, delega pra cross-year logic", () => {
  const existing = { ano: 2024, match_method: "sq-preloaded" as const }
  assert.equal(
    shouldSkipLowerPriorityInSameYear(existing, 2022, "name-unique"),
    false,
    "cross-year nao e responsabilidade desse helper"
  )
  assert.equal(
    shouldSkipLowerPriorityInSameYear(existing, 2020, "sq-preloaded"),
    false
  )
})

test("shouldSkipLowerPriorityInSameYear: mesmo ano, existing sq-preloaded, nova name-unique, skip", () => {
  const existing = { ano: 2020, match_method: "sq-preloaded" as const }
  assert.equal(
    shouldSkipLowerPriorityInSameYear(existing, 2020, "name-unique"),
    true,
    "sq-preloaded (4) > name-unique (2), preserva sq-preloaded"
  )
})

test("shouldSkipLowerPriorityInSameYear: mesmo ano, existing sq-preloaded, nova name-uf, skip", () => {
  const existing = { ano: 2020, match_method: "sq-preloaded" as const }
  assert.equal(
    shouldSkipLowerPriorityInSameYear(existing, 2020, "name-uf"),
    true,
    "sq-preloaded (4) > name-uf (1), preserva sq-preloaded"
  )
})

test("shouldSkipLowerPriorityInSameYear: mesmo ano, existing name-unique, nova sq-preloaded, aceita", () => {
  const existing = { ano: 2020, match_method: "name-unique" as const }
  assert.equal(
    shouldSkipLowerPriorityInSameYear(existing, 2020, "sq-preloaded"),
    false,
    "name-unique (2) < sq-preloaded (4), sq-preloaded deve sobrescrever"
  )
})

test("shouldSkipLowerPriorityInSameYear: mesmo ano, ambos sq-preloaded, nao skip (delega tie-break)", () => {
  const existing = { ano: 2020, match_method: "sq-preloaded" as const }
  assert.equal(
    shouldSkipLowerPriorityInSameYear(existing, 2020, "sq-preloaded"),
    false,
    "mesma prioridade, quem empata nao descarta; tie-break fica com shouldSkipExistingMatch"
  )
})

test("shouldSkipLowerPriorityInSameYear: mesmo ano, existing cpf (3), nova name-unique (2), skip", () => {
  const existing = { ano: 2022, match_method: "cpf" as const }
  assert.equal(
    shouldSkipLowerPriorityInSameYear(existing, 2022, "name-unique"),
    true
  )
})

test("shouldSkipLowerPriorityInSameYear: mesmo ano, existing name-unique (2), nova cpf (3), aceita", () => {
  const existing = { ano: 2022, match_method: "name-unique" as const }
  assert.equal(
    shouldSkipLowerPriorityInSameYear(existing, 2022, "cpf"),
    false
  )
})

test("shouldSkipLowerPriorityInSameYear: mesmo ano, existing name-unique (2), nova name-uf (1), skip", () => {
  const existing = { ano: 2020, match_method: "name-unique" as const }
  assert.equal(
    shouldSkipLowerPriorityInSameYear(existing, 2020, "name-uf"),
    true
  )
})

test("shouldSkipLowerPriorityInSameYear: caso canonico rafael-greca, ordem A-B, preserva sq-preloaded", () => {
  // Ordem A-B: sq-preloaded processado primeiro (linha PREFEITO Curitiba),
  // depois name-unique (linha VEREADOR Assai homonimo). Sem o guard, a linha
  // do vereador sobrescrevia. Com o guard, o vereador e descartado.
  const existing = { ano: 2020, match_method: "sq-preloaded" as const }
  assert.equal(
    shouldSkipLowerPriorityInSameYear(existing, 2020, "name-unique"),
    true,
    "rafael-greca: linha VEREADOR homonimo nao deve rebaixar linha PREFEITO sq-preloaded"
  )
})

test("shouldSkipLowerPriorityInSameYear: caso canonico rafael-greca, ordem B-A, sq-preloaded sobrescreve", () => {
  // Ordem B-A: name-unique processado primeiro, depois sq-preloaded. O novo
  // helper retorna false (nao descarta), deixando o overwrite acontecer no
  // processAno. Resultado final: sq-preloaded sempre vence.
  const existing = { ano: 2020, match_method: "name-unique" as const }
  assert.equal(
    shouldSkipLowerPriorityInSameYear(existing, 2020, "sq-preloaded"),
    false,
    "rafael-greca: linha PREFEITO sq-preloaded tem que sobrescrever linha VEREADOR name-unique"
  )
})

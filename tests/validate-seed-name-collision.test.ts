import assert from "node:assert/strict"
import test from "node:test"

import {
  ALLOWED_NAME_COLLISION_GROUPS,
  detectDuplicateCamaraIds,
  detectDuplicateSenadoIds,
  detectDuplicateSqCandidato,
  detectNameUrnaCollisions,
} from "../scripts/validate-seed"

// Fase 14.7 (2026-04-14): homonym prevention proativa em validate-seed.
// detectNameUrnaCollisions e pura: recebe entries e allowlist, retorna
// violacoes. Tests exercitam todos os cenarios relevantes.

test("detectNameUrnaCollisions: entries vazias, zero violacoes", () => {
  assert.deepEqual(detectNameUrnaCollisions([]), [])
})

test("detectNameUrnaCollisions: sem colisao, zero violacoes", () => {
  const entries = [
    { slug: "lula", nome_urna: "Lula" },
    { slug: "bolsonaro", nome_urna: "Bolsonaro" },
    { slug: "ciro-gomes", nome_urna: "Ciro Gomes" },
  ]
  assert.deepEqual(detectNameUrnaCollisions(entries), [])
})

test("detectNameUrnaCollisions: colisao fora da allowlist, violacao emitida", () => {
  const entries = [
    { slug: "joao-silva-1", nome_urna: "Joao Silva" },
    { slug: "joao-silva-2", nome_urna: "Joao Silva" },
  ]
  const violations = detectNameUrnaCollisions(entries)
  assert.equal(violations.length, 1)
  assert.deepEqual(violations[0].slugs, ["joao-silva-1", "joao-silva-2"])
  assert.equal(
    violations[0].normalized,
    "JOAO SILVA",
    "normalizeForMatch uppercases e remove acentos (NFD + strip combining + toUpperCase)"
  )
})

test("detectNameUrnaCollisions: colisao na allowlist, zero violacoes", () => {
  // ciro-gomes e ciro-gomes-gov-ce sao a mesma pessoa em 2 cargos.
  const entries = [
    { slug: "ciro-gomes", nome_urna: "Ciro Gomes" },
    { slug: "ciro-gomes-gov-ce", nome_urna: "Ciro Gomes" },
  ]
  assert.deepEqual(detectNameUrnaCollisions(entries), [])
})

test("detectNameUrnaCollisions: allowlist nao mascara colisao diferente", () => {
  // ciro-gomes + ciro-gomes-gov-ce estao na allowlist, mas
  // ciro-gomes-homonimo nao esta. Toda tupla sorted tem que bater exata.
  const entries = [
    { slug: "ciro-gomes", nome_urna: "Ciro Gomes" },
    { slug: "ciro-gomes-gov-ce", nome_urna: "Ciro Gomes" },
    { slug: "ciro-gomes-homonimo", nome_urna: "Ciro Gomes" },
  ]
  const violations = detectNameUrnaCollisions(entries)
  assert.equal(
    violations.length,
    1,
    "3-way collision nao bate com tupla de 2 na allowlist"
  )
  assert.deepEqual(violations[0].slugs, [
    "ciro-gomes",
    "ciro-gomes-gov-ce",
    "ciro-gomes-homonimo",
  ])
})

test("detectNameUrnaCollisions: colisao por diferenca de acento (normalize)", () => {
  const entries = [
    { slug: "a", nome_urna: "Tarcisio" },
    { slug: "b", nome_urna: "Tarcísio" },
  ]
  const violations = detectNameUrnaCollisions(entries, [])
  assert.equal(violations.length, 1, "Tarcisio === Tarcísio apos normalize")
})

test("detectNameUrnaCollisions: colisao por diferenca de case (normalize)", () => {
  const entries = [
    { slug: "a", nome_urna: "Lula" },
    { slug: "b", nome_urna: "LULA" },
  ]
  const violations = detectNameUrnaCollisions(entries, [])
  assert.equal(violations.length, 1)
})

test("detectNameUrnaCollisions: 3 slugs mesmo nome, single violacao com 3 slugs", () => {
  const entries = [
    { slug: "a", nome_urna: "Jose Silva" },
    { slug: "b", nome_urna: "Jose Silva" },
    { slug: "c", nome_urna: "Jose Silva" },
  ]
  const violations = detectNameUrnaCollisions(entries)
  assert.equal(violations.length, 1)
  assert.deepEqual(violations[0].slugs, ["a", "b", "c"])
})

test("detectNameUrnaCollisions: nome_urna vazio ignorado", () => {
  const entries = [
    { slug: "a", nome_urna: "" },
    { slug: "b", nome_urna: "" },
  ]
  assert.deepEqual(detectNameUrnaCollisions(entries), [])
})

test("detectNameUrnaCollisions: allowlist custom passa", () => {
  const entries = [
    { slug: "foo-1", nome_urna: "Foo" },
    { slug: "foo-2", nome_urna: "Foo" },
  ]
  const custom: ReadonlyArray<readonly string[]> = [["foo-1", "foo-2"]]
  assert.deepEqual(detectNameUrnaCollisions(entries, custom), [])
})

test("detectNameUrnaCollisions: output ordenado por normalized name asc", () => {
  const entries = [
    { slug: "z-1", nome_urna: "Zebra" },
    { slug: "z-2", nome_urna: "Zebra" },
    { slug: "a-1", nome_urna: "Alfa" },
    { slug: "a-2", nome_urna: "Alfa" },
  ]
  const violations = detectNameUrnaCollisions(entries)
  assert.equal(violations.length, 2)
  assert.equal(violations[0].normalized, "ALFA")
  assert.equal(violations[1].normalized, "ZEBRA")
})

test("ALLOWED_NAME_COLLISION_GROUPS baseline documentado: ciro-gomes", () => {
  const keys = ALLOWED_NAME_COLLISION_GROUPS.map((g) => [...g].sort().join("|"))
  assert.ok(keys.includes("ciro-gomes|ciro-gomes-gov-ce"))
  // Defesa contra adicoes sem documentacao: qualquer crescimento futuro
  // deveria vir com test de regressao.
  assert.equal(ALLOWED_NAME_COLLISION_GROUPS.length, 1)
})

// Fase 14.7 extension: detectDuplicateSqCandidato.

type SqFixtureEntry = { slug: string; ids: { tse_sq_candidato: Record<string, string> } }

test("detectDuplicateSqCandidato: entries vazias, zero violacoes", () => {
  assert.deepEqual(detectDuplicateSqCandidato([]), [])
})

test("detectDuplicateSqCandidato: sem duplicate, zero violacoes", () => {
  const entries: SqFixtureEntry[] = [
    { slug: "a", ids: { tse_sq_candidato: { "2022": "111" } } },
    { slug: "b", ids: { tse_sq_candidato: { "2022": "222" } } },
    { slug: "c", ids: { tse_sq_candidato: { "2020": "111" } } },
  ]
  assert.deepEqual(detectDuplicateSqCandidato(entries), [])
})

test("detectDuplicateSqCandidato: 2 slugs com mesmo SQ 2024, violacao", () => {
  const entries: SqFixtureEntry[] = [
    { slug: "evandro-augusto", ids: { tse_sq_candidato: { "2024": "130002114686" } } },
    { slug: "gabriel-azevedo", ids: { tse_sq_candidato: { "2024": "130002114686" } } },
  ]
  const violations = detectDuplicateSqCandidato(entries)
  assert.equal(violations.length, 1)
  assert.equal(violations[0].ano, "2024")
  assert.equal(violations[0].sq, "130002114686")
  assert.deepEqual(violations[0].slugs, ["evandro-augusto", "gabriel-azevedo"])
})

test("detectDuplicateSqCandidato: allowlist cobre mesmo SQ para pessoa em 2 cargos", () => {
  const entries: SqFixtureEntry[] = [
    { slug: "ciro-gomes", ids: { tse_sq_candidato: { "2022": "999" } } },
    { slug: "ciro-gomes-gov-ce", ids: { tse_sq_candidato: { "2022": "999" } } },
  ]
  assert.deepEqual(detectDuplicateSqCandidato(entries), [])
})

test("detectDuplicateSqCandidato: 3 slugs com mesmo SQ, single violacao com 3 slugs", () => {
  const entries: SqFixtureEntry[] = [
    { slug: "a", ids: { tse_sq_candidato: { "2020": "555" } } },
    { slug: "b", ids: { tse_sq_candidato: { "2020": "555" } } },
    { slug: "c", ids: { tse_sq_candidato: { "2020": "555" } } },
  ]
  const violations = detectDuplicateSqCandidato(entries)
  assert.equal(violations.length, 1)
  assert.deepEqual(violations[0].slugs, ["a", "b", "c"])
})

test("detectDuplicateSqCandidato: SQ vazio ignorado", () => {
  const entries: SqFixtureEntry[] = [
    { slug: "a", ids: { tse_sq_candidato: { "2022": "" } } },
    { slug: "b", ids: { tse_sq_candidato: { "2022": "" } } },
  ]
  assert.deepEqual(detectDuplicateSqCandidato(entries), [])
})

test("detectDuplicateSqCandidato: mesmo SQ em anos diferentes nao e duplicate", () => {
  const entries: SqFixtureEntry[] = [
    { slug: "a", ids: { tse_sq_candidato: { "2022": "111" } } },
    { slug: "b", ids: { tse_sq_candidato: { "2020": "111" } } },
  ]
  assert.deepEqual(detectDuplicateSqCandidato(entries), [])
})

test("detectDuplicateSqCandidato: multiple violacoes ordenadas por ano + sq", () => {
  const entries: SqFixtureEntry[] = [
    { slug: "a1", ids: { tse_sq_candidato: { "2022": "222" } } },
    { slug: "a2", ids: { tse_sq_candidato: { "2022": "222" } } },
    { slug: "b1", ids: { tse_sq_candidato: { "2020": "111" } } },
    { slug: "b2", ids: { tse_sq_candidato: { "2020": "111" } } },
  ]
  const violations = detectDuplicateSqCandidato(entries)
  assert.equal(violations.length, 2)
  assert.equal(violations[0].ano, "2020")
  assert.equal(violations[1].ano, "2022")
})

test("detectDuplicateSqCandidato: allowlist nao mascara duplicate fora da tupla", () => {
  const entries: SqFixtureEntry[] = [
    { slug: "ciro-gomes", ids: { tse_sq_candidato: { "2022": "999" } } },
    { slug: "ciro-gomes-gov-ce", ids: { tse_sq_candidato: { "2022": "999" } } },
    { slug: "ciro-gomes-outro-homonimo", ids: { tse_sq_candidato: { "2022": "999" } } },
  ]
  const violations = detectDuplicateSqCandidato(entries)
  assert.equal(violations.length, 1, "3-way fora da allowlist ainda e violacao")
  assert.deepEqual(violations[0].slugs, [
    "ciro-gomes",
    "ciro-gomes-gov-ce",
    "ciro-gomes-outro-homonimo",
  ])
})

// Fase 2.2 (2026-04-16): detectDuplicateCamaraIds e detectDuplicateSenadoIds.
// Reutilizam ALLOWED_NAME_COLLISION_GROUPS. Na coorte atual o unico duplicate
// conhecido e 141406 em ciro-gomes + ciro-gomes-gov-ce (mesma pessoa).

type CamaraFixtureEntry = { slug: string; ids: { camara: number | null } }
type SenadoFixtureEntry = { slug: string; ids: { senado: number | null } }

test("detectDuplicateCamaraIds: entries vazias, zero violacoes", () => {
  assert.deepEqual(detectDuplicateCamaraIds([]), [])
})

test("detectDuplicateCamaraIds: sem duplicate, zero violacoes", () => {
  const entries: CamaraFixtureEntry[] = [
    { slug: "a", ids: { camara: 111 } },
    { slug: "b", ids: { camara: 222 } },
    { slug: "c", ids: { camara: null } },
  ]
  assert.deepEqual(detectDuplicateCamaraIds(entries), [])
})

test("detectDuplicateCamaraIds: 2 slugs com mesmo id fora da allowlist, violacao", () => {
  const entries: CamaraFixtureEntry[] = [
    { slug: "joao-silva-1", ids: { camara: 141406 } },
    { slug: "joao-silva-2", ids: { camara: 141406 } },
  ]
  const violations = detectDuplicateCamaraIds(entries)
  assert.equal(violations.length, 1)
  assert.equal(violations[0].id, 141406)
  assert.deepEqual(violations[0].slugs, ["joao-silva-1", "joao-silva-2"])
})

test("detectDuplicateCamaraIds: allowlist cobre ciro-gomes + ciro-gomes-gov-ce", () => {
  const entries: CamaraFixtureEntry[] = [
    { slug: "ciro-gomes", ids: { camara: 141406 } },
    { slug: "ciro-gomes-gov-ce", ids: { camara: 141406 } },
  ]
  assert.deepEqual(detectDuplicateCamaraIds(entries), [])
})

test("detectDuplicateCamaraIds: ids null/undefined ignorados, zero violacoes", () => {
  const entries: CamaraFixtureEntry[] = [
    { slug: "a", ids: { camara: null } },
    { slug: "b", ids: { camara: null } },
    { slug: "c", ids: {} as { camara: number | null } },
  ]
  assert.deepEqual(detectDuplicateCamaraIds(entries), [])
})

test("detectDuplicateCamaraIds: 3 slugs com mesmo id, allowlist parcial nao mascara", () => {
  // ciro-gomes + ciro-gomes-gov-ce estao na allowlist, mas adicionar
  // um terceiro slug com o mesmo id quebra a tupla de 2 e vira violacao.
  const entries: CamaraFixtureEntry[] = [
    { slug: "ciro-gomes", ids: { camara: 141406 } },
    { slug: "ciro-gomes-gov-ce", ids: { camara: 141406 } },
    { slug: "ciro-gomes-homonimo", ids: { camara: 141406 } },
  ]
  const violations = detectDuplicateCamaraIds(entries)
  assert.equal(violations.length, 1, "3-way nao bate com tupla de 2 na allowlist")
  assert.deepEqual(violations[0].slugs, [
    "ciro-gomes",
    "ciro-gomes-gov-ce",
    "ciro-gomes-homonimo",
  ])
})

test("detectDuplicateCamaraIds: allowlist custom passa", () => {
  const entries: CamaraFixtureEntry[] = [
    { slug: "foo-1", ids: { camara: 42 } },
    { slug: "foo-2", ids: { camara: 42 } },
  ]
  const custom: ReadonlyArray<readonly string[]> = [["foo-1", "foo-2"]]
  assert.deepEqual(detectDuplicateCamaraIds(entries, custom), [])
})

test("detectDuplicateCamaraIds: multiple violacoes ordenadas por id asc", () => {
  const entries: CamaraFixtureEntry[] = [
    { slug: "a1", ids: { camara: 200 } },
    { slug: "a2", ids: { camara: 200 } },
    { slug: "b1", ids: { camara: 100 } },
    { slug: "b2", ids: { camara: 100 } },
  ]
  const violations = detectDuplicateCamaraIds(entries)
  assert.equal(violations.length, 2)
  assert.equal(violations[0].id, 100)
  assert.equal(violations[1].id, 200)
})

test("detectDuplicateSenadoIds: entries vazias, zero violacoes", () => {
  assert.deepEqual(detectDuplicateSenadoIds([]), [])
})

test("detectDuplicateSenadoIds: 2 slugs com mesmo id fora da allowlist, violacao", () => {
  const entries: SenadoFixtureEntry[] = [
    { slug: "a", ids: { senado: 1023 } },
    { slug: "b", ids: { senado: 1023 } },
  ]
  const violations = detectDuplicateSenadoIds(entries)
  assert.equal(violations.length, 1)
  assert.equal(violations[0].id, 1023)
  assert.deepEqual(violations[0].slugs, ["a", "b"])
})

test("detectDuplicateSenadoIds: allowlist cobre tupla da allowlist global", () => {
  const entries: SenadoFixtureEntry[] = [
    { slug: "ciro-gomes", ids: { senado: 4077 } },
    { slug: "ciro-gomes-gov-ce", ids: { senado: 4077 } },
  ]
  assert.deepEqual(detectDuplicateSenadoIds(entries), [])
})

test("detectDuplicateSenadoIds: ids null ignorados, zero violacoes", () => {
  const entries: SenadoFixtureEntry[] = [
    { slug: "a", ids: { senado: null } },
    { slug: "b", ids: { senado: null } },
  ]
  assert.deepEqual(detectDuplicateSenadoIds(entries), [])
})

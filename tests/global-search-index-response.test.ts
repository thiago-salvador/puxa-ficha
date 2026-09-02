/**
 * `/api/search-index` responde 200 mesmo degradado, com `ok: false` e cache
 * curto. Até 2026-09-02 o consumidor só olhava o status HTTP e indexava o que
 * viesse: índice degradado e vazio virava "nenhum resultado" para toda busca,
 * em vez do estado de erro que o provider já sabe mostrar.
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import { readGlobalSearchIndexResponse } from "../src/lib/global-search"

const item = { href: "/candidato/lula", label: "Lula" }

test("índice saudável devolve os itens", () => {
  assert.deepEqual(readGlobalSearchIndexResponse({ ok: true, data: [item] }), [item])
})

test("índice degradado com itens ainda serve, porque é melhor que nada", () => {
  assert.deepEqual(readGlobalSearchIndexResponse({ ok: false, data: [item] }), [item])
})

test("índice degradado e vazio é erro, não lista vazia", () => {
  assert.throws(() => readGlobalSearchIndexResponse({ ok: false, data: [] }), /degraded/)
})

test("corpo sem data ou malformado vira lista vazia sem lançar", () => {
  assert.deepEqual(readGlobalSearchIndexResponse({ ok: true }), [])
  assert.deepEqual(readGlobalSearchIndexResponse(null), [])
  assert.deepEqual(readGlobalSearchIndexResponse({ data: "x" }), [])
})

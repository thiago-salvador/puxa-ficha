import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { LIST_START_ANCHOR, LIST_START_HOURS, LIST_START_ORDER, listStartLetter } from "../src/lib/colinha"

const HOUR = 3_600_000

test("sequência de começos cobre as 26 letras, cada uma uma vez", () => {
  assert.equal(LIST_START_ORDER.length, 26)
  assert.deepEqual([...LIST_START_ORDER].sort(), "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""))
  assert.notEqual(LIST_START_ORDER.join(""), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "não segue o alfabeto")
})

test("a letra vale 5 horas a partir de 29/09/2026 0h de Brasília e dá a volta", () => {
  assert.equal(LIST_START_HOURS, 5)
  assert.equal(new Date(LIST_START_ANCHOR).toISOString(), "2026-09-29T03:00:00.000Z")
  assert.equal(listStartLetter(new Date(LIST_START_ANCHOR)), LIST_START_ORDER[0])
  assert.equal(listStartLetter(new Date(LIST_START_ANCHOR + 5 * HOUR - 1)), LIST_START_ORDER[0])
  assert.equal(listStartLetter(new Date(LIST_START_ANCHOR + 5 * HOUR)), LIST_START_ORDER[1])
  assert.equal(listStartLetter(new Date(LIST_START_ANCHOR + 26 * 5 * HOUR)), LIST_START_ORDER[0])
  // antes da âncora continua determinístico, sem índice negativo
  assert.equal(listStartLetter(new Date(LIST_START_ANCHOR - 1)), LIST_START_ORDER[25])
})

test("a consulta sem filtro começa na letra do momento e completa com o começo do alfabeto", () => {
  const data = readFileSync(new URL("../src/lib/colinha-data.ts", import.meta.url), "utf8")
  assert.match(data, /const start = listStartLetter\(now\)/)
  assert.match(data, /\.gte\("nome_urna", start\)\.order\("nome_urna"\)/)
  assert.match(data, /\.lt\("nome_urna", start\)\.order\("nome_urna"\)\.limit\(SEARCH_LIMIT - rows\.length\)/)
  assert.match(data, /listStart: start/)
})

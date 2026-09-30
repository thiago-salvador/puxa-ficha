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

test("a consulta sem filtro traz a lista completa, da letra do momento até dar a volta no alfabeto", () => {
  const data = readFileSync(new URL("../src/lib/colinha-data.ts", import.meta.url), "utf8")
  assert.match(data, /const start = listStartLetter\(now\)/)
  assert.match(data, /fetchAllRows\(\(\) => scoped\(base\(\)\)\.gte\("nome_urna", start\)\.order\("nome_urna"\)/)
  assert.match(data, /fetchAllRows\(\(\) => scoped\(base\(\)\)\.lt\("nome_urna", start\)\.order\("nome_urna"\)/)
  assert.match(data, /const rows = \[\.\.\.head, \.\.\.tail\]/)
  assert.match(data, /listStart: start/)
  // Sem corte em 20: pagina além do max_rows do PostgREST e enriquece em lotes.
  assert.doesNotMatch(data, /\.limit\(/)
  assert.match(data, /\.range\(from, from \+ PAGE_SIZE - 1\)/)
  assert.match(data, /index \+= ENRICH_CHUNK/)
})

test("a caixa da lista mantém a altura de 20 candidaturas e rola para mostrar as demais", () => {
  const ui = readFileSync(new URL("../src/components/ColinhaBuilder.tsx", import.meta.url), "utf8")
  // 20 linhas de 4rem mais o divisor de 1px: 20 × 65px = 1300px.
  assert.match(ui, /max-h-\[81\.25rem\][^"`]*overflow-y-auto/)
  assert.match(ui, /results\.length > VISIBLE_ROWS \? " Mostramos 20 por vez: digite o nome ou o número para achar a sua\."/)
  assert.doesNotMatch(ui, /Mostrando as 20 primeiras/)
})

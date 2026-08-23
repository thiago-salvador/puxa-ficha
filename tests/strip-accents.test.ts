import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { test } from "node:test"

import { normalizar as normalizeIdentityValue } from "../scripts/lib/identidade-etapa2-classificador"
import { normalizeBrUfToken } from "../src/lib/br-uf"
import { normalizeContradictionText } from "../src/lib/contradiction-utils"
import { normalizeForSearch } from "../src/lib/search-normalize"
import { stripAccents } from "../src/lib/strip-accents"
import { normalizeForMatch } from "../scripts/lib/normalize-for-match"

test("stripAccents preserves the measured standard-range contract", () => {
  const cases: Array<[input: string, expected: string]> = [
    ["Sao Paulo", "Sao Paulo"],
    ["São José da Conceição", "Sao Jose da Conceicao"],
    ["á", "a"],
    ["a\u0301", "a"],
    ["Çç", "Cc"],
    ["C\u0327c\u0327", "Cc"],
    ["ÁÉÍÓÚ ÃÕ Ç", "AEIOU AO C"],
    ["", ""],
    ["a\u1ab0", "a\u1ab0"],
    ["1\u20e3", "1\u20e3"],
    ["a\u02b9", "a\u02b9"],
    ["Øø", "Øø"],
  ]

  for (const [input, expected] of cases) assert.equal(stripAccents(input), expected)
})

test("stripAccents keeps the original string-only runtime contract", () => {
  for (const invalid of [null, undefined, 123]) {
    assert.throws(() => stripAccents(invalid as unknown as string), TypeError)
  }
})

test("consumer coercion and transformation order remain unchanged", () => {
  assert.equal(normalizeForSearch("  São JOSÉ  "), "sao jose")
  assert.equal(normalizeForMatch("  São José  "), "SAO JOSE")
  assert.equal(normalizeContradictionText("  TRIBUTÁRIA  "), "tributaria")
  assert.equal(normalizeContradictionText(null), "")
  assert.equal(normalizeIdentityValue(null), "")
  assert.equal(normalizeIdentityValue(undefined), "")
  assert.equal(normalizeIdentityValue(123), "123")
})

test("broader Unicode normalizers remain intentionally distinct", () => {
  assert.equal(stripAccents("a\u1ab0"), "a\u1ab0")
  assert.equal(normalizeBrUfToken("a\u1ab0"), "a")
})

test("tracked operational code contains only the canonical standard-range primitive", () => {
  const files = execFileSync("git", [
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "-z",
    "--",
    "src/**/*.ts",
    "src/**/*.tsx",
    "scripts/**/*.ts",
    "scripts/**/*.mjs",
  ], { encoding: "utf8" }).split("\0").filter(Boolean)

  const standardRange = /\.normalize\(["']NFD["']\)\s*\.replace\(\/\[(?:\\u0300-\\u036f|̀-ͯ)\]\/g,\s*["']{2}\)/g
  const matches: string[] = []
  for (const file of files) {
    const count = readFileSync(file, "utf8").match(standardRange)?.length ?? 0
    for (let index = 0; index < count; index += 1) matches.push(file)
  }

  assert.deepEqual(matches, ["src/lib/strip-accents.ts"])
})

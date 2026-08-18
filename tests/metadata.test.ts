import test from "node:test"
import assert from "node:assert/strict"
import { buildAbsoluteUrl, parseMetadataDate } from "../src/lib/metadata"

test("parseMetadataDate returns undefined for invalid dates", () => {
  assert.equal(parseMetadataDate("not-a-date"), undefined)
  assert.equal(parseMetadataDate(null), undefined)
})

test("parseMetadataDate returns a valid Date for parseable strings", () => {
  const parsed = parseMetadataDate("2026-04-03T12:00:00.000Z")

  assert.ok(parsed instanceof Date)
  assert.equal(parsed?.toISOString(), "2026-04-03T12:00:00.000Z")
})

test("buildAbsoluteUrl normalizes relative paths against site origin", () => {
  assert.equal(buildAbsoluteUrl("/comparar"), "https://puxaficha.com.br/comparar")
})

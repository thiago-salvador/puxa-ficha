import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

test("jobs longos têm timeout explícito", () => {
  const ci = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8")
  const apply = readFileSync(new URL("../.github/workflows/apply-chapas-2026-biografias.yml", import.meta.url), "utf8")
  assert.match(ci, /  verify:\n    runs-on: ubuntu-latest\n    timeout-minutes: 30/)
  assert.match(apply, /  apply:\n    if: github\.ref == 'refs\/heads\/main'\n    runs-on: ubuntu-latest\n    timeout-minutes: 30/)
})

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

test("jobs longos têm timeout explícito", () => {
  const ci = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8")
  const apply = readFileSync(new URL("../.github/workflows/apply-chapas-2026-biografias.yml", import.meta.url), "utf8")
  const ledger = readFileSync(new URL("../.github/workflows/ledger-guard.yml", import.meta.url), "utf8")
  assert.match(ci, /  verify:\n    runs-on: ubuntu-latest\n    timeout-minutes: 30/)
  assert.match(apply, /  apply:\n    if: github\.ref == 'refs\/heads\/main'\n    runs-on: ubuntu-latest\n    timeout-minutes: 30/)
  assert.match(ledger, /timeout-minutes: 30/)
})

test("cobertura em shards mantém o check obrigatório e não passa com shard pulado", () => {
  const ci = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8")
  assert.match(ci, /  cobertura-shard:\n    name: Cobertura \(shard \$\{\{ matrix\.shard \}\}\/4\)\n    runs-on: ubuntu-latest\n    timeout-minutes: 15\n/)
  assert.match(ci, /--test-shard|test:coverage:shard/)
  assert.match(
    ci,
    /  cobertura:\n    name: Cobertura \(bloqueante\)\n    needs: cobertura-shard\n    if: always\(\)\n/
  )
  assert.match(ci, /SHARDS: \$\{\{ needs\.cobertura-shard\.result \}\}[\s\S]*test "\$SHARDS" = "success"/)
  assert.match(ci, /run: npm run test:coverage:report/)
})

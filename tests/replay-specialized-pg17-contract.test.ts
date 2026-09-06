import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { test } from "node:test"

test("gate de replay executa todas as provas PG17 especializadas", () => {
  const workflow = readFileSync(
    resolve(process.cwd(), ".github/workflows/replay-migrations.yml"),
    "utf8",
  )

  for (const script of [
    "provar-textos-julgamento-pg17.sh",
    "provar-profissao-alvaro-dias-rn-pg17.sh",
  ]) {
    assert.match(workflow, new RegExp(`bash scripts/audit/${script.replaceAll(".", "\\.")}`))
  }
})

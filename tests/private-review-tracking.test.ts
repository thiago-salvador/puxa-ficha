import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import test from "node:test"

test("tracked files contain no private review material", () => {
  const paths = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean)
  const forbiddenPath = /^(?:codex|plans|outputs|projections|revisoes)\//i
  assert.deepEqual(paths.filter((path) => forbiddenPath.test(path)), [])
  const changed = new Set(execFileSync("git", ["diff", "--name-only", "-z", "origin/main"], { encoding: "utf8" }).split("\0").filter(Boolean))
  const privatePath = new RegExp([["/", "Users", "/"].join(""), ["evidencias", "-privadas"].join("")].join("|"))
  const birthReview = new RegExp(["data_nascimento", ".*", "19[0-9]{2}"].join(""), "i")
  const leaked = paths.filter((path) => {
    if (!changed.has(path)) return false
    if (!/\.(?:json|jsonl|md|ts|tsx|mjs|sql|sh)$/.test(path)) return false
    const content = readFileSync(path, "utf8")
    return privatePath.test(content) || (path.endsWith(".json") && birthReview.test(content))
  })
  assert.deepEqual(leaked, [])
})

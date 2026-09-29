import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import test from "node:test"

test("tracked files contain no private review material", () => {
  const paths = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean)
  const forbiddenPath = /^(?:codex|plans|outputs|projections|revisoes)\//i
  const allowedPreexistingPathNames = new Set<string>([])
  assert.deepEqual(paths.filter((path) => forbiddenPath.test(path) && !allowedPreexistingPathNames.has(path)), [])
  const privatePath = new RegExp([["/", "Users", "/"].join(""), ["evidencias", "-privadas"].join("")].join("|"))
  const birthReview = new RegExp(["data_nascimento", ".*", "19[0-9]{2}"].join(""), "i")
  // Preserve historical snapshots byte-for-byte while rejecting any new or changed birth-date line.
  const legacyBirthHashes: Record<string, string> = {
    "QA/evidencias/2026-08-12-orleans-destaques-proveniencia/manifesto.json": "c5d9b7f43241a71ce17700f4311fe7df6465d7ffde6715b0e41f3926abfa12d7",
    "data/chapas-2026-tse-20260812.json": "0d715166aef884f1f80093c2ab1ee0fed0b4847c9b3f6800aaae6c7281305e08",
    "data/chapas-2026-tse-20260815.json": "18a2cda2a23b2b5b93b00a88d0ba8c1821ffc5b8818c1c6fee380dd2c35f0136",
    "data/chapas-2026-tse-20260827.json": "e4213819c7e786f5814f949c5dab80fe16b9c8886fe6514bae4134df982483c1",
    "data/freshness-closeout-20260905.json": "28f1153bc2221dbc230f3623ca15bc3de7cd2755ed1103496e32bd72e6908800",
    "data/identidade-etapa2-nascimentos.json": "b41a927e99cd5cfe73c85db6ada0956b40ad0ccebc1f1d8e85998daea3433a4d",
    "data/siqueira-to-20260907.json": "e32d7a42adf8bba8f76b5df7e4adad2754fd0aef81a23d49086b906934f5cf2c",
    "data/tse-profile-links-20260827.json": "1b76aa159fe3f294a1d91653e45c524167a3cdf67f49818f7b09c864ae4ac40f",
  }
  // Historical evidence was redacted in L11; no tracked file may carry a private marker line.
  const leaked = paths.filter((path) => {
    const content = readFileSync(path, "utf8")
    if (path.endsWith(".json") && birthReview.test(content)) {
      const birthLines = content.split("\n").filter((line) => birthReview.test(line))
      const digest = createHash("sha256").update(`${birthLines.join("\n")}\n`).digest("hex")
      if (legacyBirthHashes[path] !== digest) return true
    }
    return content.split("\n").some((line) => privatePath.test(line))
  })
  assert.deepEqual(leaked, [])
})

test("birth-date marker guard applies to every tracked JSON", () => {
  const scanner = readFileSync(new URL("./private-review-tracking.test.ts", import.meta.url), "utf8")
  assert.doesNotMatch(scanner, /path\.endsWith\("\.json"\)\s*&&\s*\/revis\|review\/i/)
})

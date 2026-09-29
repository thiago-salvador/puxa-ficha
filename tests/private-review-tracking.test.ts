import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import test from "node:test"

// Home and scratch paths leak in escaped forms too: regex-escaped, char class,
// URL-encoded and Windows-escaped. Pieces are joined so this file never matches itself.
const separator = ["/", "\\\\/", "\\[/\\]", "%2[Ff]", "\\\\\\\\", "\\\\"].join("|")
const sep = `(?:${separator})`
const usersDir = ["Us", "ers"].join("")
const homeDir = ["ho", "me"].join("")
const scratchDir = [sep, "private", sep, "tmp", sep, ["cla", "ude-"].join("")].join("")
const privateMarker = new RegExp([
  [sep, usersDir, sep].join(""),
  // Not glued to a URL segment (site/home/..., gov.br/home/...).
  ["(?<![A-Za-z0-9._-])", sep, homeDir, sep, "[A-Za-z0-9._-]"].join(""),
  scratchDir,
  ["evidencias", "-privadas"].join(""),
].join("|"))

// Files that must spell a home path to assert its absence. The digest pins the exact
// marker lines, so any new or changed marker line in these files still fails.
const allowedMarkerLines: Record<string, { sha256: string; reason: string }> = {
  "tests/chapas-2026-pos-registro.test.ts": { sha256: "9732774f82ed20f3ec5ba1d06558429c373ab2880cf1fc7b305f4f500b1a24b8", reason: "asserts the generated plan has no home path" },
  "tests/coderabbit-mediums.test.ts": { sha256: "4f1e6e13bcaf512579158df76a51de1074f219f92ebdf6dc73c2fa82b96b9a3e", reason: "asserts a script source has no home path" },
  "tests/migrations-classificacao.test.ts": { sha256: "dcfda7257d2910f41d738a7548605955b6d705d58e70860c217419f8f6776876", reason: "asserts a migration has no home path" },
  "tests/programa-governo-runners.test.ts": { sha256: "6efe1a7e8e2bd68d0325d44bb343a7a8575e3f4bfba6211171b50fda6a8c9e57", reason: "asserts the runner default is not a home path" },
  "tests/tse-identidade-celulas.test.ts": { sha256: "b126300a0e8720d0f960f127b03594e1c324780dc2776f775cf529e09c278d6d", reason: "asserts identity cells carry no home path" },
  "tests/processos-renovacao-coorte-atual.test.ts": { sha256: "0f547c3fae27f80d636e4d426c1d7edd3847a0625141a80540477c63f4f905b3", reason: "public GitHub Actions runner home, accepted as persistent" },
  "tests/settings-contract.test.ts": { sha256: "5bc5a7cdddf7a7038a5d3596cd949c47013ce84a42a8114d9fd5eae1697ea102", reason: "public GitHub Actions runner home in a doc comment" },
}

test("private marker catches escaped home and scratch paths", () => {
  const u = usersDir
  const caught = [
    ["/", u, "/someone/x"].join(""),
    ["assert.doesNotMatch(migration, /", "\\/", u, "\\/", "/)"].join(""),
    ["/cpf|nascimento|nome|NM_CANDIDATO|", "\\/", u, "\\/", "/i"].join(""),
    ["/[/]", u, "[/]/"].join(""),
    ["file%2F", u, "%2Fsomeone"].join(""),
    ["C:", "\\\\", u, "\\\\", "someone"].join(""),
    ["C:", "\\", u, "\\", "someone"].join(""),
    ["\"", "/", homeDir, "/someone/x\""].join(""),
    ["/", "private/tmp/", "claude-501/x"].join(""),
  ]
  for (const line of caught) assert.match(line, privateMarker, line)
  const ignored = [
    "https://www.instagram.com/api/v1/users/web_profile_info/",
    ["https://sidra.ibge.gov.br/", homeDir, "/pmc/"].join(""),
    ["https://conteudo.imguol.com.br/c/", homeDir, "/53/2019/"].join(""),
    "<home>/.codex/skills/opencode/scripts/opencode-go.mjs",
  ]
  for (const line of ignored) assert.doesNotMatch(line, privateMarker, line)
})

test("tracked files contain no private review material", () => {
  const paths = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean)
  const forbiddenPath = /^(?:codex|plans|outputs|projections|revisoes)\//i
  const allowedPreexistingPathNames = new Set<string>([])
  assert.deepEqual(paths.filter((path) => forbiddenPath.test(path) && !allowedPreexistingPathNames.has(path)), [])
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
    const markerLines = content.split("\n").filter((line) => privateMarker.test(line))
    if (!markerLines.length) return false
    const digest = createHash("sha256").update(`${markerLines.join("\n")}\n`).digest("hex")
    return allowedMarkerLines[path]?.sha256 !== digest
  })
  assert.deepEqual(leaked, [])
})

test("birth-date marker guard applies to every tracked JSON", () => {
  const scanner = readFileSync(new URL("./private-review-tracking.test.ts", import.meta.url), "utf8")
  assert.doesNotMatch(scanner, /path\.endsWith\("\.json"\)\s*&&\s*\/revis\|review\/i/)
})

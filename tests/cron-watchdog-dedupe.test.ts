import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { it } from "node:test"

// Exercise the real publishing function with API stubs. Never contact GitHub.
const source = readFileSync("scripts/cron-watchdog.sh", "utf8")
const definition = source.slice(source.indexOf("publish_anomaly()"), source.indexOf("WORKFLOW_FILES=()"))
const fingerprint = createHash("sha256").update(JSON.stringify([
  "example.yml", ".github/workflows/example.yml", "failure", "https://example.test/run/99", "99",
])).digest("hex")

function publish(body: string, run = "99", dry = false, failComment = false) {
  const directory = mkdtempSync(join(tmpdir(), "watchdog-dedupe-"))
  try {
    writeFileSync(join(directory, "calls"), "")
    const result = spawnSync("bash", ["-c", `
set -euo pipefail
REPO=example/repo
LABEL=cron-failure
DRY_RUN="$TEST_DRY"
json_get() { printf '%s\\n' "$TEST_ISSUES"; }
gh() {
  cat > "$TEST_DIR/request.json"
  printf 'WRITE:%s\\n' "$*" >> "$TEST_DIR/calls"
  if [[ "$TEST_FAIL_COMMENT" == 1 && "$*" == *'/comments'* ]]; then return 1; fi
}
${definition}
publish_anomaly example.yml Example failure "https://example.test/run/$TEST_RUN" "$TEST_RUN"
`], {
      encoding: "utf8",
      env: { ...process.env, TEST_DIR: directory, TEST_RUN: run, TEST_DRY: dry ? "1" : "0",
        TEST_FAIL_COMMENT: failComment ? "1" : "0",
        TEST_ISSUES: JSON.stringify([{ number: 42, body }]) },
    })
    return { ...result, stdout: result.stdout + readFileSync(join(directory, "calls"), "utf8") }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

const marker = "<!-- cron-watchdog-workflow:example.yml -->"
const recorded = `${marker}\n<!-- cron-watchdog-fingerprint:${fingerprint} -->`

it("does not write for the identical observation, independent of timestamp", () => {
  const result = publish(`${recorded}\nDetectado em: yesterday`)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /ocorrência idêntica/)
  assert.doesNotMatch(result.stdout, /WRITE:/)
})

it("a new failed run posts a comment and persists the new observation", () => {
  const result = publish(recorded, "100")
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /WRITE:api --method POST .*42\/comments/)
  assert.match(result.stdout, /WRITE:api --method PATCH .*42 /)
})

it("migrates existing issues without a fingerprint on their next observation", () => {
  const result = publish(marker)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /WRITE:api --method POST/)
  assert.match(result.stdout, /WRITE:api --method PATCH/)
})

it("dry run never posts or patches an issue", () => {
  const result = publish(marker, "99", true)
  assert.equal(result.status, 0, result.stderr)
  assert.doesNotMatch(result.stdout, /WRITE:/)
})

it("does not acknowledge a comment that failed to publish", () => {
  const result = publish(marker, "99", false, true)
  assert.equal(result.status, 1)
  assert.doesNotMatch(result.stdout, /WRITE:api --method PATCH/)
})

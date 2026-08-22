import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { test } from "node:test"

const root = process.cwd()

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8")
}

test("workflow is pinned, read-only and fail-closed", () => {
  const workflow = read(".github/workflows/gitleaks.yml")

  assert.match(
    workflow,
    /actions\/checkout@[0-9a-f]{40}\s+# v7\.0\.1/,
  )
  assert.match(
    workflow,
    /gitleaks\/gitleaks-action@e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e\s+# v3\.0\.0/,
  )
  assert.match(workflow, /GITLEAKS_VERSION:\s+"8\.30\.1"/)
  assert.match(workflow, /permissions:\n\s+contents: read\n\s+pull-requests: read/)
  assert.match(workflow, /fetch-depth:\s+0/)
  assert.match(workflow, /persist-credentials:\s+false/)
  assert.match(workflow, /GITLEAKS_ENABLE_COMMENTS:\s+"false"/)
  assert.match(workflow, /GITLEAKS_ENABLE_SUMMARY:\s+"false"/)
  assert.match(workflow, /GITLEAKS_ENABLE_UPLOAD_ARTIFACT:\s+"false"/)
  assert.doesNotMatch(workflow, /continue-on-error/)
})

test("controlled fixture is detected without exposing its value", () => {
  const fixtureDirectory = mkdtempSync(path.join(tmpdir(), "puxa-ficha-gitleaks-"))
  const controlledValue = [
    "ghp_",
    "A1b2",
    "C3d4",
    "E5f6",
    "G7h8",
    "I9j0",
    "K1l2",
    "M3n4",
    "O5p6",
    "Q7r8S",
  ].join("")

  try {
    writeFileSync(
      path.join(fixtureDirectory, "controlled.env"),
      `CONTROLLED_TEST_VALUE=${controlledValue}\n`,
      { mode: 0o600 },
    )

    const result = spawnSync(
      "gitleaks",
      [
        "dir",
        fixtureDirectory,
        "--config",
        path.join(root, ".gitleaks.toml"),
        "--no-banner",
        "--redact=100",
        "--exit-code=17",
      ],
      { encoding: "utf8" },
    )
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`

    assert.ifError(result.error)
    assert.equal(result.status, 17, "controlled fixture must fail the scan")
    assert.match(output, /leaks found:\s*1/i)
    assert.equal(
      output.includes(controlledValue),
      false,
      "scanner output must redact the complete controlled value",
    )
  } finally {
    rmSync(fixtureDirectory, { recursive: true, force: true })
  }
})

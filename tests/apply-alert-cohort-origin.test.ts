import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import test from "node:test"

const applyScript = resolve("scripts/audit/apply-alert-cohort-subscriptions-production.sh")
const expectedSha = "a".repeat(40)

for (const [originUrl, accepted] of [
  ["https://github.com/thiago-salvador/puxa-ficha", true],
  ["https://github.com/thiago-salvador/puxa-ficha.git", true],
  ["git@github.com:thiago-salvador/puxa-ficha.git", true],
  ["https://github.com/other-owner/puxa-ficha", false],
] as const) {
  test(`apply checks origin ${originUrl}`, () => {
    const bin = mkdtempSync(join(tmpdir(), "alert-cohort-origin-"))
    try {
      const gitStub = join(bin, "git")
      writeFileSync(gitStub, `#!/bin/sh
case "$1" in
  rev-parse) printf '%s\\n' "$PF_EXPECTED_SHA" ;;
  status) ;;
  remote) printf '%s\\n' "$TEST_ORIGIN_URL" ;;
  ls-remote) printf '%s\\trefs/heads/main\\n' "$PF_EXPECTED_SHA" ;;
  *) exit 90 ;;
esac
`)
      chmodSync(gitStub, 0o755)

      const result = spawnSync("bash", [applyScript], {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          PF_EXPECTED_SHA: expectedSha,
          GITHUB_REF: "refs/heads/main",
          PF_DATABASE_URL: "postgresql://test:placeholder@invalid.example/postgres",
          TEST_ORIGIN_URL: originUrl,
        },
      })

      assert.equal(result.status, 2, result.stderr)
      assert.match(
        result.stderr,
        accepted
          ? /database URL does not identify a Supabase project/
          : /origin is not the expected repository/,
      )
    } finally {
      rmSync(bin, { recursive: true, force: true })
    }
  })
}

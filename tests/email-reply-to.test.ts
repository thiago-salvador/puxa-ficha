import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { describe, it } from "node:test"

describe("email Reply-To", () => {
  it("runs the transport contract under the server-only condition", () => {
    const contractPath = fileURLToPath(
      new URL("./helpers/email-reply-to-server-contract.ts", import.meta.url),
    )
    const result = spawnSync(
      process.execPath,
      ["--conditions=react-server", "--import", "tsx", "--test", contractPath],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: process.env,
      },
    )

    assert.equal(
      result.status,
      0,
      [result.stdout, result.stderr].filter(Boolean).join("\n"),
    )
  })
})

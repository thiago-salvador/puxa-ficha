import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, it } from "node:test"

const packageJson = JSON.parse(
  readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
) as {
  packageManager?: string
  engines?: { node?: string }
  scripts?: Record<string, string>
}

describe("contrato do runtime", () => {
  it("fixa Node e npm", () => {
    assert.equal(packageJson.engines?.node, "24.x")
    assert.match(packageJson.packageManager ?? "", /^npm@\d+\.\d+\.\d+$/)
  })

  it("falha cedo nos comandos principais", () => {
    for (const command of ["dev", "build", "typecheck", "lint", "test"]) {
      assert.equal(packageJson.scripts?.[`pre${command}`], "npm run check:runtime")
    }
  })
})

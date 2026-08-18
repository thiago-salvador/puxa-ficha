import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, it } from "node:test"

const routePath = resolve(process.cwd(), "src/app/api/deployment-info/route.ts")

describe("deployment-info route contract", () => {
  const src = readFileSync(routePath, "utf8")

  it("exposes only non-secret Vercel deployment metadata", () => {
    assert.match(src, /VERCEL_GIT_COMMIT_SHA/)
    assert.match(src, /VERCEL_GIT_COMMIT_REF/)
    assert.match(src, /VERCEL_ENV/)
    assert.doesNotMatch(src, /SECRET|TOKEN|KEY/)
  })

  it("is dynamic and explicitly no-store", () => {
    assert.match(src, /export\s+const\s+dynamic\s*=\s*"force-dynamic"/)
    assert.match(src, /private, no-store, no-cache, must-revalidate, max-age=0/)
  })
})

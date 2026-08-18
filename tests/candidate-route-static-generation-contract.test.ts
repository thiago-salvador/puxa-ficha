import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, it } from "node:test"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

const routes = [
  {
    label: "/candidato/[slug]",
    path: "src/app/(site)/candidato/[slug]/page.tsx",
  },
  {
    label: "/embed/[slug]",
    path: "src/app/(embed)/embed/[slug]/page.tsx",
  },
] as const

describe("candidate dynamic route build contract", () => {
  for (const route of routes) {
    const src = readFileSync(join(root, route.path), "utf8")

    it(`${route.label} is request-rendered and does not pre-render the full candidate catalog`, () => {
      assert.match(src, /export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/)
      assert.doesNotMatch(src, /export\s+async\s+function\s+generateStaticParams/)
      assert.doesNotMatch(src, /getCandidatoSlugStaticParams/)
    })
  }

  it("/api/candidato-slugs remains the public full-slug inventory", () => {
    const apiRoute = readFileSync(join(root, "src/app/api/candidato-slugs/route.ts"), "utf8")
    assert.match(apiRoute, /getCandidatoSlugStaticParams/)
  })
})

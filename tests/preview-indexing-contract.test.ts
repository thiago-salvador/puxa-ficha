import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { SITE_ORIGIN } from "@/lib/metadata"
import {
  buildRobotsForDeployment,
  EMBED_NOINDEX_HEADER_VALUE,
  getEmbedNoindexHeaderValue,
  getPreviewMetadataRobots,
  PREVIEW_NOINDEX_HEADER_VALUE,
} from "@/lib/preview-indexing"

test("preview deployment aplica noindex global e robots bloqueando crawl", () => {
  assert.strictEqual(getEmbedNoindexHeaderValue("preview"), PREVIEW_NOINDEX_HEADER_VALUE)
  assert.deepStrictEqual(getPreviewMetadataRobots("preview"), { index: false, follow: false })

  const robots = buildRobotsForDeployment("preview")

  assert.strictEqual(robots.sitemap, undefined)
  assert.deepStrictEqual(robots, {
    rules: [
      {
        userAgent: "*",
        disallow: "/",
      },
    ],
  })
})

test("producao preserva robots publico e embed noindex estreito", () => {
  assert.strictEqual(getEmbedNoindexHeaderValue("production"), EMBED_NOINDEX_HEADER_VALUE)
  assert.strictEqual(getPreviewMetadataRobots("production"), undefined)

  const robots = buildRobotsForDeployment("production")
  const rules = Array.isArray(robots.rules) ? robots.rules : robots.rules ? [robots.rules] : []
  const [rule] = rules

  assert.ok(rule)

  assert.strictEqual(rule.userAgent, "*")
  assert.strictEqual(rule.allow, "/")
  assert.deepStrictEqual(rule.disallow, [
    "/styleguide",
    "/internaltest",
    "/preview",
    "/api/",
    "/embed/",
  ])
  assert.strictEqual(robots.sitemap, `${SITE_ORIGIN}/sitemap.xml`)
})

test("sitemap e robots de producao usam SITE_ORIGIN, sem dominio hardcoded", () => {
  const sitemap = readFileSync("src/app/sitemap.ts", "utf8")
  const robotsHelper = readFileSync("src/lib/preview-indexing.ts", "utf8")
  const robotsRoute = readFileSync("src/app/robots.ts", "utf8")
  const metadataHelper = readFileSync("src/lib/metadata.ts", "utf8")

  assert.match(metadataHelper, /export const SITE_ORIGIN/)
  assert.match(metadataHelper, /process\.env\.NEXT_PUBLIC_SITE_URL/)

  assert.equal(sitemap.includes("https://puxaficha.com.br"), false)
  assert.match(sitemap, /SITE_ORIGIN/)

  assert.equal(robotsHelper.includes("https://puxaficha.com.br"), false)
  assert.match(robotsHelper, /from ["']\.\/metadata["']/)
  assert.match(robotsHelper, /\$\{SITE_ORIGIN\}\/sitemap\.xml/)

  assert.match(robotsRoute, /buildRobotsForDeployment/)
})

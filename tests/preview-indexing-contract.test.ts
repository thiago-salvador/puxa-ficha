import assert from "node:assert/strict"
import test from "node:test"
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
  assert.strictEqual(robots.sitemap, "https://puxaficha.com.br/sitemap.xml")
})

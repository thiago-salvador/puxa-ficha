import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const routePath = join(root, "src/app/api/search-index/route.ts")

test("search-index filtra pela coorte canônica e não fica uma hora no CDN", () => {
  const source = readFileSync(routePath, "utf8")

  assert.match(source, /getCandidatoSlugStaticParams/)
  assert.match(source, /filterGlobalSearchIndexToPublicSlugs/)
  assert.match(
    source,
    /public, max-age=60, s-maxage=60, stale-while-revalidate=300/,
  )
  assert.doesNotMatch(source, /s-maxage=3600/)
})

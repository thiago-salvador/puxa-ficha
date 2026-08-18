import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

test("UF route permanently redirects uppercase paths to the lowercase canonical URL", () => {
  const source = readFileSync("src/app/(site)/uf/[uf]/page.tsx", "utf8")
  assert.match(source, /permanentRedirect\(`\/uf\/\$\{uf\.toLowerCase\(\)\}`\)/)
})

test("sitemap does not manufacture request-time lastmod for static URLs", () => {
  const source = readFileSync("src/app/sitemap.ts", "utf8")
  const requestTimeDates = source.match(/lastModified:\s*new Date\(\)/g) ?? []
  assert.equal(requestTimeDates.length, 0)
  assert.match(source, /parseMetadataDate\(c\.ultima_atualizacao\)/)
})

test("overview and card interactions expose keyboard and heading semantics", () => {
  const overview = readFileSync("src/components/ProfileOverview.tsx", "utf8")
  const card = readFileSync("src/components/CandidatoCard.tsx", "utf8")
  assert.match(overview, /<h2 className=.*\{title\}<\/h2>/)
  assert.match(card, /group-focus-within:opacity-100/)
  assert.match(card, /group-focus-within:translate-y-0/)
})

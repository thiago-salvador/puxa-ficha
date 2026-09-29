import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, it } from "node:test"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

describe("candidate dynamic route build contract", () => {
  // 2026-09-29: a ficha virou ISR sob demanda. Nenhum slug é gerado no
  // build (lista vazia); cada ficha é renderizada na primeira visita.
  it("/candidato/[slug] is on-demand ISR and does not pre-render the full candidate catalog", () => {
    const src = readFileSync(join(root, "src/app/(site)/candidato/[slug]/page.tsx"), "utf8")
    assert.doesNotMatch(src, /export\s+const\s+dynamic\s*=/)
    assert.match(src, /export\s+const\s+revalidate\s*=\s*\d+/)
    assert.match(src, /export\s+function\s+generateStaticParams\(\)[\s\S]*?\{\s*return \[\]\s*\}/)
    assert.doesNotMatch(src, /getCandidatoSlugStaticParams/)
  })

  it("/embed/[slug] is request-rendered and does not pre-render the full candidate catalog", () => {
    const src = readFileSync(join(root, "src/app/(embed)/embed/[slug]/page.tsx"), "utf8")
    assert.match(src, /export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/)
    assert.doesNotMatch(src, /export\s+async\s+function\s+generateStaticParams/)
    assert.doesNotMatch(src, /getCandidatoSlugStaticParams/)
  })

  it("/api/candidato-slugs remains the public full-slug inventory", () => {
    const apiRoute = readFileSync(join(root, "src/app/api/candidato-slugs/route.ts"), "utf8")
    const handler = readFileSync(join(root, "src/lib/candidato-slugs-route.ts"), "utf8")
    assert.match(apiRoute, /candidato-slugs-route/)
    assert.match(handler, /getCandidatoSlugStaticParams/)
  })
})

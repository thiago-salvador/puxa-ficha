import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, it } from "node:test"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const routePath = join(root, "src/app/(site)/candidato/[slug]/timeline/page.tsx")

/**
 * Contrato /candidato/{slug}/timeline:
 * a rota precisa renderizar a ficha com a aba timeline (não redirect),
 * pra release-verify achar [data-pf-hero-name] e pra OG timeline ter host.
 * Regressão passada: stub `redirect()` devolvia 200 com boundary not-found.
 */
describe("/candidato/[slug]/timeline route contract", () => {
  const src = readFileSync(routePath, "utf8")

  it("não usa redirect() em vez de renderizar", () => {
    assert.doesNotMatch(src, /from\s+["']next\/navigation["']/)
    assert.doesNotMatch(src, /\bredirect\(/)
  })

  it("renderiza CandidatoFichaView com profileInitialTab=timeline e seoSubpath=timeline", () => {
    assert.match(src, /import\s+\{\s*CandidatoFichaView\s*\}/)
    assert.match(src, /profileInitialTab=["']timeline["']/)
    assert.match(src, /seoSubpath=["']timeline["']/)
  })

  it("fixa renderização dinâmica via dynamic = 'force-dynamic' para permitir cache bypass", () => {
    assert.match(src, /export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/)
  })

  it("não faz fanout de slugs no build", () => {
    assert.doesNotMatch(src, /getCandidatoSlugStaticParams/)
    assert.doesNotMatch(src, /export\s+async\s+function\s+generateStaticParams/)
  })

  it("exporta generateMetadata com alternates.canonical e OG da timeline", () => {
    assert.match(src, /export\s+async\s+function\s+generateMetadata/)
    assert.match(src, /alternates:\s*\{\s*canonical:/)
    assert.match(src, /\/candidato\/\$\{slug\}\/timeline/)
  })
})

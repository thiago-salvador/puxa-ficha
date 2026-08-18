import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, it } from "node:test"

function readSource(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), "utf-8")
}

describe("Bloco 1 — public surfaces never render raw 'incerto' party label", () => {
  it("/candidato/[slug]/page.tsx title goes through formatPartyPublicLabel", () => {
    const src = readSource("src/app/(site)/candidato/[slug]/page.tsx")
    assert.match(src, /formatPartyPublicLabel/, "page.tsx must import/use formatPartyPublicLabel")
    assert.doesNotMatch(
      src,
      /`\$\{candidato\.nome_urna\}\s*\(\$\{candidato\.partido_sigla\}\)\s*—\s*Puxa Ficha`/,
      "page.tsx title must not interpolate raw partido_sigla in parens",
    )
  })

  it("/candidato/[slug]/timeline/page.tsx title goes through formatPartyPublicLabel", () => {
    const src = readSource("src/app/(site)/candidato/[slug]/timeline/page.tsx")
    assert.match(src, /formatPartyPublicLabel/, "timeline page must import/use formatPartyPublicLabel")
    assert.doesNotMatch(
      src,
      /`Linha do tempo · \$\{c\.nome_urna\}\s*\(\$\{c\.partido_sigla\}\)/,
      "timeline title must not interpolate raw partido_sigla in parens",
    )
  })

  it("CandidatoFichaView builds JSON-LD name via partyPublicLabel", () => {
    const src = readSource("src/app/(site)/candidato/[slug]/CandidatoFichaView.tsx")
    assert.match(src, /formatPartyPublicLabel/, "CandidatoFichaView must import formatPartyPublicLabel")
    assert.doesNotMatch(
      src,
      /name:\s*`\$\{ficha\.nome_urna\}\s*\(\$\{ficha\.partido_sigla\}\)`/,
      "JSON-LD name must not interpolate raw partido_sigla in parens",
    )
  })

  it("opengraph-image (candidato) eyebrow goes through formatPartyPublicLabel", () => {
    const src = readSource("src/app/(site)/candidato/[slug]/opengraph-image/route.tsx")
    assert.match(src, /formatPartyPublicLabel/, "opengraph-image must import formatPartyPublicLabel")
    assert.doesNotMatch(
      src,
      /eyebrow:\s*`\$\{ficha\.partido_sigla\}/,
      "OG eyebrow must not interpolate raw partido_sigla",
    )
  })

  it("opengraph-image (timeline) eyebrow goes through formatPartyPublicLabel", () => {
    const src = readSource("src/app/(site)/candidato/[slug]/timeline/opengraph-image/route.tsx")
    assert.match(src, /formatPartyPublicLabel/, "timeline opengraph-image must import formatPartyPublicLabel")
    assert.doesNotMatch(
      src,
      /eyebrow:\s*`Timeline · \$\{ficha\.partido_sigla\}/,
      "Timeline OG eyebrow must not interpolate raw partido_sigla",
    )
  })

  it("/doadores list filters partido through formatPartyPublicLabel", () => {
    const src = readSource("src/app/(site)/doadores/page.tsx")
    assert.match(src, /formatPartyPublicLabel/, "doadores must import formatPartyPublicLabel")
    assert.doesNotMatch(
      src,
      /\[row\.partido_sigla,\s*row\.cargo_disputado,\s*row\.estado\]\.filter\(Boolean\)/,
      "doadores list must not concatenate raw partido_sigla into the meta line",
    )
  })

  it("EmbedCodeGenerator dropdown label goes through formatPartyPublicLabel", () => {
    const src = readSource("src/components/EmbedCodeGenerator.tsx")
    assert.match(src, /formatPartyPublicLabel/, "EmbedCodeGenerator must import formatPartyPublicLabel")
    assert.doesNotMatch(
      src,
      /\{c\.nome_urna\}\s*\(\{c\.partido_sigla\}\)\s*—\s*\{c\.slug\}/,
      "EmbedCodeGenerator option label must not interpolate raw partido_sigla in parens",
    )
  })

  it("ComparadorPanel uses formatPartyPublicLabel for visible party labels", () => {
    const src = readSource("src/components/ComparadorPanel.tsx")
    assert.match(src, /formatPartyPublicLabel/, "ComparadorPanel must import formatPartyPublicLabel")
  })

  it("global-search subtitle and bio searchText filter incerto", () => {
    const src = readSource("src/lib/global-search.ts")
    assert.match(src, /formatPartyPublicLabel/)
    assert.match(src, /isUncertainParty/)
  })
})

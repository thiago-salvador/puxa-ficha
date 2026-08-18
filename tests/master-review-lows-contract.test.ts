import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

describe("master review low regressions", () => {
  it("valida a UF antes de compor a OG image do quiz", () => {
    const source = readFileSync("src/app/(site)/quiz/resultado/og/route.tsx", "utf8")
    assert.match(source, /resolveEstadoUf\(effectiveParams\.get\("uf"\)\)/)
  })

  it("exporta metadata na página 404", () => {
    const source = readFileSync("src/app/not-found.tsx", "utf8")
    assert.match(source, /export const metadata: Metadata/)
    assert.match(source, /Página não encontrada \| Puxa Ficha/)
  })

  it("mantém a busca global em 16px no mobile", () => {
    const source = readFileSync("src/components/GlobalSearchProvider.tsx", "utf8")
    const inputClass = source.match(/placeholder="Buscar candidato[\s\S]*?className="([^"]+)"/)?.[1]
    assert.ok(inputClass)
    assert.match(inputClass, /\btext-base\b/)
    assert.match(inputClass, /\bmd:text-\[14px\]/)
  })

  it("envia batch_failed do news refresh para console.error", () => {
    const source = readFileSync("src/app/api/news/refresh/route.ts", "utf8")
    assert.match(source, /event === "batch_failed" \? console\.error : console\.log/)
  })

  it("resolve nomes de urna para o título do comparador", () => {
    const source = readFileSync("src/app/(site)/comparar/page.tsx", "utf8")
    assert.match(source, /getCandidatoMetadataResource\(slug\)/)
    assert.match(source, /candidate\?\.nome_urna/)
    assert.match(source, /candidateNames\.join\(" x "\)/)
  })

  it("usa fallback local e não grava ui-avatars no enrich", () => {
    const photoSource = readFileSync("src/components/CandidatePhoto.tsx", "utf8")
    const enrichSource = readFileSync("scripts/lib/enrich-wikipedia.ts", "utf8")
    assert.match(photoSource, /isUiAvatarsPlaceholder/)
    assert.doesNotMatch(enrichSource, /ui-avatars\.com/)
    assert.doesNotMatch(enrichSource, /placeholderUrl/)
    assert.match(enrichSource, /fallback local de iniciais/)
  })
})

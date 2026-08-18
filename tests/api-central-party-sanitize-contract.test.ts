import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, it } from "node:test"

function readSource(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), "utf-8")
}

/**
 * Hardening pos-Bloco 1: a sanitizacao publica de partido_sigla/partido_atual
 * vive no nivel do resource em src/lib/api.ts (single source of truth), nao mais
 * em 4 fronteiras pontuais. Estes contratos garantem que a centralizacao foi
 * aplicada e que as fronteiras antigas foram removidas.
 */
describe("Sanitizacao publica de partido centralizada em src/lib/api.ts", () => {
  const apiSrc = readSource("src/lib/api.ts")

  it("api.ts importa o helper canonico de public-candidate-sanitize", () => {
    assert.match(
      apiSrc,
      /import\s*\{[^}]*sanitizePublicPartyFields[^}]*\}\s*from\s*"@\/lib\/public-candidate-sanitize"/,
      "api.ts deve importar sanitizePublicPartyFields do helper central",
    )
    assert.match(
      apiSrc,
      /import\s*\{[^}]*sanitizePublicPartyFieldsList[^}]*\}\s*from\s*"@\/lib\/public-candidate-sanitize"/,
      "api.ts deve importar sanitizePublicPartyFieldsList",
    )
  })

  it("getCandidatosResource retorna lista sanitizada via helper", () => {
    assert.match(
      apiSrc,
      /return\s+liveResource\(sanitizePublicPartyFieldsList\(data as Candidato\[\]\)\)/,
      "getCandidatosResourceUncached deve sanitizar a lista no exit",
    )
  })

  it("getCandidatoMetadataResource sanitiza candidato antes de devolver payload", () => {
    assert.match(
      apiSrc,
      /sanitizePublicPartyFields\(res\.data\)/,
      "getCandidatoMetadataResourceUncached deve sanitizar res.data",
    )
  })

  it("getCandidatoBySlug constroi ficha com candidato sanitizado", () => {
    assert.match(
      apiSrc,
      /\.\.\.sanitizePublicPartyFields\(candidato\)/,
      "ficha builder deve spread o candidato sanitizado em vez do raw",
    )
  })

  it("getCandidatosComparaveis sanitiza lista antes de retornar", () => {
    assert.match(
      apiSrc,
      /sanitizePublicPartyFieldsList\(normalizedRows as CandidatoComparavel\[\]\)/,
      "getCandidatosComparaveisResourceUncached deve sanitizar lista no exit",
    )
  })

  it("cache keys dos resources publicos foram bumpadas com suffix central-party-sanitize", () => {
    const expectedKeys = [
      "public-candidatos-resource",
      "public-candidato-metadata-resource",
      "public-candidato-ficha-resource",
      "public-candidatos-resumo-resource",
      "public-candidatos-comparaveis-resource",
    ]
    for (const key of expectedKeys) {
      const pattern = new RegExp(
        `\\[\\s*"${key}"\\s*,\\s*"central-party-sanitize"(?:\\s*,[^\\]]+)?\\]`,
      )
      assert.match(
        apiSrc,
        pattern,
        `cache key de ${key} deve incluir suffix central-party-sanitize`,
      )
    }
  })

  it("invalida os caches que serializam siglas depois do lote 2", () => {
    const expectedKeys = [
      "public-candidatos-resource",
      "public-candidato-metadata-resource",
      "public-candidato-ficha-resource",
      "public-candidatos-resumo-resource",
      "public-candidatos-comparaveis-resource",
      "ranking-data-resource-public-copy-20260521",
      "quiz-alignment-dataset-resource",
    ]

    for (const key of expectedKeys) {
      const cacheKey = apiSrc.match(new RegExp(`\\[\\s*"${key}"[^\\]]*\\]`))
      assert.ok(cacheKey, `cache ${key} nao encontrado`)
      assert.match(
        cacheKey[0],
        /"party-siglas-lote2-20260815"/,
        `cache ${key} sem bust do lote 2`,
      )
    }
  })

  it("CandidatoFichaView nao reconstroi fichaForPublicDisplay (fronteira removida)", () => {
    const src = readSource("src/app/(site)/candidato/[slug]/CandidatoFichaView.tsx")
    assert.doesNotMatch(
      src,
      /const\s+fichaForPublicDisplay\s*=/,
      "fichaForPublicDisplay deve ter sido removido apos centralizacao",
    )
    assert.match(
      src,
      /<(?:Deferred)?CandidatoProfile\s+ficha=\{ficha\}/,
      "o componente de profile deve receber ficha direto do resource (ja sanitizado)",
    )
  })

  it("embed/page.tsx nao reconstroi mapping pontual de partido_sigla via formatPartyPublicLabel", () => {
    const src = readSource("src/app/(site)/embed/page.tsx")
    assert.doesNotMatch(
      src,
      /partido_sigla:\s*formatPartyPublicLabel\(/,
      "embed/page.tsx mapping pontual deve ter sido removido apos centralizacao",
    )
  })

  it("uf/[uf]/page.tsx nao reconstroi mapping pontual de partido_sigla/partido_atual", () => {
    const src = readSource("src/app/(site)/uf/[uf]/page.tsx")
    assert.doesNotMatch(
      src,
      /partido_sigla:\s*formatPartyPublicLabel\(r\.candidato\.partido_sigla\)/,
      "uf/[uf]/page.tsx mapping pontual de partido_sigla deve ter sido removido",
    )
    assert.doesNotMatch(
      src,
      /partido_atual:\s*formatPartyPublicLabel\(r\.candidato\.partido_atual\)/,
      "uf/[uf]/page.tsx mapping pontual de partido_atual deve ter sido removido",
    )
  })
})

import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, it } from "node:test"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const dirPath = join(root, "src/app/(site)/quiz/r/[token]")
const routePath = join(dirPath, "route.ts")
const pagePath = join(dirPath, "page.tsx")

/**
 * Contrato /quiz/r/[token]:
 * - token inválido/expirado → HTTP 307 redirect para /quiz?erro=link-expirado,
 *   com cache-control no-store e x-robots-tag noindex (G6-08: o 404 de texto
 *   cru era um beco sem saída para quem clicava em link compartilhado; a troca
 *   pelo redirect foi decisão consciente do master review, e o noindex evita
 *   que a landing com erro vire soft-404 indexável)
 * - token válido → HTTP 307 redirect para /quiz/resultado
 *
 * Regressão passada: usar notFound() em page.tsx fazia o App Router renderizar
 * a boundary de not-found com HTTP 200, cegando monitoramento externo. O
 * contrato segue proibindo notFound() e page.tsx neste segmento: toda resposta
 * é HTTP explícito emitido pelo route.ts.
 */
describe("/quiz/r/[token] route contract", () => {
  it("não existe page.tsx neste segmento (contrato HTTP via route.ts)", () => {
    assert.equal(existsSync(pagePath), false, "page.tsx não pode coexistir com route.ts e quebra o contrato HTTP")
  })

  it("route.ts existe e define handler GET", () => {
    assert.equal(existsSync(routePath), true, "route.ts precisa existir")
    const src = readFileSync(routePath, "utf8")
    assert.match(src, /export\s+async\s+function\s+GET\s*\(/)
  })

  const src = existsSync(routePath) ? readFileSync(routePath, "utf8") : ""

  it("redireciona para a landing do quiz quando token não resolve", () => {
    assert.match(src, /\/quiz\?erro=link-expirado/, "token inválido deve voltar para /quiz?erro=link-expirado")
    assert.match(src, /redirect\s*\([^)]*,\s*307\s*\)/, "redirect de token inválido deve ser 307 explícito")
    assert.match(src, /no-store/, "resposta de token inválido deve levar cache-control no-store")
    assert.match(src, /noindex/, "resposta de token inválido deve levar x-robots-tag noindex")
    assert.doesNotMatch(src, /\bnotFound\s*\(/, "não pode depender de notFound() (boundary vira HTTP 200)")
  })

  it("retorna redirect HTTP real para token válido (não renderiza página)", () => {
    assert.match(src, /NextResponse\.redirect\s*\(/, "deve usar NextResponse.redirect")
    assert.match(src, /\/quiz\/resultado/)
  })

  it("preserva Sentry span quiz_short_link.resolve", () => {
    assert.match(src, /quiz_short_link\.resolve/)
    assert.match(src, /Sentry\.startSpan/)
  })

  it("usa resolveQuizShortToken (contrato de validação de token)", () => {
    assert.match(src, /resolveQuizShortToken/)
  })
})

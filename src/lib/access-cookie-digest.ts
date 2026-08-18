/**
 * Valor guardado nos cookies de acesso (`pf_internal_token`, `pf_preview_token`).
 *
 * Até 2026-08-04 o cookie carregava o próprio `PF_INTERNAL_TOKEN` /
 * `PF_PREVIEW_TOKEN` em claro. Quem lesse o jar (extensão do navegador, backup de
 * perfil, print de DevTools, um XSS futuro) saía com o segredo reutilizável em
 * qualquer superfície, inclusive o bootstrap por `?token=`. Agora o cookie guarda
 * um HMAC-SHA256 do token sobre um contexto fixo do servidor: prova posse sem
 * transportar o segredo, e o valor vazado não vira token de bootstrap.
 *
 * Web Crypto (`crypto.subtle`) de propósito: o middleware roda no edge, onde
 * `node:crypto` não existe. O mesmo módulo atende o Node runtime das páginas,
 * então os dois lados derivam exatamente o mesmo valor.
 */

/** Contexto fixo da derivação. Versionado para poder girar o formato sem ambiguidade. */
const DIGEST_CONTEXT_PREFIX = "pf-access-cookie:v1:"

/** Uma superfície por escopo: o valor do cookie interno não serve no de preview. */
export type AccessCookieScope = "internal" | "preview"

const encoder = new TextEncoder()

function toHex(bytes: Uint8Array): string {
  let hex = ""
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0")
  }
  return hex
}

/**
 * Comparação constante (runtime-agnóstica, sem `node:crypto` porque o middleware
 * roda no edge). Evita o timing side-channel do `===` na verificação de token.
 * Percorre até o maior comprimento e acumula diferenças por XOR; vaza igualdade
 * de comprimento, nunca o conteúdo.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (!a || !b) return false
  let diff = a.length ^ b.length
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  }
  return diff === 0
}

/** HMAC-SHA256 do contexto da superfície, com o token como chave, em hex minúsculo. */
export async function deriveAccessCookieValue(
  token: string,
  scope: AccessCookieScope,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(token),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${DIGEST_CONTEXT_PREFIX}${scope}`),
  )
  return toHex(new Uint8Array(signature))
}

/**
 * Confere o valor do cookie contra a derivação esperada, em tempo constante.
 * Falha fechada quando falta cookie ou token, e recusa de propósito o token cru:
 * quem manda o segredo como valor de cookie não passa, tem que usar o bootstrap.
 */
export async function accessCookieMatches(
  cookieValue: string | null | undefined,
  token: string | null | undefined,
  scope: AccessCookieScope,
): Promise<boolean> {
  const cookieTrimmed = typeof cookieValue === "string" ? cookieValue.trim() : ""
  const tokenTrimmed = typeof token === "string" ? token.trim() : ""
  if (!cookieTrimmed || !tokenTrimmed) return false
  const expected = await deriveAccessCookieValue(tokenTrimmed, scope)
  return constantTimeEqual(cookieTrimmed, expected)
}

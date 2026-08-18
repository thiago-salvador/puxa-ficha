import { createHash } from "node:crypto"

/**
 * Extrai o IP do cliente para rate limit / hash em rotas públicas.
 *
 * Em produção, a política é Vercel-only: só `x-vercel-forwarded-for` é aceito
 * como fonte canônica. Fora da Vercel, a função falha fechada para `"unknown"`,
 * agrupando a requisição no mesmo bucket em vez de confiar em header
 * forwardável pelo cliente.
 *
 * Em desenvolvimento/teste aceitamos `x-real-ip` e o último valor de
 * `x-forwarded-for` para manter fixtures e smoke local operáveis.
 */
export function extractTrustedClientIp(headers: Pick<Headers, "get">): string {
  const vercel = headers.get("x-vercel-forwarded-for")?.trim()
  if (vercel) {
    const first = vercel.split(",")[0]?.trim()
    if (first) return first
  }

  const isLocalRuntime = process.env.NODE_ENV !== "production" && !process.env.VERCEL_ENV
  if (!isLocalRuntime) return "unknown"

  const realIp = headers.get("x-real-ip")?.trim()
  if (realIp) return realIp

  const xForwardedFor = headers.get("x-forwarded-for")
  if (xForwardedFor) {
    const parts = xForwardedFor
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
    const last = parts[parts.length - 1]
    if (last) return last
  }

  return "unknown"
}

/**
 * Identificador pseudônimo e estável do cliente, para limite durável.
 *
 * O IP nunca é persistido em claro: só este hash salgado entra em tabela. O
 * `namespace` separa os baldes de rotas diferentes, de modo que o mesmo visitante
 * não seja correlacionável entre superfícies pelo valor gravado.
 *
 * O salt reaproveita `PF_ALERTS_IP_SALT` (com fallback para
 * `PF_QUIZ_SHORT_LINK_SALT`), que `production-env.ts` já exige em produção —
 * nenhuma env nova para configurar antes do lançamento.
 *
 * `/api/quiz/short-link` continua com o hash próprio dele de propósito: aquele
 * valor já está gravado em `quiz_result_short_links`, e trocar a fórmula
 * silenciosamente zeraria o limite de quem já tem linha na tabela.
 */
export function hashTrustedClientIp(
  headers: Pick<Headers, "get">,
  namespace: string,
): string {
  const salt =
    process.env.PF_ALERTS_IP_SALT?.trim() ||
    process.env.PF_QUIZ_SHORT_LINK_SALT?.trim() ||
    "dev-client-ip-salt"
  const ip = extractTrustedClientIp(headers)
  return createHash("sha256").update(`${salt}:${namespace}:${ip}`).digest("hex").slice(0, 48)
}

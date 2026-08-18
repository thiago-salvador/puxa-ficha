/**
 * Fonte única da checagem de acesso a `/preview/*`, usada pelas próprias páginas.
 *
 * Até 2026-08-04 a única proteção de `/preview/candidato/[slug]` era o middleware,
 * e o matcher dele (`/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\..*).*)`)
 * pula qualquer path que contenha ponto. Ou seja, `/preview/candidato/a.b` chegava
 * na página sem passar por nenhuma verificação de token, e a página lê a tabela
 * base com service role (bypassa RLS, enxerga candidato NÃO publicado).
 *
 * A checagem agora mora aqui e roda dentro da página, antes de qualquer leitura.
 * O middleware continua valendo como defesa em profundidade, não como única linha.
 */
import { cookies } from "next/headers"
import { notFound } from "next/navigation"
import { accessCookieMatches } from "@/lib/access-cookie-digest"
import { secretsMatch } from "@/lib/crypto-utils"

/** Mesmo cookie que o middleware seta em `/preview` depois do bootstrap por query. */
export const PREVIEW_COOKIE_NAME = "pf_preview_token"

/** Mesmo piso do middleware: token fraco em ambiente deployado é tratado como ausente. */
export const MIN_DEPLOYED_PREVIEW_TOKEN_LENGTH = 24

type PreviewEnv = {
  PF_PREVIEW_TOKEN?: string
  VERCEL?: string
  VERCEL_ENV?: string
}

/** Recorte explícito do ambiente, para os testes injetarem cenário sem mexer em process.env. */
function readEnv(): PreviewEnv {
  return {
    PF_PREVIEW_TOKEN: process.env.PF_PREVIEW_TOKEN,
    VERCEL: process.env.VERCEL,
    VERCEL_ENV: process.env.VERCEL_ENV,
  }
}

/**
 * Espelha `resolvePreviewToken()` do middleware. Qualquer ambiente deployado na
 * Vercel (production E preview) exige token forte configurado e falha fechado;
 * o fallback de conveniência só existe em dev local fora da Vercel.
 */
export function resolvePreviewToken(env: PreviewEnv = readEnv()): string | null {
  const configuredToken = env.PF_PREVIEW_TOKEN?.trim()

  const isDeployed =
    env.VERCEL === "1" || env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview"
  if (isDeployed) {
    if (!configuredToken || configuredToken.length < MIN_DEPLOYED_PREVIEW_TOKEN_LENGTH) {
      return null
    }
    return configuredToken
  }

  if (configuredToken) return configuredToken
  return "local-preview"
}

/**
 * Aceita o cookie setado pelo middleware ou o token de bootstrap na query, que é
 * o par exato do middleware. O bootstrap importa justamente no caso que o matcher
 * deixa passar: ali o middleware nunca roda, então nunca troca query por cookie.
 *
 * Os dois lados comparam em tempo constante, mas com valores diferentes de
 * propósito: a query traz o token cru (`secretsMatch`), e o cookie traz o HMAC do
 * token (`accessCookieMatches`), porque desde 2026-08-04 o cookie não transporta
 * mais o segredo. Token cru mandado como cookie é recusado, e é isso que se
 * quer: um valor copiado do jar não vira token de bootstrap.
 */
export async function hasPreviewAccess(
  tokens: { cookieToken?: string | null; queryToken?: string | null },
  env: PreviewEnv = readEnv(),
): Promise<boolean> {
  const expectedToken = resolvePreviewToken(env)
  if (!expectedToken) return false
  if (secretsMatch(tokens.queryToken, expectedToken)) return true
  return accessCookieMatches(tokens.cookieToken, expectedToken, "preview")
}

function readQueryToken(
  searchParams: Record<string, string | string[] | undefined> | undefined,
): string | null {
  const raw = searchParams?.token
  if (Array.isArray(raw)) return raw[0] ?? null
  return raw ?? null
}

/**
 * Guard para páginas de `/preview/*`: chama `notFound()` quando o token está
 * ausente ou errado. Precisa rodar ANTES de qualquer leitura com service role.
 */
export async function requirePreviewAccess(
  searchParams?: Promise<Record<string, string | string[] | undefined>>,
): Promise<void> {
  const cookieStore = await cookies()
  const cookieToken = cookieStore.get(PREVIEW_COOKIE_NAME)?.value ?? null
  const queryToken = readQueryToken(searchParams ? await searchParams : undefined)

  if (!(await hasPreviewAccess({ cookieToken, queryToken }))) {
    notFound()
  }
}

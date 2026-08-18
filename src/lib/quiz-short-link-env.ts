import { NextResponse } from "next/server"

/**
 * Em produção (Vercel ou NODE_ENV=production), links curtos exigem salt próprio
 * para evitar colisão previsível de IP hash. Fora de produção, a rota aceita o
 * fallback dev `"dev-quiz-short-link-salt"`.
 */
export function quizShortLinkMisconfiguredResponse(): NextResponse | null {
  const isProduction =
    process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production"
  if (!isProduction) return null
  if (process.env.PF_QUIZ_SHORT_LINK_SALT?.trim()) return null
  return NextResponse.json({ error: "Short links misconfigured" }, { status: 503 })
}

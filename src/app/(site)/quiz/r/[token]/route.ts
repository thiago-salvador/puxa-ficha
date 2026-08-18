import { NextResponse, type NextRequest } from "next/server"
import * as Sentry from "@sentry/nextjs"
import { resolveQuizShortToken } from "@/lib/quiz-short-link-resolve"

export const dynamic = "force-dynamic"

function resolveShortTokenForRoute(token: string) {
  return Sentry.startSpan(
    {
      name: "quiz_short_link.resolve",
      op: "db.supabase.query",
      attributes: {
        "http.route": "/quiz/r/[token]",
        "puxaficha.token_length": token.length,
      },
    },
    () => resolveQuizShortToken(token),
  )
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const qs = await resolveShortTokenForRoute(token)

  if (!qs) {
    // Token inválido ou expirado devolvia texto cru em 404, que é um beco sem
    // saída para quem clicou num link compartilhado. Agora volta para a landing
    // do quiz, que explica o que houve e oferece refazer o quiz.
    const landing = new URL("/quiz?erro=link-expirado", request.nextUrl.origin)
    const expirado = NextResponse.redirect(landing, 307)
    expirado.headers.set("cache-control", "no-store")
    expirado.headers.set("x-robots-tag", "noindex, nofollow")
    return expirado
  }

  const target = new URL(`/quiz/resultado?${qs}`, request.nextUrl.origin)
  return NextResponse.redirect(target, 307)
}

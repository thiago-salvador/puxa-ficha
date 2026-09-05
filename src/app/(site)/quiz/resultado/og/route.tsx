import type { NextRequest } from "next/server"
import { resolveEstadoUf } from "@/lib/br-uf"
import { decodeQuizPayloadForShare } from "@/lib/quiz-encoding"
import { buildEditorialOg, dynamicOgImageCacheHeaders } from "@/lib/og"
import { normalizeQuizCargo } from "@/lib/quiz-cargo"
import { resolveQuizShortToken } from "@/lib/quiz-short-link-resolve"
import {
  createDistributedIpRateLimiter,
  rateLimitExceededResponse,
} from "@/lib/request-rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const quizResultOgRateLimiter = createDistributedIpRateLimiter({
  namespace: "quiz-result-og",
  max: 90,
  windowMs: 60_000,
})

export async function GET(request: NextRequest) {
  try {
    const decision = await quizResultOgRateLimiter.check(request.headers)
    if (!decision.allowed) return rateLimitExceededResponse(decision)
  } catch (error) {
    console.warn("quiz result OG rate limit failed closed", error)
    return rateLimitExceededResponse({ allowed: false, remaining: 0, resetAt: Date.now() + 3000, unavailable: true })
  }

  const url = request.nextUrl
  const token = url.searchParams.get("token")
  let effectiveParams: URLSearchParams
  if (token != null && token.trim()) {
    const qs = await resolveQuizShortToken(token.trim())
    effectiveParams = qs ? new URLSearchParams(qs) : new URLSearchParams()
  } else {
    effectiveParams = url.searchParams
  }

  const r = effectiveParams.get("r")
  const v = effectiveParams.get("v")
  const cargo = normalizeQuizCargo(effectiveParams.get("cargo"))
  const uf = resolveEstadoUf(effectiveParams.get("uf"))

  if (cargo === "Governador" && !uf) {
    return buildEditorialOg({
      eyebrow: "Quiz",
      title: "Escolha o estado",
      subtitle: "Para governador, selecione a UF antes de ver o resultado.",
      headers: dynamicOgImageCacheHeaders,
    })
  }

  const respostas = decodeQuizPayloadForShare(r, v)
  if (!respostas || respostas.size === 0) {
    return buildEditorialOg({
      eyebrow: "Quiz",
      title: "Quem me representa?",
      subtitle: "Compare sinais programáticos em ordem alfabética. Não é recomendação de voto.",
      headers: dynamicOgImageCacheHeaders,
    })
  }
  const meta =
    cargo === "Governador" && uf ? `${cargo} · ${uf.toUpperCase()}` : cargo

  return buildEditorialOg({
    eyebrow: "Quiz · Comparação",
    title: "Resultado do quiz",
    subtitle: "Lista em ordem alfabética, sem ranking, recomendação, sugestão ou priorização de candidato.",
    meta,
    headers: dynamicOgImageCacheHeaders,
  })
}

import type { NextRequest } from "next/server"
import * as Sentry from "@sentry/nextjs"
import { getCandidatoBySlugResource } from "@/lib/api"
import {
  buildSocialCard,
  extractCardData,
  fetchPhotoAsBase64,
  type CardFormat,
} from "@/lib/social-card"
import {
  createFixedWindowIpRateLimiter,
  rateLimitExceededResponse,
  type RequestRateLimiter,
} from "@/lib/request-rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const VALID_FORMATS = new Set<CardFormat>(["feed", "story"])

const cardRateLimiter = createFixedWindowIpRateLimiter({
  namespace: "social-card",
  max: 60,
  windowMs: 60_000,
})

interface CardRouteDeps {
  getCandidatoBySlugResource: typeof getCandidatoBySlugResource
  fetchPhotoAsBase64: typeof fetchPhotoAsBase64
  extractCardData: typeof extractCardData
  buildSocialCard: typeof buildSocialCard
  rateLimiter: RequestRateLimiter
  startSpan: typeof Sentry.startSpan
}

const defaultCardRouteDeps: CardRouteDeps = {
  getCandidatoBySlugResource,
  fetchPhotoAsBase64,
  extractCardData,
  buildSocialCard,
  rateLimiter: cardRateLimiter,
  startSpan: Sentry.startSpan,
}

export function createCardGetHandler(deps: CardRouteDeps = defaultCardRouteDeps) {
  return async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
  ) {
    const decision = deps.rateLimiter.check(request.headers)
    if (!decision.allowed) return rateLimitExceededResponse(decision)

    const { slug } = await params

    const rawFormat = request.nextUrl.searchParams.get("format")
    const format: CardFormat = VALID_FORMATS.has(rawFormat as CardFormat)
      ? (rawFormat as CardFormat)
      : "feed"

    return deps.startSpan(
      {
        name: "card_route.generate",
        op: "http.server",
        attributes: {
          "http.route": "/api/card/[slug]",
          "puxaficha.card_format": format,
        },
      },
      async () => {
        const resource = await deps.getCandidatoBySlugResource(slug)

        if (!resource.data) {
          // Mesmo contrato das rotas irmãs (candidato-profile, projetos-lei,
          // legislacao-executivo): 404 só quando a fonte está viva e o slug não
          // existe; fonte degradada é 503 sem cache, para o CDN e o crawler não
          // congelarem um "não encontrado" que era indisponibilidade.
          const degraded = resource.sourceStatus === "degraded"
          return new Response(
            JSON.stringify({
              error: degraded ? "Fonte temporariamente indisponível" : "Candidato não encontrado",
            }),
            {
              status: degraded ? 503 : 404,
              headers: {
                "Content-Type": "application/json",
                ...(degraded ? { "Cache-Control": "no-store" } : {}),
              },
            },
          )
        }

        const photoDataUri = await deps.fetchPhotoAsBase64(resource.data.foto_url)
        const cardData = deps.extractCardData(resource.data, photoDataUri)
        const img = await deps.buildSocialCard(cardData, format)

        const body = img.body
        const headers = new Headers(img.headers)
        headers.set(
          "Cache-Control",
          "public, max-age=3600, s-maxage=86400, stale-while-revalidate=3600",
        )
        headers.set("X-Robots-Tag", "noindex")

        return new Response(body, { status: 200, headers })
      },
    )
  }
}

export const GET = createCardGetHandler()

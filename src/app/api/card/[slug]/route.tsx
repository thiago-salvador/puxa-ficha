import type { NextRequest } from "next/server"
import sharp from "sharp"
import * as Sentry from "@sentry/nextjs"
import { getCandidatoBySlugResource } from "@/lib/api"
import {
  buildSocialCard,
  extractCardData,
  fetchPhotoAsBase64,
  type CardFormat,
} from "@/lib/social-card"
import {
  createDistributedIpRateLimiter,
  rateLimitExceededResponse,
  type DistributedRequestRateLimiter,
} from "@/lib/request-rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const VALID_FORMATS = new Set<CardFormat>(["feed", "story"])

const cardRateLimiter = createDistributedIpRateLimiter({
  namespace: "social-card",
  max: 60,
  windowMs: 60_000,
})

interface CardRouteDeps {
  getCandidatoBySlugResource: typeof getCandidatoBySlugResource
  fetchPhotoAsBase64: typeof fetchPhotoAsBase64
  extractCardData: typeof extractCardData
  buildSocialCard: typeof buildSocialCard
  rateLimiter: DistributedRequestRateLimiter
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
    const decision = await deps.rateLimiter.check(request.headers)
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

        if (!img.body) throw new Error("Card sem imagem para aplicar o aviso")
        const source = Buffer.from(await img.arrayBuffer())
        const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
        if (!source.subarray(0, 8).equals(pngSignature)) {
          throw new Error("Card fora do formato PNG para aplicar o aviso")
        }
        const isStory = format === "story"
        const height = isStory ? 1920 : 1080
        const banner = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="72"><rect width="1080" height="72" fill="#fff7ed"/><text x="540" y="47" text-anchor="middle" fill="#7c2d12" font-family="Arial,sans-serif" font-size="29" font-weight="700">Confira os dados na fonte original antes de publicar.</text></svg>`)
        const content = await sharp(source)
          .resize({ width: 1080, height: height - 72, fit: "inside" })
          .png()
          .toBuffer()
        const contentMetadata = await sharp(content).metadata()
        const contentWidth = contentMetadata.width ?? 1080
        const body = await sharp({
          create: { width: 1080, height, channels: 4, background: "#ffffff" },
        })
          .composite([
            { input: content, left: Math.floor((1080 - contentWidth) / 2), top: 0 },
            { input: banner, left: 0, top: height - 72 },
          ])
          .png()
          .toBuffer()
        const headers = new Headers(img.headers)
        headers.set(
          "Cache-Control",
          "public, max-age=3600, s-maxage=86400, stale-while-revalidate=3600",
        )
        headers.set("X-Robots-Tag", "noindex")
        headers.set("X-Imprensa-Aviso", "Confira os dados na fonte original antes de publicar.")

        headers.set("Content-Type", "image/png")
        return new Response(body, { status: 200, headers })
      },
    )
  }
}

export const GET = createCardGetHandler()

import { NextResponse } from "next/server"
import { PUBLIC_NEWS_PAGE_SIZE, formatPublicNewsCursor, parsePublicNewsCursor } from "@/lib/news/news-cursor"
import { getPublicNewsPageBySlug } from "@/lib/news/public-page"
import { toPublicNewsArticleDto } from "@/lib/public-profile-dto"
import { createDistributedIpRateLimiter, rateLimitExceededResponse, type DistributedRequestRateLimiter } from "@/lib/request-rate-limit"

export const dynamic = "force-dynamic"

const rateLimiter = createDistributedIpRateLimiter({ namespace: "candidato-noticias", max: 60, windowMs: 60_000 })
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Páginas seguintes da lista de notícias da ficha, depois das 20 que já vêm no
 * HTML. A resposta é igual para todo visitante do mesmo slug e cursor, então o
 * CDN a serve sem invocar a function. A página depois de um cursor só muda
 * quando uma notícia sai da janela de 365 dias ou entra regra na denylist
 * (que chega por deploy e troca o cache), por isso uma hora de s-maxage basta.
 */
const PUBLIC_CACHE = "public, max-age=60, s-maxage=3600, stale-while-revalidate=3600"
const NOT_FOUND_CACHE = "public, max-age=60, s-maxage=300"

function badRequest(message: string) {
  return NextResponse.json({ data: null, message }, { status: 400, headers: { "cache-control": "no-store" } })
}

export function createNewsPageHandler(deps: {
  getPage: typeof getPublicNewsPageBySlug
  rateLimiter: DistributedRequestRateLimiter
} = { getPage: getPublicNewsPageBySlug, rateLimiter }) {
  return async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params
    if (slug.length > 120 || !SLUG.test(slug)) return badRequest("Candidatura inválida.")

    const url = new URL(request.url)
    const rawCursor = url.searchParams.get("cursor")
    if (rawCursor === null) return badRequest("Cursor obrigatório.")
    const cursor = parsePublicNewsCursor(rawCursor)
    if (!cursor) return badRequest("Cursor inválido.")

    const rawLimit = url.searchParams.get("limite")
    const limit = rawLimit === null ? PUBLIC_NEWS_PAGE_SIZE : Number(rawLimit)
    if (!Number.isInteger(limit) || limit < 1 || limit > PUBLIC_NEWS_PAGE_SIZE) return badRequest("Limite inválido.")

    const decision = await deps.rateLimiter.check(request.headers)
    if (!decision.allowed) return rateLimitExceededResponse(decision)

    try {
      const resource = await deps.getPage(slug, cursor, limit)
      if (!resource.known) {
        return NextResponse.json(
          { data: null, message: "Candidatura não encontrada." },
          { status: 404, headers: { "cache-control": NOT_FOUND_CACHE } },
        )
      }
      return NextResponse.json(
        {
          // Mesmo DTO do link individual: mantém o ID (âncora e próximo cursor)
          // e deixa de fora o ID interno do candidato.
          data: resource.page.items.map(toPublicNewsArticleDto),
          nextCursor: resource.page.nextCursor ? formatPublicNewsCursor(resource.page.nextCursor) : null,
          total: resource.total,
        },
        { headers: { "cache-control": PUBLIC_CACHE } },
      )
    } catch {
      return NextResponse.json(
        { data: null, message: "Não foi possível carregar as notícias agora." },
        { status: 503, headers: { "cache-control": "no-store" } },
      )
    }
  }
}

export const GET = createNewsPageHandler()

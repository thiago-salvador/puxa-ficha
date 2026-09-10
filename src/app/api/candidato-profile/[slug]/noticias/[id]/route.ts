import { NextResponse } from "next/server"
import { getPublicNewsArticle } from "@/lib/news/article"
import { toPublicNewsArticleDto } from "@/lib/public-profile-dto"
import { createDistributedIpRateLimiter, rateLimitExceededResponse, type DistributedRequestRateLimiter } from "@/lib/request-rate-limit"

export const dynamic = "force-dynamic"

const rateLimiter = createDistributedIpRateLimiter({ namespace: "candidato-noticia", max: 60, windowMs: 60_000 })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function createNewsArticleHandler(deps: {
  getArticle: typeof getPublicNewsArticle
  rateLimiter: DistributedRequestRateLimiter
} = { getArticle: getPublicNewsArticle, rateLimiter }) {
  return async function GET(request: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
    const { slug, id } = await params
    if (!UUID.test(id) || !/^[a-z0-9-]{1,120}$/.test(slug)) {
      return NextResponse.json({ data: null }, { status: 400, headers: { "cache-control": "no-store" } })
    }
    const decision = await deps.rateLimiter.check(request.headers)
    if (!decision.allowed) return rateLimitExceededResponse(decision)
    try {
      const article = await deps.getArticle(slug, id)
      const data = article ? toPublicNewsArticleDto(article) : null
      return NextResponse.json({ data }, { status: data ? 200 : 404, headers: { "cache-control": "no-store" } })
    } catch {
      return NextResponse.json({ data: null, message: "Não foi possível carregar a notícia agora." }, { status: 503, headers: { "cache-control": "no-store" } })
    }
  }
}

export const GET = createNewsArticleHandler()

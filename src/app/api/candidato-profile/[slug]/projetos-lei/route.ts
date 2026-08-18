import { NextResponse } from "next/server"
import { getProjetosLeiBySlugResource } from "@/lib/api"
import { toPublicProjetosLeiDto } from "@/lib/public-profile-dto"
import {
  createFixedWindowIpRateLimiter,
  rateLimitExceededResponse,
} from "@/lib/request-rate-limit"

export const dynamic = "force-dynamic"

/**
 * Rate limit acrescentado em 18/08/2026, junto com o da rota irma
 * `/api/candidato-profile/[slug]`. Esta rota tambem e `force-dynamic` e nao
 * tinha limite, e o inventario que ela serve e mais caro por request que a
 * ficha em si. Teto menor pelo mesmo motivo.
 *
 * Nao se protege dado: o conteudo e publico por projeto. Protege-se conta e
 * disponibilidade.
 */
const projetosLeiRateLimiter = createFixedWindowIpRateLimiter({
  namespace: "candidato-projetos-lei",
  max: 60,
  windowMs: 60_000,
})

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const decisao = projetosLeiRateLimiter.check(request.headers)
  if (!decisao.allowed) return rateLimitExceededResponse(decisao)

  const { slug } = await params
  const url = new URL(request.url)
  const offset = Number.parseInt(url.searchParams.get("offset") ?? "0", 10)
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "100", 10)
  const resource = await getProjetosLeiBySlugResource(
    slug,
    Number.isFinite(offset) ? offset : 0,
    Number.isFinite(limit) ? limit : 100,
  )

  if (!resource.data) {
    return NextResponse.json(
      {
        data: null,
        sourceStatus: resource.sourceStatus,
        sourceMessage: resource.sourceMessage ?? "Candidato não encontrado.",
      },
      { status: resource.sourceStatus === "live" ? 404 : 503 },
    )
  }

  return NextResponse.json(
    {
      data: {
        ...resource.data,
        rows: toPublicProjetosLeiDto(resource.data.rows),
      },
      sourceStatus: resource.sourceStatus,
      sourceMessage: resource.sourceMessage ?? null,
    },
    { headers: { "cache-control": "public, max-age=60, s-maxage=3600, stale-while-revalidate=3600" } },
  )
}

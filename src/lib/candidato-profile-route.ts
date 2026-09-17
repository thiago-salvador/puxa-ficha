import { NextResponse } from "next/server"
import { getCandidatoBySlugResource } from "@/lib/api"
import { toPublicCandidatoProfileDto } from "@/lib/public-profile-dto"
import { getCandidateSitesTseBySlug } from "@/lib/candidate-sites-data"
import {
  createDistributedIpRateLimiter,
  rateLimitExceededResponse,
  type DistributedRequestRateLimiter,
} from "@/lib/request-rate-limit"

type CandidatoProfileResource = Awaited<ReturnType<typeof getCandidatoBySlugResource>>

export interface CandidatoProfileRouteDeps {
  getCandidatoBySlugResource: (slug: string) => Promise<CandidatoProfileResource>
  getCandidateSitesTseBySlug?: typeof getCandidateSitesTseBySlug
  rateLimiter: DistributedRequestRateLimiter
}

const perfilRateLimiter = createDistributedIpRateLimiter({
  namespace: "candidato-profile",
  max: 100,
  windowMs: 60_000,
})

const defaultCandidatoProfileRouteDeps: CandidatoProfileRouteDeps = {
  getCandidatoBySlugResource,
  getCandidateSitesTseBySlug,
  rateLimiter: perfilRateLimiter,
}

export function createCandidatoProfileGetHandler(
  deps: CandidatoProfileRouteDeps = defaultCandidatoProfileRouteDeps,
) {
  return async function GET(
    request: Request,
    { params }: { params: Promise<{ slug: string }> },
  ) {
    const decisao = await deps.rateLimiter.check(request.headers)
    if (!decisao.allowed) return rateLimitExceededResponse(decisao)

    const { slug } = await params
    const resource = await deps.getCandidatoBySlugResource(slug)

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

    const sitesCandidato = await (deps.getCandidateSitesTseBySlug ?? getCandidateSitesTseBySlug)(slug).catch((error) => {
      console.error("falha ao carregar sites do TSE", { slug, error })
      return null
    })

    return NextResponse.json(
      {
        data: {
          ...toPublicCandidatoProfileDto(resource.data),
          sites_candidato: sitesCandidato,
        },
        sourceStatus: resource.sourceStatus,
        sourceMessage: resource.sourceMessage ?? null,
      },
      {
        headers: {
          "cache-control": "private, no-store, no-cache, must-revalidate, max-age=0",
        },
      },
    )
  }
}

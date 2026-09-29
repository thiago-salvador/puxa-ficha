import { NextResponse } from "next/server"
import { getCandidatoBySlugResource, getCandidatoBySlugResourceBypassingCache } from "@/lib/api"
import { resolveReleaseVerifyCacheBypassToken } from "@/lib/production-env"
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
  getCandidatoBySlugResourceBypassingCache?: (slug: string) => Promise<CandidatoProfileResource>
  resolveReleaseVerifyCacheBypassToken?: () => string | null
  getCandidateSitesTseBySlug?: typeof getCandidateSitesTseBySlug
  rateLimiter: DistributedRequestRateLimiter
}

const perfilRateLimiter = createDistributedIpRateLimiter({
  namespace: "candidato-profile",
  max: 100,
  windowMs: 60_000,
})

// Cache de CDN (2026-09-29): o JSON era private/no-store e custava ~16,7 mil
// execuções por dia. A resposta viva vai para o CDN com a tag
// `public-candidato-ficha`; o POST /api/revalidate apaga essa tag no CDN junto
// com o `revalidateTag`, então uma correção aparece na requisição seguinte.
// O rate limit continua valendo para o que chega à função (cache miss).
export const PROFILE_CDN_CACHE_TAG = "public-candidato-ficha"
const PROFILE_PUBLIC_CACHE = "public, max-age=60, s-maxage=43200, stale-while-revalidate=3600"
const PROFILE_NOT_FOUND_CACHE = "public, max-age=60, s-maxage=300"
const PROFILE_NO_STORE = "private, no-store, no-cache, must-revalidate, max-age=0"
const RELEASE_VERIFY_BYPASS_HEADER = "x-pf-release-verify-cache-bypass"

function profileCacheHeaders(cacheControl: string): Record<string, string> {
  return cacheControl === PROFILE_NO_STORE
    ? { "cache-control": cacheControl }
    : { "cache-control": cacheControl, "vercel-cache-tag": PROFILE_CDN_CACHE_TAG }
}

const defaultCandidatoProfileRouteDeps: CandidatoProfileRouteDeps = {
  getCandidatoBySlugResource,
  getCandidatoBySlugResourceBypassingCache,
  resolveReleaseVerifyCacheBypassToken,
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
    // Release-verify fora de produção: o gate devolve `null` em
    // VERCEL_ENV=production, então este caminho nunca abre lá.
    const bypassToken = (deps.resolveReleaseVerifyCacheBypassToken ?? (() => null))()
    const bypass =
      bypassToken !== null &&
      deps.getCandidatoBySlugResourceBypassingCache !== undefined &&
      request.headers.get(RELEASE_VERIFY_BYPASS_HEADER) === bypassToken
    const resource = bypass
      ? await deps.getCandidatoBySlugResourceBypassingCache!(slug)
      : await deps.getCandidatoBySlugResource(slug)
    const live = resource.sourceStatus === "live" && !bypass

    if (!resource.data) {
      return NextResponse.json(
        {
          data: null,
          sourceStatus: resource.sourceStatus,
          sourceMessage: resource.sourceMessage ?? "Candidato não encontrado.",
        },
        {
          status: resource.sourceStatus === "live" ? 404 : 503,
          headers: profileCacheHeaders(live ? PROFILE_NOT_FOUND_CACHE : PROFILE_NO_STORE),
        },
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
      { headers: profileCacheHeaders(live ? PROFILE_PUBLIC_CACHE : PROFILE_NO_STORE) },
    )
  }
}

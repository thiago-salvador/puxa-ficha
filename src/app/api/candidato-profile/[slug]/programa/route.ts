import { NextResponse } from "next/server"
import {
  getProgramaGovernoPublicResource,
  type ProgramaGovernoPublicResource,
} from "@/lib/programa-governo-server"
import {
  createFixedWindowIpRateLimiter,
  rateLimitExceededResponse,
  type RequestRateLimiter,
} from "@/lib/request-rate-limit"

export const dynamic = "force-dynamic"

const programaRateLimiter = createFixedWindowIpRateLimiter({
  namespace: "candidato-programa-governo",
  max: 60,
  windowMs: 60_000,
})

interface ProgramaGovernoRouteDeps {
  getProgramaGovernoPublicResource: (slug: string) => Promise<ProgramaGovernoPublicResource>
  rateLimiter: RequestRateLimiter
}

const defaultDeps: ProgramaGovernoRouteDeps = {
  getProgramaGovernoPublicResource,
  rateLimiter: programaRateLimiter,
}

const PUBLIC_CACHE = "public, max-age=60, s-maxage=3600, stale-while-revalidate=3600"
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function createProgramaGovernoGetHandler(
  deps: ProgramaGovernoRouteDeps = defaultDeps,
) {
  return async function GET(
    request: Request,
    { params }: { params: Promise<{ slug: string }> },
  ) {
    const decisao = deps.rateLimiter.check(request.headers)
    if (!decisao.allowed) return rateLimitExceededResponse(decisao)

    const { slug } = await params
    if (!SLUG_PATTERN.test(slug)) {
      return NextResponse.json(
        { data: null, estado: null, message: "Candidatura não encontrada." },
        { status: 404, headers: { "cache-control": PUBLIC_CACHE } },
      )
    }
    const resource = await deps.getProgramaGovernoPublicResource(slug)
    if (!resource.known) {
      return NextResponse.json(
        { data: null, estado: null, message: "Candidatura não encontrada." },
        { status: 404, headers: { "cache-control": PUBLIC_CACHE } },
      )
    }

    return NextResponse.json(
      {
        data: resource.data,
        estado: resource.manifesto.estado,
        fonte: resource.manifesto.fonte,
      },
      { headers: { "cache-control": PUBLIC_CACHE } },
    )
  }
}

export const GET = createProgramaGovernoGetHandler()

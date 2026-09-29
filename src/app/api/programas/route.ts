import { NextResponse } from "next/server"
import {
  buscarProgramas,
  parseProgramaBuscaFiltros,
  ProgramaBuscaFiltroError,
} from "@/lib/programa-governo-busca-server"
import {
  createDistributedIpRateLimiter,
  rateLimitExceededResponse,
  type DistributedRequestRateLimiter,
} from "@/lib/request-rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const programasBuscaRateLimiter = createDistributedIpRateLimiter({
  namespace: "programas-busca",
  max: 60,
  windowMs: 60_000,
})

type ProgramaBuscaRouteDeps = {
  buscarProgramas: typeof buscarProgramas
  rateLimiter: DistributedRequestRateLimiter
}

const defaultDeps: ProgramaBuscaRouteDeps = {
  buscarProgramas,
  rateLimiter: programasBuscaRateLimiter,
}

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    { error: status === 503 ? "Busca indisponível" : "Parâmetros inválidos", message },
    { status, headers: { "cache-control": "no-store" } },
  )
}

export function createProgramasGetHandler(deps: ProgramaBuscaRouteDeps = defaultDeps) {
  return async function GET(request: Request) {
    let decision
    try {
      decision = await deps.rateLimiter.check(request.headers)
    } catch (error) {
      console.error("programas search rate limiter failed:", error instanceof Error ? error.message : error)
      return errorResponse("A busca pública está temporariamente indisponível.", 503)
    }
    if (!decision.allowed) return rateLimitExceededResponse(decision)

    let filtros
    try {
      filtros = parseProgramaBuscaFiltros(new URL(request.url).searchParams)
      if (filtros.q.length < 3) throw new ProgramaBuscaFiltroError("A busca deve ter entre 3 e 100 caracteres.")
    } catch (error) {
      if (error instanceof ProgramaBuscaFiltroError) return errorResponse(error.message, 400)
      console.error("programas search parameter parsing failed:", error)
      return errorResponse("A busca pública está temporariamente indisponível.", 503)
    }

    try {
      const data = await deps.buscarProgramas(filtros)
      return NextResponse.json(data, { headers: { "cache-control": "no-store" } })
    } catch (error) {
      console.error("programas search failed:", error instanceof Error ? error.message : error)
      return errorResponse("A busca pública está temporariamente indisponível.", 503)
    }
  }
}

export const GET = createProgramasGetHandler()

import { NextResponse } from "next/server"
import {
  getProgramaGovernoPublicChunk,
  getProgramaGovernoPublicResource,
  type ProgramaGovernoChunkResource,
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
  getProgramaGovernoPublicChunk?: (
    slug: string,
    documentoId: string,
    cursor: string | null,
  ) => Promise<ProgramaGovernoChunkResource>
  rateLimiter: RequestRateLimiter
}

const defaultDeps: ProgramaGovernoRouteDeps = {
  getProgramaGovernoPublicResource,
  getProgramaGovernoPublicChunk,
  rateLimiter: programaRateLimiter,
}

const PUBLIC_CACHE = "public, max-age=60, s-maxage=3600, stale-while-revalidate=3600"
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const DOCUMENTO_ID_PATTERN = /^(BR|A[CLMP]|BA|CE|DF|ES|GO|MA|M[GST]|P[ABER]|R[JNSOR]|S[CEP]|TO):\d{11,12}:\d{2}$/

function invalidRequest(message: string) {
  return NextResponse.json(
    { data: null, estado: null, message },
    { status: 400, headers: { "cache-control": "no-store" } },
  )
}

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
    const url = new URL(request.url)
    const documentoId = url.searchParams.get("documentoId")
    const cursor = url.searchParams.get("cursor")
    if (cursor !== null && documentoId === null) {
      return invalidRequest("Cursor requer documentoId.")
    }
    if (documentoId !== null) {
      if (!DOCUMENTO_ID_PATTERN.test(documentoId)) {
        return invalidRequest("Documento inválido.")
      }
      if (cursor !== null && !new RegExp(`^${documentoId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}@\\d+$`).test(cursor)) {
        return invalidRequest("Cursor inválido.")
      }
      const loadChunk = deps.getProgramaGovernoPublicChunk
      if (!loadChunk) return invalidRequest("Consulta por documento indisponível.")
      let chunkResource: ProgramaGovernoChunkResource
      try {
        chunkResource = await loadChunk(slug, documentoId, cursor)
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("cursor:")) {
          return invalidRequest("Cursor inválido.")
        }
        throw error
      }
      if (!chunkResource.known) {
        return NextResponse.json(
          { data: null, estado: null, message: "Candidatura não encontrada." },
          { status: 404, headers: { "cache-control": PUBLIC_CACHE } },
        )
      }
      return NextResponse.json(
        {
          data: null,
          estado: chunkResource.manifesto.estado,
          fonte: chunkResource.manifesto.fonte,
          ...(chunkResource.chunk ? { chunk: chunkResource.chunk } : {}),
        },
        { headers: { "cache-control": PUBLIC_CACHE } },
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

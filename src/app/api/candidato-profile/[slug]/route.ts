import { NextResponse } from "next/server"
import { getCandidatoBySlugResource } from "@/lib/api"
import { toPublicCandidatoProfileDto } from "@/lib/public-profile-dto"
import {
  createFixedWindowIpRateLimiter,
  rateLimitExceededResponse,
  type RequestRateLimiter,
} from "@/lib/request-rate-limit"

// Estado pos-PF-04: o HTML da ficha e esta API sao dinamicos e private/no-store.
// Nao ha ISR nem defesa de CDN neste caminho. A unica camada persistente e o
// `unstable_cache` de dados em getCandidatoBySlugResource, invalidado pela tag
// `public-candidato-ficha`; o rate limit abaixo protege cada invocacao dinamica.
export const dynamic = "force-dynamic"

/**
 * Rate limit acrescentado em 18/08/2026, vespera do lancamento.
 *
 * Auditoria daquele dia: das rotas publicas de leitura, `candidato-slugs`
 * (revalidate 300) e `search-index` sao absorvidas pela CDN e medidas com
 * `x-vercel-cache: HIT`, ou seja, nao geram invocacao por request. Esta aqui e
 * `force-dynamic` e nao tinha limite nenhum, entao cada request batia na
 * funcao. Com 207 fichas publicadas, varrer a base inteira custava 207
 * invocacoes e nada segurava a repeticao disso em loop.
 *
 * O objetivo NAO e esconder dado: o conteudo e publico por projeto e existe
 * para ser lido. O que se protege e conta e disponibilidade no dia de maior
 * trafego.
 *
 * O teto e generoso de proposito. Navegacao humana rapida abre poucas dezenas
 * de fichas por minuto; 100 por minuto por IP nao encosta em leitor real e
 * ainda assim transforma varredura ilimitada em varredura com ritmo.
 */
const perfilRateLimiter = createFixedWindowIpRateLimiter({
  namespace: "candidato-profile",
  max: 100,
  windowMs: 60_000,
})

type CandidatoProfileResource = Awaited<ReturnType<typeof getCandidatoBySlugResource>>

interface CandidatoProfileRouteDeps {
  getCandidatoBySlugResource: (slug: string) => Promise<CandidatoProfileResource>
  rateLimiter: RequestRateLimiter
}

const defaultCandidatoProfileRouteDeps: CandidatoProfileRouteDeps = {
  getCandidatoBySlugResource,
  rateLimiter: perfilRateLimiter,
}

export function createCandidatoProfileGetHandler(
  deps: CandidatoProfileRouteDeps = defaultCandidatoProfileRouteDeps,
) {
  return async function GET(
    request: Request,
    { params }: { params: Promise<{ slug: string }> },
  ) {
    const decisao = deps.rateLimiter.check(request.headers)
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

    return NextResponse.json(
      {
        data: toPublicCandidatoProfileDto(resource.data),
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

export const GET = createCandidatoProfileGetHandler()

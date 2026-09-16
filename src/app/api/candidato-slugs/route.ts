import { NextResponse } from "next/server"
import { getCandidatoSlugStaticParams } from "@/lib/api"

/**
 * Retorna a lista de slugs publicos validos, para que o middleware possa
 * emitir HTTP 404 real em `/candidato/[slug]` inexistente antes do page body
 * commitar status 200 via streaming/Suspense (soft-404 do App Router).
 *
 * Politica de cache (2026-09-16):
 * - A funcao e dinamica: cada execucao le `getCandidatoSlugStaticParams`, cujo
 *   `unstable_cache` tem chave com SENADO_CACHE_VARIANT. Essa e a unica camada
 *   que sobrevive entre deployments, entao e ela que separa a coorte por flag.
 * - A lista saudavel sai com cache publico curto de CDN. O middleware chama esta
 *   rota em TODA requisicao a /candidato/*, e sem isso cada ficha custava uma
 *   invocacao extra. A flag do Senado e env de runtime; trocar env na Vercel
 *   exige redeploy, e o cache de CDN e por deployment.
 * - Falha de leitura e lista vazia saem `no-store`, para uma falha transiente
 *   nao ficar presa no CDN.
 */
export const dynamic = "force-dynamic"

const CANDIDATO_SLUGS_CDN_CACHE_CONTROL =
  "public, max-age=60, s-maxage=300, stale-while-revalidate=600"

type LoadCandidatoSlugs = () => Promise<{ slug: string }[]>

export function createCandidatoSlugsGetHandler(
  loadSlugs: LoadCandidatoSlugs = getCandidatoSlugStaticParams,
) {
  return async function GET() {
    let slugs: string[]
    try {
      const rows = await loadSlugs()
      slugs = rows.map((row) => row.slug)
    } catch (error) {
      // Falha de leitura: responde !ok + no-store para o middleware entrar em
      // fail-open em vez de cachear um 404 universal (review 2026-06-09).
      console.error(
        "candidato-slugs route failed:",
        error instanceof Error ? error.message : error,
      )
      return NextResponse.json(
        { slugs: null, error: "unavailable" },
        { status: 503, headers: { "cache-control": "no-store" } },
      )
    }

    // Lista vazia nao deve ficar no CDN: se foi um vazio transiente, a
    // recuperacao precisa propagar rapido. O middleware ja trata vazio como fail-open.
    const cacheControl = slugs.length === 0 ? "no-store" : CANDIDATO_SLUGS_CDN_CACHE_CONTROL

    return NextResponse.json({ slugs }, { headers: { "cache-control": cacheControl } })
  }
}

export const GET = createCandidatoSlugsGetHandler()

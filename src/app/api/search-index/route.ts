import { NextResponse } from "next/server"
import { getCandidatoSlugStaticParams, getGlobalSearchIndexResource } from "@/lib/api"
import { filterGlobalSearchIndexToPublicSlugs, type GlobalSearchIndexItem } from "@/lib/global-search"
import type { DataResource } from "@/lib/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Cache publico curto no caminho saudavel: a funcao continua dinamica e o CDN
 * absorve a repeticao. A separacao por flag do Senado vem das chaves de
 * `unstable_cache` (SENADO_CACHE_VARIANT) e do cache de CDN ser por deployment,
 * ja que trocar env na Vercel exige redeploy.
 */
const SEARCH_INDEX_CDN_CACHE_CONTROL =
  "public, max-age=60, s-maxage=60, stale-while-revalidate=300"

interface SearchIndexRouteDeps {
  loadIndex: () => Promise<DataResource<GlobalSearchIndexItem[]>>
  loadPublicSlugs: () => Promise<{ slug: string }[]>
}

export function createSearchIndexGetHandler(
  deps: SearchIndexRouteDeps = {
    loadIndex: getGlobalSearchIndexResource,
    loadPublicSlugs: getCandidatoSlugStaticParams,
  },
) {
  return async function GET() {
    let resource: DataResource<GlobalSearchIndexItem[]>
    let publicSlugRows: { slug: string }[]
    try {
      ;[resource, publicSlugRows] = await Promise.all([deps.loadIndex(), deps.loadPublicSlugs()])
    } catch (error) {
      // Sem a coorte canônica não dá para filtrar o índice; responde vazio e
      // no-store para o cliente mostrar falha e tentar de novo.
      console.error(
        "search-index route failed:",
        error instanceof Error ? error.message : error,
      )
      return NextResponse.json(
        { ok: false, data: [] },
        { status: 503, headers: { "cache-control": "no-store" } },
      )
    }
    // O filtro canônico precisa ser reavaliado após mudanças na coorte pública.
    const data = filterGlobalSearchIndexToPublicSlugs(
      resource.data,
      publicSlugRows.map((row) => row.slug),
    )
    // Degradado ou vazio sai no-store: o CDN não pode segurar um índice ruim
    // enquanto a fonte se recupera (review 2026-06-09).
    const degraded = resource.sourceStatus === "degraded"
    return NextResponse.json(
      { ok: !degraded, data },
      {
        headers: {
          "cache-control": degraded || data.length === 0 ? "no-store" : SEARCH_INDEX_CDN_CACHE_CONTROL,
        },
      },
    )
  }
}

export const GET = createSearchIndexGetHandler()

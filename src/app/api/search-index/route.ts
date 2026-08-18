import { NextResponse } from "next/server"
import { getGlobalSearchIndexResource } from "@/lib/api"

export const runtime = "nodejs"

export async function GET() {
  const resource = await getGlobalSearchIndexResource()
  // Nao fixar um indice degradado/vazio por 1h no CDN com ok:true. Em degradacao,
  // reporta ok:false e cache curto para a recuperacao propagar rapido (review 2026-06-09).
  const degraded = resource.sourceStatus === "degraded"
  return NextResponse.json(
    { ok: !degraded, data: resource.data },
    {
      headers: {
        "cache-control": degraded
          ? "public, max-age=0, s-maxage=30, stale-while-revalidate=300"
          : "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      },
    }
  )
}

import { getImprensaDataset, normalizeImprensaFilters } from "@/lib/imprensa-data"
import {
  assertExportSize,
  exportHeaders,
  serializeImprensaCsv,
  serializeImprensaJson,
} from "@/lib/imprensa-export"

export const dynamic = "force-dynamic"

function queryFilters(request: Request) {
  const url = new URL(request.url)
  return normalizeImprensaFilters({ cargo: url.searchParams.get("cargo"), uf: url.searchParams.get("uf") })
}

async function loadDataset(request: Request) {
  return getImprensaDataset(queryFilters(request))
}

export async function GET(request: Request) {
  try {
    const dataset = await loadDataset(request)
    const format = new URL(request.url).searchParams.get("format")?.toLowerCase() === "csv" ? "csv" : "json"
    const body = format === "csv" ? serializeImprensaCsv(dataset) : serializeImprensaJson(dataset)
    assertExportSize(body)
    return new Response(body, {
      status: 200,
      headers: exportHeaders(
        format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
        format === "csv" ? "puxa-ficha-imprensa.csv" : "puxa-ficha-imprensa.json",
        dataset,
      ),
    })
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === "export excede o limite de resposta"
    return Response.json(
      { error: tooLarge ? "export_muito_grande" : "fonte_indisponivel", message: tooLarge ? "O recorte excede o limite do export." : "A consulta pública está indisponível no momento." },
      { status: tooLarge ? 413 : 503, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } },
    )
  }
}

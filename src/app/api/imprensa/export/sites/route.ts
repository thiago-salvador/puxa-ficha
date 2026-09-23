import { getImprensaDataset, normalizeImprensaFilters } from "@/lib/imprensa-data"
import {
  assertExportSize,
  exportHeaders,
  serializeImprensaLongCsv,
  serializeImprensaLongJson,
} from "@/lib/imprensa-export"

export const dynamic = "force-dynamic"

function filters(request: Request) {
  const url = new URL(request.url)
  return normalizeImprensaFilters({ cargo: url.searchParams.get("cargo"), uf: url.searchParams.get("uf") })
}

export async function GET(request: Request) {
  try {
    const dataset = await getImprensaDataset(filters(request))
    const csv = new URL(request.url).searchParams.get("format")?.toLowerCase() === "csv"
    const body = csv ? serializeImprensaLongCsv(dataset, "sites") : serializeImprensaLongJson(dataset, "sites")
    assertExportSize(body)
    return new Response(body, { status: 200, headers: exportHeaders(csv ? "text/csv; charset=utf-8" : "application/json; charset=utf-8", csv ? "puxa-ficha-imprensa-sites.csv" : "puxa-ficha-imprensa-sites.json", dataset) })
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === "export excede o limite de resposta"
    return Response.json({ error: tooLarge ? "export_muito_grande" : "fonte_indisponivel", message: tooLarge ? "O recorte excede o limite do export." : "A consulta pública está indisponível no momento." }, { status: tooLarge ? 413 : 503, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } })
  }
}

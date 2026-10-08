import { datasetDoTurno, nomeExportTurno } from "@/lib/imprensa-2turno"
import { getImprensaDataset, normalizeImprensaFilters } from "@/lib/imprensa-data"
import { parseImprensaTurno } from "@/lib/imprensa-nav"
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
    const turno = parseImprensaTurno(new URL(request.url).searchParams.get("turno"))
    const dataset = datasetDoTurno(await getImprensaDataset(filters(request)), turno)
    const csv = new URL(request.url).searchParams.get("format")?.toLowerCase() === "csv"
    const body = csv ? serializeImprensaLongCsv(dataset, "processos") : serializeImprensaLongJson(dataset, "processos")
    assertExportSize(body)
    return new Response(body, { status: 200, headers: exportHeaders(csv ? "text/csv; charset=utf-8" : "application/json; charset=utf-8", nomeExportTurno(csv ? "puxa-ficha-imprensa-processos.csv" : "puxa-ficha-imprensa-processos.json", turno), dataset) })
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === "export excede o limite de resposta"
    return Response.json({ error: tooLarge ? "export_muito_grande" : "fonte_indisponivel", message: tooLarge ? "O recorte excede o limite do export." : "A consulta pública está indisponível no momento." }, { status: tooLarge ? 413 : 503, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } })
  }
}

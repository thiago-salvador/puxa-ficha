import { getDadosAbertosDataset, normalizeDadosAbertosFilters } from "@/lib/dados-abertos"
import { assertExportSize, exportHeaders, serializeDadosAbertosCsv, serializeDadosAbertosJson } from "@/lib/dados-abertos-export"

export const dynamic = "force-dynamic"

function queryFilters(request: Request) {
  const url = new URL(request.url)
  return normalizeDadosAbertosFilters({ cargo: url.searchParams.get("cargo"), uf: url.searchParams.get("uf") })
}

async function loadDataset(request: Request) {
  return getDadosAbertosDataset(queryFilters(request))
}

export async function GET(request: Request) {
  try {
    const dataset = await loadDataset(request)
    const format = new URL(request.url).searchParams.get("format")?.toLowerCase() === "csv" ? "csv" : "json"
    const body = format === "csv" ? serializeDadosAbertosCsv(dataset) : serializeDadosAbertosJson(dataset)
    assertExportSize(body)
    return new Response(body, {
      status: 200,
      headers: exportHeaders(
        format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
        format === "csv" ? "puxa-ficha-dados-abertos.csv" : "puxa-ficha-dados-abertos.json",
        dataset,
      ),
    })
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === "export excede o limite de resposta"
    return Response.json(
      {
        error: tooLarge ? "export_muito_grande" : "fonte_indisponivel",
        message: tooLarge ? "O recorte excede o limite do export." : "A consulta pública está indisponível no momento.",
      },
      { status: tooLarge ? 413 : 503, headers: { "Cache-Control": "no-store" } },
    )
  }
}

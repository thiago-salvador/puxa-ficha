import type { ImprensaDataset, ImprensaRow } from "@/lib/imprensa-data"

const IMPRENSA_EXPORT_VERSION = "1"
const IMPRENSA_EXPORT_MAX_BYTES = 4 * 1024 * 1024
const IMPRENSA_EXPORT_TTL_SECONDS = 300

const MAIN_COLUMNS = [
  "version",
  "generated_at",
  "cargo_filtro",
  "uf_filtro",
  "slug",
  "nome_urna",
  "cargo_disputado",
  "uf",
  "partido_sigla",
  "ficha_url",
  "sites_estado",
  "sites_quantidade",
  "sites_fonte_url",
  "sites_fonte_sha256",
  "sites_coletado_em",
  "chapa_estado",
  "chapa_vice_nome",
  "chapa_fonte_url",
  "chapa_fonte_sha256",
  "chapa_snapshot_em",
  "processos_estado",
  "processos_quantidade",
] as const

export type ImprensaExportKind = "csv" | "json"
export type ImprensaLongFamily = "sites" | "processos"

type Cell = string | number | null
function mainCells(row: ImprensaRow): Cell[] {
  return [
    row.slug,
    row.nome,
    row.cargo,
    row.uf,
    row.partido,
    row.fichaUrl,
    row.sites?.estado ?? null,
    row.sites?.quantidade ?? null,
    row.sites?.fonteUrl ?? null,
    row.sites?.fonteSha256 ?? null,
    row.sites?.coletadoEm ?? null,
    row.chapa.estado,
    row.chapa.viceNome,
    row.chapa.fonteUrl,
    row.chapa.fonteSha256,
    row.chapa.snapshotEm,
    row.processos?.estado ?? null,
    row.processos?.quantidade ?? null,
  ]
}

function mainCellsWithMetadata(dataset: ImprensaDataset, row: ImprensaRow): Cell[] {
  return [dataset.version, dataset.generatedAt, dataset.filters.cargo, dataset.filters.uf, ...mainCells(row)]
}

/** Prefixa valores perigosos para impedir execução como fórmula em planilhas. */
export function neutralizeCsvFormula(value: string): string {
  return /^[\t\r\n]|^\s*[=+\-@]/u.test(value) ? `'${value}` : value
}

function escapeCsvCell(value: Cell): string {
  if (value === null || value === undefined) return ""
  const text = neutralizeCsvFormula(String(value))
  return `"${text.replaceAll('"', '""')}"`
}

export function serializeImprensaCsv(dataset: ImprensaDataset): string {
  const lines = [
    MAIN_COLUMNS.map(escapeCsvCell).join(","),
    ...dataset.rows.map((row) => mainCellsWithMetadata(dataset, row).map(escapeCsvCell).join(",")),
  ]
  return `\ufeff${lines.join("\r\n")}\r\n`
}

export function serializeImprensaJson(dataset: ImprensaDataset): string {
  return JSON.stringify({
    version: IMPRENSA_EXPORT_VERSION,
    generatedAt: dataset.generatedAt,
    filters: dataset.filters,
    rows: dataset.rows.map((row) => ({
      slug: row.slug,
      nome: row.nome,
      cargo: row.cargo,
      uf: row.uf,
      partido: row.partido,
      fichaUrl: row.fichaUrl,
      sites: {
        estado: row.sites.estado,
        quantidade: row.sites.quantidade,
        fonteUrl: row.sites.fonteUrl,
        fonteSha256: row.sites.fonteSha256,
        coletadoEm: row.sites.coletadoEm,
      },
      chapa: row.chapa,
      processos: {
        estado: row.processos.estado,
        quantidade: row.processos.quantidade,
      },
    })),
  })
}

function isHttps(url: unknown): url is string {
  return typeof url === "string" && /^https:\/\//i.test(url)
}

export interface ImprensaLongSiteRow {
  slug: string
  ordem: number
  url: string
  fonte_url: string | null
  fonte_sha256: string | null
  coletado_em: string | null
}

export interface ImprensaLongProcessoRow {
  slug: string
  numero: string | null
  tipo: string | null
  tribunal: string | null
  url_fonte: string
  data_inicio: string | null
  data_decisao: string | null
}

export function buildImprensaLongRows(
  dataset: ImprensaDataset,
  family: ImprensaLongFamily,
): Array<ImprensaLongSiteRow | ImprensaLongProcessoRow> {
  if (family === "sites") {
    return dataset.rows.flatMap((row) =>
      (row.sites?.ocorrencias ?? []).map((occurrence) => ({
        slug: row.slug,
        ordem: occurrence.ordem,
        url: occurrence.url,
        fonte_url: row.sites?.fonteUrl ?? null,
        fonte_sha256: row.sites?.fonteSha256 ?? null,
        coletado_em: row.sites?.coletadoEm ?? null,
      })),
    )
  }

  return dataset.rows.flatMap((row) =>
    (row.processos?.ocorrencias ?? [])
      .filter((occurrence) => isHttps(occurrence.urlFonte))
      .map((occurrence) => ({
        slug: row.slug,
        numero: occurrence.numero ?? null,
        tipo: occurrence.tipo ?? null,
        tribunal: occurrence.tribunal ?? null,
        url_fonte: occurrence.urlFonte,
        data_inicio: occurrence.dataInicio ?? null,
        data_decisao: occurrence.dataDecisao ?? null,
      })),
  )
}

export function serializeImprensaLongJson(
  dataset: ImprensaDataset,
  family: ImprensaLongFamily,
): string {
  return JSON.stringify({
    version: IMPRENSA_EXPORT_VERSION,
    generatedAt: dataset.generatedAt,
    filters: dataset.filters,
    family,
    rows: buildImprensaLongRows(dataset, family),
  })
}

export function serializeImprensaLongCsv(
  dataset: ImprensaDataset,
  family: ImprensaLongFamily,
): string {
  const rows = buildImprensaLongRows(dataset, family)
  const familyColumns = family === "sites"
    ? ["slug", "ordem", "url", "fonte_url", "fonte_sha256", "coletado_em"]
    : ["slug", "numero", "tipo", "tribunal", "url_fonte", "data_inicio", "data_decisao"]
  const columns = ["version", "generated_at", "cargo_filtro", "uf_filtro", ...familyColumns]
  const lines = [
    columns.map(escapeCsvCell).join(","),
    ...rows.map((row) => [dataset.version, dataset.generatedAt, dataset.filters.cargo, dataset.filters.uf, ...familyColumns.map((column) => (row as unknown as Record<string, Cell>)[column])].map(escapeCsvCell).join(",")),
  ]
  return `\ufeff${lines.join("\r\n")}\r\n`
}

export function exportHeaders(
  contentType: string,
  filename: string,
  dataset: ImprensaDataset,
): Headers {
  return new Headers({
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${filename}"`,
    "X-Robots-Tag": "noindex, nofollow",
    "Cache-Control": `public, s-maxage=${IMPRENSA_EXPORT_TTL_SECONDS}, stale-while-revalidate=60`,
    "X-Imprensa-Dataset-Version": IMPRENSA_EXPORT_VERSION,
    "X-Imprensa-Dataset-Date": dataset.generatedAt,
    "X-Imprensa-Dataset-TTL": String(IMPRENSA_EXPORT_TTL_SECONDS),
    "X-Imprensa-Filters": JSON.stringify(dataset.filters),
  })
}

export function assertExportSize(body: string): void {
  if (new TextEncoder().encode(body).byteLength > IMPRENSA_EXPORT_MAX_BYTES) {
    throw new Error("export excede o limite de resposta")
  }
}

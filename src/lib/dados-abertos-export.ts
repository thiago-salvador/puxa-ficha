import { neutralizeCsvFormula } from "@/lib/imprensa-export"
import type { DadosAbertosDataset, DadosAbertosRow } from "@/lib/dados-abertos"

const DADOS_ABERTOS_EXPORT_VERSION = "1"
const DADOS_ABERTOS_EXPORT_MAX_BYTES = 8 * 1024 * 1024
const DADOS_ABERTOS_EXPORT_TTL_SECONDS = 300

const COLUMNS = [
  "version",
  "generated_at",
  "cargo_filtro",
  "uf_filtro",
  "slug",
  "nome_urna",
  "nome_completo",
  "cargo_disputado",
  "uf",
  "partido_sigla",
  "situacao_candidatura",
  "numero_urna",
  "ficha_url",
  "ultima_atualizacao",
  "fontes",
] as const

type Cell = string | number | null

function cells(dataset: DadosAbertosDataset, row: DadosAbertosRow): Cell[] {
  return [
    dataset.version,
    dataset.generatedAt,
    dataset.filters.cargo,
    dataset.filters.uf,
    row.slug,
    row.nomeUrna,
    row.nomeCompleto,
    row.cargo,
    row.uf,
    row.partido,
    row.situacao,
    row.numeroUrna,
    row.fichaUrl,
    row.ultimaAtualizacao,
    row.fontes.join("; "),
  ]
}

function escapeCsvCell(value: Cell): string {
  if (value === null || value === undefined) return ""
  const text = neutralizeCsvFormula(String(value))
  return `"${text.replaceAll('"', '""')}"`
}

export function serializeDadosAbertosCsv(dataset: DadosAbertosDataset): string {
  const lines = [
    COLUMNS.map(escapeCsvCell).join(","),
    ...dataset.rows.map((row) => cells(dataset, row).map(escapeCsvCell).join(",")),
  ]
  return `﻿${lines.join("\r\n")}\r\n`
}

export function serializeDadosAbertosJson(dataset: DadosAbertosDataset): string {
  return JSON.stringify({
    version: DADOS_ABERTOS_EXPORT_VERSION,
    generatedAt: dataset.generatedAt,
    filters: dataset.filters,
    license: {
      code: "Apache-2.0",
      data: "Fontes públicas oficiais (TSE e afins); reutilização segue os termos de cada fonte.",
    },
    rows: dataset.rows,
  })
}

export function exportHeaders(contentType: string, filename: string, dataset: DadosAbertosDataset): Headers {
  return new Headers({
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": `public, s-maxage=${DADOS_ABERTOS_EXPORT_TTL_SECONDS}, stale-while-revalidate=60`,
    "X-Dados-Abertos-Version": DADOS_ABERTOS_EXPORT_VERSION,
    "X-Dados-Abertos-Date": dataset.generatedAt,
    "X-Dados-Abertos-TTL": String(DADOS_ABERTOS_EXPORT_TTL_SECONDS),
    "X-Dados-Abertos-Filters": JSON.stringify(dataset.filters),
  })
}

export function assertExportSize(body: string): void {
  if (new TextEncoder().encode(body).byteLength > DADOS_ABERTOS_EXPORT_MAX_BYTES) {
    throw new Error("export excede o limite de resposta")
  }
}

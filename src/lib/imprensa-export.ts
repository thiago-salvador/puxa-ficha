import type { ImprensaDataset, ImprensaRow } from "@/lib/imprensa-data"

const IMPRENSA_EXPORT_VERSION = "2"
const IMPRENSA_EXPORT_MAX_BYTES = 4 * 1024 * 1024
const IMPRENSA_EXPORT_TTL_SECONDS = 300
export const IMPRENSA_AVISO = "Confira os dados na fonte original antes de publicar."
const IMPRENSA_AVISO_HEADER = encodeURIComponent(IMPRENSA_AVISO)

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
  "processos_busca_estado",
  "processos_quantidade",
  "processos_quantidade_omitida",
  "chapa_suplentes_estado",
  "chapa_suplentes",
  "chapa_vice_nome_original",
  "processos_quantidade_em_confirmacao",
  "nome_urna_original",
  "chapa_vice_situacao",
  "chapa_vice_situacao_fonte_url",
  "patrimonio_estado",
  "patrimonio_ano",
  "patrimonio_total",
  "patrimonio_valor_estado",
  "patrimonio_ano_anterior",
  "patrimonio_total_anterior",
  "patrimonio_variacao_pct",
  "patrimonio_fonte_url",
  "gastos_estado",
  "gastos_ultimo_ano",
  "gastos_ultimo_ano_total",
  "gastos_anos_em_revisao",
  "tcu_estado",
  "tcu_registros",
  "tcu_consultado_em",
  "tcu_fonte_url",
  "sancoes_estado",
  "sancoes_quantidade",
  "sancoes_consultado_em",
  "sancoes_fonte_url",
  // Contagem única da ficha (29/09/2026): judiciais + disciplinares = total.
  "processos_judiciais",
  "processos_disciplinares",
  "processos_total",
] as const

export type ImprensaExportKind = "csv" | "json"
export type ImprensaLongFamily = "sites" | "processos" | "gastos"

type Cell = string | number | null
function mainCells(row: ImprensaRow): Cell[] {
  return [
    row.slug,
    // Mesma grafia de exibição da ficha; a do TSE segue em nome_urna_original
    // (o botão "Como citar" também usa a grafia do TSE).
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
    // Mesma grafia de exibição da ficha (chapa_2026.vice_nome_urna); a grafia do
    // TSE segue em chapa_vice_nome_original.
    row.chapa.viceNome,
    row.chapa.fonteUrl,
    row.chapa.fonteSha256,
    row.chapa.snapshotEm,
    row.processos?.estado ?? null,
    row.processos?.buscaEstado ?? null,
    row.processos?.quantidade ?? null,
    row.processos?.quantidadeOmitida ?? 0,
    row.chapa.suplentesEstado,
    row.chapa.suplentes.join("; ") || null,
    row.chapa.viceNomeOriginal,
    row.processos?.quantidadeEmConfirmacao ?? 0,
    row.nomeOriginal,
    row.chapa.viceSituacao?.label ?? null,
    row.chapa.viceSituacao?.source_url ?? null,
    // Famílias da ficha acrescentadas em 27/09/2026. Sem dado é célula vazia
    // com o estado ao lado, nunca zero.
    row.patrimonio?.estado ?? "sem_dado",
    row.patrimonio?.ano ?? null,
    row.patrimonio?.total ?? null,
    row.patrimonio?.valorEstado ?? null,
    row.patrimonio?.anoAnterior ?? null,
    row.patrimonio?.totalAnterior ?? null,
    row.patrimonio?.variacaoPct ?? null,
    row.patrimonio?.fonteUrl ?? null,
    row.gastos?.estado ?? "sem_dado",
    row.gastos?.ultimoAno ?? null,
    row.gastos?.ultimoAnoTotal ?? null,
    row.gastos?.anosEmRevisao.join("; ") || null,
    row.tcu?.estado ?? "nao_verificado",
    row.tcu?.registros ?? null,
    row.tcu?.consultadoEm ?? null,
    row.tcu?.fonteUrl ?? null,
    row.sancoes?.estado ?? "nao-verificado",
    row.sancoes?.quantidade ?? null,
    row.sancoes?.consultadoEm ?? null,
    row.sancoes?.fonteUrl ?? null,
    row.processos?.contagem?.judiciais ?? null,
    row.processos?.contagem?.disciplinares ?? 0,
    row.processos?.contagem?.total ?? null,
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
  const columns = [...MAIN_COLUMNS, "aviso"]
  const lines = [
    columns.map(escapeCsvCell).join(","),
    ...dataset.rows.map((row) => [...mainCellsWithMetadata(dataset, row), IMPRENSA_AVISO].map(escapeCsvCell).join(",")),
  ]
  return `\ufeff${lines.join("\r\n")}\r\n`
}

export function serializeImprensaJson(dataset: ImprensaDataset): string {
  return JSON.stringify({
    version: IMPRENSA_EXPORT_VERSION,
    generatedAt: dataset.generatedAt,
    aviso: IMPRENSA_AVISO,
    filters: dataset.filters,
    rows: dataset.rows.map((row) => ({
      slug: row.slug,
      // Mesma grafia de exibição da ficha; a do TSE segue em nomeOriginal.
      nome: row.nome,
      nomeOriginal: row.nomeOriginal,
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
      chapa: { estado: row.chapa.estado, suplentesEstado: row.chapa.suplentesEstado, viceNome: row.chapa.viceNome, viceNomeOriginal: row.chapa.viceNomeOriginal, viceSituacao: row.chapa.viceSituacao ?? null, suplentes: row.chapa.suplentes, fonteUrl: row.chapa.fonteUrl, fonteSha256: row.chapa.fonteSha256, snapshotEm: row.chapa.snapshotEm },
      processos: {
        estado: row.processos.estado,
        buscaEstado: row.processos.buscaEstado,
        quantidade: row.processos.quantidade,
        quantidadeOmitida: row.processos.quantidadeOmitida,
        quantidadeEmConfirmacao: row.processos.quantidadeEmConfirmacao ?? 0,
        judiciais: row.processos.contagem?.judiciais ?? null,
        disciplinares: row.processos.contagem?.disciplinares ?? 0,
        total: row.processos.contagem?.total ?? null,
      },
      patrimonio: row.patrimonio ?? null,
      gastos: row.gastos
        ? { estado: row.gastos.estado, ultimoAno: row.gastos.ultimoAno, ultimoAnoTotal: row.gastos.ultimoAnoTotal, anosEmRevisao: row.gastos.anosEmRevisao }
        : null,
      tcu: row.tcu ?? null,
      sancoes: row.sancoes ?? null,
    })),
  })
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
  /** "oficial" ou "em_confirmacao" (selo "Fonte em confirmação" na ficha). */
  fonte_nivel: string
  data_inicio: string | null
  data_decisao: string | null
}

export interface ImprensaLongGastoRow {
  slug: string
  ano: number
  /** "camara", "senado" ou null quando a fonte não identifica a casa. */
  casa: string | null
  total: number
  fonte_url: string | null
}

function hasPublishableSourceUrl(occurrence: ImprensaRow["processos"]["ocorrencias"][number]): boolean {
  const url = occurrence.urlFonte
  if (typeof url !== "string") return false
  // Fonte judicial específica é sempre HTTPS; a página do selo segue a mesma
  // regra de link da ficha (urlPublicaDoProcesso aceita http e https).
  return occurrence.fonteNivel === "em_confirmacao" ? /^https?:\/\//i.test(url) : /^https:\/\//i.test(url)
}

export function buildImprensaLongRows(
  dataset: ImprensaDataset,
  family: ImprensaLongFamily,
): Array<ImprensaLongSiteRow | ImprensaLongProcessoRow | ImprensaLongGastoRow> {
  if (family === "gastos") {
    // Uma linha por ficha, ano e casa: as mesmas linhas que a ficha exibe.
    return dataset.rows.flatMap((row) =>
      (row.gastos?.anos ?? []).map((item) => ({
        slug: row.slug,
        ano: item.ano,
        casa: item.casa,
        total: item.total,
        fonte_url: item.fonteUrl,
      })),
    )
  }
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

  // As ocorrências já passaram pela regra da ficha (nivelFonteProcesso): cada
  // linha pública da ficha aparece aqui, inclusive as que levam o selo. O filtro
  // abaixo só repete, como defesa, o formato de URL que cada nível exige.
  return dataset.rows.flatMap((row) =>
    (row.processos?.ocorrencias ?? [])
      .filter(hasPublishableSourceUrl)
      .map((occurrence) => ({
        slug: row.slug,
        numero: occurrence.numero ?? null,
        tipo: occurrence.tipo ?? null,
        tribunal: occurrence.tribunal ?? null,
        url_fonte: occurrence.urlFonte,
        fonte_nivel: occurrence.fonteNivel,
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
    aviso: IMPRENSA_AVISO,
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
    : family === "gastos"
      ? ["slug", "ano", "casa", "total", "fonte_url"]
      : ["slug", "numero", "tipo", "tribunal", "url_fonte", "fonte_nivel", "data_inicio", "data_decisao"]
  const columns = ["version", "generated_at", "cargo_filtro", "uf_filtro", ...familyColumns, "aviso"]
  const lines = [
    columns.map(escapeCsvCell).join(","),
    ...rows.map((row) => [dataset.version, dataset.generatedAt, dataset.filters.cargo, dataset.filters.uf, ...familyColumns.map((column) => (row as unknown as Record<string, Cell>)[column]), IMPRENSA_AVISO].map(escapeCsvCell).join(",")),
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
    "X-Aviso-Dados": IMPRENSA_AVISO_HEADER,
  })
}

export function assertExportSize(body: string): void {
  if (new TextEncoder().encode(body).byteLength > IMPRENSA_EXPORT_MAX_BYTES) {
    throw new Error("export excede o limite de resposta")
  }
}

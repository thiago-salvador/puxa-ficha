import {
  FEDERAL_ACERVO_SOURCES,
  type FederalAcervoReceipt,
  type FederalAcervoReceipts,
  type FederalAcervoSource,
} from "@/lib/candidate-section-freshness"

type RecordValue = Record<string, unknown>

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function isValidDate(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && Number.isFinite(Date.parse(value))
}

function requiredSourceIds(source: FederalAcervoSource): readonly [string, string] {
  return source === "camara" || source === "jarbas"
    ? [
        "camara-parliamentarian-registry-all-legislatures",
        "camara-parliamentarian-registry-scope-control",
      ]
    : [
        "senado-parliamentarian-registry-all-legislatures",
        "senado-parliamentarian-registry-scope-control",
      ]
}

function officialUrlForSource(source: FederalAcervoSource, rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== "https:") return false
    return source === "camara" || source === "jarbas"
      ? url.hostname === "camara.leg.br" || url.hostname.endsWith(".camara.leg.br")
      : url.hostname === "senado.leg.br" || url.hostname.endsWith(".senado.leg.br")
  } catch {
    return false
  }
}

function projectFederalReceipt(
  source: FederalAcervoSource,
  value: unknown,
): FederalAcervoReceipt | null {
  if (!isRecord(value)) return null
  const sourceIds = Array.isArray(value.source_ids) && value.source_ids.every((item) => typeof item === "string" && item.trim().length > 0)
    ? value.source_ids as string[]
    : []
  const sourceUrls = Array.isArray(value.source_urls) && value.source_urls.every((item) => typeof item === "string" && item.trim().length > 0)
    ? value.source_urls as string[]
    : []
  const requiredIds = requiredSourceIds(source)
  if (
    (value.fonte != null && value.fonte !== source) ||
    value.resultado !== "nao_aplicavel" ||
    !isValidDate(value.executado_em) ||
    !isValidDate(value.verificado_em) ||
    Date.parse(value.verificado_em) > Date.parse(value.executado_em) ||
    typeof value.detalhe !== "string" ||
    value.detalhe.trim().length === 0 ||
    typeof value.escopo !== "string" ||
    value.escopo.trim().length === 0 ||
    sourceIds.length !== 2 ||
    new Set(sourceIds).size !== sourceIds.length ||
    !requiredIds.every((id) => sourceIds.includes(id)) ||
    sourceUrls.length !== sourceIds.length ||
    !sourceUrls.every((url) => officialUrlForSource(source, url)) ||
    (value.url != null && (typeof value.url !== "string" || !officialUrlForSource(source, value.url)))
  ) {
    return null
  }
  return {
    fonte: source,
    resultado: "nao_aplicavel",
    executado_em: value.executado_em,
    verificado_em: value.verificado_em,
    detalhe: value.detalhe,
    escopo: value.escopo,
    source_ids: sourceIds,
    source_urls: sourceUrls,
    url: typeof value.url === "string" ? value.url : null,
  }
}

/**
 * Projeta apenas o recibo estruturado persistido pelo materializador federal.
 * Campos extras são ignorados; fontes incompletas ou provas fora dos domínios
 * oficiais não são promovidas para a ficha pública.
 */
export function projectFederalAcervoReceipts(value: unknown): FederalAcervoReceipts | null {
  if (!isRecord(value)) return null
  const receipts: FederalAcervoReceipts = {}
  for (const source of FEDERAL_ACERVO_SOURCES) {
    const receipt = projectFederalReceipt(source, value[source])
    if (receipt) receipts[source] = receipt
  }
  return Object.keys(receipts).length > 0 ? receipts : null
}

/** Lê a serialização estável emitida pelo recibo federal canônico. */
export function parseFederalAcervoReceiptDetail(
  detail: string | null,
  executedAt: unknown,
): Pick<FederalAcervoReceipt, "detalhe" | "escopo" | "source_ids" | "source_urls" | "verificado_em"> | null {
  if (typeof detail !== "string" || typeof executedAt !== "string") return null
  const scopeMarker = " Escopo: "
  const sourcesMarker = ". Fontes "
  const checkedMarker = "; verificado em "
  const urlsMarker = "; URLs: "
  const readbackMarker = ". Readback obrigatório"
  const scopeStart = detail.indexOf(scopeMarker)
  const sourcesStart = detail.indexOf(sourcesMarker, scopeStart + scopeMarker.length)
  const checkedStart = detail.indexOf(checkedMarker, sourcesStart + sourcesMarker.length)
  const urlsStart = detail.indexOf(urlsMarker, checkedStart + checkedMarker.length)
  const readbackStart = detail.indexOf(readbackMarker, urlsStart + urlsMarker.length)
  if (scopeStart < 0 || sourcesStart < 0 || checkedStart < 0 || urlsStart < 0 || readbackStart < 0) return null
  const escopo = detail.slice(scopeStart + scopeMarker.length, sourcesStart).trim()
  const sourceIds = detail.slice(sourcesStart + sourcesMarker.length, checkedStart).split(",").map((item) => item.trim()).filter(Boolean)
  const checkedAt = detail.slice(checkedStart + checkedMarker.length, urlsStart).trim()
  const sourceUrls = detail.slice(urlsStart + urlsMarker.length, readbackStart).split(" | ").map((item) => item.trim()).filter(Boolean)
  const checkedTimestamp = Date.parse(checkedAt)
  const executedTimestamp = Date.parse(executedAt)
  if (!escopo || sourceIds.length === 0 || sourceUrls.length !== sourceIds.length) return null
  if (!Number.isFinite(checkedTimestamp) || !Number.isFinite(executedTimestamp) || checkedTimestamp > executedTimestamp) return null
  return {
    detalhe: detail.slice(0, scopeStart).trim() || null,
    escopo,
    source_ids: sourceIds,
    source_urls: sourceUrls,
    verificado_em: checkedAt,
  }
}

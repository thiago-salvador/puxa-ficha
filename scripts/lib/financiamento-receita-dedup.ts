import { createHash } from "node:crypto"

import { stripAccents } from "../../src/lib/strip-accents"

export type FinanciamentoReceiptIdentity = {
  ano: number
  uf: string
  sqCandidato: string
}

const GENERATION_FIELDS = new Set([
  "DTGERACAO",
  "HHGERACAO",
  // Legacy 2012/2014 exports expose the generation timestamp as one field.
  "DATAEHORA",
  "DATAHORA",
])
const REDUNDANT_SCOPE_FIELDS = new Set(["CODELEICAO", "DESCELEICAO"])
const RECEIPT_ID_FIELDS = [
  "SQ_RECEITA",
  "NR_RECIBO_DOACAO",
  "NR_DOCUMENTO_DOACAO",
  "Numero Recibo Eleitoral",
  "Número Recibo Eleitoral",
  "Numero do documento",
  "Número do documento",
]
const RECEIPT_PLACEHOLDERS = new Set(["", "N/A", "NA", "NULO", "NULL", "NONE", "SEM RECIBO", "-", "—", "NE", "-1"])
const RECEIPT_DATE_FIELDS = new Set(["DTRECEITA", "DATADARECEITA", "DATARECEITA"])
const FIELD_ALIASES = new Map<string, string>([
  ["SQCANDIDATO", "SQ_CANDIDATO"],
  ["SEQUENCIALCANDIDATO", "SQ_CANDIDATO"],
  ["SQRECEITA", "SQ_RECEITA"],
  ["NRRECIBODOACAO", "SQ_RECEITA"],
  ["NRDOCUMENTODOACAO", "SQ_RECEITA"],
  ["NUMERORECIBOELEITORAL", "SQ_RECEITA"],
  ["NUMERODOCUMENTO", "SQ_RECEITA"],
  ["VRRECEITA", "VR_RECEITA"],
  ["VALORRECEITA", "VR_RECEITA"],
  ["TIPORECEITA", "TP_RECURSO"],
  ["TPRECURSO", "TP_RECURSO"],
  ["DSTITULO", "TP_RECURSO"],
  ["DSRECEITA", "DS_RECEITA"],
  ["DESCRICAODARECEITA", "DS_RECEITA"],
  ["DESCRICAOTIPORECURSO", "DS_RECEITA"],
  ["DSESPRECURSO", "DS_RECEITA"],
  ["NOMEDODOADOR", "NM_DOADOR"],
  ["NODOADOR", "NM_DOADOR"],
  ["NOMEDODOADORRFB", "NM_DOADOR_RFB"],
])

function normalizedFieldName(value: string): string {
  return stripAccents(value).toUpperCase().replace(/[^A-Z0-9]/g, "")
}

function normalizedFieldValue(value: unknown): string {
  return String(value ?? "").normalize("NFC").replace(/\r\n?/g, "\n").trim()
}

function canonicalReceiptDate(value: string, ano?: number): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{2}|\d{4})(?:\s*00:00:00)?$/.exec(value)
  if (!match) return value
  const day = Number(match[1])
  const month = Number(match[2])
  const yearToken = match[3]
  const year = yearToken.length === 2
    ? Number.isInteger(ano) && Math.floor(ano! / 100) * 100 + Number(yearToken) === ano
      ? ano!
      : null
    : Number(yearToken)
  if (year === null) return value
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return value
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`
}

/** Receipt IDs 0, blank and textual placeholders carry no dedupe authority. */
export function isValidFinanciamentoReceiptId(value: unknown): boolean {
  const normalized = normalizedFieldValue(value).toUpperCase()
  const markerFree = stripAccents(normalized).replace(/^#+|#+$/g, "")
  return Boolean(normalized) && !/^0+$/.test(normalized) && !RECEIPT_PLACEHOLDERS.has(normalized) && !RECEIPT_PLACEHOLDERS.has(markerFree)
}

function receiptIdFromRow(row: Record<string, unknown>): string {
  for (const field of RECEIPT_ID_FIELDS) {
    const value = normalizedFieldValue(row[field])
    if (isValidFinanciamentoReceiptId(value)) return value
  }
  return ""
}

/**
 * Hashes all semantic CSV fields in stable key order. Documented generation
 * fields and the legacy election code/description (redundant file-scope
 * metadata) are excluded; private receipt details stay internal to the hash
 * and are never logged or returned as public data.
 */
export function financiamentoReceitaSemanticFingerprint(row: Record<string, unknown>, ano?: number): string {
  const fields = new Map<string, Set<string>>()
  for (const [key, rawValue] of Object.entries(row)) {
    const normalizedKey = normalizedFieldName(key)
    if (
      GENERATION_FIELDS.has(normalizedKey) ||
      REDUNDANT_SCOPE_FIELDS.has(normalizedKey)
    ) continue
    const canonicalKey = FIELD_ALIASES.get(normalizedKey) ?? (RECEIPT_DATE_FIELDS.has(normalizedKey) ? "DT_RECEITA" : normalizedKey)
    const rawValueText = normalizedFieldValue(rawValue)
    // Missing aliases carry no semantic information and should not prevent an
    // otherwise identical row from matching across legacy layouts.
    if (!rawValueText) continue
    const value = canonicalKey === "DT_RECEITA" ? canonicalReceiptDate(rawValueText, ano) : rawValueText
    const values = fields.get(canonicalKey) ?? new Set<string>()
    values.add(value)
    fields.set(canonicalKey, values)
  }
  const semantic = [...fields.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, values]) => [key, [...values].sort()])
  return createHash("sha256").update(JSON.stringify(semantic), "utf8").digest("hex")
}

/**
 * Returns a dedupe key only when the row carries a real receipt identifier.
 * Without that identifier every row remains distinct, including same-candidate
 * rows with blank or placeholder receipt fields.
 */
export function financiamentoReceitaDedupKey(
  row: Record<string, unknown>,
  identity: FinanciamentoReceiptIdentity,
): string | null {
  const receiptId = receiptIdFromRow(row)
  if (!isValidFinanciamentoReceiptId(receiptId)) return null
  return [identity.ano, identity.uf.trim().toUpperCase(), identity.sqCandidato.trim(), receiptId, financiamentoReceitaSemanticFingerprint(row, identity.ano)].join(":")
}

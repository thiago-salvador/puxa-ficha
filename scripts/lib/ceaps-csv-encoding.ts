/**
 * O CSV oficial do CEAPS Senado
 * (`https://www.senado.leg.br/transparencia/LAI/verba/despesa_ceaps_{ano}.csv`)
 * chega como `application/octet-stream` sem charset. Os bytes são ISO-8859-1.
 *
 * `fetch().text()` e `buffer.toString("utf8")` interpretam Latin-1 como UTF-8 e
 * gravam U+FFFD em `TIPO_DESPESA`. Foi assim que alan-rick e mailza-assis
 * publicaram "Divulga��o da atividade parlamentar". Cleitinho tem os mesmos
 * rótulos, lidos em Latin-1, e o acento sai inteiro.
 */

import {
  detectPublicTextEncodingArtifacts,
  REPLACEMENT_CHAR,
} from "../../src/lib/public-text-encoding"

export { REPLACEMENT_CHAR }

export function textoTemReplacement(value: string): boolean {
  return value.includes(REPLACEMENT_CHAR)
}

export function assertSemReplacementChar(value: string, origem: string): void {
  const artifacts = detectPublicTextEncodingArtifacts(value)
  if (artifacts.replacement || artifacts.c1Control || artifacts.mojibake) {
    throw new Error(`${origem}: texto publico com encoding inseguro (U+FFFD=${artifacts.replacement}, C1=${artifacts.c1Control}, mojibake=${artifacts.mojibake})`)
  }
}

export function decodeCeapsCsv(buffer: Buffer): string {
  const utf8 = buffer.toString("utf8")
  // The endpoint is labelled Latin-1 in older metadata, but published bytes
  // contain Windows-1252 punctuation (for example 0x93/0x94). Decode those
  // bytes as Windows-1252 instead of exposing C1 control characters.
  const hasC1 = /[\u0080-\u009f]/.test(utf8)
  const texto = textoTemReplacement(utf8) || hasC1 ? new TextDecoder("windows-1252").decode(buffer) : utf8
  // U+00BF is a valid Windows-1252/Latin-1 character in official supplier
  // names. Keep rejecting lossy replacement bytes, C1 controls and mojibake.
  const artifacts = detectPublicTextEncodingArtifacts(texto)
  if (artifacts.replacement || artifacts.c1Control || artifacts.mojibake) {
    throw new Error(`ceaps-csv: recusando texto publico com artefato de encoding (U+FFFD=${artifacts.replacement}, C1=${artifacts.c1Control}, mojibake=${artifacts.mojibake})`)
  }
  return texto
}

/** Rejoins the Senate CSV's exact wrapped thousands-group amount shape. */
export function normalizeCeapsCsvAmount(value: string): string {
  return value.trim().replace(/^(-?\d{1,3})\r\n(\d{3},\d{2})$/, "$1.$2")
}

/** Parses the Senate's semicolon CSV while tolerating literal quotes inside unquoted fields. */
export function parseCeapsCsvRecords(text: string): { header: string[]; rows: Record<string, string>[] } {
  const source = text.replace(/^\uFEFF/, "")
  const records: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  let fieldStarted = false
  for (let i = 0; i < source.length; i++) {
    const char = source[i]!
    const next = source[i + 1]
    if (quoted) {
      if (char === '"') {
        if (next === '"') { field += '"'; i++ }
        else if (next === ";" || next === "\n" || next === "\r" || next === undefined) quoted = false
        else field += char
      } else field += char
      continue
    }
    if (char === '"' && !fieldStarted && field.length === 0) { quoted = true; fieldStarted = true; continue }
    if (char === ";") { row.push(field); field = ""; fieldStarted = false; continue }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && next === "\n") i++
      row.push(field)
      if (row.some((value) => value.trim() !== "")) records.push(row)
      row = []; field = ""; fieldStarted = false; continue
    }
    field += char
    if (!/\s/.test(char)) fieldStarted = true
  }
  if (quoted) throw new Error("CSV CEAPS terminou dentro de campo entre aspas")
  if (field.length > 0 || row.length > 0) { row.push(field); if (row.some((value) => value.trim() !== "")) records.push(row) }
  if (records.length < 2) throw new Error("CSV CEAPS sem cabeçalho ou registros")
  const header = records[1]!.map((value) => value.trim())
  if (header.some((value) => value === "") || new Set(header).size !== header.length) throw new Error("CSV CEAPS com cabeçalho inválido")
  const rows: Record<string, string>[] = []
  const dateIndex = header.indexOf("DATA")
  const amountIndex = header.indexOf("VALOR_REEMBOLSADO")
  const nameIndex = header.indexOf("SENADOR")
  const yearIndex = header.indexOf("ANO")
  const monthIndex = header.indexOf("MES")
  const optionalBlankColumns = ["CNPJ_CPF", "DOCUMENTO", "DATA", "DETALHAMENTO"].map((column) => header.indexOf(column)).filter((index) => index >= 0)
  const plausibleMoney = (value: string) => /^-?(?:(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{0,2})?|,\d{1,2})$/.test(value.trim())
  const plausibleDate = (value: string) => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value.trim())
  const plausibleDocument = (value: string) => !plausibleDate(value)
  for (const [recordIndex, original] of records.slice(2).entries()) {
    let values = original
    if (values.length === header.length - 1) {
      const candidates = optionalBlankColumns.flatMap((index) => {
        const trial = [...values]
        trial.splice(index, 0, "")
        const month = Number(trial[monthIndex])
        const rawIdentity = values[header.indexOf("CNPJ_CPF")] ?? ""
        const normalizedIdentity = rawIdentity.replace(/\D/g, "")
        const optionalColumn = header[index]
        const identityPositionPlausible = optionalColumn === "CNPJ_CPF"
          ? !/^\d{11,14}$/.test(normalizedIdentity)
          : /^\d{11,14}$/.test(normalizedIdentity)
        const datePositionPlausible = index === dateIndex
          ? !(trial[dateIndex] ?? "").trim()
          : plausibleDate(trial[dateIndex] ?? "")
        const documentPositionPlausible = index === dateIndex
          ? plausibleDocument(trial[header.indexOf("DOCUMENTO")] ?? "")
          : true
        return identityPositionPlausible && /^\d{4}$/.test(trial[yearIndex] ?? "") && Number.isInteger(month) && month >= 1 && month <= 12 && Boolean(trial[nameIndex]?.trim()) && datePositionPlausible && documentPositionPlausible && plausibleMoney(trial[amountIndex] ?? "") ? [{ index, values: trial }] : []
      })
      if (candidates.length !== 1) throw new Error(`CSV CEAPS com coluna opcional ausente ambígua no registro ${recordIndex + 1} (${values.length}/${header.length}; candidatos: ${candidates.map(({ index }) => header[index]).join(",") || "nenhum"})`)
      values = candidates[0]!.values
    }
    if (values.length !== header.length) throw new Error(`CSV CEAPS com quantidade de colunas inválida (${values.length}/${header.length})`)
    rows.push(Object.fromEntries(header.map((name, index) => [name, values[index]!.trim()])))
  }
  return { header, rows }
}

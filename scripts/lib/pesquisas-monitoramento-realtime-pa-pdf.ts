import "server-only"

import type { CenarioRealTime } from "./pesquisas-monitoramento-realtime-cenarios"
import type { RelatorioRealTimePdf } from "./pesquisas-monitoramento-realtime-pdf"

const MONTHS: Record<string, string> = {
  JANEIRO: "01", FEVEREIRO: "02", MARÇO: "03", MARCO: "03", ABRIL: "04", MAIO: "05", JUNHO: "06",
  JULHO: "07", AGOSTO: "08", SETEMBRO: "09", OUTUBRO: "10", NOVEMBRO: "11", DEZEMBRO: "12",
}

function fail(detail: string): never {
  throw new Error(`Real Time PA PDF: ${detail}`)
}

function date(day: string, month: string): string {
  const normalizedMonth = MONTHS[month.toLocaleUpperCase("pt-BR")]
  if (!normalizedMonth) fail("mês inválido")
  const value = `2026-${normalizedMonth}-${day.padStart(2, "0")}`
  const parsed = new Date(`${value}T00:00:00Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail("data inválida")
  return value
}

function normalizeLabel(raw: string): string {
  const label = raw.replace(/\s+/g, " ").trim()
  if (/^Dr\s+Daniel$/i.test(label)) return "Dr. Daniel"
  if (/^NS\s*\/\s*NR$/i.test(label) || /^Não sabe\s*\/\s*não respondeu$/i.test(label)) return "NS / NR"
  if (/^Nulo\s*\/\s*Branco$/i.test(label)) return "Nulo/Branco"
  return label
}

function canonicalPublishedLabel(raw: string): string {
  const pair = raw.match(/^(.+?)\s+\(([^()]+)\)$/)
  if (!pair) return raw
  const title = (value: string) => value.toLocaleLowerCase("pt-BR").replace(/(^|\s)\p{L}/gu, (letter) => letter.toLocaleUpperCase("pt-BR"))
  const party = pair[2].length <= 4 ? pair[2].toLocaleUpperCase("pt-BR") : title(pair[2])
  return `${title(pair[1])} (${party})`
}

function assertRows(rows: Array<{ raw_label: string; value_percent: number }>, section: string): Array<{ raw_label: string; value_percent: number }> {
  if (rows.length < 4 || new Set(rows.map((row) => row.raw_label)).size !== rows.length) fail(`${section}: lista duplicada ou incompleta`)
  if (rows.some((row) => row.value_percent < 0 || row.value_percent > 100) || Math.abs(rows.reduce((sum, row) => sum + row.value_percent, 0) - 100) > 0.5) fail(`${section}: percentuais inválidos`)
  if (!rows.some((row) => row.raw_label === "Nulo/Branco") || !rows.some((row) => row.raw_label === "NS / NR")) fail(`${section}: categorias ausentes`)
  if (rows.filter((row) => !["Outros", "Nulo/Branco", "NS / NR"].includes(row.raw_label)).length < 2) fail(`${section}: candidatos ausentes`)
  return rows
}

function resultRows(page: string, section: "espontanea" | "estimulada"): Array<{ raw_label: string; value_percent: number }> {
  const lines = page.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const question = lines.findIndex((line) => line.includes("QUEM O (A) SENHOR"))
  if (question < 0) fail(`${section}: pergunta ausente`)
  const rows: Array<{ raw_label: string; value_percent: number }> = []
  for (const sourceLine of lines.slice(question + 1)) {
    const line = sourceLine.split(/\s+OS CANDIDATOS\b/i, 1)[0].trim()
    const match = line.match(/^(.+?)\s+(\d+(?:[,.]\d+)?)%/)
    if (match) {
      const raw_label = normalizeLabel(match[1])
      if (/^(?:0|5|10|15|20|25|30|35|40|45|50|60|70)%/i.test(raw_label) || /^(?:CENÁRIO|PERFIL|GÊNERO|IDADE|RENDA)/i.test(raw_label)) continue
      if (!/[\p{L}]/u.test(raw_label)) fail(`${section}: rótulo inválido`)
      rows.push({ raw_label, value_percent: Number(match[2].replace(",", ".")) })
      continue
    }
    if (/^(?:OS CANDIDATOS|WELL MACEDO|GAL LEITE|JOSÉ MOITA|SOMADOS|[\d%.,\s]+$)/i.test(line) || /^(?:EM OUTUBRO|QUEM O \(A\) SENHOR|CENÁRIO)/i.test(line)) continue
    fail(`${section}: linha de resposta não reconhecida`)
  }
  if (rows.length === 0) fail(`${section}: nenhum resultado`)
  return assertRows(rows, section)
}

function literalQuestion(page: string, endPattern: RegExp): string {
  const lines = page.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const questionLines = lines.filter((line) => line.includes("QUEM O (A) SENHOR"))
  if (questionLines.length !== 1) fail("pergunta duplicada ou ausente")
  const questionLine = lines.findIndex((line) => line.includes("QUEM O (A) SENHOR"))
  const contextLine = lines.findIndex((line, index) => index < questionLine && /^EM OUTUBRO TEREMOS ELEIÇÕES/i.test(line))
  const start = contextLine >= 0 ? contextLine : questionLine
  const end = lines.findIndex((line, index) => index > start && endPattern.test(line))
  if (start < 0 || end < 0) fail("pergunta literal ausente")
  return lines.slice(start, end).join(" ")
}

function parseSecondTurn(page: string): CenarioRealTime & { page: number; question: string; notes: string[] } {
  const lines = page.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const question = lines.findIndex((line) => line.includes("QUEM O (A) SENHOR"))
  if (question < 0) fail("segundo turno: pergunta ausente")
  const headerIndex = lines.findIndex((line) => /DR\.\s+DANIEL(?:\s+SANTOS)?\s+\(PODEMOS\).*HANA GHASSAN\s+\(MDB\)/i.test(line))
  if (headerIndex < 0) fail("segundo turno: duelo ausente")
  const header = lines[headerIndex]
  const daniel = header.match(/DR\.\s+DANIEL(?:\s+SANTOS)?\s+\(PODEMOS\)/i)?.[0] ?? ""
  const hana = header.match(/HANA GHASSAN\s+\(MDB\)/i)?.[0] ?? ""
  const valueLine = lines.slice(headerIndex + 1).find((line) => /\d+(?:[,.]\d+)?%.*\d+(?:[,.]\d+)?%/.test(line))
  if (!valueLine) fail("segundo turno: percentuais dos candidatos ausentes")
  const values = [...valueLine.matchAll(/(\d+(?:[,.]\d+)?)%/g)].map((match) => Number(match[1].replace(",", ".")))
  if (values.length !== 2) fail("segundo turno: percentuais conflitantes")
  const rows = [
    { raw_label: canonicalPublishedLabel(daniel), value_percent: values[0] },
    { raw_label: canonicalPublishedLabel(hana), value_percent: values[1] },
    ...lines.slice(headerIndex + 1).flatMap((line) => {
      const match = line.match(/^(NULO\/BRANCO|NÃO SABE \/ NÃO RESPONDEU)\s*:\s*(\d+(?:[,.]\d+)?)%$/i)
      return match ? [{ raw_label: normalizeLabel(match[1]), value_percent: Number(match[2].replace(",", ".")) }] : []
    }),
  ]
  assertRows(rows, "segundo turno")
  return {
    turn: 2,
    mode: "estimulado",
    label: `${canonicalPublishedLabel(hana).replace(/\s+\([^()]+\)$/, "")} x ${canonicalPublishedLabel(daniel).replace(/\s+\([^()]+\)$/, "")}`,
    page: 0,
    question: literalQuestion(page, /^(?:DR\.|HANA GHASSAN)/i),
    notes: [],
    results: rows,
  }
}

function parseDateAndMetadata(header: string): { publication_date: string; fieldwork: { start: string; end: string }; sample_size: number; margin_error_pp: number; confidence_percent: number } {
  if (!/PESQUISA ESTADUAL\s+PARÁ/i.test(header)) fail("escopo estadual do Pará ausente")
  const publication = header.match(/DIVULGAÇÃO:\s*(\d{1,2})\/(\d{1,2})\/(2026)/)
  const sample = header.match(/(\d[\d.]*)\s+ENTREVISTAS/)
  const margin = header.match(/MARGEM DE ERRO:\s*\+\/-\s*(\d+(?:[,.]\d+)?)\s+P\.P\./)
  const confidence = header.match(/ÍNDICE DE CONFIANÇA:\s*(\d+(?:[,.]\d+)?)%/)
  const field = header.match(/DATA DE CAMPO:\s*(\d{1,2})\s+A\s*(\d{1,2})\s+DE\s+([A-ZÇÃ]+)\s+DE\s+2026/i)
  if (!publication || !sample || !margin || !confidence || !field) fail("ficha técnica incompleta")
  const publication_date = `${publication[3]}-${publication[2].padStart(2, "0")}-${publication[1].padStart(2, "0")}`
  const publicationParsed = new Date(`${publication_date}T00:00:00Z`)
  if (!Number.isFinite(publicationParsed.getTime()) || publicationParsed.toISOString().slice(0, 10) !== publication_date) fail("data de divulgação inválida")
  const fieldwork = { start: date(field[1], field[3]), end: date(field[2], field[3]) }
  const sample_size = Number(sample[1].replace(/\./g, ""))
  const margin_error_pp = Number(margin[1].replace(",", "."))
  const confidence_percent = Number(confidence[1].replace(",", "."))
  if (fieldwork.start > fieldwork.end || fieldwork.end > publication_date || !Number.isInteger(sample_size) || sample_size <= 0 || margin_error_pp <= 0 || margin_error_pp > 100 || confidence_percent <= 0 || confidence_percent > 100) fail("metadados fora dos limites")
  return { publication_date, fieldwork, sample_size, margin_error_pp, confidence_percent }
}

export function parseTextoRealTimeParaPdf(text: string, registrationId: string): RelatorioRealTimePdf {
  if (registrationId !== "PA-00415/2026") fail("registro fora do escopo revisado")
  const pages = text.split("\f")
  const header = pages.slice(0, 2).join(" ").replace(/\s+/g, " ")
  const registration = header.match(/PESQUISA REGISTRADA:\s*([A-Z]{2}-\d{5}\/2026)/i)?.[1]
  if (registration !== registrationId) fail("registro ausente ou conflitante")
  const metadata = parseDateAndMetadata(header)
  const sections = [
    { key: "espontanea" as const, heading: "ESPONTÂNEA GOVERNADOR" },
    { key: "estimulada" as const, heading: "ESTIMULADA GOVERNADOR" },
    { key: "segundo" as const, heading: "SEGUNDO TURNO" },
  ].map((section) => {
    const matches = pages.flatMap((page, index) => page.includes(section.heading) ? [index] : [])
    if (matches.length !== 1) fail(`${section.key}: seção duplicada ou ausente`)
    const index = matches[0]
    if (!pages[index + 1]) fail(`${section.key}: página de resultados ausente`)
    return { ...section, index, page: pages[index + 1] }
  })
  if (!(sections[0].index < sections[1].index && sections[1].index < sections[2].index)) fail("inventário de seções fora de ordem")
  const spontaneous = { turn: 1 as const, mode: "espontaneo" as const, label: "Espontânea governador", page: sections[0].index + 2, question: literalQuestion(sections[0].page, /^(?:[\p{L}].*?)\s+\d+(?:[,.]\d+)?%/u), notes: [] as string[], results: resultRows(sections[0].page, "espontanea") }
  const stimulated = { turn: 1 as const, mode: "estimulado" as const, label: "Estimulada governador: cenário 1", page: sections[1].index + 2, question: literalQuestion(sections[1].page, /^(?:[\p{L}].*?)\s+\d+(?:[,.]\d+)?%/u), notes: [] as string[], results: resultRows(sections[1].page, "estimulada") }
  const note = sections[1].page.replace(/\s+/g, " ").match(/OS CANDIDATOS\s+(.+?\([^)]+\)\s*\/\s*.+?\([^)]+\)\s*\/\s*.+?\([^)]+\))(?:\s+Nulo\/Branco\s+\d+%)?\s+SOMADOS\s+ATINGIRAM\s+(\d+(?:[,.]\d+)?)%\.?/i)
  if (!note) fail("estimulada: nota de agrupamento ausente")
  const groupedPercent = Number(note[2].replace(",", "."))
  const groupedRow = stimulated.results.find((row) => row.raw_label === "Outros")
  if (!groupedRow || groupedRow.value_percent !== groupedPercent) fail("estimulada: nota de agrupamento conflitante")
  stimulated.notes.push(`OS CANDIDATOS ${note[1].replace(/\s+/g, " ").trim()} SOMADOS ATINGIRAM ${note[2].replace(",", ".")}%.`)
  const second = parseSecondTurn(sections[2].page)
  second.page = sections[2].index + 2
  const scenarios = [spontaneous, stimulated, second]
  if (scenarios.filter((scenario) => scenario.turn === 1 && scenario.mode === "espontaneo").length !== 1
    || scenarios.filter((scenario) => scenario.turn === 1 && scenario.mode === "estimulado").length !== 1
    || scenarios.filter((scenario) => scenario.turn === 2).length !== 1) fail("inventário de cenários incompleto")
  return { registration_id: registrationId, geography_code: "PA", office: "Governador", ...metadata, scenarios }
}

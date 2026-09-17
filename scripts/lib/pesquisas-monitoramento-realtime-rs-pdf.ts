import "server-only"

import type { CenarioRealTime } from "./pesquisas-monitoramento-realtime-cenarios"

export const RELATORIO_RS_URL = "https://static.poder360.com.br/uploads/2026/08/Rio-Grande-do-Sul-RS-09640-2026.pdf"
export const RELATORIO_RS_SHA256 = "a0af8ce066bb357cce179cf1349f46e1a19a7813e0332e136114d177c9410ea8"

type Scenario = CenarioRealTime & { page: number; question: string | null; notes: string[] }

function fail(detail: string): never {
  throw new Error(`Real Time RS PDF: ${detail}`)
}

function normalizeLabel(raw: string): string {
  const label = raw.replace(/\s+/g, " ").trim()
  if (/^Nulo\s*\/\s*Branco$/i.test(label)) return "Nulo/Branco"
  if (/^(?:NS\s*\/\s*NR|Não\s+sabe\s*\/\s*não\s+respondeu)$/i.test(label)) return "NS / NR"
  return label
}

function parseRows(page: string, section: string): Array<{ raw_label: string; value_percent: number }> {
  const rows: Array<{ raw_label: string; value_percent: number }> = []
  const lines = page.split(/\r?\n/).map((line) => line.trim())
  const marker = lines.findIndex((line) => line.includes("CENÁRIO") || /^EM OUTUBRO TEREMOS ELEIÇÕES/i.test(line))
  if (marker < 0) fail(`${section}: início da lista ausente`)
  const start = /^EM OUTUBRO TEREMOS ELEIÇÕES/i.test(lines[marker])
    ? lines.findIndex((line, index) => index >= marker && line.includes("?")) + 1
    : marker + 1
  const end = lines.findIndex((line, index) => index >= start && /^[\d%.,\s]+$/.test(line))
  const resultLines = lines.slice(start, end < 0 ? lines.length : end).filter(Boolean)
  for (const sourceLine of resultLines) {
    const match = sourceLine.match(/^(.+?)\s+(\d+(?:[,.]\d+)?)%(?:\s+.*)?$/)
    if (!match || !/[\p{L}]/u.test(match[1])) fail(`${section}: linha de resposta não reconhecida`)
    const raw_label = normalizeLabel(match[1])
    const value_percent = Number(match[2].replace(",", "."))
    if (!Number.isFinite(value_percent) || value_percent < 0 || value_percent > 100) fail(`${section}: percentual inválido`)
    rows.push({ raw_label, value_percent })
  }
  const expectedRows = section === "espontâneo" ? 8 : section === "estimulado" ? 7 : 4
  if (rows.length !== expectedRows || new Set(rows.map((row) => row.raw_label)).size !== rows.length) fail(`${section}: lista duplicada ou incompleta`)
  if (Math.abs(rows.reduce((sum, row) => sum + row.value_percent, 0) - 100) > rows.length * 0.5) fail(`${section}: percentuais não somam 100%`)
  if (!rows.some((row) => row.raw_label === "Nulo/Branco") || !rows.some((row) => row.raw_label === "NS / NR")) fail(`${section}: categorias ausentes`)
  const candidates = rows.filter((row) => !/^(Outros|Nulo\/Branco|NS \/ NR)$/.test(row.raw_label))
  if (candidates.length < 2 || (section.startsWith("segundo") && candidates.length !== 2)) fail(`${section}: candidatos ausentes`)
  return rows
}

function questionFrom(page: string): string {
  const lines = page.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const start = lines.findIndex((line) => /^EM OUTUBRO TEREMOS ELEIÇÕES/i.test(line))
  if (start < 0) fail("pergunta literal ausente")
  const end = lines.findIndex((line, index) => index >= start && line.includes("?"))
  if (end < 0) fail("pergunta literal incompleta")
  return lines.slice(start, end + 1).join(" ")
}

function stripParty(label: string): string {
  return label.replace(/\s+\([^()]+\)$/, "")
}

function metadata(front: string): { publication_date: string; fieldwork: { start: string; end: string }; sample_size: number; margin_error_pp: number; confidence_percent: number } {
  const registration = front.match(/PESQUISA\s+REGISTRADA:\s*RS-09640\/2026/i)
  const publication = front.match(/DIVULGAÇÃO:\s*(\d{1,2})\/(\d{1,2})\/(2026)/i)
  const sample = front.match(/(\d[\d.]*)\s+ENTREVISTAS/i)
  const margin = front.match(/MARGEM DE ERRO:\s*\+\/-\s*(\d+(?:[,.]\d+)?)\s+P\.P\./i)
  const confidence = front.match(/ÍNDICE DE CONFIANÇA:\s*(\d+(?:[,.]\d+)?)%/i)
  const field = front.match(/DATA DE CAMPO:\s*(\d{1,2})\s+A\s*(\d{1,2})\s+DE\s+AGOSTO\s+DE\s+2026/i)
  if (!registration || !publication || !sample || !margin || !confidence || !field || !/UNIVERSO:\s*ELEITORES DO ESTADO DO RIO GRANDE DO SUL/i.test(front)) fail("ficha técnica incompleta ou fora do escopo")
  const publication_date = `2026-${publication[2].padStart(2, "0")}-${publication[1].padStart(2, "0")}`
  const fieldwork = { start: `2026-08-${field[1].padStart(2, "0")}`, end: `2026-08-${field[2].padStart(2, "0")}` }
  const dates = [publication_date, fieldwork.start, fieldwork.end]
  if (dates.some((value) => {
    const parsed = new Date(`${value}T00:00:00Z`)
    return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value
  }) || fieldwork.start > fieldwork.end || fieldwork.end > publication_date) fail("datas inválidas")
  const sample_size = Number(sample[1].replaceAll(".", ""))
  const margin_error_pp = Number(margin[1].replace(",", "."))
  const confidence_percent = Number(confidence[1].replace(",", "."))
  if (!Number.isInteger(sample_size) || sample_size <= 0 || margin_error_pp <= 0 || confidence_percent <= 0 || confidence_percent > 100) fail("metadados fora dos limites")
  return { publication_date, fieldwork, sample_size, margin_error_pp, confidence_percent }
}

export function parseTextoRealTimeRsPdf(text: string, registrationId: string): {
  registration_id: string
  geography_code: "RS"
  office: "Governador"
  publication_date: string
  fieldwork: { start: string; end: string }
  sample_size: number
  margin_error_pp: number
  confidence_percent: number
  scenarios: Scenario[]
} {
  if (registrationId !== "RS-09640/2026") fail("registro fora do escopo revisado")
  const pages = text.split("\f")
  const front = pages.slice(0, 2).join(" ").replace(/\s+/g, " ")
  const registrations = [...new Set(text.match(/\b[A-Z]{2}-\d{5}\/2026\b/g) ?? [])]
  if (registrations.length !== 1 || registrations[0] !== registrationId) fail("registro ausente ou conflitante")
  const parsed = metadata(front)
  const heading = (value: string) => pages.flatMap((page, index) => page.trim() === value ? [index] : [])
  const spontaneousHeading = heading("ESPONTÂNEA GOVERNADOR")
  const stimulatedHeading = heading("ESTIMULADA GOVERNADOR")
  const runoffHeadings = pages.flatMap((page, index) => /^SEGUNDO TURNO(?:\s|$)/.test(page.trim()) ? [index] : [])
  if (spontaneousHeading.length !== 1 || stimulatedHeading.length !== 1 || runoffHeadings.length !== 4) fail("seções duplicadas ou ausentes")
  if (!(spontaneousHeading[0] < stimulatedHeading[0] && stimulatedHeading[0] < runoffHeadings[0])) fail("ordem das seções inválida")

  const spontaneousPage = pages[spontaneousHeading[0] + 1]
  const stimulatedPage = pages[stimulatedHeading[0] + 1]
  if (!spontaneousPage || !stimulatedPage) fail("página de primeiro turno ausente")
  const spontaneous: Scenario = {
    turn: 1, mode: "espontaneo", label: "Primeiro turno espontâneo", page: spontaneousHeading[0] + 2,
    question: questionFrom(spontaneousPage), notes: [], results: parseRows(spontaneousPage, "espontâneo"),
  }
  const stimulated: Scenario = {
    turn: 1, mode: "estimulado", label: "Primeiro turno estimulado", page: stimulatedHeading[0] + 2,
    question: questionFrom(stimulatedPage), notes: [], results: parseRows(stimulatedPage, "estimulado"),
  }
  const runoffs: Scenario[] = runoffHeadings.slice(1).map((sectionIndex, index) => {
    const page = pages[sectionIndex]
    if (!page || !page.includes(`CENÁRIO ${String(index + 1).padStart(2, "0")}`)) fail(`segundo turno: cenário ${index + 1} ausente`)
    const results = parseRows(page, `segundo turno ${index + 1}`)
    const candidates = results.filter((row) => !/^(Outros|Nulo\/Branco|NS \/ NR)$/.test(row.raw_label))
    return {
      turn: 2, mode: "estimulado", label: `${stripParty(candidates[0].raw_label)} x ${stripParty(candidates[1].raw_label)}`,
      page: sectionIndex + 1, question: null, notes: [], results,
    }
  })
  if (runoffs.length !== 3) fail("segundo turno: quantidade de cenários incompleta")
  return { registration_id: registrationId, geography_code: "RS", office: "Governador", ...parsed, scenarios: [spontaneous, stimulated, ...runoffs] }
}

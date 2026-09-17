import "server-only"

import type { CenarioRealTime } from "./pesquisas-monitoramento-realtime-cenarios"

export const RELATORIO_MS_URL = "https://static.poder360.com.br/uploads/2026/08/Mato-Grosso-do-Sul-MS-07706_2026-AGO26-2.pdf"
export const RELATORIO_MS_SHA256 = "f4d9b32f5a722e33875781bd5045cf98f6e094b20a18ab4f055cab7a97dfccf0"

type Scenario = CenarioRealTime & { page: number; question: string | null; notes: string[] }

function fail(detail: string): never {
  throw new Error(`Real Time MS PDF: ${detail}`)
}

function normalizeLabel(raw: string): string {
  const label = raw.replace(/\s+/g, " ").trim()
  if (/^Nulo\s*\/\s*Branco$/i.test(label)) return "Nulo/Branco"
  if (/^(?:NS\s*\/\s*NR|Não\s+sabe\s*\/\s*não\s+respondeu)$/i.test(label)) return "NS / NR"
  return label
}

function parseRows(page: string, section: "espontâneo" | "estimulado"): Array<{ raw_label: string; value_percent: number }> {
  const lines = page.split(/\r?\n/).map((line) => line.trim())
  const questionEnd = lines.findIndex((line) => line.includes("?"))
  if (questionEnd < 0) fail(`${section}: pergunta não encontrada antes da lista`)
  const end = lines.findIndex((line, index) => index > questionEnd && /^[\d%.,\s]+$/.test(line))
  const resultLines = lines.slice(questionEnd + 1, end < 0 ? lines.length : end).filter(Boolean)
  const rows: Array<{ raw_label: string; value_percent: number }> = []
  for (const sourceLine of resultLines) {
    const match = sourceLine.match(/^(.+?)\s+(\d+(?:[,.]\d+)?)%(?:\s+.*)?$/)
    if (!match || !/[\p{L}]/u.test(match[1])) fail(`${section}: linha de resposta não reconhecida`)
    const value_percent = Number(match[2].replace(",", "."))
    if (!Number.isFinite(value_percent) || value_percent < 0 || value_percent > 100) fail(`${section}: percentual inválido`)
    rows.push({ raw_label: normalizeLabel(match[1]), value_percent })
  }
  const expectedRows = section === "espontâneo" ? 7 : 8
  if (rows.length !== expectedRows || new Set(rows.map((row) => row.raw_label)).size !== rows.length) fail(`${section}: lista duplicada ou incompleta`)
  if (rows.reduce((sum, row) => sum + row.value_percent, 0) !== 100) fail(`${section}: percentuais não somam 100%`)
  if (!rows.some((row) => row.raw_label === "Nulo/Branco") || !rows.some((row) => row.raw_label === "NS / NR")) fail(`${section}: categorias ausentes`)
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

function metadata(front: string): { publication_date: string; fieldwork: { start: string; end: string }; sample_size: number; margin_error_pp: number; confidence_percent: number } {
  const registration = front.match(/PESQUISA\s+REGISTRADA:\s*MS-07706\/2026/i)
  const publication = front.match(/DIVULGAÇÃO:\s*(\d{1,2})\/(\d{1,2})\/(2026)/i)
  const sample = front.match(/(\d[\d.]*)\s+ENTREVISTAS/i)
  const margin = front.match(/MARGEM\s+DE\s+ERRO:\s*\+\/[-−]\s*(\d+(?:[,.]\d+)?)\s+P\.P\./i)
  const confidence = front.match(/ÍNDICE\s+DE\s+CONFIANÇA:\s*(\d+(?:[,.]\d+)?)%/i)
  const field = front.match(/DATA\s+DE\s+CAMPO:\s*(\d{1,2})\s+A\s*(\d{1,2})\s+DE\s+AGOSTO\s+DE\s+2026/i)
  if (!registration || !publication || !sample || !margin || !confidence || !field || !/UNIVERSO:\s*ELEITORES DO ESTADO DO MATO GROSSO DO SUL/i.test(front)) fail("ficha técnica incompleta ou fora do escopo")
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

function parseRunoff(page: string): Array<{ raw_label: string; value_percent: number }> {
  const candidates = page.match(/EDUARDO RIEDEL \(PP\)[\s\S]{0,260}?\s(\d+(?:[,.]\d+)?)%\s+\s*(\d+(?:[,.]\d+)?)%/)
  if (!candidates) fail("segundo turno: candidatos ou percentuais ausentes")
  const percentAfter = (label: string): number => {
    const start = page.indexOf(label)
    if (start < 0) fail(`segundo turno: rótulo ausente (${label})`)
    const value = page.slice(start + label.length, start + label.length + 80).match(/(\d+(?:[,.]\d+)?)%/)
    if (!value) fail(`segundo turno: percentual ausente (${label})`)
    return Number(value[1].replace(",", "."))
  }
  const rows = [
    { raw_label: "Eduardo Riedel (PP)", value_percent: Number(candidates[1].replace(",", ".")) },
    { raw_label: "Fábio Trad (PT)", value_percent: Number(candidates[2].replace(",", ".")) },
    { raw_label: "Nulo/Branco", value_percent: percentAfter("NULO/BRANCO:") },
    { raw_label: "NS / NR", value_percent: percentAfter("NÃO SABE / NÃO RESPONDEU:") },
  ]
  if (rows.reduce((sum, row) => sum + row.value_percent, 0) !== 100) fail("segundo turno: percentuais não somam 100%")
  return rows
}

export function parseTextoRealTimeMsPdf(text: string, registrationId: string): {
  registration_id: string
  geography_code: "MS"
  office: "Governador"
  publication_date: string
  fieldwork: { start: string; end: string }
  sample_size: number
  margin_error_pp: number
  confidence_percent: number
  scenarios: Scenario[]
} {
  if (registrationId !== "MS-07706/2026") fail("registro fora do escopo revisado")
  const pages = text.split("\f")
  const front = pages.slice(0, 2).join(" ").replace(/\s+/g, " ")
  const registrations = [...new Set(text.match(/\b[A-Z]{2}-\d{5}\/2026\b/g) ?? [])]
  if (registrations.length !== 1 || registrations[0] !== registrationId) fail("registro ausente ou conflitante")
  const parsed = metadata(front)
  const heading = (value: string) => pages.flatMap((page, index) => page.trim() === value ? [index] : [])
  const spontaneousHeading = heading("ESPONTÂNEA GOVERNADOR")
  const stimulatedHeading = heading("ESTIMULADA GOVERNADOR")
  const runoffHeading = pages.flatMap((page, index) => /^CENÁRIO 01 - SEGUNDO TURNO(?:\s|$)/.test(page.trim()) ? [index] : [])
  if (spontaneousHeading.length !== 1 || stimulatedHeading.length !== 1 || runoffHeading.length !== 1) fail("seções duplicadas ou ausentes")
  if (!(spontaneousHeading[0] < stimulatedHeading[0] && stimulatedHeading[0] < runoffHeading[0])) fail("ordem das seções inválida")
  const spontaneousPage = pages[spontaneousHeading[0] + 1]
  const stimulatedPage = pages[stimulatedHeading[0] + 1]
  const runoffPage = pages[runoffHeading[0]]
  if (!spontaneousPage || !stimulatedPage || !runoffPage) fail("página de cenário ausente")
  const spontaneous: Scenario = {
    turn: 1, mode: "espontaneo", label: "Primeiro turno espontâneo", page: spontaneousHeading[0] + 2,
    question: questionFrom(spontaneousPage), notes: [], results: parseRows(spontaneousPage, "espontâneo"),
  }
  const stimulated: Scenario = {
    turn: 1, mode: "estimulado", label: "Primeiro turno estimulado", page: stimulatedHeading[0] + 2,
    question: questionFrom(stimulatedPage), notes: [], results: parseRows(stimulatedPage, "estimulado"),
  }
  const runoff: Scenario = {
    turn: 2, mode: "estimulado", label: "Eduardo Riedel x Fábio Trad", page: runoffHeading[0] + 1,
    question: null, notes: [], results: parseRunoff(runoffPage),
  }
  return { registration_id: registrationId, geography_code: "MS", office: "Governador", ...parsed, scenarios: [spontaneous, stimulated, runoff] }
}

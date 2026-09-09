import "server-only"

import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"

export interface CenarioDocumentoPoderData {
  turn: 1 | 2
  label: string
  question: string
  page: number
  results: Array<{ raw_label: string; value_percent: number }>
}

export interface DocumentoPoderData {
  url: string
  observed_at: string
  evidence_sha256: string
  registration_id: string
  fieldwork: { start: string; end: string }
  sample_size: number
  margin_error_pp: number
  confidence_percent: number
  scenarios: CenarioDocumentoPoderData[]
}

export function descobrirRelatorioPoderData(html: string): string {
  const safe = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
  const urls = [...new Set([...safe.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
    .filter((match) => match[2].replace(/<[^>]*>/g, " ").trim().toLocaleLowerCase("pt-BR") === "íntegra")
    .map((match) => match[1])
    .filter((url) => /^https:\/\/static\.poder360\.com\.br\/(?:uploads\/)?2026\/\d{2}\/[^?#]+\.pdf$/.test(url)))]
  if (urls.length !== 1) throw new Error("PoderData: relatório integral ausente ou ambíguo")
  return urls[0]
}

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** Extract the dated table below each national voting-intention chart, never subgroup columns. */
export function parseTextoPoderData(text: string, registrationId: string): Omit<DocumentoPoderData, "url" | "observed_at" | "evidence_sha256"> {
  const pages = text.split("\f")
  const registrations = [...new Set(text.match(/\bBR-\d{5}\/2026\b/g) ?? [])]
  if (registrations.length !== 1 || registrations[0] !== registrationId) throw new Error("PoderData PDF: registro conflitante")
  const front = pages.slice(0, 2).join(" ").replace(/\s+/g, " ")
  const field = front.match(/(\d{1,2}) a (\d{1,2}) de (\p{L}+) de 2026/u)
  const sample = front.match(/([\d.]+) entrevistas/i)
  const margin = front.match(/\+\/-\s*(\d+(?:[,.]\d+)?) p\.p\./i)
  const confidence = front.match(/confiança de (\d+)%/i)
  const month = MONTHS.indexOf(field?.[3].toLocaleLowerCase("pt-BR") ?? "") + 1
  if (!field || !sample || !margin || !confidence || month === 0) throw new Error("PoderData PDF: ficha técnica incompleta")
  const date = (day: string) => `2026-${String(month).padStart(2, "0")}-${day.padStart(2, "0")}`
  const fieldwork = { start: date(field[1]), end: date(field[2]) }
  if ([fieldwork.start, fieldwork.end].some((value) => !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) || fieldwork.start > fieldwork.end) {
    throw new Error("PoderData PDF: período inválido")
  }
  const lastColumn = `${Number(field[2])}-${SHORT_MONTHS[month - 1]}`
  const scenarios: CenarioDocumentoPoderData[] = []
  for (const [index, page] of pages.entries()) {
    const lines = page.trim().split(/\r?\n/)
    const turnMatch = lines[0]?.trim().match(/^Intenção de voto no ([12])º turno$/)
    if (!turnMatch) continue
    // Cross-tab pages have a demographic label rather than the survey question.
    const questionStart = lines.findIndex((line) => /^\s*(?:Em outubro teremos eleição para presidente|E se houver um 2º turno entre)/.test(line))
    if (questionStart < 0) continue
    const question = lines.slice(questionStart, questionStart + 4).join(" ").replace(/\s+/g, " ").match(/^.*?\?/)?.[0]?.trim()
    if (!question) throw new Error("PoderData PDF: pergunta incompleta")
    const columnsIndex = lines.findIndex((line) => /\b\d{1,2}-[A-Z][a-z]{2}\b/.test(line))
    const columns = columnsIndex >= 0 ? lines[columnsIndex].trim().split(/\s+/) : []
    if (!columns.length || columns.at(-1) !== lastColumn || columns.some((column) => !/^\d{1,2}-[A-Z][a-z]{2}$/.test(column))) {
      throw new Error("PoderData PDF: coluna de resultados não corresponde ao campo atual")
    }
    const table = lines.slice(columnsIndex + 1)
    const footer = table.findIndex((line) => /Pesquisa realizada|Copyright/.test(line))
    if (footer < 0) throw new Error("PoderData PDF: limite da tabela ausente")
    const rows = table.slice(0, footer).filter((line) => line.trim())
    const results = rows.map((line) => {
      const match = line.trim().match(/^(.+?)\s{2,}([\d.,%\s]+)$/)
      const values = match?.[2].trim().split(/\s+/) ?? []
      if (!match || values.length !== columns.length || values.some((value) => !/^\d+(?:[,.]\d+)?%?$/.test(value))) throw new Error("PoderData PDF: linha de resultados incompleta")
      const value = Number(values.at(-1)!.replace("%", "").replace(",", "."))
      if (value < 0 || value > 100) throw new Error("PoderData PDF: percentual inválido")
      return { raw_label: match[1].trim(), value_percent: value }
    })
    if (results.length < 2 || new Set(results.map((row) => row.raw_label)).size !== results.length
      || Math.abs(results.reduce((sum, row) => sum + row.value_percent, 0) - 100) > results.length * 0.5) {
      throw new Error("PoderData PDF: cenário incompleto ou duplicado")
    }
    const turn = Number(turnMatch[1]) as 1 | 2
    if (turn === 2) {
      const names = question.match(/entre (.+?) e (.+?), em quem você votaria\?/)?.slice(1)
      const candidates = results.filter((row) => !/^(Branco\/Nulo|Não sabe)$/.test(row.raw_label))
      if (!names || candidates.length !== 2 || !candidates.every((row) => names.includes(row.raw_label))) throw new Error("PoderData PDF: duelo conflitante")
    }
    if (scenarios.some((scenario) => scenario.question === question)) throw new Error("PoderData PDF: cenário ambíguo")
    scenarios.push({ turn, label: lines[0].trim(), question, page: index + 1, results })
  }
  if (scenarios.filter((scenario) => scenario.turn === 1).length !== 1 || !scenarios.some((scenario) => scenario.turn === 2)) {
    throw new Error("PoderData PDF: cenários nacionais incompletos")
  }
  // Reconcile the first-turn chart with the Total column of its sex cross-tab.
  // A sum near 100 alone cannot detect an omitted candidate with a small share.
  const crossTab = pages.find((page) => /^Intenção de voto no 1º turno\s+Sexo\s/m.test(page.trim()))
  if (!crossTab) throw new Error("PoderData PDF: total independente ausente")
  const crossRows = crossTab.split(/\r?\n/).flatMap((line) => {
    const row = line.trim().match(/^(.+?)\s{2,}(\d+(?:[,.]\d+)?%)\s+(\d+(?:[,.]\d+)?%)\s+(\d+(?:[,.]\d+)?%)$/)
    return row && row[1] !== "Total" ? [{ raw_label: row[1], value_percent: Number(row[4].replace("%", "").replace(",", ".")) }] : []
  })
  const primary = scenarios.find((scenario) => scenario.turn === 1)!
  if (crossRows.length !== primary.results.length || new Set(crossRows.map((row) => row.raw_label)).size !== crossRows.length
    || !primary.results.every((row) => crossRows.some((other) => other.raw_label === row.raw_label && other.value_percent === row.value_percent))) {
    throw new Error("PoderData PDF: lista ou percentual diverge da coluna Total")
  }
  if (scenarios.some((scenario) => !["Branco/Nulo", "Não sabe"].every((label) => scenario.results.some((row) => row.raw_label === label)))) {
    throw new Error("PoderData PDF: categorias de resposta ausentes")
  }
  return { registration_id: registrationId, fieldwork, sample_size: Number(sample[1].replaceAll(".", "")), margin_error_pp: Number(margin[1].replace(",", ".")), confidence_percent: Number(confidence[1]), scenarios }
}

export function extrairDocumentoPoderData(input: { bytes: Uint8Array; url: string; observedAt: string; registrationId: string }): DocumentoPoderData {
  if (input.bytes.length > 5_000_000 || Buffer.from(input.bytes).subarray(0, 5).toString() !== "%PDF-") throw new Error("PoderData: documento inválido ou acima do limite")
  // No shell, URL or filename from the source is executed. PDF bytes enter stdin.
  const text = execFileSync("pdftotext", ["-layout", "-", "-"], { input: input.bytes, encoding: "utf8", timeout: 20_000, maxBuffer: 2_000_000 })
  return {
    ...parseTextoPoderData(text, input.registrationId),
    url: input.url,
    observed_at: input.observedAt,
    evidence_sha256: createHash("sha256").update(input.bytes).digest("hex"),
  }
}

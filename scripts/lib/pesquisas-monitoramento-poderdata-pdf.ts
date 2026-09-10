import "server-only"

import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { criarResolvedorPresidencial } from "./pesquisas-monitoramento-identidades"

export interface CenarioDocumentoPoderData {
  turn: 1 | 2
  label: string
  question: string
  page: number
  results_date?: string
  results: Array<{ raw_label: string; value_percent: number }>
  history?: Array<{ date: string; results: Array<{ raw_label: string; value_percent: number }> }>
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

export function descobrirRelatorioPoderData(html: string, fieldEnd?: string): string {
  const safe = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
  const urls = [...new Set([...safe.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
    .filter((match) => /^(íntegra|brasil)$/.test(match[2].replace(/<[^>]*>/g, " ").trim().toLocaleLowerCase("pt-BR")))
    .map((match) => match[1])
    .filter((url) => /^https:\/\/static\.poder360\.com\.br\/(?:uploads\/)?2026\/\d{2}\/[^?#]+\.pdf$/.test(url)))]
  const dated = fieldEnd && /^2026-\d{2}-\d{2}$/.test(fieldEnd)
    ? urls.filter((url) => new RegExp(`(?:^|[^0-9])${Number(fieldEnd.slice(8))}${PT_SHORT_MONTHS[Number(fieldEnd.slice(5, 7)) - 1]}26(?:[^0-9]|$)`, "i").test(new URL(url).pathname.split("/").at(-1)!)) : []
  const selected = dated.length ? dated : urls
  if (selected.length !== 1) throw new Error("PoderData: relatório integral ausente ou ambíguo")
  return selected[0]
}

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const PT_SHORT_MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]

function columnDate(value: string): string | null {
  const match = value.match(/^(\d{1,2})([-./])([a-z]{3})$/i)
  if (!match) return null
  const months = match[2] === "-" ? SHORT_MONTHS.map((month) => month.toLowerCase()) : PT_SHORT_MONTHS
  const month = months.indexOf(match[3].toLowerCase()) + 1
  const date = `2026-${String(month).padStart(2, "0")}-${match[1].padStart(2, "0")}`
  return month > 0 && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date ? date : null
}

/** Extract the dated table below each national voting-intention chart, never subgroup columns. */
export function parseTextoPoderData(text: string, registrationId: string, publicationDate?: string, rawText?: string): Omit<DocumentoPoderData, "url" | "observed_at" | "evidence_sha256"> {
  const pages = text.split("\f")
  const resolverNomePresidencial = criarResolvedorPresidencial()
  const registrations = [...new Set(text.match(/\bBR-\d{5}\/2026\b/g) ?? [])]
  if (registrations.length !== 1 || registrations[0] !== registrationId) throw new Error("PoderData PDF: registro conflitante")
  const front = pages.slice(0, 2).join(" ").replace(/\s+/g, " ")
  const field = front.match(/(\d{1,2})(?: de (\p{L}+))? a (\d{1,2}) de (\p{L}+) de 2026/u)
  const sample = front.match(/([\d.]+) entrevistas/i)
  const margin = front.match(/\+\/-\s*(\d+(?:[,.]\d+)?) p\.p\./i)
  const confidence = front.match(/confiança de (\d+)%/i)
  const endMonth = MONTHS.indexOf(field?.[4].toLocaleLowerCase("pt-BR") ?? "") + 1
  const startMonth = field?.[2] ? MONTHS.indexOf(field[2].toLocaleLowerCase("pt-BR")) + 1 : endMonth
  if (!field || !sample || !margin || !confidence || !endMonth || !startMonth) throw new Error("PoderData PDF: ficha técnica incompleta")
  const date = (day: string, month: number) => `2026-${String(month).padStart(2, "0")}-${day.padStart(2, "0")}`
  const fieldwork = { start: date(field[1], startMonth), end: date(field[3], endMonth) }
  if ([fieldwork.start, fieldwork.end].some((value) => !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) || fieldwork.start > fieldwork.end) {
    throw new Error("PoderData PDF: período inválido")
  }
  if (publicationDate && (!Number.isFinite(Date.parse(publicationDate)) || new Date(publicationDate).toISOString().slice(0, 10) !== publicationDate || publicationDate < fieldwork.end)) throw new Error("PoderData PDF: publicação inválida")
  const scenarios: CenarioDocumentoPoderData[] = []
  const plots: Array<{ question: string; page: number; label: string; turn: 1 | 2 }> = []
  for (const [index, page] of pages.entries()) {
    const lines = page.trim().split(/\r?\n/)
    const turnMatch = lines[0]?.trim().match(/^Intenção de voto no ([12])º turno$/)
    if (!turnMatch) continue
    // Cross-tab pages have a demographic label rather than the survey question.
    const questionStart = lines.findIndex((line) => /^\s*(?:Em outubro teremos eleição para presidente|E se houver um 2º turno entre)/.test(line))
    if (questionStart < 0) continue
    const question = lines.slice(questionStart, questionStart + 4).join(" ").replace(/\s+/g, " ").match(/^.*?\?/)?.[0]?.trim()
    if (!question) throw new Error("PoderData PDF: pergunta incompleta")
    const columnsIndex = lines.findIndex((line) => {
      const tokens = line.trim().split(/\s+/)
      return tokens.length >= 2 && tokens.every((token) => columnDate(token))
    })
    if (columnsIndex < 0) {
      // August's bar chart has no printed table. Read its literal text objects
      // independently of the sex cross-tab, which still must match below.
      plots.push({ question, page: index + 1, label: lines[0].trim(), turn: Number(turnMatch[1]) as 1 | 2 })
      continue
    }
    const columns = columnsIndex >= 0 ? lines[columnsIndex].trim().split(/\s+/) : []
    const dates = columns.map((column) => columnDate(column)!)
    if (![fieldwork.end, publicationDate].includes(dates.at(-1)) || dates.some((value, index) => index > 0 && value <= dates[index - 1])) {
      throw new Error("PoderData PDF: coluna de resultados não corresponde ao campo atual")
    }
    const table = lines.slice(columnsIndex + 1)
    const footer = table.findIndex((line) => /Pesquisa realizada|Copyright/.test(line))
    if (footer < 0) throw new Error("PoderData PDF: limite da tabela ausente")
    const rows = table.slice(0, footer).filter((line) => line.trim())
    if (!rows.length) { plots.push({ question, page: index + 1, label: lines[0].trim(), turn: Number(turnMatch[1]) as 1 | 2 }); continue }
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
      const identity = (name: string) => resolverNomePresidencial(name) ?? `literal:${name}`
      if (!names || candidates.length !== 2 || new Set(names.map(identity)).size !== 2
        || !candidates.every((row) => names.map(identity).includes(identity(row.raw_label)))) throw new Error("PoderData PDF: duelo conflitante")
    }
    if (scenarios.some((scenario) => scenario.question === question)) throw new Error("PoderData PDF: cenário ambíguo")
    scenarios.push({ turn, label: lines[0].trim(), question, page: index + 1, results_date: dates.at(-1), results })
  }
  for (const plot of plots) {
    if (scenarios.some((scenario) => scenario.question === plot.question)) continue
    const rawPage = rawText?.split("\f")[plot.page - 1]
    if (plot.turn !== 1 || !rawPage) throw new Error("PoderData PDF: gráfico sem tabela conciliada")
    const chart = parseBarrasPoderData(rawPage, plot.question, plot.page)
    if (![fieldwork.end, publicationDate].includes(chart.history.at(-1)!.date)) throw new Error("PoderData PDF: coluna de resultados não corresponde ao campo atual")
    scenarios.push({ ...plot, results_date: chart.history.at(-1)!.date, results: chart.history.at(-1)!.results, history: chart.history })
  }
  scenarios.sort((a, b) => a.page - b.page)
  if (new Set(scenarios.map((scenario) => scenario.results_date)).size !== 1) throw new Error("PoderData PDF: datas de resultado divergentes entre cenários")
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
  const identity = (name: string) => resolverNomePresidencial(name) ?? `literal:${name}`
  if (crossRows.length !== primary.results.length || new Set(crossRows.map((row) => identity(row.raw_label))).size !== crossRows.length
    || new Set(primary.results.map((row) => identity(row.raw_label))).size !== primary.results.length
    || !primary.results.every((row) => crossRows.some((other) => identity(other.raw_label) === identity(row.raw_label) && other.value_percent === row.value_percent))) {
    throw new Error("PoderData PDF: lista ou percentual diverge da coluna Total")
  }
  if (scenarios.some((scenario) => !["Branco/Nulo", "Não sabe"].every((label) => scenario.results.some((row) => row.raw_label === label)))) {
    throw new Error("PoderData PDF: categorias de resposta ausentes")
  }
  return { registration_id: registrationId, fieldwork, sample_size: Number(sample[1].replaceAll(".", "")), margin_error_pp: Number(margin[1].replace(",", ".")), confidence_percent: Number(confidence[1]), scenarios }
}

/** Narrow text-object order observed in the two-series August bar chart.
 * Never derive labels, counts or values from the independent Total table.
 * `rawPage` must be pdftotext -raw output from the same PDF bytes as -layout.
 */
function parseBarrasPoderData(rawPage: string, question: string, page: number) {
  const lines = rawPage.trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const title = lines.indexOf("Intenção de voto no 1º turno")
  const endQuestion = lines.findIndex((line, index) => index > title && line.endsWith("?"))
  if (title < 0 || endQuestion < 0 || lines.slice(title + 1, endQuestion + 1).join(" ") !== question || lines[endQuestion + 1] !== String(page)) throw new Error("PoderData PDF: ordem dos objetos do gráfico não reconhecida")
  const body = lines.slice(endQuestion + 2)
  const datesStart = body.findIndex((line) => columnDate(line))
  const labelsStart = body.findIndex((line) => !/^\d+(?:[,.]\d+)?$/.test(line))
  const dates = body.slice(datesStart).map(columnDate)
  const labels = body.slice(labelsStart, datesStart)
  const values = body.slice(0, labelsStart).map((value) => Number(value.replace(",", ".")))
  if (datesStart < 0 || labelsStart < 0 || dates.length !== 2 || dates.some((date) => !date) || dates[0]! >= dates[1]!
    || labels.length < 4 || new Set(labels).size !== labels.length || labels.some((label) => !/\p{L}/u.test(label))
    || values.length !== labels.length * dates.length || values.some((value) => !Number.isFinite(value) || value < 0 || value > 100)) throw new Error("PoderData PDF: séries ou rótulos do gráfico incompletos")
  const history = dates.map((date, index) => ({ date: date!, results: labels.map((raw_label, row) => ({ raw_label, value_percent: values[index * labels.length + row] })) }))
  if (history.some(({ results }) => Math.abs(results.reduce((sum, row) => sum + row.value_percent, 0) - 100) > results.length * 0.5)) throw new Error("PoderData PDF: série do gráfico incompleta")
  return { history }
}

export function extrairDocumentoPoderData(input: { bytes: Uint8Array; url: string; observedAt: string; registrationId: string; publicationDate?: string }): DocumentoPoderData {
  if (input.bytes.length > 5_000_000 || Buffer.from(input.bytes).subarray(0, 5).toString() !== "%PDF-") throw new Error("PoderData: documento inválido ou acima do limite")
  // No shell, URL or filename from the source is executed. PDF bytes enter stdin.
  const text = execFileSync("pdftotext", ["-layout", "-", "-"], { input: input.bytes, encoding: "utf8", timeout: 20_000, maxBuffer: 2_000_000 })
  const rawText = execFileSync("pdftotext", ["-raw", "-", "-"], { input: input.bytes, encoding: "utf8", timeout: 20_000, maxBuffer: 2_000_000 })
  return {
    ...parseTextoPoderData(text, input.registrationId, input.publicationDate, rawText),
    url: input.url,
    observed_at: input.observedAt,
    evidence_sha256: createHash("sha256").update(input.bytes).digest("hex"),
  }
}

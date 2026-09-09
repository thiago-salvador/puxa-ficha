import "server-only"

import { createHash } from "node:crypto"

import type { EvidenciaPesquisaCandidata } from "./pesquisas-monitoramento"
import type { ObservacaoPesqele } from "./pesquisas-monitoramento-pesqele"
import type { DocumentoPoderData } from "./pesquisas-monitoramento-poderdata-pdf"
import { margemCompativelComRegistro } from "./pesquisas-monitoramento-tse"
import { extrairPublicacaoRealTime } from "./pesquisas-monitoramento-realtime-cenarios"

export interface SourceContractMonitoramento {
  id: string
  status: string
  roles: { institute: string }
  representative_poll: {
    result_url: string
    registry_url: string
    registration_id: string
    office: string
    geography: string
  } | null
}

export interface AlvoMonitoramento {
  poll_id: string
  source_id: string
  url: string
  registration_id: string
  registry_url: string
  office: string
  geography: string
  geography_code: string
  turn: 1 | 2
  scenario_id: string
  scenario_label: string
  scenario_question: string | null
  population: string
  known_scenarios?: Array<{ id: string; turn: 1 | 2; label: string; question: string | null }>
  alternative_urls?: string[]
}

export interface AdaptadorMonitoramento {
  source_id: string
  allowed_origins: readonly string[]
  parse(input: {
    html: string
    observedAt: string
    source: SourceContractMonitoramento
    target: AlvoMonitoramento
    registrySupplement?: ObservacaoPesqele
    resultDocument?: DocumentoPoderData
  }): EvidenciaPesquisaCandidata
}

const REGISTRY_URL = "https://pesqele-divulgacao.tse.jus.br/"

const MONTHS: Record<string, string> = {
  jan: "01",
  janeiro: "01",
  fev: "02",
  fevereiro: "02",
  mar: "03",
  marco: "03",
  março: "03",
  abr: "04",
  abril: "04",
  maio: "05",
  jun: "06",
  junho: "06",
  jul: "07",
  julho: "07",
  ago: "08",
  agosto: "08",
  set: "09",
  setembro: "09",
  out: "10",
  outubro: "10",
  nov: "11",
  novembro: "11",
  dez: "12",
  dezembro: "12",
}

function stripExternalMarkup(html: string): string {
  const withoutExecutable = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
  return withoutExecutable
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&ordm;|&#186;/gi, "º")
    .replace(/&aacute;/gi, "á")
    .replace(/&atilde;/gi, "ã")
    .replace(/&ccedil;/gi, "ç")
    .replace(/&eacute;/gi, "é")
    .replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó")
    .replace(/&uacute;/gi, "ú")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim()
}

function isoDate(day: string, month: string, year: string): string {
  const normalizedMonth = MONTHS[month.toLocaleLowerCase("pt-BR")]
  if (!normalizedMonth) throw new Error(`mês inválido: ${month}`)
  return `${year}-${normalizedMonth}-${day.padStart(2, "0")}`
}

export function extractPublicationDate(html: string, text = stripExternalMarkup(html)): string {
  const machine = html.match(/(?:datePublished|datetime|publishtime|published_time)[^0-9]{0,100}(20\d{2}-\d{2}-\d{2})/i)?.[1]
  if (machine) return machine
  const slash = text.match(/\b(\d{2})\/(\d{2})\/(20\d{2})\b/)
  if (slash) return `${slash[3]}-${slash[2]}-${slash[1]}`
  const human = text.match(/publicad[oa]\s+em\s+(\d{1,2})\s+de\s+([a-zçã]+)\s+de\s+(20\d{2})/i)
  if (human) return isoDate(human[1], human[2], human[3])
  const compact = text.match(/\b(\d{1,2})\.([a-zçã]{3,9})\.(20\d{2})\b/i)
  if (compact) return isoDate(compact[1], compact[2], compact[3])
  throw new Error("HTML inesperado: data de publicação ausente")
}

function normalizeNumber(raw: string): number {
  return Number(raw.replace(/\./g, "").replace(",", "."))
}

function normalizeMeasure(raw: string): number {
  const words: Record<string, number> = {
    um: 1,
    uma: 1,
    dois: 2,
    duas: 2,
    três: 3,
    tres: 3,
    quatro: 4,
    cinco: 5,
  }
  return words[raw.toLocaleLowerCase("pt-BR")] ?? normalizeNumber(raw)
}

function requireMatch(text: string, pattern: RegExp, label: string): RegExpMatchArray {
  const match = text.match(pattern)
  if (!match) throw new Error(`HTML inesperado: ${label} ausente`)
  return match
}

function requireFirstMatch(text: string, patterns: RegExp[], label: string): RegExpMatchArray {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) return match
  }
  throw new Error(`HTML inesperado: ${label} ausente`)
}

function assertAdapterInput(
  adapter: AdaptadorMonitoramento,
  source: SourceContractMonitoramento,
  target: AlvoMonitoramento,
): void {
  if (source.id !== adapter.source_id || target.source_id !== adapter.source_id || source.status !== "aprovado") {
    throw new Error(`adaptador ${adapter.source_id} exige fonte aprovada correspondente`)
  }
  const url = new URL(target.url)
  if (url.protocol !== "https:" || !adapter.allowed_origins.includes(url.origin)) {
    throw new Error(`origem fora da allowlist do adaptador ${adapter.source_id}`)
  }
}

function extractFieldwork(text: string, publicationDate: string): { start: string; end: string } {
  const crossMonth = text.match(/(\d{1,2})\s+de\s+([a-zçã]+)\s+(?:a|e)\s+(\d{1,2})\s+de\s+([a-zçã]+)(?:\s+de\s+(20\d{2}))?/i)
  if (crossMonth) {
    const year = crossMonth[5] ?? publicationDate.slice(0, 4)
    return validateFieldwork({ start: isoDate(crossMonth[1], crossMonth[2], year), end: isoDate(crossMonth[3], crossMonth[4], year) }, publicationDate)
  }
  const days = "domingo|segunda|terça|quarta|quinta|sexta|sábado"
  const weekdayRange = text.match(new RegExp(`(?:de|da)\\s+(?:última\\s+)?(${days})(?:-feira)?\\s*\\((\\d{1,2})\\)\\s+(?:a|até|e)\\s+(?:esta\\s+|última\\s+)?(${days})(?:-feira)?(?:\\s*\\((\\d{1,2})\\))?`, "i"))
  if (weekdayRange) {
    if (!/pesquisa|levantamento|entrevistas?|eleitores|Datafolha/i.test(text.slice(Math.max(0, weekdayRange.index! - 240), weekdayRange.index))) throw new Error("HTML inesperado: datas sem contexto de pesquisa")
    const weekdays = days.split("|")
    const latestDate = (before: string, day: number, weekday: string): string => {
      const end = new Date(`${before}T00:00:00Z`)
      for (let offset = 0; offset <= 31; offset++) {
        const date = new Date(end.getTime() - offset * 86_400_000)
        if (date.getUTCDate() === day) {
          if (date.getUTCDay() !== weekdays.indexOf(weekday.toLocaleLowerCase("pt-BR"))) throw new Error("HTML inesperado: dia da semana conflitante com a data")
          return date.toISOString().slice(0, 10)
        }
      }
      throw new Error("HTML inesperado: dia da semana conflitante com a data")
    }
    const end = weekdayRange[4] ? latestDate(publicationDate, Number(weekdayRange[4]), weekdayRange[3]) : publicationDate
    if (!weekdayRange[4] && (!/\besta\s/i.test(weekdayRange[0]) || new Date(`${end}T00:00:00Z`).getUTCDay() !== weekdays.indexOf(weekdayRange[3].toLocaleLowerCase("pt-BR")))) throw new Error("HTML inesperado: fim do campo sem data verificável")
    return validateFieldwork({ start: latestDate(end, Number(weekdayRange[2]), weekdayRange[1]), end }, publicationDate)
  }
  const weekdayDates = text.match(/\((\d{1,2})\),?\s+dia\s+do\s+in[ií]cio\s+do\s+levantamento\s+que\s+acabou[^0-9.]{0,30}\((\d{1,2})\)/i)
    ?? text.match(/in[ií]cio\s+do\s+levantamento[^0-9]{0,30}\((\d{1,2})\)[^.]{0,100}?acabou[^0-9]{0,30}\((\d{1,2})\)/i)
  if (weekdayDates) {
    const prefix = publicationDate.slice(0, 8)
    return validateFieldwork({
      start: `${prefix}${weekdayDates[1].padStart(2, "0")}`,
      end: `${prefix}${weekdayDates[2].padStart(2, "0")}`,
    }, publicationDate)
  }
  const sameMonth = requireFirstMatch(text, [
    /(?:campo|entrevistas?|ouvidos?|coleta)[^0-9]{0,80}(\d{1,2})\s+(?:a|e)\s+(\d{1,2})\s+de\s+([a-zçã]+)(?:\s+de\s+(20\d{2}))?/i,
    /(?:entre\s+os\s+dias?\s+)?(\d{1,2})[º°]?\s+(?:a|e)\s+(\d{1,2})\s+de\s+([a-zçã]+)(?:\s+de\s+(20\d{2}))?/i,
  ], "período de campo")
  const year = sameMonth[4] ?? publicationDate.slice(0, 4)
  return {
    start: isoDate(sameMonth[1], sameMonth[3], year),
    end: isoDate(sameMonth[2], sameMonth[3], year),
  }
}

function validateFieldwork(fieldwork: { start: string; end: string }, publicationDate: string) {
  for (const date of [fieldwork.start, fieldwork.end, publicationDate]) {
    const parsed = new Date(`${date}T00:00:00Z`)
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
      throw new Error("HTML inesperado: data de campo ou publicação inválida")
    }
  }
  if (fieldwork.start > fieldwork.end || fieldwork.end > publicationDate) {
    throw new Error("HTML inesperado: período de campo conflitante com publicação")
  }
  return fieldwork
}

function extractSample(text: string): number {
  const thousands = text.match(/(?:ouviu|ouvidos|entrevistou|entrevistados|foram ouvidos|amostra)[^0-9]{0,40}(\d+(?:[,.]\d+)?)\s+mil\s+(?:eleitores|pessoas|entrevistas|entrevistados)/i)
  if (thousands) return Math.round(normalizeNumber(thousands[1]) * 1000)
  const match = requireFirstMatch(text, [
    /(?:ouviu|ouvidos|entrevistou|entrevistados|foram ouvidos|amostra)[^0-9]{0,40}(\d{1,3}(?:\.\d{3})+|\d{3,6})\s+(?:eleitores|pessoas|entrevistas|entrevistados)/i,
    /(?:foram|total de)[^0-9]{0,20}(\d{1,3}(?:\.\d{3})+|\d{3,6})\s+entrevistas/i,
    /(?:com a realização de|pesquisa foi realizada com)\s+(\d{1,3}(?:\.\d{3})+|\d{3,6})\s+entrevistas/i,
    /(?:pesquisa|levantamento)\s+foi\s+(?:realizad[oa]|feit[oa])[^.]{0,100}?\bcom\s+(?:as\s+entrevistas\s+de\s+)?(\d{1,3}(?:\.\d{3})+|\d{3,6})\s+eleitores/i,
  ], "amostra")
  return normalizeNumber(match[1])
}

function extractMethod(text: string): string {
  if (/pontos? de fluxo/i.test(text)) return "entrevistas presenciais em pontos de fluxo"
  if (/entrevistas? presenciais/i.test(text)) return "entrevistas presenciais"
  if (/telef[oô]nic|por telefone|\bURA\b/i.test(text)) return /digit(?:al|ais)/i.test(text)
    ? "abordagens telefônicas e digitais"
    : "entrevistas por telefone"
  if (/digit(?:al|ais)/i.test(text)) return "abordagem digital"
  throw new Error("HTML inesperado: método ausente")
}

function assertScope(text: string, target: AlvoMonitoramento): void {
  const officePattern = target.office === "Presidente" ? /presidente/i : /governador|governo/i
  if (!officePattern.test(text)) throw new Error("HTML inesperado: cargo ausente")
  const geographyMentioned = target.geography_code === "BR"
    ? /Brasil|nacional/i.test(text)
    : text.toLocaleLowerCase("pt-BR").includes(target.geography.toLocaleLowerCase("pt-BR"))
  if (!geographyMentioned) throw new Error("HTML inesperado: geografia ausente")
  const turn = requireMatch(text, /(?:1[oº°]|primeiro)\s+turno/i, "turno")
  if (!turn[0] || target.turn !== 1) throw new Error("HTML inesperado: turno conflitante")
}

function partyPair(text: string, patterns: RegExp[]): Array<{ raw_label: string; value_percent: number }> {
  const match = requireFirstMatch(text, patterns, "resultados")
  return [
    { raw_label: match[1].trim(), value_percent: normalizeNumber(match[2]) },
    { raw_label: match[3].trim(), value_percent: normalizeNumber(match[4]) },
  ]
}

const CANDIDATE = "([\\p{Lu}][\\p{L}'’ -]{1,80}?\\([\\p{Lu}]{2,20}\\))"

function parsePoderDataResults(text: string): Array<{ raw_label: string; value_percent: number }> {
  const match = requireFirstMatch(text, [
    new RegExp(`${CANDIDATE}\\s+(?:aparece\\s+)?com\\s+(\\d+(?:[,.]\\d+)?)%[^.]{0,120}?contra\\s+(\\d+(?:[,.]\\d+)?)%\\s+(?:do|da|de)\\s+(?:senador(?:a)?\\s+|presidente\\s+)?${CANDIDATE}\\s+no\\s+cen[aá]rio`, "u"),
  ], "resultados")
  return [
    { raw_label: match[1].trim(), value_percent: normalizeNumber(match[2]) },
    { raw_label: match[4].trim(), value_percent: normalizeNumber(match[3]) },
  ]
}

function parseDatafolhaResults(text: string): Array<{ raw_label: string; value_percent: number }> {
  return partyPair(text, [
    new RegExp(`${CANDIDATE}[^.]{0,80}?(?:marca|lidera(?:\\s+com)?|tem|aparece\\s+com)\\s+(\\d+(?:[,.]\\d+)?)%[^.]{0,140}?${CANDIDATE}[^.]{0,50}?(?:tem|marca|com)\\s+(\\d+(?:[,.]\\d+)?)%`, "u"),
  ])
}

function parseRealTimeResults(text: string): Array<{ raw_label: string; value_percent: number }> {
  return partyPair(text, [
    new RegExp(`${CANDIDATE}:\\s*(\\d+(?:[,.]\\d+)?)%[^.]{0,100}?${CANDIDATE}:\\s*(\\d+(?:[,.]\\d+)?)%`, "u"),
    new RegExp(`${CANDIDATE}[^.]{0,70}?(?:tem|marca|lidera\\s+com|aparece\\s+com)\\s+(\\d+(?:[,.]\\d+)?)%?[^.]{0,100}?${CANDIDATE}[^.]{0,40}?(?:tem|marca|com)\\s+(\\d+(?:[,.]\\d+)?)%`, "u"),
  ])
}

export function extrairListaCompletaPrimeiroTurno(html: string): Array<{ raw_label: string; value_percent: number }> | null {
  const safe = html.replace(/<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
  const candidates: Array<Array<{ raw_label: string; value_percent: number }>> = []
  for (const list of safe.matchAll(/<ul\b[^>]*>([\s\S]*?)<\/ul>/gi)) {
    const context = stripExternalMarkup(safe.slice(Math.max(0, list.index - 2000), list.index)).slice(-900)
    const turnMentions = [...context.matchAll(/(?:primeiro|segundo|1[oº]|2[oº])\s+turno/gi)]
    const lastTurn = turnMentions.at(-1)?.[0] ?? ""
    if (!/primeiro|1[oº]/i.test(lastTurn)) continue
    const lines = [...list[1].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((match) => stripExternalMarkup(match[1]))
    if (lines.filter((line) => /^[^:]+\([^)]*\)\s*:\s*\d/.test(line)).length < 2) continue
    const results = lines.map((line) => {
      const match = requireMatch(line, /^(.+?)\s*:\s*(\d+(?:[,.]\d+)?)%$/, "linha de resultado completa")
      const value = normalizeNumber(match[2])
      if (value < 0 || value > 100) throw new Error("HTML inesperado: percentual inválido")
      return { raw_label: match[1].trim(), value_percent: value }
    })
    if (new Set(results.map((entry) => entry.raw_label)).size !== results.length) throw new Error("HTML inesperado: resultado duplicado")
    const sum = results.reduce((total, entry) => total + entry.value_percent, 0)
    if (Math.abs(sum - 100) > results.length * 0.5) throw new Error("HTML inesperado: cenário incompleto")
    candidates.push(results)
  }
  if (candidates.length > 1) throw new Error("HTML inesperado: cenários de primeiro turno ambíguos")
  return candidates[0] ?? null
}

const NON_CANDIDATE = /^(Outros|Nulos?\/Brancos?|Brancos?\/Nulos?|Não sabe|Não sabe\/Não respondeu(?: \(NS\/NR\))?)$/i

/** Only explicit headings and complete lists establish a runoff scenario. */
export function extrairCenariosSegundoTurno(html: string): Array<{
  label: string
  results: Array<{ raw_label: string; value_percent: number }>
}> {
  const safe = html.replace(/<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
  const scenarios: ReturnType<typeof extrairCenariosSegundoTurno> = []
  let inRunoffs = false
  let sectionLevel = 0
  let label = ""
  let declaredCount: number | null = null
  for (const block of safe.matchAll(/<(h[1-6]|p|ul)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const tag = block[1].toLowerCase()
    const text = stripExternalMarkup(block[2])
    if (tag.startsWith("h")) {
      const level = Number(tag[1])
      if (/^Cenários? de (?:segundo|2[oº]) turno$/i.test(text)) {
        inRunoffs = true
        sectionLevel = level
        label = ""
      } else if (inRunoffs && /\s+x\s+/i.test(text) && level >= sectionLevel) {
        label = text
      } else if (inRunoffs && level <= sectionLevel) {
        inRunoffs = false
        label = ""
      } else if (inRunoffs) {
        // A different office must never inherit the governor/president context.
        if (/senado|senador|deputad|vereador|prefeit/i.test(text)) throw new Error("HTML inesperado: cargo conflitante no segundo turno")
        label = text
      }
      continue
    }
    if (!inRunoffs) continue
    if (tag === "p") {
      const declared = text.match(/\b(\d+) cenários? de (?:segundo|2[oº]) turno/i)
      if (declared) declaredCount = Number(declared[1])
      continue
    }
    const lines = [...block[2].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((match) => stripExternalMarkup(match[1]))
    if (!lines.some((line) => /:\s*\d+(?:[,.]\d+)?%$/.test(line))) continue
    if (!label || !/\s+x\s+/i.test(label)) throw new Error("HTML inesperado: cenário de segundo turno sem identificação")
    const results = lines.map((line) => {
      const match = requireMatch(line, /^(.+?)\s*:\s*(\d+(?:[,.]\d+)?)%$/, "linha de segundo turno completa")
      const value = normalizeNumber(match[2])
      if (value < 0 || value > 100) throw new Error("HTML inesperado: percentual inválido")
      return { raw_label: match[1].trim(), value_percent: value }
    })
    if (new Set(results.map((row) => row.raw_label)).size !== results.length) throw new Error("HTML inesperado: resultado duplicado")
    const names = results.filter((row) => !NON_CANDIDATE.test(row.raw_label)).map((row) => row.raw_label)
    const headingNames = label.split(/\s+x\s+/i).map((value) => value.trim())
    if (names.length !== 2 || headingNames.length !== 2 || !names.every((name) => headingNames.includes(name))) {
      throw new Error("HTML inesperado: nomes conflitantes no segundo turno")
    }
    if (Math.abs(results.reduce((sum, row) => sum + row.value_percent, 0) - 100) > results.length * 0.5) {
      throw new Error("HTML inesperado: cenário de segundo turno incompleto")
    }
    if (scenarios.some((scenario) => scenario.label === label)) throw new Error("HTML inesperado: cenário de segundo turno duplicado")
    scenarios.push({ label, results })
    label = ""
  }
  if (declaredCount !== null && declaredCount !== scenarios.length) throw new Error("HTML inesperado: quantidade de cenários de segundo turno divergente")
  const mentionsRunoffs = /(?:segundo|2[oº])\s+turno/i.test(stripExternalMarkup(safe))
  if (mentionsRunoffs && scenarios.length === 0) throw new Error("HTML inesperado: segundo turno sem captura completa")
  return scenarios
}

function buildEvidence(input: {
  adapter: AdaptadorMonitoramento
  html: string
  observedAt: string
  source: SourceContractMonitoramento
  target: AlvoMonitoramento
  registrySupplement?: ObservacaoPesqele
  resultDocument?: DocumentoPoderData
  institutePattern: RegExp
  parseResults(text: string): Array<{ raw_label: string; value_percent: number }>
}): EvidenciaPesquisaCandidata {
  assertAdapterInput(input.adapter, input.source, input.target)
  const text = stripExternalMarkup(input.html)
  if (!input.institutePattern.test(text)) throw new Error("HTML inesperado: instituto ausente")
  assertScope(text, input.target)
  const publicationDate = extractPublicationDate(input.html, text)
  const registration = requireMatch(text, /\b(?:BR|[A-Z]{2})-\d{5}\/2026\b/, "registro")[0]
  if (registration !== input.target.registration_id) throw new Error("HTML inesperado: registro conflitante")
  const fieldwork = extractFieldwork(text, publicationDate)
  const sampleSize = extractSample(text)
  const margin = requireMatch(text, /margem de erro[^.!?]{0,70}?(\d+(?:[,.]\d+)?|um|uma|dois|duas|tr[eê]s|quatro|cinco)\s+pontos?/i, "margem de erro")[1]
  const supplement = input.registrySupplement
  if (supplement) {
    const registry = supplement.registry
    const geographies = [input.target.geography, input.target.geography_code].map((value) => value.toLocaleLowerCase("pt-BR"))
    const conflicts: string[] = []
    for (const [key, published, registered] of [["registro", registration, registry.registration_id], ["início do campo", fieldwork.start, registry.field_start], ["fim do campo", fieldwork.end, registry.field_end], ["amostra", sampleSize, registry.sample_size]] as const) {
      if (published !== registered) conflicts.push(`${key}: publicação=${published}, registro=${registered}`)
    }
    if (!geographies.includes(registry.geography.toLocaleLowerCase("pt-BR"))) conflicts.push("geografia")
    if (!registry.office.toLocaleLowerCase("pt-BR").includes(input.target.office.toLocaleLowerCase("pt-BR"))) conflicts.push("cargo")
    if (!margemCompativelComRegistro(registry, normalizeMeasure(margin))) conflicts.push(`margem: publicação=${normalizeMeasure(margin)}, registro=${registry.margin_error_pp}`)
    if (!registry.institute.toLocaleLowerCase("pt-BR").includes(input.source.roles.institute.toLocaleLowerCase("pt-BR"))) conflicts.push("instituto")
    if (conflicts.length) throw new Error(`PesqEle: metadados conflitantes com a publicação (${conflicts.join("; ")})`)
  }
  const publishedConfidence = text.match(/(?:intervalo|n[ií]vel|[ií]ndice) de confian[cç]a[^0-9]{0,30}(\d+(?:[,.]\d+)?)%/i)?.[1]
  const confidence = publishedConfidence ? normalizeNumber(publishedConfidence) : supplement?.confidence_percent
  if (confidence === undefined) throw new Error("HTML inesperado: confiança ausente")
  if (supplement && confidence !== supplement.confidence_percent) throw new Error("PesqEle: confiança conflitante")
  let method: string
  try { method = extractMethod(text) } catch (error) {
    if (!supplement) throw error
    method = extractMethod(supplement.method)
  }
  const document = input.resultDocument
  if (document && (input.source.id !== "poderdata-aya-nacional-2026" || input.target.office !== "Presidente" || input.target.geography_code !== "BR"
    || document.registration_id !== registration || document.fieldwork.start !== fieldwork.start || document.fieldwork.end !== fieldwork.end
    || document.sample_size !== sampleSize || document.margin_error_pp !== normalizeMeasure(margin) || document.confidence_percent !== confidence)) {
    throw new Error("PoderData PDF: metadados conflitantes com a publicação")
  }
  const primaryDocumentScenario = document?.scenarios.find((scenario) => scenario.turn === 1)
  const realTime = input.source.id === "real-time-big-data-estaduais-2026" ? extrairPublicacaoRealTime(input.html, stripExternalMarkup) : null
  const primaryRealTime = realTime?.scenarios.find((scenario) => scenario.turn === 1 && scenario.mode === "estimulado")
  if (realTime && !primaryRealTime) throw new Error("Real Time: cenário estimulado ausente")
  const completeResults = primaryDocumentScenario?.results ?? primaryRealTime?.results ?? extrairListaCompletaPrimeiroTurno(input.html)
  const results = completeResults ?? input.parseResults(text)
  if (completeResults && input.target.turn !== 1) throw new Error("HTML inesperado: turno do alvo conflitante")
  const additional = document ? document.scenarios.filter((scenario) => scenario !== primaryDocumentScenario)
    : realTime ? realTime.scenarios.filter((scenario) => scenario !== primaryRealTime).map((scenario) => ({ ...scenario, question: null }))
      : (completeResults ? extrairCenariosSegundoTurno(input.html).map((scenario) => ({ ...scenario, turn: 2 as const, question: null })) : [])
  const unresolvedResults = (rows: typeof results): EvidenciaPesquisaCandidata["results"] => rows.map((result) => ({
    ...result,
    candidate_slug: null,
    match_status: NON_CANDIDATE.test(result.raw_label) ? "not_candidate" : "indeterminado",
  }))
  return {
    source_id: input.source.id,
    source_status: input.source.status,
    url: input.target.url,
    institute: input.source.roles.institute,
    registration: {
      id: registration,
      url: input.target.registry_url || input.source.representative_poll?.registry_url || REGISTRY_URL,
    },
    fieldwork,
    publication_date: publicationDate,
    scenario: {
      id: input.target.scenario_id,
      office: input.target.office,
      geography: input.target.geography,
      geography_code: input.target.geography_code,
      turn: input.target.turn,
      label: primaryRealTime?.label ?? input.target.scenario_label,
      question: primaryDocumentScenario?.question ?? input.target.scenario_question,
    },
    sample: { size: sampleSize, population: input.target.population },
    margin_error_pp: normalizeMeasure(margin),
    confidence_percent: confidence,
    method,
    ...(completeResults ? {
      scenario_complete: true,
      publication_complete: true,
      ...(realTime?.notes.length ? { result_notes: realTime.notes } : {}),
      additional_scenarios: additional.map((runoff) => ({
        scenario: {
          id: input.target.known_scenarios?.find((scenario) => scenario.turn === runoff.turn && (runoff.question ? scenario.question === runoff.question : scenario.label === runoff.label))?.id
            ?? `${input.target.poll_id}-${runoff.turn}t-${createHash("sha256").update("mode" in runoff ? `${runoff.mode}|${runoff.results.map((row) => row.raw_label).sort().join("|")}` : runoff.question ?? runoff.label).digest("hex").slice(0, 16)}`,
          office: input.target.office,
          geography: input.target.geography,
          geography_code: input.target.geography_code,
          turn: runoff.turn,
          label: runoff.label,
          question: runoff.question,
        },
        results: unresolvedResults(runoff.results),
        scenario_complete: true as const,
      })),
    } : {}),
    ...(supplement ? { registry_observation: { url: supplement.source_url, observed_at: supplement.observed_at, evidence_sha256: supplement.evidence_sha256 } } : {}),
    ...(document ? { result_document: { url: document.url, observed_at: document.observed_at, evidence_sha256: document.evidence_sha256, pages: document.scenarios.map((scenario) => scenario.page) } } : {}),
    results: unresolvedResults(results),
    observed_at: input.observedAt,
    evidence_sha256: createHash("sha256").update(input.html).digest("hex"),
  }
}

function defineAdapter(input: {
  sourceId: string
  allowedOrigins: readonly string[]
  institutePattern: RegExp
  parseResults(text: string): Array<{ raw_label: string; value_percent: number }>
}): AdaptadorMonitoramento {
  const adapter: AdaptadorMonitoramento = {
    source_id: input.sourceId,
    allowed_origins: input.allowedOrigins,
    parse(parseInput) {
      return buildEvidence({
        adapter,
        ...parseInput,
        institutePattern: input.institutePattern,
        parseResults: input.parseResults,
      })
    },
  }
  return adapter
}

export const ADAPTADORES_MONITORAMENTO: readonly AdaptadorMonitoramento[] = [
  defineAdapter({
    sourceId: "poderdata-aya-nacional-2026",
    allowedOrigins: ["https://www.poder360.com.br"],
    institutePattern: /PoderData/i,
    parseResults: parsePoderDataResults,
  }),
  defineAdapter({
    sourceId: "datafolha-folha-globo-nacional-2026",
    allowedOrigins: ["https://www1.folha.uol.com.br"],
    institutePattern: /Datafolha/i,
    parseResults: parseDatafolhaResults,
  }),
  defineAdapter({
    sourceId: "datafolha-folha-globo-estaduais-2026",
    allowedOrigins: ["https://www1.folha.uol.com.br"],
    institutePattern: /Datafolha/i,
    parseResults: parseDatafolhaResults,
  }),
  defineAdapter({
    sourceId: "real-time-big-data-estaduais-2026",
    allowedOrigins: [
      "https://gauchazh.clicrbs.com.br",
      "https://noticias.r7.com",
      "https://exame.com",
      "https://www.gazetadopovo.com.br",
      "https://ric.com.br",
      "https://www.rondoniaaovivo.com",
    ],
    institutePattern: /Real Time Big Data/i,
    parseResults: parseRealTimeResults,
  }),
] as const

const ADAPTER_BY_SOURCE = new Map(ADAPTADORES_MONITORAMENTO.map((adapter) => [adapter.source_id, adapter]))

export function obterAdaptadorMonitoramento(sourceId: string): AdaptadorMonitoramento {
  const adapter = ADAPTER_BY_SOURCE.get(sourceId)
  if (!adapter) throw new Error(`fonte sem adaptador aprovado: ${sourceId}`)
  return adapter
}

export function parsePublicacaoMonitorada(input: {
  html: string
  observedAt: string
  source: SourceContractMonitoramento
  target: AlvoMonitoramento
  registrySupplement?: ObservacaoPesqele
  resultDocument?: DocumentoPoderData
}): EvidenciaPesquisaCandidata {
  return obterAdaptadorMonitoramento(input.source.id).parse(input)
}

import "server-only"

import { createHash } from "node:crypto"

import type { EvidenciaPesquisaCandidata } from "./pesquisas-monitoramento"

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
}

export interface AdaptadorMonitoramento {
  source_id: string
  allowed_origins: readonly string[]
  parse(input: {
    html: string
    observedAt: string
    source: SourceContractMonitoramento
    target: AlvoMonitoramento
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

function extractPublicationDate(html: string, text: string): string {
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
  const weekdayDates = text.match(/in[ií]cio\s+do\s+levantamento[^0-9]{0,30}\((\d{1,2})\)[^.]{0,100}?acabou[^0-9]{0,30}\((\d{1,2})\)/i)
  if (weekdayDates) {
    const prefix = publicationDate.slice(0, 8)
    return {
      start: `${prefix}${weekdayDates[1].padStart(2, "0")}`,
      end: `${prefix}${weekdayDates[2].padStart(2, "0")}`,
    }
  }
  const sameMonth = requireFirstMatch(text, [
    /(?:campo|entrevistas?|ouvidos?|coleta)[^0-9]{0,80}(\d{1,2})\s+(?:a|e)\s+(\d{1,2})\s+de\s+([a-zçã]+)(?:\s+de\s+(20\d{2}))?/i,
    /(?:entre\s+os\s+dias?\s+)?(\d{1,2})\s+(?:a|e)\s+(\d{1,2})\s+de\s+([a-zçã]+)(?:\s+de\s+(20\d{2}))?/i,
  ], "período de campo")
  const year = sameMonth[4] ?? publicationDate.slice(0, 4)
  return {
    start: isoDate(sameMonth[1], sameMonth[3], year),
    end: isoDate(sameMonth[2], sameMonth[3], year),
  }
}

function extractSample(text: string): number {
  const thousands = text.match(/(?:ouviu|ouvidos|entrevistou|entrevistados|foram ouvidos|amostra)[^0-9]{0,40}(\d+(?:[,.]\d+)?)\s+mil\s+(?:eleitores|pessoas|entrevistas|entrevistados)/i)
  if (thousands) return Math.round(normalizeNumber(thousands[1]) * 1000)
  const match = requireFirstMatch(text, [
    /(?:ouviu|ouvidos|entrevistou|entrevistados|foram ouvidos|amostra)[^0-9]{0,40}(\d{1,3}(?:\.\d{3})+|\d{3,6})\s+(?:eleitores|pessoas|entrevistas|entrevistados)/i,
    /(?:foram|total de)[^0-9]{0,20}(\d{1,3}(?:\.\d{3})+|\d{3,6})\s+entrevistas/i,
  ], "amostra")
  return normalizeNumber(match[1])
}

function extractMethod(text: string): string {
  if (/pontos? de fluxo/i.test(text)) return "entrevistas presenciais em pontos de fluxo"
  if (/entrevistas? presenciais/i.test(text)) return "entrevistas presenciais"
  if (/telef[oô]nic|por telefone|URA/i.test(text)) return /digital/i.test(text)
    ? "abordagens telefônicas e digitais"
    : "entrevistas por telefone"
  if (/digital/i.test(text)) return "abordagem digital"
  throw new Error("HTML inesperado: método ausente")
}

function assertScope(text: string, target: AlvoMonitoramento): void {
  const officePattern = target.office === "Presidente" ? /presidente/i : /governador|governo/i
  if (!officePattern.test(text)) throw new Error("HTML inesperado: cargo ausente")
  const geographyMentioned = target.geography_code === "BR"
    ? /Brasil|nacional/i.test(text)
    : text.toLocaleLowerCase("pt-BR").includes(target.geography.toLocaleLowerCase("pt-BR"))
  if (!geographyMentioned) throw new Error("HTML inesperado: geografia ausente")
  const turn = requireMatch(text, /(?:1[oº]|primeiro)\s+turno/i, "turno")
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

function buildEvidence(input: {
  adapter: AdaptadorMonitoramento
  html: string
  observedAt: string
  source: SourceContractMonitoramento
  target: AlvoMonitoramento
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
  const margin = requireMatch(text, /margem de erro.{0,30}?(\d+(?:[,.]\d+)?|um|uma|dois|duas|tr[eê]s|quatro|cinco)\s+pontos?/i, "margem de erro")[1]
  const confidence = requireMatch(text, /(?:intervalo|n[ií]vel|[ií]ndice) de confian[cç]a[^0-9]{0,30}(\d+(?:[,.]\d+)?)%/i, "confiança")[1]
  const results = input.parseResults(text)
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
      label: input.target.scenario_label,
      question: input.target.scenario_question,
    },
    sample: { size: sampleSize, population: input.target.population },
    margin_error_pp: normalizeMeasure(margin),
    confidence_percent: normalizeNumber(confidence),
    method: extractMethod(text),
    results: results.map((result) => ({
      ...result,
      candidate_slug: null,
      match_status: "indeterminado" as const,
    })),
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
}): EvidenciaPesquisaCandidata {
  return obterAdaptadorMonitoramento(input.source.id).parse(input)
}

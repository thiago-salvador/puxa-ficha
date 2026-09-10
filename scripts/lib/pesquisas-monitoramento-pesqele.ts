import "server-only"
import { createHash } from "node:crypto"
import { criarClienteHttpMonitoramento, type ClienteHttpMonitoramento } from "./pesquisas-monitoramento-rede"
import type { RegistroTseMonitoramento } from "./pesquisas-monitoramento-tse"
import { getEstadoNome, getEstadoUFs } from "../../src/lib/br-uf"

export const PESQELE_ORIGIN = "https://pesqele-divulgacao.tse.jus.br"
const SEARCH_URL = `${PESQELE_ORIGIN}/app/pesquisa/listar.xhtml`
const DETAIL_URL = `${PESQELE_ORIGIN}/app/pesquisa/detalhar.xhtml`

export const GEOGRAFIAS_DESCOBERTA = ["BR", ...getEstadoUFs().map((uf) => uf.toUpperCase())]
const SESSION_COOKIES = ["JSESSIONID", "sticky", "oam.Flash.RENDERMAP.TOKEN", "TS01a390f9"]

/** One budget shared by registry, listings and intake, including robots and redirects. */
export function criarOrcamentoDescoberta(options: {
  maxRequests?: number; maxBytes?: number; maxDurationMs?: number; fetchImpl?: typeof fetch
} = {}) {
  const limits = { maxRequests: options.maxRequests ?? 120, maxBytes: options.maxBytes ?? 30_000_000, maxDurationMs: options.maxDurationMs ?? 180_000, concurrency: 1 }
  for (const [name, value] of Object.entries(limits)) if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`limite inválido: ${name}`)
  const start = Date.now()
  const usage = { requests: 0, bytes: 0 }
  let active = false
  function check() {
    if (Date.now() - start >= limits.maxDurationMs) throw new Error("descoberta: limite de tempo")
    if (usage.requests >= limits.maxRequests) throw new Error("descoberta: limite de chamadas")
    if (usage.bytes >= limits.maxBytes) throw new Error("descoberta: limite de bytes")
  }
  const boundedFetch: typeof fetch = async (url, init) => {
    check()
    if (active) throw new Error("descoberta: limite de concorrência")
    active = true
    usage.requests++
    const signal = AbortSignal.any([...(init?.signal ? [init.signal] : []), AbortSignal.timeout(Math.max(1, limits.maxDurationMs - (Date.now() - start)))])
    try {
      const response = await (options.fetchImpl ?? fetch)(url, { ...init, signal })
      if (Number(response.headers.get("content-length")) > Math.min(2_000_000, limits.maxBytes - usage.bytes)) {
        await response.body?.cancel()
        throw new Error("descoberta: limite de bytes")
      }
      const chunks: Uint8Array[] = []
      const reader = response.body?.getReader()
      let size = 0
      try {
        while (reader) {
          const chunk = await reader.read()
          if (chunk.done) break
          usage.bytes += chunk.value.byteLength
          size += chunk.value.byteLength
          if (usage.bytes > limits.maxBytes || size > 2_000_000) throw new Error("descoberta: limite de bytes")
          if (signal.aborted) throw new Error("descoberta: limite de tempo")
          chunks.push(chunk.value)
        }
      } finally { await reader?.cancel(); reader?.releaseLock() }
      return new Response(response.body ? Buffer.concat(chunks) : null, { status: response.status, statusText: response.statusText, headers: response.headers })
    } finally { active = false }
  }
  return {
    limits, usage, check,
    snapshot: () => ({ ...usage, elapsed_ms: Date.now() - start, limits: { ...limits } }),
    client: (origins: string[], pesqele = false) => criarClienteHttpMonitoramento({
      allowedOrigins: origins, fetchImpl: boundedFetch, maxAttempts: 1, maxBytes: 2_000_000, maxRedirects: 0,
      timeoutMs: Math.min(10_000, limits.maxDurationMs),
      ...(pesqele ? { allowedFormUrls: [SEARCH_URL], sessionCookieNames: SESSION_COOKIES } : {}),
    }),
  }
}
export type OrcamentoDescoberta = ReturnType<typeof criarOrcamentoDescoberta>

export interface RegistroDescobertoPesqele {
  registration_id: string
  election: string
  institute: string
  registered_at: string
  geography: string
  geography_code: string
  source_url: string
  observed_at: string
  evidence_sha256: string
  public_text: string
}
export interface PaginaRegistrosPesqele {
  geography_code: string
  date_from: string
  date_to: string
  offset: number
  row_count: number
  total_reported: number
  source_url: string
  observed_at: string
  evidence_sha256: string
  records: RegistroDescobertoPesqele[]
}
export interface InventarioRegistrosPesqele {
  schema_version: "pesquisas-registros-v1"
  election: "Eleições Gerais 2026"
  date_from: string
  date_to: string
  geographies: Array<{
    geography_code: string
    status: "not_queried" | "observed" | "partial" | "failed"
    query_exhausted: boolean
    absence_of_poll_confirmed: false
    records: RegistroDescobertoPesqele[]
    pages: PaginaRegistrosPesqele[]
    session_restarts: number
    errors: string[]
  }>
  budget: ReturnType<OrcamentoDescoberta["snapshot"]>
}

export interface ObservacaoPesqele {
  registry: RegistroTseMonitoramento
  confidence_percent: number
  method: string
  publication_date: string
  source_url: string
  observed_at: string
  public_text: string
  evidence_sha256: string
}

function decodeEntities(value: string): string {
  return value.replace(/&#x([a-f\d]+);/gi, (_, number: string) => String.fromCodePoint(parseInt(number, 16)))
    .replace(/&#(\d+);/g, (_, number: string) => String.fromCodePoint(Number(number)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
}

function publicText(html: string): string {
  return decodeEntities(html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim()
}

function requiredMatch(value: string, regex: RegExp, label: string): RegExpMatchArray {
  const match = value.match(regex)
  if (!match) throw new Error(`PesqEle: ${label} ausente ou layout alterado`)
  return match
}

function isoDate(value: string): string {
  const match = requiredMatch(value, /^(\d{2})\/(\d{2})\/(20\d{2})$/, "data")
  const date = `${match[3]}-${match[2]}-${match[1]}`
  const parsed = new Date(`${date}T00:00:00Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error("PesqEle: data inválida")
  return date
}

export function parseDetalhePesqele(html: string, registrationId: string, observedAt: string): ObservacaoPesqele {
  const heading = publicText(requiredMatch(html, /<h4\b[^>]*>([\s\S]*?)<\/h4>/i, "título")[1])
  if (heading !== `Visualizar Pesquisa Eleitoral - ${registrationId}`) throw new Error("PesqEle: registro conflitante")
  const table = requiredMatch(html, /<table\b[^>]*id="form:camposPesquisa"[^>]*>([\s\S]*?)<\/table>/i, "metadados")[1]
  const cells = [...table.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => publicText(match[1]))
  const field = (name: string) => {
    const index = cells.indexOf(name)
    if (index < 0 || !cells[index + 1]) throw new Error(`PesqEle: campo ${name} ausente`)
    return cells[index + 1]
  }
  if (field("Número de identificação:") !== registrationId) throw new Error("PesqEle: registro conflitante")
  const text = publicText(html)
  const method = requiredMatch(text, /Metodologia de pesquisa:\s*(.*?)\s*Plano amostral/i, "metodologia")[1]
  const confidence = Number(requiredMatch(text, /n[ií]vel de confian[cç]a[^0-9.]{0,80}(\d+(?:[,.]\d+)?)%/i, "confiança")[1].replace(",", "."))
  const margin = Number(requiredMatch(text, /margem de erro[^.]{0,160}?(\d+(?:[,.]\d+)?)\s*(?:\([^)]*\)\s*)?pontos/i, "margem")[1].replace(",", "."))
  const sample = Number(field("Entrevistados:").replace(/\./g, ""))
  if (!Number.isInteger(sample) || sample <= 0 || confidence <= 0 || confidence >= 100 || margin <= 0 || margin >= 100) throw new Error("PesqEle: medidas inválidas")
  const start = isoDate(field("Data de início da pesquisa:"))
  const end = isoDate(field("Data de término da pesquisa:"))
  const publication = isoDate(field("Data de divulgação:"))
  if (start > end || end > publication) throw new Error("PesqEle: datas conflitantes")
  return {
    registry: {
      registration_id: registrationId,
      office: field("Cargo(s):"),
      geography: publicText(requiredMatch(html, /<h5\b[^>]*>([\s\S]*?)<\/h5>/i, "abrangência")[1]),
      field_start: start, field_end: end, sample_size: sample,
      margin_error_pp: margin, institute: field("Empresa contratada/ Nome Fantasia:"),
      ...(/margem de erro(?:\s*:\s*A margem de erro)?\s+máxima prevista\s+(?:é de\s+)?\d/i.test(text) ? { margin_error_qualifier: "maximum_planned" as const } : {}),
    },
    confidence_percent: confidence, method, publication_date: publication,
    source_url: SEARCH_URL, observed_at: observedAt,
    public_text: text, evidence_sha256: createHash("sha256").update(text).digest("hex"),
  }
}

function viewState(html: string): string {
  const update = html.match(/<update id="[^"]*ViewState[^"]*"><!\[CDATA\[([\s\S]*?)\]\]><\/update>/)
  if (update) return decodeEntities(update[1])
  return decodeEntities(requiredMatch(html, /name="javax.faces.ViewState"[^>]*value="([^"]+)"/, "estado do formulário")[1])
}

function sessionExpired(html: string): boolean {
  return /ViewExpiredException|sess[aã]o (?:expirada|expirou)|session expired/i.test(html)
    || /<redirect\b[^>]*url="[^"]*(?:listar\.xhtml|login)/i.test(html)
}

function electionValue(form: string): string {
  const select = requiredMatch(form, /<select[^>]*name="formPesquisa:eleicoes_input"[^>]*>([\s\S]*?)<\/select>/, "eleições")[1]
  const options = [...select.matchAll(/<option value="([^"]+)"[^>]*>([\s\S]*?)<\/option>/g)]
    .filter((match) => publicText(match[2]) === "Eleições Gerais 2026")
  if (options.length !== 1) throw new Error("PesqEle: eleição ausente ou ambígua")
  return options[0][1]
}

/** Parses only public table rows; ViewState, cookies and JS never enter receipts. */
export function parsePaginaRegistrosPesqele(html: string, input: {
  geography: string; dateFrom: string; dateTo: string; offset: number; observedAt: string; total?: number; pageSize?: number
}): PaginaRegistrosPesqele & { page_size: number } {
  if (sessionExpired(html)) throw new Error("PesqEle: sessão expirada")
  const rows = [...html.matchAll(/<tr\b[^>]*data-ri="(\d+)"[^>]*>([\s\S]*?)<\/tr>/g)]
  const totalMatch = html.match(/\browCount:(\d+)/)
  const total = totalMatch ? Number(totalMatch[1]) : input.total
  const sizeMatch = html.match(/paginator:\{[\s\S]*?\brows:(\d+)/)
  const pageSize = sizeMatch ? Number(sizeMatch[1]) : input.pageSize
  // A recognized empty table is evidence about this query only, never absence of polls.
  const empty = /ui-datatable-empty-message/.test(html) && /Nenhum registro encontrado/i.test(publicText(html))
  if (empty && rows.length === 0 && input.offset === 0 && (total === undefined || total === 0)) {
    return { geography_code: input.geography, date_from: input.dateFrom, date_to: input.dateTo, offset: 0, row_count: 0, total_reported: 0, page_size: 10, source_url: SEARCH_URL, observed_at: input.observedAt, evidence_sha256: createHash("sha256").update("Nenhum registro encontrado").digest("hex"), records: [] }
  }
  if (total === undefined || pageSize === undefined || total < 1 || total > 50 || pageSize < 1 || pageSize > 50
    || rows.length !== Math.min(pageSize, total - input.offset)) throw new Error("PesqEle: tabela ou paginação incompleta/layout alterado")
  const records = rows.map((row, index): RegistroDescobertoPesqele => {
    if (Number(row[1]) !== input.offset + index) throw new Error("PesqEle: página repetida ou offset conflitante")
    const cells = [...row[2].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => publicText(cell[1]))
    if (cells.length !== 6 || !/^[A-Z]{2}-\d{5}\/2026$/.test(cells[0]) || cells[1] !== "Eleições Gerais 2026" || !cells[2]) throw new Error("PesqEle: linha de registro inválida")
    const expectedGeo = input.geography === "BR" ? "BRASIL" : getEstadoNome(input.geography)?.toLocaleUpperCase("pt-BR")
    if (![input.geography, expectedGeo].includes(cells[4].toLocaleUpperCase("pt-BR"))) throw new Error("PesqEle: filtro de UF não confirmado pela resposta")
    const date = isoDate(cells[3])
    if (date < input.dateFrom || date > input.dateTo) throw new Error("PesqEle: filtro de período não confirmado pela resposta")
    const text = cells.slice(0, 5).join(" | ")
    return { registration_id: cells[0], election: cells[1], institute: cells[2], registered_at: date, geography: cells[4], geography_code: input.geography,
      source_url: SEARCH_URL, observed_at: input.observedAt, evidence_sha256: createHash("sha256").update(text).digest("hex"), public_text: text }
  })
  return { geography_code: input.geography, date_from: input.dateFrom, date_to: input.dateTo, offset: input.offset, row_count: rows.length, total_reported: total, page_size: pageSize,
    source_url: SEARCH_URL, observed_at: input.observedAt, evidence_sha256: createHash("sha256").update(records.map((record) => record.public_text).join("\n")).digest("hex"), records }
}

/** Sequential sessions, bounded pagination and one fresh-session retry per UF. */
export async function descobrirRegistrosPesqele(input: {
  dateFrom: string; dateTo: string; geographies?: string[]; maxPagesPerGeography?: number; budget?: OrcamentoDescoberta
}): Promise<InventarioRegistrosPesqele> {
  const validateDate = (date: string) => {
    if (!/^2026-\d{2}-\d{2}$/.test(date) || isoDate(date.split("-").reverse().join("/")) !== date) throw new Error("PesqEle: período inválido")
  }
  validateDate(input.dateFrom); validateDate(input.dateTo)
  if (input.dateFrom > input.dateTo) throw new Error("PesqEle: período invertido")
  const requested = input.geographies ?? GEOGRAFIAS_DESCOBERTA
  if (!requested.length || requested.some((geo) => !GEOGRAFIAS_DESCOBERTA.includes(geo)) || new Set(requested).size !== requested.length) throw new Error("PesqEle: geografias inválidas")
  const maxPages = input.maxPagesPerGeography ?? 5
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 5) throw new Error("PesqEle: limite de páginas inválido")
  const budget = input.budget ?? criarOrcamentoDescoberta()
  const geographies: InventarioRegistrosPesqele["geographies"] = GEOGRAFIAS_DESCOBERTA.map((geography_code) => ({ geography_code, status: "not_queried", query_exhausted: false, absence_of_poll_confirmed: false, records: [], pages: [], session_restarts: 0, errors: [] }))
  for (const geography of requested) {
    const result = geographies.find((item) => item.geography_code === geography)!
    const records = new Map<string, RegistroDescobertoPesqele>()
    for (let attempt = 0; attempt < 2; attempt++) {
      const client = budget.client([PESQELE_ORIGIN], true)
      try {
        const initial = await client.getText(SEARCH_URL)
        const form = requiredMatch(initial.body, /<form id="formPesquisa"[\s\S]*?<\/form>/, "formulário")[0]
        const ufSelect = requiredMatch(form, /<select[^>]*name="(formPesquisa:filtroUF_input)"[^>]*>([\s\S]*?)<\/select>/, "UF")[2]
        if (![...ufSelect.matchAll(/<option value="([^"]+)"/g)].some((m) => m[1] === geography)) throw new Error("PesqEle: UF ausente no formulário")
        const dates = [...form.matchAll(/<span[^>]*class="ui-calendar"[^>]*><input[^>]*name="([^"]+)"/g)].map((m) => m[1])
        if (dates.length !== 2 || !publicText(form).includes("Período de registro")) throw new Error("PesqEle: filtro de período ausente/layout alterado")
        const fields: Record<string, string> = { "javax.faces.partial.ajax": "true", "javax.faces.source": "formPesquisa:idBtnPesquisar", "javax.faces.partial.execute": "@all", "javax.faces.partial.render": "formPesquisa", "formPesquisa:idBtnPesquisar": "formPesquisa:idBtnPesquisar", formPesquisa: "formPesquisa", formPesquisa_SUBMIT: "1", "formPesquisa:eleicoes_input": electionValue(form), "formPesquisa:filtroUF_input": geography,
          [dates[0]]: input.dateFrom.split("-").reverse().join("/"), [dates[1]]: input.dateTo.split("-").reverse().join("/"), "javax.faces.ViewState": viewState(form) }
        let offset = 0
        let total: number | undefined
        let pageSize: number | undefined
        let currentPages = 0
        while (currentPages < maxPages) {
          const response = await client.postForm(SEARCH_URL, fields)
          const page = parsePaginaRegistrosPesqele(response.body, { geography, dateFrom: input.dateFrom, dateTo: input.dateTo, offset, observedAt: response.observedAt, total, pageSize })
          if (total !== undefined && page.total_reported !== total) throw new Error("PesqEle: total mudou durante paginação")
          result.pages.push(page)
          for (const record of page.records) {
            const previous = records.get(record.registration_id)
            if (previous && previous.evidence_sha256 !== record.evidence_sha256) result.errors.push(`registro mudou durante coleta: ${record.registration_id}`)
            records.set(record.registration_id, record)
          }
          currentPages++
          total = page.total_reported; pageSize = page.page_size
          offset += page.row_count
          if (offset >= total) break
          Object.assign(fields, { "javax.faces.source": "formPesquisa:tabelaPesquisas", "javax.faces.partial.execute": "formPesquisa:tabelaPesquisas", "javax.faces.partial.render": "formPesquisa:tabelaPesquisas",
            "formPesquisa:tabelaPesquisas_pagination": "true", "formPesquisa:tabelaPesquisas_first": String(offset), "formPesquisa:tabelaPesquisas_rows": String(pageSize), "formPesquisa:tabelaPesquisas_encodeFeature": "true", "javax.faces.ViewState": viewState(response.body) })
          delete fields["formPesquisa:idBtnPesquisar"]
        }
        if (total === 50) result.errors.push("teto público de 50 registros atingido; reduzir período")
        if (offset < total!) result.errors.push("limite de páginas; paginação não esgotada")
        if (records.size !== total) result.errors.push("contagem única difere do total informado; duplicação ou alteração da lista")
        result.query_exhausted = result.errors.length === 0 && offset === total
        result.status = result.query_exhausted ? "observed" : "partial"
        break
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        if (attempt === 0 && /sessão expirada/.test(reason)) { result.session_restarts++; continue }
        result.errors.push(reason)
        result.status = result.pages.length ? "partial" : "failed"
        break
      }
    }
    result.records = [...records.values()].sort((a, b) => a.registration_id.localeCompare(b.registration_id))
  }
  return { schema_version: "pesquisas-registros-v1", election: "Eleições Gerais 2026", date_from: input.dateFrom, date_to: input.dateTo, geographies, budget: budget.snapshot() }
}

export async function consultarRegistroPesqele(
  registrationId: string,
  client: ClienteHttpMonitoramento = criarClienteHttpMonitoramento({
    allowedOrigins: [PESQELE_ORIGIN], allowedFormUrls: [SEARCH_URL],
    sessionCookieNames: ["JSESSIONID", "sticky", "oam.Flash.RENDERMAP.TOKEN", "TS01a390f9"],
    logger: (message) => console.error(`[monitor:pesqele] ${message}`),
  }),
): Promise<ObservacaoPesqele> {
  if (!/^[A-Z]{2}-\d{5}\/2026$/.test(registrationId)) throw new Error("PesqEle: identificação inválida")
  const initial = await client.getText(SEARCH_URL)
  const form = requiredMatch(initial.body, /<form id="formPesquisa"[\s\S]*?<\/form>/, "formulário")[0]
  const electionSelect = requiredMatch(form, /<select[^>]*name="formPesquisa:eleicoes_input"[^>]*>([\s\S]*?)<\/select>/, "eleições")[1]
  const election = [...electionSelect.matchAll(/<option value="([^"]+)"[^>]*>([\s\S]*?)<\/option>/g)]
    .filter((match) => publicText(match[2]) === "Eleições Gerais 2026")
  if (election.length !== 1) throw new Error("PesqEle: eleição ausente ou ambígua")
  const searchInput = requiredMatch(form, /<input[^>]*id="(formPesquisa:[^"]+)"[^>]*placeholder="Informe o n[^\"]*"/i, "filtro de registro")[1]
  const fields: Record<string, string> = {
    "javax.faces.partial.ajax": "true", "javax.faces.source": "formPesquisa:idBtnPesquisar",
    "javax.faces.partial.execute": "@all", "javax.faces.partial.render": "formPesquisa",
    "formPesquisa:idBtnPesquisar": "formPesquisa:idBtnPesquisar", formPesquisa: "formPesquisa", formPesquisa_SUBMIT: "1",
    "formPesquisa:eleicoes_input": election[0][1], [searchInput]: registrationId.replace(/[-/]/g, ""),
    "javax.faces.ViewState": viewState(form),
  }
  const found = await client.postForm(SEARCH_URL, fields)
  const detailIds = [...found.body.matchAll(/<a[^>]*id="(formPesquisa:tabelaPesquisas:\d+:detalhar)"/g)]
  const foundText = publicText(found.body.replaceAll("<![CDATA[", "").replaceAll("]]>", ""))
  if (detailIds.length !== 1 || !foundText.includes(registrationId)) throw new Error("PesqEle: resultado ausente ou ambíguo")
  const detailFields = { ...fields, "javax.faces.source": detailIds[0][1], [detailIds[0][1]]: detailIds[0][1], "javax.faces.ViewState": viewState(found.body) }
  delete detailFields["formPesquisa:idBtnPesquisar"]
  delete detailFields["javax.faces.partial.render"]
  const navigation = await client.postForm(SEARCH_URL, detailFields)
  const redirect = decodeEntities(requiredMatch(navigation.body, /<redirect url="([^"]+)"/, "detalhes")[1])
  if (new URL(redirect, PESQELE_ORIGIN).href !== DETAIL_URL) throw new Error("PesqEle: destino de detalhes não autorizado")
  const detail = await client.getText(DETAIL_URL)
  return parseDetalhePesqele(detail.body, registrationId, detail.observedAt)
}

import { getEstadoNome } from "../../src/lib/br-uf"
import { INITIAL_SEARCH_START, SOURCES, type CandidatoFalas, type FonteFalas } from "./falas-monitoramento"

export const SCHEMA_PLANO_BUSCA = "falas-plano-busca-v1" as const
export const TIPOS_EVENTO = ["debate", "entrevista", "sabatina"] as const
export const MODOS_BUSCA = ["primeira_carga", "recorrente"] as const
export const JANELAS_PRIMEIRA_CARGA = ["14d", "campanha"] as const
export const JANELAS_RECORRENTE = ["14d"] as const
export const MAX_QUERIES_POR_CANDIDATO_ETAPA_PADRAO = 12

export type TipoEventoBusca = (typeof TIPOS_EVENTO)[number]
export type ModoBusca = (typeof MODOS_BUSCA)[number]
export type IdJanelaBusca = (typeof JANELAS_PRIMEIRA_CARGA)[number]
export type EtapaBusca =
  | "nome_evento_cargo_uf"
  | "nome_evento_sem_cargo"
  | "nome_completo_alias_comprovado"
  | "fonte_regional_aprovada"
  | "programas_e_atribuicao"
  | "ano_estado"

export interface ProvaAliasBusca {
  source_url: string
  excerpt: string
  source_sha256?: string
}

export interface AliasComprovadoBusca {
  alias: string
  proof: ProvaAliasBusca
}

export type CandidatoPlanoBusca = CandidatoFalas & {
  aliases?: readonly AliasComprovadoBusca[]
}

export interface FonteRegionalBusca {
  id?: string
  origin: string
  publisher?: string
}

export type MapaFontesPorUf = Readonly<Record<string, readonly string[]>>

const IDS_FONTES_REGIONAIS_POR_UF: Readonly<Record<string, readonly string[]>> = {
  AC: ["portal-acre", "gazeta-do-acre", "contilnet", "ac24horas", "o-rio-branco"], AL: ["bnews-alagoas", "gazetaweb", "br104", "o-alagoano"], AM: ["a-critica", "marcos-santos", "diario-capital", "amazonas1", "o-poder"], AP: ["g1", "selesnafes", "diario-amapa", "the-papo"],
  BA: ["bahia-noticias", "politica-livre", "salvador-fm", "bnews", "a-tarde"], CE: ["diario-nordeste", "o-povo"], DF: ["correio", "jornal-brasilia"],
  ES: ["a-gazeta", "aqui-noticias", "tribuna"], GO: ["mais-goias", "a-redacao"], MA: ["imirante", "sua-cidade", "o-imparcial", "gazeta-carajas"], MG: ["estado-minas", "itatiaia", "o-tempo"], MS: ["a-critica-ms", "g1", "primeira-pagina"], MT: ["gazeta-digital", "tv-unica", "vgn", "fatos-mt"],
  PA: ["estado-para"], PB: ["clickpb", "poder-paraiba", "paraiba-ja", "portal-midia", "pop-noticias", "pode-conversar"], PE: ["jc", "nossa-voz"], PI: ["meio-news", "band-piaui", "gp1", "conecta-piaui"], PR: ["bem-parana", "g1", "bandnews-curitiba", "cbn-curitiba", "jornal-comunicacao-ufpr"],
  RJ: ["o-dia"], RN: ["tribuna-do-norte", "diogenes-direto", "mossoro-hoje", "carlos-santos", "agora-rn", "ponta-negra-news"], RO: ["informa-rondonia", "rondoniagora", "rondoniagora-amp", "news-rondonia"], RR: ["folha-bv", "roraima-em-foco", "monte-roraima"],
  RS: ["arauto", "o-correio"], SC: ["4oito", "tvbv"], SE: ["fan", "sergipe-em-foco", "inove-noticias"], SP: ["folha", "estadao", "g1"], TO: ["diario-tocantinense", "t1-noticias", "cleber-toledo", "opcao-tocantins"],
}

const IDS_FONTES_NACIONAIS_APROVADAS = ["agencia-brasil", "g1", "cnn", "folha", "estadao", "band", "poder360", "terra", "uol", "jovem-pan", "record", "monitor-mercantil"] as const

function originsForSourceIds(ids: readonly string[]): string[] {
  return ids.flatMap((id) => {
    const source = SOURCES.find((entry) => entry.id === id)
    return source ? [source.origin] : []
  })
}

function approvedSourcesForOrigins(origins: readonly string[]): readonly FonteFalas[] {
  return origins.flatMap((origin) => {
    const source = SOURCES.find((entry) => entry.origin === origin)
    return source ? [source] : []
  })
}

/** Explicit origin allowlist: a source is used for an UF only when listed here. */
export const FONTES_REGIONAIS_POR_UF: MapaFontesPorUf = Object.fromEntries(
  Object.entries(IDS_FONTES_REGIONAIS_POR_UF).map(([uf, ids]) => [uf, originsForSourceIds(ids)]),
)
export const FONTES_NACIONAIS_APROVADAS = originsForSourceIds(IDS_FONTES_NACIONAIS_APROVADAS)

export interface JanelaPlanoBusca {
  id: IdJanelaBusca
  start: string
  end: string
  after: string
  before: string
}

export interface EstadoBuscaInicial {
  attempt_status: "not_queried"
  proof_status: "not_observed"
  success_status: "pending"
}

export interface ConsultaPlanoBusca extends EstadoBuscaInicial {
  candidate_id: string
  candidate_slug: string
  stage: EtapaBusca
  stage_order: number
  window: IdJanelaBusca
  window_start: string
  window_end: string
  name: string | null
  name_kind: "nome_urna" | "nome_completo" | "alias_comprovado" | null
  event_type: TipoEventoBusca | null
  office: CandidatoFalas["cargo_disputado"] | null
  uf: string | null
  state_name: string | null
  source_id: string | null
  source_origin: string | null
  query: string
  executor: "Luna"
  runner: "Luna"
  generation_owner: "script"
  dedup_owner: "script"
  validation_owner: "script"
  escalation_owner: "Astra"
}

export interface CandidatoPlanoBuscaItem extends EstadoBuscaInicial {
  candidate_id: string
  candidate_slug: string
  candidate_name: string
  office: CandidatoFalas["cargo_disputado"]
  uf: string | null
  queue: "backfill_missing_quote" | "recurring_all"
  aliases: Array<AliasComprovadoBusca>
  rejected_aliases: Array<{ alias: string; reason: string }>
  queries: ConsultaPlanoBusca[]
}

export interface PlanoBuscaFalas {
  schema_version: typeof SCHEMA_PLANO_BUSCA
  as_of: string
  mode: ModoBusca
  windows: JanelaPlanoBusca[]
  max_queries_per_candidate_stage: number
  max_queries_total: number | null
  queue_rule: "only_candidates_without_quote" | "all_candidates"
  routing: {
    generate: "script"
    deduplicate: "script"
    validate: "script"
    search: "Luna"
    extract: "Luna"
    escalate_only: ["conflict", "authorship", "date", "identity"]
    escalation: "Astra"
  }
  candidates: CandidatoPlanoBuscaItem[]
}

type QuoteReference = { candidate_id: string; candidate_slug: string }
type CatalogInput = { quotes: readonly QuoteReference[] } | readonly QuoteReference[]
type SourceInput = FonteFalas | FonteRegionalBusca

export interface GerarPlanoBuscaInput {
  roster: readonly CandidatoPlanoBusca[]
  mode: ModoBusca
  now: Date
  catalog?: CatalogInput
  regionalSources?: readonly SourceInput[]
  regionalOriginsByUf?: MapaFontesPorUf
  maxQueriesPerCandidateStage?: number
  maxQueriesPerStage?: number
  maxQueriesTotal?: number
  electionYear?: number
}

const NORMALIZAR = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
const QUOTE_SAFE = (value: string) => value.replace(/["\r\n]/g, " ").replace(/\s+/g, " ").trim()
const STAGES: readonly { id: EtapaBusca; order: number }[] = [
  { id: "nome_evento_cargo_uf", order: 1 },
  { id: "nome_evento_sem_cargo", order: 2 },
  { id: "nome_completo_alias_comprovado", order: 3 },
  { id: "fonte_regional_aprovada", order: 4 },
  { id: "programas_e_atribuicao", order: 5 },
  { id: "ano_estado", order: 6 },
]

function dataLocal(now: Date): string {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error("Data de busca inválida")
  return now.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
}

function deslocar(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function calcularJanelasBusca(now: Date, mode: ModoBusca): JanelaPlanoBusca[] {
  const today = dataLocal(now)
  const ids = mode === "primeira_carga" ? JANELAS_PRIMEIRA_CARGA : JANELAS_RECORRENTE
  return ids.map((id) => {
    const requestedStart = id === "campanha" ? INITIAL_SEARCH_START : deslocar(today, -13)
    const start = requestedStart < INITIAL_SEARCH_START ? INITIAL_SEARCH_START : requestedStart
    if (start > today) throw new Error("Janela de busca começa no futuro")
    return { id, start, end: today, after: deslocar(start, -1), before: deslocar(today, 1) }
  })
}

function validarFonte(source: SourceInput): { id: string; origin: string; publisher: string } | null {
  if (!source || typeof source.origin !== "string") return null
  try {
    const url = new URL(source.origin)
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null
    return { id: typeof source.id === "string" && source.id.trim() ? source.id.trim() : url.hostname, origin: url.origin, publisher: typeof source.publisher === "string" ? source.publisher : "" }
  } catch { return null }
}

function provaAliasValida(value: unknown): value is AliasComprovadoBusca {
  if (!value || typeof value !== "object") return false
  const item = value as Partial<AliasComprovadoBusca>
  const proof = item.proof
  if (!item.alias?.trim() || !proof || typeof proof !== "object" || !proof.source_url?.trim() || !proof.excerpt?.trim()) return false
  try {
    const source = new URL(proof.source_url)
    if (source.protocol !== "https:" || source.username || source.password) return false
  } catch { return false }
  return !proof.source_sha256 || /^[a-f0-9]{64}$/i.test(proof.source_sha256)
}

function normalizarAliasFornecido(value: unknown): AliasComprovadoBusca | null {
  if (!value || typeof value !== "object") return null
  const item = value as Record<string, unknown>
  const rawProof = item.proof
  const proof = rawProof && typeof rawProof === "object" ? rawProof as Record<string, unknown> : item
  const alias = typeof item.alias === "string" ? item.alias : typeof item.value === "string" ? item.value : typeof item.raw_label === "string" ? item.raw_label : ""
  const sourceUrl = typeof proof.source_url === "string" ? proof.source_url : typeof proof.url === "string" ? proof.url : typeof proof.article_url === "string" ? proof.article_url : ""
  const excerpt = typeof proof.excerpt === "string" ? proof.excerpt : typeof proof.identity_excerpt === "string" ? proof.identity_excerpt : typeof proof.alias_party_excerpt === "string" ? proof.alias_party_excerpt : ""
  const hash = typeof proof.source_sha256 === "string" ? proof.source_sha256 : typeof proof.sha256 === "string" ? proof.sha256 : undefined
  const normalized = { alias, proof: { source_url: sourceUrl, excerpt, ...(hash ? { source_sha256: hash } : {}) } }
  return provaAliasValida(normalized) ? normalized : null
}

function nomesDoCandidato(candidate: CandidatoPlanoBusca): {
  names: Array<{ value: string; kind: "nome_urna" | "nome_completo" | "alias_comprovado" }>
  acceptedAliases: AliasComprovadoBusca[]
  rejectedAliases: Array<{ alias: string; reason: string }>
} {
  const base = [
    { value: candidate.nome_urna, kind: "nome_urna" as const },
    { value: candidate.nome_completo, kind: "nome_completo" as const },
  ]
  const seen = new Set(base.map((entry) => NORMALIZAR(entry.value)).filter(Boolean))
  const acceptedAliases: AliasComprovadoBusca[] = []
  const rejectedAliases: Array<{ alias: string; reason: string }> = []
  for (const raw of Array.isArray(candidate.aliases) ? candidate.aliases : []) {
    const alias = typeof raw === "object" && raw !== null && typeof (raw as { alias?: unknown }).alias === "string" ? (raw as { alias: string }).alias.trim() : ""
    const normalized = normalizarAliasFornecido(raw)
    if (!normalized) {
      rejectedAliases.push({ alias, reason: "alias sem prova HTTPS e trecho literal" })
      continue
    }
    const key = NORMALIZAR(normalized.alias)
    if (!key || seen.has(key)) continue
    seen.add(key)
    acceptedAliases.push({ alias: normalized.alias.trim(), proof: { ...normalized.proof, source_url: normalized.proof.source_url.trim(), excerpt: normalized.proof.excerpt.trim() } })
  }
  acceptedAliases.sort((a, b) => NORMALIZAR(a.alias).localeCompare(NORMALIZAR(b.alias)) || a.alias.localeCompare(b.alias))
  return { names: [...base, ...acceptedAliases.map((alias) => ({ value: alias.alias, kind: "alias_comprovado" as const }))], acceptedAliases, rejectedAliases }
}

function textoJanela(query: string, window: JanelaPlanoBusca): string {
  return `${query} after:${window.after} before:${window.before}`
}

function nomeExato(value: string): string {
  const name = QUOTE_SAFE(value)
  if (!name) throw new Error("Nome de candidato vazio")
  return `"${name}"`
}

function scope(candidate: CandidatoPlanoBusca): { office: string; uf: string; stateName: string } {
  const uf = candidate.estado?.trim().toUpperCase() || "BR"
  const stateName = candidate.estado ? getEstadoNome(candidate.estado) ?? candidate.estado.trim() : "Brasil"
  return { office: candidate.cargo_disputado.toLowerCase(), uf, stateName }
}

function sourcesForCandidate(candidate: CandidatoPlanoBusca, input: GerarPlanoBuscaInput): readonly SourceInput[] {
  if (input.regionalSources !== undefined) return input.regionalSources
  const map = input.regionalOriginsByUf ?? FONTES_REGIONAIS_POR_UF
  const location = scope(candidate)
  const origins = candidate.cargo_disputado === "Presidente" || location.uf === "BR" ? FONTES_NACIONAIS_APROVADAS : map[location.uf] ?? []
  return approvedSourcesForOrigins(origins)
}

function queryPara(input: {
  stage: EtapaBusca
  candidate: CandidatoPlanoBusca
  name: { value: string; kind: "nome_urna" | "nome_completo" | "alias_comprovado" } | null
  event: TipoEventoBusca | null
  window: JanelaPlanoBusca
  source?: { id: string; origin: string }
  year: number
}): Omit<ConsultaPlanoBusca, keyof EstadoBuscaInicial> {
  const { candidate, stage, name, event, window, source, year } = input
  const location = scope(candidate)
  const exact = name ? nomeExato(name.value) : ""
  const eventTerm = event ?? ""
  let query: string
  switch (stage) {
    case "nome_evento_cargo_uf": query = `${exact} ${eventTerm} ${location.office} ${location.uf}`; break
    case "nome_evento_sem_cargo": query = `${exact} ${eventTerm} ${location.uf}`; break
    case "nome_completo_alias_comprovado": query = `${exact} ${eventTerm} ${location.office} ${location.uf}`; break
    case "fonte_regional_aprovada": query = `${exact} ${eventTerm} ${location.uf} site:${new URL(source!.origin).hostname}`; break
    case "programas_e_atribuicao": {
      const terms = event === "debate" ? '(debate OR "confronto de propostas" OR "encontro dos candidatos")' : event === "entrevista" ? '(entrevista OR "disse à" OR "afirmou à" OR "Roda Viva" OR coletiva OR "cumpre agenda" OR "diz que" OR "foi questionado" OR "declarou" OR "durante a campanha")' : '(sabatina OR rádio OR TV OR podcast OR "Bom Dia" OR "Jornal da Manhã")'
      query = `${exact} ${terms} ${location.stateName}`
      break
    }
    case "ano_estado": query = `${exact} ${eventTerm} ${year} ${location.stateName}`; break
  }
  return {
    candidate_id: candidate.id, candidate_slug: candidate.slug, stage, stage_order: STAGES.find((entry) => entry.id === stage)!.order,
    window: window.id, window_start: window.start, window_end: window.end,
    name: name?.value ?? null, name_kind: name?.kind ?? null, event_type: event, office: stage === "ano_estado" ? null : candidate.cargo_disputado,
    uf: location.uf, state_name: location.stateName, source_id: source?.id ?? null, source_origin: source?.origin ?? null,
    query: textoJanela(query.replace(/\s+/g, " ").trim(), window), executor: "Luna", runner: "Luna", generation_owner: "script", dedup_owner: "script", validation_owner: "script", escalation_owner: "Astra",
  }
}

function identityKey(candidate: Pick<CandidatoFalas, "id" | "slug">): string { return `${candidate.id}\u0000${candidate.slug}` }
function planIdentityKey(candidate: { candidate_id: string; candidate_slug: string }): string { return `${candidate.candidate_id}\u0000${candidate.candidate_slug}` }
function queryKey(query: Pick<ConsultaPlanoBusca, "query">): string { return NORMALIZAR(query.query) }

function consultasDaEtapa(candidate: CandidatoPlanoBusca, stage: EtapaBusca, windows: readonly JanelaPlanoBusca[], sources: readonly { id: string; origin: string }[], year: number, names: ReturnType<typeof nomesDoCandidato>["names"]): ConsultaPlanoBusca[] {
  const rows: ConsultaPlanoBusca[] = []
  const stageNames = stage === "nome_completo_alias_comprovado" ? names.filter((name) => name.kind !== "nome_urna") : names.filter((name) => name.kind !== "alias_comprovado")
  for (const window of windows) {
    if (stage === "ano_estado") for (const name of stageNames) for (const event of TIPOS_EVENTO) rows.push(queryPara({ stage, candidate, name, event, window, year }) as ConsultaPlanoBusca)
    else if (stage === "fonte_regional_aprovada") {
      // Visit every source before spending the stage budget on another variant.
      // Rotate event terms across sources so a short budget retains diversity.
      for (const name of stageNames) for (let variant = 0; variant < TIPOS_EVENTO.length; variant++) {
        for (let index = 0; index < sources.length; index++) {
          const event = TIPOS_EVENTO[(variant + index) % TIPOS_EVENTO.length]
          rows.push(queryPara({ stage, candidate, name, event, window, source: sources[index], year }) as ConsultaPlanoBusca)
        }
      }
    }
    else for (const name of stageNames) for (const event of TIPOS_EVENTO) rows.push(queryPara({ stage, candidate, name, event, window, year }) as ConsultaPlanoBusca)
  }
  const seen = new Set<string>()
  return rows.filter((row) => { const key = queryKey(row); if (seen.has(key)) return false; seen.add(key); return true })
}

/** Take a bounded stage in window round-robin order so older windows remain visible. */
function limitarEtapaDistribuida(rows: readonly ConsultaPlanoBusca[], windows: readonly JanelaPlanoBusca[], limit: number): ConsultaPlanoBusca[] {
  if (limit === 0) return []
  const byWindow = new Map(windows.map((window) => [window.id, rows.filter((row) => row.window === window.id)]))
  const offsets = new Map(windows.map((window) => [window.id, 0]))
  const result: ConsultaPlanoBusca[] = []
  while (result.length < limit) {
    let added = false
    for (const window of windows) {
      const bucket = byWindow.get(window.id) ?? []
      const offset = offsets.get(window.id) ?? 0
      if (offset >= bucket.length) continue
      result.push(bucket[offset]); offsets.set(window.id, offset + 1); added = true
      if (result.length >= limit) break
    }
    if (!added) break
  }
  return result
}

function catalogQuotes(input: CatalogInput | undefined): readonly QuoteReference[] {
  if (!input) return []
  return Array.isArray(input) ? input as readonly QuoteReference[] : (input as { quotes: readonly QuoteReference[] }).quotes
}

function validaLimite(value: number | undefined, fallback: number, label: string): number {
  const result = value ?? fallback
  if (!Number.isSafeInteger(result) || result < 0) throw new Error(`${label} inválido`)
  return result
}

export function gerarPlanoBuscaFalas(input: GerarPlanoBuscaInput): PlanoBuscaFalas {
  if (!MODOS_BUSCA.includes(input.mode)) throw new Error("Modo de busca inválido")
  if (!Array.isArray(input.roster)) throw new Error("Roster de busca inválido")
  const maxPerStage = validaLimite(input.maxQueriesPerCandidateStage ?? input.maxQueriesPerStage, MAX_QUERIES_POR_CANDIDATO_ETAPA_PADRAO, "Limite por etapa")
  const maxTotal = input.maxQueriesTotal === undefined ? null : validaLimite(input.maxQueriesTotal, 0, "Limite total")
  const year = input.electionYear ?? 2026
  if (!Number.isSafeInteger(year) || year < 1900 || year > 2100) throw new Error("Ano eleitoral inválido")
  const identities = new Set<string>()
  const candidates = [...input.roster].sort((a, b) => identityKey(a).localeCompare(identityKey(b)))
  for (const candidate of candidates) {
    if (typeof candidate.id !== "string" || !candidate.id.trim() || typeof candidate.slug !== "string" || !candidate.slug.trim() || typeof candidate.nome_urna !== "string" || !candidate.nome_urna.trim() || typeof candidate.nome_completo !== "string" || !candidate.nome_completo.trim() || !["Presidente", "Governador"].includes(candidate.cargo_disputado)) throw new Error("Identidade de candidatura inválida")
    const key = identityKey(candidate)
    if (identities.has(key)) throw new Error("Candidato duplicado na descoberta")
    identities.add(key)
  }
  const covered = new Set(catalogQuotes(input.catalog).map(planIdentityKey))
  const queued = candidates.filter((candidate) => input.mode === "recorrente" || !covered.has(identityKey(candidate)))
  const windows = calcularJanelasBusca(input.now, input.mode)
  // The approved catalog is not a geography map. Regional sources are used
  // only when the caller supplies the subset relevant to this run/UF.
  const globalSeen = new Set<string>()
  let totalAccepted = 0
  const items: CandidatoPlanoBuscaItem[] = queued.map((candidate) => {
    const names = nomesDoCandidato(candidate)
    const all: ConsultaPlanoBusca[] = []
    const sourceRows = sourcesForCandidate(candidate, input).map(validarFonte).filter((source): source is { id: string; origin: string; publisher: string } => Boolean(source))
      .sort((a, b) => a.id.localeCompare(b.id) || a.origin.localeCompare(b.origin))
    const selectedByStage = new Map<EtapaBusca, ConsultaPlanoBusca[]>()
    for (const stage of STAGES) selectedByStage.set(stage.id, limitarEtapaDistribuida(consultasDaEtapa(candidate, stage.id, windows, sourceRows, year, names.names), windows, maxPerStage))
    // Preserve operational priority: all stages for the narrowest window are
    // emitted before widening the same candidate's window.
    for (const window of windows) for (const stage of STAGES) {
      for (const row of (selectedByStage.get(stage.id) ?? []).filter((entry) => entry.window === window.id)) {
        const key = queryKey(row)
        const candidateQueryKey = `${identityKey(candidate)}\u0000${key}`
        if (globalSeen.has(candidateQueryKey)) continue
        if (maxTotal !== null && totalAccepted >= maxTotal) continue
        globalSeen.add(candidateQueryKey); all.push({ ...row, attempt_status: "not_queried", proof_status: "not_observed", success_status: "pending" }); totalAccepted++
      }
    }
    return {
      candidate_id: candidate.id, candidate_slug: candidate.slug, candidate_name: candidate.nome_urna, office: candidate.cargo_disputado, uf: candidate.estado,
      queue: input.mode === "recorrente" ? "recurring_all" : "backfill_missing_quote", aliases: names.acceptedAliases, rejected_aliases: names.rejectedAliases,
      attempt_status: "not_queried", proof_status: "not_observed", success_status: "pending", queries: all,
    }
  })
  const plan: PlanoBuscaFalas = {
    schema_version: SCHEMA_PLANO_BUSCA, as_of: dataLocal(input.now), mode: input.mode, windows, max_queries_per_candidate_stage: maxPerStage, max_queries_total: maxTotal,
    queue_rule: input.mode === "recorrente" ? "all_candidates" : "only_candidates_without_quote",
    routing: { generate: "script", deduplicate: "script", validate: "script", search: "Luna", extract: "Luna", escalate_only: ["conflict", "authorship", "date", "identity"], escalation: "Astra" }, candidates: items,
  }
  validarPlanoBuscaFalas(plan)
  return plan
}

export const construirPlanoBuscaFalas = gerarPlanoBuscaFalas

export function validarPlanoBuscaFalas(plan: PlanoBuscaFalas): void {
  if (!plan || plan.schema_version !== SCHEMA_PLANO_BUSCA || !MODOS_BUSCA.includes(plan.mode) || !Array.isArray(plan.windows) || !Array.isArray(plan.candidates)) throw new Error("Plano de busca inválido")
  const ids = new Set<string>()
  for (const candidate of plan.candidates) {
    const id = planIdentityKey(candidate)
    if (!candidate.candidate_id || !candidate.candidate_slug || ids.has(id) || !Array.isArray(candidate.queries)) throw new Error("Candidato ausente ou duplicado no plano")
    ids.add(id)
    for (const alias of candidate.aliases) if (!provaAliasValida(alias)) throw new Error("Alias sem prova no plano")
    const candidateQueries = new Set<string>()
    for (const query of candidate.queries) {
      if (planIdentityKey(query) !== id || query.executor !== "Luna" || query.runner !== "Luna" || query.generation_owner !== "script" || query.dedup_owner !== "script" || query.validation_owner !== "script" || query.escalation_owner !== "Astra") throw new Error("Consulta sem roteamento ou identidade válida")
      const key = queryKey(query)
      if (candidateQueries.has(key)) throw new Error("Consulta duplicada no candidato")
      candidateQueries.add(key)
      if (query.attempt_status !== "not_queried" || query.proof_status !== "not_observed" || query.success_status !== "pending") throw new Error("Estados iniciais de consulta inválidos")
    }
  }
  const expectedWindows = plan.mode === "primeira_carga" ? JANELAS_PRIMEIRA_CARGA : JANELAS_RECORRENTE
  if (plan.windows.map((window) => window.id).join(",") !== expectedWindows.join(",")) throw new Error("Janelas do plano inválidas")
}

export const validarPlanoBusca = validarPlanoBuscaFalas
export const normalizarNomeBusca = NORMALIZAR

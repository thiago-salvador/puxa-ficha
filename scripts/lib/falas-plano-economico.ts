import type {
  IdJanelaBusca,
  JanelaPlanoBusca,
  PlanoBuscaFalas,
} from "./falas-plano-busca"

export const SCHEMA_PLANO_ECONOMICO = "falas-plano-economico-v1" as const
export const MAX_CANDIDATOS_POR_LOTE_ECONOMICO = 8
export const DEFAULT_CANDIDATOS_POR_LOTE_ECONOMICO = 4
export const TERMOS_BUSCA_ECONOMICA = ["debate", "entrevista", "sabatina", "declarações", "campanha"] as const
export const RESULTADOS_COBERTURA_ECONOMICA = ["found", "empty", "no_results"] as const

export interface ConsultaPlanoEconomico {
  candidate_id: string
  candidate_slug: string
  candidate_name: string
  office: string
  uf: string
  window: IdJanelaBusca
  window_start: string
  window_end: string
  after: string
  before: string
  query: string
  google_query: string
}

export interface CandidatoPlanoEconomico {
  candidate_id: string
  candidate_slug: string
  candidate_name: string
  office: string
  uf: string
  queries: ConsultaPlanoEconomico[]
}

export interface LotePlanoEconomico {
  batch_id: string
  uf: string
  office: string
  candidates: CandidatoPlanoEconomico[]
  perplexity_prompt: string
  fallback_google_queries: ConsultaPlanoEconomico[]
}

export interface ContratoRespostaPlanoEconomico {
  result_values: readonly ["found", "empty", "no_results"]
  status_values: readonly ["executed", "no_results", "blocked"]
  required_fields: readonly ["id", "slug", "status", "result", "response_excerpt", "evidence_ref", "provider", "source_id"]
  provider_values: readonly ["google", "perplexity"]
  blocked_representation: string
  source_rule: string
  collector_fields: string
}

export interface PoliticaCapturaPlanoEconomico {
  truncated_or_missing_response: string
  unseen_ids: string
}

export interface PlanoEconomicoFalas {
  schema_version: typeof SCHEMA_PLANO_ECONOMICO
  as_of: string
  mode: PlanoBuscaFalas["mode"]
  windows: JanelaPlanoBusca[]
  batch_size: number
  response_contract: ContratoRespostaPlanoEconomico
  capture_policy: PoliticaCapturaPlanoEconomico
  candidate_count: number
  fallback_plan_schema: PlanoBuscaFalas["schema_version"]
  fallback_plan_path?: string
  batches: LotePlanoEconomico[]
}

export interface GerarPlanoEconomicoOptions {
  batchSize?: number
  fallbackPlanPath?: string
}

function identidade(candidate: { candidate_id: string; candidate_slug: string }): string {
  return `${candidate.candidate_id}\u0000${candidate.candidate_slug}`
}

function valorSeguro(value: string): string {
  return value.replace(/[\r\n"]+/g, " ").replace(/\s+/g, " ").trim()
}

function ufEconomica(value: string | null | undefined): string {
  const uf = typeof value === "string" ? value.trim().toUpperCase() : ""
  return uf || "BR"
}

function queryEconomica(candidate: CandidatoPlanoEconomico, window: JanelaPlanoBusca): string {
  const name = valorSeguro(candidate.candidate_name)
  const office = valorSeguro(candidate.office).toLowerCase()
  const terms = TERMOS_BUSCA_ECONOMICA.join(" OR ")
  return `"${name}" ${office} ${candidate.uf} (${terms}) after:${window.after} before:${window.before}`
}

function consultaEconomica(
  candidate: CandidatoPlanoEconomico,
  window: JanelaPlanoBusca,
): ConsultaPlanoEconomico {
  const query = queryEconomica(candidate, window)
  return {
    candidate_id: candidate.candidate_id,
    candidate_slug: candidate.candidate_slug,
    candidate_name: candidate.candidate_name,
    office: candidate.office,
    uf: candidate.uf,
    window: window.id,
    window_start: window.start,
    window_end: window.end,
    after: window.after,
    before: window.before,
    query,
    google_query: query,
  }
}

function promptPerplexity(candidates: readonly CandidatoPlanoEconomico[], windows: readonly JanelaPlanoBusca[]): string {
  const rows = candidates.map((candidate, index) => {
    const windowsSummary = candidate.queries.map((query) => `${query.window}:${query.window_start}..${query.window_end}`).join(",")
    return `[${index + 1}] id=${candidate.candidate_id} slug=${candidate.candidate_slug} nome=${valorSeguro(candidate.candidate_name)} cargo=${valorSeguro(candidate.office)} UF=${candidate.uf} janelas=${windowsSummary}`
  }).join("\n")
  const windowSummary = windows.map((window) => `${window.id}=${window.start}..${window.end}`).join(", ")
  return [
    "Busque registros jornalísticos originais sobre cada candidato, procurando falas em debates, entrevistas, sabatinas, declarações e atividades de campanha, dentro das janelas indicadas.",
    "Pesquise cada candidato individualmente e responda de forma compacta.",
    `Janelas obrigatórias: ${windowSummary}.`,
    "Responda com um item separado para cada índice, preservando exatamente id e slug.",
    "Não aceite nem produza resposta coletiva: uma resposta sem índice, id e slug individual é inválida e não pode ser contada.",
    "Formato obrigatório por item: [índice] id=... slug=... status=executed|no_results|blocked result=found|empty|no_results url=uma_URL_original_ou_null response_excerpt=resumo_curto evidence_ref=collector_filled_or_null provider=collector_filled source_id=collector_filled collected_at=collector_filled.",
    "Use status=no_results e result=no_results somente quando a busca foi executada e não encontrou resultado; use status=blocked e result=empty para bloqueio. Nunca omita um candidato.",
    "Não invente evidence_ref, provider, source_id ou collected_at: o coletor preenche esses campos. Não inclua prosa de citação nem mais de uma URL.",
    "A resposta deve conter somente esses campos compactos por item; não conte IDs ausentes ou resposta truncada.",
    rows,
  ].join("\n")
}

function validarBatchSize(batchSize: number | undefined): number {
  const value = batchSize ?? DEFAULT_CANDIDATOS_POR_LOTE_ECONOMICO
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_CANDIDATOS_POR_LOTE_ECONOMICO) {
    throw new Error(`Tamanho de lote econômico inválido: use inteiro entre 1 e ${MAX_CANDIDATOS_POR_LOTE_ECONOMICO}`)
  }
  return value
}

export function gerarPlanoEconomicoFalas(
  plan: PlanoBuscaFalas,
  options: GerarPlanoEconomicoOptions = {},
): PlanoEconomicoFalas {
  const batchSize = validarBatchSize(options.batchSize)
  if (!plan || !Array.isArray(plan.candidates) || !Array.isArray(plan.windows) || plan.windows.length === 0) {
    throw new Error("Plano de busca inválido para plano econômico")
  }

  const candidates: CandidatoPlanoEconomico[] = plan.candidates.map((candidate) => {
    const compact: CandidatoPlanoEconomico = {
      candidate_id: candidate.candidate_id,
      candidate_slug: candidate.candidate_slug,
      candidate_name: candidate.candidate_name,
      office: candidate.office,
      uf: ufEconomica(candidate.uf),
      queries: [],
    }
    compact.queries = plan.windows.map((window) => consultaEconomica(compact, window))
    return compact
  }).sort((a, b) => {
    const group = `${a.uf}\u0000${a.office}`.localeCompare(`${b.uf}\u0000${b.office}`)
    return group || identidade(a).localeCompare(identidade(b))
  })

  const seen = new Set<string>()
  for (const candidate of candidates) {
    const key = identidade(candidate)
    if (!candidate.candidate_id || !candidate.candidate_slug || seen.has(key)) throw new Error("Candidato ausente ou duplicado no plano econômico")
    seen.add(key)
  }

  const batches: LotePlanoEconomico[] = []
  let batchNumber = 0
  for (let groupStart = 0; groupStart < candidates.length;) {
    const first = candidates[groupStart]
    let groupEnd = groupStart + 1
    while (groupEnd < candidates.length && candidates[groupEnd].uf === first.uf && candidates[groupEnd].office === first.office) groupEnd++
    const group = candidates.slice(groupStart, groupEnd)
    for (let offset = 0; offset < group.length; offset += batchSize) {
      const batchCandidates = group.slice(offset, offset + batchSize)
      batchNumber++
      const batchId = String(batchNumber).padStart(3, "0")
      const batch: LotePlanoEconomico = {
        batch_id: `${first.uf}-${first.office.toLowerCase()}-${batchId}`,
        uf: first.uf,
        office: first.office,
        candidates: batchCandidates,
        perplexity_prompt: promptPerplexity(batchCandidates, plan.windows),
        fallback_google_queries: batchCandidates.flatMap((candidate) => candidate.queries),
      }
      batches.push(batch)
    }
    groupStart = groupEnd
  }

  const covered = batches.flatMap((batch) => batch.candidates).map(identidade)
  if (covered.length !== seen.size || new Set(covered).size !== seen.size || covered.some((key) => !seen.has(key))) {
    throw new Error("Cobertura de candidatos inválida no plano econômico")
  }

  const economicPlan: PlanoEconomicoFalas = {
    schema_version: SCHEMA_PLANO_ECONOMICO,
    as_of: plan.as_of,
    mode: plan.mode,
    windows: plan.windows.map((window) => ({ ...window })),
    batch_size: batchSize,
    response_contract: {
      result_values: RESULTADOS_COBERTURA_ECONOMICA,
      status_values: ["executed", "no_results", "blocked"],
      required_fields: ["id", "slug", "status", "result", "response_excerpt", "evidence_ref", "provider", "source_id"],
      provider_values: ["google", "perplexity"],
      blocked_representation: "status=blocked exige result=empty; nunca converta bloqueio em result=no_results",
      source_rule: "no máximo uma URL original por candidato",
      collector_fields: "evidence_ref, provider, source_id e collected_at são preenchidos pelo coletor; o modelo não os inventa",
    },
    capture_policy: {
      truncated_or_missing_response: "ler a resposta completa do provedor antes de acionar o fallback Google",
      unseen_ids: "IDs ausentes ou não lidos nunca contam como no_results e não podem ser descartados",
    },
    candidate_count: candidates.length,
    fallback_plan_schema: plan.schema_version,
    ...(options.fallbackPlanPath ? { fallback_plan_path: options.fallbackPlanPath } : {}),
    batches,
  }
  validarPlanoEconomicoFalas(economicPlan)
  return economicPlan
}

export function validarPlanoEconomicoFalas(plan: PlanoEconomicoFalas): void {
  if (!plan || plan.schema_version !== SCHEMA_PLANO_ECONOMICO || !Array.isArray(plan.windows) || !Array.isArray(plan.batches)) throw new Error("Plano econômico inválido")
  validarBatchSize(plan.batch_size)
  const candidates = plan.batches.flatMap((batch) => batch.candidates)
  if (plan.candidate_count !== candidates.length) throw new Error("Contagem de candidatos inválida no plano econômico")
  const identities = new Set<string>()
  for (const batch of plan.batches) {
    if (!batch.batch_id || !batch.uf || !batch.office || batch.candidates.length < 1 || batch.candidates.length > plan.batch_size) throw new Error("Lote econômico inválido")
    if (!batch.perplexity_prompt.includes("id=") || !batch.perplexity_prompt.includes("slug=") || /resposta coletiva/i.test(batch.perplexity_prompt) === false) throw new Error("Prompt Perplexity sem contrato individual")
    for (const candidate of batch.candidates) {
      const key = identidade(candidate)
      if (identities.has(key) || candidate.uf !== batch.uf || candidate.office !== batch.office) throw new Error("Candidato ausente, duplicado ou fora do grupo no lote econômico")
      identities.add(key)
      if (candidate.queries.length !== plan.windows.length) throw new Error("Consulta econômica sem todas as janelas")
      for (const query of candidate.queries) {
        const window = plan.windows.find((entry) => entry.id === query.window)
        if (!window || query.candidate_id !== candidate.candidate_id || query.candidate_slug !== candidate.candidate_slug || query.window_start !== window.start || query.window_end !== window.end || query.after !== window.after || query.before !== window.before) throw new Error("Consulta econômica fora da janela do plano")
        for (const term of TERMOS_BUSCA_ECONOMICA) if (!query.query.includes(term)) throw new Error("Consulta econômica sem termo amplo")
        if (query.google_query !== query.query) throw new Error("Fallback Google diverge da consulta individual")
      }
    }
    const fallbackKeys = new Set(batch.fallback_google_queries.map(identidade))
    if (fallbackKeys.size !== batch.candidates.length || batch.fallback_google_queries.some((query) => !identities.has(identidade(query)))) throw new Error("Fallback Google sem cobertura individual")
  }
}

export const construirPlanoEconomicoFalas = gerarPlanoEconomicoFalas

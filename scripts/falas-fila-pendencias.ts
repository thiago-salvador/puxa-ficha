import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

export const SCHEMA_PENDENCIAS_ECONOMICAS = "falas-pendencias-economicas-v1" as const
export const SCHEMA_RECIBOS_PENDENCIAS = "falas-pendencias-recibos-v1" as const
export const SCHEMA_FILA_PENDENCIAS_ECONOMICA = "falas-fila-pendencias-economica-v1" as const
export const TIPOS_PENDENCIA_ECONOMICA = ["date_anchor", "source_discovery"] as const
export const STATUS_FILA_PENDENCIA = "aberto" as const
export const MAX_QUERIES_NOVAS_POR_CANDIDATO = 2

export type TipoPendenciaEconomica = (typeof TIPOS_PENDENCIA_ECONOMICA)[number]

export interface PendenciaEconomica {
  candidate_slug: string
  kind: TipoPendenciaEconomica
  next_check: string
  queries: string[]
  blocked_routes: string[]
  evidence_paths: string[]
}

export interface PendenciasEconomicasInput {
  schema_version: typeof SCHEMA_PENDENCIAS_ECONOMICAS
  tasks: PendenciaEconomica[]
}

export interface RosterCandidate {
  id: string
  slug: string
  nome_urna?: string
  nome_completo?: string
  cargo_disputado?: string
  estado?: string | null
}

export interface CatalogQuote {
  candidate_id?: string
  candidate_slug?: string
}

export interface CatalogInput {
  quotes: CatalogQuote[]
}

export interface ConsolidatedSearchesInput {
  schema_version: "falas-pesquisa-consolidada-v1"
  candidates: Array<{
    slug?: string
    candidato_id?: string
    queries?: unknown
  }>
}

export type ReceiptAttemptStatus = "executed" | "planned" | "blocked"

export interface PendenciaReceipt {
  query: string
  attempt_status: ReceiptAttemptStatus
  candidate_slugs: string[]
  outcome: string
}

export interface PendenciasReceiptsInput {
  schema_version: typeof SCHEMA_RECIBOS_PENDENCIAS
  attempts: PendenciaReceipt[]
}

export interface TarefaFilaPendencia {
  kind: TipoPendenciaEconomica
  next_check: string
  blocked_routes: string[]
  evidence_paths: string[]
}

export interface ItemFilaPendencia {
  candidate_slug: string
  tarefa: TarefaFilaPendencia
  queries_novas: string[]
  queries_ja_executadas: string[]
  status: typeof STATUS_FILA_PENDENCIA
}

export interface FilaPendenciasEconomica {
  schema_version: typeof SCHEMA_FILA_PENDENCIAS_ECONOMICA
  candidates: ItemFilaPendencia[]
}

export interface GerarFilaPendenciasEconomicaInput {
  pending: PendenciasEconomicasInput
  roster: readonly RosterCandidate[]
  catalog: CatalogInput
  consolidated: ConsolidatedSearchesInput
  receipts?: PendenciasReceiptsInput
}

const normalizarQuery = (value: string): string => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()

function erro(label: string): never {
  throw new Error(`${label} inválido`)
}

function stringNaoVazia(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) erro(label)
  return value.trim()
}

function listaDeStrings(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) erro(label)
  return value.map((entry) => entry.trim()).filter(Boolean)
}

function validarPendencias(input: unknown): PendenciasEconomicasInput {
  if (!input || typeof input !== "object" || (input as { schema_version?: unknown }).schema_version !== SCHEMA_PENDENCIAS_ECONOMICAS) erro("Arquivo de pendências econômicas")
  const tasks = (input as { tasks?: unknown }).tasks
  if (!Array.isArray(tasks)) erro("Tarefas de pendências econômicas")
  return {
    schema_version: SCHEMA_PENDENCIAS_ECONOMICAS,
    tasks: tasks.map((raw, index) => {
      if (!raw || typeof raw !== "object") erro(`Tarefa ${index + 1}`)
      const task = raw as Record<string, unknown>
      const kind = task.kind
      if (!TIPOS_PENDENCIA_ECONOMICA.includes(kind as TipoPendenciaEconomica)) erro(`Tipo da tarefa ${index + 1}`)
      return {
        candidate_slug: stringNaoVazia(task.candidate_slug, `Slug da tarefa ${index + 1}`),
        kind: kind as TipoPendenciaEconomica,
        next_check: stringNaoVazia(task.next_check, `Próxima checagem da tarefa ${index + 1}`),
        queries: listaDeStrings(task.queries, `Consultas da tarefa ${index + 1}`),
        blocked_routes: listaDeStrings(task.blocked_routes, `Rotas bloqueadas da tarefa ${index + 1}`),
        evidence_paths: listaDeStrings(task.evidence_paths, `Evidências da tarefa ${index + 1}`),
      }
    }),
  }
}

function validarRoster(input: unknown): RosterCandidate[] {
  if (!Array.isArray(input) || input.length === 0) throw new Error("Roster ausente ou vazio")
  const seen = new Set<string>()
  return input.map((raw, index) => {
    if (!raw || typeof raw !== "object") throw new Error(`Candidato ${index + 1} ausente no roster`)
    const candidate = raw as RosterCandidate
    const id = stringNaoVazia(candidate.id, `ID do roster na posição ${index + 1}`)
    const slug = stringNaoVazia(candidate.slug, `Slug do roster na posição ${index + 1}`)
    if (seen.has(slug)) throw new Error(`Candidato duplicado no roster: ${slug}`)
    seen.add(slug)
    return { ...candidate, id, slug }
  })
}

function validarCatalog(input: unknown): CatalogInput {
  if (!input || typeof input !== "object" || !Array.isArray((input as { quotes?: unknown }).quotes)) erro("Catálogo de falas")
  const quotes = (input as { quotes: unknown[] }).quotes
  if (quotes.some((quote) => !quote || typeof quote !== "object")) erro("Citação no catálogo")
  return { quotes: quotes as CatalogQuote[] }
}

function validarConsolidated(input: unknown): ConsolidatedSearchesInput {
  if (!input || typeof input !== "object" || (input as { schema_version?: unknown }).schema_version !== "falas-pesquisa-consolidada-v1" || !Array.isArray((input as { candidates?: unknown }).candidates)) erro("Histórico consolidado de buscas")
  return input as ConsolidatedSearchesInput
}

function validarReceipts(input: unknown): PendenciasReceiptsInput {
  if (!input || typeof input !== "object" || (input as { schema_version?: unknown }).schema_version !== SCHEMA_RECIBOS_PENDENCIAS) erro("Recibos de pendências econômicas")
  const attempts = (input as { attempts?: unknown }).attempts
  if (!Array.isArray(attempts)) erro("Tentativas dos recibos de pendências econômicas")
  return {
    schema_version: SCHEMA_RECIBOS_PENDENCIAS,
    attempts: attempts.map((raw, index) => {
      if (!raw || typeof raw !== "object") erro(`Recibo ${index + 1}`)
      const attempt = raw as Record<string, unknown>
      const status = attempt.attempt_status
      if (status !== "executed" && status !== "planned" && status !== "blocked") erro(`Status do recibo ${index + 1}`)
      return {
        query: stringNaoVazia(attempt.query, `Consulta do recibo ${index + 1}`),
        attempt_status: status,
        candidate_slugs: listaDeStrings(attempt.candidate_slugs, `Candidatos do recibo ${index + 1}`),
        outcome: stringNaoVazia(attempt.outcome, `Resultado do recibo ${index + 1}`),
      }
    }),
  }
}

function consultasExecutadas(consolidated: ConsolidatedSearchesInput, receipts?: PendenciasReceiptsInput): Set<string> {
  const executed = new Set<string>()
  for (const candidate of consolidated.candidates) {
    if (!Array.isArray(candidate.queries)) continue
    for (const query of candidate.queries) {
      // The consolidated v1 manifest stores completed searches as strings.
      // Object records are accepted only with an explicit executed status.
      if (typeof query === "string") {
        const key = normalizarQuery(query)
        if (key) executed.add(key)
      } else if (query && typeof query === "object" && (query as { attempt_status?: unknown }).attempt_status === "executed") {
        const value = (query as { query?: unknown }).query
        if (typeof value === "string" && value.trim()) executed.add(normalizarQuery(value))
      }
    }
  }
  for (const receipt of receipts?.attempts ?? []) {
    if (receipt.attempt_status === "executed") executed.add(normalizarQuery(receipt.query))
  }
  return executed
}

function catalogCovered(catalog: CatalogInput, candidate: RosterCandidate): boolean {
  return catalog.quotes.some((quote) => {
    if (quote.candidate_slug !== candidate.slug) return false
    return quote.candidate_id === candidate.id
  })
}

export function gerarFilaPendenciasEconomica(input: GerarFilaPendenciasEconomicaInput): FilaPendenciasEconomica {
  const pending = validarPendencias(input?.pending)
  const roster = validarRoster(input?.roster)
  const catalog = validarCatalog(input?.catalog)
  const consolidated = validarConsolidated(input?.consolidated)
  const receipts = input?.receipts === undefined ? undefined : validarReceipts(input.receipts)
  const bySlug = new Map(roster.map((candidate) => [candidate.slug, candidate]))
  const executed = consultasExecutadas(consolidated, receipts)
  const seenNew = new Set<string>(executed)
  const newCountByCandidate = new Map<string, number>()
  const candidates: ItemFilaPendencia[] = []
  const seenTasks = new Set<string>()

  const tasks = [...pending.tasks].sort((a, b) => a.candidate_slug.localeCompare(b.candidate_slug) || a.kind.localeCompare(b.kind) || a.next_check.localeCompare(b.next_check))
  for (const task of tasks) {
    const rosterCandidate = bySlug.get(task.candidate_slug)
    if (!rosterCandidate) throw new Error(`Candidato da tarefa ausente no roster: ${task.candidate_slug}`)
    if (seenTasks.has(task.candidate_slug)) throw new Error(`Mais de uma tarefa para o candidato: ${task.candidate_slug}`)
    seenTasks.add(task.candidate_slug)
    if (catalogCovered(catalog, rosterCandidate)) continue
    const queriesNew: string[] = []
    const queriesExecuted: string[] = []
    const seenTaskQueries = new Set<string>()
    const currentCount = newCountByCandidate.get(task.candidate_slug) ?? 0
    for (const query of task.queries) {
      const key = normalizarQuery(query)
      if (!key || seenTaskQueries.has(key)) continue
      seenTaskQueries.add(key)
      if (executed.has(key)) {
        queriesExecuted.push(query)
      } else if (!seenNew.has(key) && (newCountByCandidate.get(task.candidate_slug) ?? currentCount) < MAX_QUERIES_NOVAS_POR_CANDIDATO) {
        seenNew.add(key)
        queriesNew.push(query)
        newCountByCandidate.set(task.candidate_slug, (newCountByCandidate.get(task.candidate_slug) ?? currentCount) + 1)
      }
    }
    candidates.push({
      candidate_slug: task.candidate_slug,
      tarefa: { kind: task.kind, next_check: task.next_check, blocked_routes: [...task.blocked_routes], evidence_paths: [...task.evidence_paths] },
      queries_novas: queriesNew,
      queries_ja_executadas: queriesExecuted,
      status: STATUS_FILA_PENDENCIA,
    })
  }
  return { schema_version: SCHEMA_FILA_PENDENCIAS_ECONOMICA, candidates }
}

export const construirFilaPendenciasEconomica = gerarFilaPendenciasEconomica

function carregarJson(path: string): unknown {
  try { return JSON.parse(readFileSync(path, "utf8")) as unknown }
  catch (error) { throw new Error(`Não foi possível ler ${path}: ${error instanceof Error ? error.message : "JSON inválido"}`) }
}

function main(): void {
  const root = resolve(".")
  const research = resolve(root, "reports/falas-monitoramento/research")
  const pendingPath = resolve(research, "pendencias-economicas.json")
  const rosterPath = resolve(root, "reports/falas-monitoramento/roster.json")
  const catalogPath = resolve(root, "scripts/data/falas-candidatos.json")
  const consolidatedPath = resolve(research, "persistencia-buscas-consolidadas.json")
  const receiptsPath = resolve(research, "pendencias-economicas-recibos.json")
  const outputPath = resolve(root, "reports/falas-monitoramento/fila-pendencias-economica.json")
  if (!existsSync(pendingPath)) throw new Error(`Arquivo de pendências econômicas ausente: ${pendingPath}`)
  if (!existsSync(rosterPath)) throw new Error(`Roster ausente: ${rosterPath}`)
  if (!existsSync(catalogPath)) throw new Error(`Catálogo ausente: ${catalogPath}`)
  if (!existsSync(consolidatedPath)) throw new Error(`Histórico consolidado ausente: ${consolidatedPath}`)
  const fila = gerarFilaPendenciasEconomica({
    pending: carregarJson(pendingPath) as PendenciasEconomicasInput,
    roster: carregarJson(rosterPath) as RosterCandidate[],
    catalog: carregarJson(catalogPath) as CatalogInput,
    consolidated: carregarJson(consolidatedPath) as ConsolidatedSearchesInput,
    receipts: existsSync(receiptsPath) ? carregarJson(receiptsPath) as PendenciasReceiptsInput : undefined,
  })
  mkdirSync(resolve(root, "reports/falas-monitoramento"), { recursive: true })
  writeFileSync(outputPath, JSON.stringify(fila, null, 2) + "\n")
  console.log(JSON.stringify({ output: outputPath, candidates: fila.candidates.length, new_queries: fila.candidates.reduce((sum, item) => sum + item.queries_novas.length, 0) }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main() }
  catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 }
}

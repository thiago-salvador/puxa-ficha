import { randomUUID } from "crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { resolve } from "path"
import type {
  AuditCandidateResult,
  AuditHistoryEntry,
  AuditPersistentState,
  AuditPersistentStateItem,
  ProvenanceMetadata,
} from "./audit-types"
import type { CandidateAssertion } from "./factual-assertions"
import { podePublicar } from "./audit-rules"

export const STATE_PATH = resolve(process.cwd(), "scripts/audit-factual-state.json")
export const HISTORY_PATH = resolve(process.cwd(), "scripts/audit-factual-history.json")
export const RUNS_DIR = resolve(process.cwd(), "scripts/audit-factual-runs")

function readJsonFile<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback
  return JSON.parse(readFileSync(path, "utf-8")) as T
}

function buildProvenance(source: string | null): ProvenanceMetadata {
  return {
    last_edited_by: "automation",
    last_edited_source: "audit-factual",
    last_reviewed_by: source,
    last_reviewed_at: null,
  }
}

export function persistAuditState(params: {
  resultados: AuditCandidateResult[]
  filtros: Record<string, string | boolean | undefined>
  totalCandidatos: number
  resumo: Record<string, number>
  assertions: Map<string, CandidateAssertion>
  scope: string
  report: unknown
  reportPath: string
  queuePath: string
  summaryPath: string
}): void {
  const executedAt = new Date().toISOString()
  const currentState = readJsonFile<AuditPersistentState>(STATE_PATH, {
    atualizado_em: new Date(0).toISOString(),
    candidatos: {},
  })

  for (const resultado of params.resultados) {
    const assertion = params.assertions.get(resultado.slug)
    const item: AuditPersistentStateItem = {
      slug: resultado.slug,
      nome_urna: resultado.nome_urna,
      auditoria_status: resultado.auditoria_status,
      pode_publicar: podePublicar(resultado),
      ultima_execucao: resultado.timestamp,
      cohorts: assertion?.cohorts ?? [],
      source: assertion?.source ?? null,
      campos_com_fail: resultado.campos
        .filter((campo) => campo.resultado === "fail")
        .map((campo) => campo.campo),
      campos_com_warning: resultado.campos
        .filter((campo) => campo.resultado === "warning")
        .map((campo) => campo.campo),
      provenance: buildProvenance(assertion?.source ?? null),
    }
    currentState.candidatos[resultado.slug] = item
  }

  currentState.atualizado_em = executedAt
  writeFileSync(STATE_PATH, JSON.stringify(currentState, null, 2), "utf-8")

  mkdirSync(RUNS_DIR, { recursive: true })
  const safeScope = params.scope.replace(/[^a-z0-9-]+/gi, "-").toLowerCase()
  const safeTimestamp = executedAt.replace(/[:]/g, "-")
  const runReportPath = resolve(RUNS_DIR, `${safeTimestamp}-${safeScope}-report.json`)
  writeFileSync(runReportPath, JSON.stringify(params.report, null, 2), "utf-8")

  const history = readJsonFile<AuditHistoryEntry[]>(HISTORY_PATH, [])
  history.push({
    run_id: randomUUID(),
    executado_em: executedAt,
    scope: params.scope,
    filtros: params.filtros,
    total_candidatos: params.totalCandidatos,
    resumo: params.resumo,
    report_output_path: params.reportPath,
    queue_output_path: params.queuePath,
    summary_output_path: params.summaryPath,
    run_report_path: runReportPath,
  })
  writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2), "utf-8")
}

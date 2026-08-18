/**
 * Pure helpers do dual-scope do audit runtime de trajetória política.
 *
 * Ver `curadoria interna` (Fluxo 2; audit runtime dual-scope).
 *
 * Dois escopos são emitidos pelo `scripts/audit-historico-runtime.ts`:
 *
 *   - `cohort`  — apenas slugs presentes em `data/candidatos.json` (144 em 2026-04-15).
 *                 Universo operacional do fluxo de trajetória, conforme ADR-T1 da spec.
 *   - `db_total` — todos os candidatos da tabela `candidatos` (151 em 2026-04-15).
 *                 Rede de segurança para detectar drift em slugs `publicavel=false`
 *                 que possam ser reativados no futuro.
 *
 * Ambos compartilham o mesmo `displayIssuesBySlug` — apenas o conjunto de slugs
 * considerado na agregação muda entre os dois blocos.
 *
 * Estas funções são puras e testáveis sem tocar Supabase. Ver
 * `tests/audit-historico-runtime-scope.test.ts`.
 */

import { readFileSync } from "node:fs"

export type ScopeName = "cohort" | "db_total"

export type Severity = "alta" | "media" | "baixa"

export interface DisplayIssueCandidateBuckets {
  alta: string[]
  media: string[]
  baixa: string[]
}

export interface ScopeBlock {
  size: number
  total_candidatos_com_historico: number
  total_historico_rows: number
  display_issue_candidates: DisplayIssueCandidateBuckets
}

export interface CandidatoLike {
  id: string
  slug: string
}

export interface DisplayAuditLike {
  counts: Record<Severity, number>
}

/**
 * Lê `data/candidatos.json` (ou um caminho alternativo) e devolve o conjunto de
 * slugs da coorte canônica. Em caso de erro devolve `Set` vazio; os chamadores
 * devem tratar coorte vazia como "sem filtro" (fallback defensivo).
 */
export function loadCohortSlugs(seedPath: string): Set<string> {
  try {
    const raw = readFileSync(seedPath, "utf8")
    const parsed = JSON.parse(raw) as Array<{ slug?: unknown }>
    const slugs = new Set<string>()
    for (const entry of parsed) {
      if (entry && typeof entry.slug === "string" && entry.slug.length > 0) {
        slugs.add(entry.slug)
      }
    }
    return slugs
  } catch {
    return new Set<string>()
  }
}

/**
 * Filtra uma lista de candidatos pelo conjunto de slugs da coorte.
 *
 * Se a coorte está vazia (ex.: seed ausente no sandbox), devolve a lista
 * original inalterada — nenhuma filtragem acidental que viraria falso negativo
 * silencioso em CI.
 */
export function filterCohortCandidatos<T extends CandidatoLike>(
  candidatos: readonly T[],
  cohortSlugs: ReadonlySet<string>,
): T[] {
  if (cohortSlugs.size === 0) return [...candidatos]
  return candidatos.filter((c) => cohortSlugs.has(c.slug))
}

/**
 * Agrupa linhas de `historico_politico` por `candidato_id`. Pure function:
 * recebe o array e devolve um `Map` novo — útil para testar sem mockar
 * Supabase.
 */
export function groupHistoricoByCandidato<T extends { candidato_id: string }>(
  rows: readonly T[],
): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const row of rows) {
    const existing = map.get(row.candidato_id)
    if (existing) {
      existing.push(row)
    } else {
      map.set(row.candidato_id, [row])
    }
  }
  return map
}

/**
 * Constroi um `ScopeBlock` para um recorte específico (coorte ou DB inteiro).
 *
 * - `size` = número de candidatos no recorte.
 * - `total_historico_rows` = soma de linhas em `historico_politico` apenas
 *   para candidatos do recorte.
 * - `total_candidatos_com_historico` = candidatos do recorte que têm ao
 *   menos uma linha em `historico_politico`.
 * - `display_issue_candidates` = slugs do recorte que têm display issues
 *   em alta/media/baixa (sempre ordenados para output estável).
 */
export function buildScopeBlock<T extends { candidato_id: string }>(
  candidatosInScope: readonly CandidatoLike[],
  historicoByCandidato: ReadonlyMap<string, readonly T[]>,
  displayIssuesBySlug: ReadonlyMap<string, DisplayAuditLike>,
): ScopeBlock {
  const idsInScope = new Set(candidatosInScope.map((c) => c.id))
  const slugsInScope = new Set(candidatosInScope.map((c) => c.slug))

  let totalHistoricoRows = 0
  let withHistoricoCount = 0
  for (const [candidatoId, rows] of historicoByCandidato.entries()) {
    if (!idsInScope.has(candidatoId)) continue
    if (rows.length === 0) continue
    totalHistoricoRows += rows.length
    withHistoricoCount += 1
  }

  const display: DisplayIssueCandidateBuckets = { alta: [], media: [], baixa: [] }
  for (const [slug, audit] of displayIssuesBySlug.entries()) {
    if (!slugsInScope.has(slug)) continue
    for (const severity of ["alta", "media", "baixa"] as const) {
      if (audit.counts[severity] > 0) {
        display[severity].push(slug)
      }
    }
  }
  display.alta.sort()
  display.media.sort()
  display.baixa.sort()

  return {
    size: candidatosInScope.length,
    total_candidatos_com_historico: withHistoricoCount,
    total_historico_rows: totalHistoricoRows,
    display_issue_candidates: display,
  }
}

/**
 * Parser idempotente e preguiçoso do `--scope=<valor>` em `process.argv`.
 * Aceita `cohort`, `db` (alias para `db_total`), `db_total`, `both` e qualquer
 * outra string (retorna `null` para sinalizar "use default").
 */
export function parseScopeFlag(argv: readonly string[]): ScopeName | "both" | null {
  for (const arg of argv) {
    if (!arg.startsWith("--scope=")) continue
    const value = arg.slice("--scope=".length).trim().toLowerCase()
    if (value === "cohort") return "cohort"
    if (value === "db" || value === "db_total") return "db_total"
    if (value === "both") return "both"
    return null
  }
  return null
}

/**
 * Decide se o gate `--fail-on-display-issues` deve falhar, dado o escopo
 * solicitado e os blocos já calculados.
 *
 * - Sem flag (`null`) ou `both`: falha se qualquer um dos dois blocos tem
 *   issues (compatível com o comportamento DB-wide atual, porque `db_total`
 *   é superconjunto de `cohort`).
 * - `cohort`: falha apenas se a coorte tem issues.
 * - `db_total`: falha apenas se o DB total tem issues (idêntico a `both`
 *   na prática; mantido por simetria de flag).
 */
export function shouldGateFail(
  scope: ScopeName | "both" | null,
  cohortBlock: ScopeBlock,
  dbTotalBlock: ScopeBlock,
): boolean {
  const hasIssues = (block: ScopeBlock) =>
    block.display_issue_candidates.alta.length > 0 ||
    block.display_issue_candidates.media.length > 0 ||
    block.display_issue_candidates.baixa.length > 0

  if (scope === "cohort") return hasIssues(cohortBlock)
  if (scope === "db_total") return hasIssues(dbTotalBlock)
  return hasIssues(cohortBlock) || hasIssues(dbTotalBlock)
}

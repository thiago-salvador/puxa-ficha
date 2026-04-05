/**
 * Regras puras do modo incremental da ingest Camara (`skipValidated`).
 * Consultas ao Supabase ficam em `ingest-camara.ts`; aqui so decisao a partir de dados ja lidos.
 */

/** Mesmo teto de `ingestProjetos`: com isso no banco, consideramos autoria Camara sincronizada. */
export const PROJETOS_LEI_INGEST_CAP = 100

/** Anos recentes de CEAP: exigir linha em `gastos_parlamentares` para pular refetch de gastos no modo incremental. */
export const GASTOS_RECENT_ANOS: readonly number[] = [2023, 2024, 2025]

export function hasFullVotacaoIdCoverage(requiredIds: readonly string[], presentIds: Iterable<string>): boolean {
  if (requiredIds.length === 0) return true
  const present = new Set(presentIds)
  return requiredIds.every((id) => present.has(id))
}

export function hasGastosRecentYearsComplete(
  anosNoBanco: Iterable<number>,
  requiredYears: readonly number[] = GASTOS_RECENT_ANOS
): boolean {
  const anos = new Set(anosNoBanco)
  return requiredYears.every((a) => anos.has(a))
}

export function projetosLeiMeetsIngestCap(
  count: number,
  cap: number = PROJETOS_LEI_INGEST_CAP
): boolean {
  return count >= cap
}

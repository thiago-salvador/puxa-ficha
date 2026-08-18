/**
 * Regras puras do modo incremental da ingest Camara (`skipValidated`).
 * Consultas ao Supabase ficam em `ingest-camara.ts`; aqui so decisao a partir de dados ja lidos.
 */

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

/**
 * Decisao de pular a etapa de projetos no modo incremental.
 *
 * Antes da issue #138 isto era `count >= 100`, com o 100 sendo o mesmo teto que
 * `ingestProjetos` aplicava na persistencia. Os dois juntos fechavam o ciclo: o
 * ingest cortava em 100, o guard lia 100 como "autoria Camara sincronizada", e
 * candidato com 2089 proposicoes autorais nunca mais era rebuscado. Constante
 * nenhuma sabe quantas proposicoes um deputado assinou, entao a comparacao
 * agora e contra a cardinalidade que a propria fonte declara.
 *
 * `declaradoNaFonte` vem de `fetchDeclaredProposicaoCount` (1 request), ou de
 * `coleta_log` quando a rodada anterior gravou. Desconhecido (null/undefined,
 * negativo ou NaN) NAO pula: sem saber o tamanho do acervo, a unica resposta
 * honesta e ir buscar.
 */
export function projetosLeiSincronizado(
  countNoBanco: number,
  declaradoNaFonte: number | null | undefined
): boolean {
  if (declaradoNaFonte == null) return false
  if (!Number.isFinite(declaradoNaFonte) || declaradoNaFonte < 0) return false
  if (!Number.isFinite(countNoBanco) || countNoBanco < 0) return false
  return countNoBanco >= declaradoNaFonte
}

/**
 * Assinatura do corte historico: exatamente 100 linhas de fonte Camara e o que
 * o `slice(0, 100)` deixava para tras. Nao decide nada sozinha, serve para o
 * log e para a regua explicarem por que aquele numero e suspeito.
 */
export const CORTE_HISTORICO_PROJETOS = 100

export function pareceCorteHistorico(countNoBanco: number): boolean {
  return countNoBanco === CORTE_HISTORICO_PROJETOS
}

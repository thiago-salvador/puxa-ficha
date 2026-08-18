import type { VotoCandidato } from "./types"

/** Contagem de registros em `votos_candidato` por candidato (votações-chave com voto mapeado). */
export function countVotosRowsByCandidatoId(
  rows: Array<{ candidato_id: string }>
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const id = row.candidato_id
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return counts
}

/**
 * Converte `data_votacao` em timestamp de forma segura.
 *
 * Retorna `Number.NEGATIVE_INFINITY` para valores ausentes, vazios ou inválidos,
 * garantindo que votos com datas inválidas apareçam no final da lista ordenada.
 */
function parseVotacaoTimestamp(dataVotacao: string | undefined | null): number {
  if (!dataVotacao) {
    return Number.NEGATIVE_INFINITY
  }
  const timestamp = new Date(dataVotacao).getTime()
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY
}

/**
 * Ordena votos de forma determinística para exibição pública.
 *
 * Critério de ordenação:
 * 1. `votacao.data_votacao` descendente (mais recente primeiro)
 * 2. Fallback estável por `votacao.titulo` (ordem alfabética)
 * 3. Fallback final por `votacao_id` (para garantir estabilidade total)
 *
 * Quando `data_votacao` está ausente ou inválida, o voto é tratado como data mínima
 * e aparece no final da lista.
 */
export function sortVotosForPublicDisplay(votos: VotoCandidato[]): VotoCandidato[] {
  return [...votos].sort((a, b) => {
    const dateA = parseVotacaoTimestamp(a.votacao?.data_votacao)
    const dateB = parseVotacaoTimestamp(b.votacao?.data_votacao)

    // Ordenação descendente por data (mais recente primeiro)
    if (dateA !== dateB) {
      return dateB - dateA
    }

    // Fallback estável por título
    const titleA = a.votacao?.titulo ?? ""
    const titleB = b.votacao?.titulo ?? ""
    if (titleA !== titleB) {
      return titleA.localeCompare(titleB, "pt-BR")
    }

    // Fallback final por votacao_id para garantir estabilidade total
    return a.votacao_id.localeCompare(b.votacao_id)
  })
}

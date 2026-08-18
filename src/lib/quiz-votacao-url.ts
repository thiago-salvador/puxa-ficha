/**
 * Links públicos para consulta da proposição ligada a `votacoes_chave` (Câmara / Senado).
 * IDs vêm do pipeline de ingestão (`proposicao_id` na base).
 */

export function buildVotacaoPublicUrl(
  casa: string | null | undefined,
  proposicaoId: string | null | undefined
): string | null {
  const id = proposicaoId?.trim()
  if (!id) return null
  const c = (casa ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
  if (c.includes("camara")) {
    return `https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=${encodeURIComponent(id)}`
  }
  if (c.includes("senado")) {
    return `https://www25.senado.leg.br/web/atividade/materias/-/materia/${encodeURIComponent(id)}`
  }
  return null
}

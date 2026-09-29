/**
 * Links públicos para consulta da proposição ligada a `votacoes_chave` (Câmara / Senado).
 * IDs vêm do pipeline de ingestão (`proposicao_id` na base).
 */

import { stripAccents } from "@/lib/strip-accents"

export function buildVotacaoPublicUrl(
  casa: string | null | undefined,
  proposicaoId: string | null | undefined
): string | null {
  const id = proposicaoId?.trim()
  if (!id) return null
  const c = stripAccents((casa ?? ""))
    .toLowerCase()
  if (c.includes("camara")) {
    return `https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=${encodeURIComponent(id)}`
  }
  if (c.includes("senado")) {
    return `https://www25.senado.leg.br/web/atividade/materias/-/materia/${encodeURIComponent(id)}`
  }
  return null
}

/**
 * Link da votação nominal. No Senado, com `proposicao_id` e `votacao_id_api`,
 * aponta a votação exata (âncora na página de votações da matéria); sem o id da
 * votação, cai na página da matéria. Na Câmara, reaproveita o link da proposição.
 */
export function buildVotacaoNominalUrl(
  casa: string | null | undefined,
  proposicaoId: string | number | null | undefined,
  votacaoIdApi: string | number | null | undefined
): string | null {
  const proposicao = proposicaoId == null ? "" : String(proposicaoId).trim()
  if (!proposicao) return null
  const votacao = votacaoIdApi == null ? "" : String(votacaoIdApi).trim()
  const c = stripAccents(casa ?? "").toLowerCase()
  if (c.includes("senado") && votacao) {
    return `https://www25.senado.leg.br/web/atividade/materias/-/materia/${encodeURIComponent(proposicao)}/votacoes#votacao_${encodeURIComponent(votacao)}`
  }
  return buildVotacaoPublicUrl(casa, proposicao)
}

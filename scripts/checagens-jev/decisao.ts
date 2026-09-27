export const CORTE_IDENTIDADE_CHECAGENS = 0.5
const FAIXA_MESA_CHECAGENS = { minimo: 0.35, maximo: 0.65 } as const

export type DecisaoRegra3 = "nao_aplica" | "permitido" | "excluido" | "revisao"
export type ResultadoGateChecagem = "publicar" | "mesa" | "descartar" | "bloqueado_regra3"

export type EntradaGateChecagem = {
  nomeConfirmadoPelaRegra: boolean
  noulIdentidade: number | null | undefined
  corte?: number
  regra3?: DecisaoRegra3
}

/**
 * Gate determinístico. A saída Jev é um sinal em sombra; só pode contribuir
 * depois da regra de identidade confirmar pelo título ou pelo corpo. Regra 3, quando resolvida pelo código,
 * pode bloquear a publicação independentemente de um score alto.
 */
export function decidirPublicacaoChecagem({
  nomeConfirmadoPelaRegra,
  noulIdentidade,
  corte = CORTE_IDENTIDADE_CHECAGENS,
  regra3 = "nao_aplica",
}: EntradaGateChecagem): ResultadoGateChecagem {
  if (regra3 === "excluido") return "bloqueado_regra3"
  if (regra3 === "revisao") return "mesa"
  if (!nomeConfirmadoPelaRegra) return "descartar"
  if (noulIdentidade == null || !Number.isFinite(noulIdentidade) || noulIdentidade < 0 || noulIdentidade > 1) return "mesa"
  if (noulIdentidade >= FAIXA_MESA_CHECAGENS.minimo && noulIdentidade <= FAIXA_MESA_CHECAGENS.maximo) return "mesa"
  if (noulIdentidade < corte) return "descartar"
  return "publicar"
}

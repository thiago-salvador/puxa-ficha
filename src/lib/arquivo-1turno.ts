import type { FaseEleitoral2026 } from "@/lib/types"

// Sem dependência pesada de propósito: componentes de cliente importam daqui (o snapshot do TSE fica fora do bundle).

/** Texto para leitor de tela ao lado da foto em preto e branco: a cor não é o único sinal. */
export const FOTO_PB_DICA = "não segue na disputa"

/**
 * Arquivo do 1º turno (/1o-turno): foto em preto e branco para quem perdeu,
 * isto é, fase `nao_eleito` ou `fora_da_disputa`. Eleito, 2º turno, `em_disputa`
 * e fase desconhecida ficam em cor.
 */
export function fotoEmPretoEBranco(candidato: { fase_eleitoral_2026?: FaseEleitoral2026 | null }): boolean {
  const fase = candidato.fase_eleitoral_2026?.fase_eleitoral
  return fase === "nao_eleito" || fase === "fora_da_disputa"
}

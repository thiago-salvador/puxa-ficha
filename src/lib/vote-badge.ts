import type { VotacaoChave } from "@/lib/types"

/**
 * Selo do voto com o mesmo peso visual para todos os valores: SIM, NÃO,
 * abstenção e ausência mudam só o texto. Um SIM preenchido ao lado de um NÃO
 * em contorno sugeria que um dos votos pesa mais que o outro.
 */
export const VOTO_BADGE_NEUTRO_CLASS = "border border-foreground/40 bg-transparent font-bold text-foreground"

/**
 * "Senado · 2023" (ou "Senado · 12/03/2023" com `formato: "data"`) a partir da
 * própria votação. Sem casa não há linha; sem data válida, só a casa. Nada é
 * inferido: o que a votação não traz não aparece.
 */
export function formatVotoCasaQuando(
  votacao: Pick<VotacaoChave, "casa" | "data_votacao"> | null | undefined,
  formato: "ano" | "data" = "ano",
): string | null {
  const casa = votacao?.casa?.trim()
  if (!casa) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(votacao?.data_votacao ?? "")
  if (!match) return casa
  const quando = formato === "ano" ? match[1] : `${match[3]}/${match[2]}/${match[1]}`
  return `${casa} · ${quando}`
}

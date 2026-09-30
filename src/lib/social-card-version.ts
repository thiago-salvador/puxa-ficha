import type { FaseEleitoral2026 } from "@/lib/types"

type CardPhase = Pick<FaseEleitoral2026, "fase_eleitoral" | "fase_turno">

// O CDN guarda o card por 24 h. A versão inclui o layout, a atualização da
// ficha e a fase oficial, que pode mudar sem uma nova atualização da ficha.
export function socialCardVersionToken(
  cardVersion?: string | null,
  faseEleitoral?: CardPhase | null,
): string {
  const ms = cardVersion ? Date.parse(cardVersion) : Number.NaN
  // 4: foto curada em public/ passou a entrar no card (antes saíam as iniciais).
  const version = Number.isFinite(ms) ? `4-${Math.floor(ms / 1000).toString(36)}` : "4"
  return faseEleitoral && faseEleitoral.fase_eleitoral !== "em_disputa"
    ? `${version}-${faseEleitoral.fase_eleitoral}-${faseEleitoral.fase_turno}`
    : version
}

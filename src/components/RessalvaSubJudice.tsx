// cspell:ignore aliancas
import { ressalvaSubJudice, textoRessalvaSubJudice } from "@/lib/aliancas-2turno"
import type { DisputaResultado1Turno } from "@/lib/resultados-1turno"

/** Nota neutra sob o duelo quando votos anulados sub judice decidem se houve 2º turno. Nada quando não se aplica. */
export function RessalvaSubJudice({ disputa, className = "" }: { disputa: DisputaResultado1Turno | null; className?: string }) {
  const ressalva = ressalvaSubJudice(disputa)
  if (!ressalva) return null
  return (
    <p
      role="note"
      data-pf-ressalva-sub-judice
      className={`rounded-[8px] bg-[var(--gray-100)] px-3 py-2 text-[length:var(--text-caption)] font-medium leading-relaxed text-[var(--gray-700)] ${className}`.trim()}
    >
      {textoRessalvaSubJudice(ressalva)}
    </p>
  )
}

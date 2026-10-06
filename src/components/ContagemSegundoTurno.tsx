"use client"

import { useSyncExternalStore } from "react"
import { diasAte2Turno, rotuloContagem2Turno, rotuloContagemCurto2Turno } from "@/lib/segundo-turno-2026"

const semAssinatura = () => () => {}

/**
 * Contagem de dias até o 2º turno. O servidor manda o próprio relógio
 * serializado (`referenceNow`), que vale no HTML e na hidratação; depois o
 * navegador recalcula pelo relógio local, para a página em cache não ficar um
 * dia atrás. Some quando a data passa. `escuro` é a pílula branca sobre o hero preto.
 */
export function ContagemSegundoTurno({ referenceNow, variante = "claro", curto = false }: { referenceNow: string; variante?: "claro" | "escuro"; curto?: boolean }) {
  const dias = useSyncExternalStore(
    semAssinatura,
    () => diasAte2Turno(Date.now()),
    () => diasAte2Turno(referenceNow),
  )
  const rotulo = curto ? rotuloContagemCurto2Turno(dias) : rotuloContagem2Turno(dias)
  if (!rotulo) return null
  return (
    <span
      data-pf-contagem-2turno={dias}
      data-pf-contagem-curta={curto ? "" : undefined}
      className={`inline-flex whitespace-nowrap rounded-full ${curto ? "px-2" : "px-3"} py-1 text-[length:var(--text-caption)] font-bold uppercase tracking-[0.06em] tabular-nums ${variante === "escuro" ? "bg-white text-black" : "bg-foreground text-background"}`}
    >
      {rotulo}
      {curto && <span className="sr-only"> até o 2º turno</span>}
    </span>
  )
}

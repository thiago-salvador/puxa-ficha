// cspell:ignore Relogio
"use client"

import { useSyncExternalStore } from "react"
import { diasAte2Turno, minutosAte2Turno, rotuloContagemRegressiva2Turno } from "@/lib/segundo-turno-2026"

/** Relógio de 1 s: o snapshot é o minuto inteiro, então o React só re-renderiza quando o minuto vira. */
function assinarRelogio(aviso: () => void) {
  const id = setInterval(aviso, 1000)
  return () => clearInterval(id)
}

/**
 * Contagem regressiva até a abertura das seções do 2º turno (dias, horas e
 * minutos). O servidor manda o próprio relógio serializado (`referenceNow`),
 * que vale no HTML e na hidratação; depois o navegador conta pelo relógio
 * local, minuto a minuto, para a página em cache não ficar atrasada. No dia da
 * votação, depois da abertura, mostra "É hoje"; some no dia seguinte. `escuro`
 * é a pílula branca sobre o hero preto.
 */
export function ContagemSegundoTurno({ referenceNow, variante = "claro", curto = false }: { referenceNow: string; variante?: "claro" | "escuro"; curto?: boolean }) {
  const minutos = useSyncExternalStore(
    assinarRelogio,
    () => minutosAte2Turno(Date.now()),
    () => minutosAte2Turno(referenceNow),
  )
  const dias = useSyncExternalStore(
    assinarRelogio,
    () => diasAte2Turno(Date.now()),
    () => diasAte2Turno(referenceNow),
  )
  const rotulo = rotuloContagemRegressiva2Turno(minutos, dias, curto)
  if (!rotulo) return null
  return (
    <span
      data-pf-contagem-2turno={dias}
      data-pf-contagem-minutos={minutos}
      data-pf-contagem-curta={curto ? "" : undefined}
      className={`inline-flex whitespace-nowrap rounded-full ${curto ? "px-2" : "px-3"} py-1 text-[length:var(--text-caption)] font-bold uppercase tracking-[0.06em] tabular-nums ${variante === "escuro" ? "bg-white text-black" : "bg-foreground text-background"}`}
    >
      {rotulo}
      {curto && <span className="sr-only"> até o 2º turno</span>}
    </span>
  )
}

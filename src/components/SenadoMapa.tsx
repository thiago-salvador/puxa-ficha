"use client"

import { useState, type KeyboardEvent, type ReactNode } from "react"
import { getEstadoUFs } from "@/lib/br-uf"

/** Siglas válidas: o estado aberto é sempre um item desta lista, nunca o texto lido do DOM. */
const SIGLAS = getEstadoUFs().map((uf) => uf.toUpperCase())

/**
 * Mapa do Senado: o estado clicado (ou escolhido por Enter/Espaço) troca o card
 * ao lado (abaixo, no celular). Mapa e cards chegam prontos do servidor; o
 * contorno do estado aberto reusa o desenho dele com <use>.
 */
export function SenadoMapa({
  mapa,
  legenda,
  cards,
  inicial,
}: {
  mapa: ReactNode
  legenda: ReactNode
  cards: Record<string, ReactNode>
  inicial: string
}) {
  const [aberta, setAberta] = useState(inicial)
  const escolher = (alvo: EventTarget) => {
    const lida = (alvo as Element).closest?.("[data-pf-senado-uf]")?.getAttribute("data-pf-senado-uf")?.toUpperCase()
    const sigla = SIGLAS.find((s) => s === lida)
    if (sigla && cards[sigla]) setAberta(sigla)
  }
  const teclado = (e: KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return
    e.preventDefault()
    escolher(e.target)
  }
  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <div className="min-w-0">
        <div
          className="relative mx-auto max-w-[32rem] lg:max-w-[min(32rem,calc((100svh-21rem)*0.95))]"
          onClick={(e) => escolher(e.target)}
          onKeyDown={teclado}
        >
          {mapa}
          <svg viewBox="-20 -20 900 950" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" data-pf-senado-destaque={aberta}>
            <use href={`#pf-senado-uf-${aberta}`} fill="none" stroke="var(--gray-950)" strokeWidth={4} strokeLinejoin="round" />
          </svg>
        </div>
        {legenda}
      </div>
      <div className="min-w-0" aria-live="polite">
        {cards[aberta]}
      </div>
    </div>
  )
}

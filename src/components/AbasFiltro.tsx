"use client"

import { useRef, type KeyboardEvent } from "react"

export interface AbaFiltro<T extends string> {
  id: T
  label: string
}

/** Abas que trocam o recorte de uma mesma seção (ex.: finalistas x todos). Setas e Home/End navegam. */
export function AbasFiltro<T extends string>({ rotulo, abas, ativa, onChange, painelId, className = "" }: {
  rotulo: string
  abas: readonly AbaFiltro<T>[]
  ativa: T
  onChange: (id: T) => void
  painelId: string
  className?: string
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const mover = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const destino =
      event.key === "ArrowRight" ? (index + 1) % abas.length
      : event.key === "ArrowLeft" ? (index - 1 + abas.length) % abas.length
      : event.key === "Home" ? 0
      : event.key === "End" ? abas.length - 1
      : null
    if (destino === null) return
    event.preventDefault()
    onChange(abas[destino].id)
    refs.current[destino]?.focus()
  }
  return (
    <div role="tablist" aria-label={rotulo} aria-orientation="horizontal" className={`flex w-full overflow-x-auto border-b border-border scrollbar-none ${className}`.trim()} data-pf-abas-filtro="">
      {abas.map((aba, index) => {
        const selecionada = aba.id === ativa
        return (
          <button
            key={aba.id}
            ref={(el) => { refs.current[index] = el }}
            type="button"
            role="tab"
            aria-selected={selecionada}
            aria-controls={painelId}
            tabIndex={selecionada ? 0 : -1}
            onClick={() => onChange(aba.id)}
            onKeyDown={(event) => mover(event, index)}
            className={`-mb-px inline-flex min-h-11 shrink-0 items-center border-b-2 px-4 py-3 text-[length:var(--text-body-sm)] font-bold uppercase tracking-[0.08em] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring sm:px-5 ${selecionada ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {aba.label}
          </button>
        )
      })}
    </div>
  )
}

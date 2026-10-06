"use client"

import { useSyncExternalStore } from "react"
import Link from "next/link"
import { BRAZIL_STATES } from "@/data/brazil-states"
import { MEU_ESTADO_EVENTO as CHANGE_EVENT, armazenamentoLocal, lerUfSalva, salvarUf } from "@/lib/meu-estado"

export function readSavedState(): string | null {
  return lerUfSalva(armazenamentoLocal())
}

export function rememberState(uf: string): void {
  // Navegação continua disponível quando o navegador bloqueia armazenamento.
  if (salvarUf(armazenamentoLocal(), uf)) window.dispatchEvent(new Event(CHANGE_EVENT))
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback)
  window.addEventListener(CHANGE_EVENT, callback)
  return () => {
    window.removeEventListener("storage", callback)
    window.removeEventListener(CHANGE_EVENT, callback)
  }
}

export function StatePreference({ stateRouteSuffix = "" }: { stateRouteSuffix?: string }) {
  const uf = useSyncExternalStore(subscribe, readSavedState, () => null)
  const state = BRAZIL_STATES.find((item) => item.sigla === uf)
  if (!state) return null
  return (
    <>
      <aside className="mb-2 flex min-h-11 items-center justify-between gap-3 border-b border-border/70 py-1.5 sm:hidden" aria-label="Sua última escolha">
        <p className="min-w-0 truncate text-sm font-bold">
          Último estado: {state.sigla}
          <span className="sr-only">, {state.name}</span>
        </p>
        <Link
          className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-3 text-sm font-bold underline focus-visible:outline-2 focus-visible:outline-offset-4"
          href={`/uf/${state.sigla.toLowerCase()}${stateRouteSuffix}`}
          aria-label={`Voltar para ${state.name} (${state.sigla})`}
        >
          Voltar
        </Link>
      </aside>
      <aside className="mb-6 hidden flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 sm:flex" aria-label="Sua última escolha">
        <div>
          <p className="font-bold">Sua última escolha: {state.name} · {state.sigla}</p>
          <p className="text-sm text-muted-foreground">Salvo apenas neste navegador.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link className="inline-flex min-h-11 items-center rounded-lg bg-foreground px-4 text-sm font-bold text-background focus-visible:outline-2 focus-visible:outline-offset-4" href={`/uf/${state.sigla.toLowerCase()}${stateRouteSuffix}`}>Voltar ao estado</Link>
          <a className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-bold underline focus-visible:outline-2 focus-visible:outline-offset-4" href="#diretorio-estados">Trocar estado</a>
        </div>
      </aside>
    </>
  )
}

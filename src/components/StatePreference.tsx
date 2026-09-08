"use client"

import { useSyncExternalStore } from "react"
import Link from "next/link"
import { BRAZIL_STATES } from "@/data/brazil-states"

const STORAGE_KEY = "pf-governadores-uf"
const CHANGE_EVENT = "pf-governadores-uf-change"

export function readSavedState(): string | null {
  try {
    const uf = window.localStorage.getItem(STORAGE_KEY)
    return BRAZIL_STATES.some((state) => state.sigla === uf) ? uf : null
  } catch {
    return null
  }
}

export function rememberState(uf: string): void {
  if (!BRAZIL_STATES.some((state) => state.sigla === uf)) return
  try {
    window.localStorage.setItem(STORAGE_KEY, uf)
    window.dispatchEvent(new Event(CHANGE_EVENT))
  } catch {
    // Navegação continua disponível quando o navegador bloqueia armazenamento.
  }
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback)
  window.addEventListener(CHANGE_EVENT, callback)
  return () => {
    window.removeEventListener("storage", callback)
    window.removeEventListener(CHANGE_EVENT, callback)
  }
}

export function StatePreference() {
  const uf = useSyncExternalStore(subscribe, readSavedState, () => null)
  const state = BRAZIL_STATES.find((item) => item.sigla === uf)
  if (!state) return null
  return (
    <aside className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-4" aria-label="Sua última escolha">
      <div>
        <p className="font-bold">Sua última escolha: {state.name} · {state.sigla}</p>
        <p className="text-sm text-muted-foreground">Salvo apenas neste navegador.</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link className="inline-flex min-h-11 items-center rounded-lg bg-foreground px-4 text-sm font-bold text-background focus-visible:outline-2 focus-visible:outline-offset-4" href={`/uf/${state.sigla.toLowerCase()}`}>Voltar ao estado</Link>
        <a className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-bold underline focus-visible:outline-2 focus-visible:outline-offset-4" href="#diretorio-estados">Trocar estado</a>
      </div>
    </aside>
  )
}

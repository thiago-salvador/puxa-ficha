"use client"

import { Search } from "lucide-react"
import { useGlobalSearch } from "@/components/GlobalSearchProvider"

// A Mesa filtra só por cargo e UF. Busca por nome, partido ou UF usa a busca
// rápida do site, que já indexa esses campos das fichas publicadas.
export function SalaSearchTrigger({ className }: { className?: string }) {
  const { openSearch } = useGlobalSearch()
  return (
    <button type="button" className={className} onClick={() => openSearch("toolbar")} aria-label="Buscar candidato, partido ou UF na busca rápida">
      <Search aria-hidden="true" className="size-4 shrink-0" />
      <span>Buscar candidato, partido ou UF</span>
    </button>
  )
}

"use client"

import { Search } from "lucide-react"
import { useGlobalSearch } from "@/components/GlobalSearchProvider"

// Quem vai entrevistar alguém chega com um nome. A busca rápida do site já
// indexa nome, partido e UF das fichas publicadas e leva direto à ficha.
export function SalaSearchTrigger({ className }: { className?: string }) {
  const { openSearch } = useGlobalSearch()
  return (
    <button type="button" className={className} onClick={() => openSearch("toolbar")} aria-label="Buscar candidato pelo nome na busca rápida">
      <Search aria-hidden="true" className="size-5 shrink-0" />
      <span>Buscar candidato pelo nome</span>
      <span aria-hidden="true" data-search-cta="">Buscar</span>
    </button>
  )
}

"use client"

import { useState } from "react"
import { CandidatoCard } from "@/components/CandidatoCard"
import { Search, X } from "lucide-react"
import type { Candidato } from "@/lib/types"

interface CandidatoGridProps {
  candidatos: Candidato[]
  processos: Record<string, number>
  patrimonios: Record<string, number | null>
}

export function CandidatoGrid({
  candidatos,
  processos,
  patrimonios,
}: CandidatoGridProps) {
  const [query, setQuery] = useState("")

  const filtered = query.trim()
    ? candidatos.filter((c) => {
        const q = query.toLowerCase()
        return (
          c.nome_urna.toLowerCase().includes(q) ||
          c.nome_completo.toLowerCase().includes(q) ||
          c.partido_sigla.toLowerCase().includes(q) ||
          c.partido_atual.toLowerCase().includes(q)
        )
      })
    : candidatos

  return (
    <>
      <div className="relative mb-10 max-w-md">
        <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-black/25" />
        <input
          type="search"
          placeholder="Buscar por nome ou partido..."
          className="w-full rounded-full border border-black/10 bg-transparent px-4 py-2.5 pl-11 pr-10 text-[14px] font-medium text-black outline-none transition-colors placeholder:font-medium placeholder:text-black/30 focus:border-black/20 focus:ring-2 focus:ring-black/5"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-black/30 hover:text-black"
            aria-label="Limpar busca"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="py-20 text-center text-[14px] text-black/40">
          Nenhum candidato encontrado para &ldquo;{query}&rdquo;
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 lg:gap-5">
          {filtered.map((c, i) => (
            <CandidatoCard
              key={c.id}
              candidato={c}
              processos={processos[c.slug] ?? 0}
              patrimonio={patrimonios[c.slug]}
              index={i}
            />
          ))}
        </div>
      )}
    </>
  )
}

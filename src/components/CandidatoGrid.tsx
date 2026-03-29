"use client"

import { useState } from "react"
import { CandidatoCard } from "@/components/CandidatoCard"
import { Input } from "@/components/ui/input"
import { Search, X } from "lucide-react"
import type { Candidato } from "@/lib/types"

interface CandidatoGridProps {
  candidatos: Candidato[]
  processos: Record<string, number>
  patrimonios: Record<string, number | null>
}

export function CandidatoGrid({ candidatos, processos, patrimonios }: CandidatoGridProps) {
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
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Buscar candidato por nome ou partido..."
          className="pl-10 pr-10"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">
          Nenhum candidato encontrado para &ldquo;{query}&rdquo;
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <CandidatoCard
              key={c.id}
              candidato={c}
              processos={processos[c.slug] ?? 0}
              patrimonio={patrimonios[c.slug]}
            />
          ))}
        </div>
      )}
    </>
  )
}

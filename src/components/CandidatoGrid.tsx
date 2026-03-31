"use client"

import { useState, useMemo } from "react"
import { CandidatoCard } from "@/components/CandidatoCard"
import { Search, X, LayoutGrid, List, Scale, Landmark } from "lucide-react"
import Link from "next/link"
import { formatCompact } from "@/lib/utils"
import type { Candidato } from "@/lib/types"

interface CandidatoGridProps {
  candidatos: Candidato[]
  processos: Record<string, number>
  patrimonios: Record<string, number | null>
}

type ViewMode = "grid" | "list"
type SortKey = "nome" | "patrimonio" | "processos"

export function CandidatoGrid({
  candidatos,
  processos,
  patrimonios,
}: CandidatoGridProps) {
  const [query, setQuery] = useState("")
  const [view, setView] = useState<ViewMode>("grid")
  const [sort, setSort] = useState<SortKey>("nome")

  const partidos = useMemo(
    () => [...new Set(candidatos.map((c) => c.partido_sigla))].sort(),
    [candidatos]
  )
  const [partidoFilter, setPartidoFilter] = useState<string>("")

  const filtered = useMemo(() => {
    let result = candidatos

    if (query.trim()) {
      const q = query.toLowerCase()
      result = result.filter(
        (c) =>
          c.nome_urna.toLowerCase().includes(q) ||
          c.nome_completo.toLowerCase().includes(q) ||
          c.partido_sigla.toLowerCase().includes(q) ||
          c.partido_atual.toLowerCase().includes(q)
      )
    }

    if (partidoFilter) {
      result = result.filter((c) => c.partido_sigla === partidoFilter)
    }

    if (sort === "patrimonio") {
      result = [...result].sort(
        (a, b) => (patrimonios[b.slug] ?? 0) - (patrimonios[a.slug] ?? 0)
      )
    } else if (sort === "processos") {
      result = [...result].sort(
        (a, b) => (processos[b.slug] ?? 0) - (processos[a.slug] ?? 0)
      )
    }

    return result
  }, [candidatos, query, partidoFilter, sort, patrimonios, processos])

  return (
    <>
      {/* Toolbar: search + filters + view toggle */}
      <div className="mb-8 flex flex-col gap-4 sm:mb-10 sm:flex-row sm:items-center sm:justify-between">
        {/* Search */}
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-foreground" />
          <input
            type="search"
            placeholder="Buscar por nome ou partido..."
            className="w-full rounded-full border border-foreground bg-transparent px-4 py-2.5 pl-11 pr-10 text-[14px] font-medium text-foreground outline-none transition-colors placeholder:font-medium placeholder:text-foreground focus:ring-2 focus:ring-foreground/20"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-foreground hover:text-foreground"
              aria-label="Limpar busca"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Filters + view toggle */}
        <div className="flex items-center gap-3">
          {/* Partido filter */}
          <select
            value={partidoFilter}
            onChange={(e) => setPartidoFilter(e.target.value)}
            className="h-10 rounded-full border border-foreground bg-transparent px-4 text-[12px] font-semibold uppercase tracking-[0.05em] text-foreground outline-none transition-colors"
          >
            <option value="">Todos os partidos</option>
            {partidos.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          {/* Sort */}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="h-10 rounded-full border border-foreground bg-transparent px-4 text-[12px] font-semibold uppercase tracking-[0.05em] text-foreground outline-none transition-colors"
          >
            <option value="nome">A-Z</option>
            <option value="patrimonio">Patrimonio</option>
            <option value="processos">Processos</option>
          </select>

          {/* View toggle */}
          <div className="flex h-10 overflow-hidden rounded-full border border-foreground">
            <button
              onClick={() => setView("grid")}
              className={`flex items-center justify-center px-3 transition-colors ${
                view === "grid"
                  ? "bg-foreground text-background"
                  : "text-foreground"
              }`}
              aria-label="Visualizar em grade"
            >
              <LayoutGrid className="size-4" />
            </button>
            <button
              onClick={() => setView("list")}
              className={`flex items-center justify-center px-3 transition-colors ${
                view === "list"
                  ? "bg-foreground text-background"
                  : "text-foreground"
              }`}
              aria-label="Visualizar em lista"
            >
              <List className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <p className="py-20 text-center text-[14px] text-foreground">
          Nenhum candidato encontrado para &ldquo;{query}&rdquo;
        </p>
      ) : view === "grid" ? (
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
      ) : (
        <div className="space-y-2">
          {filtered.map((c, i) => (
            <Link
              key={c.id}
              href={`/candidato/${c.slug}`}
              className="stagger-item list-item-hover flex items-center gap-4 rounded-[12px] border border-foreground px-4 py-3 sm:px-5 sm:py-4"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              {c.foto_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.foto_url}
                  alt={c.nome_urna}
                  className="size-12 shrink-0 rounded-full object-cover object-top sm:size-14"
                  loading="lazy"
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-foreground">
                    {c.partido_sigla}
                  </span>
                </div>
                <p className="truncate font-heading text-[18px] uppercase leading-tight text-foreground sm:text-[20px]">
                  {c.nome_urna}
                </p>
                <p className="mt-0.5 truncate text-[12px] font-medium text-foreground">
                  {c.cargo_atual || c.cargo_disputado}
                </p>
              </div>
              <div className="hidden shrink-0 items-center gap-4 sm:flex">
                {(processos[c.slug] ?? 0) > 0 && (
                  <span className="flex items-center gap-1 text-[12px] font-bold text-foreground">
                    <Scale className="size-3.5" />
                    {processos[c.slug]}
                  </span>
                )}
                {patrimonios[c.slug] != null &&
                  patrimonios[c.slug]! > 0 && (
                    <span className="flex items-center gap-1 text-[12px] font-bold text-foreground">
                      <Landmark className="size-3.5" />
                      {formatCompact(patrimonios[c.slug]!)}
                    </span>
                  )}
              </div>
              <span className="pill-hover flex h-[30px] shrink-0 items-center rounded-full border border-foreground px-4 text-[11px] font-medium text-foreground">
                Ficha
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}

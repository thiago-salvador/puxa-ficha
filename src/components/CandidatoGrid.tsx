"use client"

import {
  startTransition,
  useDeferredValue,
  useMemo,
  useRef,
  useState,
} from "react"
import Image from "next/image"
import Link from "next/link"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Search, X, LayoutGrid, List, Scale, Landmark } from "lucide-react"

import { CandidatoCard } from "@/components/CandidatoCard"
import { CandidateCommand } from "@/components/CandidateCommand"
import { PartyCombobox } from "@/components/PartyCombobox"
import { formatCompact, shouldBypassImageOptimization } from "@/lib/utils"
import type { Candidato } from "@/lib/types"

interface CandidatoGridProps {
  candidatos: Candidato[]
  processos: Record<string, number>
  patrimonios: Record<string, number | null>
}

type ViewMode = "grid" | "list"
type SortKey = "nome" | "patrimonio" | "processos"

const VIRTUALIZATION_THRESHOLD = 24

interface ListItemProps {
  candidato: Candidato
  patrimonio: number | null
  processos: number
  index: number
}

function CandidatoListItem({
  candidato,
  patrimonio,
  processos,
  index,
}: ListItemProps) {
  const bypassPhotoOptimization = shouldBypassImageOptimization(candidato.foto_url)

  return (
    <Link
      href={`/candidato/${candidato.slug}`}
      className="stagger-item list-item-hover flex items-center gap-4 rounded-[12px] border border-foreground px-4 py-3 sm:px-5 sm:py-4"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      {candidato.foto_url && (
        <Image
          src={candidato.foto_url}
          alt={candidato.nome_urna}
          width={56}
          height={56}
          sizes="56px"
          unoptimized={bypassPhotoOptimization}
          className="size-12 shrink-0 rounded-full object-cover object-top sm:size-14"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-foreground">
            {candidato.partido_sigla}
          </span>
        </div>
        <p className="truncate font-heading text-[18px] uppercase leading-tight text-foreground sm:text-[20px]">
          {candidato.nome_urna}
        </p>
        <p className="mt-0.5 truncate text-[12px] font-medium text-foreground">
          {candidato.cargo_atual || candidato.cargo_disputado}
        </p>
      </div>
      <div className="hidden shrink-0 items-center gap-4 sm:flex">
        {processos > 0 && (
          <span className="flex items-center gap-1 text-[12px] font-bold text-foreground">
            <Scale className="size-3.5" />
            {processos}
          </span>
        )}
        {patrimonio != null && patrimonio > 0 && (
          <span className="flex items-center gap-1 text-[12px] font-bold text-foreground">
            <Landmark className="size-3.5" />
            {formatCompact(patrimonio)}
          </span>
        )}
      </div>
      <span className="pill-hover flex h-[30px] shrink-0 items-center rounded-full border border-foreground px-4 text-[11px] font-medium text-foreground">
        Ficha
      </span>
    </Link>
  )
}

export function CandidatoGrid({
  candidatos,
  processos,
  patrimonios,
}: CandidatoGridProps) {
  const [query, setQuery] = useState("")
  const [view, setView] = useState<ViewMode>("grid")
  const [sort, setSort] = useState<SortKey>("nome")
  const [partidoFilter, setPartidoFilter] = useState("")
  const deferredQuery = useDeferredValue(query)
  const listParentRef = useRef<HTMLDivElement>(null)

  const partidos = useMemo(
    () => [...new Set(candidatos.map((c) => c.partido_sigla))].sort(),
    [candidatos]
  )

  const filtered = useMemo(() => {
    let result = candidatos

    if (deferredQuery.trim()) {
      const normalizedQuery = deferredQuery.toLowerCase()
      result = result.filter(
        (candidato) =>
          candidato.nome_urna.toLowerCase().includes(normalizedQuery) ||
          candidato.nome_completo.toLowerCase().includes(normalizedQuery) ||
          candidato.partido_sigla.toLowerCase().includes(normalizedQuery) ||
          candidato.partido_atual.toLowerCase().includes(normalizedQuery) ||
          candidato.estado?.toLowerCase().includes(normalizedQuery)
      )
    }

    if (partidoFilter) {
      result = result.filter((candidato) => candidato.partido_sigla === partidoFilter)
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
  }, [candidatos, deferredQuery, partidoFilter, sort, patrimonios, processos])

  const commandItems = useMemo(
    () =>
      candidatos.map((candidato) => ({
        href: `/candidato/${candidato.slug}`,
        title: candidato.nome_urna,
        subtitle: [
          candidato.partido_sigla,
          candidato.cargo_atual || candidato.cargo_disputado,
          candidato.estado,
        ]
          .filter(Boolean)
          .join(" · "),
        badge: null,
      })),
    [candidatos]
  )

  const shouldVirtualizeList =
    view === "list" && filtered.length >= VIRTUALIZATION_THRESHOLD

  const rowVirtualizer = useVirtualizer({
    count: shouldVirtualizeList ? filtered.length : 0,
    getScrollElement: () => listParentRef.current,
    estimateSize: () => 94,
    overscan: 6,
  })

  return (
    <>
      <div className="mb-8 flex flex-col gap-4 sm:mb-10">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative max-w-xl flex-1">
            <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-foreground" />
            <input
              type="search"
              placeholder="Buscar por nome, partido ou estado..."
              className="w-full rounded-full border border-foreground bg-transparent px-4 py-2.5 pl-11 pr-10 text-[14px] font-medium text-foreground outline-none transition-colors placeholder:font-medium placeholder:text-foreground focus:ring-2 focus:ring-foreground/20"
              value={query}
              onChange={(event) => {
                const nextValue = event.target.value
                startTransition(() => setQuery(nextValue))
              }}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-foreground hover:text-foreground"
                aria-label="Limpar busca"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <CandidateCommand
              candidates={commandItems}
              scopeLabel="Atalho rapido para candidatos e paginas do projeto"
            />

            <PartyCombobox
              options={partidos}
              value={partidoFilter}
              onChange={setPartidoFilter}
            />

            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortKey)}
              className="h-10 rounded-full border border-foreground bg-transparent px-4 text-[12px] font-semibold uppercase tracking-[0.05em] text-foreground outline-none transition-colors"
              aria-label="Ordenar candidatos"
            >
              <option value="nome">A-Z</option>
              <option value="patrimonio">Patrimonio</option>
              <option value="processos">Processos</option>
            </select>

            <div className="flex h-10 overflow-hidden rounded-full border border-foreground">
              <button
                type="button"
                onClick={() => setView("grid")}
                className={`flex items-center justify-center px-3 transition-colors ${
                  view === "grid"
                    ? "bg-foreground text-background"
                    : "text-foreground"
                }`}
                aria-label="Visualizar em grade"
                aria-pressed={view === "grid"}
              >
                <LayoutGrid className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setView("list")}
                className={`flex items-center justify-center px-3 transition-colors ${
                  view === "list"
                    ? "bg-foreground text-background"
                    : "text-foreground"
                }`}
                aria-label="Visualizar em lista"
                aria-pressed={view === "list"}
              >
                <List className="size-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[12px] font-medium text-muted-foreground">
          <span>
            {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
          </span>
          {partidoFilter && (
            <button
              type="button"
              onClick={() => setPartidoFilter("")}
              className="rounded-full border border-border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-foreground transition-colors hover:bg-muted"
            >
              Partido: {partidoFilter} ×
            </button>
          )}
          {deferredQuery && (
            <span>
              busca por &ldquo;{deferredQuery}&rdquo;
            </span>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="py-20 text-center text-[14px] text-foreground">
          Nenhum candidato encontrado para &ldquo;{query}&rdquo;
        </p>
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 lg:gap-5">
          {filtered.map((candidato, index) => (
            <CandidatoCard
              key={candidato.id}
              candidato={candidato}
              processos={processos[candidato.slug] ?? 0}
              patrimonio={patrimonios[candidato.slug]}
              index={index}
            />
          ))}
        </div>
      ) : shouldVirtualizeList ? (
        <div
          ref={listParentRef}
          className="max-h-[70vh] overflow-y-auto pr-1"
        >
          <div
            className="relative"
            style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const candidato = filtered[virtualRow.index]
              return (
                <div
                  key={candidato.id}
                  className="absolute left-0 top-0 w-full"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <CandidatoListItem
                    candidato={candidato}
                    patrimonio={patrimonios[candidato.slug]}
                    processos={processos[candidato.slug] ?? 0}
                    index={virtualRow.index}
                  />
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((candidato, index) => (
            <CandidatoListItem
              key={candidato.id}
              candidato={candidato}
              patrimonio={patrimonios[candidato.slug]}
              processos={processos[candidato.slug] ?? 0}
              index={index}
            />
          ))}
        </div>
      )}
    </>
  )
}

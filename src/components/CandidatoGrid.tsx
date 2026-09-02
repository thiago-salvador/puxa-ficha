"use client"

import {
  startTransition,
  useDeferredValue,
  useMemo,
  useRef,
  useState,
} from "react"
import Link from "next/link"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Search, X, LayoutGrid, List, Scale, Landmark } from "lucide-react"

import { CandidatoCard } from "@/components/CandidatoCard"
import { CandidatePhoto } from "@/components/CandidatePhoto"
import { GlobalSearchToolbarButton } from "@/components/GlobalSearchProvider"
import { PartyCombobox } from "@/components/PartyCombobox"
import { SortOrderMenu, type SortKey } from "@/components/SortOrderMenu"
import { sanitizePtBrText } from "@/lib/ptbr-text"
import {
  formatPartyPublicLabel,
  isUncertainParty,
  matchesPartySiglaFilter,
  resolveCanonicalPartySigla,
} from "@/lib/party-utils"
import { formatCargoDisputadoPublicLabel } from "@/lib/ui-labels"
import { formatCompact } from "@/lib/utils"
import { ANALYTICS_EVENTS } from "@/lib/analytics-events"
import { trackLaunchEvent } from "@/lib/analytics-client"
import type { Candidato } from "@/lib/types"

interface CandidatoGridProps {
  candidatos: Candidato[]
  processos: Record<string, number>
  patrimonios: Record<string, number | null>
}

type ViewMode = "grid" | "list"

const VIRTUALIZATION_THRESHOLD = 24

function trackCandidateClick(surface: "candidate_grid" | "candidate_list") {
  trackLaunchEvent(ANALYTICS_EVENTS.candidateClick, { surface })
}

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
  return (
    <Link
      href={`/candidato/${candidato.slug}`}
      onClick={() => trackCandidateClick("candidate_list")}
      className="stagger-item list-item-hover flex items-center gap-4 rounded-[12px] border border-foreground px-4 py-3 sm:px-5 sm:py-4"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      {candidato.foto_url && (
        <CandidatePhoto
          src={candidato.foto_url}
          alt=""
          name={candidato.nome_urna}
          width={56}
          height={56}
          sizes="56px"
          className="size-12 shrink-0 rounded-full object-cover object-top sm:size-14"
          fallbackClassName="size-12 shrink-0 rounded-full sm:size-14"
          initialsClassName="text-sm"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-foreground">
            {formatPartyPublicLabel(candidato.partido_sigla)}
          </span>
        </div>
        <p className="truncate font-heading text-[18px] uppercase leading-tight text-foreground sm:text-[20px]">
          {candidato.nome_urna}
        </p>
        <p className="mt-0.5 truncate text-[length:var(--text-caption)] font-medium text-foreground">
          {candidato.cargo_atual
            ? sanitizePtBrText(candidato.cargo_atual)
            : candidato.cargo_disputado
              ? formatCargoDisputadoPublicLabel(candidato.cargo_disputado)
              : null}
        </p>
      </div>
      <div className="hidden shrink-0 items-center gap-4 sm:flex">
        {processos > 0 && (
          <span className="flex items-center gap-1 text-[length:var(--text-caption)] font-bold text-foreground">
            <Scale className="size-3.5" />
            {processos}
          </span>
        )}
        {patrimonio != null && patrimonio > 0 && (
          <span className="flex items-center gap-1 text-[length:var(--text-caption)] font-bold text-foreground">
            <Landmark className="size-3.5" />
            {formatCompact(patrimonio)}
          </span>
        )}
      </div>
      <span className="pill-hover flex h-[30px] shrink-0 items-center rounded-full border border-foreground px-4 text-[length:var(--text-eyebrow)] font-medium text-foreground">
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
    () =>
      [...new Set(candidatos.map((c) => c.partido_sigla))]
        .filter((value) => !isUncertainParty(value))
        .sort(),
    [candidatos]
  )

  const filtered = useMemo(() => {
    let result = candidatos

    if (deferredQuery.trim()) {
      const normalizedQuery = deferredQuery.toLowerCase()
      const canonicalPartyQuery = resolveCanonicalPartySigla(deferredQuery)
      result = result.filter(
        (candidato) =>
          candidato.nome_urna.toLowerCase().includes(normalizedQuery) ||
          candidato.nome_completo.toLowerCase().includes(normalizedQuery) ||
          candidato.partido_sigla.toLowerCase().includes(normalizedQuery) ||
          (canonicalPartyQuery != null &&
            resolveCanonicalPartySigla(candidato.partido_sigla) === canonicalPartyQuery) ||
          candidato.partido_atual.toLowerCase().includes(normalizedQuery) ||
          candidato.estado?.toLowerCase().includes(normalizedQuery)
      )
    }

    if (partidoFilter) {
      result = result.filter((candidato) =>
        matchesPartySiglaFilter(candidato.partido_sigla, partidoFilter),
      )
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

  const shouldVirtualizeList =
    view === "list" && filtered.length >= VIRTUALIZATION_THRESHOLD

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual requires this hook for large list virtualization.
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
              aria-label="Buscar candidatos por nome, partido ou estado"
              placeholder="Nome, partido ou estado"
              className="w-full rounded-full border border-foreground bg-transparent px-4 py-2.5 pl-11 pr-10 text-base font-medium text-foreground outline-none transition-colors placeholder:font-medium placeholder:text-foreground focus:border-foreground focus:ring-2 focus:ring-foreground/50 md:text-[length:var(--text-body)]"
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
            <GlobalSearchToolbarButton />

            <PartyCombobox
              options={partidos}
              value={partidoFilter}
              onChange={setPartidoFilter}
            />

            <SortOrderMenu value={sort} onChange={setSort} />

            <div className="inline-flex h-11 items-center md:h-10">
              <button
                type="button"
                onClick={() => setView("grid")}
                className="flex h-11 w-11 items-center justify-end md:h-10 md:w-10 md:justify-center"
                aria-label="Visualizar em grade"
                aria-pressed={view === "grid"}
              >
                <span
                  aria-hidden="true"
                  className={`flex h-10 w-10 items-center justify-center rounded-l-full border border-r-0 border-foreground transition-colors ${
                    view === "grid"
                      ? "bg-foreground text-background"
                      : "text-foreground"
                  }`}
                >
                  <LayoutGrid className="size-4" />
                </span>
              </button>
              <button
                type="button"
                onClick={() => setView("list")}
                className="flex h-11 w-11 items-center justify-start md:h-10 md:w-10 md:justify-center"
                aria-label="Visualizar em lista"
                aria-pressed={view === "list"}
              >
                <span
                  aria-hidden="true"
                  className={`flex h-10 w-10 items-center justify-center rounded-r-full border border-l-0 border-foreground transition-colors ${
                    view === "list"
                      ? "bg-foreground text-background"
                      : "text-foreground"
                  }`}
                >
                  <List className="size-4" />
                </span>
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[length:var(--text-caption)] font-medium text-muted-foreground">
          <span>
            {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
          </span>
          {partidoFilter && (
            <button
              type="button"
              onClick={() => setPartidoFilter("")}
              className="inline-flex min-h-11 min-w-11 items-center justify-center p-0.5 md:min-h-0 md:p-0"
            >
              <span className="rounded-full border border-border px-3 py-1 text-[length:var(--text-eyebrow)] font-semibold uppercase tracking-[0.05em] text-foreground transition-colors hover:bg-muted">
                Partido: {partidoFilter} ×
              </span>
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
        <p className="py-20 text-center text-[length:var(--text-body)] text-foreground">
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
              onClick={() => trackCandidateClick("candidate_grid")}
              deferPhotoUntilVisible
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

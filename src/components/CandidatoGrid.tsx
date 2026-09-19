"use client"

import {
  startTransition,
  useDeferredValue,
  useId,
  useMemo,
  useRef,
  useState,
} from "react"
import Link from "next/link"
import { useVirtualizer } from "@tanstack/react-virtual"
import {
  Search,
  X,
  LayoutGrid,
  List,
  Scale,
  Landmark,
  SlidersHorizontal,
} from "lucide-react"

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
import { FormattedNumber } from "./FormattedNumber"
import { ANALYTICS_EVENTS } from "@/lib/analytics-events"
import { trackLaunchEvent } from "@/lib/analytics-client"
import { compareCandidateSortValues } from "@/lib/candidate-sort"
import { PATRIMONIO_ATIPICO_ROTULO } from "@/lib/patrimonio-atipico"
import { normalizeForSearch } from "@/lib/search-normalize"
import type { Candidato } from "@/lib/types"

interface CandidatoGridProps {
  candidatos: Candidato[]
  processos: Record<string, number>
  patrimonios: Record<string, number | null>
  processSortCounts?: Record<string, number | null>
  /**
   * Slugs cujo patrimônio de 2026 é atípico (`patrimonioDeclaradoAtipico`).
   * O valor continua exibido com aviso e o candidato vai para o fim da
   * ordenação por patrimônio.
   */
  patrimoniosAtipicos?: Record<string, boolean>
}

/** Busca da grade, insensível a caixa e acento ("aecio" encontra "AÉCIO"). */
export function filtrarCandidatosPorBusca(candidatos: Candidato[], query: string): Candidato[] {
  const normalizedQuery = normalizeForSearch(query)
  if (!normalizedQuery) return candidatos
  const canonicalPartyQuery = resolveCanonicalPartySigla(query)
  const contem = (value: string | null | undefined) =>
    value != null && normalizeForSearch(value).includes(normalizedQuery)
  return candidatos.filter(
    (candidato) =>
      contem(candidato.nome_urna) ||
      contem(candidato.nome_completo) ||
      contem(candidato.partido_sigla) ||
      (canonicalPartyQuery != null &&
        resolveCanonicalPartySigla(candidato.partido_sigla) === canonicalPartyQuery) ||
      contem(candidato.partido_atual) ||
      contem(candidato.estado)
  )
}

export function ordenarCandidatosGrid(
  candidatos: Candidato[],
  sort: SortKey,
  {
    patrimonios,
    processos,
    processSortCounts,
    patrimoniosAtipicos,
  }: {
    patrimonios: Record<string, number | null>
    processos: Record<string, number>
    processSortCounts?: Record<string, number | null>
    patrimoniosAtipicos?: Record<string, boolean>
  },
): Candidato[] {
  return [...candidatos].sort((a, b) => {
    const byName = a.nome_urna.localeCompare(b.nome_urna, "pt-BR")
    if (sort === "nome") return byName
    if (sort === "patrimonio") {
      // Atípico fica depois até de "sem dado": o valor oficial não compete.
      const atipicoA = patrimoniosAtipicos?.[a.slug] === true
      const atipicoB = patrimoniosAtipicos?.[b.slug] === true
      if (atipicoA !== atipicoB) return atipicoA ? 1 : -1
      if (atipicoA) return byName
      return compareCandidateSortValues(patrimonios[a.slug], patrimonios[b.slug]) || byName
    }
    const values = processSortCounts ?? processos
    return compareCandidateSortValues(values[a.slug], values[b.slug]) || byName
  })
}

type ViewMode = "grid" | "list"

const VIRTUALIZATION_THRESHOLD = 24

function trackCandidateClick(surface: "candidate_grid" | "candidate_list") {
  trackLaunchEvent(ANALYTICS_EVENTS.candidateClick, { surface })
}

interface ListItemProps {
  candidato: Candidato
  patrimonio: number | null
  patrimonioAtipico?: boolean
  processos: number
  index: number
}

function CandidatoListItem({
  candidato,
  patrimonio,
  patrimonioAtipico = false,
  processos,
  index,
}: ListItemProps) {
  return (
    <Link
      href={`/candidato/${candidato.slug}`}
      prefetch={false}
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
        {patrimonio != null && (
          <span className="flex items-center gap-1 text-[length:var(--text-caption)] font-bold text-foreground">
            <Landmark className="size-3.5" />
            <FormattedNumber value={patrimonio} />
            {patrimonioAtipico && (
              <span
                data-pf-patrimonio-atipico=""
                title={PATRIMONIO_ATIPICO_ROTULO}
                className="rounded-sm bg-amber-200 px-1 text-[length:var(--text-eyebrow)] font-bold uppercase text-black"
              >
                <span aria-hidden="true">atípico</span>
                <span className="sr-only">{PATRIMONIO_ATIPICO_ROTULO}</span>
              </span>
            )}
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
  processSortCounts,
  patrimoniosAtipicos,
}: CandidatoGridProps) {
  const [query, setQuery] = useState("")
  const [view, setView] = useState<ViewMode>("grid")
  const [sort, setSort] = useState<SortKey>("nome")
  const [partidoFilter, setPartidoFilter] = useState("")
  const [filtersOpen, setFiltersOpen] = useState(false)
  const deferredQuery = useDeferredValue(query)
  const listParentRef = useRef<HTMLDivElement>(null)
  const filtersId = useId()

  const partidos = useMemo(
    () =>
      [...new Set(candidatos.map((c) => c.partido_sigla))]
        .filter((value) => !isUncertainParty(value))
        .sort(),
    [candidatos]
  )

  const filtered = useMemo(() => {
    let result = filtrarCandidatosPorBusca(candidatos, deferredQuery)

    if (partidoFilter) {
      result = result.filter((candidato) =>
        matchesPartySiglaFilter(candidato.partido_sigla, partidoFilter),
      )
    }

    return ordenarCandidatosGrid(result, sort, {
      patrimonios,
      processos,
      processSortCounts,
      patrimoniosAtipicos,
    })
  }, [candidatos, deferredQuery, partidoFilter, sort, patrimonios, processos, processSortCounts, patrimoniosAtipicos])

  const shouldVirtualizeList =
    view === "list" && filtered.length >= VIRTUALIZATION_THRESHOLD

  const temPatrimonioAtipico = Object.values(patrimoniosAtipicos ?? {}).some(Boolean)
  const activeFilterCount = (partidoFilter ? 1 : 0) + (sort !== "nome" ? 1 : 0)
  const sortDescription =
    sort === "nome"
      ? "Ordem alfabética. A posição não representa uma avaliação dos candidatos."
      : sort === "patrimonio"
        ? `Patrimônio declarado: maior para menor. Os anos das declarações podem variar; consulte o ano e a fonte na ficha. Dados ausentes ficam no fim, separados de valores iguais a zero.${
            temPatrimonioAtipico
              ? " Valores declarados atípicos em relação a eleições anteriores ficam por último, com aviso."
              : ""
          }`
        : "Processos registrados na base: maior para menor. A quantidade não indica gravidade ou culpa. Zero significa nenhum registro nesta contagem, não uma certidão de ausência de processos. Dados indisponíveis ficam no fim."
  const sortMobileSummary =
    sort === "nome"
      ? "Ordem alfabética."
      : sort === "patrimonio"
        ? "Patrimônio do maior para o menor."
        : "Processos do maior para o menor. Quantidade não indica gravidade ou culpa."

  const viewToggle = (
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
            view === "grid" ? "bg-foreground text-background" : "text-foreground"
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
            view === "list" ? "bg-foreground text-background" : "text-foreground"
          }`}
        >
          <List className="size-4" />
        </span>
      </button>
    </div>
  )

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual requires this hook for large list virtualization.
  const rowVirtualizer = useVirtualizer({
    count: shouldVirtualizeList ? filtered.length : 0,
    getScrollElement: () => listParentRef.current,
    estimateSize: () => 94,
    overscan: 6,
  })

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 sm:mb-10 sm:gap-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-3 xl:flex-1">
            <div className="relative min-w-0 max-w-xl flex-1">
              <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-foreground" />
              <input
                type="search"
                aria-label="Buscar candidatos por nome, partido ou estado"
                placeholder="Nome, partido ou estado"
                className="w-full rounded-full border border-foreground bg-transparent px-4 py-2.5 pl-11 pr-10 text-base font-medium text-foreground outline-none transition-colors placeholder:font-medium placeholder:text-transparent focus:border-foreground focus:ring-2 focus:ring-foreground/50 [&::-webkit-search-cancel-button]:appearance-none sm:placeholder:text-foreground md:text-[length:var(--text-body)]"
                value={query}
                onChange={(event) => {
                  const nextValue = event.target.value
                  startTransition(() => setQuery(nextValue))
                }}
              />
              {!query && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-11 top-1/2 -translate-y-1/2 text-base font-medium text-foreground sm:hidden"
                >
                  Buscar
                </span>
              )}
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50"
                  aria-label="Limpar busca"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>

            <button
              type="button"
              className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-full border border-foreground px-4 text-[length:var(--text-caption)] font-semibold uppercase tracking-[0.05em] text-foreground sm:hidden"
              aria-expanded={filtersOpen}
              aria-controls={filtersId}
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <SlidersHorizontal aria-hidden="true" className="size-4" />
              Filtros
              {activeFilterCount > 0 && (
                <span
                  aria-label={`${activeFilterCount} filtro${activeFilterCount === 1 ? "" : "s"} ativo${activeFilterCount === 1 ? "" : "s"}`}
                  className="flex size-5 items-center justify-center rounded-full bg-foreground text-[length:var(--text-eyebrow)] text-background"
                >
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          <div className="hidden flex-wrap items-center gap-3 sm:flex">
            <GlobalSearchToolbarButton />
            <PartyCombobox
              options={partidos}
              value={partidoFilter}
              onChange={setPartidoFilter}
            />
            <SortOrderMenu value={sort} onChange={setSort} />
            {viewToggle}
          </div>
        </div>

        <div
          id={filtersId}
          className={`${filtersOpen ? "grid" : "hidden"} min-w-0 gap-3 rounded-xl border border-border bg-card p-3 sm:hidden`}
        >
          <PartyCombobox
            options={partidos}
            value={partidoFilter}
            onChange={setPartidoFilter}
          />
          <SortOrderMenu value={sort} onChange={setSort} />
          {viewToggle}
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setPartidoFilter("")
                setSort("nome")
              }}
              className="min-h-11 w-full rounded-full border border-border px-4 text-left text-[length:var(--text-caption)] font-semibold text-foreground"
            >
              Limpar filtros
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[length:var(--text-caption)] font-medium text-muted-foreground sm:gap-3">
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

      <p className="mb-5 hidden max-w-3xl text-[length:var(--text-caption)] leading-relaxed text-muted-foreground sm:block" aria-live="polite">
        {sortDescription}
      </p>
      <details className="mb-4 sm:hidden">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-[length:var(--text-caption)] font-medium text-muted-foreground">
          <span className="min-w-0">{sortMobileSummary}</span>
          <span className="shrink-0 underline underline-offset-2">Ver detalhes</span>
        </summary>
        <p className="mt-2 max-w-3xl text-[length:var(--text-caption)] leading-relaxed text-muted-foreground" aria-live="polite">
          {sortDescription}
        </p>
      </details>
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
              patrimonioAtipico={patrimoniosAtipicos?.[candidato.slug] === true}
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
                    patrimonioAtipico={patrimoniosAtipicos?.[candidato.slug] === true}
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
              patrimonioAtipico={patrimoniosAtipicos?.[candidato.slug] === true}
              processos={processos[candidato.slug] ?? 0}
              index={index}
            />
          ))}
        </div>
      )}
    </>
  )
}

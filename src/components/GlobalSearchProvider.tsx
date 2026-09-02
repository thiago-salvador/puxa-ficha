"use client"

import {
  createContext,
  useCallback,
  useContext,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Dialog } from "@base-ui/react/dialog"
import { Search, Command, ArrowUpRight, X } from "lucide-react"

import { CandidatePhoto } from "@/components/CandidatePhoto"
import {
  filterGlobalSearchPalette,
  GLOBAL_SEARCH_PALETTE_DISPLAY_LIMIT,
  normalizeForSearch,
  readGlobalSearchIndexResponse,
  resolveGlobalSearchHref,
  type GlobalSearchIndexItem,
} from "@/lib/global-search"
import { segmentTextByQueryTokens } from "@/lib/global-search-highlight"
import {
  exploreCandidatesExcludingHrefs,
  hydrateRecentCandidatesFromIndex,
  readRecentCandidates,
  readRecentQueries,
  recordRecentCandidateVisit,
  recordRecentSearchQuery,
} from "@/lib/global-search-recents"
import { ANALYTICS_EVENTS } from "@/lib/analytics-events"
import { trackLaunchEvent } from "@/lib/analytics-client"

const SCOPE_LABEL =
  "Busca em candidatos publicados (nome, partido, UF, temas de votação) e atalhos do site"

type GlobalSearchOpenVia = "cmd_k" | "slash" | "toolbar"
type SearchIndexLoadState = "idle" | "loading" | "ready" | "error"

function isTextInput(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  return tag === "input" || tag === "textarea" || target.isContentEditable
}

export function useModKShortcutLabel() {
  const [label, setLabel] = useState("Ctrl K")
  useEffect(() => {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : ""
    const isMac = /Mac|iPhone|iPad|iPod/i.test(ua)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Client-only shortcut label avoids server/client hydration drift.
    setLabel(isMac ? "⌘K" : "Ctrl K")
  }, [])
  return label
}

type GlobalSearchContextValue = {
  openSearch: (via?: GlobalSearchOpenVia) => void
  closeSearch: () => void
  open: boolean
}

const GlobalSearchContext = createContext<GlobalSearchContextValue | null>(null)

export function useGlobalSearch(): GlobalSearchContextValue {
  const ctx = useContext(GlobalSearchContext)
  if (!ctx) {
    throw new Error("useGlobalSearch must be used within GlobalSearchProvider")
  }
  return ctx
}

function buildShortcutItems(): GlobalSearchIndexItem[] {
  const raw: Array<
    Pick<GlobalSearchIndexItem, "href" | "title" | "subtitle" | "badge">
  > = [
    {
      href: "/comparar",
      title: "Abrir comparador",
      subtitle: "Ir para a comparação lado a lado",
      badge: "Atalho",
    },
    {
      href: "/governadores",
      title: "Ver governadores",
      subtitle: "Abrir o mapa de estados",
      badge: "Atalho",
    },
    {
      href: "/parlamentares",
      title: "Parlamentares",
      subtitle: "Fichas de deputados e senadores ainda não estão prontas",
      badge: "Atalho",
    },
    {
      href: "/sobre",
      title: "Sobre o projeto",
      subtitle: "Entender critério editorial e fontes",
      badge: "Atalho",
    },
  ]
  return raw.map((r) => ({
    ...r,
    searchText: normalizeForSearch(
      [r.title, r.subtitle, r.badge ?? ""].filter(Boolean).join(" ")
    ),
  }))
}

export function GlobalSearchToolbarButton() {
  const { openSearch } = useGlobalSearch()
  const modLabel = useModKShortcutLabel()
  return (
    <button
      type="button"
      onClick={() => openSearch("toolbar")}
      className="group inline-flex min-h-11 min-w-11 items-center justify-center bg-transparent p-0.5 text-[12px] font-semibold uppercase tracking-[0.05em] text-foreground md:min-h-10 md:p-0"
      aria-label="Abrir busca rápida"
    >
      <span className="flex h-10 items-center gap-2 rounded-full border border-foreground px-4 text-[12px] font-semibold uppercase tracking-[0.05em] text-foreground transition-colors group-hover:bg-foreground group-hover:text-background">
        <Search className="size-3.5" />
        Busca rápida
        <span
          aria-hidden="true"
          className="hidden rounded-full border border-current px-2 py-0.5 text-[10px] sm:inline-flex"
        >
          {modLabel}
        </span>
      </span>
    </button>
  )
}

function optionId(index: number) {
  return `gsp-option-${index}`
}

async function fetchGlobalSearchIndex(): Promise<GlobalSearchIndexItem[]> {
  const response = await fetch("/api/search-index", {
    headers: { accept: "application/json" },
  })
  if (!response.ok) {
    throw new Error(`search index request failed: ${response.status}`)
  }
  return readGlobalSearchIndexResponse(await response.json())
}

function HighlightedText({
  text,
  query,
  className,
}: {
  text: string
  query: string
  className?: string
}) {
  const segs = useMemo(() => segmentTextByQueryTokens(text, query), [text, query])
  return (
    <span className={className}>
      {segs.map((s, i) =>
        s.highlight ? (
          <mark
            key={i}
            className="rounded-sm bg-amber-200/90 px-0.5 text-inherit dark:bg-amber-900/45"
          >
            {s.text}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        )
      )}
    </span>
  )
}

type PaletteNavRow =
  | { kind: "recent_query"; query: string }
  | { kind: "link"; item: GlobalSearchIndexItem }

type PaletteSectionSpec = { label: string; rows: PaletteNavRow[] }

function buildPaletteModel(args: {
  queryNormalized: string
  shortcutItems: GlobalSearchIndexItem[]
  initialCandidates: GlobalSearchIndexItem[]
  filtered: { shortcuts: GlobalSearchIndexItem[]; candidates: GlobalSearchIndexItem[] }
  recentQueries: string[]
  recentCandidates: GlobalSearchIndexItem[]
}): { flatRows: PaletteNavRow[]; sections: PaletteSectionSpec[] } {
  const { queryNormalized, shortcutItems, initialCandidates, filtered, recentQueries, recentCandidates } =
    args

  if (queryNormalized) {
    const rows: PaletteNavRow[] = [
      ...filtered.shortcuts.map((item) => ({ kind: "link" as const, item })),
      ...filtered.candidates.map((item) => ({ kind: "link" as const, item })),
    ]
    const sections: PaletteSectionSpec[] = []
    if (filtered.shortcuts.length > 0) {
      sections.push({
        label: "Atalhos",
        rows: filtered.shortcuts.map((item) => ({ kind: "link" as const, item })),
      })
    }
    if (filtered.candidates.length > 0) {
      sections.push({
        label: "Candidatos",
        rows: filtered.candidates.map((item) => ({ kind: "link" as const, item })),
      })
    }
    return { flatRows: rows, sections }
  }

  const recentHrefSet = new Set(recentCandidates.map((c) => c.href))
  const explore = exploreCandidatesExcludingHrefs(
    initialCandidates,
    recentHrefSet,
    GLOBAL_SEARCH_PALETTE_DISPLAY_LIMIT
  )

  const sections: PaletteSectionSpec[] = []
  if (recentQueries.length > 0) {
    sections.push({
      label: "Buscas recentes",
      rows: recentQueries.map((query) => ({ kind: "recent_query" as const, query })),
    })
  }
  if (recentCandidates.length > 0) {
    sections.push({
      label: "Fichas recentes",
      rows: recentCandidates.map((item) => ({ kind: "link" as const, item })),
    })
  }
  sections.push({
    label: "Atalhos",
    rows: shortcutItems.map((item) => ({ kind: "link" as const, item })),
  })
  if (explore.length > 0) {
    sections.push({
      label: "Candidatos",
      rows: explore.map((item) => ({ kind: "link" as const, item })),
    })
  }

  const flatRows = sections.flatMap((s) => s.rows)
  return { flatRows, sections }
}

export function GlobalSearchProvider({
  children,
  initialCandidates = [],
}: {
  children: React.ReactNode
  initialCandidates?: GlobalSearchIndexItem[]
}) {
  const router = useRouter()
  const lastZeroResultQueryRef = useRef("")
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(-1)
  const [candidates, setCandidates] = useState<GlobalSearchIndexItem[]>(initialCandidates)
  const [loadState, setLoadState] = useState<SearchIndexLoadState>(
    initialCandidates.length > 0 ? "ready" : "idle"
  )
  const deferredQuery = useDeferredValue(query)

  const shortcutItems = useMemo(() => buildShortcutItems(), [])

  const loadSearchCandidates = useCallback(async () => {
    if (loadState === "ready" || loadState === "loading") return
    setLoadState("loading")
    try {
      const data = await fetchGlobalSearchIndex()
      setCandidates(data)
      setLoadState("ready")
    } catch (error) {
      console.error("global search index failed", error)
      setLoadState("error")
    }
  }, [loadState])

  const candidateByHref = useMemo(() => {
    const m = new Map<string, GlobalSearchIndexItem>()
    for (const c of candidates) m.set(c.href, c)
    return m
  }, [candidates])

  const recentsSnapshot = useMemo(() => {
    if (!open || typeof window === "undefined") {
      return { queries: [] as string[], candidates: [] as GlobalSearchIndexItem[] }
    }
    const stored = readRecentCandidates()
    return {
      queries: readRecentQueries(),
      candidates: hydrateRecentCandidatesFromIndex(stored, candidateByHref),
    }
  }, [open, candidateByHref])

  const openSearch = useCallback(() => {
    setOpen(true)
    void loadSearchCandidates()
  }, [loadSearchCandidates])

  const closeSearch = useCallback(() => setOpen(false), [])

  const contextValue = useMemo(
    () => ({
      openSearch,
      closeSearch,
      open,
    }),
    [open, openSearch, closeSearch]
  )

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if ((event.metaKey || event.ctrlKey) && key === "k") {
        event.preventDefault()
        setOpen((current) => {
          if (!current) {
            void loadSearchCandidates()
          }
          return !current
        })
        return
      }

      if (event.key === "/" && !isTextInput(event.target)) {
        event.preventDefault()
        void loadSearchCandidates()
        setOpen(true)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [loadSearchCandidates])

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Closing the palette clears transient input state.
      setQuery("")
      setActiveIndex(-1)
    }
  }, [open])

  const queryNorm = normalizeForSearch(deferredQuery)

  const filtered = useMemo(
    () => filterGlobalSearchPalette(deferredQuery, shortcutItems, candidates),
    [deferredQuery, candidates, shortcutItems]
  )

  const { flatRows, sections } = useMemo(
    () =>
      buildPaletteModel({
        queryNormalized: queryNorm,
        shortcutItems,
        initialCandidates: candidates,
        filtered,
        recentQueries: recentsSnapshot.queries,
        recentCandidates: recentsSnapshot.candidates,
      }),
    [
      queryNorm,
      shortcutItems,
      candidates,
      filtered,
      recentsSnapshot.queries,
      recentsSnapshot.candidates,
    ]
  )

  useEffect(() => {
    if (!open) return
    const trimmed = deferredQuery.trim()
    if (!trimmed) return
    const handle = window.setTimeout(() => {
      if (flatRows.length === 0) {
        const zeroResultKey = normalizeForSearch(trimmed)
        if (lastZeroResultQueryRef.current !== zeroResultKey) {
          lastZeroResultQueryRef.current = zeroResultKey
          trackLaunchEvent(ANALYTICS_EVENTS.searchZeroResults, {
            term_length: trimmed.length,
            surface: "global_search",
          })
        }
      }
    }, 450)
    return () => window.clearTimeout(handle)
  }, [open, deferredQuery, flatRows.length])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- New query results should start with no highlighted option.
    setActiveIndex(-1)
  }, [deferredQuery])

  useEffect(() => {
    if (activeIndex < 0) return
    const el = document.getElementById(optionId(activeIndex))
    el?.scrollIntoView({ block: "nearest" })
  }, [activeIndex])

  const commitNavigate = useCallback((item: GlobalSearchIndexItem, q: string) => {
    const trimmed = q.trim()
    if (trimmed.length >= 2) recordRecentSearchQuery(trimmed)
    if (item.badge !== "Atalho") {
      const baseHref = item.href.split("?")[0]
      recordRecentCandidateVisit({
        href: baseHref,
        title: item.title,
        subtitle: item.subtitle,
        foto_url: item.foto_url,
      })
    }
    if (item.badge !== "Atalho") {
      trackLaunchEvent(ANALYTICS_EVENTS.candidateClick, { surface: "global_search" })
    }
  }, [])

  const handleInputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      const totalItems = flatRows.length
      if (totalItems === 0) return

      if (event.key === "ArrowDown") {
        event.preventDefault()
        setActiveIndex((prev) => (prev < totalItems - 1 ? prev + 1 : 0))
      } else if (event.key === "ArrowUp") {
        event.preventDefault()
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : totalItems - 1))
      } else if (event.key === "Enter" && activeIndex >= 0) {
        event.preventDefault()
        const row = flatRows[activeIndex]
        if (!row) return
        if (row.kind === "recent_query") {
          setQuery(row.query)
          setActiveIndex(-1)
          return
        }
        setOpen(false)
        commitNavigate(row.item, deferredQuery)
        router.push(resolveGlobalSearchHref(row.item, deferredQuery))
      }
    },
    [activeIndex, commitNavigate, deferredQuery, flatRows, router]
  )

  const totalCount = flatRows.length
  const isSearchIndexLoading = loadState === "loading" && candidates.length === 0

  return (
    <GlobalSearchContext.Provider value={contextValue}>
      {children}

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-[80] bg-black/45 backdrop-blur-[2px]" />
          <div className="fixed inset-0 z-[81] flex items-start justify-center px-4 pt-20 sm:px-6 sm:pt-24">
            <Dialog.Popup className="w-full max-w-2xl rounded-[24px] border border-foreground/10 bg-background shadow-2xl outline-none">
              <div className="border-b border-border/60 px-4 py-4 sm:px-5">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-full bg-foreground text-background">
                    <Command className="size-4" />
                  </div>
                  <div className="flex-1">
                    <Dialog.Title className="font-heading text-[22px] uppercase leading-none text-foreground">
                      Busca rápida
                    </Dialog.Title>
                    <p className="mt-1 text-[12px] font-medium text-muted-foreground">
                      {SCOPE_LABEL}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeSearch}
                    className="rounded-full border border-border p-2 text-muted-foreground transition-colors hover:text-foreground"
                    aria-label="Fechar busca rápida"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                <div className="relative mt-4">
                  <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    autoFocus
                    type="search"
                    role="combobox"
                    aria-label="Buscar no site"
                    aria-expanded={totalCount > 0}
                    aria-controls="gsp-listbox"
                    aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
                    aria-autocomplete="list"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={handleInputKeyDown}
                    placeholder="Buscar candidato, página ou destino..."
                    className="h-12 w-full rounded-full border border-border bg-background pl-11 pr-4 text-base font-medium text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground/40 focus:ring-2 focus:ring-foreground/10 md:text-[14px]"
                  />
                </div>
              </div>

              <div aria-live="polite" aria-atomic="true" className="sr-only">
                {deferredQuery.trim()
                  ? totalCount === 0
                    ? "Sem resultados"
                    : `${totalCount} resultado${totalCount !== 1 ? "s" : ""}`
                  : ""}
              </div>

              <div
                id="gsp-listbox"
                role="listbox"
                aria-label="Resultados da busca"
                className="max-h-[65vh] overflow-y-auto px-4 py-4 sm:px-5"
              >
                {isSearchIndexLoading ? (
                  <div className="rounded-[18px] border border-dashed border-border px-4 py-10 text-center">
                    <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                      Carregando busca
                    </p>
                    <p className="mt-2 text-[14px] font-medium text-foreground">
                      Preparando o índice de candidatos.
                    </p>
                  </div>
                ) : totalCount === 0 ? (
                  <div className="rounded-[18px] border border-dashed border-border px-4 py-10 text-center">
                    <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                      Sem resultado
                    </p>
                    <p className="mt-2 text-[14px] font-medium text-foreground">
                      Nenhum item corresponde a &ldquo;{deferredQuery}&rdquo;.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {(() => {
                      let flatIdx = 0
                      return sections.map((section) => {
                        if (section.rows.length === 0) return null
                        const block = (
                          <div key={section.label} role="group" aria-label={section.label}>
                            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                              {section.label}
                            </p>
                            <div className="space-y-2">
                              {section.rows.map((row) => {
                                const idx = flatIdx
                                flatIdx += 1
                                const isActive = idx === activeIndex

                                if (row.kind === "recent_query") {
                                  return (
                                    <button
                                      key={`q-${row.query}-${idx}`}
                                      type="button"
                                      id={optionId(idx)}
                                      role="option"
                                      aria-selected={isActive}
                                      onMouseEnter={() => setActiveIndex(idx)}
                                      onClick={() => {
                                        setQuery(row.query)
                                        setActiveIndex(-1)
                                      }}
                                      className={`group flex w-full items-center justify-between rounded-[16px] border px-4 py-3 text-left transition-colors ${
                                        isActive
                                          ? "border-foreground/20 bg-muted"
                                          : "border-border/60 hover:border-foreground/20 hover:bg-muted"
                                      }`}
                                    >
                                      <span className="font-heading text-[18px] uppercase leading-none text-foreground">
                                        {row.query}
                                      </span>
                                      <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                                        Aplicar
                                      </span>
                                    </button>
                                  )
                                }

                                const item = row.item
                                return (
                                  <Link
                                    key={`${item.href}-${idx}`}
                                    id={optionId(idx)}
                                    role="option"
                                    aria-selected={isActive}
                                    href={resolveGlobalSearchHref(item, deferredQuery)}
                                    onClick={() => {
                                      commitNavigate(item, deferredQuery)
                                      closeSearch()
                                    }}
                                    onMouseEnter={() => setActiveIndex(idx)}
                                    className={`group flex items-center gap-3 rounded-[16px] border px-4 py-3 transition-colors ${
                                      section.label === "Atalhos" ? "justify-between" : ""
                                    } ${
                                      isActive
                                        ? "border-foreground/20 bg-muted"
                                        : "border-border/60 hover:border-foreground/20 hover:bg-muted"
                                    }`}
                                  >
                                    {section.label !== "Atalhos" ? (
                                      <>
                                        {/* Sem foto ou com foto quebrada, o CandidatePhoto
                                            cai nas iniciais: círculo cinza vazio parece
                                            item quebrado no fluxo de busca. */}
                                        <CandidatePhoto
                                          src={item.foto_url}
                                          alt={item.title}
                                          name={item.title}
                                          width={44}
                                          height={44}
                                          sizes="44px"
                                          className="size-11 shrink-0 rounded-full object-cover object-top"
                                          fallbackClassName="size-11 shrink-0 rounded-full"
                                          initialsClassName="text-xs"
                                        />
                                        <div className="min-w-0 flex-1">
                                          <p className="font-heading text-[18px] uppercase leading-none text-foreground">
                                            <HighlightedText text={item.title} query={deferredQuery} />
                                          </p>
                                          <p className="mt-1 text-[13px] font-medium text-muted-foreground">
                                            <HighlightedText text={item.subtitle} query={deferredQuery} />
                                          </p>
                                        </div>
                                        <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                                      </>
                                    ) : (
                                      <>
                                        <div>
                                          <p className="font-heading text-[18px] uppercase leading-none text-foreground">
                                            <HighlightedText text={item.title} query={deferredQuery} />
                                          </p>
                                          <p className="mt-1 text-[13px] font-medium text-muted-foreground">
                                            <HighlightedText text={item.subtitle} query={deferredQuery} />
                                          </p>
                                        </div>
                                        <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                                      </>
                                    )}
                                  </Link>
                                )
                              })}
                            </div>
                          </div>
                        )
                        return block
                      })
                    })()}
                  </div>
                )}
              </div>
            </Dialog.Popup>
          </div>
        </Dialog.Portal>
      </Dialog.Root>
    </GlobalSearchContext.Provider>
  )
}

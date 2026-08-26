"use client"

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Search,
  Sparkles,
} from "lucide-react"
import type {
  ProgramaGovernoApiResponse,
  ProgramaGovernoEstado,
  ProgramaGovernoFontePublica,
  ProgramaGovernoManifestoPublico,
  ProgramaGovernoPublico,
} from "@/lib/programa-governo"

export type ProgramaGovernoLoadState = "idle" | "loading" | "loaded" | "failed"

export type ProgramaTextMatch = { start: number; end: number }

function normalizedSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase("pt-BR")
}

export function findProgramaTextMatches(text: string, rawQuery: string): ProgramaTextMatch[] {
  const query = normalizedSearch(rawQuery.trim())
  if (!query) return []
  const searchable: string[] = []
  const starts: number[] = []
  const ends: number[] = []
  let originalOffset = 0
  for (const character of text) {
    const start = originalOffset
    originalOffset += character.length
    const normalized = normalizedSearch(character)
    for (const normalizedCharacter of normalized) {
      searchable.push(normalizedCharacter)
      starts.push(start)
      ends.push(originalOffset)
    }
  }
  const haystack = searchable.join("")
  const matches: ProgramaTextMatch[] = []
  let cursor = 0
  while (cursor <= haystack.length - query.length) {
    const index = haystack.indexOf(query, cursor)
    if (index < 0) break
    matches.push({ start: starts[index], end: ends[index + query.length - 1] })
    cursor = index + Math.max(1, query.length)
  }
  return matches
}

function sourceHref(fonte: ProgramaGovernoFontePublica) {
  return fonte.pdfOriginalUrl ?? fonte.pacoteUrl
}

function SourceLink({ fonte }: { fonte: ProgramaGovernoFontePublica }) {
  const directPdf = Boolean(fonte.pdfOriginalUrl)
  return (
    <a
      href={sourceHref(fonte)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      data-pf-programa-source={directPdf ? "pdf" : "pacote-zip"}
    >
      <ExternalLink className="size-4" aria-hidden="true" />
      {directPdf ? "Abrir PDF original no TSE" : "Abrir pacote oficial do TSE"}
      <span className="sr-only">, abre em nova aba</span>
    </a>
  )
}

const STATE_COPY: Record<ProgramaGovernoEstado, { title: string; description: string }> = {
  nao_coletado: {
    title: "Programa ainda não coletado",
    description: "A coleta do documento oficial ainda não foi concluída.",
  },
  fonte_ausente: {
    title: "Documento não localizado no TSE",
    description: "A verificação oficial registrada não encontrou um programa publicável.",
  },
  extracao_falhou: {
    title: "Texto integral indisponível",
    description: "O documento oficial foi localizado, mas a extração do texto não ficou confiável.",
  },
  aguardando_revisao: {
    title: "Conteúdo em revisão editorial",
    description: "O texto e o resumo foram preparados, mas só serão publicados após revisão humana.",
  },
  aprovado: {
    title: "Programa de governo",
    description: "Conteúdo revisado e disponível.",
  },
}

function ProgramStateNotice({ manifesto }: { manifesto: ProgramaGovernoManifestoPublico }) {
  const copy = STATE_COPY[manifesto.estado]
  return (
    <div className="space-y-4" data-pf-programa-state={manifesto.estado}>
      <div>
        <h3 className="text-base font-semibold text-foreground">{copy.title}</h3>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{copy.description}</p>
      </div>
      <SourceLink fonte={manifesto.fonte} />
      {!manifesto.fonte.pdfOriginalUrl && (
        <p className="text-xs leading-5 text-muted-foreground">
          O TSE disponibiliza este documento no arquivo {manifesto.fonte.arquivoNome}, dentro do pacote oficial.
        </p>
      )}
    </div>
  )
}

export function ProgramaGovernoOverview({
  manifesto,
  onOpenTab,
}: {
  manifesto: ProgramaGovernoManifestoPublico
  onOpenTab: () => void
}) {
  return (
    <section
      aria-labelledby="programa-governo-overview-title"
      className="rounded-[12px] border border-border/60 bg-card p-5 sm:p-6"
      data-pf-programa-overview=""
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted">
            <FileText className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Eleições 2026</p>
            <h2 id="programa-governo-overview-title" className="text-xl font-semibold text-foreground">
              Programa de governo
            </h2>
          </div>
        </div>
        {manifesto.estado === "aprovado" && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-semibold text-foreground">
            <Sparkles className="size-3.5" aria-hidden="true" />
            Resumo por IA, revisado editorialmente
          </span>
        )}
      </div>

      {manifesto.estado === "aprovado" && manifesto.resumo ? (
        <div data-pf-programa-approved="">
          <p className="max-w-4xl text-[15px] leading-7 text-foreground">{manifesto.resumo.texto}</p>
          <ul className="mt-5 flex flex-wrap gap-2" aria-label="Temas centrais do programa">
            {manifesto.resumo.temas.map((tema) => (
              <li key={tema.id} className="rounded-full bg-muted px-3 py-1.5 text-xs font-semibold text-foreground">
                {tema.titulo}
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onOpenTab}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] bg-foreground px-4 py-2 text-sm font-semibold text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Ler programa completo
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
            <SourceLink fonte={manifesto.fonte} />
          </div>
          {manifesto.reviewedAt && (
            <p className="mt-4 text-xs text-muted-foreground">
              Revisado em {new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "UTC" }).format(new Date(manifesto.reviewedAt))}.
            </p>
          )}
        </div>
      ) : (
        <ProgramStateNotice manifesto={manifesto} />
      )}
    </section>
  )
}

type SearchPlan = {
  matches: ProgramaTextMatch[]
  offset: number
}

function HighlightedText({
  text,
  plan,
  activeResult,
  registerMark,
}: {
  text: string
  plan: SearchPlan
  activeResult: number
  registerMark: (index: number, element: HTMLElement | null) => void
}) {
  if (plan.matches.length === 0) return text
  const nodes: ReactNode[] = []
  let cursor = 0
  for (const [index, match] of plan.matches.entries()) {
    const globalIndex = plan.offset + index
    nodes.push(text.slice(cursor, match.start))
    nodes.push(
      <mark
        key={`${match.start}-${match.end}`}
        ref={(element) => registerMark(globalIndex, element)}
        tabIndex={-1}
        aria-current={activeResult === globalIndex ? "true" : undefined}
        className={activeResult === globalIndex ? "rounded bg-amber-300 px-0.5 text-black ring-2 ring-amber-500" : "rounded bg-amber-100 px-0.5 text-inherit"}
      >
        {text.slice(match.start, match.end)}
      </mark>,
    )
    cursor = match.end
  }
  nodes.push(text.slice(cursor))
  return <>{nodes}</>
}

function ProgramaDocument({ data }: { data: ProgramaGovernoPublico }) {
  const [query, setQuery] = useState("")
  const [activeResult, setActiveResult] = useState(0)
  const markRefs = useRef<Array<HTMLElement | null>>([])
  const plans = useMemo(() => {
    const matchesBySection = data.secoes.map((section) =>
      findProgramaTextMatches(section.conteudo, query),
    )
    return matchesBySection.map((matches, index) => ({
      matches,
      offset: matchesBySection
        .slice(0, index)
        .reduce((total, previous) => total + previous.length, 0),
    }))
  }, [data.secoes, query])
  const resultCount = plans.reduce((total, plan) => total + plan.matches.length, 0)
  const toc = useMemo(() => {
    const seen = new Set<string>()
    return data.secoes.filter((section) => {
      const title = section.titulo.trim()
      const key = normalizedSearch(title)
      if (title.length < 4 || title.length > 120 || /^(programa|proposta|plano)( de governo)?$/i.test(title) || seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [data.secoes])

  const moveTo = useCallback((index: number) => {
    if (resultCount === 0) return
    const next = (index + resultCount) % resultCount
    setActiveResult(next)
    requestAnimationFrame(() => {
      markRefs.current[next]?.focus({ preventScroll: true })
      markRefs.current[next]?.scrollIntoView({ behavior: "smooth", block: "center" })
    })
  }, [resultCount])

  const registerMark = useCallback((index: number, element: HTMLElement | null) => {
    markRefs.current[index] = element
  }, [])

  const changeQuery = useCallback((value: string) => {
    setQuery(value)
    setActiveResult(0)
    markRefs.current = []
  }, [])

  return (
    <div data-pf-programa-document="">
      <div className="rounded-[12px] border border-border bg-card p-4 sm:p-5">
        <label htmlFor="programa-search" className="text-sm font-semibold text-foreground">
          Buscar no programa
        </label>
        <p id="programa-search-help" className="mt-1 text-xs leading-5 text-muted-foreground">
          A busca ignora diferenças entre maiúsculas, minúsculas e acentos.
        </p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              id="programa-search"
              type="search"
              value={query}
              onChange={(event) => changeQuery(event.target.value)}
              aria-describedby="programa-search-help programa-search-results"
              className="min-h-11 w-full rounded-[8px] border border-border bg-background pl-10 pr-3 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="flex items-center gap-2">
            <p id="programa-search-results" className="min-w-24 text-sm text-muted-foreground" aria-live="polite">
              {!query.trim() ? "Digite para buscar" : `${resultCount} resultado${resultCount === 1 ? "" : "s"}`}
            </p>
            <button type="button" onClick={() => moveTo(activeResult - 1)} disabled={resultCount === 0} aria-label="Resultado anterior" className="grid size-11 place-items-center rounded-[8px] border border-border disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => moveTo(activeResult + 1)} disabled={resultCount === 0} aria-label="Próximo resultado" className="grid size-11 place-items-center rounded-[8px] border border-border disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {toc.length > 0 && (
        <nav aria-label="Sumário do programa" className="mt-8 rounded-[12px] border border-border/60 bg-muted/20 p-5">
          <h2 className="text-base font-semibold text-foreground">Sumário</h2>
          <ol className="mt-3 columns-1 gap-x-8 space-y-2 text-sm sm:columns-2">
            {toc.map((section) => (
              <li key={section.id} className="break-inside-avoid">
                <a href={`#programa-${section.id}`} className="break-words text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground">
                  {section.titulo}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}

      <article className="mt-10 space-y-10" aria-label="Texto integral do programa de governo">
        {data.secoes.map((section, sectionIndex) => {
          const level = Math.min(4, Math.max(2, section.nivel + 1))
          const Heading = `h${level}` as "h2" | "h3" | "h4"
          return (
            <section key={section.id} id={`programa-${section.id}`} className="scroll-mt-32 border-b border-border/60 pb-10" data-pf-programa-section={section.id}>
              <Heading className="break-words text-xl font-semibold text-foreground">{section.titulo}</Heading>
              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {section.paginaInicial === section.paginaFinal ? `Página ${section.paginaInicial}` : `Páginas ${section.paginaInicial} a ${section.paginaFinal}`}
              </p>
              <p className="mt-5 whitespace-pre-wrap break-words text-[15px] leading-7 text-foreground">
                <HighlightedText text={section.conteudo} plan={plans[sectionIndex]} activeResult={activeResult} registerMark={registerMark} />
              </p>
            </section>
          )
        })}
      </article>
    </div>
  )
}

export function ProgramaGovernoTab({
  manifesto,
  loadState,
  response,
  onRetry,
}: {
  manifesto: ProgramaGovernoManifestoPublico
  loadState: ProgramaGovernoLoadState
  response: ProgramaGovernoApiResponse | null
  onRetry: () => void
}) {
  if (loadState === "idle" || loadState === "loading") {
    return <div role="status" className="animate-pulse rounded-[12px] border border-border bg-muted/25 p-6 text-sm text-muted-foreground">Carregando programa de governo...</div>
  }
  if (loadState === "failed") {
    return (
      <div role="alert" className="rounded-[12px] border border-border bg-card p-6">
        <h2 className="text-lg font-semibold text-foreground">Não foi possível carregar o programa</h2>
        <p className="mt-2 text-sm text-muted-foreground">Tente novamente sem sair da ficha.</p>
        <button type="button" onClick={onRetry} className="mt-4 min-h-11 rounded-[8px] bg-foreground px-4 py-2 text-sm font-semibold text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Tentar novamente</button>
      </div>
    )
  }
  if (!response?.data || response.estado !== "aprovado") {
    return (
      <section className="rounded-[12px] border border-border bg-card p-6" aria-labelledby="programa-tab-state-title">
        <h2 id="programa-tab-state-title" className="sr-only">Estado do programa de governo</h2>
        <ProgramStateNotice manifesto={{ ...manifesto, estado: response?.estado ?? manifesto.estado, fonte: response?.fonte ?? manifesto.fonte }} />
      </section>
    )
  }
  return (
    <section data-pf-programa-tab="">
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Documento oficial do TSE</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">Programa de governo</h2>
          <p className="mt-2 text-sm text-muted-foreground">{response.data.paginas} páginas, texto integral extraído e revisado.</p>
        </div>
        <SourceLink fonte={response.data.fonte} />
      </div>
      <ProgramaDocument data={response.data} />
    </section>
  )
}

"use client"

// cspell:words multidocument nivel secao secoes

import {
  useCallback,
  useEffect,
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
  ProgramaGovernoDocumentoPublico,
  ProgramaGovernoEstado,
  ProgramaGovernoFontePublica,
  ProgramaGovernoManifestoPublico,
  ProgramaGovernoSecao,
} from "@/lib/programa-governo"

export type ProgramaGovernoLoadState = "idle" | "loading" | "loaded" | "failed"

export type ProgramaGovernoDocumentoCarregado = {
  documentoId: string
  sourceSha256: string
  extractedTextSha256: string
  secoes: ProgramaGovernoSecao[]
}

type ProgramaGovernoFetch = (
  input: string,
  init: RequestInit,
) => Promise<Pick<Response, "ok" | "status" | "json">>

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

type ProgramaGovernoLinkFonte = Pick<
  ProgramaGovernoFontePublica,
  "pacoteUrl" | "pdfOriginalUrl"
>

function sourceHref(fonte: ProgramaGovernoLinkFonte) {
  return fonte.pdfOriginalUrl ?? fonte.pacoteUrl
}

function sourceConsultedAt(fonte: ProgramaGovernoFontePublica): string | null {
  return Number.isNaN(Date.parse(fonte.consultadoEm)) ? null : fonte.consultadoEm
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(value))
}

function electionContext(fonte: ProgramaGovernoFontePublica) {
  return fonte.cargo === "GOVERNADOR" ? `Governo de ${fonte.uf}` : null
}

function SourceLink({ fonte }: { fonte: ProgramaGovernoLinkFonte }) {
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
  em_revisao: {
    title: "Conteúdo em revisão editorial",
    description: "O texto e o resumo só serão publicados após revisão humana.",
  },
  sem_documento_oficial: {
    title: "Documento oficial não localizado",
    description: "Na consulta registrada ao TSE, não foi localizado um documento para esta candidatura. Isso não permite concluir que a candidatura não tenha propostas.",
  },
  falha_de_extracao: {
    title: "Texto integral indisponível",
    description: "Um documento oficial foi localizado, mas não foi possível extrair seu texto com confiabilidade.",
  },
  perfil_local_ausente: {
    title: "Ficha local não disponível",
    description: "A candidatura consta na fonte oficial, mas não há uma ficha local correspondente para apresentar o documento neste momento.",
  },
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
  const consultedAt = sourceConsultedAt(manifesto.fonte)
  const hasLocatedDocument = [
    "aprovado",
    "em_revisao",
    "falha_de_extracao",
    "aguardando_revisao",
    "extracao_falhou",
  ].includes(manifesto.estado)
  return (
    <div className="space-y-4" data-pf-programa-state={manifesto.estado}>
      <div>
        <h3 className="text-base font-semibold text-foreground">{copy.title}</h3>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{copy.description}</p>
        <p className="mt-3 text-xs leading-5 text-muted-foreground" data-pf-programa-source-details="">
          Fonte consultada: Tribunal Superior Eleitoral (TSE)
          {consultedAt ? `, em ${formatDate(consultedAt)}` : ""}.
        </p>
      </div>
      <SourceLink fonte={manifesto.fonte} />
      {hasLocatedDocument && !manifesto.fonte.pdfOriginalUrl && (
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
  const context = electionContext(manifesto.fonte)
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
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
              Eleições 2026{context ? ` · ${context}` : ""}
            </p>
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
              {manifesto.documentos?.length ? "Ler documentos completos" : "Ler programa completo"}
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
            <SourceLink fonte={manifesto.fonte} />
          </div>
          {manifesto.reviewedAt && (
            <p className="mt-4 text-xs text-muted-foreground">
              Revisado em {formatDate(manifesto.reviewedAt)}.
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

function sameDocumento(
  actual: ProgramaGovernoDocumentoPublico,
  expected: ProgramaGovernoDocumentoPublico,
) {
  return actual.documentoId === expected.documentoId
    && actual.sourceSha256 === expected.sourceSha256
    && actual.extractedTextSha256 === expected.extractedTextSha256
    && actual.paginas === expected.paginas
    && actual.secoes === expected.secoes
    && actual.fonte.arquivoNome === expected.fonte.arquivoNome
    && actual.fonte.arquivoNoPacote === expected.fonte.arquivoNoPacote
    && actual.fonte.pacoteUrl === expected.fonte.pacoteUrl
    && actual.fonte.datasetUrl === expected.fonte.datasetUrl
    && actual.fonte.pdfOriginalUrl === expected.fonte.pdfOriginalUrl
}

export function programaGovernoDocumentoCacheKey(
  documento: Pick<
    ProgramaGovernoDocumentoPublico,
    "documentoId" | "sourceSha256" | "extractedTextSha256"
  >,
) {
  return [
    documento.documentoId,
    documento.sourceSha256,
    documento.extractedTextSha256,
  ].join(":")
}

function loadedDocumentoMatches(
  loaded: ProgramaGovernoDocumentoCarregado,
  expected: ProgramaGovernoDocumentoPublico,
) {
  return programaGovernoDocumentoCacheKey(loaded) === programaGovernoDocumentoCacheKey(expected)
}

function nextCursorIndex(documentoId: string, cursor: string) {
  const prefix = `${documentoId}@`
  if (!cursor.startsWith(prefix)) return null
  const rawIndex = cursor.slice(prefix.length)
  if (!/^\d+$/.test(rawIndex)) return null
  const index = Number(rawIndex)
  return Number.isSafeInteger(index) ? index : null
}

export async function loadProgramaGovernoDocumentoCompleto(
  slug: string,
  documento: ProgramaGovernoDocumentoPublico,
  signal: AbortSignal,
  fetcher: ProgramaGovernoFetch = fetch,
): Promise<ProgramaGovernoDocumentoCarregado> {
  const secoes: ProgramaGovernoSecao[] = []
  const sectionIds = new Set<string>()
  const seenCursors = new Set<string>()
  let cursor: string | null = null

  for (let requestIndex = 0; requestIndex <= documento.secoes; requestIndex += 1) {
    const query = new URLSearchParams({ documentoId: documento.documentoId })
    if (cursor !== null) query.set("cursor", cursor)
    const response = await fetcher(
      `/api/candidato-profile/${encodeURIComponent(slug)}/programa?${query.toString()}`,
      { credentials: "same-origin", signal },
    )
    if (!response.ok) {
      throw new Error(`programa_governo_documento_fetch_failed:${response.status}`)
    }
    const body = (await response.json()) as ProgramaGovernoApiResponse
    const chunk = body.chunk
    if (body.estado !== "aprovado" || body.data !== null || !body.fonte || !chunk) {
      throw new Error("programa_governo_documento_fetch_empty")
    }
    if (!sameDocumento(chunk.documento, documento) || chunk.cursor !== cursor) {
      throw new Error("programa_governo_documento_identity_mismatch")
    }
    if (chunk.secoes.length === 0) {
      throw new Error("programa_governo_documento_empty_chunk")
    }
    for (const section of chunk.secoes) {
      if (
        sectionIds.has(section.id)
        || section.paginaInicial < 1
        || section.paginaFinal < section.paginaInicial
        || section.paginaFinal > documento.paginas
      ) {
        throw new Error("programa_governo_documento_invalid_section")
      }
      sectionIds.add(section.id)
      secoes.push(section)
    }

    if (chunk.completo) {
      if (chunk.nextCursor !== null || secoes.length !== documento.secoes) {
        throw new Error("programa_governo_documento_incomplete")
      }
      return {
        documentoId: documento.documentoId,
        sourceSha256: documento.sourceSha256,
        extractedTextSha256: documento.extractedTextSha256,
        secoes,
      }
    }

    const nextCursor = chunk.nextCursor
    const nextIndex = nextCursor ? nextCursorIndex(documento.documentoId, nextCursor) : null
    const currentIndex = cursor ? nextCursorIndex(documento.documentoId, cursor) : 0
    if (
      !nextCursor
      || nextIndex === null
      || currentIndex === null
      || nextIndex <= currentIndex
      || nextIndex !== secoes.length
      || seenCursors.has(nextCursor)
      || secoes.length >= documento.secoes
    ) {
      throw new Error("programa_governo_documento_cursor_loop")
    }
    seenCursors.add(nextCursor)
    cursor = nextCursor
  }

  throw new Error("programa_governo_documento_incomplete")
}

export function useProgramaGovernoDocuments({
  active,
  slug,
  manifesto,
}: {
  active: boolean
  slug: string
  manifesto: ProgramaGovernoManifestoPublico | null
}) {
  const documents = useMemo(
    () => manifesto?.estado === "aprovado" ? (manifesto.documentos ?? []) : [],
    [manifesto],
  )
  const isMultiDocument = documents.length > 0
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(
    documents[0]?.documentoId ?? null,
  )
  const activeDocumentId = documents.some(
    (document) => document.documentoId === selectedDocumentId,
  )
    ? selectedDocumentId
    : (documents[0]?.documentoId ?? null)
  const cacheRef = useRef(new Map<string, ProgramaGovernoDocumentoCarregado>())
  const [loadedDocument, setLoadedDocument] = useState<ProgramaGovernoDocumentoCarregado | null>(null)
  const [loadState, setLoadState] = useState<ProgramaGovernoLoadState>("idle")
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    cacheRef.current.clear()
  }, [slug])

  useEffect(() => {
    if (!active || !isMultiDocument || !activeDocumentId) return
    const document = documents.find((candidate) => candidate.documentoId === activeDocumentId)
    if (!document) return
    const cacheKey = programaGovernoDocumentoCacheKey(document)
    const cached = cacheRef.current.get(cacheKey)
    if (cached) {
      setLoadedDocument(cached)
      setLoadState("loaded")
      return
    }

    const controller = new AbortController()
    let cancelled = false
    setLoadedDocument(null)
    setLoadState("loading")
    loadProgramaGovernoDocumentoCompleto(slug, document, controller.signal)
      .then((loaded) => {
        if (cancelled) return
        cacheRef.current.set(cacheKey, loaded)
        setLoadedDocument(loaded)
        setLoadState("loaded")
      })
      .catch((error: unknown) => {
        if (cancelled || (error instanceof DOMException && error.name === "AbortError")) return
        setLoadedDocument(null)
        setLoadState("failed")
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [active, activeDocumentId, documents, isMultiDocument, retryKey, slug])

  const selectDocument = useCallback((documentoId: string) => {
    const document = documents.find((candidate) => candidate.documentoId === documentoId)
    if (!document) return
    const cached = cacheRef.current.get(programaGovernoDocumentoCacheKey(document)) ?? null
    setSelectedDocumentId(documentoId)
    setLoadedDocument(cached)
    setLoadState(cached ? "loaded" : "idle")
  }, [documents])

  const retryDocument = useCallback(() => {
    if (!activeDocumentId) return
    const document = documents.find((candidate) => candidate.documentoId === activeDocumentId)
    if (document) {
      cacheRef.current.delete(programaGovernoDocumentoCacheKey(document))
    }
    setLoadedDocument(null)
    setLoadState("idle")
    setRetryKey((value) => value + 1)
  }, [activeDocumentId, documents])

  return {
    activeDocumentId,
    isMultiDocument,
    loadedDocument,
    loadState,
    retryDocument,
    selectDocument,
  }
}

function buildSearchPlans(matchesBySection: ProgramaTextMatch[][]): SearchPlan[] {
  let offset = 0
  return matchesBySection.map((matches) => {
    const plan = { matches, offset }
    offset += matches.length
    return plan
  })
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

function ProgramaDocument({ secoes }: { secoes: ProgramaGovernoSecao[] }) {
  const INITIAL_VISIBLE_SECTIONS = 12
  const SECTION_BATCH_SIZE = 12
  const [query, setQuery] = useState("")
  const [activeResult, setActiveResult] = useState(-1)
  const [visibleSectionCount, setVisibleSectionCount] = useState(INITIAL_VISIBLE_SECTIONS)
  const [pendingResult, setPendingResult] = useState<number | null>(null)
  const markRefs = useRef<Array<HTMLElement | null>>([])
  const plans = useMemo(() => {
    const matchesBySection = secoes.map((section) =>
      findProgramaTextMatches(section.conteudo, query),
    )
    return buildSearchPlans(matchesBySection)
  }, [secoes, query])
  const resultCount = plans.reduce((total, plan) => total + plan.matches.length, 0)
  const visibleSections = secoes.slice(0, visibleSectionCount)
  const remainingSections = Math.max(0, secoes.length - visibleSections.length)
  const toc = useMemo(() => {
    const seen = new Set<string>()
    return secoes.filter((section) => {
      const title = section.titulo.trim()
      const key = normalizedSearch(title)
      if (title.length < 4 || title.length > 120 || /^(programa|proposta|plano)( de governo)?$/i.test(title) || seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [secoes])

  useEffect(() => {
    if (pendingResult === null) return
    const frame = requestAnimationFrame(() => {
      const mark = markRefs.current[pendingResult]
      if (!mark) return
      mark.focus({ preventScroll: true })
      mark.scrollIntoView({ behavior: "smooth", block: "center" })
      setPendingResult(null)
    })
    return () => cancelAnimationFrame(frame)
  }, [pendingResult, visibleSectionCount])

  const moveTo = useCallback((index: number) => {
    if (resultCount === 0) return
    const next = (index + resultCount) % resultCount
    const sectionIndex = plans.findIndex((plan) => next >= plan.offset && next < plan.offset + plan.matches.length)
    if (sectionIndex >= 0) setVisibleSectionCount((current) => Math.max(current, sectionIndex + 1))
    setActiveResult(next)
    setPendingResult(next)
  }, [plans, resultCount])

  const registerMark = useCallback((index: number, element: HTMLElement | null) => {
    markRefs.current[index] = element
  }, [])

  const changeQuery = useCallback((value: string) => {
    setQuery(value)
    setActiveResult(-1)
    markRefs.current = []
  }, [])

  const revealSection = useCallback((sectionIndex: number, sectionId: string) => {
    setVisibleSectionCount((current) => Math.max(current, sectionIndex + 1))
    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.getElementById(`programa-${sectionId}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
    }))
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
              {!query.trim()
                ? "Digite para buscar"
                : activeResult >= 0
                  ? `Resultado ${activeResult + 1} de ${resultCount}`
                  : `${resultCount} resultado${resultCount === 1 ? "" : "s"}`}
            </p>
            <button type="button" onClick={() => moveTo(activeResult < 0 ? resultCount - 1 : activeResult - 1)} disabled={resultCount === 0} aria-label="Resultado anterior" className="grid size-11 place-items-center rounded-[8px] border border-border disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => moveTo(activeResult < 0 ? 0 : activeResult + 1)} disabled={resultCount === 0} aria-label="Próximo resultado" className="grid size-11 place-items-center rounded-[8px] border border-border disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
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
                <a
                  href={`#programa-${section.id}`}
                  onClick={(event) => {
                    event.preventDefault()
                    window.history.pushState(null, "", `#programa-${section.id}`)
                    revealSection(secoes.findIndex((item) => item.id === section.id), section.id)
                  }}
                  className="break-words text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
                >
                  {section.titulo}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}

      <article className="mt-10 space-y-10" aria-label="Texto integral do programa de governo">
        {visibleSections.map((section, sectionIndex) => {
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

      {remainingSections > 0 && (
        <div className="mt-8 rounded-[12px] border border-border bg-card p-5 text-center" data-pf-programa-progressive-reader="">
          <p className="text-sm font-semibold text-foreground">
            {visibleSections.length} de {secoes.length} capítulos exibidos
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            A busca acima já considera o documento completo. Abra os próximos capítulos conforme precisar.
          </p>
          <button
            type="button"
            onClick={() => setVisibleSectionCount((current) => Math.min(secoes.length, current + SECTION_BATCH_SIZE))}
            className="mt-4 min-h-11 rounded-[8px] bg-foreground px-5 py-2 text-sm font-semibold text-background outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Carregar mais {Math.min(SECTION_BATCH_SIZE, remainingSections)} capítulos
          </button>
        </div>
      )}
    </div>
  )
}

export function ProgramaGovernoTab({
  manifesto,
  loadState,
  response,
  onRetry,
  selectedDocumentId,
  documentLoadState = "idle",
  loadedDocument,
  onSelectDocument,
  onRetryDocument,
}: {
  manifesto: ProgramaGovernoManifestoPublico
  loadState: ProgramaGovernoLoadState
  response: ProgramaGovernoApiResponse | null
  onRetry: () => void
  selectedDocumentId?: string | null
  documentLoadState?: ProgramaGovernoLoadState
  loadedDocument?: ProgramaGovernoDocumentoCarregado | null
  onSelectDocument?: (documentoId: string) => void
  onRetryDocument?: () => void
}) {
  const documents = manifesto.estado === "aprovado" ? (manifesto.documentos ?? []) : []
  const isMultiDocument = documents.length > 0
  const selectedDocument = documents.find((document) => document.documentoId === selectedDocumentId)
    ?? documents[0]

  if (isMultiDocument && selectedDocument) {
    const context = electionContext(manifesto.fonte)
    const selectedLoadedDocument = loadedDocument
      && loadedDocumentoMatches(loadedDocument, selectedDocument)
      ? loadedDocument
      : null
    return (
      <section data-pf-programa-tab="" data-pf-programa-multidocument="">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
              Documentos oficiais do TSE{context ? ` · ${context}` : ""}
            </p>
            <h2 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">Programa de governo</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {documents.length} documento{documents.length === 1 ? " oficial" : "s oficiais"}. Cada arquivo é carregado somente após a seleção.
            </p>
          </div>
          <SourceLink fonte={selectedDocument.fonte} />
        </div>

        <div className="rounded-[12px] border border-border bg-card p-4 sm:p-5">
          <label htmlFor="programa-document-select" className="text-sm font-semibold text-foreground">
            Documento oficial
          </label>
          <select
            id="programa-document-select"
            value={selectedDocument.documentoId}
            onChange={(event) => onSelectDocument?.(event.target.value)}
            className="mt-2 min-h-11 w-full rounded-[8px] border border-border bg-background px-3 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {documents.map((document, index) => (
              <option key={document.documentoId} value={document.documentoId}>
                Documento {index + 1}: {document.fonte.arquivoNome} ({document.paginas} páginas)
              </option>
            ))}
          </select>
          <p className="mt-3 break-all text-sm font-semibold text-foreground" data-pf-programa-document-file="">
            {selectedDocument.fonte.arquivoNome}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {selectedDocument.paginas} páginas, {selectedDocument.secoes} seções.
          </p>
        </div>

        <div className="mt-8" data-pf-programa-document-state={documentLoadState}>
          {documentLoadState === "idle" || documentLoadState === "loading" ? (
            <div role="status" aria-busy="true" className="motion-safe:animate-pulse rounded-[12px] border border-border bg-muted/25 p-6 text-sm text-muted-foreground">
              Carregando o documento selecionado...
            </div>
          ) : documentLoadState === "failed" ? (
            <div role="alert" className="rounded-[12px] border border-border bg-card p-6">
              <h3 className="text-lg font-semibold text-foreground">Não foi possível carregar este documento</h3>
              <p className="mt-2 text-sm text-muted-foreground">Os outros documentos não foram carregados nem alterados.</p>
              <button type="button" onClick={onRetryDocument} className="mt-4 min-h-11 rounded-[8px] bg-foreground px-4 py-2 text-sm font-semibold text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                Tentar este documento novamente
              </button>
            </div>
          ) : selectedLoadedDocument ? (
            <ProgramaDocument
              key={selectedLoadedDocument.documentoId}
              secoes={selectedLoadedDocument.secoes}
            />
          ) : (
            <div role="alert" className="rounded-[12px] border border-border bg-card p-6 text-sm text-muted-foreground">
              O documento carregado não corresponde à seleção atual.
            </div>
          )}
        </div>
      </section>
    )
  }

  if (loadState === "idle" || loadState === "loading") {
    return <div role="status" aria-busy="true" className="motion-safe:animate-pulse rounded-[12px] border border-border bg-muted/25 p-6 text-sm text-muted-foreground">Carregando programa de governo...</div>
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
  const context = electionContext(response.data.fonte)
  return (
    <section data-pf-programa-tab="">
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Documento oficial do TSE{context ? ` · ${context}` : ""}
          </p>
          <h2 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">Programa de governo</h2>
          <p className="mt-2 text-sm text-muted-foreground">{response.data.paginas} páginas, texto integral extraído e revisado.</p>
          {context && (
            <p className="mt-1 break-all text-xs text-muted-foreground">
              Arquivo oficial: {response.data.fonte.arquivoNome}
            </p>
          )}
        </div>
        <SourceLink fonte={response.data.fonte} />
      </div>
      <ProgramaDocument secoes={response.data.secoes} />
    </section>
  )
}

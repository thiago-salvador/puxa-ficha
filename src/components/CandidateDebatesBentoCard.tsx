"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, ExternalLink, Pause, Play } from "lucide-react"

import debatePressQuotes from "../../scripts/data/debates-presidencia-band-2026-imprensa.json"

export const DEBATE_PRESS_QUOTE_ROTATION_MS = 10_000

type DebatePressQuote = (typeof debatePressQuotes.candidates)[number]["quotes"][number]
type DebatePressCandidate = (typeof debatePressQuotes.candidates)[number]

function formatDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value
}

function findCandidateQuotes(candidateSlug: string, candidateId: string): DebatePressCandidate | null {
  return (
    debatePressQuotes.candidates.find(
      (candidate) =>
        candidate.candidate_id === candidateId && candidate.candidate_slug === candidateSlug,
    ) ?? null
  )
}

export function hasCandidateDebatePressQuotes(candidateSlug: string, candidateId: string): boolean {
  return (findCandidateQuotes(candidateSlug, candidateId)?.quotes.length ?? 0) > 0
}

function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setReducedMotion(query.matches)
    update()
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])

  return reducedMotion
}

function QuoteSource({ quote }: { quote: DebatePressQuote }) {
  return (
    <div
      data-pf-debate-source-quote={quote.id}
      className="mt-auto flex flex-wrap items-end justify-between gap-3 border-t border-border/60 pt-3"
    >
      <p className="max-w-[24rem] text-[10px] font-medium leading-relaxed text-muted-foreground sm:text-[11px]">
        Aspa atribuída pela matéria da {debatePressQuotes.source.publisher}. Sem análise do Puxa Ficha.
      </p>
      <a
        href={debatePressQuotes.source.article_url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-10 items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Ler matéria <ExternalLink className="size-3.5" aria-hidden="true" />
      </a>
    </div>
  )
}

export function CandidateDebatesBentoCard({
  candidateSlug,
  candidateId,
  rotationIntervalMs = DEBATE_PRESS_QUOTE_ROTATION_MS,
}: {
  candidateSlug: string
  candidateId: string
  rotationIntervalMs?: number
}) {
  const candidate = useMemo(
    () => findCandidateQuotes(candidateSlug, candidateId),
    [candidateId, candidateSlug],
  )
  const quotes = candidate?.quotes ?? []
  const [index, setIndex] = useState(0)
  const [manuallyPaused, setManuallyPaused] = useState(false)
  const [interactionPaused, setInteractionPaused] = useState(false)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    if (
      quotes.length < 2 ||
      reducedMotion ||
      manuallyPaused ||
      interactionPaused ||
      rotationIntervalMs <= 0
    ) {
      return
    }

    const interval = window.setInterval(
      () => setIndex((current) => (current + 1) % quotes.length),
      rotationIntervalMs,
    )
    return () => window.clearInterval(interval)
  }, [interactionPaused, manuallyPaused, quotes.length, reducedMotion, rotationIntervalMs])

  if (!candidate || quotes.length === 0) return null

  const quote = quotes[index] ?? quotes[0]
  const previous = () => setIndex((current) => (current - 1 + quotes.length) % quotes.length)
  const next = () => setIndex((current) => (current + 1) % quotes.length)

  return (
    <article
      data-pf-debates-card=""
      data-pf-debate-quote-id={quote.id}
      onMouseEnter={() => setInteractionPaused(true)}
      onMouseLeave={() => setInteractionPaused(false)}
      onFocusCapture={() => setInteractionPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setInteractionPaused(false)
      }}
      className="flex min-h-[248px] min-w-0 flex-col rounded-[12px] border border-border/50 bg-card px-5 py-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="text-[13px] font-semibold text-foreground">Debates</h2>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
              {quote.topic}
            </span>
          </div>
          <p className="mt-1 text-[10px] font-semibold text-muted-foreground sm:text-[11px]">
            Band · {formatDate(debatePressQuotes.event.occurred_at)}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1" aria-label="Controles das citações">
          <button
            type="button"
            onClick={previous}
            className="inline-flex size-10 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Citação anterior"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setManuallyPaused((value) => !value)}
            className="inline-flex size-10 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={manuallyPaused ? "Retomar rotação das citações" : "Pausar rotação das citações"}
          >
            {manuallyPaused ? (
              <Play className="size-3.5" aria-hidden="true" />
            ) : (
              <Pause className="size-3.5" aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            onClick={next}
            className="inline-flex size-10 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Próxima citação"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div key={quote.id} className="py-4" aria-live="off">
        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          {index + 1} de {quotes.length} · citação literal
        </p>
        <blockquote className="mt-2 text-balance font-heading text-[20px] leading-[1.18] tracking-[-0.01em] text-foreground sm:text-[22px]">
          “{quote.quote_text}”
        </blockquote>
      </div>

      <QuoteSource quote={quote} />
    </article>
  )
}

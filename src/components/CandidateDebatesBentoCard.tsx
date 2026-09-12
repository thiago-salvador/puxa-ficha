"use client"

// cspell:ignore Transcricao

import { useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, ExternalLink, Pause, Play } from "lucide-react"

import debatePressQuotes from "../../scripts/data/debates-presidencia-band-2026-imprensa.json"
import monitoredQuotes from "../../scripts/data/falas-candidatos.json"
import { falasDoCandidato, type CatalogoFalas, type TranscricaoFala } from "../lib/falas-candidatos"

export const DEBATE_PRESS_QUOTE_ROTATION_MS = 10_000

type DebatePressQuote = {
  id: string; quote_text: string; topic: string; publisher: string
  article_url: string; occurred_on: string | null; article_title?: string
  occurred_between?: { from: string; to: string }
  source_location?: "headline"
  source_credit?: string
  event_context?: string
  transcription?: TranscricaoFala
}

function formatDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value
}

function findCandidateQuotes(candidateSlug: string, candidateId: string): { quotes: DebatePressQuote[] } | null {
  const recent = falasDoCandidato(monitoredQuotes as CatalogoFalas, candidateSlug, candidateId).map((quote) => ({
    ...quote, source_location: quote.review_evidence?.quote_location, source_credit: quote.review_evidence?.source_credit,
    topic: { debate: "Debate", entrevista: "Entrevista", sabatina: "Sabatina", declaracao: "Declaração em campanha" }[quote.event_type],
  }))
  const legacy = debatePressQuotes.candidates.find(
      (candidate) =>
        candidate.candidate_id === candidateId && candidate.candidate_slug === candidateSlug,
    )?.quotes.map((quote) => ({ ...quote, publisher: debatePressQuotes.source.publisher,
      article_url: debatePressQuotes.source.article_url, occurred_on: debatePressQuotes.event.occurred_at })) ?? []
  const quotes = [...recent, ...legacy]
  return quotes.length ? { quotes } : null
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
  const transcript = quote.transcription
  const minute = transcript ? `${Math.floor(transcript.start_seconds / 60)}:${String(Math.floor(transcript.start_seconds % 60)).padStart(2, "0")}` : null
  const mediaUrl = transcript ? new URL(transcript.media_url) : null
  if (mediaUrl && transcript) {
    if (mediaUrl.hostname === "www.youtube.com") mediaUrl.searchParams.set("t", `${Math.floor(transcript.start_seconds)}s`)
    else mediaUrl.hash = `t=${Math.floor(transcript.start_seconds)}`
  }
  return (
    <div
      data-pf-debate-source-quote={quote.id}
      className="mt-auto flex flex-wrap items-end justify-between gap-3 border-t border-border/60 pt-3"
    >
      <p className="max-w-[24rem] text-[length:var(--text-eyebrow)] font-medium leading-relaxed text-muted-foreground">
        {transcript ? `Transcrição automática do áudio de ${quote.publisher}. Pode conter erros; confira o trecho em ${minute}.` : <>{quote.source_location === "headline" ? "Aspa atribuída no título da matéria de " : "Aspa atribuída pela matéria de "}{quote.publisher}. Sem análise do Puxa Ficha.</>}
        {quote.source_credit && <span className="mt-1 block">Crédito da matéria: {quote.source_credit}.</span>}
      </p>
      <a
        href={mediaUrl?.toString() ?? quote.article_url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-10 items-center gap-1.5 text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.06em] text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {transcript ? `Conferir em ${minute}` : "Ler matéria"} <ExternalLink className="size-3.5" aria-hidden="true" />
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
            <h2 className="text-[length:var(--text-body-sm)] font-semibold text-foreground">Falas</h2>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-muted-foreground">
              {quote.topic}
            </span>
          </div>
          <p className="mt-1 text-[length:var(--text-eyebrow)] font-semibold text-muted-foreground">
            {quote.publisher} · {quote.occurred_on ? formatDate(quote.occurred_on) : quote.occurred_between!.from === quote.occurred_between!.to ? formatDate(quote.occurred_between!.from) : `Entre ${formatDate(quote.occurred_between!.from)} e ${formatDate(quote.occurred_between!.to)} (dia exato não informado)`}
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
        {(quote.transcription ? quote.event_context : quote.article_title) && <p className="mb-2 text-[length:var(--text-eyebrow)] text-muted-foreground">{quote.transcription ? quote.event_context : quote.article_title}</p>}
        <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          {index + 1} de {quotes.length} · {quote.transcription ? "trecho transcrito" : "citação literal"}
        </p>
        <blockquote className="mt-2 text-balance font-heading text-[20px] leading-[1.18] tracking-[-0.01em] text-foreground sm:text-[length:var(--text-heading-sm)]">
          “{quote.quote_text}”
        </blockquote>
      </div>

      <QuoteSource quote={quote} />
    </article>
  )
}

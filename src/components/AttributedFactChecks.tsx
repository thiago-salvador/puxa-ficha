"use client"

// cspell:words timecode atribuidas

import { ExternalLink } from "lucide-react"

import {
  getApprovedAttributedFactChecks,
  type AttributedCheckSource,
  type AttributedFactCheck,
} from "@/lib/checagens-atribuidas"

function formatDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value
}

function SourceList({ label, sources }: { label: string; sources: AttributedCheckSource[] }) {
  if (sources.length === 0) return null
  return (
    <div>
      <h3 className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </h3>
      <ul className="mt-1 space-y-1">
        {sources.map((source) => (
          <li key={source.url ?? source.title}>
            {source.url ? <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex max-w-full items-center gap-1 text-[length:var(--text-caption)] font-semibold text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="min-w-0 break-all">{source.title ?? source.url}</span>
              <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
            </a> : (
              <span className="text-[length:var(--text-caption)] text-foreground">
                {source.title} <span className="text-muted-foreground">(sem link individual na checagem)</span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function AttributedFactCheckCard({ check }: { check: AttributedFactCheck }) {
  const citedSources = check.sources.filter((source) => source.origin === "cited_by_publisher")
  const consultedSources = check.sources.filter((source) => source.origin === "consulted_by_us")

  return (
    <article
      id={`checagem-${check.id}`}
      data-pf-attributed-check-id={check.id}
      className="rounded-[16px] border border-border/60 bg-card px-5 py-5 sm:px-6"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-[length:var(--text-body-sm)] font-bold text-foreground">{check.publisher}</p>
        <span className="text-[length:var(--text-caption)] font-medium text-muted-foreground">
          Publicada em {formatDate(check.publishedAt)}
        </span>
      </div>

      <p className="mt-3 text-[length:var(--text-body-sm)] font-semibold leading-relaxed text-foreground">
        {check.publisher} classificou: <span data-pf-attributed-original-label>{check.originalLabel}</span>.
      </p>
      {check.claimFormat === "literal" ? (
        <blockquote className="mt-3 border-l-2 border-border pl-4 font-heading text-[20px] leading-[1.2] tracking-[-0.01em] text-foreground">
          “{check.claim}”
        </blockquote>
      ) : (
        <p className="mt-3 border-l-2 border-border pl-4 text-[length:var(--text-body-sm)] font-semibold leading-relaxed text-foreground">
          Afirmação resumida: {check.claim}
        </p>
      )}
      {check.quoteText && check.quoteText !== check.claim && (
        <p className="mt-3 text-[length:var(--text-caption)] font-medium leading-relaxed text-muted-foreground">
          Fala registrada: “{check.quoteText}”
        </p>
      )}
      <p className="mt-3 text-[length:var(--text-body-sm)] leading-relaxed text-foreground">{check.summary}</p>

      <dl className="mt-4 grid gap-2 border-t border-border/60 pt-4 text-[length:var(--text-caption)] sm:grid-cols-2">
        <div>
          <dt className="font-bold text-muted-foreground">Contexto da fala</dt>
          <dd className="mt-0.5 font-medium text-foreground">
            {check.event.context} · {formatDate(check.event.date)}
            {check.event.timecode ? ` · ${check.event.timecode}` : ""}
          </dd>
        </div>
        {check.event.question && (
          <div>
            <dt className="font-bold text-muted-foreground">Pergunta</dt>
            <dd className="mt-0.5 font-medium text-foreground">{check.event.question}</dd>
          </div>
        )}
      </dl>

      <p className="mt-4 text-[length:var(--text-caption)] font-medium leading-relaxed text-muted-foreground">
        A avaliação acima é do veículo citado. O Puxa Ficha não a apresenta como conclusão independente.
        Revisão: {check.review.reviewer} ({check.review.reviewerKind === "human" ? "humana" : "modelo principal"}), em {formatDate(check.review.reviewedAt)}.
      </p>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-border/60 pt-4">
        <a
          href={check.originalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-10 items-center gap-1.5 text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.06em] text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Ler checagem original <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
        <a
          href={check.methodologyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-10 items-center gap-1.5 text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.06em] text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Metodologia <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      </div>

      {(citedSources.length > 0 || consultedSources.length > 0) && (
        <div className="mt-4 grid gap-4 border-t border-border/60 pt-4 sm:grid-cols-2">
          <SourceList label="Fontes citadas pelo veículo" sources={citedSources} />
          <SourceList label="Fontes consultadas pelo Puxa Ficha" sources={consultedSources} />
        </div>
      )}

      {check.corrections.length > 0 && (
        <div className="mt-4 rounded-[10px] border border-amber-300/70 bg-amber-50 px-3 py-2 text-[length:var(--text-caption)] leading-relaxed text-amber-950">
          <strong>Correção ou versão:</strong>{" "}
          {check.corrections.map((correction, index) => (
            <span key={`${correction.version}-${correction.publishedAt}`}>
              {index > 0 ? " " : ""}{correction.version}, {formatDate(correction.publishedAt)}: {correction.summary}{" "}
              <a href={correction.url} target="_blank" rel="noopener noreferrer" className="font-bold underline underline-offset-2">
                Ver registro
              </a>
            </span>
          ))}
        </div>
      )}

      {check.relatedChecks && check.relatedChecks.length > 0 && (
        <div className="mt-4 border-t border-border/60 pt-4">
          <h3 className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Avaliações relacionadas
          </h3>
          <ul className="mt-2 space-y-2 text-[length:var(--text-caption)]">
            {check.relatedChecks.map((relation) => (
              <li key={`${relation.relationship}-${relation.checkId}`}>
                <a
                  href={`#checagem-${relation.checkId}`}
                  className="font-bold text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {relation.relationship === "same_occurrence" ? "Outra avaliação desta fala" : "A mesma afirmação em outra ocasião"}
                </a>
                <span className="ml-2 text-muted-foreground">{relation.rationale}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  )
}

export function AttributedFactChecks({
  candidateId,
  candidateSlug,
  office,
  uf,
}: {
  candidateId: string
  candidateSlug: string
  office: string
  uf: string | null
}) {
  const checks = getApprovedAttributedFactChecks({
    candidate_id: candidateId,
    candidate_slug: candidateSlug,
    office,
    uf,
  })
  if (checks.length === 0) return null

  return (
    <section
      aria-labelledby="attributed-fact-checks-title"
      className="space-y-4"
      data-pf-attributed-checks=""
    >
      <div>
        <h2 id="attributed-fact-checks-title" className="font-heading text-[20px] uppercase tracking-tight text-foreground sm:text-[24px]">
          Checagens atribuídas
        </h2>
        <p className="mt-1 max-w-3xl text-[length:var(--text-body-sm)] leading-relaxed text-muted-foreground">
          Avaliações publicadas por veículos de checagem e associadas a esta afirmação após conferência editorial.
        </p>
      </div>
      <div className="space-y-4">
        {checks.map((check) => <AttributedFactCheckCard key={check.id} check={check} />)}
      </div>
    </section>
  )
}

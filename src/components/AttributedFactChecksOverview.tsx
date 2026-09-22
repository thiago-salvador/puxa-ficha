"use client"

// cspell:words atribuidas

import { ChevronRight } from "lucide-react"

import type { AttributedFactCheck } from "@/lib/checagens-atribuidas"

function formatDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value
}

/** Card da Visão geral: contagem e a checagem mais recente. A lista completa fica na aba Checagens. */
export function AttributedFactChecksOverview({
  checks,
  onOpenTab,
}: {
  checks: AttributedFactCheck[]
  onOpenTab: () => void
}) {
  const latest = [...checks].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id))[0]
  if (!latest) return null
  const publishers = new Set(checks.map((check) => check.publisher)).size

  return (
    <section
      data-pf-attributed-checks-overview=""
      data-pf-overview-grid-card=""
      aria-labelledby="attributed-checks-overview-title"
      className="min-w-0 rounded-[12px] border border-border/50 bg-card px-5 py-4"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="attributed-checks-overview-title" className="text-[length:var(--text-body-sm)] font-semibold text-foreground">
          Checagens atribuídas
        </h2>
        <button
          type="button"
          onClick={onOpenTab}
          aria-label="Ver todas na aba Checagens"
          className="inline-flex min-h-6 items-center gap-0.5 text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.06em] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2"
        >
          Checagens <ChevronRight className="size-3" aria-hidden="true" />
        </button>
      </div>

      <p className="font-heading text-[length:var(--text-heading-lg)] leading-none tabular-nums text-foreground">
        {checks.length}
      </p>
      <p className="mt-1.5 text-[length:var(--text-caption)] font-semibold text-muted-foreground">
        {checks.length === 1 ? "avaliação" : "avaliações"} de {publishers} {publishers === 1 ? "veículo" : "veículos"} de checagem
      </p>

      <article data-pf-attributed-checks-overview-latest={latest.id} className="mt-4 min-w-0 border-t border-border/60 pt-3">
        <p className="truncate text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          Mais recente · {latest.publisher} · {formatDate(latest.publishedAt)}
        </p>
        <p className="mt-1.5 text-[length:var(--text-caption)] font-bold text-foreground">{latest.originalLabel}</p>
        <p className="mt-1 line-clamp-3 text-[length:var(--text-caption)] leading-snug text-foreground">
          {latest.claimFormat === "literal" ? `“${latest.claim}”` : latest.claim}
        </p>
      </article>

      <p className="mt-3 text-[length:var(--text-eyebrow)] leading-snug text-muted-foreground">
        A avaliação é do veículo citado, não do Puxa Ficha.
      </p>
    </section>
  )
}

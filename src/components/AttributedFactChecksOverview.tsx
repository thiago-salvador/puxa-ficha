"use client"

// cspell:words atribuidas

import { ChevronRight } from "lucide-react"

import type { AttributedFactCheck } from "@/lib/checagens-atribuidas"
import { OverviewCountBadge } from "./OverviewCountBadge"
import { VeredictoPill } from "./VeredictoPill"

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
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="attributed-checks-overview-title"
            className="flex items-center gap-2 text-[length:var(--text-body-sm)] font-semibold text-foreground"
          >
            Checagens atribuídas
            <OverviewCountBadge value={checks.length} />
          </h2>
          <p className="mt-0.5 text-[length:var(--text-caption)] font-medium text-muted-foreground">
            Avaliações de {publishers} {publishers === 1 ? "veículo" : "veículos"} de checagem
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenTab}
          className="inline-flex min-h-11 shrink-0 items-center gap-0.5 rounded-[8px] px-2 text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.06em] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Ver todas as checagens <ChevronRight className="size-3" aria-hidden="true" />
        </button>
      </div>

      <article data-pf-attributed-checks-overview-latest={latest.id} className="min-w-0 border-t border-border/60 pt-3">
        <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          Mais recente · {latest.publisher} · {formatDate(latest.publishedAt)}
        </p>
        <p className="mt-1.5 text-[19px] font-extrabold leading-snug tracking-[-0.01em] text-foreground">
          {latest.claim}
        </p>
        <VeredictoPill label={latest.originalLabel} className="mt-2" />
      </article>

      <p className="mt-3 text-[length:var(--text-eyebrow)] leading-snug text-muted-foreground">
        A avaliação é do veículo citado, não do Puxa Ficha.
      </p>
    </section>
  )
}

import Link from "next/link"
import {
  formatRankingMetricValue,
  type RankingDataset,
} from "@/lib/rankings"

interface RankingCardProps {
  dataset: RankingDataset
}

export function RankingCard({ dataset }: RankingCardProps) {
  const href = `/rankings/${dataset.definition.slug}`
  const preview = dataset.entries.slice(0, 3)

  return (
    <article className="rounded-[24px] border border-border/60 bg-card p-5 sm:p-6">
      <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {dataset.definition.eyebrow}
      </p>
      <h2 className="mt-2 font-heading text-[length:var(--text-heading-sm)] uppercase leading-[0.95] text-foreground">
        <Link href={href} className="hover:underline">
          {dataset.definition.title}
        </Link>
      </h2>
      <p className="mt-3 text-[length:var(--text-body)] font-medium leading-relaxed text-muted-foreground">
        {dataset.definition.contextExplanation}
      </p>
      <div className="mt-5 space-y-3">
        {preview.length > 0 ? (
          preview.map((entry, index) => (
            <div
              key={entry.candidato.slug}
              className="flex items-center justify-between gap-4 rounded-[16px] bg-muted/35 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-[length:var(--text-caption)] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                  #{index + 1}
                </p>
                <p className="truncate font-heading text-[length:var(--text-body-lg)] uppercase text-foreground">
                  {entry.candidato.nome_urna}
                </p>
              </div>
              <p className="shrink-0 text-[length:var(--text-body-sm)] font-bold tabular-nums text-foreground">
                {formatRankingMetricValue(entry.metricValue, dataset.definition.metricUnit)}
              </p>
            </div>
          ))
        ) : (
          <div className="rounded-[16px] bg-muted/35 px-4 py-3">
            <p className="text-[length:var(--text-body-sm)] font-medium text-muted-foreground">
              Sem linhas publicas neste recorte.
            </p>
          </div>
        )}
      </div>
      <div className="mt-5">
        <Link
          href={href}
          className="inline-flex rounded-full border border-foreground px-4 py-2 text-[length:var(--text-caption)] font-bold uppercase tracking-[0.08em] text-foreground transition-colors hover:bg-foreground hover:text-background"
        >
          Abrir ranking
        </Link>
      </div>
    </article>
  )
}

import Link from "next/link"
import { CandidatePhoto } from "@/components/CandidatePhoto"
import {
  formatRankingMetricValue,
  type RankingDefinition,
  type RankingEntry,
} from "@/lib/rankings"

interface RankingTableProps {
  definition: RankingDefinition
  entries: RankingEntry[]
  emptyMessage?: string
}

export function RankingTable({
  definition,
  entries,
  emptyMessage = "Nenhum candidato com dados suficientes para este recorte.",
}: RankingTableProps) {
  if (entries.length === 0) {
    return (
      <div className="rounded-[20px] border border-dashed border-border/70 bg-muted/30 p-8 text-center">
        <p className="text-[length:var(--text-body)] font-medium text-foreground">{emptyMessage}</p>
      </div>
    )
  }

  const metricLabel = definition.metricLabel

  return (
    <div>
      <div className="space-y-3 md:hidden">
        {entries.map((entry, index) => (
          <article
            key={entry.candidato.slug}
            data-pf-ranking-row
            data-pf-ranking-slug={entry.candidato.slug}
            data-pf-ranking-position={index + 1}
            data-pf-ranking-value={entry.metricValue ?? ""}
            className="rounded-[20px] border border-border/50 bg-card p-4"
          >
            <div className="flex items-start gap-3">
              <span className="font-heading text-[26px] uppercase leading-none text-muted-foreground">
                {String(index + 1).padStart(2, "0")}
              </span>
              <CandidatePhoto
                src={entry.candidato.foto_url}
                alt={entry.candidato.nome_urna}
                name={entry.candidato.nome_urna}
                width={48}
                height={48}
                sizes="48px"
                className="size-12 shrink-0 rounded-full object-cover object-top"
                fallbackClassName="size-12 shrink-0 rounded-full"
                initialsClassName="text-sm"
              />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/candidato/${entry.candidato.slug}`}
                  className="font-heading text-[length:var(--text-body-lg)] uppercase leading-tight text-foreground hover:underline"
                >
                  {entry.candidato.nome_urna}
                </Link>
                <p className="mt-1 text-[length:var(--text-caption)] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {entry.candidato.partido_sigla}
                  {entry.candidato.estado ? ` · ${entry.candidato.estado}` : ""}
                </p>
                <p className="mt-1 text-[length:var(--text-caption)] font-medium text-muted-foreground">
                  {entry.candidato.cargo_disputado}
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-[16px] bg-muted/40 px-4 py-3">
              <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                {metricLabel}
              </p>
              <p className="mt-1 font-heading text-[28px] uppercase leading-none text-foreground">
                {formatRankingMetricValue(entry.metricValue, definition.metricUnit)}
              </p>
            </div>
          </article>
        ))}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border/60">
              <th className="pb-3 pr-4 text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-foreground">
                #
              </th>
              <th className="pb-3 pr-4 text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-foreground">
                Candidato
              </th>
              <th className="pb-3 pr-4 text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-foreground">
                Partido
              </th>
              <th className="pb-3 pr-4 text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-foreground">
                Cargo
              </th>
              <th className="pb-3 pr-4 text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-foreground">
                UF
              </th>
              <th className="pb-3 text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-foreground">
                {metricLabel}
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, index) => (
              <tr
                key={entry.candidato.slug}
                data-pf-ranking-row
                data-pf-ranking-slug={entry.candidato.slug}
                data-pf-ranking-position={index + 1}
                data-pf-ranking-value={entry.metricValue ?? ""}
                className="border-b border-border/30"
              >
                <td className="py-4 pr-4 font-heading text-[22px] uppercase leading-none text-muted-foreground">
                  {String(index + 1).padStart(2, "0")}
                </td>
                <td className="py-4 pr-4">
                  <div className="flex items-center gap-3">
                    <CandidatePhoto
                      src={entry.candidato.foto_url}
                      alt={entry.candidato.nome_urna}
                      name={entry.candidato.nome_urna}
                      width={44}
                      height={44}
                      sizes="44px"
                      className="size-11 shrink-0 rounded-full object-cover object-top"
                      fallbackClassName="size-11 shrink-0 rounded-full"
                      initialsClassName="text-sm"
                    />
                    <div>
                      <Link
                        href={`/candidato/${entry.candidato.slug}`}
                        className="font-heading text-[length:var(--text-body-lg)] uppercase leading-tight text-foreground hover:underline"
                      >
                        {entry.candidato.nome_urna}
                      </Link>
                    </div>
                  </div>
                </td>
                <td className="py-4 pr-4 text-[length:var(--text-body-sm)] font-bold text-foreground">
                  {entry.candidato.partido_sigla}
                </td>
                <td className="py-4 pr-4 text-[length:var(--text-body-sm)] font-medium text-foreground">
                  {entry.candidato.cargo_disputado}
                </td>
                <td className="py-4 pr-4 text-[length:var(--text-body-sm)] font-medium text-foreground">
                  {entry.candidato.estado ?? "--"}
                </td>
                <td className="py-4 text-[length:var(--text-body-sm)] font-bold tabular-nums text-foreground">
                  {formatRankingMetricValue(entry.metricValue, definition.metricUnit)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

import type { VotoCandidato } from "@/lib/types"
import {
  fixedCopy,
  formatVoteBadgeLabel,
  formatVoteLegendLabel,
  formatVoteNote,
} from "@/lib/ui-labels"

const VOTE_COLORS: Record<VotoCandidato["voto"], { bg: string; label: string }> = {
  sim: { bg: "bg-foreground", label: formatVoteLegendLabel("sim") },
  "não": { bg: "bg-foreground/30", label: formatVoteLegendLabel("não") },
  "abstenção": { bg: "bg-amber-400", label: formatVoteLegendLabel("abstenção") },
  ausente: { bg: "bg-gray-200", label: formatVoteLegendLabel("ausente") },
  "obstrução": { bg: "bg-red-400", label: formatVoteLegendLabel("obstrução") },
  artigo_17: { bg: "bg-sky-400", label: formatVoteLegendLabel("artigo_17") },
}

export function VotingDots({ votos }: { votos: VotoCandidato[] }) {
  const votosValidos = votos.filter((voto) => VOTE_COLORS[voto.voto] != null)
  if (votosValidos.length === 0) return null

  const counts: Record<string, number> = {}
  for (const v of votosValidos) {
    counts[v.voto] = (counts[v.voto] ?? 0) + 1
  }

  return (
    <div className="rounded-[12px] border border-border/50 px-4 py-3 sm:rounded-[16px] sm:px-5 sm:py-4">
      <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-muted-foreground">
        Padrão de voto ({votosValidos.length} votações)
      </p>
      {/* Dot grid */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {votosValidos.map((v) => {
          const style = VOTE_COLORS[v.voto]
          const nota = formatVoteNote(v.voto)
          return (
            <div
              key={v.id}
              className={`size-4 rounded-[3px] ${style.bg} ${v.contradicao ? "ring-2 ring-amber-400 ring-offset-1" : ""}`}
              title={`${v.votacao?.titulo ?? "Votação"}: ${formatVoteBadgeLabel(v.voto)}${nota ? `. ${nota}` : ""}${v.contradicao ? ` (${fixedCopy.contradictions.toLowerCase()})` : ""}`}
            />
          )
        })}
      </div>
      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {Object.entries(VOTE_COLORS)
          .filter(([key]) => counts[key])
          .map(([key, val]) => (
            <div key={key} className="flex items-center gap-1.5" title={formatVoteNote(key) || undefined}>
              <div className={`size-2.5 rounded-[2px] ${val.bg}`} />
              <span className="text-[length:var(--text-eyebrow)] font-semibold text-muted-foreground">
                {val.label} ({counts[key]})
              </span>
            </div>
          ))}
        {votosValidos.some((v) => v.contradicao) && (
          <div className="flex items-center gap-1.5">
            <div className="size-2.5 rounded-[2px] ring-2 ring-amber-400 ring-offset-1" />
            <span className="text-[length:var(--text-eyebrow)] font-semibold text-amber-700">
              {fixedCopy.contradictions} ({votosValidos.filter((v) => v.contradicao).length})
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

import type { VotoCandidato } from "@/lib/types"

const VOTE_COLORS: Record<string, { bg: string; label: string }> = {
  sim: { bg: "bg-foreground", label: "A favor" },
  "não": { bg: "bg-foreground/30", label: "Contra" },
  "abstenção": { bg: "bg-amber-400", label: "Abstencao" },
  ausente: { bg: "bg-gray-200", label: "Ausente" },
  "obstrução": { bg: "bg-red-400", label: "Obstrucao" },
}

export function VotingDots({ votos }: { votos: VotoCandidato[] }) {
  if (votos.length === 0) return null

  const counts: Record<string, number> = {}
  for (const v of votos) {
    counts[v.voto] = (counts[v.voto] ?? 0) + 1
  }

  return (
    <div className="rounded-[12px] border border-border/50 px-4 py-3 sm:rounded-[16px] sm:px-5 sm:py-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground sm:text-[length:var(--text-eyebrow)]">
        Padrao de voto ({votos.length} votacoes)
      </p>
      {/* Dot grid */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {votos.map((v) => {
          const style = VOTE_COLORS[v.voto] ?? VOTE_COLORS.ausente
          return (
            <div
              key={v.id}
              className={`size-4 rounded-[3px] ${style.bg} ${v.contradicao ? "ring-2 ring-amber-400 ring-offset-1" : ""}`}
              title={`${v.votacao?.titulo ?? "Votacao"}: ${v.voto}${v.contradicao ? " (CONTRADICAO)" : ""}`}
            />
          )
        })}
      </div>
      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {Object.entries(VOTE_COLORS)
          .filter(([key]) => counts[key])
          .map(([key, val]) => (
            <div key={key} className="flex items-center gap-1.5">
              <div className={`size-2.5 rounded-[2px] ${val.bg}`} />
              <span className="text-[10px] font-semibold text-muted-foreground">
                {val.label} ({counts[key]})
              </span>
            </div>
          ))}
        {votos.some((v) => v.contradicao) && (
          <div className="flex items-center gap-1.5">
            <div className="size-2.5 rounded-[2px] ring-2 ring-amber-400 ring-offset-1" />
            <span className="text-[10px] font-semibold text-amber-700">
              Contradicao ({votos.filter((v) => v.contradicao).length})
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

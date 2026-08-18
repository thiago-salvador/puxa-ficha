"use client"

import { ChevronRight } from "lucide-react"
import { enrichContradictions } from "@/lib/contradiction-utils"
import type { PontoAtencao, VotoCandidato } from "@/lib/types"
import { fixedCopy, formatTemaLabel, formatVoteBadgeLabel } from "@/lib/ui-labels"
import { formatDate } from "@/lib/utils"
import { MetaBadge } from "./MetaBadge"

export interface ContradictionsHighlightProps {
  votosContradicao: VotoCandidato[]
  pontosContradicao: PontoAtencao[]
  onNavigateTab: (tabId: string) => void
}

function voteBadgeClass(v: VotoCandidato["voto"]): string {
  if (v === "sim") return "bg-foreground text-background"
  if (v === "não") return "border border-foreground bg-transparent text-foreground"
  return "bg-secondary text-foreground"
}

export function ContradictionsHighlight({
  votosContradicao,
  pontosContradicao,
  onNavigateTab,
}: ContradictionsHighlightProps) {
  if (votosContradicao.length === 0) return null

  const { enriched } = enrichContradictions(votosContradicao, pontosContradicao)
  const total = enriched.length
  const shown = enriched.slice(0, 2)
  const rest = total - shown.length

  return (
    <div className="rounded-[12px] border border-border/50 border-l-[3px] border-l-amber-400 bg-card px-5 py-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-foreground">{fixedCopy.contradictions}</span>
          <MetaBadge tone="caution">{total} registros</MetaBadge>
        </div>
        <button
          type="button"
          onClick={() => onNavigateTab("votos")}
          className="inline-flex items-center gap-0.5 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground transition-colors hover:text-foreground"
        >
          Ver todas <ChevronRight className="size-3" />
        </button>
      </div>
      <div className="space-y-3">
        {shown.map(({ voto }) => {
          const vt = voto.votacao
          return (
            <div key={voto.id} className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold leading-snug text-foreground">
                  {vt?.titulo ?? "Votação"}
                </p>
                {voto.contradicao_descricao && (
                  <p className="mt-0.5 line-clamp-1 text-[12px] text-muted-foreground">
                    {voto.contradicao_descricao}
                  </p>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {vt?.tema && (
                    <MetaBadge tone="muted" className="py-0.5">
                      {formatTemaLabel(vt.tema)}
                    </MetaBadge>
                  )}
                  {(vt?.casa || vt?.data_votacao) && (
                    <span className="text-[10px] font-semibold text-muted-foreground">
                      {[vt?.casa, vt?.data_votacao ? formatDate(vt.data_votacao) : null].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </div>
              </div>
              <span className={`mt-0.5 shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${voteBadgeClass(voto.voto)}`}>
                {formatVoteBadgeLabel(voto.voto)}
              </span>
            </div>
          )
        })}
        {rest > 0 && (
          <button
            type="button"
            onClick={() => onNavigateTab("votos")}
            className="text-[11px] font-bold text-muted-foreground transition-colors hover:text-foreground"
          >
            +{rest} mais
          </button>
        )}
      </div>
    </div>
  )
}

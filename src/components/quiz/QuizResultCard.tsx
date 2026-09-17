"use client"

import { useState } from "react"
import Link from "next/link"
import { CandidatePhoto } from "@/components/CandidatePhoto"
import { formatPartyPublicLabel } from "@/lib/party-utils"
import type { QuizCandidatoData, QuizScoreResult } from "@/lib/quiz-types"
import { QuizDetailPanel } from "./QuizDetailPanel"
import { QuizWeightStrip } from "./QuizWeightStrip"

interface QuizResultCardProps {
  candidato: QuizCandidatoData
  score: QuizScoreResult
}

export function QuizResultCard({ candidato, score }: QuizResultCardProps) {
  const [open, setOpen] = useState(false)
  const hasDetalhe = Boolean(score.detalhe)
  const fichaHref = `/candidato/${candidato.slug}`
  const isEstimated = score.perguntas_comparadas === 0 || score.confiabilidade === "baixa"
  const voteSummary =
    score.votos_comparados === 0
      ? "Sem voto público comparável neste quiz"
      : `${score.concordancias_voto_count} coincidência(s) e ${score.divergencias_voto_count} divergência(s) em ${score.votos_comparados} votação(ões)`

  return (
    <article className={`flex gap-4 rounded-xl border bg-card p-4 ${isEstimated ? "border-dashed border-border/80" : "border-border"}`}>
      <Link
        href={fichaHref}
        aria-label={`Abrir ficha pública de ${candidato.nome_urna}`}
        className="shrink-0 rounded-lg outline-none ring-foreground/30 transition-opacity hover:opacity-85 focus-visible:ring-2"
      >
        <CandidatePhoto
          src={candidato.foto_url}
          alt=""
          name={candidato.nome_urna}
          width={64}
          height={64}
          className="h-16 w-16 rounded-lg object-cover"
        />
      </Link>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3>
              <Link
                href={fichaHref}
                className="font-semibold text-foreground underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
              >
                {candidato.nome_urna}
              </Link>
            </h3>
            <p className="text-sm text-muted-foreground">{formatPartyPublicLabel(candidato.partido_sigla)}</p>
          </div>
          <span
            className="rounded-full border border-border px-2 py-1 text-xs font-medium text-muted-foreground"
            aria-label={`Cobertura: ${score.perguntas_comparadas} perguntas comparáveis`}
          >
            {score.perguntas_comparadas === 0 ? "Sem evidência comparável" : `${score.perguntas_comparadas} ${score.perguntas_comparadas === 1 ? "pergunta comparável" : "perguntas comparáveis"}`}
          </span>
        </div>
        <QuizWeightStrip explanation={score.explanation} />
        <p className="text-xs text-muted-foreground">
          {voteSummary}. Referências nominais disponíveis: {score.votacoes_mapeadas_total}.
        </p>
        <p className="text-xs leading-relaxed text-muted-foreground">{score.explanation.resumo}</p>
        <p className="text-xs text-muted-foreground">
          Há evidência para {score.perguntas_comparadas} de {score.perguntas_respondidas} perguntas em que você indicou uma posição.
        </p>
        {score.posicoes_comparadas > 0 && (
          <p className="text-xs text-muted-foreground">
            Inclui posições documentadas em {score.posicoes_comparadas} pergunta(s).
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/comparar?c1=${encodeURIComponent(candidato.slug)}`}
            className="inline-block text-sm font-medium text-foreground underline-offset-4 hover:underline"
          >
            Comparar
          </Link>
          <Link
            href={fichaHref}
            className="inline-block text-sm font-medium text-foreground underline-offset-4 hover:underline"
          >
            Ver ficha pública
          </Link>
          {hasDetalhe ? (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {open ? "Ocultar detalhes" : "Ver detalhes"}
            </button>
          ) : null}
        </div>
        {open && score.detalhe ? (
          <QuizDetailPanel
            detalhe={score.detalhe}
            posicoes={candidato.posicoes_declaradas}
            plUrlExemploPorTema={candidato.pl_url_exemplo_por_tema}
            financiamentoContexto={candidato.financiamento_contexto}
          />
        ) : null}
      </div>
    </article>
  )
}

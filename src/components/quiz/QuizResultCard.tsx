"use client"

import { useState } from "react"
import Link from "next/link"
import { CandidatePhoto } from "@/components/CandidatePhoto"
import type { QuizCandidatoData, QuizScoreResult } from "@/lib/quiz-types"
import { AlignmentBar } from "./AlignmentBar"
import { QuizDetailPanel } from "./QuizDetailPanel"
import { QuizWeightStrip } from "./QuizWeightStrip"

interface QuizResultCardProps {
  candidato: QuizCandidatoData
  score: QuizScoreResult
}

function tagLabel(score: number): string {
  if (score >= 70) return "Alto alinhamento"
  if (score >= 40) return "Médio alinhamento"
  return "Baixo alinhamento"
}

function confiabilidadeLabel(c: QuizScoreResult["confiabilidade"], n: number): string {
  if (c === "alta") return `Baseado em ${n} votações mapeadas`
  if (c === "media") return `Dados parciais (${n} votação(ões))`
  return "Sem histórico de votações no Congresso para este quiz"
}

export function QuizResultCard({ candidato, score }: QuizResultCardProps) {
  const [open, setOpen] = useState(false)
  const hasDetalhe = Boolean(score.detalhe)

  return (
    <article className="flex gap-4 rounded-xl border border-border bg-card p-4">
      <CandidatePhoto
        src={candidato.foto_url}
        alt={candidato.nome_urna}
        name={candidato.nome_urna}
        width={64}
        height={64}
        className="h-16 w-16 shrink-0 rounded-lg object-cover"
      />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h3 className="font-semibold text-foreground">{candidato.nome_urna}</h3>
            <p className="text-sm text-muted-foreground">{candidato.partido_sigla}</p>
          </div>
          <span className="text-sm font-medium tabular-nums">{score.score_final}%</span>
        </div>
        <AlignmentBar value={score.score_final} />
        <QuizWeightStrip explanation={score.explanation} />
        <p className="text-xs text-muted-foreground">{tagLabel(score.score_final)}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">{score.explanation.resumo}</p>
        <p className="text-xs text-muted-foreground">{confiabilidadeLabel(score.confiabilidade, score.votos_comparados)}</p>
        {(score.score_posicoes != null || score.score_projetos != null || score.score_financiamento != null) && (
          <p className="text-xs text-muted-foreground">
            {score.score_posicoes != null ? (
              <span className="mr-2">Posições declaradas (curadoria): {Math.round(score.score_posicoes * 100)}%</span>
            ) : null}
            {score.score_projetos != null ? (
              <span className="mr-2">Projetos por tema: {Math.round(score.score_projetos * 100)}%</span>
            ) : null}
            {score.score_financiamento != null ? (
              <span>Financiamento (doadores por setor): {Math.round(score.score_financiamento * 100)}%</span>
            ) : null}
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
            href={`/candidato/${candidato.slug}`}
            className="inline-block text-sm font-medium text-foreground underline-offset-4 hover:underline"
          >
            Ver ficha completa
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

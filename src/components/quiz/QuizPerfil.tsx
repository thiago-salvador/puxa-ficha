"use client"

import { useCallback } from "react"
import { quizPerguntasOrdenadas, type RespostaLikert } from "@/data/quiz/perguntas"
import { classificarPerfilUsuario, deriveUserPoliticalAxes } from "@/lib/quiz-scoring"
import { Share2 } from "lucide-react"

const DISCLAIMER =
  "Rótulo simplificado para reflexão. Não é classificação científica nem define quem você é."

interface QuizPerfilProps {
  respostas: Map<string, { valor: RespostaLikert; importante: boolean }>
}

function MiniEixosPlot({ eco, soc }: { eco: number; soc: number }) {
  const pad = 16
  const w = 140
  const h = 140
  const plotW = w - pad * 2
  const plotH = h - pad * 2
  const x = pad + ((eco - 1) / 9) * plotW
  const y = pad + plotH - ((soc - 1) / 9) * plotH
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="shrink-0 text-muted-foreground"
      aria-hidden
    >
      <rect x={pad} y={pad} width={plotW} height={plotH} fill="none" stroke="currentColor" strokeWidth={1} rx={4} />
      <text x={pad} y={h - 4} className="fill-current text-[8px] font-medium">
        Eco
      </text>
      <text x={4} y={pad + 8} className="fill-current text-[8px] font-medium">
        Soc
      </text>
      <circle cx={x} cy={y} r={6} className="fill-foreground" />
    </svg>
  )
}

function buildClassificacaoFeedbackHref(): string {
  const raw = process.env.NEXT_PUBLIC_X_HANDLE?.trim() ?? ""
  const via = raw.replace(/^@/, "")
  const text = "Discordo da classificação do quiz Puxa Ficha. "
  if (via) {
    return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&via=${encodeURIComponent(via)}`
  }
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(`${text}(https://puxaficha.com.br)`)}`
}

export function QuizPerfil({ respostas }: QuizPerfilProps) {
  const perguntas = quizPerguntasOrdenadas()
  const { eco, soc } = deriveUserPoliticalAxes(respostas, perguntas)
  const arq = classificarPerfilUsuario(eco, soc)
  const feedbackXHref = buildClassificacaoFeedbackHref()

  const share = useCallback(async () => {
    const url = typeof window !== "undefined" ? window.location.href : ""
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Puxa Ficha — Quiz",
          text: `Meu perfil no quiz: ${arq.label}`,
          url,
        })
        return
      }
      await navigator.clipboard.writeText(url)
    } catch {
      /* user cancel or clipboard denied */
    }
  }, [arq.label])

  return (
    <section className="rounded-xl border border-border bg-card p-5" aria-labelledby="quiz-perfil-heading">
      <h2 id="quiz-perfil-heading" className="text-lg font-semibold text-foreground">
        Seu perfil politico
      </h2>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
        <MiniEixosPlot eco={eco} soc={soc} />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-xl font-bold tracking-tight text-foreground">{arq.label}</p>
          <p className="text-sm text-muted-foreground">{arq.descricao}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">{DISCLAIMER}</p>
          <p className="text-xs text-muted-foreground">
            <a
              href={feedbackXHref}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Discordo da classificação?
            </a>{" "}
            Conte no X o que faria sentido para você.
          </p>
          <button
            type="button"
            onClick={() => void share()}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            <Share2 className="h-4 w-4" aria-hidden />
            Compartilhar link
          </button>
        </div>
      </div>
    </section>
  )
}

"use client"

import { useEffect, useRef, useState } from "react"
import { gsap } from "gsap"
import type { QuizPergunta, RespostaLikert } from "@/data/quiz/perguntas"
import { cn } from "@/lib/utils"

const OPTIONS: { value: RespostaLikert; label: string }[] = [
  { value: "concordo_total", label: "Concordo totalmente" },
  { value: "concordo_parcial", label: "Concordo em parte" },
  { value: "neutro", label: "Neutro ou sem opinião" },
  { value: "discordo_parcial", label: "Discordo em parte" },
  { value: "discordo_total", label: "Discordo totalmente" },
]

interface QuizQuestionProps {
  pergunta: QuizPergunta
  onSubmit: (valor: RespostaLikert, importante: boolean) => void
  reducedMotion: boolean
}

export function QuizQuestion({ pergunta, onSubmit, reducedMotion }: QuizQuestionProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [likert, setLikert] = useState<RespostaLikert | null>(null)
  const [importante, setImportante] = useState(false)

  useEffect(() => {
    setLikert(null)
    setImportante(false)
  }, [pergunta.id])

  useEffect(() => {
    const el = rootRef.current
    if (!el || reducedMotion) return
    gsap.fromTo(el, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.35, ease: "power2.out" })
  }, [pergunta.id, reducedMotion])

  const headingId = `quiz-pergunta-${pergunta.id}`

  return (
    <div ref={rootRef} className="space-y-6">
      <h2 id={headingId} className="text-lg font-medium leading-snug text-foreground md:text-xl">
        {pergunta.texto}
      </h2>
      {pergunta.contexto ? (
        <details className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
          <summary className="cursor-pointer font-medium text-foreground">Entenda melhor</summary>
          <p className="mt-2 text-muted-foreground">{pergunta.contexto}</p>
        </details>
      ) : null}
      <ul
        className="flex flex-col gap-2"
        role="radiogroup"
        aria-labelledby={headingId}
        aria-required="true"
      >
        {OPTIONS.map((opt) => (
          <li key={opt.value}>
            <button
              type="button"
              role="radio"
              aria-checked={likert === opt.value}
              onClick={() => setLikert(opt.value)}
              className={cn(
                "flex min-h-11 w-full items-center rounded-lg border px-4 py-3 text-left text-sm transition-colors md:min-h-12",
                likert === opt.value
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card hover:border-foreground/40"
              )}
            >
              {opt.label}
            </button>
          </li>
        ))}
      </ul>
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/20 px-3 py-3 text-sm">
        <input
          type="checkbox"
          checked={importante}
          onChange={(e) => setImportante(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-border"
        />
        <span className="text-muted-foreground">
          <span className="font-medium text-foreground">Dar mais peso a este tema</span> no cálculo do alinhamento
          (votações, posições e projetos ligados a ele pesam o dobro).
        </span>
      </label>
      <button
        type="button"
        disabled={likert == null}
        aria-disabled={likert == null}
        onClick={() => {
          if (likert == null) return
          onSubmit(likert, importante)
        }}
        className={cn(
          "min-h-11 w-full rounded-lg py-3 text-sm font-semibold transition-colors md:min-h-12",
          likert == null
            ? "cursor-not-allowed bg-muted text-muted-foreground"
            : "bg-foreground text-background hover:opacity-90"
        )}
      >
        Continuar
      </button>
    </div>
  )
}

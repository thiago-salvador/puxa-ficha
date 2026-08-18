"use client"

import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from "react"
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
  initialAnswer?: { valor: RespostaLikert; importante: boolean }
  onSubmit: (valor: RespostaLikert, importante: boolean) => void
  onBack?: (valor: RespostaLikert | null, importante: boolean) => void
  reducedMotion: boolean
}

export function QuizQuestion({ pergunta, initialAnswer, onSubmit, onBack, reducedMotion }: QuizQuestionProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const groupRef = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [likert, setLikert] = useState<RespostaLikert | null>(initialAnswer?.valor ?? null)
  const [importante, setImportante] = useState(initialAnswer?.importante ?? false)
  const [focusIndex, setFocusIndex] = useState<number | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- A new quiz question must restore its persisted answer.
    setLikert(initialAnswer?.valor ?? null)
    setImportante(initialAnswer?.importante ?? false)
    setFocusIndex(null)
  }, [initialAnswer?.importante, initialAnswer?.valor, pergunta.id])

  useEffect(() => {
    const el = rootRef.current
    if (!el || reducedMotion || typeof el.animate !== "function") return
    // Entrada opacity+translateY via Web Animations API nativa. Evita carregar o
    // gsap inteiro (~28KB gzip) no bundle desta rota quente so por um fade.
    const animation = el.animate(
      [
        { opacity: 0, transform: "translateY(12px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 350, easing: "cubic-bezier(0.25, 0.46, 0.45, 0.94)", fill: "backwards" },
    )
    return () => animation.cancel()
  }, [pergunta.id, reducedMotion])

  const headingId = `quiz-pergunta-${pergunta.id}`

  const selectedIndex = OPTIONS.findIndex((opt) => opt.value === likert)
  // Tabulação móvel: só uma opção fica alcançável por Tab, então o grupo inteiro
  // é uma parada só. Enquanto o foco está dentro do grupo, a parada acompanha a
  // opção focada, para que Tab sempre saia do grupo em vez de andar de opção em
  // opção (o foco pode chegar em qualquer opção por clique, por script ou pelo
  // histórico do navegador, não só na que está marcada). Com o foco fora, a
  // parada volta para a opção marcada, ou para a primeira quando ainda não há
  // resposta, que é por onde o teclado deve entrar no grupo.
  const rovingIndex = focusIndex ?? (selectedIndex >= 0 ? selectedIndex : 0)

  // Navegação por setas no padrão WAI-ARIA para grupo de opções: as setas movem
  // foco e seleção juntos, e circulam do fim para o começo e vice-versa.
  function handleOptionKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      next = (index + 1) % OPTIONS.length
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      next = (index - 1 + OPTIONS.length) % OPTIONS.length
    } else {
      return
    }
    event.preventDefault()
    setLikert(OPTIONS[next].value)
    setFocusIndex(next)
    optionRefs.current[next]?.focus()
  }

  // O foco entrou nesta opção, então ela vira a parada de tabulação do grupo.
  function handleOptionFocus(index: number) {
    setFocusIndex(index)
  }

  // O foco saiu desta opção. Se foi para fora do grupo, a parada de tabulação
  // volta para a opção marcada. Se foi para outra opção, quem manda é o foco novo.
  function handleOptionBlur(event: FocusEvent<HTMLButtonElement>) {
    const destino = event.relatedTarget
    if (destino && groupRef.current?.contains(destino)) return
    setFocusIndex(null)
  }

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
      <div
        ref={groupRef}
        className="flex flex-col gap-2"
        role="radiogroup"
        aria-labelledby={headingId}
        aria-required="true"
      >
        {OPTIONS.map((opt, index) => (
          <button
            key={opt.value}
            ref={(node) => {
              optionRefs.current[index] = node
            }}
            type="button"
            role="radio"
            aria-checked={likert === opt.value}
            tabIndex={index === rovingIndex ? 0 : -1}
            onClick={() => setLikert(opt.value)}
            onKeyDown={(event) => handleOptionKeyDown(event, index)}
            onFocus={() => handleOptionFocus(index)}
            onBlur={handleOptionBlur}
            className={cn(
              "flex min-h-11 w-full items-center rounded-lg border px-4 py-3 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:min-h-12",
              likert === opt.value
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-card hover:border-foreground/40"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/20 px-3 py-3 text-sm">
        <input
          type="checkbox"
          checked={importante}
          onChange={(e) => setImportante(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        />
        <span className="text-muted-foreground">
          <span className="font-medium text-foreground">Dar mais peso a este tema</span> na comparação
          (votações, posições e projetos ligados a ele pesam o dobro).
        </span>
      </label>
      <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
        <button
          type="button"
          onClick={() => onBack?.(likert, importante)}
          disabled={!onBack}
          aria-disabled={!onBack}
          className={cn(
            "min-h-11 rounded-lg border border-border px-5 py-3 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:min-h-12",
            onBack
              ? "text-foreground hover:border-foreground/40"
              : "cursor-not-allowed text-muted-foreground"
          )}
        >
          Anterior
        </button>
        <button
          type="button"
          disabled={likert == null}
          aria-disabled={likert == null}
          onClick={() => {
            if (likert == null) return
            onSubmit(likert, importante)
          }}
          className={cn(
            "min-h-11 w-full rounded-lg py-3 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:min-h-12",
            likert == null
              ? "cursor-not-allowed bg-muted text-muted-foreground"
              : "bg-foreground text-background hover:opacity-90"
          )}
        >
          Continuar
        </button>
      </div>
    </div>
  )
}

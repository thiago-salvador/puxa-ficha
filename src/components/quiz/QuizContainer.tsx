"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { quizPerguntasOrdenadas } from "@/data/quiz/perguntas"
import { buildQuizResultQuery, type QuizRespostaCodificada } from "@/lib/quiz-encoding"
import { QuizGovernadorSemUf } from "./QuizGovernadorSemUf"
import { QuizProgress } from "./QuizProgress"
import { QuizQuestion } from "./QuizQuestion"

export function QuizContainer() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const cargo = searchParams.get("cargo") ?? "Presidente"
  const uf = searchParams.get("uf") ?? ""

  const perguntas = useMemo(() => quizPerguntasOrdenadas(), [])
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Map<string, QuizRespostaCodificada>>(new Map())
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const fn = () => setReducedMotion(mq.matches)
    fn()
    mq.addEventListener("change", fn)
    return () => mq.removeEventListener("change", fn)
  }, [])

  const current = perguntas[index] ?? null

  if (cargo === "Governador" && !uf.trim()) {
    return <QuizGovernadorSemUf />
  }

  const goNext = (valor: QuizRespostaCodificada["valor"], importante: boolean) => {
    if (!current) return
    const next = new Map(answers)
    next.set(current.id, { valor, importante })
    setAnswers(next)
    if (index + 1 >= perguntas.length) {
      const query = buildQuizResultQuery(next, {
        cargo: cargo !== "Presidente" ? cargo : undefined,
        uf: cargo === "Governador" && uf ? uf : undefined,
      })
      router.push(`/quiz/resultado?${query}`)
      return
    }
    setIndex((i) => i + 1)
  }

  if (!current) return null

  return (
    <div className="mx-auto max-w-lg space-y-8 px-4 py-8">
      <p className="text-center text-xs text-muted-foreground">
        {cargo === "Governador" && uf ? (
          <>
            Quiz para <span className="font-medium text-foreground">Governador — {uf}</span>
          </>
        ) : (
          <>
            Quiz para <span className="font-medium text-foreground">Presidente</span>
          </>
        )}
      </p>
      <QuizProgress current={index + 1} total={perguntas.length} />
      <QuizQuestion pergunta={current} onSubmit={goNext} reducedMotion={reducedMotion} />
      <p className="text-center text-sm">
        <a href="/quiz" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Voltar e trocar cargo ou estado
        </a>
      </p>
    </div>
  )
}

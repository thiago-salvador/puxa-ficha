"use client"

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { quizPerguntasOrdenadas } from "@/data/quiz/perguntas"
import { ANALYTICS_EVENTS } from "@/lib/analytics-events"
import { trackLaunchEvent } from "@/lib/analytics-client"
import { buildQuizResultQuery, type QuizRespostaCodificada } from "@/lib/quiz-encoding"
import { QuizGovernadorSemUf } from "./QuizGovernadorSemUf"
import { QuizProgress } from "./QuizProgress"
import { QuizQuestion } from "./QuizQuestion"

// Título de nível 1 da rota de perguntas. A tela não mostra um título visível,
// então ele entra oculto para que leitores de tela tenham a âncora do documento.
const QUIZ_PAGE_TITLE = "Quiz eleitoral: quem me representa?"

const QUIZ_SESSION_STORAGE_VERSION = 1
const QUIZ_PROGRESS_STORAGE_EVENT = "puxaficha:quiz-progress-storage"

interface StoredQuizProgress {
  version: number
  index: number
  answers: Array<[string, QuizRespostaCodificada]>
}

interface QuizProgressState {
  index: number
  answers: Map<string, QuizRespostaCodificada>
}

function clampQuestionIndex(index: number, total: number): number {
  if (total <= 0) return 0
  return Math.max(0, Math.min(total - 1, index))
}

function emptyQuizProgress(): QuizProgressState {
  return { index: 0, answers: new Map() }
}

function parseStoredQuizProgress(raw: string | null, total: number): QuizProgressState {
  try {
    if (!raw) return emptyQuizProgress()

    const parsed = JSON.parse(raw) as Partial<StoredQuizProgress>
    if (
      parsed.version !== QUIZ_SESSION_STORAGE_VERSION ||
      !Array.isArray(parsed.answers)
    ) {
      return emptyQuizProgress()
    }

    return {
      answers: new Map(parsed.answers),
      index: clampQuestionIndex(Number(parsed.index) || 0, total),
    }
  } catch {
    return emptyQuizProgress()
  }
}

function getStoredQuizProgressSnapshot(storageKey: string): string {
  if (typeof window === "undefined") return ""
  return window.sessionStorage.getItem(storageKey) ?? ""
}

function subscribeToQuizProgressStorage(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {}

  window.addEventListener("storage", callback)
  window.addEventListener(QUIZ_PROGRESS_STORAGE_EVENT, callback)

  return () => {
    window.removeEventListener("storage", callback)
    window.removeEventListener(QUIZ_PROGRESS_STORAGE_EVENT, callback)
  }
}

function writeStoredQuizProgress(storageKey: string, progress: QuizProgressState) {
  if (typeof window === "undefined") return

  const payload: StoredQuizProgress = {
    version: QUIZ_SESSION_STORAGE_VERSION,
    index: progress.index,
    answers: Array.from(progress.answers.entries()),
  }

  window.sessionStorage.setItem(storageKey, JSON.stringify(payload))
  window.dispatchEvent(new Event(QUIZ_PROGRESS_STORAGE_EVENT))
}

function clearStoredQuizProgress(storageKey: string) {
  if (typeof window === "undefined") return
  window.sessionStorage.removeItem(storageKey)
  window.dispatchEvent(new Event(QUIZ_PROGRESS_STORAGE_EVENT))
}

export function QuizContainer() {
  const searchParams = useSearchParams()
  const cargo = searchParams.get("cargo") ?? "Presidente"
  const uf = searchParams.get("uf") ?? ""

  const perguntas = useMemo(() => quizPerguntasOrdenadas(), [])
  const storageKey = useMemo(
    () => `puxaficha.quiz.progress.v${QUIZ_SESSION_STORAGE_VERSION}.${cargo}.${uf || "br"}`,
    [cargo, uf]
  )

  if (cargo === "Governador" && !uf.trim()) {
    return <QuizGovernadorSemUf />
  }

  return (
    <QuizActiveSession
      key={storageKey}
      cargo={cargo}
      uf={uf}
      perguntas={perguntas}
      storageKey={storageKey}
    />
  )
}

interface QuizActiveSessionProps {
  cargo: string
  uf: string
  perguntas: ReturnType<typeof quizPerguntasOrdenadas>
  storageKey: string
}

function QuizActiveSession({ cargo, uf, perguntas, storageKey }: QuizActiveSessionProps) {
  const router = useRouter()
  const progressSnapshot = useSyncExternalStore(
    subscribeToQuizProgressStorage,
    () => getStoredQuizProgressSnapshot(storageKey),
    () => "",
  )
  const progress = useMemo(
    () => parseStoredQuizProgress(progressSnapshot, perguntas.length),
    [perguntas.length, progressSnapshot],
  )
  const { answers, index } = progress
  const [reducedMotion, setReducedMotion] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const navigateTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (navigateTimeoutRef.current) window.clearTimeout(navigateTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const fn = () => setReducedMotion(mq.matches)
    fn()
    mq.addEventListener("change", fn)
    return () => mq.removeEventListener("change", fn)
  }, [])

  const current = perguntas[index] ?? null
  const currentAnswer = current ? answers.get(current.id) : undefined

  const goNext = (valor: QuizRespostaCodificada["valor"], importante: boolean) => {
    if (!current) return
    const next = new Map(answers)
    next.set(current.id, { valor, importante })
    if (index + 1 >= perguntas.length) {
      setFinishing(true)
      const query = buildQuizResultQuery(next, {
        cargo: cargo !== "Presidente" ? cargo : undefined,
        uf: cargo === "Governador" && uf ? uf : undefined,
      })
      const delayMs = reducedMotion ? 0 : 480
      trackLaunchEvent(ANALYTICS_EVENTS.quizComplete, {
        question_count: next.size,
        scope: cargo === "Governador" ? "governador" : "presidente",
      })
      clearStoredQuizProgress(storageKey)
      if (navigateTimeoutRef.current) window.clearTimeout(navigateTimeoutRef.current)
      navigateTimeoutRef.current = window.setTimeout(() => {
        navigateTimeoutRef.current = null
        router.push(`/quiz/resultado?${query}`)
      }, delayMs)
      return
    }
    writeStoredQuizProgress(storageKey, { answers: next, index: index + 1 })
  }

  const goBack = index > 0
    ? (valor: QuizRespostaCodificada["valor"] | null, importante: boolean) => {
        const next = new Map(answers)
        if (current && valor != null) {
          next.set(current.id, { valor, importante })
        }
        writeStoredQuizProgress(storageKey, { answers: next, index: Math.max(0, index - 1) })
      }
    : undefined

  if (!current) return null

  if (finishing) {
    return (
      <div className="mx-auto flex min-h-[40vh] max-w-lg flex-col items-center justify-center gap-3 px-4 py-16">
        {/* O título da rota é o mesmo em todos os estados do quiz, e fica oculto
            visualmente porque o desenho da tela já começa pela pergunta. */}
        <h1 className="sr-only">{QUIZ_PAGE_TITLE}</h1>
        <p className="text-center text-sm font-medium text-foreground" role="status" aria-live="polite">
          Processando resultado…
        </p>
        <p className="text-center text-xs text-muted-foreground">Montando a comparação com base nas suas respostas.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg space-y-8 px-4 py-8">
      <h1 className="sr-only">{QUIZ_PAGE_TITLE}</h1>
      <p className="text-center text-xs text-muted-foreground">
        {cargo === "Governador" && uf ? (
          <>
            Quiz para <span className="font-medium text-foreground">Governador, {uf}</span>
          </>
        ) : (
          <>
            Quiz para <span className="font-medium text-foreground">Presidente</span>
          </>
        )}
      </p>
      <QuizProgress current={index + 1} total={perguntas.length} />
      <QuizQuestion
        pergunta={current}
        initialAnswer={currentAnswer}
        onSubmit={goNext}
        onBack={goBack}
        reducedMotion={reducedMotion}
      />
      <p className="text-center text-sm">
        <a href="/quiz" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Voltar e trocar cargo ou estado
        </a>
      </p>
    </div>
  )
}

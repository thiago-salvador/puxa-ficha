"use client"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { decodeQuizPayloadForShare } from "@/lib/quiz-encoding"
import { compareCandidatesAlphabetically } from "@/lib/quiz-scoring"
import type { DataResource } from "@/lib/types"
import type { QuizAlignmentDataset } from "@/lib/quiz-types"
import { DataSourceNotice } from "@/components/DataSourceNotice"
import { QuizPerfil } from "./QuizPerfil"
import { QuizResultCard } from "./QuizResultCard"
import { QuizShareButtons } from "./QuizShareButtons"

interface QuizResultProps {
  datasetResource: DataResource<QuizAlignmentDataset>
}

export function QuizResult({ datasetResource }: QuizResultProps) {
  const dataset = datasetResource.data
  const searchParams = useSearchParams()
  const v = searchParams.get("v")
  const r = searchParams.get("r")
  const cargoQ = searchParams.get("cargo")
  const ufQ = searchParams.get("uf")

  const refazerHref = useMemo(() => {
    if (cargoQ && cargoQ !== "Presidente") {
      const p = new URLSearchParams()
      p.set("cargo", cargoQ)
      if (ufQ) p.set("uf", ufQ)
      return `/quiz/perguntas?${p.toString()}`
    }
    return "/quiz/perguntas"
  }, [cargoQ, ufQ])

  const respostas = useMemo(() => {
    if (!r) return null
    return decodeQuizPayloadForShare(r, v)
  }, [r, v])

  const results = useMemo(() => {
    if (!respostas) return []
    return compareCandidatesAlphabetically(respostas, dataset, undefined, 2)
  }, [respostas, dataset])

  const [shareUrl, setShareUrl] = useState("")
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Absolute share URL depends on browser location after hydration.
    setShareUrl(`${window.location.origin}${window.location.pathname}${window.location.search}`)
  }, [r, v, cargoQ, ufQ])

  const bySlug = useMemo(() => {
    const m = new Map<string, (typeof dataset.candidatos)[0]>()
    for (const c of dataset.candidatos) {
      m.set(c.slug, c)
    }
    return m
  }, [dataset])

  if (!r || !respostas || respostas.size === 0) {
    return (
      <div className="mx-auto max-w-lg space-y-4 px-4 py-16 text-center">
        {/* O estado vazio não tem título visível, então o nível 1 fica oculto
            para que a página continue tendo uma âncora de documento. */}
        <h1 className="sr-only">Resultado do quiz</h1>
        <p className="text-muted-foreground">Nenhum resultado no link. Faça o quiz para ver a comparação.</p>
        <Link href={refazerHref} className="font-medium text-foreground underline-offset-4 hover:underline">
          Ir para o quiz
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg space-y-8 px-4 py-8">
      <DataSourceNotice status={datasetResource.sourceStatus} message={datasetResource.sourceMessage ?? undefined} />
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Sua comparação</h1>
        <p className="text-sm text-muted-foreground">
          Não é recomendação de voto, pesquisa eleitoral nem ranking. A lista aparece em ordem alfabética e mostra sinais
          documentais comparáveis por candidato: votações públicas, posições declaradas curadas, autoria de projetos,
          financiamento classificado e espectro partidário com curadoria editorial.
        </p>
        <p className="text-xs text-muted-foreground">
          <Link
            href="/quiz/metodologia#feedback-espectro"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Classificação partidária parece errada?
          </Link>
        </p>
      </header>
      <QuizShareButtons shareUrl={shareUrl} />
      {respostas ? <QuizPerfil respostas={respostas} /> : null}
      <h2 className="text-lg font-semibold text-foreground">Candidatos em ordem alfabética</h2>
      <ul className="flex flex-col gap-4">
        {results.map((row) => {
          const c = bySlug.get(row.candidato_slug)
          if (!c) return null
          return (
            <li key={row.candidato_slug}>
              <QuizResultCard candidato={c} score={row} />
            </li>
          )
        })}
      </ul>
      <div className="flex flex-wrap gap-4 border-t border-border pt-6 text-sm">
        <Link href={refazerHref} className="font-medium text-foreground underline-offset-4 hover:underline">
          Refazer o quiz
        </Link>
        <Link href="/quiz" className="text-muted-foreground underline-offset-4 hover:underline">
          Voltar à introdução
        </Link>
        <Link href="/quiz/metodologia" className="text-muted-foreground underline-offset-4 hover:underline">
          Metodologia do quiz
        </Link>
      </div>
    </div>
  )
}

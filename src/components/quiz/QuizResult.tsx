"use client"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { decodeQuizPayloadForShare } from "@/lib/quiz-encoding"
import { rankearCandidatos } from "@/lib/quiz-scoring"
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

  const ranked = useMemo(() => {
    if (!respostas) return []
    return rankearCandidatos(respostas, dataset, undefined, 2)
  }, [respostas, dataset])

  const [shareUrl, setShareUrl] = useState("")
  useEffect(() => {
    setShareUrl(`${window.location.origin}${window.location.pathname}${window.location.search}`)
  }, [r, v, cargoQ, ufQ])

  const bySlug = useMemo(() => {
    const m = new Map<string, (typeof dataset.candidatos)[0]>()
    for (const c of dataset.candidatos) {
      m.set(c.slug, c)
    }
    return m
  }, [dataset])

  const [showAll, setShowAll] = useState(false)

  const compareTop2Href = useMemo(() => {
    if (ranked.length < 2) return null
    const a = ranked[0]?.candidato_slug
    const b = ranked[1]?.candidato_slug
    if (!a || !b) return null
    const p = new URLSearchParams()
    p.set("c1", a)
    p.set("c2", b)
    return `/comparar?${p.toString()}`
  }, [ranked])

  if (!r || !respostas || respostas.size === 0) {
    return (
      <div className="mx-auto max-w-lg space-y-4 px-4 py-16 text-center">
        <p className="text-muted-foreground">Nenhum resultado no link. Faça o quiz para ver o ranking.</p>
        <Link href={refazerHref} className="font-medium text-foreground underline-offset-4 hover:underline">
          Ir para o quiz
        </Link>
      </div>
    )
  }

  const visible = showAll ? ranked : ranked.slice(0, 3)

  return (
    <div className="mx-auto max-w-lg space-y-8 px-4 py-8">
      <DataSourceNotice status={datasetResource.sourceStatus} message={datasetResource.sourceMessage ?? undefined} />
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Seu alinhamento</h1>
        <p className="text-sm text-muted-foreground">
          Não é recomendação de voto. O cálculo mistura votações públicas, posições declaradas curadas (quando existem),
          autoria de projetos por tema e espectro partidário (revisão editorial pendente em parte do modelo).
        </p>
      </header>
      <QuizShareButtons shareUrl={shareUrl} />
      {compareTop2Href ? (
        <p className="text-sm">
          <Link
            href={compareTop2Href}
            className="font-semibold text-foreground underline-offset-4 hover:underline"
          >
            Comparar os 2 mais alinhados no comparador
          </Link>
        </p>
      ) : null}
      {respostas ? <QuizPerfil respostas={respostas} /> : null}
      <h2 className="text-lg font-semibold text-foreground">Candidatos mais alinhados</h2>
      <ol className="flex flex-col gap-4">
        {visible.map((row) => {
          const c = bySlug.get(row.candidato_slug)
          if (!c) return null
          return (
            <li key={row.candidato_slug}>
              <QuizResultCard candidato={c} score={row} />
            </li>
          )
        })}
      </ol>
      {ranked.length > 3 ? (
        <button
          type="button"
          onClick={() => setShowAll((s) => !s)}
          className="w-full rounded-lg border border-border py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          {showAll ? "Mostrar apenas top 3" : `Ver todos os ${ranked.length} candidatos`}
        </button>
      ) : null}
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

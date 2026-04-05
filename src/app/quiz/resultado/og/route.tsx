import type { NextRequest } from "next/server"
import { getQuizAlignmentDatasetResource } from "@/lib/api"
import { decodeQuizPayloadForShare } from "@/lib/quiz-encoding"
import { buildEditorialOg } from "@/lib/og"
import { rankearCandidatos } from "@/lib/quiz-scoring"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const OG_TITLE_MAX = 72

function truncateOgTitle(text: string): string {
  const t = text.trim()
  if (t.length <= OG_TITLE_MAX) return t
  return `${t.slice(0, OG_TITLE_MAX - 1)}…`
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl
  const r = url.searchParams.get("r")
  const v = url.searchParams.get("v")
  const cargo = url.searchParams.get("cargo")?.trim() || "Presidente"
  const uf = url.searchParams.get("uf")?.trim()

  if (cargo === "Governador" && !uf) {
    return buildEditorialOg({
      eyebrow: "Quiz",
      title: "Escolha o estado",
      subtitle: "Para governador, selecione a UF antes de ver o resultado.",
    })
  }

  const respostas = decodeQuizPayloadForShare(r, v)
  if (!respostas || respostas.size === 0) {
    return buildEditorialOg({
      eyebrow: "Quiz",
      title: "Quem me representa?",
      subtitle: "Faça o quiz no Puxa Ficha e veja o ranking.",
    })
  }

  const datasetResource = await getQuizAlignmentDatasetResource(
    cargo,
    cargo === "Governador" && uf ? uf : undefined
  )
  const dataset = datasetResource.data
  const ranked = rankearCandidatos(respostas, dataset, undefined, 2)
  const top = ranked[0]

  if (!top || dataset.candidatos.length === 0) {
    return buildEditorialOg({
      eyebrow: "Quiz",
      title: "Quem me representa?",
      subtitle: "Faça o quiz no Puxa Ficha e veja o ranking.",
    })
  }

  const candidato = dataset.candidatos.find((c) => c.slug === top.candidato_slug)
  const nome = candidato?.nome_urna ?? top.candidato_slug
  const meta =
    cargo === "Governador" && uf ? `${cargo} · ${uf.toUpperCase()}` : cargo

  return buildEditorialOg({
    eyebrow: "Quiz · Alinhamento",
    title: truncateOgTitle(nome),
    subtitle: `Maior proximidade no modelo: ${Math.round(top.score_final)}%. Não é recomendação de voto.`,
    meta,
  })
}

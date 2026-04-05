import type { Metadata } from "next"
import { getCandidatoMetadataResource, getCandidatos } from "@/lib/api"
import { buildTwitterMetadata, SITE_ORIGIN } from "@/lib/metadata"
import { CandidatoFichaView } from "../CandidatoFichaView"

export const revalidate = 3600
export const dynamicParams = false

export async function generateStaticParams() {
  const candidatos = await getCandidatos()
  return candidatos.map((c) => ({ slug: c.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const candidatoResource = await getCandidatoMetadataResource(slug)
  const c = candidatoResource.data
  if (!c) return {}

  const title = `Linha do tempo · ${c.nome_urna} (${c.partido_sigla}) — Puxa Ficha`
  const desc = `Cargos, partidos, patrimonio, processos, votacoes e gastos no mesmo eixo temporal: ${c.nome_urna}.`
  const path = `/candidato/${slug}/timeline`
  const url = `${SITE_ORIGIN}${path}`

  return {
    title,
    description: desc,
    alternates: {
      canonical: path,
    },
    openGraph: {
      title,
      description: desc,
      url,
      siteName: "Puxa Ficha",
      locale: "pt_BR",
      type: "website",
      images: [
        {
          url: `${path}/opengraph-image`,
          width: 1200,
          height: 630,
          alt: `Linha do tempo de ${c.nome_urna}`,
        },
      ],
    },
    twitter: buildTwitterMetadata({
      title,
      description: desc,
      image: `${path}/opengraph-image`,
    }),
  }
}

export default async function CandidatoTimelinePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return (
    <CandidatoFichaView slug={slug} profileInitialTab="timeline" seoSubpath="timeline" />
  )
}

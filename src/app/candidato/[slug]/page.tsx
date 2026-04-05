import type { Metadata } from "next"
import { getCandidatoMetadataResource, getCandidatos } from "@/lib/api"
import { buildTwitterMetadata } from "@/lib/metadata"
import { normalizeCandidatoProfileTab } from "@/lib/candidato-profile-tabs"
import { CandidatoFichaView } from "./CandidatoFichaView"

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
  const candidato = candidatoResource.data
  if (!candidato) return {}
  const desc = candidato.biografia
    ? candidato.biografia.slice(0, 155) + "..."
    : `Ficha completa de ${candidato.nome_urna} (${candidato.partido_sigla}): patrimonio, processos, votacoes, financiamento.`
  const title = `${candidato.nome_urna} (${candidato.partido_sigla}) — Puxa Ficha`

  return {
    title,
    description: desc,
    alternates: {
      canonical: `/candidato/${slug}`,
    },
    openGraph: {
      title,
      description: desc,
      url: `https://puxaficha.com.br/candidato/${slug}`,
      siteName: "Puxa Ficha",
      locale: "pt_BR",
      type: "profile",
      images: [
        {
          url: `/candidato/${slug}/opengraph-image`,
          width: 1200,
          height: 630,
          alt: `Ficha de ${candidato.nome_urna}`,
        },
      ],
    },
    twitter: buildTwitterMetadata({
      title,
      description: desc,
      image: `/candidato/${slug}/opengraph-image`,
    }),
  }
}

export default async function CandidatoPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { slug } = await params
  const { tab } = await searchParams
  const profileInitialTab = normalizeCandidatoProfileTab(tab)

  return <CandidatoFichaView slug={slug} profileInitialTab={profileInitialTab} />
}

import type { Metadata } from "next"
import { getCandidatoMetadataResource } from "@/lib/api"
import { buildTwitterMetadata, SITE_ORIGIN } from "@/lib/metadata"
import { formatPartyPublicLabel } from "@/lib/party-utils"
import { CandidatoFichaView } from "../CandidatoFichaView"

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const candidatoResource = await getCandidatoMetadataResource(slug)
  const c = candidatoResource.data
  // Slug inexistente vira HTTP 404 no middleware (`/candidato/[slug]/...`);
  // aqui so precisamos curto-circuitar metadata. Contrato em
  // `tests/candidato-timeline-route-contract.test.ts` proibe importar
  // `next/navigation` neste arquivo para evitar regressoes conhecidas.
  if (!c) return {}

  const partyLabel = formatPartyPublicLabel(c.partido_sigla)
  const title = partyLabel
    ? `Linha do tempo · ${c.nome_urna} (${partyLabel}) | Puxa Ficha`
    : `Linha do tempo · ${c.nome_urna} | Puxa Ficha`
  const desc = `Cargos, partidos, patrimônio, processos, votações e gastos no mesmo eixo temporal: ${c.nome_urna}.`
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
  return <CandidatoFichaView slug={slug} profileInitialTab="timeline" seoSubpath="timeline" />
}

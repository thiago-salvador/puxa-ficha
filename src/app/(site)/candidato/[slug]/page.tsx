import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getCandidatoMetadataResource } from "@/lib/api"
import { buildTwitterMetadata } from "@/lib/metadata"
import { formatPartyPublicLabel } from "@/lib/party-utils"
import { buildCandidateMetadataDescription } from "@/lib/ui-labels"
import { sanitizePtBrText } from "@/lib/ptbr-text"
import { truncateOnWordBoundary } from "@/lib/text-truncate"
import { CandidatoFichaView } from "./CandidatoFichaView"

// ISR sob demanda (2026-09-29): era force-dynamic e custava ~34 mil
// execuções de função por dia. Nenhuma ficha é gerada no build (lista vazia);
// cada slug é renderizado na primeira visita e servido do cache depois. O
// frescor pós-escrita vem das tags de `unstable_cache` em src/lib/api.ts: o
// POST /api/revalidate expira `public-candidato-ficha` e a página junto.
// Nada nesta árvore pode ler `headers()`, `cookies()` ou `searchParams` no
// servidor: isso dispara `app-static-to-dynamic-error` (HTTP 500, queda de
// 2026-08-03). O bypass do release-verify saiu daqui e mora no handler de
// /api/candidato-profile/[slug]. A aba inicial de `?tab=` é resolvida no client.
export const revalidate = 43200

export function generateStaticParams(): Array<{ slug: string }> {
  return []
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const candidatoResource = await getCandidatoMetadataResource(slug)
  const candidato = candidatoResource.data
  if (!candidato) {
    // Slug inexistente: notFound() aqui, em generateMetadata, produz HTTP 404
    // real antes do streaming do page body comitar status 200.
    if (candidatoResource.sourceStatus === "live") {
      notFound()
    }
    return {}
  }
  // `slice(0, 155) + "..."` cortava no meio da palavra e emendava reticência em
  // biografia que já cabia inteira ou já terminava em ponto.
  const desc = candidato.biografia
    ? truncateOnWordBoundary(sanitizePtBrText(candidato.biografia), 155)
    : buildCandidateMetadataDescription(candidato.nome_urna, candidato.partido_sigla)
  const partyLabel = formatPartyPublicLabel(candidato.partido_sigla)
  const title = partyLabel
    ? `${candidato.nome_urna} (${partyLabel}) | Puxa Ficha`
    : `${candidato.nome_urna} | Puxa Ficha`

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
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  // Bloco 7 do review 2026-04-24: aba inicial vinda de `?tab=` é resolvida no
  // client (`CandidatoProfile` lê `window.location.search` no mount). Não
  // lemos `searchParams` aqui para preservar SSG/ISR.
  return <CandidatoFichaView slug={slug} throwWhenSourceUnavailable />
}

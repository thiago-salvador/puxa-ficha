import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getCandidatoMetadataResource } from "@/lib/api"
import { buildTwitterMetadata } from "@/lib/metadata"
import { formatPartyPublicLabel } from "@/lib/party-utils"
import { buildCandidateMetadataDescription } from "@/lib/ui-labels"
import { sanitizePtBrText } from "@/lib/ptbr-text"
import { CandidatoFichaView } from "./CandidatoFichaView"

// Bloco 7 do review 2026-04-24: a rota preserva cache nos recursos da ficha,
// mas a página em si precisa ser dinâmica porque o RootLayout lê `headers()`
// para CSP nonce. Pre-render on demand aqui dispara DYNAMIC_SERVER_USAGE em
// produção; o cache de dados segue em src/lib/api.ts via unstable_cache.
// `searchParams.tab` deixou de ser lido no servidor (o que tornava a rota
// dinâmica em Next 15); agora a aba inicial vinda de `?tab=` é resolvida
// no client por `CandidatoProfile`.
// O caminho de bypass do release-verify (header `x-pf-release-verify-cache-bypass`)
// só existe fora de produção: desde a queda de 2026-08-03, `VERCEL_ENV=production`
// ignora o bypass mesmo com `PF_ALLOW_RELEASE_VERIFY_CACHE_BYPASS_IN_PRODUCTION`
// setada. Verificação de release com bypass roda em Preview.
export const dynamic = "force-dynamic"

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
  const desc = candidato.biografia
    ? sanitizePtBrText(candidato.biografia).slice(0, 155) + "..."
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
  return <CandidatoFichaView slug={slug} />
}

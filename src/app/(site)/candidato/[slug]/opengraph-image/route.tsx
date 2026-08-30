import { getCandidatoMetadataResource } from "@/lib/api"
import { buildEditorialOg, dynamicOgImageCacheHeaders } from "@/lib/og"
import { formatPartyPublicLabel } from "@/lib/party-utils"
import { formatCargoDisputadoPublicLabel } from "@/lib/ui-labels"
import { truncateOnWordBoundary } from "@/lib/text-truncate"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  // Esta rota lê 4 campos escalares, todos em CANDIDATO_COLUMNS. Usava a ficha
  // completa (1 consulta + 13 relacionais + paginação serial do inventário do
  // Executivo, até ~2 MB materializados) para isso. O caminho de metadata resolve
  // com uma consulta só, e é o mesmo que o generateMetadata da página já usa.
  // Review de 2026-08-03.
  const ficha = (await getCandidatoMetadataResource(slug)).data

  if (!ficha) {
    // Cache curto no fallback: a ficha pode ter voltado degradada por um blip de
    // segundos no Supabase, e o header longo fixava o card genérico na CDN por 24h
    // sem forma de purgar (POST /api/revalidate age em tag de dado, não no path da
    // imagem). Mesmo tratamento que /quiz/resultado/og e /comparar/og já usam.
    return buildEditorialOg({
      eyebrow: "Ficha de candidato",
      title: "Puxa Ficha",
      subtitle:
        "Ficha pública de candidato mapeado, com dados disponíveis e contexto editorial quando houver fonte estruturada.",
      headers: dynamicOgImageCacheHeaders,
    })
  }

  const partyLabel = formatPartyPublicLabel(ficha.partido_sigla)
  const cargoLabel = formatCargoDisputadoPublicLabel(ficha.cargo_disputado)
  return buildEditorialOg({
    eyebrow: partyLabel ? `${partyLabel} · ${cargoLabel}` : cargoLabel,
    title: ficha.nome_urna,
    subtitle:
      // Sem corte em limite de palavra a imagem social saía terminando em
      // "ministro do Tur"; mesmo helper da meta description.
      (ficha.biografia ? truncateOnWordBoundary(ficha.biografia, 170) : null) ??
      `Ficha pública de ${ficha.nome_urna} com dados disponíveis sobre patrimônio, processos, votações e financiamento quando houver fonte estruturada.`,
    meta: "Dados públicos · não é recomendação de voto",
  })
}

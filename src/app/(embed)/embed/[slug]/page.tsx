import type { Metadata } from "next"
import { notFound } from "next/navigation"
import * as Sentry from "@sentry/nextjs"
import {
  getCandidatoBySlugResource,
  getCandidatoMetadataResource,
} from "@/lib/api"
import { buildAbsoluteUrl } from "@/lib/metadata"
import { EmbedWidget } from "@/components/EmbedWidget"
import { EmbedResizer } from "@/components/EmbedResizer"
import { DataUnavailableState } from "@/components/DataUnavailableState"

// Embed também passa pelo RootLayout com CSP nonce; a página fica dinâmica e o
// cache permanece no recurso de ficha. Isso evita expansão de build sem quebrar
// requests públicos com DYNAMIC_SERVER_USAGE.
export const dynamic = "force-dynamic"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const candidatoResource = await getCandidatoMetadataResource(slug)
  const candidato = candidatoResource.data
  const display = candidato?.nome_urna ?? slug
  return {
    title: `Embed | ${display} | Puxa Ficha`,
    robots: { index: false, follow: false },
    alternates: { canonical: `/candidato/${slug}` },
    openGraph: {
      url: buildAbsoluteUrl(`/candidato/${slug}`),
    },
  }
}

export default async function EmbedCandidatePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const resource = await Sentry.startSpan(
    {
      name: "embed_page.fetch_candidate",
      op: "http.server",
      attributes: {
        "http.route": "/embed/[slug]",
      },
    },
    () => getCandidatoBySlugResource(slug),
  )
  const ficha = resource.data

  if (!ficha) {
    if (resource.sourceStatus === "degraded") {
      return (
        <EmbedResizer>
          <main aria-label="Ficha do candidato (embed)" className="p-4">
            <DataUnavailableState
              title="Ficha temporariamente indisponível"
              description={resource.sourceMessage ?? undefined}
              backHref={buildAbsoluteUrl("/")}
              backLabel="Ir ao início"
            />
          </main>
        </EmbedResizer>
      )
    }
    notFound()
  }

  const showNotice = resource.sourceStatus === "degraded" && resource.sourceMessage

  return (
    <EmbedResizer>
      <main aria-label="Ficha do candidato (embed)" className="p-3">
        {showNotice ? (
          <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-snug text-amber-950">
            {resource.sourceMessage}
          </p>
        ) : null}
        <EmbedWidget ficha={ficha} />
      </main>
    </EmbedResizer>
  )
}

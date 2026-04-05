import { cache } from "react"
import { notFound } from "next/navigation"
import Link from "next/link"
import {
  getCandidatoBySlugResource,
  getCandidatosResource,
  mergeSourceMessages,
  mergeSourceStatuses,
} from "@/lib/api"
import { SITE_ORIGIN } from "@/lib/metadata"
import type { CandidatoProfileTabId } from "@/lib/candidato-profile-tabs"
import { SectionDivider } from "@/components/SectionHeader"
import { Footer } from "@/components/Footer"
import { CandidatePhoto } from "@/components/CandidatePhoto"
import { FollowCandidateButton } from "@/components/alerts/FollowCandidateButton"
import { CandidatoProfile } from "@/components/CandidatoProfile"
import { DataSourceNotice } from "@/components/DataSourceNotice"
import { DataUnavailableState } from "@/components/DataUnavailableState"
import { JsonLd } from "@/components/JsonLd"
import { ArrowLeft, ArrowRight } from "lucide-react"

const getFicha = cache((slug: string) => getCandidatoBySlugResource(slug))

export interface CandidatoFichaViewProps {
  slug: string
  profileInitialTab?: CandidatoProfileTabId
  /**
   * Quando `timeline`, JSON-LD e URL do ProfilePage apontam para a sub-rota da timeline
   * (compartilhamento e crawlers).
   */
  seoSubpath?: "timeline"
}

export async function CandidatoFichaView({
  slug,
  profileInitialTab,
  seoSubpath,
}: CandidatoFichaViewProps) {
  const fichaResource = await getFicha(slug)
  const ficha = fichaResource.data
  if (!ficha) {
    if (fichaResource.sourceStatus === "degraded") {
      return (
        <div className="min-h-screen bg-background">
          <div className="mx-auto max-w-7xl px-5 pt-20 md:px-12">
            <DataUnavailableState
              title="Ficha temporariamente indisponivel"
              description={fichaResource.sourceMessage ?? undefined}
            />
          </div>
          <Footer />
        </div>
      )
    }
    notFound()
  }

  const allCandidatosResource = await getCandidatosResource(ficha.cargo_disputado)
  const allCandidatos = allCandidatosResource.data
  const sourceStatus = mergeSourceStatuses(
    fichaResource.sourceStatus,
    allCandidatosResource.sourceStatus,
  )
  const sourceMessage = mergeSourceMessages(
    fichaResource.sourceMessage,
    allCandidatosResource.sourceMessage,
  )
  const sorted = [...allCandidatos].sort((a, b) => a.nome_urna.localeCompare(b.nome_urna, "pt-BR"))
  const currentIdx = sorted.findIndex((c) => c.slug === slug)
  const prev = currentIdx > 0 ? sorted[currentIdx - 1] : null
  const next = currentIdx < sorted.length - 1 ? sorted[currentIdx + 1] : null

  const isGovernador = ficha.cargo_disputado === "Governador"
  const backHref =
    isGovernador && ficha.estado ? `/governadores/${ficha.estado.toLowerCase()}` : "/"
  const backLabel =
    isGovernador && ficha.estado ? `Governadores ${ficha.estado.toUpperCase()}` : "Candidatos"

  const fichaUrl = `${SITE_ORIGIN}/candidato/${slug}`
  const timelineUrl = `${SITE_ORIGIN}/candidato/${slug}/timeline`

  const schema =
    seoSubpath === "timeline"
      ? [
          {
            "@context": "https://schema.org",
            "@type": "ProfilePage",
            name: `Linha do tempo · ${ficha.nome_urna} (${ficha.partido_sigla})`,
            url: timelineUrl,
            description: `Linha do tempo publica de ${ficha.nome_urna}: cargos, patrimonio, processos, votacoes e mais.`,
            mainEntity: {
              "@type": "Person",
              name: ficha.nome_urna,
              alternateName: ficha.nome_completo,
              image: ficha.foto_url ?? undefined,
              jobTitle: ficha.cargo_disputado,
            },
          },
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: "Inicio",
                item: SITE_ORIGIN,
              },
              {
                "@type": "ListItem",
                position: 2,
                name: ficha.nome_urna,
                item: fichaUrl,
              },
              {
                "@type": "ListItem",
                position: 3,
                name: "Linha do tempo",
                item: timelineUrl,
              },
            ],
          },
        ]
      : [
          {
            "@context": "https://schema.org",
            "@type": "ProfilePage",
            name: `${ficha.nome_urna} (${ficha.partido_sigla})`,
            url: fichaUrl,
            description: ficha.biografia ?? `Ficha publica de ${ficha.nome_urna}.`,
            mainEntity: {
              "@type": "Person",
              name: ficha.nome_urna,
              alternateName: ficha.nome_completo,
              image: ficha.foto_url ?? undefined,
              jobTitle: ficha.cargo_disputado,
            },
          },
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: "Inicio",
                item: SITE_ORIGIN,
              },
              {
                "@type": "ListItem",
                position: 2,
                name: ficha.nome_urna,
                item: fichaUrl,
              },
            ],
          },
        ]

  return (
    <div className="min-h-screen bg-background">
      <JsonLd data={schema} />
      <div className="mx-auto max-w-7xl px-5 pt-20 sm:pt-24 md:px-12">
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-foreground transition-colors hover:text-foreground sm:text-[length:var(--text-caption)]"
        >
          <ArrowLeft className="size-3 sm:size-3.5" />
          {backLabel}
        </Link>
      </div>

      <section
        data-pf-hero
        className="mx-auto max-w-7xl px-5 pt-6 pb-6 sm:pt-8 sm:pb-8 md:px-12"
      >
        <div className="flex flex-col gap-6 sm:gap-8 lg:flex-row lg:items-center lg:gap-12">
          {ficha.foto_url && (
            <div className="shrink-0 self-start">
              <CandidatePhoto
                src={ficha.foto_url}
                alt={`Foto de ${ficha.nome_urna}`}
                name={ficha.nome_urna}
                width={315}
                height={420}
                sizes="(max-width: 640px) 210px, (max-width: 1024px) 270px, 315px"
                priority
                className="h-[280px] w-[210px] rounded-[16px] object-cover object-top sm:h-[360px] sm:w-[270px] sm:rounded-[20px] lg:h-[420px] lg:w-[315px]"
                fallbackClassName="h-[280px] w-[210px] rounded-[16px] sm:h-[360px] sm:w-[270px] sm:rounded-[20px] lg:h-[420px] lg:w-[315px]"
                initialsClassName="text-5xl sm:text-6xl"
              />
            </div>
          )}

          <div className="flex flex-col justify-end">
            <span
              data-pf-hero-party={ficha.partido_sigla}
              data-pf-hero-role={ficha.cargo_disputado}
              className="text-[10px] font-bold uppercase tracking-[0.12em] text-foreground sm:text-[length:var(--text-eyebrow)]"
            >
              {ficha.partido_sigla} &middot; {ficha.cargo_disputado}
            </span>

            <h1
              data-pf-hero-name
              className="mt-1.5 font-heading uppercase leading-[0.85] tracking-[-0.02em] text-foreground sm:mt-2"
              style={{ fontSize: "clamp(36px, 8vw, 80px)" }}
            >
              {ficha.nome_urna}
            </h1>

            {ficha.nome_completo !== ficha.nome_urna && (
              <p className="mt-1.5 text-[length:var(--text-body-sm)] font-medium text-foreground sm:mt-2 sm:text-[length:var(--text-body)]">
                {ficha.nome_completo}
              </p>
            )}

            <p
              data-pf-hero-meta
              className="mt-2 text-[length:var(--text-caption)] font-semibold text-muted-foreground sm:mt-3 sm:text-[length:var(--text-body-sm)]"
            >
              {[
                ficha.cargo_atual,
                ficha.naturalidade,
                ficha.idade ? `${ficha.idade} anos` : null,
                ficha.formacao,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>

            {ficha.biografia && (
              <p
                data-pf-bio
                className="mt-4 max-w-2xl text-[length:var(--text-body)] font-medium leading-relaxed text-foreground sm:mt-5 sm:text-[15px]"
              >
                {ficha.biografia}
              </p>
            )}
            <FollowCandidateButton candidateName={ficha.nome_urna} candidateSlug={ficha.slug} />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-5 pb-2 md:px-12">
        <DataSourceNotice status={sourceStatus} message={sourceMessage} />
      </div>

      <SectionDivider />

      <CandidatoProfile ficha={ficha} initialTab={profileInitialTab} />

      {(prev || next) && (
        <>
          <SectionDivider />
          <nav className="mx-auto max-w-7xl px-5 py-8 md:px-12">
            <div className="flex items-center justify-between">
              {prev ? (
                <Link
                  href={`/candidato/${prev.slug}`}
                  className="group flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" />
                  <div>
                    <span className="block text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em]">
                      Anterior
                    </span>
                    <span className="block font-heading text-lg uppercase text-foreground">
                      {prev.nome_urna}
                    </span>
                  </div>
                </Link>
              ) : (
                <div />
              )}
              {next ? (
                <Link
                  href={`/candidato/${next.slug}`}
                  className="group flex items-center gap-2 text-right text-muted-foreground transition-colors hover:text-foreground"
                >
                  <div>
                    <span className="block text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em]">
                      Proximo
                    </span>
                    <span className="block font-heading text-lg uppercase text-foreground">
                      {next.nome_urna}
                    </span>
                  </div>
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </Link>
              ) : (
                <div />
              )}
            </div>
          </nav>
        </>
      )}

      <Footer />
    </div>
  )
}

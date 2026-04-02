import { cache } from "react"
import { notFound } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import type { Metadata } from "next"
import { ArrowLeft } from "lucide-react"
import { Footer } from "@/components/Footer"
import { CandidatoProfile } from "@/components/CandidatoProfile"
import { DataSourceNotice } from "@/components/DataSourceNotice"
import { DataUnavailableState } from "@/components/DataUnavailableState"
import { SectionDivider } from "@/components/SectionHeader"
import { shouldBypassImageOptimization } from "@/lib/utils"
import { getCandidatoBySlugPreviewResource } from "@/lib/api"

const getFichaPreview = cache((slug: string) => getCandidatoBySlugPreviewResource(slug))

function resolvePreviewToken(): string | null {
  if (process.env.PF_PREVIEW_TOKEN) return process.env.PF_PREVIEW_TOKEN
  if (process.env.VERCEL_ENV === "production") return null
  return "local-preview"
}

function previewAuthorized(token: string | undefined): boolean {
  const expected = resolvePreviewToken()
  return Boolean(expected && token && token === expected)
}

export const dynamic = "force-dynamic"
export const revalidate = 0

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
}

export default async function PreviewCandidatoPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ token?: string }>
}) {
  const { slug } = await params
  const { token } = await searchParams

  if (!previewAuthorized(token)) {
    notFound()
  }

  const fichaResource = await getFichaPreview(slug)
  const ficha = fichaResource.data

  if (!ficha) {
    if (fichaResource.sourceStatus === "degraded") {
      return (
        <div className="min-h-screen bg-background">
          <div className="mx-auto max-w-7xl px-5 pt-20 md:px-12">
            <DataUnavailableState
              title="Preview temporariamente indisponivel"
              description={fichaResource.sourceMessage ?? undefined}
            />
          </div>
          <Footer />
        </div>
      )
    }
    notFound()
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-5 pt-20 sm:pt-24 md:px-12">
        <Link
          href="/explorar"
          className="inline-flex items-center gap-2 text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-foreground transition-colors hover:text-foreground sm:text-[length:var(--text-caption)]"
        >
          <ArrowLeft className="size-3 sm:size-3.5" />
          Preview interno
        </Link>
      </div>

      <section
        data-pf-hero
        className="mx-auto max-w-7xl px-5 pt-6 pb-6 sm:pt-8 sm:pb-8 md:px-12"
      >
        <div className="flex flex-col gap-6 sm:gap-8 lg:flex-row lg:items-center lg:gap-12">
          {ficha.foto_url && (
            <div className="shrink-0 self-start">
              <Image
                src={ficha.foto_url}
                alt={`Foto de ${ficha.nome_urna}`}
                width={315}
                height={420}
                sizes="(max-width: 640px) 210px, (max-width: 1024px) 270px, 315px"
                priority
                unoptimized={shouldBypassImageOptimization(ficha.foto_url)}
                className="h-[280px] w-[210px] rounded-[16px] object-cover object-top sm:h-[360px] sm:w-[270px] sm:rounded-[20px] lg:h-[420px] lg:w-[315px]"
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
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-5 pb-2 md:px-12">
        <DataSourceNotice
          status={fichaResource.sourceStatus}
          message={fichaResource.sourceMessage}
        />
      </div>

      <SectionDivider />
      <CandidatoProfile ficha={ficha} />
      <Footer />
    </div>
  )
}

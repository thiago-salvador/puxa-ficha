import { notFound } from "next/navigation"
import { getCandidatoBySlug, getCandidatos } from "@/lib/api"
import Link from "next/link"
import type { Metadata } from "next"
import { SectionDivider } from "@/components/SectionHeader"
import { Footer } from "@/components/Footer"
import { CandidatoProfile } from "@/components/CandidatoProfile"
import { ArrowLeft, ArrowRight } from "lucide-react"

export const revalidate = 3600

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
  const ficha = await getCandidatoBySlug(slug)
  if (!ficha) return {}
  const desc = ficha.biografia
    ? ficha.biografia.slice(0, 155) + "..."
    : `Ficha completa de ${ficha.nome_urna} (${ficha.partido_sigla}): patrimonio, processos, votacoes, financiamento.`

  return {
    title: `${ficha.nome_urna} (${ficha.partido_sigla}) — Puxa Ficha`,
    description: desc,
    openGraph: {
      title: `${ficha.nome_urna} (${ficha.partido_sigla}) — Puxa Ficha`,
      description: desc,
      url: `https://puxaficha.com.br/candidato/${slug}`,
      siteName: "Puxa Ficha",
      locale: "pt_BR",
      type: "profile",
    },
  }
}

export default async function CandidatoPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const ficha = await getCandidatoBySlug(slug)
  if (!ficha) notFound()

  const allCandidatos = await getCandidatos(ficha.cargo_disputado)
  const sorted = [...allCandidatos].sort((a, b) => a.nome_urna.localeCompare(b.nome_urna, "pt-BR"))
  const currentIdx = sorted.findIndex(c => c.slug === slug)
  const prev = currentIdx > 0 ? sorted[currentIdx - 1] : null
  const next = currentIdx < sorted.length - 1 ? sorted[currentIdx + 1] : null

  return (
    <div className="min-h-screen bg-background">
      {/* Back link */}
      <div className="mx-auto max-w-7xl px-5 pt-20 sm:pt-24 md:px-12">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-foreground transition-colors hover:text-foreground sm:text-[length:var(--text-caption)]"
        >
          <ArrowLeft className="size-3 sm:size-3.5" />
          Candidatos
        </Link>
      </div>

      {/* Hero: photo + info */}
      <section className="mx-auto max-w-7xl px-5 pt-6 pb-6 sm:pt-8 sm:pb-8 md:px-12">
        <div className="flex flex-col gap-6 sm:gap-8 lg:flex-row lg:items-center lg:gap-12">
          {/* Photo */}
          {ficha.foto_url && (
            <div className="shrink-0 self-start">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={ficha.foto_url}
                alt={`Foto de ${ficha.nome_urna}`}
                className="h-[280px] w-[210px] rounded-[16px] object-cover object-top sm:h-[360px] sm:w-[270px] sm:rounded-[20px] lg:h-[420px] lg:w-[315px]"
              />
            </div>
          )}

          {/* Info */}
          <div className="flex flex-col justify-end">
            {/* Eyebrow */}
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-foreground sm:text-[length:var(--text-eyebrow)]">
              {ficha.partido_sigla} &middot; {ficha.cargo_disputado}
            </span>

            {/* Name */}
            <h1
              className="mt-1.5 font-heading uppercase leading-[0.85] tracking-[-0.02em] text-foreground sm:mt-2"
              style={{ fontSize: "clamp(36px, 8vw, 80px)" }}
            >
              {ficha.nome_urna}
            </h1>

            {/* Full name if different */}
            {ficha.nome_completo !== ficha.nome_urna && (
              <p className="mt-1.5 text-[length:var(--text-body-sm)] font-medium text-foreground sm:mt-2 sm:text-[length:var(--text-body)]">
                {ficha.nome_completo}
              </p>
            )}

            {/* Meta line */}
            <p className="mt-2 text-[length:var(--text-caption)] font-semibold text-muted-foreground sm:mt-3 sm:text-[length:var(--text-body-sm)]">
              {[
                ficha.cargo_atual,
                ficha.naturalidade,
                ficha.idade ? `${ficha.idade} anos` : null,
                ficha.formacao,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>

            {/* Biografia */}
            {ficha.biografia && (
              <p className="mt-4 max-w-2xl text-[length:var(--text-body)] font-medium leading-relaxed text-foreground sm:mt-5 sm:text-[15px]">
                {ficha.biografia}
              </p>
            )}
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* Client-side profile with tabs, stats, all sections */}
      <CandidatoProfile ficha={ficha} />

      {/* Prev/Next navigation */}
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
                    <span className="block text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em]">Anterior</span>
                    <span className="block font-heading text-lg uppercase text-foreground">{prev.nome_urna}</span>
                  </div>
                </Link>
              ) : <div />}
              {next ? (
                <Link
                  href={`/candidato/${next.slug}`}
                  className="group flex items-center gap-2 text-right text-muted-foreground transition-colors hover:text-foreground"
                >
                  <div>
                    <span className="block text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em]">Proximo</span>
                    <span className="block font-heading text-lg uppercase text-foreground">{next.nome_urna}</span>
                  </div>
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </Link>
              ) : <div />}
            </div>
          </nav>
        </>
      )}

      <Footer />
    </div>
  )
}

import { notFound } from "next/navigation"
import {
  getEstadoNome,
  getEstadoUFs,
  getCandidatosComResumoResource,
  getCandidatosComparaveisResource,
  mergeSourceMessages,
  mergeSourceStatuses,
} from "@/lib/api"
import { CandidatoGrid } from "@/components/CandidatoGrid"
import { ComparadorPanel } from "@/components/ComparadorPanel"
import { SlashDivider } from "@/components/SlashDivider"
import { Footer } from "@/components/Footer"
import { DataSourceNotice } from "@/components/DataSourceNotice"
import { JsonLd } from "@/components/JsonLd"
import Link from "next/link"
import type { Metadata } from "next"
import { ArrowLeft } from "lucide-react"
import { formatBRL } from "@/lib/utils"

export const revalidate = 3600

export async function generateStaticParams() {
  return getEstadoUFs().map((uf) => ({ uf }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ uf: string }>
}): Promise<Metadata> {
  const { uf } = await params
  const nome = getEstadoNome(uf)
  if (!nome) return {}
  return {
    title: `Candidatos a governador: ${nome} (${uf.toUpperCase()}) — Puxa Ficha`,
    description: `Consulte os candidatos a governador de ${nome} nas eleicoes 2026. Ficha completa, patrimonio, processos.`,
    openGraph: {
      title: `Candidatos a governador: ${nome} (${uf.toUpperCase()}) — Puxa Ficha`,
      description: `Consulte os candidatos a governador de ${nome} nas eleicoes 2026. Ficha completa, patrimonio, processos.`,
      url: `https://puxaficha.com.br/governadores/${uf.toLowerCase()}`,
      images: [
        {
          url: `/governadores/${uf.toLowerCase()}/opengraph-image`,
          width: 1200,
          height: 630,
          alt: `Governadores ${nome}`,
        },
      ],
    },
  }
}

export default async function EstadoPage({
  params,
}: {
  params: Promise<{ uf: string }>
}) {
  const { uf } = await params
  const nome = getEstadoNome(uf)
  if (!nome) notFound()

  const [resumosResource, comparaveisResource] = await Promise.all([
    getCandidatosComResumoResource("Governador"),
    getCandidatosComparaveisResource("Governador", uf),
  ])
  const resumos = resumosResource.data
  const comparaveis = comparaveisResource.data
  const estadoResumos = resumos.filter(r => r.candidato.estado?.toLowerCase() === uf.toLowerCase())
  const candidatos = estadoResumos.map(r => r.candidato)
  const sourceStatus = mergeSourceStatuses(
    resumosResource.sourceStatus,
    comparaveisResource.sourceStatus
  )
  const sourceMessage = mergeSourceMessages(
    resumosResource.sourceMessage,
    comparaveisResource.sourceMessage
  )

  const processos: Record<string, number> = {}
  const patrimonios: Record<string, number | null> = {}
  for (const r of estadoResumos) {
    processos[r.candidato.slug] = r.processos
    patrimonios[r.candidato.slug] = r.patrimonio
  }

  // Aggregate stats for hero data bar
  const totalCandidatos = candidatos.length
  const totalPatrimonio = estadoResumos.reduce((sum, r) => sum + (r.patrimonio ?? 0), 0)
  const totalProcessos = estadoResumos.reduce((sum, r) => sum + r.processos, 0)
  const partidos = new Set(candidatos.map(c => c.partido_sigla).filter(Boolean))
  const totalPartidos = partidos.size
  const schema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `Candidatos a governador em ${nome}`,
    url: `https://puxaficha.com.br/governadores/${uf.toLowerCase()}`,
    description: `Consulte e compare candidatos a governador de ${nome} nas eleicoes de 2026.`,
  }

  return (
    <div className="min-h-screen bg-background">
      <JsonLd data={schema} />
      {/* Hero */}
      <section className="relative overflow-hidden bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/governadores-hero.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/50" />
        <div className="relative mx-auto max-w-7xl px-5 pb-16 pt-28 sm:pb-20 sm:pt-32 md:px-12 lg:pb-24 lg:pt-40">
          <Link
            href="/governadores"
            className="inline-flex items-center gap-2 text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-white/70 transition-colors hover:text-white"
          >
            <ArrowLeft className="size-3" />
            Mapa
          </Link>
          <div className="mt-8">
            <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-white/80">
              Governador · {uf.toUpperCase()}
            </p>
            <h1
              className="mt-4 font-heading uppercase leading-none text-white"
              style={{ fontSize: "clamp(40px, 10vw, 96px)" }}
            >
              {nome}
            </h1>
          </div>

          {/* Data bar */}
          {totalCandidatos > 0 && (
            <div className="mt-6 flex flex-wrap gap-6 pb-4 sm:gap-12 lg:gap-20">
              <div>
                <p className="text-[22px] font-bold leading-none tracking-tight text-white sm:text-[36px] lg:text-[48px]">
                  {totalCandidatos}
                </p>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white">
                  pre-candidatos
                </p>
              </div>
              {totalPatrimonio > 0 && (
                <div>
                  <p className="text-[22px] font-bold leading-none tracking-tight text-white sm:text-[36px] lg:text-[48px]">
                    {totalPatrimonio >= 1_000_000
                      ? `R$ ${(totalPatrimonio / 1_000_000).toFixed(0)}M`
                      : formatBRL(totalPatrimonio)}
                  </p>
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white">
                    patrimonio declarado
                  </p>
                </div>
              )}
              {totalProcessos > 0 && (
                <div>
                  <p className="text-[22px] font-bold leading-none tracking-tight text-white sm:text-[36px] lg:text-[48px]">
                    {totalProcessos}
                  </p>
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white">
                    processos
                  </p>
                </div>
              )}
              {totalPartidos > 0 && totalPatrimonio === 0 && totalProcessos === 0 && (
                <div>
                  <p className="text-[22px] font-bold leading-none tracking-tight text-white sm:text-[36px] lg:text-[48px]">
                    {totalPartidos}
                  </p>
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white">
                    partidos
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pt-6 md:px-12">
        <DataSourceNotice status={sourceStatus} message={sourceMessage} />
      </section>

      <section className="mx-auto max-w-7xl px-5 pt-8 md:px-12">
        <div className="max-w-3xl">
          <p className="text-[length:var(--text-body)] font-medium leading-relaxed text-foreground sm:text-[15px]">
            Esta pagina organiza os candidatos a governador de {nome} com foco
            em busca organica e consulta rapida: ficha completa, comparador e
            leitura por patrimonio, processos e partidos.
          </p>
          <p className="mt-3 text-[length:var(--text-body)] font-medium leading-relaxed text-muted-foreground sm:text-[15px]">
            Se estiver navegando por estado, volte ao{" "}
            <Link href="/governadores" className="font-semibold text-foreground underline">
              mapa geral
            </Link>{" "}
            ou compare com a cobertura da{" "}
            <Link href="/" className="font-semibold text-foreground underline">
              presidencia
            </Link>
            .
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-5 pt-8 md:px-12 sm:pt-12">
        <SlashDivider />
      </div>

      {candidatos.length > 0 ? (
        <>
          {/* Section header */}
          <section className="mx-auto max-w-7xl px-5 pt-12 sm:pt-16 md:px-12 lg:pt-20">
            <div className="section-reveal">
              <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-foreground">
                01 Candidatos
              </p>
              <h2
                className="mt-1 font-heading uppercase leading-[0.95] text-foreground"
                style={{ fontSize: "clamp(28px, 5vw, 48px)" }}
              >
                Governador de {nome}
              </h2>
            </div>
            <SlashDivider className="mt-6 mb-8 sm:mt-8 sm:mb-10" />
          </section>

          {/* Candidate grid */}
          <section className="mx-auto max-w-7xl px-5 pb-16 md:px-12 lg:pb-20">
            <CandidatoGrid
              candidatos={candidatos}
              processos={processos}
              patrimonios={patrimonios}
            />
          </section>

          {/* Comparador */}
          {comparaveis.length >= 2 && (
            <>
              <div className="mx-auto max-w-7xl px-5 md:px-12">
                <SlashDivider />
              </div>
              <section className="mx-auto max-w-7xl px-5 pt-12 sm:pt-16 md:px-12 lg:pt-20">
                <div className="section-reveal">
                  <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-foreground">
                    02 Comparador
                  </p>
                  <h2
                    className="mt-1 font-heading uppercase leading-[0.95] text-foreground"
                    style={{ fontSize: "clamp(28px, 5vw, 48px)" }}
                  >
                    Lado a lado
                  </h2>
                </div>
                <SlashDivider className="mt-6 mb-8 sm:mt-8 sm:mb-10" />
              </section>
              <ComparadorPanel candidatos={comparaveis} />
            </>
          )}
        </>
      ) : (
        <section className="mx-auto max-w-7xl px-5 py-20 text-center md:px-12">
          <p className="font-heading text-[length:var(--text-heading)] uppercase text-foreground">
            Em breve
          </p>
          <p className="mt-2 text-[length:var(--text-body)] font-medium text-muted-foreground">
            Nenhum candidato a governador cadastrado para {nome}.
          </p>
          <Link
            href="/governadores"
            className="pill-hover mt-6 inline-flex items-center gap-2 rounded-full border border-foreground px-5 py-2.5 text-[length:var(--text-body-sm)] font-semibold text-foreground"
          >
            <ArrowLeft className="size-4" />
            Voltar ao mapa
          </Link>
        </section>
      )}

      <Footer />
    </div>
  )
}

import { Suspense, lazy } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"
import { notFound, permanentRedirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { CandidatoGrid } from "@/components/CandidatoGrid"
import { buildCandidatoGridMaps } from "@/lib/candidato-grid-maps"
import { DataSourceNotice } from "@/components/DataSourceNotice"
import { Footer } from "@/components/Footer"
import { JsonLd } from "@/components/JsonLd"
import { SlashDivider } from "@/components/SlashDivider"
import { StatePolls } from "@/components/StatePolls"
import { SenadoRunningMates } from "@/components/SenadoRunningMates"
import {
  getCandidatosComResumoResource,
  getCandidatosComparaveisResource,
  getEstadoNome,
  getEstadoUFs,
  mergeSourceMessages,
  mergeSourceStatuses,
} from "@/lib/api"
import { buildAbsoluteUrl, buildTwitterMetadata } from "@/lib/metadata"
import { isSenadoEnabled, SENADO_SOURCE_URL } from "@/lib/senado-feature"
import { loadSenadoPolls } from "@/lib/senado-polls"
import { loadSenadoRunningMates } from "@/lib/senado-running-mates"

const ComparadorPanel = lazy(() =>
  import("@/components/ComparadorPanel").then((m) => ({ default: m.ComparadorPanel })),
)

export function generateStaticParams() {
  return getEstadoUFs().map((uf) => ({ uf }))
}

export async function generateMetadata({ params }: { params: Promise<{ uf: string }> }): Promise<Metadata> {
  const { uf } = await params
  const nome = getEstadoNome(uf)
  if (!nome || !isSenadoEnabled()) return {}
  const canonical = `/uf/${uf.toLowerCase()}/senado`
  const title = `Eleições 2026: Senado em ${nome} (${uf.toUpperCase()}) | Puxa Ficha`
  const description = `Candidaturas ao Senado em ${nome}: duas vagas, dois votos e sem segundo turno, com fontes e limites de cobertura.`
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: buildAbsoluteUrl(canonical), images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: `Senado em ${nome}` }] },
    twitter: buildTwitterMetadata({ title, description, image: "/opengraph-image" }),
  }
}

export default async function SenadoUfPage({ params }: { params: Promise<{ uf: string }> }) {
  const { uf } = await params
  if (!isSenadoEnabled()) notFound()
  if (uf !== uf.toLowerCase()) permanentRedirect(`/uf/${uf.toLowerCase()}/senado`)
  const nome = getEstadoNome(uf)
  if (!nome) notFound()

  const [resumosResource, comparaveisResource] = await Promise.all([
    getCandidatosComResumoResource("Senador", uf.toUpperCase()),
    getCandidatosComparaveisResource("Senador", uf.toUpperCase()),
  ])
  const candidatos = resumosResource.data.map((r) => r.candidato)
  const comparaveis = comparaveisResource.data
  const { processos, patrimonios, processSortCounts, patrimoniosAtipicos } =
    buildCandidatoGridMaps(resumosResource.data)
  const sourceStatus = mergeSourceStatuses(resumosResource.sourceStatus, comparaveisResource.sourceStatus)
  const sourceMessage = mergeSourceMessages(resumosResource.sourceMessage, comparaveisResource.sourceMessage)
  const [runningMates, pollsResource] = await Promise.all([
    loadSenadoRunningMates(candidatos.map(({ slug }) => slug), uf),
    Promise.resolve()
      .then(() => ({ data: loadSenadoPolls(uf), unavailable: false }))
      .catch(() => ({ data: [], unavailable: true })),
  ])
  const title = `Senado em ${nome}`
  const canonical = `/uf/${uf}/senado`

  return (
    <div className="min-h-screen bg-background">
      <JsonLd data={{ "@context": "https://schema.org", "@type": "CollectionPage", name: title, url: buildAbsoluteUrl(canonical), description: `Candidaturas ao Senado em ${nome}.` }} />
      <section className="relative overflow-hidden bg-black">
        <div className="absolute inset-0 opacity-30" aria-hidden="true"><Image src="/images/governadores-hero.webp" alt="" fill sizes="100vw" className="object-cover grayscale" /></div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/50" />
        <div className="relative mx-auto max-w-7xl px-5 pb-12 pt-28 sm:pb-16 sm:pt-32 md:px-12 lg:pb-20 lg:pt-40">
          <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-white">Senado · {uf.toUpperCase()}</p>
          <h1 className="mt-2 font-heading uppercase leading-[0.85] text-white" style={{ fontSize: "clamp(36px, 8vw, 80px)" }}>{nome}</h1>
          <p className="mt-3 max-w-2xl text-[length:var(--text-body)] font-medium text-white/85 sm:text-[15px]">Duas vagas em disputa, dois votos por eleitor e sem segundo turno.</p>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-5 pt-6 md:px-12">
        <DataSourceNotice status={sourceStatus} message={sourceMessage} />
        <p className="mt-4 max-w-3xl text-sm font-medium leading-relaxed text-muted-foreground">Regra eleitoral conforme o <a href={SENADO_SOURCE_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-foreground underline">TSE</a>. Dados de candidatura exibidos somente quando publicados nesta cobertura.</p>
        <nav aria-label="Seções do Senado" className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-b border-border pb-3 text-sm font-semibold">
          <a href="#candidatos" className="inline-flex min-h-11 items-center">Candidaturas</a>
          <a href="#pesquisas" className="inline-flex min-h-11 items-center">Pesquisas</a>
          {comparaveis.length >= 2 && <a href="#comparador" className="inline-flex min-h-11 items-center">Lado a lado</a>}
        </nav>
      </section>
      <section id="candidatos" className="mx-auto max-w-7xl scroll-mt-24 px-5 pt-12 md:px-12 lg:pt-20">
        <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em]">Senado · {uf.toUpperCase()}</p>
        <h2 className="mt-1 font-heading uppercase leading-[0.95] text-foreground" style={{ fontSize: "clamp(28px, 5vw, 48px)" }}>Candidatos em {nome}</h2>
        <SlashDivider className="mt-6 mb-8 sm:mt-8 sm:mb-10" />
      </section>
      {candidatos.length > 0 ? (
        <section className="mx-auto max-w-7xl px-5 pb-10 md:px-12">
          <CandidatoGrid
            candidatos={candidatos}
            processos={processos}
            processSortCounts={processSortCounts}
            patrimonios={patrimonios}
            patrimoniosAtipicos={patrimoniosAtipicos}
          />
          <div className="mt-10">
            <SenadoRunningMates candidates={candidatos.map(({ slug, nome_urna }) => ({ slug, nome_urna }))} data={runningMates.data} absence={runningMates.absence} unavailable={runningMates.unavailable} />
          </div>
        </section>
      ) : (
        <section className="mx-auto max-w-7xl px-5 pb-16 text-center md:px-12">
          <p className="font-heading text-3xl uppercase">{sourceStatus === "degraded" ? "Candidaturas temporariamente indisponíveis" : "Nenhuma candidatura publicada nesta cobertura"}</p>
          <p className="mt-2 text-sm text-muted-foreground">Isso não indica ausência de candidaturas na eleição.</p>
          <Link href="/senado" className="pill-hover mt-6 inline-flex items-center gap-2 rounded-full border border-foreground px-5 py-2.5 text-sm font-semibold"><ArrowLeft className="size-4" />Voltar ao Senado</Link>
        </section>
      )}
      <div className="mx-auto max-w-7xl space-y-12 px-5 py-12 md:px-12">
        <SlashDivider />
        <StatePolls office="Senador" polls={pollsResource.data} unavailable={pollsResource.unavailable} candidates={candidatos.map(({ slug, nome_urna, foto_url }) => ({ slug, nome_urna, foto_url }))} />
      </div>
      {candidatos.length > 0 && comparaveis.length >= 2 && (
        <>
          <div className="mx-auto max-w-7xl px-5 md:px-12"><SlashDivider /></div>
          <section id="comparador" className="mx-auto max-w-7xl scroll-mt-24 px-5 pt-12 md:px-12 lg:pt-20">
            <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em]">Comparador</p>
            <h2 className="mt-1 font-heading uppercase leading-[0.95] text-foreground" style={{ fontSize: "clamp(28px, 5vw, 48px)" }}>Lado a lado</h2>
            <SlashDivider className="mt-6 mb-8 sm:mt-8 sm:mb-10" />
          </section>
          <Suspense fallback={<p className="mx-auto max-w-7xl px-5 py-10 text-center text-muted-foreground md:px-12">Carregando comparador...</p>}><ComparadorPanel candidatos={comparaveis} referenceNow={new Date().toISOString()} /></Suspense>
        </>
      )}
      <section className="mx-auto max-w-7xl px-5 py-12 md:px-12"><Link href={`/uf/${uf}`} className="font-semibold text-foreground underline">Ver candidatos a governador em {nome}</Link></section>
      <Footer />
    </div>
  )
}

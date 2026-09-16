import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Footer } from "@/components/Footer"
import { JsonLd } from "@/components/JsonLd"
import { SlashDivider } from "@/components/SlashDivider"
import { getEstadoNome, getEstadoUFs } from "@/lib/br-uf"
import { isSenadoEnabled, SENADO_SOURCE_URL } from "@/lib/senado-feature"

const title = "Eleições 2026: senadores por estado | Puxa Ficha"
const description =
  "Encontre candidaturas ao Senado por estado. Em 2026, cada eleitor terá dois votos para duas vagas, sem segundo turno."

export function generateMetadata(): Metadata {
  if (!isSenadoEnabled()) return {}
  return {
    title,
    description,
    alternates: { canonical: "/senado" },
    openGraph: {
      title,
      description,
      url: "https://puxaficha.com.br/senado",
      images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Senadores por estado" }],
    },
  }
}

export default function SenadoPage() {
  if (!isSenadoEnabled()) notFound()
  const ufs = getEstadoUFs()

  return (
    <div className="min-h-screen bg-background">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Senadores por estado",
          url: "https://puxaficha.com.br/senado",
          description,
        }}
      />
      <section className="relative overflow-hidden bg-black">
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-black to-zinc-800" aria-hidden="true" />
        <div className="relative mx-auto max-w-7xl px-5 pb-12 pt-28 sm:pb-16 sm:pt-32 md:px-12 lg:pb-20 lg:pt-40">
          <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-white">Senado</p>
          <h1 className="mt-2 font-heading uppercase leading-[0.85] text-white" style={{ fontSize: "clamp(36px, 8vw, 80px)" }}>
            Por estado
          </h1>
          <p className="mt-3 max-w-xl text-[length:var(--text-body)] font-medium text-white/80 sm:text-[15px]">
            Em 2026, cada eleitor vota duas vezes para escolher duas vagas ao Senado. Não há segundo turno.
          </p>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-5 pt-6 md:px-12">
        <p className="mt-4 max-w-3xl text-sm font-medium leading-relaxed text-muted-foreground">
          Regra eleitoral: <a href={SENADO_SOURCE_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-foreground underline">fonte do TSE sobre os cargos em disputa</a>.
        </p>
      </section>
      <div className="mx-auto max-w-7xl px-5 pt-8 md:px-12 sm:pt-12"><SlashDivider /></div>
      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ufs.map((uf) => (
            <Link key={uf} href={`/uf/${uf}/senado`} className="pill-hover flex min-h-20 items-center justify-between rounded-xl border border-foreground px-5 py-4">
              <span className="font-heading text-2xl uppercase">{getEstadoNome(uf)}</span>
              <span className="text-sm font-bold uppercase tracking-[0.12em] text-muted-foreground">{uf}</span>
            </Link>
          ))}
        </div>
      </section>
      <Footer />
    </div>
  )
}

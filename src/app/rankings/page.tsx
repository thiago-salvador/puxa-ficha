import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { DataSourceNotice } from "@/components/DataSourceNotice"
import { Footer } from "@/components/Footer"
import { JsonLd } from "@/components/JsonLd"
import { RankingCard } from "@/components/RankingCard"
import { ShareButtons } from "@/components/ShareButtons"
import { SlashDivider } from "@/components/SlashDivider"
import { rankingDefinitions } from "@/data/ranking-definitions"
import {
  getRankingDataResource,
  mergeSourceMessages,
  mergeSourceStatuses,
} from "@/lib/api"
import { buildAbsoluteUrl, buildTwitterMetadata } from "@/lib/metadata"

const title = "Rankings tematicos — Puxa Ficha"
const description =
  "Rankings publicos por gastos parlamentares, mudancas de partido e patrimonio declarado para consulta de candidatos de 2026."

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: "/rankings",
  },
  openGraph: {
    title,
    description,
    url: "https://puxaficha.com.br/rankings",
    images: [
      {
        url: "/rankings/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Rankings tematicos",
      },
    ],
  },
  twitter: buildTwitterMetadata({
    title,
    description,
    image: "/rankings/opengraph-image",
  }),
}

export const revalidate = 3600

export default async function RankingsPage() {
  const resources = await Promise.all(
    rankingDefinitions.map((definition) => getRankingDataResource(definition.slug, "Presidente"))
  )
  const datasets = resources.map((resource) => resource.data)
  const sourceStatus = mergeSourceStatuses(...resources.map((resource) => resource.sourceStatus))
  const sourceMessage = mergeSourceMessages(...resources.map((resource) => resource.sourceMessage))
  const shareUrl = buildAbsoluteUrl("/rankings")
  const schema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Rankings tematicos",
    url: "https://puxaficha.com.br/rankings",
    description,
  }

  return (
    <div className="min-h-screen bg-background">
      <JsonLd data={schema} />
      <section className="relative overflow-hidden bg-black">
        <Image
          src="/images/hero-dossie.jpg"
          alt=""
          aria-hidden="true"
          fill
          priority
          sizes="100vw"
          className="absolute inset-0 object-cover opacity-35"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/50" />
        <div className="relative mx-auto max-w-7xl px-5 pb-14 pt-28 sm:pb-20 sm:pt-32 md:px-12 lg:pb-24 lg:pt-40">
          <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-white/80">
            Rankings
          </p>
          <h1
            className="mt-3 font-heading uppercase leading-[0.85] text-white"
            style={{ fontSize: "clamp(40px, 9vw, 96px)" }}
          >
            Tematicos
          </h1>
          <p className="mt-4 max-w-2xl text-[length:var(--text-body)] font-medium text-white/85 sm:text-[15px]">
            Ordenacoes publicas para entrar no acervo por um recorte objetivo: gastos, patrimonio e
            trajetoria partidaria.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pt-6 md:px-12">
        <DataSourceNotice status={sourceStatus} message={sourceMessage} />
      </section>

      <section className="mx-auto max-w-7xl px-5 pt-8 md:px-12">
        <div className="max-w-3xl">
          <p className="text-[length:var(--text-body)] font-medium leading-relaxed text-foreground sm:text-[15px]">
            Os rankings tematicos organizam portas de entrada por metrica publica, sem substituir a ficha
            completa nem transformar a navegacao em recomendacao politica.
          </p>
          <p className="mt-3 text-[length:var(--text-body)] font-medium leading-relaxed text-muted-foreground sm:text-[15px]">
            Se preferir outra porta de entrada, voce pode voltar para a{" "}
            <Link href="/" className="font-semibold text-foreground underline">
              home
            </Link>{" "}
            ou abrir o{" "}
            <Link href="/comparar" className="font-semibold text-foreground underline">
              comparador
            </Link>
            .
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-5 pt-8 md:px-12 sm:pt-12">
        <SlashDivider />
      </div>

      <section className="mx-auto max-w-7xl px-5 py-10 md:px-12 lg:py-14">
        <div className="grid gap-5 lg:grid-cols-3">
          {datasets.map((dataset) => (
            <RankingCard key={dataset.definition.slug} dataset={dataset} />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-8 md:px-12 lg:pb-12">
        <ShareButtons
          shareUrl={shareUrl}
          title="Rankings tematicos do Puxa Ficha"
          label="Compartilhar rankings"
        />
      </section>

      <Footer />
    </div>
  )
}

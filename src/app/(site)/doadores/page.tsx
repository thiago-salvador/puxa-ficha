import type { Metadata } from "next"
import { Suspense } from "react"
import { Footer } from "@/components/Footer"
import { DoadoresBusca, DoadoresBuscaForm } from "@/components/DoadoresBusca"
import { buildTwitterMetadata } from "@/lib/metadata"

const title = "Busca por doador | Puxa Ficha"
const description =
  "Veja em quais campanhas declaradas ao TSE um nome aparece no recorte dos maiores doadores publicados no Puxa Ficha (top 10 por campanha)."

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: "/doadores",
  },
  openGraph: {
    title,
    description,
    url: "https://puxaficha.com.br/doadores",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Puxa Ficha" }],
  },
  twitter: buildTwitterMetadata({
    title,
    description,
    image: "/opengraph-image",
  }),
}

// 2026-09-29: página estática. Era dinâmica por ler `searchParams` e
// `headers()` e rodava como função em todo hit (~22 mil por dia). O termo `?q=`
// é lido no client por `DoadoresBusca`, que consulta /api/doadores/busca (cache
// de CDN por termo, rate limit por IP nos misses).
export default function DoadoresPage() {
  return (
    <div className="min-h-screen bg-background">
      <section className="mx-auto max-w-7xl px-5 pb-6 pt-24 sm:pt-28 md:px-12 lg:pt-32">
        <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.2em] text-muted-foreground">Financiamento</p>
        <h1
          className="mt-2 font-heading uppercase leading-[0.9] text-foreground"
          style={{ fontSize: "clamp(36px, 7vw, 80px)" }}
        >
          Quem este nome financiou
        </h1>
        <p className="mt-3 max-w-3xl text-[length:var(--text-body)] font-medium leading-relaxed text-muted-foreground sm:text-[length:var(--text-body-lg)]">
          Busque um nome nas declarações de campanha publicadas no Puxa Ficha.
        </p>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-16 md:px-12" aria-label="Busca por doadores">
        <Suspense fallback={<DoadoresBuscaForm q="" />}>
          <DoadoresBusca />
        </Suspense>
      </section>

      <Footer />
    </div>
  )
}

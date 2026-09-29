import type { Metadata } from "next"
import { Suspense } from "react"
import { Footer } from "@/components/Footer"
import { DoadoresBusca, DoadoresBuscaForm } from "@/components/DoadoresBusca"
import { DOADOR_REVERSE_DISCLAIMER } from "@/lib/doador-reverse-shared"
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

// G3 (2026-09-29): página estática. Era dinâmica por ler `searchParams` e
// `headers()` e rodava como função em todo hit (~22 mil por dia). O termo `?q=`
// é lido no client por `DoadoresBusca`, que consulta /api/doadores/busca (cache
// de CDN por termo, rate limit por IP nos misses).
export default function DoadoresPage() {
  return (
    <div className="min-h-screen bg-background">
      <section className="border-b border-border bg-black text-white">
        <div className="mx-auto max-w-3xl px-5 py-16 md:px-8 md:py-20">
          <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-neutral-400">
            Financiamento
          </p>
          <h1
            className="mt-2 font-heading uppercase leading-[0.9] tracking-tight"
            style={{ fontSize: "clamp(28px, 6vw, 48px)" }}
          >
            Quem este nome financiou
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-neutral-300">
            Busca nas declarações de campanha já publicadas no Puxa Ficha. Resultados para busca semelhante ao
            termo que você digitou (grafias do TSE variam entre eleições). A busca pública é por nome; quando
            a base passar a incluir CNPJ ou identificadores derivados na declaração, isso não muda o uso
            desta página — serve para correlacionar dados na fonte, não para consulta por CPF.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-10 md:px-8 md:py-12" aria-label="Busca por doadores">
        <p className="mb-6 rounded-lg border border-border bg-secondary/40 px-4 py-3 text-[length:var(--text-body-sm)] leading-relaxed text-muted-foreground">
          {DOADOR_REVERSE_DISCLAIMER}
        </p>

        <Suspense fallback={<DoadoresBuscaForm q="" />}>
          <DoadoresBusca />
        </Suspense>
      </section>

      <Footer />
    </div>
  )
}

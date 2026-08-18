import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { SlashDivider } from "@/components/SlashDivider"
import { Footer } from "@/components/Footer"
import { BrazilMap } from "@/components/BrazilMap"
import { JsonLd } from "@/components/JsonLd"
import { PublicDataSourcesNote } from "@/components/PublicDataSourcesNote"
import { buildTwitterMetadata } from "@/lib/metadata"
import {
  getCandidatosResource,
  getIndicadoresAllEstadosResource,
} from "@/lib/api"
import {
  buildGovernadorCountByUf,
  buildIndicadoresPorEstadoForMap,
} from "@/lib/brazil-map-preview"

const title = "Governadores por estado | Puxa Ficha"
const description =
  "Consulte candidatos a governador mapeados em cada estado brasileiro. Mapa interativo com fichas públicas disponíveis."

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: "/governadores",
  },
  openGraph: {
    title,
    description,
    url: "https://puxaficha.com.br/governadores",
    images: [
      {
        url: "/governadores/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Governadores por estado",
      },
    ],
  },
  twitter: buildTwitterMetadata({
    title,
    description,
    image: "/governadores/opengraph-image",
  }),
}

export default async function GovernadoresPage() {
  const [indRes, candRes] = await Promise.all([
    getIndicadoresAllEstadosResource(),
    getCandidatosResource("Governador"),
  ])
  const indicadoresPorEstado = buildIndicadoresPorEstadoForMap(indRes.data)
  const candidatosPorEstado = buildGovernadorCountByUf(candRes.data)

  const schema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Governadores por estado",
    url: "https://puxaficha.com.br/governadores",
    description:
      "Mapa e diretório para consultar candidatos a governador mapeados por estado brasileiro.",
  }

  return (
    <div className="min-h-screen bg-background">
      <JsonLd data={schema} />
      {/* Hero */}
      <section className="relative overflow-hidden bg-black">
        <div className="absolute inset-0 opacity-30" aria-hidden="true">
          <Image
            src="/images/governadores-hero.webp"
            alt=""
            fill
            sizes="100vw"
            className="object-cover"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/50" />
        <div className="relative mx-auto max-w-7xl px-5 pb-12 pt-28 sm:pb-16 sm:pt-32 md:px-12 lg:pb-20 lg:pt-40">
          <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-white">
            Governadores
          </p>
          <h1
            className="mt-2 font-heading uppercase leading-[0.85] text-white"
            style={{ fontSize: "clamp(36px, 8vw, 80px)" }}
          >
            Por estado
          </h1>
          <p className="mt-3 max-w-lg text-[length:var(--text-body)] font-medium text-white/80 sm:text-[15px]">
            Selecione um estado pra ver candidatos a governador mapeados.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pt-8 md:px-12">
        <div className="max-w-3xl">
          <p className="text-[length:var(--text-body)] font-medium leading-relaxed text-foreground sm:text-[15px]">
            O hub de governadores organiza a busca por estado: candidatos a
            governador em todos os estados e no Distrito Federal em 2026. O mapa
            serve como índice de entrada e cada UF reúne fichas e comparador dos
            nomes publicados.
          </p>
          <p className="mt-3 text-[length:var(--text-body)] font-medium leading-relaxed text-muted-foreground sm:text-[15px]">
            Se preferir a cobertura nacional, volte para a{" "}
            <Link href="/" className="font-semibold text-foreground underline">
              home
            </Link>
            .
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-5 pt-8 md:px-12 sm:pt-12">
        <SlashDivider />
      </div>

      {/* Map + Directory */}
      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12">
        <BrazilMap
          indicadoresPorEstado={indicadoresPorEstado}
          candidatosPorEstado={candidatosPorEstado}
        />
        <div className="mt-10 max-w-3xl">
          <PublicDataSourcesNote variant="governadores" />
        </div>
      </section>

      <Footer />
    </div>
  )
}

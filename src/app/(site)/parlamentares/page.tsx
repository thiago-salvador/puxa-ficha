import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { SlashDivider } from "@/components/SlashDivider"
import { BrazilMap } from "@/components/BrazilMap"
import { Footer } from "@/components/Footer"
import { JsonLd } from "@/components/JsonLd"
import { PublicDataSourcesNote } from "@/components/PublicDataSourcesNote"
import { buildTwitterMetadata } from "@/lib/metadata"
import { getCandidatoCountByEstadoResource, getIndicadoresAllEstadosResource } from "@/lib/api"
import { buildIndicadoresPorEstadoForMap } from "@/lib/brazil-map-preview"
import { isSenadoEnabled } from "@/lib/senado-feature"

const title = "Parlamentares | Puxa Ficha"
const senadoDescription =
  "Consulte candidatos ao Senado por estado e acompanhe a ampliação da cobertura parlamentar do Puxa Ficha."
const closedDescription = "Acompanhe a ampliação da cobertura parlamentar do Puxa Ficha."

/** Com a flag do Senado desligada, nem metadata nem JSON-LD anunciam o Senado. */
function resolveDescription(senateEnabled: boolean): string {
  return senateEnabled ? senadoDescription : closedDescription
}

export function generateMetadata(): Metadata {
  const description = resolveDescription(isSenadoEnabled())
  return {
    title,
    description,
    alternates: {
      canonical: "/parlamentares",
    },
    openGraph: {
      title,
      description,
      url: "https://puxaficha.com.br/parlamentares",
      images: [
        {
          url: "/opengraph-image",
          width: 1200,
          height: 630,
          alt: "Parlamentares | Puxa Ficha",
        },
      ],
    },
    twitter: buildTwitterMetadata({
      title,
      description,
      image: "/opengraph-image",
    }),
  }
}

export default async function ParlamentaresPage() {
  const senateEnabled = isSenadoEnabled()
  const description = resolveDescription(senateEnabled)
  // Flag desligada: o mapa não aparece, então nada de consultar senadores.
  // O mapa só precisa da contagem por UF; a lista completa de senadores passava
  // de 2 MB e não cabia no Data Cache do Next.
  const [indRes, countRes] = senateEnabled
    ? await Promise.all([getIndicadoresAllEstadosResource(), getCandidatoCountByEstadoResource("Senador")])
    : [null, null]
  const indicadoresPorEstado = indRes ? buildIndicadoresPorEstadoForMap(indRes.data) : {}
  const candidatosPorEstado = countRes ? countRes.data : {}

  return (
    <div className="min-h-screen bg-background">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: senateEnabled ? "Senadores por estado" : "Parlamentares",
          url: "https://puxaficha.com.br/parlamentares",
          description,
        }}
      />
      <section className="relative overflow-hidden bg-black">
        <div className="absolute inset-0 opacity-40" aria-hidden="true">
          <Image
            src="/images/sobre-congresso.webp"
            alt=""
            fill
            sizes="100vw"
            className="object-cover"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/40" />
        <div className="relative mx-auto max-w-7xl px-5 pb-12 pt-28 sm:pb-16 sm:pt-32 md:px-12 lg:pb-20 lg:pt-40">
          <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-white">
            Parlamentares
          </p>
          <h1
            className="mt-2 font-heading uppercase leading-[0.85] text-white"
            style={{ fontSize: "clamp(36px, 8vw, 80px)" }}
          >
            Senadores
          </h1>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pt-7 sm:pt-16 md:px-12 lg:pt-20">
        <nav aria-label="Categorias parlamentares">
          <div className="section-reveal flex min-w-0 items-end justify-between gap-4 overflow-x-auto pb-px sm:overflow-visible">
            <h2 className="shrink-0 font-heading uppercase leading-[0.95] text-foreground sm:text-[clamp(22px,5vw,48px)]">
              <Link
                href="#senadores"
                aria-current="page"
                className="flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap border-b-2 border-foreground px-1 text-center text-[clamp(16px,5vw,20px)] sm:min-h-0 sm:justify-start sm:border-b-0 sm:px-0 sm:text-left sm:text-[clamp(22px,5vw,48px)]"
              >
                Senadores
              </Link>
            </h2>
            <Link
              href="/parlamentares/deputados"
              className="flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap border-b-2 border-transparent px-1 text-center font-heading text-[clamp(16px,5vw,20px)] uppercase leading-[0.95] text-muted-foreground transition-colors hover:text-foreground sm:min-h-0 sm:justify-start sm:border-b-0 sm:px-0 sm:text-left sm:text-[clamp(22px,5vw,48px)]"
            >
              Deputados
            </Link>
          </div>
        </nav>
        <SlashDivider className="mt-4 mb-6 sm:mt-8 sm:mb-10" />
      </section>

      <section id="senadores" className="mx-auto max-w-7xl px-5 py-6 sm:py-12 md:px-12">
        {senateEnabled ? (
          <BrazilMap
            indicadoresPorEstado={indicadoresPorEstado}
            candidatosPorEstado={candidatosPorEstado}
            stateRouteSuffix="/senado"
            candidateOfficeLabel="senador"
          />
        ) : (
          <p className="rounded-xl border border-border p-5 text-sm text-muted-foreground">
            A cobertura de senadores está em preparação.
          </p>
        )}
        <div className="mt-10 max-w-3xl">
          <PublicDataSourcesNote variant="parlamentares" senadoEnabled={senateEnabled} />
        </div>
      </section>

      <Footer />
    </div>
  )
}

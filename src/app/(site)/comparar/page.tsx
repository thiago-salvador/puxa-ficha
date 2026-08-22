import { Suspense, lazy } from "react"
import { getCandidatoMetadataResource, getCandidatosComparaveisResource } from "@/lib/api"
import type { Metadata } from "next"
import { SlashDivider } from "@/components/SlashDivider"
import { Footer } from "@/components/Footer"
import Image from "next/image"
const ComparadorPanel = lazy(() =>
  import("@/components/ComparadorPanel").then((m) => ({ default: m.ComparadorPanel })),
)
import { DataSourceNotice } from "@/components/DataSourceNotice"
import { JsonLd } from "@/components/JsonLd"
import { buildAbsoluteUrl, buildTwitterMetadata } from "@/lib/metadata"
import { comparadorEixoLabels, normalizeComparadorEixo } from "@/lib/comparador-axis"
import { isComparadorSlugParam, resolveComparadorCohort } from "@/lib/comparador-cohort"
import Link from "next/link"

const defaultTitle = "Comparador de candidatos | Puxa Ficha"
const defaultDescription =
  "Compare dados públicos disponíveis de 2 ou mais candidatos lado a lado: cargo, formação, patrimônio, processos, alertas graves e, quando couber, cota parlamentar."

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{
    c1?: string
    c2?: string
    c3?: string
    c4?: string
    eixo?: string
  }>
}): Promise<Metadata> {
  const sp = await searchParams
  const c1 = sp.c1?.trim()
  const c2 = sp.c2?.trim()
  const eixo = normalizeComparadorEixo(sp.eixo)

  const baseAlternates = {
    alternates: {
      canonical: "/comparar",
    },
  }

  if (!c1 || !c2) {
    return {
      title: defaultTitle,
      description: defaultDescription,
      ...baseAlternates,
      openGraph: {
        title: defaultTitle,
        description: defaultDescription,
        url: buildAbsoluteUrl("/comparar"),
        images: [
          {
            url: "/comparar/opengraph-image",
            width: 1200,
            height: 630,
            alt: "Comparador de candidatos",
          },
        ],
      },
      twitter: buildTwitterMetadata({
        title: defaultTitle,
        description: defaultDescription,
        image: "/comparar/opengraph-image",
      }),
    }
  }

  const ogSearch = new URLSearchParams()
  ogSearch.set("c1", c1)
  ogSearch.set("c2", c2)
  if (eixo !== "patrimonio") {
    ogSearch.set("eixo", eixo)
  }
  const ogImagePath = `/comparar/og?${ogSearch.toString()}`
  const eixoLabel = comparadorEixoLabels[eixo]

  const pageParams = new URLSearchParams()
  const ordered = [sp.c1, sp.c2, sp.c3, sp.c4]
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean)
  ordered.forEach((slug, i) => pageParams.set(`c${i + 1}`, slug))
  if (eixo !== "patrimonio") pageParams.set("eixo", eixo)
  const pageQuery = pageParams.toString()

  const candidateNames = await Promise.all(
    ordered.map(async (slug) => {
      try {
        const candidate = (await getCandidatoMetadataResource(slug)).data
        return candidate?.nome_urna?.trim() || slug
      } catch {
        return slug
      }
    }),
  )

  // Bloco 7 do review 2026-04-24: título reflete todos os candidatos selecionados
  // (até 4) em vez de fixar c1 x c2.
  const pairTitle = `Comparador: ${candidateNames.join(" x ")} | Puxa Ficha`
  const pairDescription = `Compare o recorte disponível de ${eixoLabel} no Puxa Ficha. Link direto com dados lado a lado.`

  return {
    title: pairTitle,
    description: pairDescription,
    ...baseAlternates,
    openGraph: {
      title: pairTitle,
      description: pairDescription,
      url: buildAbsoluteUrl(pageQuery ? `/comparar?${pageQuery}` : "/comparar"),
      images: [
        {
          url: ogImagePath,
          width: 1200,
          height: 630,
          alt: `Comparador ${eixoLabel}: ${candidateNames[0]} e ${candidateNames[1]}`,
        },
      ],
    },
    twitter: buildTwitterMetadata({
      title: pairTitle,
      description: pairDescription,
      image: ogImagePath,
    }),
  }
}

/**
 * Descobre a coorte (cargo e, quando fizer sentido, UF) a partir dos slugs
 * pedidos na URL, resolvendo os metadados de cada slug e delegando a decisao
 * para `resolveComparadorCohort` (puro e testado em
 * tests/comparador-cohort.test.ts).
 *
 * Achado da auditoria de 2026-07-24: `/comparar?c1=X&c2=Y` ignorava os slugs e
 * sempre carregava a coorte default "Presidente", entao link compartilhado de
 * dois governadores abria com os 13 presidenciáveis e nenhum dos dois
 * selecionados.
 */
async function loadComparadorCohort(slugs: readonly string[]) {
  const candidateSlugs = slugs.filter(isComparadorSlugParam)
  if (candidateSlugs.length === 0) return {}

  const metas = await Promise.all(
    candidateSlugs.map(async (slug) => (await getCandidatoMetadataResource(slug)).data),
  )
  return resolveComparadorCohort(metas)
}

export default async function CompararPage({
  searchParams,
}: {
  searchParams: Promise<{ c1?: string; c2?: string; c3?: string; c4?: string; eixo?: string }>
}) {
  const sp = await searchParams
  const slugParams = [sp.c1, sp.c2, sp.c3, sp.c4]
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .map((s) => s.trim())
  const initialSelectedSlugs = slugParams.length > 0 ? slugParams.slice(0, 4) : undefined
  const initialEixo = sp.eixo ?? null

  const cohort = await loadComparadorCohort(initialSelectedSlugs ?? [])
  const candidatosResource = await getCandidatosComparaveisResource(cohort.cargo, cohort.estado)
  const candidatos = candidatosResource.data
  const schema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Comparador de candidatos 2026",
    url: "https://puxaficha.com.br/comparar",
    description:
      "Compare dados públicos disponíveis de candidatos brasileiros mapeados para 2026.",
  }

  return (
    // Bloco 7 do review 2026-04-24: overflow-x-clip evita scroll horizontal no
    // mobile (375px) sem prejudicar popovers verticais.
    <div className="min-h-screen overflow-x-clip bg-background">
      <JsonLd data={schema} />
      {/* Hero banner */}
      <section className="relative overflow-hidden bg-black">
        <div className="absolute inset-0 opacity-35" aria-hidden="true">
          <Image
            src="/images/comparar-brutalismo.webp"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/40" />
        <div className="relative mx-auto max-w-7xl px-5 pb-12 pt-28 sm:pb-16 sm:pt-32 md:px-12 lg:pb-20 lg:pt-40">
          <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-white">
            Comparador
          </p>
          <h1
            className="mt-2 font-heading uppercase leading-[0.85] text-white"
            style={{ fontSize: "clamp(36px, 8vw, 80px)" }}
          >
            Lado a lado
          </h1>
          <p className="mt-3 max-w-lg text-[length:var(--text-body)] font-medium text-white sm:text-[15px]">
            Selecione 2 a 4 candidatos para comparar dados públicos disponíveis.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pt-6 md:px-12">
        <DataSourceNotice
          status={candidatosResource.sourceStatus}
          message={candidatosResource.sourceMessage}
        />
      </section>

      <section className="mx-auto max-w-7xl px-5 pt-8 md:px-12">
        <div className="max-w-3xl">
          <p className="text-[length:var(--text-body)] font-medium leading-relaxed text-foreground sm:text-[15px]">
            O comparador foi pensado para busca orgânica e decisão prática:
            selecionar de 2 a 4 nomes, comparar patrimônio, formação, processos e
            alertas graves, e, quando alguém do conjunto tiver o histórico, a
            cota parlamentar (CEAP/CEAPS).
          </p>
          <p className="mt-3 text-[length:var(--text-body)] font-medium leading-relaxed text-muted-foreground sm:text-[15px]">
            Se quiser navegar antes de comparar, volte para a{" "}
            <Link href="/" className="font-semibold text-foreground underline">
              home
            </Link>{" "}
            ou veja os{" "}
            <Link href="/governadores" className="font-semibold text-foreground underline">
              governadores
            </Link>
            .
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-5 pt-8 md:px-12 sm:pt-12">
        <SlashDivider />
      </div>

      <Suspense
        fallback={
          <div className="mx-auto max-w-7xl px-5 py-16 text-center text-[length:var(--text-body)] text-muted-foreground md:px-12">
            Carregando comparador...
          </div>
        }
      >
        <ComparadorPanel
          candidatos={candidatos}
          initialSelectedSlugs={initialSelectedSlugs}
          initialEixo={initialEixo}
        />
      </Suspense>

      <div className="mx-auto max-w-7xl px-5 pb-4 md:px-12">
        <p className="text-[length:var(--text-eyebrow)] font-semibold text-muted-foreground">
          Dados de fontes públicas oficiais (TSE, Câmara, Senado). Patrimônio refere-se à última
          declaração disponível. Cota parlamentar mede CEAP/CEAPS, não gasto da Presidência nem de
          governo estadual.
        </p>
      </div>

      <Footer />
    </div>
  )
}

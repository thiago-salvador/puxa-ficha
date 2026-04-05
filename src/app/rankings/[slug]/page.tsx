import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { DataSourceNotice } from "@/components/DataSourceNotice"
import { Footer } from "@/components/Footer"
import { JsonLd } from "@/components/JsonLd"
import { RankingTable } from "@/components/RankingTable"
import { ShareButtons } from "@/components/ShareButtons"
import { SlashDivider } from "@/components/SlashDivider"
import {
  getRankingDefinitionBySlug,
  rankingDefinitions,
} from "@/data/ranking-definitions"
import {
  getEstadoNome,
  getEstadoUFs,
  getRankingDataResource,
} from "@/lib/api"
import { buildAbsoluteUrl, buildTwitterMetadata } from "@/lib/metadata"
import {
  buildRankingPath,
  formatRankingMetricValue,
  normalizeRankingViewState,
  RANKING_CARGOS,
  sortRankingEntries,
} from "@/lib/rankings"

export const revalidate = 3600
export const dynamicParams = false

function buildFilterLabel(cargo: string, estado?: string): string {
  if (cargo === "Governador" && estado) {
    return `Governador em ${getEstadoNome(estado) ?? estado}`
  }

  return cargo
}

export async function generateStaticParams() {
  return rankingDefinitions.map((definition) => ({ slug: definition.slug }))
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ cargo?: string; uf?: string; ordem?: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const definition = getRankingDefinitionBySlug(slug)
  if (!definition) return {}

  const sp = await searchParams
  const view = normalizeRankingViewState({ cargo: sp.cargo, uf: sp.uf, ordem: sp.ordem })
  const estado = definition.supportsUf ? view.estado : undefined
  const filterLabel = buildFilterLabel(view.cargo, estado)
  const orderLabel = view.sortOrder === "asc" ? "Menor para maior" : "Maior para menor"
  const pagePath = buildRankingPath(slug, {
    cargo: view.cargo,
    estado,
    sortOrder: view.sortOrder,
  })
  const title = view.isFiltered
    ? `${definition.title} · ${filterLabel} · ${orderLabel} — Puxa Ficha`
    : `${definition.title} — Puxa Ficha`
  const description = view.isFiltered
    ? `${definition.contextExplanation} Recorte atual: ${filterLabel}. Ordem atual: ${orderLabel}.`
    : definition.description

  return {
    title,
    description,
    alternates: {
      canonical: `/rankings/${slug}`,
    },
    robots: view.isFiltered
      ? {
          index: false,
          follow: true,
        }
      : undefined,
    openGraph: {
      title,
      description,
      url: buildAbsoluteUrl(pagePath),
      images: [
        {
          url: `/rankings/${slug}/opengraph-image`,
          width: 1200,
          height: 630,
          alt: definition.title,
        },
      ],
    },
    twitter: buildTwitterMetadata({
      title,
      description,
      image: `/rankings/${slug}/opengraph-image`,
    }),
  }
}

export default async function RankingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ cargo?: string; uf?: string; ordem?: string }>
}) {
  const { slug } = await params
  const definition = getRankingDefinitionBySlug(slug)
  if (!definition) notFound()

  const sp = await searchParams
  const view = normalizeRankingViewState({ cargo: sp.cargo, uf: sp.uf, ordem: sp.ordem })
  const estado = definition.supportsUf ? view.estado : undefined
  const datasetResource = await getRankingDataResource(slug, view.cargo, estado)
  const dataset = {
    ...datasetResource.data,
    entries: sortRankingEntries(datasetResource.data.entries, view.sortOrder),
  }
  const ufOptions = getEstadoUFs().map((uf) => uf.toUpperCase())
  const filterLabel = buildFilterLabel(dataset.cargo, dataset.estado)
  const orderLabel = view.sortOrder === "asc" ? "Menor para maior" : "Maior para menor"
  const pagePath = buildRankingPath(slug, {
    cargo: view.cargo,
    estado: dataset.estado,
    sortOrder: view.sortOrder,
  })
  const shareUrl = buildAbsoluteUrl(pagePath)
  const shareTitle = view.isFiltered
    ? `${dataset.definition.title} · ${filterLabel} · ${orderLabel}`
    : dataset.definition.title
  const leader = dataset.entries[0]
  const leaderValue = leader
    ? formatRankingMetricValue(leader.metricValue, dataset.definition.metricUnit)
    : null
  const itemListOrder =
    view.sortOrder === "asc"
      ? "https://schema.org/ItemListOrderAscending"
      : "https://schema.org/ItemListOrderDescending"
  const schema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: shareTitle,
    url: shareUrl,
    description: dataset.definition.description,
    itemListOrder,
    numberOfItems: dataset.entries.length,
    itemListElement: dataset.entries.map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: buildAbsoluteUrl(`/candidato/${entry.candidato.slug}`),
      name: entry.candidato.nome_urna,
    })),
  }

  return (
    <div className="min-h-screen bg-background">
      <JsonLd data={schema} />
      <section className="relative overflow-hidden bg-black">
        <Image
          src="/images/comparar-brutalismo.jpg"
          alt=""
          aria-hidden="true"
          fill
          priority
          sizes="100vw"
          className="absolute inset-0 object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/50" />
        <div className="relative mx-auto max-w-7xl px-5 pb-14 pt-28 sm:pb-20 sm:pt-32 md:px-12 lg:pb-24 lg:pt-40">
          <Link
            href="/rankings"
            className="inline-flex items-center gap-2 text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-white/70 transition-colors hover:text-white"
          >
            <ArrowLeft className="size-3" />
            Rankings
          </Link>
          <div className="mt-8 max-w-4xl">
            <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-white/80">
              {dataset.definition.eyebrow}
            </p>
            <h1
              className="mt-3 font-heading uppercase leading-[0.85] text-white"
              style={{ fontSize: "clamp(38px, 8vw, 88px)" }}
            >
              {dataset.definition.title}
            </h1>
            <p className="mt-4 max-w-3xl text-[length:var(--text-body)] font-medium text-white/85 sm:text-[15px]">
              {dataset.definition.contextExplanation}
            </p>
          </div>
          <div className="mt-8 flex flex-wrap gap-6 sm:gap-10">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/75">
                Recorte atual
              </p>
              <p className="mt-1 font-heading text-[24px] uppercase leading-none text-white sm:text-[34px]">
                {filterLabel}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/75">
                Ordem
              </p>
              <p className="mt-1 font-heading text-[24px] uppercase leading-none text-white sm:text-[34px]">
                {orderLabel}
              </p>
            </div>
            {leader ? (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/75">
                  Lider
                </p>
                <p className="mt-1 font-heading text-[24px] uppercase leading-none text-white sm:text-[34px]">
                  {leader.candidato.nome_urna}
                </p>
                <p className="mt-1 text-[length:var(--text-caption)] font-semibold text-white/80">
                  {leaderValue}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pt-6 md:px-12">
        <DataSourceNotice
          status={datasetResource.sourceStatus}
          message={datasetResource.sourceMessage}
        />
      </section>

      <section className="mx-auto max-w-7xl px-5 pt-8 md:px-12">
        <div className="max-w-3xl">
          <p className="text-[length:var(--text-body)] font-medium leading-relaxed text-foreground sm:text-[15px]">
            Este ranking organiza a consulta por uma unica metrica publica. O objetivo aqui e acelerar a
            leitura do acervo, nao substituir a ficha corrida nem produzir juizo automatizado.
          </p>
          <p className="mt-3 text-[length:var(--text-body)] font-medium leading-relaxed text-muted-foreground sm:text-[15px]">
            Se quiser outra navegacao, volte ao indice de{" "}
            <Link href="/rankings" className="font-semibold text-foreground underline">
              rankings
            </Link>{" "}
            ou abra o{" "}
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

      <section className="mx-auto max-w-7xl px-5 pt-8 md:px-12">
        <div className="rounded-[24px] border border-border/60 bg-card p-5 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                Filtro
              </p>
              <h2 className="mt-2 font-heading text-[length:var(--text-heading-sm)] uppercase leading-[0.95] text-foreground">
                Ajustar recorte
              </h2>
            </div>
            {view.isFiltered ? (
              <Link
                href={`/rankings/${slug}`}
                className="text-[length:var(--text-caption)] font-semibold uppercase tracking-[0.08em] text-foreground underline"
              >
                Voltar ao ranking canonico
              </Link>
            ) : null}
          </div>
          <form method="get" className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
            <label className="block">
              <span className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                Cargo
              </span>
              <select
                name="cargo"
                defaultValue={view.cargo}
                className="mt-2 w-full rounded-[14px] border border-border bg-background px-4 py-3 text-[length:var(--text-body)] font-medium text-foreground"
              >
                {RANKING_CARGOS.map((cargo) => (
                  <option key={cargo} value={cargo}>
                    {cargo}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                UF
              </span>
              <select
                name="uf"
                defaultValue={dataset.estado ?? ""}
                className="mt-2 w-full rounded-[14px] border border-border bg-background px-4 py-3 text-[length:var(--text-body)] font-medium text-foreground"
              >
                <option value="">Brasil inteiro</option>
                {ufOptions.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                Ordem
              </span>
              <select
                name="ordem"
                defaultValue={view.sortOrder}
                className="mt-2 w-full rounded-[14px] border border-border bg-background px-4 py-3 text-[length:var(--text-body)] font-medium text-foreground"
              >
                <option value="desc">Maior para menor</option>
                <option value="asc">Menor para maior</option>
              </select>
            </label>
            <button
              type="submit"
              className="rounded-full border border-foreground px-5 py-3 text-[length:var(--text-caption)] font-bold uppercase tracking-[0.08em] text-foreground transition-colors hover:bg-foreground hover:text-background"
            >
              Aplicar
            </button>
          </form>
          {view.isFiltered ? (
            <p className="mt-4 text-[length:var(--text-caption)] font-medium text-muted-foreground">
              Este recorte por cargo e UF existe para navegacao e compartilhamento. A versao indexavel fica na rota
              canonica sem query string.
            </p>
          ) : null}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-10 md:px-12 lg:py-12">
        <RankingTable
          definition={dataset.definition}
          entries={dataset.entries}
          emptyMessage="Nenhum candidato apareceu com dados suficientes neste recorte."
        />
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-8 md:px-12">
        <ShareButtons shareUrl={shareUrl} title={shareTitle} />
      </section>

      <Footer />
    </div>
  )
}

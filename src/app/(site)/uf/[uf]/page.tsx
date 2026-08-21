import { Suspense, lazy } from "react"
import { notFound, permanentRedirect } from "next/navigation"
import Link from "next/link"
import type { Metadata } from "next"
import Image from "next/image"
import { ArrowLeft } from "lucide-react"
import {
  getCandidatosComparaveisResource,
  getCandidatosComResumoResource,
  getEstadoNome,
  getEstadoUFs,
  getIndicadoresAllEstadosResource,
  getIndicadoresEstadoResource,
  mergeSourceMessages,
  mergeSourceStatuses,
} from "@/lib/api"
import { computeStateRanking } from "@/lib/state-ranking"
import { isUncertainParty } from "@/lib/party-utils"
import { STATE_INDICATOR_CONFIG } from "@/lib/state-indicator-metadata"
import type { IndicadorEstadual } from "@/lib/types"
import { CandidatoGrid } from "@/components/CandidatoGrid"
const ComparadorPanel = lazy(() =>
  import("@/components/ComparadorPanel").then((m) => ({ default: m.ComparadorPanel })),
)
import { DataSourceNotice } from "@/components/DataSourceNotice"
import { Footer } from "@/components/Footer"
import { JsonLd } from "@/components/JsonLd"
import { SlashDivider } from "@/components/SlashDivider"
import { StateIndicators } from "@/components/StateIndicators"
import { StateRankingCards } from "@/components/StateRankingCards"
import { formatCompact } from "@/lib/utils"
import { buildTwitterMetadata } from "@/lib/metadata"

function latestIndicador(
  indicadores: IndicadorEstadual[],
  key: string
): IndicadorEstadual | null {
  const rows = indicadores
    .filter((i) => i.indicador === key && i.valor != null)
    .sort((a, b) => b.ano - a.ano)
  return rows[0] ?? null
}

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
  const u = uf.toUpperCase()
  const title = `${nome} (${u}) | Indicadores e candidatos mapeados | Puxa Ficha`
  const description = `Indicadores estaduais e candidatos a governador mapeados em ${nome} para 2026.`
  return {
    title,
    description,
    alternates: {
      canonical: `/uf/${uf.toLowerCase()}`,
    },
    openGraph: {
      title,
      description,
      url: `https://puxaficha.com.br/uf/${uf.toLowerCase()}`,
      images: [
        {
          url: `/uf/${uf.toLowerCase()}/opengraph-image`,
          width: 1200,
          height: 630,
          alt: `${nome} (${u})`,
        },
      ],
    },
    twitter: buildTwitterMetadata({
      title,
      description,
      image: `/uf/${uf.toLowerCase()}/opengraph-image`,
    }),
  }
}

export default async function UfHubPage({
  params,
}: {
  params: Promise<{ uf: string }>
}) {
  const { uf } = await params
  if (uf !== uf.toLowerCase()) permanentRedirect(`/uf/${uf.toLowerCase()}`)
  const nome = getEstadoNome(uf)
  if (!nome) notFound()

  const [
    resumosResource,
    comparaveisResource,
    indicadoresResource,
    allIndicadoresResource,
  ] = await Promise.all([
    getCandidatosComResumoResource("Governador", uf),
    getCandidatosComparaveisResource("Governador", uf),
    getIndicadoresEstadoResource(uf),
    getIndicadoresAllEstadosResource(),
  ])

  const indicadores = indicadoresResource.data
  const ranking = computeStateRanking(allIndicadoresResource.data, uf)

  const resumos = resumosResource.data
  const comparaveis = comparaveisResource.data
  // Sanitize partido fields at the boundary so the serialized RSC payload
  // Sanitizacao publica de partido_sigla/partido_atual ja acontece no resource
  // central (src/lib/api.ts via sanitizePublicPartyFields); o mapping pontual
  // que existia aqui ate o Bloco 1 foi removido.
  const candidatos = resumos.map((r) => r.candidato)

  const sourceStatus = mergeSourceStatuses(
    resumosResource.sourceStatus,
    comparaveisResource.sourceStatus,
    indicadoresResource.sourceStatus,
    allIndicadoresResource.sourceStatus
  )
  const sourceMessage = mergeSourceMessages(
    resumosResource.sourceMessage,
    comparaveisResource.sourceMessage,
    indicadoresResource.sourceMessage,
    allIndicadoresResource.sourceMessage
  )

  const processos: Record<string, number> = {}
  const patrimonios: Record<string, number | null> = {}
  for (const r of resumos) {
    processos[r.candidato.slug] = r.processos
    patrimonios[r.candidato.slug] = r.patrimonio
  }

  const totalCandidatos = candidatos.length
  const totalPatrimonio = resumos.reduce((sum, r) => sum + (r.patrimonio ?? 0), 0)
  const totalProcessos = resumos.reduce((sum, r) => sum + r.processos, 0)
  const partidos = new Set(
    candidatos.map((c) => c.partido_sigla).filter((value) => Boolean(value) && !isUncertainParty(value))
  )
  const totalPartidos = partidos.size

  const pop = latestIndicador(indicadores, "populacao_estimada")
  const pib = latestIndicador(indicadores, "pib_total")

  const showMetricsAfterCards =
    ranking.rankings.length > 0 || indicadores.length > 0
  // "Contexto territorial" saiu em 17/08, por decisão do dono. O bloco era prosa montada por
  // template a partir do ranking de indicadores, e o texto que chegava ao leitor tinha defeito
  // visível ("a media nacional situa em", sem o "se"; "2o de 27" no lugar de "2º"). Ranking de
  // estado também não é o assunto do site, que é candidato.
  //
  // A numeração das seções já previa a ausência dele, então o governo volta a ser 01 sem
  // buraco na sequência.
  const secGov = "01"

  const schema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${nome} (${uf.toUpperCase()}), indicadores e governador`,
    url: `https://puxaficha.com.br/uf/${uf.toLowerCase()}`,
    description: `Indicadores do estado e candidatos a governador mapeados em ${nome} para 2026.`,
  }

  return (
    <div className="min-h-screen bg-background">
      <JsonLd data={schema} />
      <section className="relative overflow-hidden bg-black">
        <div className="absolute inset-0 opacity-30" aria-hidden="true">
          <Image
            src="/images/governadores-hero.webp"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        </div>
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
              Estado · {uf.toUpperCase()}
            </p>
            <h1
              className="mt-4 font-heading uppercase leading-none text-white"
              style={{ fontSize: "clamp(40px, 10vw, 96px)" }}
            >
              {nome}
            </h1>
          </div>

          <div className="mt-6 flex flex-wrap gap-6 pb-4 sm:gap-12 lg:gap-20">
            {pop?.valor != null && (
              <div>
                <p className="font-heading text-[22px] leading-none tracking-tight text-white sm:text-[36px] lg:text-[48px]">
                  {STATE_INDICATOR_CONFIG.populacao_estimada.format(pop.valor)}
                </p>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white">
                  população (ref. {pop.ano})
                </p>
              </div>
            )}
            {pib?.valor != null && (
              <div>
                <p className="font-heading text-[22px] leading-none tracking-tight text-white sm:text-[36px] lg:text-[48px]">
                  {STATE_INDICATOR_CONFIG.pib_total.format(pib.valor)}
                </p>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white">
                  PIB (ref. {pib.ano})
                </p>
              </div>
            )}
            {totalCandidatos > 0 && (
              <div>
                <p className="font-heading text-[22px] leading-none tracking-tight text-white sm:text-[36px] lg:text-[48px]">
                  {totalCandidatos}
                </p>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white">
                  candidatos mapeados
                </p>
              </div>
            )}
            {totalCandidatos === 0 && pop == null && pib == null && totalPatrimonio > 0 && (
              <div>
                <p className="font-heading text-[22px] leading-none tracking-tight text-white sm:text-[36px] lg:text-[48px]">
                  {formatCompact(totalPatrimonio)}
                </p>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white">
                  patrimônio declarado
                </p>
              </div>
            )}
            {totalCandidatos === 0 &&
              pop == null &&
              pib == null &&
              totalPatrimonio === 0 &&
              totalProcessos > 0 && (
                <div>
                  <p className="font-heading text-[22px] leading-none tracking-tight text-white sm:text-[36px] lg:text-[48px]">
                    {totalProcessos}
                  </p>
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white">
                    processos
                  </p>
                </div>
              )}
            {totalCandidatos === 0 &&
              pop == null &&
              pib == null &&
              totalPatrimonio === 0 &&
              totalProcessos === 0 &&
              totalPartidos > 0 && (
                <div>
                  <p className="font-heading text-[22px] leading-none tracking-tight text-white sm:text-[36px] lg:text-[48px]">
                    {totalPartidos}
                  </p>
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white">
                    partidos
                  </p>
                </div>
              )}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pt-6 md:px-12">
        <DataSourceNotice status={sourceStatus} message={sourceMessage} />
      </section>


      {candidatos.length > 0 ? (
        <>
          <section className="mx-auto max-w-7xl px-5 pt-12 sm:pt-16 md:px-12 lg:pt-20">
            <div className="section-reveal">
              <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-foreground">
                {secGov} Governador
              </p>
              <h2
                className="mt-1 font-heading uppercase leading-[0.95] text-foreground"
                style={{ fontSize: "clamp(28px, 5vw, 48px)" }}
              >
                Candidatos em {nome}
              </h2>
            </div>
            <SlashDivider className="mt-6 mb-8 sm:mt-8 sm:mb-10" />
          </section>
          <section className="mx-auto max-w-7xl px-5 pb-8 md:px-12 lg:pb-10">
            <CandidatoGrid
              candidatos={candidatos}
              processos={processos}
              patrimonios={patrimonios}
            />
          </section>
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

      {showMetricsAfterCards && (
        <>
          <div className="mx-auto max-w-7xl px-5 pt-8 md:px-12 sm:pt-12">
            <SlashDivider />
          </div>
          <section className="mx-auto max-w-7xl px-5 pb-8 pt-8 md:px-12 sm:pb-12 sm:pt-12 lg:pb-16">
            <div className="space-y-8">
              <StateRankingCards ranking={ranking} />
              <StateIndicators indicadores={indicadores} estado={uf} />
            </div>
          </section>
        </>
      )}

      {candidatos.length > 0 && comparaveis.length >= 2 && (
        <>
          <div className="mx-auto max-w-7xl px-5 md:px-12">
            <SlashDivider />
          </div>
          <section className="mx-auto max-w-7xl px-5 pt-12 sm:pt-16 md:px-12 lg:pt-20">
            <div className="section-reveal">
              <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-foreground">
                Comparador
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
          <Suspense
            fallback={
              <div className="mx-auto max-w-7xl px-5 py-10 text-center text-muted-foreground md:px-12">
                Carregando comparador...
              </div>
            }
          >
            <ComparadorPanel candidatos={comparaveis} />
          </Suspense>
        </>
      )}

      <section className="mx-auto max-w-7xl px-5 pt-8 pb-16 md:px-12 sm:pt-12 sm:pb-20 lg:pb-24">
        <div className="max-w-3xl">
          <p className="text-[length:var(--text-body)] font-medium leading-relaxed text-foreground sm:text-[15px]">
            Hub do estado reúne contexto territorial e candidatos a governador mapeados em {nome}
            para consulta rápida e comparação.
          </p>
          <p className="mt-3 text-[length:var(--text-body)] font-medium leading-relaxed text-muted-foreground sm:text-[15px]">
            <Link href="/governadores" className="font-semibold text-foreground underline">
              Mapa de governadores
            </Link>{" "}
            ·{" "}
            <Link href="/" className="font-semibold text-foreground underline">
              Home
            </Link>
          </p>
        </div>
      </section>

      <Footer />
    </div>
  )
}

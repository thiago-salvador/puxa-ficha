import {
  getCandidatosComResumoResource,
  getCandidatosComparaveisResource,
  getFasesEleitorais2026,
  mergeSourceMessages,
  mergeSourceStatuses,
} from "@/lib/api"
import type { Metadata } from "next"
import Link from "next/link"
import { getImageProps } from "next/image"
import { Suspense, lazy } from "react"
import { preload } from "react-dom"
import { HomeQuizIntro } from "@/components/HomeQuizIntro"
import { HomeRecentUpdates } from "@/components/HomeRecentUpdates"
import { HomeRecentUpdatesData } from "@/components/HomeRecentUpdatesData"
import { PresidentialElectionSections } from "@/components/PresidentialElectionSections"
import { DeferredCandidatoGrid } from "@/components/DeferredCandidatoGrid"

// Arquivo do 1º turno: a home como estava até a votação de 04/10/2026 (origin/main antes da home do 2º turno).
// Mesmas seções e cards; a única mudança visual é a foto em preto e branco de quem não segue na disputa.
const title = "Arquivo do 1º turno das eleições 2026 | Puxa Ficha"
const description =
  "O Puxa Ficha como estava até a votação de 4 de outubro: presidenciáveis, governadores, parlamentares, programas, pesquisas e comparador. Fotos em preto e branco indicam candidaturas que não seguem na disputa."

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/1o-turno" },
  openGraph: {
    title,
    description,
    url: "https://puxaficha.com.br/1o-turno",
  },
  twitter: buildTwitterMetadata({ title, description }),
}

const ComparadorPanel = lazy(() =>
  import("@/components/ComparadorPanel").then((m) => ({ default: m.ComparadorPanel })),
)
import { SlashDivider } from "@/components/SlashDivider"
import { Footer } from "@/components/Footer"
import { DataSourceNotice } from "@/components/DataSourceNotice"
import { PublicDataSourcesNote } from "@/components/PublicDataSourcesNote"
import { JsonLd } from "@/components/JsonLd"
import { getHomeHeroMetrics } from "@/lib/home-hero-metrics"
import { isSenadoEnabled } from "@/lib/senado-feature"
import { buildCandidatoGridMaps } from "@/lib/candidato-grid-maps"
import { formatCompact } from "@/lib/utils"
import { PROCESSO_DISCIPLINAR_AVISO } from "@/lib/processos-justica-total"
import { UfResultadoSelector } from "@/components/UfResultadoSelector"
import { getEstadoNome, getEstadoUFs } from "@/lib/br-uf"
import { buildTwitterMetadata } from "@/lib/metadata"
import { comFaseEfetiva, slugsComFotoPretoEBranco } from "@/lib/finalistas-1turno"
import { rotuloAbaFinalistas, separarSecoesPorFase } from "@/lib/fase-eleitoral-publica"
import { hasResultados1Turno } from "@/lib/resultados-1turno"

export default async function PrimeiroTurnoArquivoPage() {
  const { props: heroImage } = getImageProps({
    src: "/images/hero-dossie.webp",
    alt: "",
    width: 1600,
    height: 893,
    sizes: "100vw",
    loading: "eager",
    fetchPriority: "high",
    className: "h-full w-full object-cover",
  })
  // O hero é o elemento LCP da página (veio da home de produção). Sem preload, o navegador só descobria a
  // imagem depois de ler o HTML e competir com os scripts (Lighthouse
  // mobile: 283 ms de atraso de descoberta, LCP 4,8 s). Uma dica por faixa,
  // espelhando o <picture> abaixo, para o preload não baixar a versão errada.
  preload("/images/hero-dossie-mobile.webp", { as: "image", fetchPriority: "high", media: "(max-width: 640px)" })
  preload(heroImage.src, {
    as: "image", fetchPriority: "high", media: "(min-width: 641px)",
    imageSrcSet: heroImage.srcSet, imageSizes: heroImage.sizes,
  })

  const [todosResumosResource, comparaveisResource, fasesEleitorais] = await Promise.all([
    getCandidatosComResumoResource(),
    getCandidatosComparaveisResource("Presidente"),
    getFasesEleitorais2026(),
  ])
  const todosResumos = todosResumosResource.data
  const fasePorSlug = new Map(fasesEleitorais.map((fase) => [fase.slug, fase]))
  const resumosPresidencia = todosResumos.filter(
    (resumo) => resumo.candidato.cargo_disputado === "Presidente"
  )
  // Cards e comparador como estavam até a votação: sem selo de fase e na ordem de antes. A fase efetiva
  // (banco mesclado ao snapshot do TSE) só decide qual foto fica em preto e branco.
  const comparaveis = comparaveisResource.data.map((candidato) => ({ ...candidato, fase_eleitoral_2026: null }))
  const sourceStatus = mergeSourceStatuses(
    todosResumosResource.sourceStatus,
    comparaveisResource.sourceStatus
  )
  const sourceMessage = mergeSourceMessages(
    todosResumosResource.sourceMessage,
    comparaveisResource.sourceMessage
  )

  resumosPresidencia.sort((a, b) =>
    a.candidato.nome_urna.localeCompare(b.candidato.nome_urna, "pt-BR")
  )

  const candidatos = resumosPresidencia.map((r) => ({ ...r.candidato, fase_eleitoral_2026: null }))
  const slugsFotoPB = slugsComFotoPretoEBranco(candidatos, fasePorSlug)
  const fotoPB = new Set(slugsFotoPB)
  // Grade e aba de programas por fase: finalistas em cima, quem não avançou embaixo, em P&B.
  const candidatosComFase = candidatos.map((candidato) => comFaseEfetiva(candidato, fasePorSlug))
  const secoesFase = separarSecoesPorFase(candidatosComFase)
  const abaFinalistas = secoesFase ? { rotulo: rotuloAbaFinalistas(secoesFase), slugs: secoesFase.destaque.map((c) => c.slug) } : undefined
  const resultadoEleitoralPublicado = hasResultados1Turno() || fasesEleitorais.length > 0
  const opcoesUf = getEstadoUFs().map((uf) => ({ uf: uf.toUpperCase(), label: getEstadoNome(uf) ?? uf.toUpperCase() }))
  const { processos, processosContagem, patrimonios, processSortCounts, patrimoniosAtipicos } =
    buildCandidatoGridMaps(resumosPresidencia)

  // Mesma flag que coloca os senadores em totalCandidatos (home-hero-metrics).
  const senadoEnabled = isSenadoEnabled()
  const { totalCandidatos, totalPatrimonio, totalProcessos, totalProcessosDisciplinares } =
    getHomeHeroMetrics(
      todosResumos,
      todosResumosResource.sourceStatus
    )
  const schema = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Arquivo do 1º turno | Puxa Ficha",
      url: "https://puxaficha.com.br/1o-turno",
      description:
        "Consulta pública sobre candidatos mapeados para 2026, com ficha pública, comparador e contexto editorial baseado em fontes disponíveis.",
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Candidatos à Presidência 2026",
      itemListElement: candidatos.slice(0, 12).map((candidato, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `https://puxaficha.com.br/candidato/${candidato.slug}`,
        name: candidato.nome_urna,
      })),
    },
  ]

  const fullIntro = (
    <div className="max-w-3xl">
      <p className="max-w-prose text-[length:var(--text-body)] font-medium leading-relaxed text-foreground sm:text-[15px]">
        O Puxa Ficha organiza fontes públicas consultadas, como TSE,
        Câmara e Senado, para ajudar quem busca entender os candidatos à
        Presidência e aos governos de todos os estados e do Distrito Federal
        {senadoEnabled ? ", além das candidaturas ao Senado," : ""} em 2026.
      </p>
      <p className="mt-3 max-w-prose text-[length:var(--text-body)] font-medium leading-relaxed text-muted-foreground sm:text-[15px]">
        Aqui você encontra ficha pública, comparação lado a lado e uma
        navegação mais rápida por nome, partido e estado. Se quiser atalhos
        imediatos, você pode ir para{" "}
        <Link href="/comparar" className="font-semibold text-foreground underline">
          comparar
        </Link>

        {" "}ou abrir o mapa de{" "}
        <Link href="/governadores" className="font-semibold text-foreground underline">
          governadores
        </Link>
        .
      </p>
    </div>
  )

  return (
    <div className="min-h-screen bg-background">
      <JsonLd data={schema} />
      {/* Hero — dossiê image background */}
      <section className="relative overflow-hidden bg-black">
        {/* Background image */}
        <div className="absolute inset-0 opacity-40" aria-hidden="true">
          <picture>
            <source media="(max-width: 640px)" srcSet="/images/hero-dossie-mobile.webp" />
            <img {...heroImage} alt={heroImage.alt} />
          </picture>
        </div>
        {/* Gradient overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/50" />

        <div className="relative mx-auto max-w-7xl px-5 pb-8 pt-20 sm:pb-20 sm:pt-32 md:px-12 lg:pb-24 lg:pt-40">
          {/* Massive title */}
          <h1
            className="hero-fade font-heading text-[clamp(60px,17vw,100px)] uppercase leading-[0.85] tracking-[-0.02em] text-white sm:text-[clamp(100px,31vw,200px)]"
            style={{ animationDelay: "0.1s" }}
          >
            Puxa Ficha
          </h1>

          {/* Slash divider */}
          <SlashDivider className="hero-fade my-3 sm:my-6 lg:my-8" color="text-white" />

          {/* Label */}
          <p className="hero-fade text-[length:var(--text-eyebrow)] font-semibold uppercase tracking-[0.15em] text-white" style={{ animationDelay: "0.3s" }}>
            Eleições 2026
          </p>

          {/* Data bar */}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 pb-2 sm:mt-6 sm:gap-12 sm:pb-4 lg:gap-20">
            {totalCandidatos !== null && (
              <div className="hero-fade" style={{ animationDelay: "0.4s" }}>
                <p className="font-heading text-[length:var(--text-heading-sm)] leading-none tracking-tight text-white sm:text-[length:var(--text-heading-lg)] lg:text-[48px]">
                  {totalCandidatos}
                </p>
                <p className="mt-1 text-[length:var(--text-eyebrow)] font-semibold uppercase tracking-[0.12em] text-white">
                  candidatos mapeados
                </p>
              </div>
            )}
            {totalPatrimonio !== null && totalPatrimonio > 0 && (
              <div className="hero-fade" style={{ animationDelay: "0.5s" }}>
                <p className="font-heading text-[length:var(--text-heading-sm)] leading-none tracking-tight text-white sm:text-[length:var(--text-heading-lg)] lg:text-[48px]">
                  {formatCompact(totalPatrimonio)}
                </p>
                <p className="mt-1 text-[length:var(--text-eyebrow)] font-semibold uppercase tracking-[0.12em] text-white">
                  patrimônio declarado
                </p>
              </div>
            )}
            {totalProcessos !== null && totalProcessos > 0 && (
              <div className="hero-fade" style={{ animationDelay: "0.6s" }}>
                <p className="font-heading text-[length:var(--text-heading-sm)] leading-none tracking-tight text-white sm:text-[length:var(--text-heading-lg)] lg:text-[48px]">
                  <span data-pf-hero-processos={totalProcessos}>{totalProcessos}</span>
                </p>
                <p className="mt-1 text-[length:var(--text-eyebrow)] font-semibold uppercase tracking-[0.12em] text-white">
                  processos
                </p>
                {totalProcessosDisciplinares !== null && totalProcessosDisciplinares > 0 && (
                  <p data-pf-hero-processos-disciplinares={totalProcessosDisciplinares} className="mt-1 text-[length:var(--text-eyebrow)] font-medium leading-tight text-white/80">
                    inclui {totalProcessosDisciplinares} disciplinares
                  </p>
                )}
              </div>
            )}
          </div>
          {totalProcessos !== null && totalProcessosDisciplinares !== null && totalProcessosDisciplinares > 0 && (
            <p className="hero-fade max-w-prose text-[length:var(--text-eyebrow)] font-medium leading-snug text-white/80" style={{ animationDelay: "0.7s" }}>
              Processos somam judiciais e disciplinares dos Conselhos de Ética da Câmara e do Senado. {PROCESSO_DISCIPLINAR_AVISO}
            </p>
          )}
        </div>
      </section>

      <section aria-label="Sobre o arquivo do 1º turno" data-pf-arquivo-1turno="" className="border-b border-border bg-secondary/30">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between md:gap-8 md:px-12">
          <p className="max-w-prose text-[length:var(--text-body-sm)] font-medium leading-relaxed text-foreground">
            <strong className="font-bold">Arquivo do 1º turno:</strong> o site como estava até a votação de 4 de outubro.
            {slugsFotoPB.length > 0 && " Fotos em preto e branco: candidaturas que não seguem na disputa."}{" "}
            <Link href="/" className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4 sm:min-h-0">
              Ver o 2º turno
            </Link>
          </p>
          <div className="shrink-0">
            <UfResultadoSelector options={opcoesUf} basePath="/1o-turno" rotulo="Resultado por estado" compacto />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pt-3 sm:pt-6 md:px-12">
        <DataSourceNotice status={sourceStatus} message={sourceMessage} />
      </section>

      <section className="mx-auto max-w-7xl px-5 pt-4 sm:pt-8 md:px-12 lg:pt-10">
        <p className="max-w-prose text-[15px] font-medium leading-relaxed text-foreground sm:hidden">
          Consulte candidatos e compare suas fichas públicas. Veja{" "}
          <Link href="/metodologia" className="font-semibold underline underline-offset-4">
            Como funciona
          </Link>
          .
        </p>
        <div className="hidden sm:block">{fullIntro}</div>
      </section>

      {/* Section header */}
      <section id="candidatos" className="scroll-mt-20 mx-auto max-w-7xl px-5 pt-7 sm:pt-16 md:px-12 lg:pt-20">
        <nav aria-label="Categorias de candidatos">
          <div className="section-reveal flex min-w-0 items-end gap-3 overflow-x-auto pb-px sm:flex-wrap sm:justify-between sm:gap-x-4 sm:gap-y-1 sm:overflow-visible">
            <h2 className="shrink-0 font-heading uppercase leading-[0.95] text-foreground sm:text-[clamp(22px,5vw,48px)]">
              <Link
                href="#candidatos"
                aria-current="page"
                className="flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap border-b-2 border-foreground px-1 text-center text-[clamp(16px,4.8vw,20px)] sm:min-h-0 sm:justify-start sm:border-b-0 sm:px-0 sm:text-left sm:text-[clamp(22px,5vw,48px)]"
              >
                Presidenciáveis
              </Link>
            </h2>
            <Link
              href="/governadores"
              className="flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap border-b-2 border-transparent px-1 text-center font-heading text-[clamp(16px,4.8vw,20px)] uppercase leading-[0.95] text-muted-foreground transition-colors hover:text-foreground sm:min-h-0 sm:justify-start sm:border-b-0 sm:px-0 sm:text-left sm:text-[clamp(22px,5vw,48px)]"
            >
              Governadores
            </Link>
            <Link
              href="/parlamentares"
              className="flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap border-b-2 border-transparent px-1 text-center font-heading text-[clamp(16px,4.8vw,20px)] uppercase leading-[0.95] text-muted-foreground transition-colors hover:text-foreground sm:min-h-0 sm:justify-start sm:border-b-0 sm:px-0 sm:text-left sm:text-[clamp(22px,5vw,48px)]"
            >
              Parlamentares
            </Link>
          </div>
        </nav>
        <SlashDivider className="mt-6 mb-8 sm:mt-8 sm:mb-10" />
      </section>

      {/* Candidate grid */}
      <section className="mx-auto max-w-7xl px-5 pb-16 md:px-12 lg:pb-20">
        <DeferredCandidatoGrid
          candidatos={candidatosComFase}
          secoesPorFase
          processos={processos}
          processosContagem={processosContagem}
          patrimonios={patrimonios}
          processSortCounts={processSortCounts}
          patrimoniosAtipicos={patrimoniosAtipicos}
          slugsFotoPB={slugsFotoPB}
        />
      </section>

      <Suspense fallback={<p role="status" className="mx-auto max-w-7xl px-5 py-12 text-sm text-muted-foreground md:px-12">Carregando programas e pesquisas...</p>}>
        <PresidentialElectionSections candidates={candidatos.map(({ slug, nome_urna, foto_url, partido_sigla }) => ({ slug, nome_urna, foto_url, partido_sigla, ...(fotoPB.has(slug) ? { foto_pb: true } : {}) }))} unavailable={todosResumosResource.sourceStatus !== "live"} resultadoEleitoralPublicado={resultadoEleitoralPublicado} abaFinalistas={abaFinalistas} />
      </Suspense>

      <Suspense fallback={<HomeRecentUpdates />}>
        <HomeRecentUpdatesData />
      </Suspense>
      <HomeQuizIntro />

      {/* Comparador */}
      {comparaveis.length >= 2 && (
        <>
          <div className="mx-auto max-w-7xl px-5 md:px-12">
            <SlashDivider />
          </div>
          <section className="mx-auto max-w-7xl px-5 pt-12 sm:pt-16 md:px-12 lg:pt-20">
            <div className="section-reveal">
              <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-foreground">
                03 Comparador
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
          <Suspense fallback={<div className="mx-auto max-w-7xl px-5 md:px-12"><div className="h-96 animate-pulse rounded-xl bg-muted" /></div>}>
            <ComparadorPanel candidatos={comparaveis} referenceNow={new Date().toISOString()} slugsFotoPB={slugsFotoPB} />
          </Suspense>
        </>
      )}

      <section className="mx-auto max-w-7xl px-5 py-10 md:px-12 lg:py-14">
        <PublicDataSourcesNote variant="presidencia" />
      </section>

      <Footer />
    </div>
  )
}

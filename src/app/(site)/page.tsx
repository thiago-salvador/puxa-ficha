// cspell:ignore aliancas legivel profissoes
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
import { Suspense } from "react"
import { preload } from "react-dom"
import { ArrowRight } from "lucide-react"
import { HomeQuizIntro } from "@/components/HomeQuizIntro"
import { HomeRecentUpdates } from "@/components/HomeRecentUpdates"
import { HomeRecentUpdatesData } from "@/components/HomeRecentUpdatesData"
import { PresidentialElectionSections } from "@/components/PresidentialElectionSections"
import { SlashDivider } from "@/components/SlashDivider"
import { Footer } from "@/components/Footer"
import { DataSourceNotice } from "@/components/DataSourceNotice"
import { PublicDataSourcesNote } from "@/components/PublicDataSourcesNote"
import { JsonLd } from "@/components/JsonLd"
import { RevelarBarras } from "@/components/RevelarBarras"
import { HomeHero2026 } from "@/components/HomeHero2026"
import { ResultadoPreviaBanner, TituloSecao } from "@/components/Resultado1TurnoPartes"
import { Resultado1TurnoEstados } from "@/components/Resultado1TurnoEstados"
import { GovernadoresEleitos1Turno } from "@/components/GovernadoresEleitos1Turno"
import { EspectroEleitos1Turno } from "@/components/EspectroEleitos1Turno"
import { UfResultadoSelector } from "@/components/UfResultadoSelector"
import { LadoALado2Turno, Pesquisas2Turno } from "@/components/SegundoTurnoPresidente"
import { Governadores2Turno } from "@/components/SegundoTurnoGovernadores"
import { MapaPresidente1Turno } from "@/components/MapaPresidente1Turno"
import { FaixaFixa2Turno } from "@/components/FaixaFixa2Turno"
import { Aliancas2TurnoSecao } from "@/components/Aliancas2Turno"
import { getAliancas2Turno } from "@/lib/aliancas-2turno"
import { getHomeHeroMetrics } from "@/lib/home-hero-metrics"
import { numerosHero1Turno } from "@/lib/home-eleicao-2026"
import { isSenadoEnabled } from "@/lib/senado-feature"
import { buildCandidatoGridMaps } from "@/lib/candidato-grid-maps"
import { comFaseEfetiva, recortarFinalistas } from "@/lib/finalistas-1turno"
import { linkCompararFinalistas } from "@/lib/fase-eleitoral-publica"
import { formatarPercentual, getDisputa1Turno, getResultados1Turno, hasResultados1Turno } from "@/lib/resultados-1turno"
import { getReferencia2022 } from "@/lib/referencia-2022"
import { IMAGEM_DUELO_PATH, nomeLegivel } from "@/lib/compartilhar-duelo"
import { carregarFotos1Turno } from "@/lib/fotos-1turno"
import { loadPresidentialPolls } from "@/lib/presidential-election-sections"
import { finalistasDaDisputa, selecionarPesquisasDoConfronto, slugsDoSegundoTurno } from "@/lib/segundo-turno-2026"
import { getEstadoNome, getEstadoUFs } from "@/lib/br-uf"
import { buildAbsoluteUrl, buildTwitterMetadata } from "@/lib/metadata"
import type { StatePollScenario } from "@/lib/state-polls"

// Página única da eleição desde 05/10/2026: o hero preto volta ao topo com o 2º turno. /1o-turno é o arquivo
// (o site como estava até a votação) e cada estado tem o resultado em /1o-turno/{uf}.
const title = "Puxa Ficha | 2º turno das eleições 2026"
const description =
  "Presidente e governadores no 2º turno de 25 de outubro: resultado do 1º turno, pesquisas, comparação lado a lado e a ficha pública de cada finalista, com fontes oficiais."

// Card do duelo gerado do snapshot do TSE (src/app/(site)/og/segundo-turno); sem finalistas, a rota cai no card editorial.
export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/" },
  openGraph: {
    title,
    description,
    url: "https://puxaficha.com.br",
    images: [{ url: IMAGEM_DUELO_PATH, width: 1200, height: 630, alt: "Os dois finalistas à Presidência no 2º turno, com o resultado do 1º turno" }],
  },
  twitter: buildTwitterMetadata({ title, description, image: IMAGEM_DUELO_PATH }),
}

const LINK_SETA =
  "inline-flex min-h-11 items-center gap-1 whitespace-nowrap text-[length:var(--text-body-sm)] font-bold underline underline-offset-4 hover:text-[var(--gray-600)]"

function pesquisasPresidenciais(): StatePollScenario[] {
  // O catálogo falha fechado com JSON inválido; aqui isso só esconde as pesquisas do 2º turno.
  try {
    return loadPresidentialPolls()
  } catch {
    return []
  }
}

export default async function Home() {
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
  // O hero é o elemento LCP da home. Sem preload, o navegador só descobria a
  // imagem depois de ler o HTML e competir com os scripts (Lighthouse
  // mobile: 283 ms de atraso de descoberta, LCP 4,8 s). Uma dica por faixa,
  // espelhando o <picture> do hero, para o preload não baixar a versão errada.
  preload("/images/hero-dossie-mobile.webp", { as: "image", fetchPriority: "high", media: "(max-width: 640px)" })
  preload(heroImage.src, {
    as: "image", fetchPriority: "high", media: "(min-width: 641px)",
    imageSrcSet: heroImage.srcSet, imageSizes: heroImage.sizes,
  })

  const [todosResumosResource, comparaveisResource, fasesEleitorais, fotos] = await Promise.all([
    getCandidatosComResumoResource(),
    getCandidatosComparaveisResource("Presidente"),
    getFasesEleitorais2026(),
    carregarFotos1Turno(["Presidente", "Governador", "Senador"]),
  ])
  const todosResumos = todosResumosResource.data
  const fasePorSlug = new Map(fasesEleitorais.map((fase) => [fase.slug, fase]))
  const todosCandidatos = todosResumos.map((resumo) => comFaseEfetiva(resumo.candidato, fasePorSlug))
  const resumosPresidencia = todosResumos.filter(
    (resumo) => resumo.candidato.cargo_disputado === "Presidente"
  )
  const comparaveis = comparaveisResource.data
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

  const candidatos = resumosPresidencia.map((r) => todosCandidatos.find((candidato) => candidato.id === r.candidato.id) ?? r.candidato)
  // Com resultado do 1º turno publicado, o recorte fica só com os finalistas (JSON-LD,
  // lado a lado e link do comparador). Sem resultado, mostra todos.
  const { candidatos: candidatosGrade } = recortarFinalistas(candidatos)
  const { processos, processosContagem, patrimonios, patrimoniosAtipicos } =
    buildCandidatoGridMaps(resumosPresidencia)
  // Contagem de pontos de atenção só com a lista ao vivo: no fallback ela vem zerada e viraria "nenhum".
  const pontosAtencao =
    todosResumosResource.sourceStatus === "live"
      ? Object.fromEntries(resumosPresidencia.map((r) => [r.candidato.slug, r.pontos_atencao]))
      : null

  const resultados = getResultados1Turno()
  const temResultado = hasResultados1Turno(resultados)
  const presidente = temResultado ? getDisputa1Turno("Presidente", "BR", resultados) : null
  const finalistasPresidente = finalistasDaDisputa(presidente)
  // Arquivo de alianças validado contra o snapshot; inválido, a seção e as linhas de apoio somem.
  const aliancas = temResultado ? getAliancas2Turno(resultados) : null
  const compararPresidente = linkCompararFinalistas(candidatosGrade)
  const slugsFinalistas = finalistasPresidente?.[0].slug && finalistasPresidente[1].slug
    ? ([finalistasPresidente[0].slug, finalistasPresidente[1].slug] as [string, string])
    : null
  // Limite alto: a tendência usa todas as pesquisas do confronto; a lista mostra só as seis mais recentes.
  const pesquisas2Turno = slugsFinalistas ? selecionarPesquisasDoConfronto(pesquisasPresidenciais(), slugsFinalistas, 60) : []
  // Programas só dos dois finalistas à Presidência; sem o par publicado, todos os candidatos.
  const candidatosProgramas = slugsFinalistas
    ? candidatos.filter((candidato) => slugsFinalistas.includes(candidato.slug))
    : candidatos
  // Atualizações recentes só de quem segue na disputa (Presidente e governadores), lido do snapshot.
  const slugsSegundoTurno = temResultado ? slugsDoSegundoTurno(resultados) : []
  const profissoesFinalistas = Object.fromEntries(
    candidatosProgramas.map((candidato) => [candidato.slug, candidato.profissao_declarada ?? null]),
  )
  const ufs = getEstadoUFs()
  const opcoesUf = ufs.map((uf) => ({ uf: uf.toUpperCase(), label: getEstadoNome(uf) ?? uf.toUpperCase() }))
  const referenceNow = new Date().toISOString()

  // Mesma flag que coloca os senadores em totalCandidatos (home-hero-metrics).
  const senadoEnabled = isSenadoEnabled()
  const heroMetricas = getHomeHeroMetrics(
    todosResumos,
    todosResumosResource.sourceStatus
  )
  const schema = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Puxa Ficha",
      url: "https://puxaficha.com.br",
      description:
        "Consulta pública sobre candidatos mapeados para 2026, com ficha pública, comparador e contexto editorial baseado em fontes disponíveis.",
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Candidatos à Presidência 2026",
      itemListElement: candidatosGrade.slice(0, 12).map((candidato, index) => ({
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
      {/* Filho direto de "main > div": o Navbar reconhece a faixa preta e fica transparente sobre ela. */}
      <HomeHero2026
        imagem={heroImage}
        temResultado={temResultado}
        presidente={presidente}
        fotos={fotos}
        pesquisa={pesquisas2Turno[0] ?? null}
        numeros={numerosHero1Turno(resultados, getReferencia2022())}
        metricas={heroMetricas}
        ufs={opcoesUf}
        referenceNow={referenceNow}
        compararHref={presidente && finalistasPresidente ? "#lado-a-lado" : null}
        compartilhar={finalistasPresidente ? { url: buildAbsoluteUrl("/") } : null}
        fonte2022={{ pagina: getReferencia2022().fonte.pagina }}
      />
      {finalistasPresidente && (
        <FaixaFixa2Turno
          finalistas={[
            { nome: nomeLegivel(finalistasPresidente[0].nome_urna), percentual: formatarPercentual(finalistasPresidente[0].percentual_validos) },
            { nome: nomeLegivel(finalistasPresidente[1].nome_urna), percentual: formatarPercentual(finalistasPresidente[1].percentual_validos) },
          ]}
          referenceNow={referenceNow}
          href="#lado-a-lado"
        />
      )}

      {sourceStatus !== "live" && (
        <section className="mx-auto max-w-7xl px-5 pt-6 md:px-12">
          <DataSourceNotice status={sourceStatus} message={sourceMessage} />
        </section>
      )}

      {temResultado && (
        <div id="candidatos" className="mx-auto max-w-7xl scroll-mt-20 space-y-16 px-5 py-12 sm:space-y-20 sm:py-16 md:px-12">
          <ResultadoPreviaBanner data={resultados} />

          {presidente && (
            <LadoALado2Turno
              disputa={presidente}
              fotos={fotos}
              processos={processos}
              processosContagem={processosContagem}
              patrimonios={patrimonios}
              patrimoniosAtipicos={patrimoniosAtipicos}
              pontosAtencao={pontosAtencao}
              compararHref={compararPresidente}
              comparaveis={comparaveis}
              profissoes={profissoesFinalistas}
            />
          )}
          {presidente && aliancas && <Aliancas2TurnoSecao aliancas={aliancas} disputa={presidente} />}
          <div>
            {finalistasPresidente && (
              <Pesquisas2Turno
                linhas={pesquisas2Turno}
                nomes={[finalistasPresidente[0].nome_urna, finalistasPresidente[1].nome_urna]}
                partidos={[finalistasPresidente[0].partido, finalistasPresidente[1].partido]}
              />
            )}
            {(resultados.presidente_por_uf?.length ?? 0) > 0 && (
              <div className="mt-16 sm:mt-20">
                <MapaPresidente1Turno data={resultados} />
              </div>
            )}
            <p className="mt-2">
              <Link href="/1o-turno" className={LINK_SETA}>
                Arquivo do 1º turno <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </p>
          </div>

          <div className="space-y-12">
            <Governadores2Turno candidatos={todosCandidatos} fotos={fotos} data={resultados} aliancas={aliancas} />
            <GovernadoresEleitos1Turno ufs={ufs} data={resultados} fotos={fotos} resumos={todosResumos} />
            <Resultado1TurnoEstados ufs={ufs} data={resultados} fotos={fotos} blocos={["sem-dado"]} />
          </div>

          <section id="senado-1turno" className="scroll-mt-24" aria-labelledby="senado-1turno-titulo">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <TituloSecao titulo="Senado" id="senado-1turno-titulo">
                As duas vagas de cada estado foram decididas no 1º turno.
              </TituloSecao>
              <div className="w-full max-w-sm">
                <UfResultadoSelector options={opcoesUf} basePath="/1o-turno" />
              </div>
            </div>
            <SlashDivider className="mb-8 mt-6" />
            <Resultado1TurnoEstados ufs={ufs} data={resultados} fotos={fotos} blocos={["senado"]} />
          </section>

          <EspectroEleitos1Turno data={resultados} />
        </div>
      )}
      <RevelarBarras />

      <Suspense fallback={<p role="status" className="mx-auto max-w-7xl px-5 py-12 text-sm text-muted-foreground md:px-12">Carregando programas...</p>}>
        {/* Sem "A evolução da disputa": a home do 2º turno já tem as pesquisas do confronto. */}
        <PresidentialElectionSections candidates={candidatosProgramas.map(({ slug, nome_urna, foto_url, partido_sigla }) => ({ slug, nome_urna, foto_url, partido_sigla }))} unavailable={todosResumosResource.sourceStatus !== "live"} resultadoEleitoralPublicado={todosCandidatos.some((candidato) => Boolean(candidato.fase_eleitoral_2026))} mostrarPesquisas={false} />
      </Suspense>

      {/* No 2º turno a seção só aparece com mudança verificada: sem fallback, para não piscar o estado vazio. */}
      <Suspense fallback={slugsSegundoTurno.length > 0 ? null : <HomeRecentUpdates escopo="todos" />}>
        <HomeRecentUpdatesData slugs={slugsSegundoTurno.length > 0 ? slugsSegundoTurno : undefined} />
      </Suspense>
      <HomeQuizIntro />

      <section className="mx-auto max-w-7xl px-5 pt-8 sm:pt-10 md:px-12">
        <p className="max-w-prose text-[15px] font-medium leading-relaxed text-foreground sm:hidden">
          Consulte candidatos e compare suas fichas públicas. Veja{" "}
          <Link href="/metodologia" className="font-semibold underline underline-offset-4">
            Como funciona
          </Link>
          .
        </p>
        <div className="hidden sm:block">{fullIntro}</div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-10 md:px-12 lg:py-14">
        <PublicDataSourcesNote variant="presidencia" />
      </section>

      <Footer />
    </div>
  )
}

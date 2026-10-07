// cspell:ignore recolhivel acessivel creditos
import type { ComponentProps } from "react"
import Image, { getImageProps } from "next/image"
import Link from "next/link"
import { ArrowRight, ArrowUpRight } from "lucide-react"
import { formatarPercentual, formatarVotos, type CandidatoResultado1Turno, type DisputaResultado1Turno } from "@/lib/resultados-1turno"
import { dividirVotosValidos, fotoDe, larguraBarra, type FotosCandidatos } from "@/lib/resultados-1turno-vista"
import { coresDosFinalistas } from "@/lib/cores-finalistas"
import { retratoHero, type RetratoHero } from "@/lib/hero-retratos-2turno"
import { finalistasDaDisputa, formatarData2Turno, formatarDataPesquisa, type Pesquisa2TurnoLinha } from "@/lib/segundo-turno-2026"
import type { NumeroHero1Turno } from "@/lib/home-eleicao-2026"
import type { HomeHeroMetrics } from "@/lib/home-hero-metrics"
import { PROCESSO_DISCIPLINAR_AVISO } from "@/lib/processos-justica-total"
import { formatCompact, safeHref } from "@/lib/utils"
import { ContagemSegundoTurno } from "@/components/ContagemSegundoTurno"
import { SlashDivider } from "@/components/SlashDivider"
import { UfResultadoSelector } from "@/components/UfResultadoSelector"
import { RecolhivelNoCelular } from "@/components/RecolhivelNoCelular"
import { CompartilharDuelo } from "@/components/CompartilharDuelo"

const ROTULO_ESCURO = "text-[length:var(--text-eyebrow)] font-semibold uppercase tracking-[0.12em] text-white"
const TEXTO_APOIO = "text-[length:var(--text-caption)] font-medium tabular-nums text-white/80"
const LINK_ESCURO =
  "inline-flex min-h-11 items-center gap-1 whitespace-nowrap text-[length:var(--text-body-sm)] font-bold text-white underline underline-offset-4 hover:text-white/80"

/**
 * Passa pelo otimizador do Next (/_next/image), que valida o host do Wikimedia no servidor. O
 * carregador explícito evita a checagem de host no render, que falha fora do app (testes).
 */
const MASCARA_BASE = "linear-gradient(to bottom, #000 0%, #000 55%, rgba(0,0,0,0.6) 78%, rgba(0,0,0,0.2) 92%, transparent 100%)"

function carregadorOtimizado({ src, width, quality }: { src: string; width: number; quality?: number }): string {
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${quality ?? 75}`
}

/**
 * Retrato do finalista (do lg em diante), cobrindo metade da parte de cima. A foto tem a altura da
 * área e a própria proporção; o centro do rosto cai no meio do vão entre a borda da tela e o começo
 * do duelo (largura min(40rem, 48vw), centrada), então o rosto nunca fica sob o texto. O resto da
 * imagem some aos poucos até o meio da tela.
 */
function RetratoFundo({ retrato, fotoFicha, lado }: { retrato: RetratoHero | null; fotoFicha: string | null; lado: "esquerda" | "direita" }) {
  const src = retrato?.url ?? fotoFicha
  if (!src) return null
  // Sem retrato largo, a foto da ficha (3:4) com o rosto no centro.
  const proporcao = retrato ? retrato.largura / retrato.altura : 3 / 4
  const rostoX = retrato ? retrato.rosto_x : 0.5
  const escala = retrato ? retrato.escala : 1
  const rostoLargura = retrato ? retrato.rosto_largura : 0.4
  const esquerda = lado === "esquerda"
  // Unidades do contêiner: 100cqw = metade da tela, 100cqh = altura da área.
  const alvo = esquerda ? "(50cqw - min(40rem, 48vw) / 4)" : "(50cqw + min(40rem, 48vw) / 4)"
  const mascaraMetade = `linear-gradient(${esquerda ? "to right" : "to left"}, #000 0%, #000 42%, rgba(0,0,0,0.55) 70%, rgba(0,0,0,0.18) 88%, transparent 100%)`
  // Distância do centro do rosto até o texto (metade do vão). A altura da foto é limitada para a
  // metade do rosto caber nela com 24px de folga: em tela estreita a foto encolhe em vez de invadir.
  const vao = "(50cqw - min(40rem, 48vw) / 4)"
  const altura = `min(${escala * 100}cqh, calc((${vao} - 24px) / ${((rostoLargura / 2) * proporcao).toFixed(4)}))`
  // A própria foto também some na borda que aponta para o centro e embaixo: nunca aparece um corte reto.
  const lateralFoto = `linear-gradient(${esquerda ? "to right" : "to left"}, #000 0%, #000 62%, transparent 100%)`
  const baseFoto = "linear-gradient(to bottom, #000 0%, #000 82%, transparent 100%)"
  const imagemRetrato = getImageProps({
    src,
    alt: "",
    width: retrato?.largura ?? 960,
    height: retrato?.altura ?? 1280,
    priority: true,
    loader: carregadorOtimizado,
    // Foto horizontal aparece quase na largura da tela; retrato vertical, em pouco mais da metade.
    sizes: proporcao > 1.2 ? "(min-width: 1024px) 100vw, 1px" : "(min-width: 1024px) 60vw, 1px",
  }).props
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-y-0 hidden w-1/2 overflow-hidden [container-type:size] lg:block ${esquerda ? "left-0" : "right-0"}`}
      style={{
        // Lateral (some até o centro) somada à vertical (some até a barra dos votos): sem corte reto embaixo.
        maskImage: `${mascaraMetade}, ${MASCARA_BASE}`,
        WebkitMaskImage: `${mascaraMetade}, ${MASCARA_BASE}`,
        maskComposite: "intersect",
        WebkitMaskComposite: "source-in",
      }}
      data-pf-hero-retrato={lado}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- atributos do getImageProps (otimizador do Next), montados no servidor */}
      <img
        {...imagemRetrato}
        alt=""
        className="absolute top-0 max-w-none"
        style={{
          ["--pf-altura" as string]: altura,
          height: "var(--pf-altura)",
          width: "auto",
          left: `calc(${alvo} - ${(rostoX * proporcao).toFixed(4)} * var(--pf-altura))`,
          maskImage: `${lateralFoto}, ${baseFoto}`,
          WebkitMaskImage: `${lateralFoto}, ${baseFoto}`,
          maskComposite: "intersect",
          WebkitMaskComposite: "source-in",
        }}
        data-pf-hero-retrato-img=""
      />
    </div>
  )
}

function nomeCurto(nome: string): boolean {
  return !/\s/.test(nome.trim()) && nome.trim().length <= 6
}

// As seis linhas de cada finalista entram na grade do duelo (subgrid): rótulo, %, votos e link
// ficam na mesma altura dos dois lados, mesmo quando um nome quebra em duas linhas e o outro não.
function FinalistaHero({ candidato, cor, coluna, foto }: { candidato: CandidatoResultado1Turno; cor: string; coluna: "col-start-1" | "col-start-3"; foto: string | null }) {
  return (
    <div className={`${coluna} row-span-6 row-start-1 grid min-w-0 grid-rows-subgrid`} data-pf-finalista-1turno={candidato.sq}>
      <div className="self-end">
        {/* Abaixo do lg a foto vem acima do nome, nunca atrás do texto. */}
        {foto && (
          <div aria-hidden="true" className="relative mb-3 aspect-square w-full max-w-[180px] overflow-hidden lg:hidden" data-pf-hero-foto-celular>
            {/* Escondida do lg em diante (lá entra o RetratoFundo): sizes de 1px e sem preload, para o
                desktop não baixar estas fotos junto com os retratos largos. */}
            <Image src={foto} alt="" fill loading="eager" sizes="(min-width: 1024px) 1px, (min-width: 640px) 180px, 45vw" className="object-cover object-[center_15%]" />
          </div>
        )}
        <span aria-hidden="true" className="block h-1.5 w-full rounded-[1px] sm:h-2" style={{ background: cor }} />
      </div>
      <div className="mt-3 sm:mt-[clamp(12px,2vh,20px)]">
        {/* Nome curto de uma palavra ocupa a coluna em corpo maior, como no estudo de layout. */}
        <p
          className={`font-heading uppercase leading-[0.9] text-white [overflow-wrap:normal] [word-break:normal] [text-wrap:balance] ${
            nomeCurto(candidato.nome_urna) ? "text-[clamp(2.5rem,min(6.4vw,10vh),6.5rem)]" : "text-[clamp(1.75rem,min(3.7vw,6vh),3.625rem)]"
          }`}
        >
          {candidato.nome_urna}
        </p>
        <p className="mt-1 text-[clamp(0.875rem,1.35vw,1.375rem)] text-white/90">
          {candidato.partido} · nº {candidato.numero}
        </p>
      </div>
      <p className="mt-3 text-[clamp(0.75rem,1.1vw,1.1rem)] font-bold uppercase tracking-[0.06em] text-white sm:mt-[clamp(12px,2.2vh,24px)]">
        <span className="sm:hidden">1º turno</span>
        <span className="max-sm:hidden">Resultado do 1º turno</span>
      </p>
      <p className="mt-1 font-heading leading-none tabular-nums text-white text-[clamp(2.25rem,min(4.2vw,7vh),4.25rem)]">
        {formatarPercentual(candidato.percentual_validos)}
      </p>
      <p className="mt-1 text-[clamp(0.8125rem,1.2vw,1.25rem)] tabular-nums text-white/90">
        {formatarVotos(candidato.votos)} votos
      </p>
      {candidato.slug ? (
        <Link
          href={`/candidato/${candidato.slug}`}
          aria-label={`Ficha completa de ${candidato.nome_urna}`}
          className="mt-2 inline-flex justify-self-start min-h-11 items-center gap-2 whitespace-nowrap text-[clamp(0.875rem,1.35vw,1.375rem)] font-semibold text-white underline decoration-1 underline-offset-[6px] hover:text-white/80"
        >
          Ficha completa <ArrowUpRight className="size-[1.1em]" aria-hidden="true" />
        </Link>
      ) : (
        <span />
      )}
    </div>
  )
}

/** "X" entre os finalistas, cortado por uma linha diagonal desenhada (o texto fica reto). */
function SeparadorDuelo() {
  return (
    <div aria-hidden="true" className="relative col-start-2 row-span-6 row-start-1 flex w-10 items-center justify-center sm:w-16">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 40 100" preserveAspectRatio="none">
        <line x1="34" y1="0" x2="6" y2="100" stroke="white" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="relative px-1 font-heading text-[clamp(2.5rem,min(5.6vw,9vh),5.5rem)] uppercase leading-none text-white">x</span>
    </div>
  )
}

/** Barra dos votos válidos de ponta a ponta: finalista, demais candidatos (hachurado) e finalista. */
function BarraVotosHero({ presidente, cores }: { presidente: DisputaResultado1Turno; cores: [string, string] }) {
  const { finalistas, demais } = dividirVotosValidos(presidente)
  const [a, b] = finalistas
  if (!a || !b) return null
  const resumo = `Votos válidos: ${a.nome_urna} ${formatarPercentual(a.percentual_validos)}, demais candidatos ${formatarPercentual(demais.percentual)}, ${b.nome_urna} ${formatarPercentual(b.percentual_validos)}.`
  const demaisTexto = demais.candidatos === 1 ? "Demais 1 candidato" : `Demais ${demais.candidatos} candidatos`
  const lado = (c: CandidatoResultado1Turno, cor: string, direita: boolean) => (
    <div className={`min-w-0 ${direita ? "text-right" : ""}`}>
      <p className={`flex items-center gap-2 font-bold uppercase tracking-[0.04em] text-white ${direita ? "justify-end" : ""}`}>
        {!direita && <span aria-hidden="true" className="size-3 shrink-0 rounded-[2px]" style={{ background: cor }} />}
        <span className="truncate">{c.nome_urna}</span>
        {direita && <span aria-hidden="true" className="size-3 shrink-0 rounded-[2px]" style={{ background: cor }} />}
      </p>
      <p className="text-[clamp(0.875rem,1.15vw,1.15rem)] tabular-nums text-white">{formatarPercentual(c.percentual_validos)}</p>
      <p className="tabular-nums text-white/80">{formatarVotos(c.votos)} votos</p>
    </div>
  )
  return (
    <figure className="text-[clamp(0.8125rem,1vw,1rem)]" data-pf-divisao-votos="escuro">
      <div role="img" aria-label={resumo} className="pf-barra pf-barra-entrada flex h-4 w-full overflow-hidden rounded-full bg-white/15 sm:h-5">
        <span className="block h-full" style={{ width: `${larguraBarra(a.percentual_validos)}%`, background: cores[0] }} />
        <span className="block h-full flex-1" style={{ backgroundImage: "repeating-linear-gradient(120deg, rgba(255,255,255,0.6) 0 1px, transparent 1px 6px)" }} />
        <span className="block h-full" style={{ width: `${larguraBarra(b.percentual_validos)}%`, background: cores[1] }} />
      </div>
      <figcaption className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        {lado(a, cores[0], false)}
        <p className="order-last col-span-2 text-center text-white sm:order-none sm:col-span-1">
          {demaisTexto}: {formatarPercentual(demais.percentual)}
        </p>
        {lado(b, cores[1], true)}
      </figcaption>
    </figure>
  )
}

function DueloHero({
  presidente,
  fotos,
  compararHref,
  compartilhar,
  referenceNow,
}: {
  presidente: DisputaResultado1Turno
  fotos?: FotosCandidatos
  compararHref: string | null
  compartilhar: HomeHero2026Props["compartilhar"]
  referenceNow: string
}) {
  const par = finalistasDaDisputa(presidente)
  if (!par) return null
  const [a, b] = par
  // Cor do lado do partido (mesma régua do espectro); sem duas classes distintas, branco e cinza.
  const espectro = coresDosFinalistas(a.partido, b.partido)
  const cores: [string, string] = espectro ? [espectro.a.cor, espectro.b.cor] : ["#ffffff", "var(--gray-400)"]
  // Crédito só dos retratos largos exibidos (do lg em diante); a foto da ficha já tem fonte na ficha.
  const creditos = [retratoHero(a.slug), retratoHero(b.slug)].filter((r): r is RetratoHero => r !== null)
  return (
    <div className="relative" data-pf-hero-duelo="Presidente">
      <div className="relative">
        <RetratoFundo retrato={retratoHero(a.slug)} fotoFicha={fotoDe(fotos, a.slug)} lado="esquerda" />
        <RetratoFundo retrato={retratoHero(b.slug)} fotoFicha={fotoDe(fotos, b.slug)} lado="direita" />
        <div className="relative mx-auto max-w-7xl px-5 pb-6 pt-[clamp(76px,9vh,96px)] text-center md:px-12 lg:pb-[clamp(24px,4.5vh,48px)]">
          <h1
            className="hero-fade font-heading text-[clamp(3.5rem,min(10vw,12vh),8rem)] uppercase leading-[0.85] tracking-[-0.01em] text-white"
            style={{ animationDelay: "0.1s" }}
          >
            Puxa Ficha
          </h1>
          <h2 className="hero-fade mt-3 text-[clamp(0.875rem,1.3vw,1.3rem)] font-medium uppercase tracking-[0.35em] text-white/90" style={{ animationDelay: "0.2s" }}>
            Presidência / 2º turno
          </h2>
          <p className="hero-fade mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[clamp(0.8125rem,1.15vw,1.15rem)] font-bold uppercase tracking-[0.06em] text-white" style={{ animationDelay: "0.25s" }}>
            <span>2º turno em {formatarData2Turno()}</span>
            <ContagemSegundoTurno referenceNow={referenceNow} variante="escuro" />
          </p>
          <div
            className="hero-fade mx-auto mt-6 grid max-w-[40rem] lg:max-w-[min(40rem,48vw)] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] grid-rows-[repeat(6,auto)] gap-x-3 text-left sm:mt-[clamp(16px,3.5vh,40px)] sm:gap-x-6"
            style={{ animationDelay: "0.3s" }}
            data-pf-duelo-1turno="Presidente"
          >
            <FinalistaHero candidato={a} cor={cores[0]} coluna="col-start-1" foto={fotoDe(fotos, a.slug)} />
            <SeparadorDuelo />
            <FinalistaHero candidato={b} cor={cores[1]} coluna="col-start-3" foto={fotoDe(fotos, b.slug)} />
          </div>
        </div>
      </div>
      <div className="relative mx-auto max-w-7xl px-5 md:px-12">
        <BarraVotosHero presidente={presidente} cores={cores} />
        <p className={`mx-auto mt-3 max-w-prose text-center sm:mt-[clamp(8px,1.6vh,16px)] ${TEXTO_APOIO}`}>
          Percentuais dos votos válidos no 1º turno. Fonte: TSE.
          {creditos.length > 0 && (
            <span className="max-lg:hidden" data-pf-hero-creditos>
              {" "}Fotos:{" "}
              {creditos.map((r, i) => (
                <span key={r.pagina}>
                  {i > 0 && ", "}
                  <a href={r.pagina} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-white">
                    {r.credito} ({r.licenca})<span className="sr-only"> (abre em nova aba)</span>
                  </a>
                </span>
              ))}
              .
            </span>
          )}
          {!presidente.fechamento_oficial && (
            <span data-pf-hero-fechamento-pendente> O TSE ainda não publicou o fechamento oficial desta disputa; a ida ao 2º turno foi calculada pelos votos.</span>
          )}
        </p>
        {(compararHref || compartilhar) && (
          <div className="mt-6 flex flex-col items-center gap-3 sm:mt-[clamp(14px,3vh,40px)] sm:flex-row sm:justify-center sm:gap-6">
            {compararHref && (
              <a
                href={compararHref}
                className="group inline-flex min-h-12 items-center justify-center gap-3 whitespace-nowrap rounded-full bg-white px-6 font-heading text-[length:var(--text-heading-sm)] uppercase sm:min-h-[60px] sm:px-12 sm:text-[clamp(1.5rem,2vw,2rem)] leading-none tracking-[0.02em] text-black transition-colors duration-200 hover:bg-[var(--gray-200)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
              >
                Comparar lado a lado
                <ArrowRight className="size-6 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
              </a>
            )}
            {compararHref && compartilhar && <span aria-hidden="true" className="hidden h-7 w-px bg-white/40 sm:block" />}
            {compartilhar && (
              <CompartilharDuelo
                finalistas={[
                  { nome_urna: a.nome_urna, percentual_validos: a.percentual_validos },
                  { nome_urna: b.nome_urna, percentual_validos: b.percentual_validos },
                ]}
                url={compartilhar.url}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function PesquisaHero({ pesquisa, nomes }: { pesquisa: Pesquisa2TurnoLinha; nomes: [string, string] }) {
  const href = safeHref(pesquisa.url)
  const [pa, pb] = pesquisa.percentuais
  const data = formatarDataPesquisa(pesquisa.data)
  return (
    <div data-pf-hero-pesquisa className="min-w-0">
      <p className={ROTULO_ESCURO}>Última pesquisa do 2º turno</p>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-2 font-heading uppercase leading-tight text-white">
        {/* Cada nome fica colado ao seu percentual: a quebra só acontece entre os dois lados. */}
        <span className="inline-flex items-baseline gap-x-2 whitespace-nowrap">
          <span className="text-[length:var(--text-body-lg)]">{nomes[0]}</span>
          <span className="text-[length:var(--text-heading-sm)] tabular-nums">{pa}%</span>
        </span>
        <span className="inline-flex items-baseline gap-x-2 whitespace-nowrap">
          <span aria-hidden="true" className="text-white/80">x</span>
          <span className="text-[length:var(--text-body-lg)]">{nomes[1]}</span>
          <span className="text-[length:var(--text-heading-sm)] tabular-nums">{pb}%</span>
        </span>
      </p>
      <p className={`mt-1 flex flex-wrap items-center gap-x-2 ${TEXTO_APOIO}`}>
        <span>
          {pesquisa.instituto} · {data}
          {pesquisa.margem !== null && <> · margem {String(pesquisa.margem).replace(".", ",")} p.p.</>}
        </span>
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Fonte da pesquisa ${pesquisa.instituto} de ${data} (abre em nova aba)`}
            className={LINK_ESCURO}
          >
            Fonte <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </a>
        )}
      </p>
    </div>
  )
}

function NumerosHero({ numeros, fonte2022 }: { numeros: NumeroHero1Turno[]; fonte2022: HomeHero2026Props["fonte2022"] }) {
  if (numeros.length === 0) return null
  const temComparacao = Boolean(fonte2022) && numeros.some((n) => n.comparacao)
  return (
    <div className="min-w-0 text-center">
      <p className={`max-sm:hidden ${ROTULO_ESCURO}`}>1º turno em números</p>
      {/* Mesmo eixo do duelo: quatro colunas centradas, separadas por um traço fino. */}
      <dl className="mx-auto grid max-w-5xl grid-cols-2 gap-y-6 sm:mt-5 sm:grid-cols-4 sm:divide-x sm:divide-white/20" data-pf-hero-numeros>
        {numeros.map((n) => (
          // dt antes do dd no DOM (ordem válida de <dl>); `order` põe o número em cima, o rótulo e a comparação embaixo.
          <div key={n.id} className="flex min-w-0 flex-col items-center px-3" data-pf-hero-numero={n.id}>
            <dt className="order-2 mt-1 text-[length:var(--text-eyebrow)] font-semibold uppercase tracking-[0.06em] text-white">{n.rotulo}</dt>
            <dd className="order-1 font-heading text-[length:var(--text-heading)] leading-none tabular-nums text-white xl:text-[length:var(--text-heading-lg)]">
              {n.valor}
            </dd>
            {fonte2022 && n.comparacao && (
              <dd className="order-3 mt-0.5 text-[length:var(--text-caption)] font-medium tabular-nums text-white/80" data-pf-hero-comparacao-2022={n.id}>
                <span aria-hidden="true">{n.comparacao.texto}</span>
                <span className="sr-only">{n.comparacao.acessivel}</span>
              </dd>
            )}
          </div>
        ))}
      </dl>
      {temComparacao && fonte2022 && (
        <p className={`mx-auto mt-5 max-w-prose ${TEXTO_APOIO}`} data-pf-hero-fonte-2022>
          Comparação com o 1º turno de 2022 para Presidente, em pontos percentuais.{" "}
          <a href={fonte2022.pagina} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-white">
            Fonte: TSE, dados abertos<span className="sr-only"> (abre em nova aba)</span>
          </a>
          .
        </p>
      )}
    </div>
  )
}

/** Os números antigos do hero (fichas mapeadas), para quando ainda não há resultado do TSE. */
function MetricasFichas({ metricas }: { metricas: HomeHeroMetrics }) {
  const { totalCandidatos, totalPatrimonio, totalProcessos, totalProcessosDisciplinares } = metricas
  const valor =
    "font-heading text-[length:var(--text-heading-sm)] leading-none tracking-tight text-white sm:text-[length:var(--text-heading-lg)] lg:text-[48px]"
  return (
    <div data-pf-hero-fichas>
      <p className="hero-fade text-[length:var(--text-eyebrow)] font-semibold uppercase tracking-[0.15em] text-white" style={{ animationDelay: "0.3s" }}>
        Eleições 2026
      </p>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 pb-2 sm:mt-6 sm:gap-12 sm:pb-4 lg:gap-20">
        {totalCandidatos !== null && (
          <div className="hero-fade" style={{ animationDelay: "0.4s" }}>
            <p className={valor}>{totalCandidatos}</p>
            <p className={`mt-1 ${ROTULO_ESCURO}`}>candidatos mapeados</p>
          </div>
        )}
        {totalPatrimonio !== null && totalPatrimonio > 0 && (
          <div className="hero-fade" style={{ animationDelay: "0.5s" }}>
            <p className={valor}>{formatCompact(totalPatrimonio)}</p>
            <p className={`mt-1 ${ROTULO_ESCURO}`}>patrimônio declarado</p>
          </div>
        )}
        {totalProcessos !== null && totalProcessos > 0 && (
          <div className="hero-fade" style={{ animationDelay: "0.6s" }}>
            <p className={valor}>
              <span data-pf-hero-processos={totalProcessos}>{totalProcessos}</span>
            </p>
            <p className={`mt-1 ${ROTULO_ESCURO}`}>processos</p>
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
  )
}

export interface HomeHero2026Props {
  /** Props do `getImageProps` da página: o hero é o LCP e a página faz o preload. */
  imagem: ComponentProps<"img">
  /** false sem resultado do TSE: o hero volta aos números das fichas. */
  temResultado: boolean
  presidente: DisputaResultado1Turno | null
  fotos?: FotosCandidatos
  pesquisa: Pesquisa2TurnoLinha | null
  numeros: NumeroHero1Turno[]
  metricas: HomeHeroMetrics
  ufs: Array<{ uf: string; label: string }>
  referenceNow: string
  compararHref: string | null
  /** Endereço compartilhado pelo botão do duelo; null esconde o botão. */
  compartilhar?: { url: string } | null
  /** Página da fonte de 2022 dos deltas de comparecimento e abstenção; null esconde os deltas. */
  fonte2022?: { pagina: string } | null
}

/**
 * Hero da home: a faixa preta com a imagem do dossiê e o título da marca. Com o
 * resultado do 1º turno publicado, traz a data e a contagem do 2º turno, o duelo
 * presidencial, a última pesquisa do confronto, os números do 1º turno e o
 * seletor de UF. Sem resultado, mostra os números das fichas, como antes.
 */
export function HomeHero2026({ imagem, temResultado, presidente, fotos, pesquisa, numeros, metricas, ufs, referenceNow, compararHref, compartilhar = null, fonte2022 = null }: HomeHero2026Props) {
  const finalistas = temResultado ? finalistasDaDisputa(presidente) : null
  const temSegundoTurno = Boolean(finalistas) || numeros.some((n) => n.id === "governadores-2turno" && n.valor !== "0")
  const faixa = temResultado && (
    <>
      {/* Faixa abaixo do duelo: pesquisa e números do 1º turno; depois o seletor de UF. */}
      <div
        data-pf-hero-faixa
        className={`mt-10 grid gap-4 border-t border-white/30 pt-5 sm:mt-14 sm:gap-8 sm:pt-6 lg:gap-x-12 ${finalistas && pesquisa ? "lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]" : ""}`}
      >
        {finalistas && pesquisa && <PesquisaHero pesquisa={pesquisa} nomes={[finalistas[0].nome_urna, finalistas[1].nome_urna]} />}
        {numeros.length > 0 && (
          // No celular os números ficam atrás de um botão; do sm em diante, sempre abertos.
          <RecolhivelNoCelular rotulo="Ver números do 1º turno">
            <NumerosHero numeros={numeros} fonte2022={fonte2022} />
          </RecolhivelNoCelular>
        )}
      </div>
      {ufs.length > 0 && (
        <div className="mt-8 flex justify-center">
          <UfResultadoSelector options={ufs} basePath="/1o-turno" rotulo="Seu estado tem 2º turno?" variante="escuro" compacto />
        </div>
      )}
    </>
  )

  // Com o par do 2º turno: retratos nas bordas, título e duelo no centro, barra dos votos de ponta a ponta.
  if (finalistas && presidente) {
    return (
      <section className="relative overflow-hidden bg-black pb-10 sm:pb-16" data-pf-home-hero="resultado">
        <DueloHero presidente={presidente} fotos={fotos} compararHref={compararHref} compartilhar={compartilhar} referenceNow={referenceNow} />
        <div className="relative mx-auto max-w-7xl px-5 md:px-12">{faixa}</div>
      </section>
    )
  }

  return (
    <section className="relative overflow-hidden bg-black" data-pf-home-hero={temResultado ? "resultado" : "fichas"}>
      <div className="absolute inset-0 opacity-40" aria-hidden="true">
        <picture>
          <source media="(max-width: 640px)" srcSet="/images/hero-dossie-mobile.webp" />
          <img {...imagem} alt={imagem.alt} />
        </picture>
      </div>
      {/* Escurece a imagem: o texto branco fica acima de 4,5:1 em qualquer ponto. */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/50" />

      <div className="relative mx-auto max-w-7xl px-5 pb-10 pt-[clamp(72px,11vh,80px)] sm:pb-16 sm:pt-[clamp(76px,11vh,128px)] md:px-12 lg:pb-20">
        <h1
          className="hero-fade font-heading text-[clamp(48px,min(17vw,9vh),100px)] uppercase leading-[0.85] tracking-[-0.02em] text-white sm:text-[clamp(64px,min(13vw,12vh),176px)]"
          style={{ animationDelay: "0.1s" }}
        >
          Puxa Ficha
        </h1>
        <SlashDivider className="hero-fade my-3 sm:my-[clamp(10px,2vh,24px)]" color="text-white" />

        {!temResultado ? (
          <MetricasFichas metricas={metricas} />
        ) : (
          <div className="hero-fade" style={{ animationDelay: "0.3s" }}>
            {temSegundoTurno && (
              <p className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[length:var(--text-body)] font-bold uppercase tracking-[0.06em] text-white sm:text-[length:var(--text-body-lg)]">
                <span className="sm:hidden" aria-hidden="true">2º turno em {formatarData2Turno("curto")}</span>
                <span className="max-sm:sr-only">2º turno em {formatarData2Turno()}</span>
                <ContagemSegundoTurno referenceNow={referenceNow} variante="escuro" />
              </p>
            )}
            {faixa}
          </div>
        )}
      </div>
    </section>
  )
}

// cspell:ignore recolhivel acessivel
import type { ComponentProps } from "react"
import { ArrowDown, ArrowUpRight } from "lucide-react"
import type { DisputaResultado1Turno } from "@/lib/resultados-1turno"
import type { FotosCandidatos } from "@/lib/resultados-1turno-vista"
import { finalistasDaDisputa, formatarDataPesquisa, type Pesquisa2TurnoLinha } from "@/lib/segundo-turno-2026"
import type { NumeroHero1Turno } from "@/lib/home-eleicao-2026"
import type { HomeHeroMetrics } from "@/lib/home-hero-metrics"
import { PROCESSO_DISCIPLINAR_AVISO } from "@/lib/processos-justica-total"
import { formatCompact, safeHref } from "@/lib/utils"
import { DueloSegundoTurno } from "@/components/Resultado1TurnoDestaques"
import { ContagemSegundoTurno } from "@/components/ContagemSegundoTurno"
import { SlashDivider } from "@/components/SlashDivider"
import { UfResultadoSelector } from "@/components/UfResultadoSelector"
import { RecolhivelNoCelular } from "@/components/RecolhivelNoCelular"
import { CompartilharDuelo } from "@/components/CompartilharDuelo"

const ROTULO_ESCURO = "text-[length:var(--text-eyebrow)] font-semibold uppercase tracking-[0.12em] text-white"
const TEXTO_APOIO = "text-[length:var(--text-caption)] font-medium tabular-nums text-white/80"
const LINK_ESCURO =
  "inline-flex min-h-11 items-center gap-1 whitespace-nowrap text-[length:var(--text-body-sm)] font-bold text-white underline underline-offset-4 hover:text-white/80"

function DueloHero({
  presidente,
  fotos,
  compararHref,
  compartilhar,
}: {
  presidente: DisputaResultado1Turno
  fotos?: FotosCandidatos
  compararHref: string | null
  compartilhar: HomeHero2026Props["compartilhar"]
}) {
  // Mesmo duelo do topo da página do 1º turno (fotos, % e a barra dos votos válidos), em tom escuro.
  const par = finalistasDaDisputa(presidente)
  return (
    <div data-pf-hero-duelo="Presidente">
      <h2 className={`mb-3 sm:mb-[clamp(8px,1.5vh,20px)] sm:text-center ${ROTULO_ESCURO}`}>Presidente</h2>
      <DueloSegundoTurno disputa={presidente} fotos={fotos} tom="escuro" selo={false} />
      <p className={`mx-auto mt-2 max-w-prose text-center ${TEXTO_APOIO}`}>
        Percentual dos votos válidos no 1º turno. Fonte: TSE. Cor e lado pelo partido, na{" "}
        <a href="/quiz/metodologia" className="font-semibold text-white underline underline-offset-4 hover:text-white/80">
          classificação do Puxa Ficha
        </a>
        .
        {/* O aviso que estava na nota de fonte da seção removida: sem fechamento oficial, a situação é calculada. */}
        {!presidente.fechamento_oficial && (
          <span data-pf-hero-fechamento-pendente> O TSE ainda não publicou o fechamento oficial desta disputa; a ida ao 2º turno foi calculada pelos votos.</span>
        )}
      </p>
      {(compararHref || (compartilhar && par)) && (
        // No celular o botão principal fica em cima e o compartilhar embaixo; do sm em diante, lado a lado.
        <div className="mt-4 flex flex-col items-center gap-3 sm:mt-[clamp(14px,2.5vh,32px)] sm:flex-row sm:justify-center sm:gap-6">
          {compararHref && (
            <p className="flex justify-center">
              <a
                href={compararHref}
                className="group inline-flex min-h-12 items-center justify-center gap-3 rounded-full bg-white px-7 font-heading text-[length:var(--text-heading-sm)] uppercase leading-none tracking-[0.02em] text-black transition-colors duration-200 hover:bg-[var(--gray-200)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
              >
                Comparar lado a lado
                <ArrowDown className="size-5 transition-transform duration-200 group-hover:translate-y-0.5 motion-reduce:transition-none" aria-hidden="true" />
              </a>
            </p>
          )}
          {compartilhar && par && (
            <CompartilharDuelo
              finalistas={[
                { nome_urna: par[0].nome_urna, percentual_validos: par[0].percentual_validos },
                { nome_urna: par[1].nome_urna, percentual_validos: par[1].percentual_validos },
              ]}
              url={compartilhar.url}
            />
          )}
        </div>
      )}
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
    <div className="min-w-0">
      <p className={`max-sm:hidden ${ROTULO_ESCURO}`}>1º turno em números</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:mt-3 sm:grid-cols-4" data-pf-hero-numeros>
        {numeros.map((n) => (
          // dt antes do dd no DOM (ordem válida de <dl>); `order` põe o número em cima, o rótulo e a comparação embaixo.
          <div key={n.id} className="flex min-w-0 flex-col" data-pf-hero-numero={n.id}>
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
        <p className={`mt-3 ${TEXTO_APOIO}`} data-pf-hero-fonte-2022>
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

      {/* Espaços e tamanhos do topo escalam pela altura da tela (vh): do título ao "Comparar lado a lado" cabe numa tela só. */}
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
                {/* No celular a data curta deixa a contagem na mesma linha; o leitor de tela ouve a data por extenso. */}
                <span className="sm:hidden" aria-hidden="true">2º turno em 25/10</span>
                <span className="max-sm:sr-only">2º turno em 25 de outubro</span>
                <ContagemSegundoTurno referenceNow={referenceNow} variante="escuro" />
              </p>
            )}
            {finalistas && presidente && (
              <div className="mt-4 sm:mt-[clamp(14px,2.5vh,32px)]">
                <DueloHero presidente={presidente} fotos={fotos} compararHref={compararHref} compartilhar={compartilhar} />
              </div>
            )}
            {/* Faixa horizontal abaixo da linha dos votos: pesquisa, números do 1º turno e seletor de UF. */}
            <div
              data-pf-hero-faixa
              className="mt-6 grid gap-4 border-t border-white/30 pt-5 sm:mt-10 sm:pt-6 sm:gap-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-x-12"
            >
              {finalistas && pesquisa && <PesquisaHero pesquisa={pesquisa} nomes={[finalistas[0].nome_urna, finalistas[1].nome_urna]} />}
              {numeros.length > 0 && (
                // No celular os números ficam atrás de um botão; do sm em diante, sempre abertos.
                <RecolhivelNoCelular rotulo="Ver números do 1º turno">
                  <NumerosHero numeros={numeros} fonte2022={fonte2022} />
                </RecolhivelNoCelular>
              )}
            </div>
            {/* O seletor de UF é um detalhe: uma linha compacta, com o rótulo ao lado. */}
            {ufs.length > 0 && (
              <div className="mt-6">
                <UfResultadoSelector options={ufs} basePath="/1o-turno" rotulo="Seu estado tem 2º turno?" variante="escuro" compacto />
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

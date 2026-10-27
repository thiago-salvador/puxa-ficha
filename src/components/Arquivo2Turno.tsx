// cspell:ignore legivel
import { getImageProps } from "next/image"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { RetratoFundo } from "@/components/HomeHero2026"
import { FotoCandidato, TituloSecao } from "@/components/Resultado1TurnoPartes"
import { BarraConfronto, LinkFichaCompleta } from "@/components/SegundoTurnoPresidente"
import { SlashDivider } from "@/components/SlashDivider"
import {
  disputaFinal,
  formatarGeradoTse,
  formatarInteiro,
  getResultado2Turno,
  numeros2Turno,
  type CandidatoFinal2Turno,
} from "@/lib/arquivo-home"
import { getEstadoNome } from "@/lib/br-uf"
import { carregadorRetrato } from "@/lib/carregador-retrato"
import { nomeLegivel } from "@/lib/compartilhar-duelo"
import { coresDosFinalistas } from "@/lib/cores-finalistas"
import { retratoHero } from "@/lib/hero-retratos-2turno"
import { formatarPercentual } from "@/lib/resultados-1turno"
import { fotoDe, larguraBarra, type FotosCandidatos } from "@/lib/resultados-1turno-vista"

const ROTULO_ESCURO = "text-[length:var(--text-eyebrow)] font-semibold uppercase tracking-[0.12em] text-white"
const TEXTO_APOIO = "text-[length:var(--text-caption)] font-medium tabular-nums text-white/80"
const LINK_ESCURO =
  "inline-flex min-h-11 items-center gap-1 whitespace-nowrap text-[length:var(--text-body-sm)] font-bold text-white underline underline-offset-4 hover:text-white/80"
const LINK_CLARO =
  "inline-flex min-h-11 items-center gap-1 whitespace-nowrap text-[length:var(--text-body-sm)] font-bold underline underline-offset-4 hover:text-[var(--gray-600)]"
const PILULA_BRANCA =
  "group inline-flex min-h-12 items-center justify-center gap-3 whitespace-nowrap rounded-full bg-white px-6 font-heading text-[length:var(--text-heading-sm)] uppercase leading-none tracking-[0.02em] text-black transition-colors duration-200 hover:bg-[var(--gray-200)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white sm:min-h-[60px] sm:px-12 sm:text-[clamp(1.5rem,2vw,2rem)]"

interface Props {
  /** Nome de urna como a ficha mostra, por slug; o do TSE vem sem acento. */
  nomes: Record<string, string>
  fotos?: FotosCandidatos
}

function nomeDe(c: CandidatoFinal2Turno, nomes: Record<string, string>) {
  return nomes[c.slug] ?? nomeLegivel(c.nome_urna)
}

// Topo de /2o-turno no arquivo, na linguagem do hero do 2º turno: fundo preto, retrato que some no preto,
// título condensado, a barra dos votos de ponta a ponta, a pílula branca e a faixa "em números". Abaixo, os
// governadores eleitos no 2º turno no mesmo desenho dos duelos estaduais. O resto da página é o 2º turno
// como estava no dia da votação.
export function Arquivo2TurnoHero({ nomes, fotos }: Props) {
  const resultado = getResultado2Turno()
  const presidente = disputaFinal(resultado, "Presidente", "BR")
  if (!presidente) return null
  const { eleito, derrotado, fonte } = presidente
  const nome = nomeDe(eleito, nomes)
  const retrato = retratoHero(eleito.slug)
  const espectro = coresDosFinalistas(eleito.partido, derrotado.partido)
  const cores: [string, string] = espectro ? [espectro.a.cor, espectro.b.cor] : ["#ffffff", "var(--gray-400)"]
  const numeros = numeros2Turno(resultado)
  // Retrato do celular: o RetratoFundo só aparece do lg em diante.
  const imagemCelular = retrato
    ? getImageProps({ src: retrato.url, alt: "", width: retrato.largura, height: retrato.altura, priority: true, loader: carregadorRetrato, sizes: "(max-width: 1023px) 100vw, 1px" }).props
    : null
  const governadores = resultado.disputas
    .filter((d) => d.cargo === "Governador")
    .map((d) => ({ uf: d.uf, final: disputaFinal(resultado, d.cargo, d.uf) }))
    .filter((g): g is { uf: string; final: NonNullable<typeof g.final> } => g.final !== null)

  return (
    <>
      <section className="relative overflow-hidden bg-black pb-10 sm:pb-16" data-pf-home-hero="arquivo">
        <div className="relative">
          <RetratoFundo retrato={retrato} fotoFicha={fotoDe(fotos, eleito.slug)} lado="direita" />
          {imagemCelular && retrato && (
            <div
              aria-hidden="true"
              className="relative mt-16 aspect-[16/10] w-full [mask-image:linear-gradient(to_bottom,#000_70%,transparent)] lg:hidden"
              data-pf-arquivo-retrato
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- atributos do getImageProps, montados no servidor */}
              <img {...imagemCelular} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: `${Math.round(retrato.rosto_x * 100)}% 20%` }} />
            </div>
          )}
          <div className="relative mx-auto max-w-7xl px-5 pb-8 pt-4 md:px-12 lg:min-h-[clamp(420px,62vh,600px)] lg:pb-12 lg:pt-[clamp(96px,14vh,150px)]">
            <div className="lg:max-w-[50%]">
              <p className="hero-fade text-[clamp(0.875rem,1.3vw,1.3rem)] font-medium uppercase tracking-[0.35em] text-white/90" style={{ animationDelay: "0.1s" }}>
                Presidência / 2º turno
              </p>
              <h1
                className="hero-fade mt-3 font-heading text-[clamp(3.5rem,min(10vw,13vh),8.5rem)] uppercase leading-[0.85] tracking-[-0.01em] text-white [text-wrap:balance]"
                style={{ animationDelay: "0.2s" }}
              >
                {nome} eleito presidente
              </h1>
              <SlashDivider className="hero-fade my-4 sm:my-6" color="text-white" />
              <p className="hero-fade max-w-md text-[length:var(--text-body)] font-medium leading-relaxed text-white/80" style={{ animationDelay: "0.3s" }}>
                {nomeLegivel(eleito.nome)} ({eleito.partido}) foi eleito presidente da República no 2º turno de 25 de outubro de 2026.
              </p>
            </div>
          </div>
        </div>

        <div className="relative mx-auto max-w-7xl px-5 md:px-12">
          <BarraResultado eleito={eleito} cor={cores[0]} nomes={nomes} />
          <p className={`mx-auto mt-3 max-w-prose text-center ${TEXTO_APOIO}`}>
            Percentuais dos votos válidos no 2º turno.{" "}
            <a href={fonte.url} className="underline underline-offset-2 hover:text-white" rel="noreferrer">
              Fonte: TSE, resultado totalizado em {formatarGeradoTse(fonte.gerado_tse)}
            </a>
            .
            {retrato && (
              <>
                {" "}Foto:{" "}
                <a href={retrato.pagina} className="underline underline-offset-2 hover:text-white" rel="noreferrer">
                  {retrato.credito}, {retrato.licenca}
                </a>
                .
              </>
            )}
          </p>
          <div className="mt-6 flex flex-col items-center gap-3 sm:mt-[clamp(14px,3vh,40px)] sm:flex-row sm:justify-center sm:gap-6">
            <Link href={`/candidato/${eleito.slug}`} className={PILULA_BRANCA}>
              Ficha de {nome}
              <ArrowRight className="size-6 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
            </Link>
            <span aria-hidden="true" className="hidden h-7 w-px bg-white/40 sm:block" />
            <div className="flex flex-wrap justify-center gap-x-6">
              <Link href="/1o-turno" className={LINK_ESCURO}>
                Resultado do 1º turno <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
              <Link href="/" className={LINK_ESCURO}>
                O projeto Puxa Ficha <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </div>
          </div>

          {numeros.length > 0 && (
            <div className="mt-10 border-t border-white/30 pt-5 text-center sm:mt-14 sm:pt-6" data-pf-arquivo-faixa>
              <p className={ROTULO_ESCURO}>2º turno em números</p>
              <dl className="mx-auto mt-5 grid max-w-5xl grid-cols-2 gap-y-6 sm:grid-cols-4 sm:divide-x sm:divide-white/20">
                {numeros.map((n) => (
                  <div key={n.id} className="flex min-w-0 flex-col items-center px-3" data-pf-arquivo-numero={n.id}>
                    <dt className="order-2 mt-1 text-[length:var(--text-eyebrow)] font-semibold uppercase tracking-[0.06em] text-white">{n.rotulo}</dt>
                    <dd className="order-1 font-heading text-[length:var(--text-heading)] leading-none tabular-nums text-white xl:text-[length:var(--text-heading-lg)]">{n.valor}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      </section>

      {governadores.length > 0 && (
        <section className="mx-auto max-w-7xl scroll-mt-24 px-5 pt-12 sm:pt-16 md:px-12" aria-labelledby="arquivo-governadores">
          <TituloSecao titulo="Governadores eleitos no 2º turno" id="arquivo-governadores">
            {governadores.length} estados escolheram o governador em 25 de outubro. Percentuais dos votos válidos no 2º turno.
          </TituloSecao>
          <SlashDivider className="mb-2 mt-6" />
          <ul className="grid grid-cols-1 gap-x-12 lg:grid-cols-2">
            {governadores.map(({ uf, final }, i) => (
              <li key={uf} className="border-b border-border" data-pf-arquivo-governador={uf}>
                <GovernadorEleito uf={uf} eleito={final.eleito} derrotado={final.derrotado} nomes={nomes} fotos={fotos} indice={i} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

/** Barra dos votos válidos de ponta a ponta com a fatia do eleito; o banner é só da vitória, sem o derrotado. */
function BarraResultado({ eleito, cor, nomes }: { eleito: CandidatoFinal2Turno; cor: string; nomes: Record<string, string> }) {
  const resumo = `${nomeDe(eleito, nomes)} teve ${formatarPercentual(eleito.percentual_validos)} dos votos válidos no 2º turno.`
  return (
    <figure className="text-[clamp(0.8125rem,1vw,1rem)]" data-pf-divisao-votos="escuro">
      <div role="img" aria-label={resumo} className="pf-barra pf-barra-entrada relative flex h-4 w-full overflow-hidden rounded-full bg-white/15 sm:h-5">
        <span className="block h-full" style={{ width: `${larguraBarra(eleito.percentual_validos)}%`, background: cor }} />
        {/* Marca da maioria: metade dos votos válidos. */}
        <span aria-hidden="true" className="absolute inset-y-0 left-1/2 w-px bg-white/70" />
      </div>
      <figcaption className="mt-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-bold uppercase tracking-[0.04em] text-white">
            <span aria-hidden="true" className="size-3 shrink-0 rounded-[2px]" style={{ background: cor }} />
            <span className="truncate">{nomeDe(eleito, nomes)}</span>
          </p>
          <p className="font-heading text-[clamp(1.75rem,3vw,2.75rem)] leading-none tabular-nums text-white">{formatarPercentual(eleito.percentual_validos)}</p>
          {eleito.votos !== null && <p className="mt-1 tabular-nums text-white/80">{formatarInteiro(eleito.votos)} votos</p>}
        </div>
        <p className="text-white/80">A linha no meio marca a maioria dos votos válidos.</p>
      </figcaption>
    </figure>
  )
}

/** Um estado: o eleito e quem perdeu, com foto, partido, percentual e a barra do confronto, como os duelos estaduais. */
function GovernadorEleito({
  uf,
  eleito,
  derrotado,
  nomes,
  fotos,
  indice,
}: {
  uf: string
  eleito: CandidatoFinal2Turno
  derrotado: CandidatoFinal2Turno
  nomes: Record<string, string>
  fotos?: FotosCandidatos
  indice: number
}) {
  const estado = getEstadoNome(uf.toLowerCase()) ?? uf
  const pessoa = (c: CandidatoFinal2Turno, direita: boolean) => (
    <div className={`flex min-w-0 items-center gap-3 ${direita ? "flex-row-reverse text-right" : ""}`}>
      <FotoCandidato candidato={{ slug: c.slug, nome_urna: nomeDe(c, nomes) }} fotos={fotos} tamanho={56} className="size-11 shrink-0 sm:size-12" initialsClassName="text-sm" />
      <div className="min-w-0">
        <p className="break-words font-heading text-lg uppercase leading-[1.05] text-foreground [text-wrap:balance] sm:text-xl">{nomeDe(c, nomes)}</p>
        <p className="mt-0.5 text-[length:var(--text-caption)] font-medium text-muted-foreground">
          {c.partido}
          {c.eleito && <span className="ml-2 font-bold uppercase tracking-[0.06em] text-foreground">Eleito</span>}
        </p>
      </div>
    </div>
  )
  return (
    <div className="py-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h3 className="font-heading text-[length:var(--text-heading)] uppercase leading-none text-foreground">
          {estado}
          <span className="sr-only">: {nomeDe(eleito, nomes)} eleito governador</span>
        </h3>
        <Link href={`/uf/${uf.toLowerCase()}`} aria-label={`Ver estado: ${estado}`} className={LINK_CLARO}>
          Ver estado <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
      <div className="mt-5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-3 sm:gap-x-5">
        {pessoa(eleito, false)}
        <span aria-hidden="true" className="font-heading text-xl uppercase text-[var(--gray-400)]">x</span>
        {pessoa(derrotado, true)}
      </div>
      <p className="mt-3 grid grid-cols-2 tabular-nums">
        <span className="font-heading text-[length:var(--text-heading)] leading-none text-foreground">{formatarPercentual(eleito.percentual_validos)}</span>
        <span className="justify-self-end font-heading text-[length:var(--text-heading)] leading-none text-[var(--gray-500)]">{formatarPercentual(derrotado.percentual_validos)}</span>
      </p>
      <BarraConfronto
        a={eleito.percentual_validos}
        b={derrotado.percentual_validos}
        indice={indice}
        className="mt-3 h-2"
        rotulo={`${estado}, votos válidos no 2º turno: ${nomeDe(eleito, nomes)} ${formatarPercentual(eleito.percentual_validos)}, ${nomeDe(derrotado, nomes)} ${formatarPercentual(derrotado.percentual_validos)}`}
      />
      <p className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-3">
        <span className="justify-self-start"><LinkFichaCompleta slug={eleito.slug} nome={nomeDe(eleito, nomes)} compacto /></span>
        <span className="text-[length:var(--text-caption)] font-medium text-muted-foreground">no 2º turno</span>
        <span className="justify-self-end"><LinkFichaCompleta slug={derrotado.slug} nome={nomeDe(derrotado, nomes)} compacto /></span>
      </p>
    </div>
  )
}

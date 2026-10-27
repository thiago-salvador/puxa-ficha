// cspell:ignore legivel
import { getImageProps } from "next/image"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { ARQUIVO_ELEICOES_2026 } from "@/lib/arquivo"
import {
  disputaFinal,
  formatarGeradoTse,
  formatarInteiro,
  getResultado2Turno,
  type CandidatoFinal2Turno,
} from "@/lib/arquivo-home"
import { nomeLegivel } from "@/lib/compartilhar-duelo"
import { carregadorRetrato } from "@/lib/carregador-retrato"
import { retratoHero } from "@/lib/hero-retratos-2turno"
import { formatarPercentual } from "@/lib/resultados-1turno"

const EYEBROW = "text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em]"
const LINK_SETA = "inline-flex min-h-11 items-center gap-1.5 text-[length:var(--text-body-sm)] font-bold underline underline-offset-4"

interface Props {
  /** Nome de urna como a ficha mostra, por slug; o do TSE vem sem acento. */
  nomes: Record<string, string>
}

function nomeDe(c: CandidatoFinal2Turno, nomes: Record<string, string>) {
  return nomes[c.slug] ?? nomeLegivel(c.nome_urna)
}

// Topo de /2o-turno no arquivo: a vitória do eleito e os governadores eleitos no 2º turno, com a fonte do TSE.
// Fica no lugar do hero da campanha; o resto da página é o 2º turno como estava no dia da votação.
export function Arquivo2TurnoHero({ nomes }: Props) {
  const resultado = getResultado2Turno()
  const presidente = disputaFinal(resultado, "Presidente", "BR")
  const governadores = resultado.disputas
    .filter((d) => d.cargo === "Governador")
    .map((d) => ({ uf: d.uf, final: disputaFinal(resultado, d.cargo, d.uf) }))
  if (!presidente) return null
  const { eleito, fonte } = presidente
  const nome = nomeDe(eleito, nomes)
  const retrato = retratoHero(eleito.slug)
  // getImageProps no servidor: o carregador é função e não atravessa para o componente de cliente.
  const imagem = retrato
    ? getImageProps({ src: retrato.url, alt: `${nome}, presidente eleito`, width: retrato.largura, height: retrato.altura, priority: true, loader: carregadorRetrato, sizes: "(min-width: 1024px) 60vw, 100vw" }).props
    : null

  return (
    <>
      <section className="relative overflow-hidden bg-black text-white" data-pf-home-hero="arquivo">
        {imagem && retrato && (
          // Retrato oficial: no desktop ocupa a metade direita e some no preto; no celular vem acima do texto.
          <div
            className="relative mt-16 aspect-[16/10] w-full lg:mt-0 [mask-image:linear-gradient(to_bottom,#000_70%,transparent)] lg:absolute lg:inset-y-0 lg:right-0 lg:aspect-auto lg:w-[60%] lg:[mask-composite:intersect] lg:[mask-image:linear-gradient(to_right,transparent,#000_35%),linear-gradient(to_bottom,#000_75%,transparent)]"
            data-pf-arquivo-retrato
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- atributos do getImageProps, montados no servidor */}
            <img
              {...imagem}
              alt={imagem.alt}
              className="absolute inset-0 h-full w-full object-cover"
              style={{ objectPosition: `${Math.round(retrato.rosto_x * 100)}% 20%` }}
            />
          </div>
        )}
        <div className="relative mx-auto max-w-7xl px-5 pb-12 pt-6 sm:pb-16 md:px-12 lg:min-h-[640px] lg:pt-36">
          <div className="max-w-xl">
            <p className={`${EYEBROW} text-white/70`}>
              {ARQUIVO_ELEICOES_2026.titulo} · 2º turno, {ARQUIVO_ELEICOES_2026.dataCorte}
            </p>
            <h1 className="mt-3 font-heading text-[clamp(3.25rem,9vw,7.5rem)] uppercase leading-[0.88] [text-wrap:balance]">
              {nome} eleito presidente
            </h1>
            <p className="mt-6 font-heading text-[clamp(3rem,7vw,5.5rem)] leading-none tabular-nums" data-pf-arquivo-percentual>
              {formatarPercentual(eleito.percentual_validos)}
            </p>
            <p className="mt-1 text-[length:var(--text-body)] font-bold text-white">
              dos votos válidos{eleito.votos === null ? "" : `, ${formatarInteiro(eleito.votos)} votos`}
            </p>
            <p className="mt-4 max-w-md text-[length:var(--text-body)] font-medium leading-relaxed text-white/80">
              {nomeLegivel(eleito.nome)} ({eleito.partido}) foi eleito presidente da República no 2º turno de 25 de outubro de 2026.
            </p>
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-1">
              <Link href={`/candidato/${eleito.slug}`} className={`${LINK_SETA} text-white`}>
                Ficha de {nome} <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
              <Link href="/1o-turno" className={`${LINK_SETA} text-white`}>
                Resultado do 1º turno <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
              <Link href="/" className={`${LINK_SETA} text-white`}>
                O projeto Puxa Ficha <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </div>
            <p className="mt-6 text-[length:var(--text-caption)] font-medium text-white/60">
              Fonte:{" "}
              <a href={fonte.url} className="underline underline-offset-2 hover:text-white" rel="noreferrer">
                TSE, resultado totalizado em {formatarGeradoTse(fonte.gerado_tse)}
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
          </div>
        </div>
      </section>

      {governadores.length > 0 && (
        <section className="mx-auto max-w-7xl px-5 pt-12 sm:pt-16 md:px-12" aria-labelledby="arquivo-governadores">
          <h2 id="arquivo-governadores" className={`${EYEBROW} text-muted-foreground`}>Governadores eleitos no 2º turno</h2>
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {governadores.map(({ uf, final }) =>
              final ? (
                <li key={uf} className="flex min-w-0 items-baseline justify-between gap-3 rounded-[14px] border border-border px-4 py-3" data-pf-arquivo-governador={uf}>
                  <span className="min-w-0">
                    <span className="mr-2 text-[length:var(--text-caption)] font-bold text-muted-foreground">{uf}</span>
                    <Link href={`/candidato/${final.eleito.slug}`} className="font-bold text-foreground hover:underline">{nomeDe(final.eleito, nomes)}</Link>
                    <span className="block text-[length:var(--text-caption)] font-medium text-muted-foreground">venceu {nomeDe(final.derrotado, nomes)}</span>
                  </span>
                  <span className="shrink-0 font-heading text-2xl tabular-nums text-foreground">{formatarPercentual(final.eleito.percentual_validos)}</span>
                </li>
              ) : null,
            )}
          </ul>
        </section>
      )}
    </>
  )
}

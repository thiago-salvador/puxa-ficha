// cspell:ignore botao celulas comparaveis comparavel profissao profissoes ceap
import type { CSSProperties } from "react"
import Link from "next/link"
import { ArrowRight, ArrowUpRight, ChevronDown, ChevronUp } from "lucide-react"
import type { CandidatoResultado1Turno, DisputaResultado1Turno } from "@/lib/resultados-1turno"
import { larguraBarra, type FotosCandidatos } from "@/lib/resultados-1turno-vista"
import { PROCESSO_DISCIPLINAR_AVISO, type ProcessosJusticaContagem } from "@/lib/processos-justica-total"
import { coresDosFinalistas } from "@/lib/cores-finalistas"
import {
  escalarSerie,
  finalistasDaDisputa,
  formatarDataEixo,
  formatarDataPesquisa,
  serieDasPesquisas,
  montarLadoALado,
  montarLadoALadoExtra,
  type CelulaLadoALado,
  type FichaLadoALado,
  type FichaLadoALadoExtra,
  type Pesquisa2TurnoLinha,
} from "@/lib/segundo-turno-2026"
import type { CandidatoComparavel } from "@/lib/types"
import { safeHref } from "@/lib/utils"
import { FotoCandidato, ROTULO, TituloSecao } from "@/components/Resultado1TurnoPartes"
import { SlashDivider } from "@/components/SlashDivider"

const LINK_SETA =
  "inline-flex min-h-11 items-center gap-1 whitespace-nowrap text-[length:var(--text-body-sm)] font-bold underline underline-offset-4 hover:text-[var(--gray-600)]"

export const BOTAO_PILULA =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-foreground px-5 text-[length:var(--text-body-sm)] font-bold text-background transition-colors duration-200 hover:bg-[var(--gray-800)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"

export const HACHURA = "repeating-linear-gradient(120deg, rgba(10,10,10,0.35) 0 1px, transparent 1px 6px)"

/**
 * Barra de um confronto em escala fixa de 0 a 100%: preto para o primeiro,
 * cinza para o segundo e hachura para o resto (outros votos, branco, nulo ou
 * indecisos, conforme a fonte). Cresce com `pf-barra` quando o bloco revela.
 */
export function BarraConfronto({
  a,
  b,
  rotulo,
  indice = 0,
  className = "h-2.5",
}: {
  a: number | null
  b: number | null
  rotulo: string
  indice?: number
  className?: string
}) {
  return (
    <div
      role="img"
      aria-label={rotulo}
      className={`pf-barra flex w-full overflow-hidden rounded-full bg-[var(--gray-100)] ${className}`.trim()}
      style={{ "--pf-i": Math.min(indice, 11) } as CSSProperties}
    >
      <span className="block h-full bg-[var(--gray-950)]" style={{ width: `${larguraBarra(a)}%` }} />
      <span className="block h-full flex-1" style={{ backgroundImage: HACHURA }} />
      <span className="block h-full bg-[var(--gray-400)]" style={{ width: `${larguraBarra(b)}%` }} />
    </div>
  )
}

const GRADE_LINHA = "grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,1fr)_11rem_minmax(0,1fr)] sm:gap-x-6"

/** Link explícito para a ficha de quem segue na disputa; o nome acessível sempre leva o candidato. */
export function LinkFichaCompleta({ slug, nome, compacto = false }: { slug: string; nome: string; compacto?: boolean }) {
  return (
    <Link
      href={`/candidato/${slug}`}
      aria-label={`Ficha completa de ${nome}`}
      data-pf-ficha-completa={slug}
      className={`inline-flex min-h-11 items-center gap-1 whitespace-nowrap font-bold text-foreground underline underline-offset-4 hover:text-[var(--gray-600)] ${compacto ? "text-[length:var(--text-caption)]" : "text-[length:var(--text-caption)] sm:text-[length:var(--text-body-sm)]"}`}
    >
      Ficha completa <ArrowRight className={compacto ? "size-3" : "size-3.5"} aria-hidden="true" />
    </Link>
  )
}

function LinhaComparacao({ id, rotulo, celulas, atributo }: { id: string; rotulo: string; celulas: [CelulaLadoALado, CelulaLadoALado]; atributo: "linha" | "extra" }) {
  const dados = atributo === "linha" ? { "data-pf-lado-a-lado-linha": id } : { "data-pf-lado-a-lado-extra": id }
  return (
    <div role="row" {...dados} className={`${GRADE_LINHA} border-t border-border px-4 py-3 sm:items-center sm:px-6`}>
      <span role="rowheader" className={`${ROTULO} col-span-2 text-center text-muted-foreground sm:col-span-1 sm:col-start-2 sm:row-start-1`}>
        {rotulo}
      </span>
      {celulas.map((celula, i) => (
        <span
          key={i}
          role="cell"
          className={`min-w-0 text-center [overflow-wrap:anywhere] ${i === 0 ? "sm:col-start-1 sm:row-start-1" : "sm:col-start-3 sm:row-start-1"}`}
        >
          <span
            className={`block tabular-nums ${celula.semDado ? "text-[length:var(--text-body-sm)] font-medium text-muted-foreground" : "text-[length:var(--text-body)] font-bold text-foreground sm:text-[length:var(--text-body-lg)]"}`}
          >
            {celula.valor}
          </span>
          {celula.detalhe && <span className="block text-[length:var(--text-caption)] font-medium leading-snug text-muted-foreground">{celula.detalhe}</span>}
        </span>
      ))}
    </div>
  )
}

function CabecalhoFinalista({ candidato, fotos, lado, cor }: { candidato: CandidatoResultado1Turno; fotos?: FotosCandidatos; lado: "esquerda" | "direita"; cor: string | null }) {
  return (
    <div role="columnheader" className={`flex min-w-0 flex-col items-center gap-1.5 text-center ${lado === "direita" ? "sm:col-start-3" : ""}`}>
      <FotoCandidato
        candidato={candidato}
        fotos={fotos}
        tamanho={64}
        className="size-14 ring-2 ring-[var(--gray-200)] sm:size-16"
        initialsClassName="text-sm"
      />
      {/* Bolinha e nome na cor do lado do partido (mesma régua do hero); sem cor, preto. */}
      <span className="mt-1 inline-flex min-w-0 items-center gap-2 font-heading text-lg uppercase leading-tight [text-wrap:balance] sm:text-2xl" style={cor ? { color: cor } : undefined}>
        <span aria-hidden="true" className="size-3 shrink-0 rounded-full" style={{ background: cor ?? "var(--gray-950)" }} />
        {candidato.nome_urna}
      </span>
      {candidato.slug && <LinkFichaCompleta slug={candidato.slug} nome={candidato.nome_urna} compacto />}
    </div>
  )
}

/**
 * Comparação dos dois finalistas com o que as fichas já têm. Tabela ARIA sobre
 * grade: no celular o rótulo ocupa a linha de cima e os valores ficam lado a
 * lado; do `sm` em diante o rótulo vai para o meio, espelhando o duelo.
 */
export function LadoALado2Turno({
  disputa,
  fotos,
  processos,
  processosContagem,
  patrimonios,
  patrimoniosAtipicos,
  pontosAtencao,
  compararHref,
  comparaveis = [],
  profissoes = {},
}: {
  disputa: DisputaResultado1Turno
  fotos?: FotosCandidatos
  processos: Record<string, number>
  processosContagem: Record<string, ProcessosJusticaContagem>
  patrimonios: Record<string, number | null>
  patrimoniosAtipicos: Record<string, boolean>
  /** null quando a lista de fichas não veio ao vivo: contagens viram "sem dado". */
  pontosAtencao: Record<string, number> | null
  compararHref: string | null
  /** Linhas do comparador já carregadas pela página; alimentam o "Mais informações". */
  comparaveis?: readonly CandidatoComparavel[]
  /** Profissão declarada na ficha, por slug. */
  profissoes?: Record<string, string | null>
}) {
  const finalistas = finalistasDaDisputa(disputa)
  if (!finalistas) return null
  const ficha = (c: CandidatoResultado1Turno): FichaLadoALado | undefined => {
    if (!c.slug || !(c.slug in processos) || !pontosAtencao) return undefined
    return {
      patrimonio: patrimonios[c.slug],
      patrimonioAtipico: Boolean(patrimoniosAtipicos[c.slug]),
      processos: processos[c.slug],
      processosContagem: processosContagem[c.slug],
      pontosAtencao: pontosAtencao[c.slug],
    }
  }
  const linhas = montarLadoALado(finalistas, [ficha(finalistas[0]), ficha(finalistas[1])])
  const extra = (c: CandidatoResultado1Turno): FichaLadoALadoExtra => ({
    slug: c.slug,
    comparavel: c.slug ? comparaveis.find((item) => item.slug === c.slug) : undefined,
    profissaoDeclarada: c.slug ? profissoes[c.slug] : undefined,
  })
  const linhasExtra = montarLadoALadoExtra([extra(finalistas[0]), extra(finalistas[1])])
  const temCeap = linhasExtra.some((linha) => linha.id === "ceap")
  const temDisciplinar = finalistas.some((c) => c.slug && (processosContagem[c.slug]?.disciplinares ?? 0) > 0)
  const espectro = coresDosFinalistas(finalistas[0].partido, finalistas[1].partido)
  return (
    <section id="lado-a-lado" className="scroll-mt-24" aria-labelledby="lado-a-lado-titulo">
      <TituloSecao titulo="Lado a lado" id="lado-a-lado-titulo">
        O que as fichas públicas mostram dos dois finalistas à Presidência.
      </TituloSecao>
      <SlashDivider className="mb-6 mt-6" />
      <div className="overflow-hidden rounded-[6px] border border-border">
      <div role="table" aria-label="Presidente: os dois finalistas lado a lado" data-pf-lado-a-lado>
        <div role="row" className={`${GRADE_LINHA} items-end bg-background px-4 pb-3 pt-5 sm:px-6`}>
          <span role="columnheader" className="sr-only">
            Item
          </span>
          <CabecalhoFinalista candidato={finalistas[0]} fotos={fotos} lado="esquerda" cor={espectro?.a.cor ?? null} />
          <CabecalhoFinalista candidato={finalistas[1]} fotos={fotos} lado="direita" cor={espectro?.b.cor ?? null} />
        </div>
        {linhas.map((linha) => (
          <LinhaComparacao key={linha.id} id={linha.id} rotulo={linha.rotulo} celulas={linha.celulas} atributo="linha" />
        ))}
      </div>
      {/* Fechado por padrão; <details> nativo abre com teclado e anuncia o estado expandido. */}
      <details className="group border-t border-border" data-pf-lado-a-lado-mais>
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 bg-[var(--gray-50)] px-4 py-3 text-[length:var(--text-body-sm)] font-bold text-foreground transition-colors duration-200 hover:bg-[var(--gray-100)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground motion-reduce:transition-none [&::-webkit-details-marker]:hidden">
          Mais informações
          <ChevronDown className="size-4 group-open:hidden" aria-hidden="true" />
          <ChevronUp className="hidden size-4 group-open:block" aria-hidden="true" />
        </summary>
        <div role="table" aria-label="Presidente: mais informações dos dois finalistas" data-pf-lado-a-lado-extra-tabela>
          <div role="row" className="sr-only">
            <span role="columnheader">Item</span>
            <span role="columnheader">{finalistas[0].nome_urna}</span>
            <span role="columnheader">{finalistas[1].nome_urna}</span>
          </div>
          {linhasExtra.map((linha) => (
            <LinhaComparacao key={linha.id} id={linha.id} rotulo={linha.rotulo} celulas={linha.celulas} atributo="extra" />
          ))}
        </div>
        <p className="border-t border-border px-4 py-3 text-[length:var(--text-caption)] font-medium leading-relaxed text-muted-foreground sm:px-6">
          Mesmos dados e regras do comparador e da ficha de cada candidato. Trocas de partido
          só aparecem em número quando a contagem foi verificada. Evolução patrimonial compara o patrimônio de 2026 com a
          eleição anterior declarada.
          {temCeap && <> A cota parlamentar não inclui Presidência nem governo estadual.</>}
        </p>
      </details>
      </div>
      <div className="mt-5 flex flex-col items-center gap-4 text-center">
        <p className="max-w-prose text-[length:var(--text-caption)] font-medium leading-relaxed text-muted-foreground">
          Patrimônio, processos e pontos de atenção vêm das fichas; partido, vice e votos, do resultado oficial do TSE.
          {temDisciplinar && <> Processos somam judiciais e disciplinares. {PROCESSO_DISCIPLINAR_AVISO}</>}
        </p>
        {compararHref && (
          <Link href={compararHref} className={`${BOTAO_PILULA} px-8`}>
            Comparador completo <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
        )}
      </div>
    </section>
  )
}

const CAIXA_TENDENCIA = { largura: 360, altura: 170, margemX: 42, margemY: 22 }

/**
 * Tendência do confronto: uma linha por finalista, da pesquisa mais antiga à
 * mais recente, com x proporcional à data. Cores do lado do partido quando os
 * dois têm classe diferente; senão preto e cinza, como as barras da lista.
 */
function TendenciaPesquisas2Turno({
  linhas,
  nomes,
  partidos,
}: {
  linhas: Pesquisa2TurnoLinha[]
  nomes: [string, string]
  partidos?: [string, string]
}) {
  const serie = serieDasPesquisas(linhas)
  if (serie.length === 0) return null
  const { pontos, marcas } = escalarSerie(serie, CAIXA_TENDENCIA)
  const espectro = partidos ? coresDosFinalistas(partidos[0], partidos[1]) : null
  const cores: [string, string] = espectro ? [espectro.a.cor, espectro.b.cor] : ["var(--gray-950)", "var(--gray-400)"]
  const primeiro = serie[0]
  const ultimo = serie[serie.length - 1]
  const institutos = [...new Set(serie.map((p) => p.instituto))].join(", ")
  const resumo = `De ${formatarDataPesquisa(primeiro.data)} a ${formatarDataPesquisa(ultimo.data)}, em ${serie.length} pesquisas (${institutos}): ${nomes[0]} foi de ${primeiro.percentuais[0]}% a ${ultimo.percentuais[0]}%; ${nomes[1]} foi de ${primeiro.percentuais[1]}% a ${ultimo.percentuais[1]}%.`
  const linha = (i: 0 | 1) => pontos.map((p, j) => `${j === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y[i].toFixed(1)}`).join(" ")
  return (
    <figure className="mb-8 max-w-md" data-pf-tendencia-2turno>
      <svg viewBox={`0 0 ${CAIXA_TENDENCIA.largura} ${CAIXA_TENDENCIA.altura + 18}`} className="w-full overflow-visible" aria-hidden="true">
        {marcas.map((m) => (
          <g key={m.valor}>
            <line x1={CAIXA_TENDENCIA.margemX - 6} x2={CAIXA_TENDENCIA.largura - 6} y1={m.y} y2={m.y} stroke="var(--gray-200)" strokeWidth={1} />
            <text x={0} y={m.y + 3.5} fontSize={10} fill="var(--gray-500)" className="tabular-nums">
              {m.valor}%
            </text>
          </g>
        ))}
        {([0, 1] as const).map((i) => (
          <path key={i} d={linha(i)} fill="none" stroke={cores[i]} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {pontos.map((p) => {
          // O rótulo de quem está acima vai para cima do ponto; o de baixo, para baixo: os dois nunca se cruzam.
          const cimaA = p.percentuais[0] >= p.percentuais[1]
          return (
            <g key={p.id}>
              {([0, 1] as const).map((i) => {
                const acima = i === 0 ? cimaA : !cimaA
                return (
                  <g key={i}>
                    <circle cx={p.x} cy={p.y[i]} r={3.5} fill={cores[i]} stroke="var(--background)" strokeWidth={1.5} />
                    <text x={p.x} y={acima ? p.y[i] - 8 : p.y[i] + 15} fontSize={11} fontWeight={700} textAnchor="middle" fill={cores[i]} className="tabular-nums">
                      {p.percentuais[i]}%
                    </text>
                  </g>
                )
              })}
              <text x={p.x} y={CAIXA_TENDENCIA.altura + 14} fontSize={10} textAnchor="middle" fill="var(--gray-500)">
                {formatarDataEixo(p.data)}
              </text>
            </g>
          )
        })}
      </svg>
      <figcaption className="mt-2 text-[length:var(--text-caption)] font-medium leading-relaxed text-muted-foreground">
        <span className="mr-3 inline-flex items-center gap-1.5 font-bold text-foreground">
          <span aria-hidden="true" className="inline-block h-0.5 w-4 rounded-full" style={{ background: cores[0] }} />
          {nomes[0]}
        </span>
        <span className="mr-3 inline-flex items-center gap-1.5 font-bold text-foreground">
          <span aria-hidden="true" className="inline-block h-0.5 w-4 rounded-full" style={{ background: cores[1] }} />
          {nomes[1]}
        </span>
        <span className="mt-1 block">{resumo}</span>
      </figcaption>
    </figure>
  )
}

/** Últimas pesquisas do confronto exato dos finalistas, com link para a fonte de cada uma. */
export function Pesquisas2Turno({
  linhas,
  nomes,
  partidos,
  limiteLista = 6,
}: {
  linhas: Pesquisa2TurnoLinha[]
  nomes: [string, string]
  /** Partidos dos finalistas, na mesma ordem: dão as cores da tendência. */
  partidos?: [string, string]
  /** A tendência usa todas as linhas; a lista mostra só as mais recentes. */
  limiteLista?: number
}) {
  if (linhas.length === 0) return null
  const [nomeA, nomeB] = nomes
  return (
    <section id="pesquisas-2turno" className="scroll-mt-24" aria-labelledby="pesquisas-2turno-titulo">
      <TituloSecao titulo="Pesquisas do 2º turno" id="pesquisas-2turno-titulo">
        Intenção de voto no confronto {nomeA} x {nomeB}, da pesquisa mais recente para a mais antiga.
      </TituloSecao>
      <SlashDivider className="mb-6 mt-6" />
      <TendenciaPesquisas2Turno linhas={linhas} nomes={nomes} partidos={partidos} />
      <p className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[length:var(--text-caption)] font-medium text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2.5 rounded-full bg-[var(--gray-950)]" />
          {nomeA}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2.5 rounded-full bg-[var(--gray-400)]" />
          {nomeB}
        </span>
        <span>Barra de 0 a 100% do total; o resto é branco, nulo e não sabe.</span>
      </p>
      <ol className="border-b border-border" data-pf-revelar="auto" data-pf-pesquisas-2turno>
        {linhas.slice(0, limiteLista).map((linha, i) => {
          const href = safeHref(linha.url)
          const [pa, pb] = linha.percentuais
          return (
            <li
              key={linha.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-t border-border py-4 sm:grid-cols-[12rem_minmax(0,1fr)_auto] sm:gap-x-6"
            >
              <div className="min-w-0">
                <p className="font-bold text-foreground">{linha.instituto}</p>
                <p className="text-[length:var(--text-caption)] font-medium tabular-nums text-muted-foreground">
                  {formatarDataPesquisa(linha.data)}
                  {linha.margem !== null && <> · margem {String(linha.margem).replace(".", ",")} p.p.</>}
                </p>
              </div>
              <div className="col-span-2 row-start-2 min-w-0 sm:col-span-1 sm:col-start-2 sm:row-start-1">
                <p className="flex items-baseline justify-between gap-3 font-heading text-2xl leading-none tabular-nums text-foreground">
                  <span>{pa}%</span>
                  <span className="text-[var(--gray-500)]">{pb}%</span>
                </p>
                <BarraConfronto a={pa} b={pb} indice={i} className="mt-2 h-2" rotulo={`${linha.instituto}: ${nomeA} ${pa}%, ${nomeB} ${pb}%`} />
              </div>
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Fonte da pesquisa ${linha.instituto} de ${formatarDataPesquisa(linha.data)} (abre em nova aba)`}
                  className={`${LINK_SETA} justify-self-end sm:col-start-3`}
                >
                  Fonte <ArrowUpRight className="size-3.5" aria-hidden="true" />
                </a>
              ) : (
                <span />
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

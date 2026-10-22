// cspell:ignore botao celulas comparaveis comparavel profissao profissoes ceap legivel
import type { CSSProperties } from "react"
import Link from "next/link"
import { PartyLogoMark } from "@/components/PartyLogoMark"
import { nomeLegivel } from "@/lib/compartilhar-duelo"
import { ArrowRight, ArrowUpRight, ChevronDown, ChevronUp } from "lucide-react"
import type { CandidatoResultado1Turno, DisputaResultado1Turno } from "@/lib/resultados-1turno"
import { larguraBarra, type FotosCandidatos } from "@/lib/resultados-1turno-vista"
import { PROCESSO_DISCIPLINAR_AVISO, type ProcessosJusticaContagem } from "@/lib/processos-justica-total"
import { coresDosFinalistas } from "@/lib/cores-finalistas"
import { EvolucaoPesquisas2Turno } from "@/components/EvolucaoPesquisas2Turno"
import {
  finalistasDaDisputa,
  montarLadoALado,
  montarLadoALadoExtra,
  type CelulaLadoALado,
  type FichaLadoALado,
  type FichaLadoALadoExtra,
  type Pesquisa2TurnoLinha,
} from "@/lib/segundo-turno-2026"
import type { CandidatoComparavel } from "@/lib/types"
import { FotoCandidato, ROTULO, TituloSecao } from "@/components/Resultado1TurnoPartes"
import { SlashDivider } from "@/components/SlashDivider"

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
            className={`tabular-nums ${celula.partido ? "inline-flex items-center justify-center gap-2.5" : "block"} ${celula.semDado ? "text-[length:var(--text-body-sm)] font-medium text-muted-foreground" : "text-[length:var(--text-body)] font-bold text-foreground sm:text-[length:var(--text-body-lg)]"}`}
          >
            {celula.partido && <PartyLogoMark sigla={celula.partido} className="h-8 w-11 rounded-[6px] p-0.5 sm:h-9 sm:w-12 sm:rounded-[8px] sm:p-1" />}
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

/** Últimas pesquisas do confronto exato dos finalistas, com link para a fonte de cada uma. */
export function Pesquisas2Turno({
  linhas,
  nomes,
  partidos,
  limiteLista = 6,
  mostrarVazio = false,
}: {
  linhas: Pesquisa2TurnoLinha[]
  nomes: [string, string]
  /** Partidos dos finalistas, na mesma ordem: dão as cores da tendência. */
  partidos?: [string, string]
  /** A tendência usa todas as linhas; a lista mostra só as mais recentes. */
  limiteLista?: number
  /** Sem pesquisa, mostra a seção com o aviso em vez de sumir (home do 2º turno). */
  mostrarVazio?: boolean
}) {
  const [nomeA, nomeB] = nomes
  if (linhas.length === 0) {
    if (!mostrarVazio) return null
    return (
      <section id="pesquisas-2turno" className="scroll-mt-24" aria-labelledby="pesquisas-2turno-titulo" data-pf-pesquisas-2turno-vazio>
        <TituloSecao titulo="Pesquisas do 2º turno" id="pesquisas-2turno-titulo">
          Intenção de voto no confronto {nomeLegivel(nomeA)} x {nomeLegivel(nomeB)}.
        </TituloSecao>
        <SlashDivider className="mb-6 mt-6" />
        <div className="grid items-center gap-6 rounded-[6px] border border-dashed border-border px-5 py-8 sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)] sm:px-8">
          <div className="max-w-prose">
            <p className="font-heading text-[length:var(--text-heading-sm)] uppercase leading-tight text-foreground">
              Nenhuma pesquisa do 2º turno publicada ainda
            </p>
            <p className="mt-3 text-[length:var(--text-body)] font-medium leading-relaxed text-muted-foreground">
              Só entram pesquisas com entrevistas feitas depois do 1º turno, em 4 de outubro. Simulação feita antes da votação não mede este confronto.
              Cada pesquisa aparece aqui com instituto, data, margem de erro e link para a fonte assim que é publicada.
            </p>
          </div>
          <div aria-hidden="true" className="flex h-24 items-end gap-2 opacity-60">
            {[46, 52, 49, 55, 51, 48].map((h, i) => (
              <span key={i} className="flex-1 rounded-t-[3px] border border-dashed border-[var(--gray-400)]" style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
      </section>
    )
  }
  const espectro = partidos ? coresDosFinalistas(partidos[0], partidos[1]) : null
  const cores: [string, string] = espectro ? [espectro.a.cor, espectro.b.cor] : ["var(--gray-950)", "var(--gray-600)"]
  return (
    <section id="pesquisas-2turno" className="scroll-mt-24" aria-labelledby="pesquisas-2turno-titulo">
      <TituloSecao titulo="Pesquisas do 2º turno" id="pesquisas-2turno-titulo">
        {nomeLegivel(nomeA)} × {nomeLegivel(nomeB)} · Acompanhe as pesquisas e a média por data.
      </TituloSecao>
      <SlashDivider className="mb-6 mt-6" />
      <EvolucaoPesquisas2Turno linhas={linhas} nomes={[nomeLegivel(nomeA), nomeLegivel(nomeB)]} cores={cores} limiteLista={limiteLista} />
    </section>
  )
}

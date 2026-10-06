// cspell:ignore alianca aliancas botao cappelli legivel lider
import type { ReactNode } from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { getEstadoNome, getEstadoUFs } from "@/lib/br-uf"
import { linkCompararFinalistas } from "@/lib/fase-eleitoral-publica"
import {
  formatarPercentual,
  getDisputa1Turno,
  type CandidatoResultado1Turno,
  type Resultados1Turno,
} from "@/lib/resultados-1turno"
import type { FotosCandidatos } from "@/lib/resultados-1turno-vista"
import { finalistasDaDisputa, formatarVantagem, vantagemNoDuelo } from "@/lib/segundo-turno-2026"
import type { Candidato } from "@/lib/types"
import { FotoCandidato, NomeDoCandidato, TituloSecao } from "@/components/Resultado1TurnoPartes"
import { BarraConfronto, BOTAO_PILULA, LinkFichaCompleta } from "@/components/SegundoTurnoPresidente"
import { SlashDivider } from "@/components/SlashDivider"
import { MeuEstadoDuelos } from "@/components/MeuEstadoDuelos"
import { RessalvaSubJudice } from "@/components/RessalvaSubJudice"
import { FonteDeclaracao } from "@/components/FonteDeclaracao"
import { apoiosGovernador, formatarDiaDeclaracao, type Aliancas2Turno, type ItemAlianca } from "@/lib/aliancas-2turno"
import { nomeLegivel } from "@/lib/compartilhar-duelo"
import type { DisputaResultado1Turno } from "@/lib/resultados-1turno"

interface Duelo2TurnoUf {
  uf: string
  nome: string
  finalistas: [CandidatoResultado1Turno, CandidatoResultado1Turno]
  compararHref: string | null
  disputa: DisputaResultado1Turno | null
}

/** Estados com 2º turno para governador no snapshot do TSE, em ordem alfabética. */
function duelosGovernador(data: Resultados1Turno | undefined, candidatos: readonly Candidato[]): Duelo2TurnoUf[] {
  return getEstadoUFs()
    .flatMap((uf) => {
      const disputa = getDisputa1Turno("Governador", uf, data)
      const finalistas = finalistasDaDisputa(disputa)
      if (!finalistas) return []
      const daUf = candidatos.filter(
        (c) => c.cargo_disputado === "Governador" && (c.estado ?? "").toUpperCase() === uf.toUpperCase(),
      )
      return [{ uf: uf.toUpperCase(), nome: getEstadoNome(uf) ?? uf.toUpperCase(), finalistas, compararHref: linkCompararFinalistas(daUf), disputa }]
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
}

/** Um lado do duelo: foto, nome e partido em cima; o % do 1º turno embaixo, na linha do outro lado (subgrid). */
function Finalista({
  candidato,
  fotos,
  direita = false,
  percentual,
}: {
  candidato: CandidatoResultado1Turno
  fotos?: FotosCandidatos
  direita?: boolean
  percentual: ReactNode
}) {
  return (
    <div className={`row-span-2 grid min-w-0 grid-rows-subgrid gap-y-3 ${direita ? "text-right" : ""}`.trim()}>
      <div className={`flex min-w-0 items-center gap-3 ${direita ? "flex-row-reverse" : ""}`.trim()}>
        <FotoCandidato candidato={candidato} fotos={fotos} tamanho={56} className="size-11 shrink-0 sm:size-12" initialsClassName="text-sm" />
        <div className="min-w-0">
          <p className="break-words font-heading text-lg uppercase leading-[1.05] text-foreground [text-wrap:balance] sm:text-xl">
            <NomeDoCandidato candidato={candidato} cargo="Governador" className="" />
          </p>
          <p className="mt-0.5 text-[length:var(--text-caption)] font-medium text-muted-foreground">{candidato.partido}</p>
        </div>
      </div>
      {percentual}
    </div>
  )
}

/** "Apoio declarado: Ricardo Cappelli (PSB) a Leandro Grass · Fonte". Só existe com apoio declarado na UF. */
function LinhaApoio({ item, finalistas }: { item: ItemAlianca; finalistas: Duelo2TurnoUf["finalistas"] }) {
  const apoiado = finalistas.find((f) => f.sq === item.apoia_sq)
  const fonte = item.fontes.find((f) => f.trecho.length > 0)
  if (!apoiado || !fonte) return null
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 text-[length:var(--text-caption)] font-medium text-muted-foreground" data-pf-apoio-governador={item.uf}>
      <span>
        Apoio declarado: <span className="font-bold text-foreground">{nomeLegivel(item.quem)}</span> ({item.partido}) a{" "}
        <span className="font-bold text-foreground">{nomeLegivel(apoiado.nome_urna)}</span>
      </span>
      <FonteDeclaracao fonte={{ url: fonte.url, veiculo: fonte.veiculo, trecho: fonte.trecho }} data={formatarDiaDeclaracao(item.data_declaracao)} />
    </div>
  )
}

function DueloUf({ duelo, fotos, indice, aliancas }: { duelo: Duelo2TurnoUf; fotos?: FotosCandidatos; indice: number; aliancas: Aliancas2Turno | null }) {
  const [a, b] = duelo.finalistas
  const { lider, pp } = vantagemNoDuelo(a.percentual_validos, b.percentual_validos)
  const vantagem = lider !== null && pp !== null ? formatarVantagem(pp) : null
  const resumoVantagem = lider !== null && vantagem ? `, ${duelo.finalistas[lider].nome_urna} à frente por ${vantagem.replace(/^\+/, "")}` : ""
  const vantagemDo = (lado: 0 | 1) =>
    lider === lado && vantagem ? (
      <span className="text-[length:var(--text-caption)] font-bold text-foreground" data-pf-duelo-vantagem={vantagem}>
        {vantagem}
      </span>
    ) : null
  const percentual = (lado: 0 | 1) => (
    <p className={`flex flex-col gap-1 self-end whitespace-nowrap tabular-nums sm:items-baseline sm:gap-2 ${lado === 1 ? "items-end sm:flex-row-reverse" : "items-start sm:flex-row"}`}>
      <span className={`font-heading text-[length:var(--text-heading)] leading-none ${lado === 0 ? "text-foreground" : "text-[var(--gray-500)]"}`}>
        {formatarPercentual(duelo.finalistas[lado].percentual_validos)}
      </span>
      {vantagemDo(lado)}
    </p>
  )
  return (
    <div className="py-6" data-pf-duelo-governador={duelo.uf}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h3 className="font-heading text-[length:var(--text-heading)] uppercase leading-none text-foreground">
          {duelo.nome}
          <span className="sr-only">: 2º turno para governador entre {a.nome_urna} e {b.nome_urna}</span>
        </h3>
        <div className="flex items-center gap-x-5">
          <Link
            href={`/uf/${duelo.uf.toLowerCase()}`}
            aria-label={`Ver os candidatos de ${duelo.nome}`}
            className="inline-flex min-h-11 items-center gap-1 whitespace-nowrap text-[length:var(--text-body-sm)] font-bold underline underline-offset-4 hover:text-[var(--gray-600)]"
          >
            Ver estado <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
          {duelo.compararHref && (
            <Link href={duelo.compararHref} aria-label={`Comparar ${a.nome_urna} e ${b.nome_urna}`} className={BOTAO_PILULA}>
              Comparar
            </Link>
          )}
        </div>
      </div>
      <div className="mt-5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] grid-rows-[auto_auto] gap-x-3 sm:gap-x-5">
        <Finalista candidato={a} fotos={fotos} percentual={percentual(0)} />
        <span aria-hidden="true" className="row-span-2 self-center font-heading text-xl uppercase text-[var(--gray-400)]">
          x
        </span>
        <Finalista candidato={b} fotos={fotos} direita percentual={percentual(1)} />
      </div>
      <BarraConfronto
        a={a.percentual_validos}
        b={b.percentual_validos}
        indice={indice}
        className="mt-3 h-2"
        rotulo={`${duelo.nome}, votos válidos no 1º turno: ${a.nome_urna} ${formatarPercentual(a.percentual_validos)}, ${b.nome_urna} ${formatarPercentual(b.percentual_validos)}${resumoVantagem}`}
      />
      <p className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-3" data-pf-duelo-2turno-fichas>
        <span className="justify-self-start">{a.slug && <LinkFichaCompleta slug={a.slug} nome={a.nome_urna} compacto />}</span>
        <span className="text-[length:var(--text-caption)] font-medium text-muted-foreground">no 1º turno</span>
        <span className="justify-self-end">{b.slug && <LinkFichaCompleta slug={b.slug} nome={b.nome_urna} compacto />}</span>
      </p>
      {apoiosGovernador(aliancas, duelo.uf).map((item) => (
        <LinhaApoio key={item.quem} item={item} finalistas={duelo.finalistas} />
      ))}
      <RessalvaSubJudice disputa={duelo.disputa} className="mt-3" />
    </div>
  )
}

/** Os estados que voltam às urnas para governador, cada um como um duelo com o resultado do 1º turno. */
export function Governadores2Turno({
  candidatos,
  fotos,
  data,
  aliancas = null,
}: {
  candidatos: readonly Candidato[]
  fotos?: FotosCandidatos
  data?: Resultados1Turno
  /** Alianças já validadas pela página; null esconde as linhas de apoio. */
  aliancas?: Aliancas2Turno | null
}) {
  const duelos = duelosGovernador(data, candidatos)
  if (duelos.length === 0) return null
  return (
    <section id="governadores-2turno" className="scroll-mt-24" aria-labelledby="governadores-2turno-titulo">
      <TituloSecao titulo="Governadores no 2º turno" id="governadores-2turno-titulo">
        {duelos.length} {duelos.length === 1 ? "estado volta" : "estados voltam"} às urnas para governador em 25 de outubro.
        Percentuais são dos votos válidos no 1º turno.
      </TituloSecao>
      <SlashDivider className="mb-4 mt-6" />
      <MeuEstadoDuelos
        duelos={duelos.map((duelo, i) => ({ uf: duelo.uf, conteudo: <DueloUf duelo={duelo} fotos={fotos} indice={i} aliancas={aliancas} /> }))}
        estados={getEstadoUFs()
          .map((uf) => ({ uf: uf.toUpperCase(), nome: getEstadoNome(uf) ?? uf.toUpperCase() }))
          .sort((x, y) => x.nome.localeCompare(y.nome, "pt-BR"))}
      />
    </section>
  )
}

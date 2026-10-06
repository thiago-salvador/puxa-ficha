// cspell:ignore atipico eleitorado legivel regiao regioes
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { REGIONS } from "@/data/brazil-states"
import type { CandidatoResumo } from "@/lib/api"
import { getEstadoNome } from "@/lib/br-uf"
import { nomeLegivel } from "@/lib/compartilhar-duelo"
import { formatarMargem } from "@/lib/mapa-presidente-uf"
import { PATRIMONIO_ATIPICO_ROTULO } from "@/lib/patrimonio-atipico"
import {
  formatarPercentual,
  getDisputa1Turno,
  href1Turno,
  type CandidatoResultado1Turno,
  type DisputaResultado1Turno,
  type Resultados1Turno,
} from "@/lib/resultados-1turno"
import type { FotosCandidatos } from "@/lib/resultados-1turno-vista"
import { formatCompact } from "@/lib/utils"
import { FotoCandidato, TituloSecao } from "@/components/Resultado1TurnoPartes"
import { SlashDivider } from "@/components/SlashDivider"
import { GovernadoresEleitosInterativo, type RegiaoEleitos } from "@/components/GovernadoresEleitosInterativo"

const NUMERO = new Intl.NumberFormat("pt-BR")
const LINK = "inline-flex min-h-11 items-center gap-1 text-[length:var(--text-body-sm)] font-bold text-foreground underline underline-offset-4 hover:text-[var(--gray-600)]"

interface Eleito {
  uf: string
  nome: string
  disputa: DisputaResultado1Turno
  eleito: CandidatoResultado1Turno
  segundo: CandidatoResultado1Turno | null
  resumo: CandidatoResumo | null
}

function listaComE(itens: string[]): string {
  return itens.length <= 1 ? (itens[0] ?? "") : `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`
}

function Linha({ e, fotos }: { e: Eleito; fotos?: FotosCandidatos }) {
  return (
    <>
      <FotoCandidato candidato={e.eleito} fotos={fotos} tamanho={64} className="size-12 shrink-0 sm:size-14" />
      <span className="min-w-0 flex-1">
        <span className="block text-[length:var(--text-caption)] font-medium text-muted-foreground">
          {e.nome} · {e.uf}
        </span>
        <span className="block break-words font-heading text-lg uppercase leading-[1.05] text-foreground">{e.eleito.nome_urna}</span>
        <span className="block text-[length:var(--text-caption)] font-medium text-muted-foreground">{e.eleito.partido}</span>
        <span className="mt-1.5 block font-heading text-[length:var(--text-heading-sm)] leading-none tabular-nums text-foreground">
          {formatarPercentual(e.eleito.percentual_validos)}
        </span>
      </span>
    </>
  )
}

function Indicador({ valor, rotulo, nota }: { valor: string; rotulo: string; nota?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[length:var(--text-caption)] font-medium leading-snug text-muted-foreground">{rotulo}</dt>
      <dd className="mt-1 whitespace-nowrap font-heading text-[length:var(--text-body-lg)] leading-none tabular-nums text-foreground sm:text-[length:var(--text-heading-sm)]" title={nota}>
        {valor}
        {nota && <span aria-hidden="true">*</span>}
      </dd>
    </div>
  )
}

/** Card do estado escolhido: resultado do TSE e, quando a ficha casou, os números dela. */
function Card({ e, fotos }: { e: Eleito; fotos?: FotosCandidatos }) {
  const vice = e.eleito.companheiros.find((c) => c.tipo === "v")
  const pa = e.eleito.percentual_validos
  const pb = e.segundo?.percentual_validos ?? null
  const largura = (p: number | null) => `${Math.max(0, Math.min(100, p ?? 0))}%`
  const fichaHref = e.eleito.slug ? `/candidato/${e.eleito.slug}` : null
  const r = e.resumo
  return (
    <article className="rounded-[6px] border border-border bg-[var(--gray-50)] p-5 sm:p-6" data-pf-eleito-card={e.uf.toLowerCase()}>
      <p className="text-[length:var(--text-body-sm)] font-bold uppercase text-muted-foreground">
        {e.nome} · {e.uf}
      </p>
      <p className="text-[length:var(--text-body)] font-medium text-foreground">Eleito no 1º turno</p>
      <div className="mt-5 flex items-center gap-4">
        <FotoCandidato candidato={e.eleito} fotos={fotos} tamanho={112} className="size-24 shrink-0 sm:size-28" initialsClassName="text-xl" />
        <div className="min-w-0">
          <h4 className="break-words font-heading text-[length:var(--text-heading)] uppercase leading-none text-foreground">{e.eleito.nome_urna}</h4>
          <p className="mt-1 text-[length:var(--text-body-sm)] font-medium text-muted-foreground">
            {e.eleito.partido}
            {e.eleito.numero ? ` · nº ${e.eleito.numero}` : ""}
          </p>
          {vice && (
            <p className="mt-1 text-[length:var(--text-caption)] font-medium text-muted-foreground">
              Vice: <span className="font-bold text-foreground">{nomeLegivel(vice.nome)}</span> ({vice.partido})
            </p>
          )}
        </div>
      </div>

      <p className="mt-5 font-heading text-[clamp(2.5rem,4vw,3.25rem)] leading-none tabular-nums text-foreground">{formatarPercentual(pa)}</p>
      <p className="mt-1 text-[length:var(--text-body-sm)] font-medium text-muted-foreground">
        dos votos válidos · {NUMERO.format(e.eleito.votos)} votos
      </p>

      {e.segundo && (
        <div className="mt-5 border-t border-border pt-4" data-pf-eleito-segundo>
          <p className="flex items-baseline justify-between gap-3 text-[length:var(--text-body-sm)]">
            <span className="min-w-0 font-medium text-muted-foreground">
              2º colocado: <span className="font-bold text-foreground">{nomeLegivel(e.segundo.nome_urna)}</span> ({e.segundo.partido})
            </span>
            <span className="shrink-0 font-bold tabular-nums text-foreground">{formatarPercentual(pb)}</span>
          </p>
          <div className="mt-2 space-y-1" aria-hidden="true">
            <div className="h-2 overflow-hidden rounded-full bg-[var(--gray-200)]">
              <div className="h-full rounded-full bg-[var(--gray-950)]" style={{ width: largura(pa) }} />
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--gray-200)]">
              <div className="h-full rounded-full bg-[var(--gray-400)]" style={{ width: largura(pb) }} />
            </div>
          </div>
          {pa !== null && pb !== null && (
            <p className="mt-2 text-[length:var(--text-body-sm)] font-medium text-muted-foreground">
              Vantagem de <span className="font-bold text-foreground">{formatarMargem(pa - pb)}</span>
            </p>
          )}
        </div>
      )}

      {r && (
        <div className="mt-5 border-t border-border pt-4" data-pf-eleito-ficha>
          <p className="text-[length:var(--text-body-sm)] font-bold text-foreground">Na ficha</p>
          <dl className="mt-3 grid grid-cols-3 gap-3">
            <Indicador valor={NUMERO.format(r.pontos_atencao)} rotulo={r.pontos_atencao === 1 ? "Ponto de atenção" : "Pontos de atenção"} />
            <Indicador valor={NUMERO.format(r.processos)} rotulo={r.processos === 1 ? "Processo" : "Processos"} />
            <Indicador
              valor={r.patrimonio !== null ? formatCompact(r.patrimonio) : "Sem dado"}
              rotulo="Patrimônio declarado"
              nota={r.patrimonio !== null && r.patrimonio_atipico ? PATRIMONIO_ATIPICO_ROTULO : undefined}
            />
          </dl>
          {r.patrimonio !== null && r.patrimonio_atipico && (
            <p className="mt-2 text-[length:var(--text-caption)] font-medium text-muted-foreground">* Patrimônio: {PATRIMONIO_ATIPICO_ROTULO}.</p>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-x-5 border-t border-border pt-2">
        {fichaHref && (
          <Link href={fichaHref} className={LINK} aria-label={`Ver ficha completa de ${e.eleito.nome_urna}`}>
            Ver ficha completa <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </Link>
        )}
        <Link href={href1Turno(e.uf)} className={LINK} aria-label={`Ver resultado completo de ${e.nome}`}>
          Ver resultado do estado <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
    </article>
  )
}

/**
 * Governadores eleitos no 1º turno, por região, com o card do estado escolhido.
 * Resultado do snapshot do TSE; os números de "Na ficha" vêm do mesmo resumo
 * que alimenta a grade de candidatos, e somem quando a ficha não casou.
 */
export function GovernadoresEleitos1Turno({
  ufs,
  data,
  fotos,
  resumos,
}: {
  ufs: string[]
  data: Resultados1Turno
  fotos?: FotosCandidatos
  resumos: readonly CandidatoResumo[] | null
}) {
  const resumoPorSlug = new Map((resumos ?? []).map((r) => [r.candidato.slug, r]))
  const eleitos: Eleito[] = ufs.flatMap((uf) => {
    const disputa = getDisputa1Turno("Governador", uf, data)
    const eleito = disputa?.candidatos.find((c) => c.fase === "eleito")
    if (!disputa || !eleito) return []
    const sigla = uf.toUpperCase()
    return [{
      uf: sigla,
      nome: getEstadoNome(uf) ?? sigla,
      disputa,
      eleito,
      segundo: disputa.candidatos.find((c) => c.posicao === 2) ?? null,
      resumo: eleito.slug ? (resumoPorSlug.get(eleito.slug) ?? null) : null,
    }]
  })
  if (eleitos.length === 0) return null
  const porUf = new Map(eleitos.map((e) => [e.uf, e]))
  const regioes: RegiaoEleitos[] = Object.entries(REGIONS).flatMap(([nome, siglas]) => {
    const daRegiao = siglas.map((s) => porUf.get(s)).filter((e): e is Eleito => Boolean(e)).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
    return daRegiao.length === 0 ? [] : [{ nome, estados: listaComE(daRegiao.map((e) => e.nome)), ufs: daRegiao.map((e) => e.uf) }]
  })
  const inicial = [...eleitos].sort((a, b) => (b.disputa.totais.eleitorado ?? 0) - (a.disputa.totais.eleitorado ?? 0))[0].uf
  const linhas = Object.fromEntries(
    eleitos.map((e) => [e.uf, { rotulo: `${e.nome}: ${e.eleito.nome_urna} (${e.eleito.partido}), ${formatarPercentual(e.eleito.percentual_validos)}`, conteudo: <Linha e={e} fotos={fotos} /> }]),
  )
  const cards = Object.fromEntries(eleitos.map((e) => [e.uf, <Card key={e.uf} e={e} fotos={fotos} />]))
  return (
    <section id="governadores-eleitos-1turno" className="scroll-mt-24" aria-labelledby="governadores-eleitos-1turno-titulo">
      <TituloSecao titulo="Governadores eleitos no 1º turno" id="governadores-eleitos-1turno-titulo">
        {eleitos.length} {eleitos.length === 1 ? "estado com resultado definido" : "estados com resultado definido"}. Percentuais dos votos válidos no 1º turno.
      </TituloSecao>
      <SlashDivider className="mb-6 mt-6" />
      <GovernadoresEleitosInterativo regioes={regioes} linhas={linhas} cards={cards} inicial={inicial} />
      <p className="mt-4 text-[length:var(--text-caption)] font-medium text-muted-foreground">
        Fonte: TSE, resultado do 1º turno. &quot;Na ficha&quot;: os mesmos números da ficha de cada candidato.
      </p>
    </section>
  )
}

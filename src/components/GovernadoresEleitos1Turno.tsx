// cspell:ignore atipico eleitorado legivel
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
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
import { GovernadoresEleitosInterativo } from "@/components/GovernadoresEleitosInterativo"

const NUMERO = new Intl.NumberFormat("pt-BR")
const LINK = "inline-flex min-h-11 items-center gap-1 whitespace-nowrap text-[length:var(--text-caption)] font-bold text-foreground underline underline-offset-4 hover:text-[var(--gray-600)]"

interface Eleito {
  uf: string
  nome: string
  disputa: DisputaResultado1Turno
  eleito: CandidatoResultado1Turno
  segundo: CandidatoResultado1Turno | null
  resumo: CandidatoResumo | null
}

/** Nome de urna em caixa de leitura; sigla sem vogal ("JHC") fica em maiúsculas. */
function nomeDaLinha(nomeUrna: string): string {
  return nomeLegivel(nomeUrna)
    .split(" ")
    .map((parte, i) => {
      const original = nomeUrna.split(/\s+/)[i] ?? parte
      return /^[B-DF-HJ-NP-TV-Z]{3,}$/i.test(original) ? original.toUpperCase() : parte
    })
    .join(" ")
}

function Linha({ e, fotos }: { e: Eleito; fotos?: FotosCandidatos }) {
  return (
    <>
      <FotoCandidato candidato={e.eleito} fotos={fotos} tamanho={48} className="size-9 shrink-0 xl:size-11" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-heading text-[length:var(--text-body-lg)] uppercase leading-tight text-foreground">
          {e.nome} <span className="font-sans text-[length:var(--text-caption)] font-bold text-muted-foreground">· {e.uf}</span>
        </span>
        <span className="mt-0.5 block truncate text-[length:var(--text-caption)] leading-tight xl:text-[length:var(--text-body-sm)]">
          <span className="font-bold text-foreground">{nomeDaLinha(e.eleito.nome_urna)}</span>
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block font-heading text-[length:var(--text-body-lg)] leading-none tabular-nums text-foreground xl:text-[length:var(--text-heading-sm)]">
          {formatarPercentual(e.eleito.percentual_validos)}
        </span>
        <span className="mt-1 block text-[length:var(--text-eyebrow)] font-bold uppercase text-muted-foreground">{e.eleito.partido}</span>
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
    <article className="flex h-full flex-col rounded-[6px] border border-border bg-[var(--gray-50)] p-5 lg:[@media(max-height:800px)]:p-4 xl:p-6" data-pf-eleito-card={e.uf.toLowerCase()}>
      <p className="text-[length:var(--text-body-sm)] font-bold uppercase text-muted-foreground">
        {e.nome} · {e.uf} <span className="font-medium normal-case text-foreground">· Eleito no 1º turno</span>
      </p>
      <div className="mt-3 flex items-center gap-4">
        <FotoCandidato candidato={e.eleito} fotos={fotos} tamanho={80} className="size-16 shrink-0 lg:size-14 xl:size-20" initialsClassName="text-lg" />
        <div className="min-w-0">
          <h3 className="break-words font-heading text-[length:var(--text-heading)] uppercase leading-none text-foreground">{e.eleito.nome_urna}</h3>
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

      <p className="mt-3 font-heading text-[clamp(2rem,min(3.4vw,5.5vh),3rem)] leading-none tabular-nums text-foreground">{formatarPercentual(pa)}</p>
      <p className="mt-1 text-[length:var(--text-caption)] font-medium text-muted-foreground">
        dos votos válidos no 1º turno · {NUMERO.format(e.eleito.votos)} votos
      </p>

      {e.segundo && (
        <div className="mt-3 border-t border-border pt-3" data-pf-eleito-segundo>
          <p className="flex items-baseline justify-between gap-3 text-[length:var(--text-caption)]">
            <span className="min-w-0 font-medium text-muted-foreground">
              2º colocado: <span className="font-bold text-foreground">{nomeLegivel(e.segundo.nome_urna)}</span> ({e.segundo.partido})
            </span>
            <span className="shrink-0 font-bold tabular-nums text-foreground">{formatarPercentual(pb)}</span>
          </p>
          <div className="mt-1.5 space-y-1 lg:[@media(max-height:800px)]:hidden" aria-hidden="true">
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--gray-200)]">
              <div className="h-full rounded-full bg-[var(--gray-950)]" style={{ width: largura(pa) }} />
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--gray-200)]">
              <div className="h-full rounded-full bg-[var(--gray-400)]" style={{ width: largura(pb) }} />
            </div>
          </div>
          {pa !== null && pb !== null && (
            <p className="mt-1.5 text-[length:var(--text-caption)] font-medium text-muted-foreground">
              Vantagem de <span className="font-bold text-foreground">{formatarMargem(pa - pb)}</span>
            </p>
          )}
        </div>
      )}

      {r && (
        <div className="mb-2 mt-3 border-t border-border pt-3" data-pf-eleito-ficha>
          <p className="text-[length:var(--text-caption)] font-bold uppercase text-foreground">Na ficha</p>
          <dl className="mt-2 grid grid-cols-3 gap-3">
            <Indicador valor={NUMERO.format(r.pontos_atencao)} rotulo={r.pontos_atencao === 1 ? "Ponto de atenção" : "Pontos de atenção"} />
            <Indicador valor={NUMERO.format(r.processos)} rotulo={r.processos === 1 ? "Processo" : "Processos"} />
            <Indicador
              valor={r.patrimonio !== null ? formatCompact(r.patrimonio) : "Sem dado"}
              rotulo="Patrimônio declarado"
              nota={r.patrimonio !== null && r.patrimonio_atipico ? PATRIMONIO_ATIPICO_ROTULO : undefined}
            />
          </dl>
          {r.patrimonio !== null && r.patrimonio_atipico && (
            <p className="mt-1.5 text-[length:var(--text-caption)] font-medium text-muted-foreground">* Patrimônio: {PATRIMONIO_ATIPICO_ROTULO}.</p>
          )}
        </div>
      )}

      <div className="mt-auto flex flex-wrap gap-x-4 border-t border-border pt-1">
        {fichaHref && (
          <Link href={fichaHref} className={LINK} aria-label={`Ver ficha completa de ${e.eleito.nome_urna}`}>
            Ficha completa <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </Link>
        )}
        <Link href={href1Turno(e.uf)} className={LINK} aria-label={`Ver resultado completo de ${e.nome}`}>
          Resultado do estado <ArrowUpRight className="size-3.5" aria-hidden="true" />
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
  const inicial = [...eleitos].sort((a, b) => (b.disputa.totais.eleitorado ?? 0) - (a.disputa.totais.eleitorado ?? 0))[0].uf
  const linhas = [...eleitos]
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
    .map((e) => ({ uf: e.uf, rotulo: `${e.nome}: ${e.eleito.nome_urna} (${e.eleito.partido}), ${formatarPercentual(e.eleito.percentual_validos)}`, conteudo: <Linha e={e} fotos={fotos} /> }))
  const cards = Object.fromEntries(eleitos.map((e) => [e.uf, <Card key={e.uf} e={e} fotos={fotos} />]))
  return (
    <section id="governadores-eleitos-1turno" className="scroll-mt-24" aria-labelledby="governadores-eleitos-1turno-titulo">
      <TituloSecao titulo="Governadores eleitos no 1º turno" id="governadores-eleitos-1turno-titulo">
        {eleitos.length} {eleitos.length === 1 ? "estado com resultado definido" : "estados com resultado definido"}. Percentuais dos votos válidos no 1º turno.
      </TituloSecao>
      <SlashDivider className="mb-4 mt-4" />
      <GovernadoresEleitosInterativo linhas={linhas} cards={cards} inicial={inicial} />
      <p className="mt-3 text-[length:var(--text-caption)] font-medium text-muted-foreground">
        Fonte: TSE, resultado do 1º turno. &quot;Na ficha&quot;: os mesmos números da ficha de cada candidato.
      </p>
    </section>
  )
}

// cspell:ignore eleitorado legivel
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { BRAZIL_STATES } from "@/data/brazil-states"
import { getEstadoNome } from "@/lib/br-uf"
import { nomeLegivel } from "@/lib/compartilhar-duelo"
import { corDoPartido } from "@/lib/cores-finalistas"
import { formatarMargem } from "@/lib/mapa-presidente-uf"
import {
  formatarPercentual,
  getDisputa1Turno,
  href1Turno,
  rotuloCompanheiro1Turno,
  type CandidatoResultado1Turno,
  type Resultados1Turno,
} from "@/lib/resultados-1turno"
import type { FotosCandidatos } from "@/lib/resultados-1turno-vista"
import { FotoCandidato, NomeDoCandidato, TituloSecao } from "@/components/Resultado1TurnoPartes"
import { SlashDivider } from "@/components/SlashDivider"
import { SenadoMapa } from "@/components/SenadoMapa"
import { RotulosMapaBrasil } from "@/components/RotulosMapaBrasil"

const NUMERO = new Intl.NumberFormat("pt-BR")

const SEM_COR = "var(--gray-300)"

interface EstadoSenado {
  uf: string
  nome: string
  eleitos: CandidatoResultado1Turno[]
  fora: CandidatoResultado1Turno | null
  eleitorado: number
}

function Eleito({ c, fotos }: { c: CandidatoResultado1Turno; fotos?: FotosCandidatos }) {
  const suplentes = c.companheiros.filter((x) => x.tipo.startsWith("s"))
  const cor = corDoPartido(c.partido)
  return (
    <li className="border-t border-border py-4 first:border-t-0 first:pt-0" data-pf-senado-eleito={c.slug ?? c.sq}>
      <div className="flex items-center gap-3">
        <FotoCandidato candidato={c} fotos={fotos} tamanho={64} className="size-14 shrink-0 xl:size-16" initialsClassName="text-sm" />
        <div className="min-w-0 flex-1">
          <p className="break-words font-heading text-[length:var(--text-heading-sm)] uppercase leading-none text-foreground">
            <NomeDoCandidato candidato={c} cargo="Senador" className="" />
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-[length:var(--text-caption)] font-medium text-muted-foreground">
            <span aria-hidden="true" className="inline-block size-2.5 rounded-full" style={{ background: cor?.cor ?? "var(--gray-300)" }} />
            {c.partido}
            {c.numero ? ` · nº ${c.numero}` : ""}
            {cor ? ` · ${cor.rotulo}` : ""}
          </p>
        </div>
        <p className="shrink-0 text-right">
          <span className="block font-heading text-[length:var(--text-heading)] leading-none tabular-nums text-foreground">{formatarPercentual(c.percentual_validos)}</span>
          <span className="mt-1 block text-[length:var(--text-caption)] font-medium tabular-nums text-muted-foreground">{NUMERO.format(c.votos)} votos</span>
        </p>
      </div>
      {suplentes.length > 0 && (
        <p className="mt-2 text-[length:var(--text-caption)] font-medium leading-relaxed text-muted-foreground">
          {suplentes.map((s, i) => (
            <span key={s.tipo}>
              {i > 0 && " · "}
              {rotuloCompanheiro1Turno(s.tipo)}: <span className="font-bold text-foreground">{nomeLegivel(s.nome)}</span>
              {s.partido ? ` (${s.partido})` : ""}
            </span>
          ))}
        </p>
      )}
    </li>
  )
}

function Card({ e, fotos }: { e: EstadoSenado; fotos?: FotosCandidatos }) {
  const segunda = e.eleitos[1]?.percentual_validos ?? null
  const foraPct = e.fora?.percentual_validos ?? null
  return (
    <article className="rounded-[6px] border border-border bg-[var(--gray-50)] p-5 xl:p-6" data-pf-senado-card={e.uf.toLowerCase()}>
      <p className="text-[length:var(--text-body-sm)] font-bold uppercase text-muted-foreground">
        {e.nome} · {e.uf} <span className="font-medium normal-case text-foreground">· {e.eleitos.length === 1 ? "1 vaga" : `${e.eleitos.length} vagas`}</span>
      </p>
      <ul className="mt-4">
        {e.eleitos.map((c) => (
          <Eleito key={c.sq} c={c} fotos={fotos} />
        ))}
      </ul>
      {e.fora && (
        <div className="mt-1 border-t border-border pt-4" data-pf-senado-fora>
          <p className="text-[length:var(--text-caption)] font-bold uppercase text-foreground">Ficou de fora</p>
          <p className="mt-1.5 flex items-baseline justify-between gap-3 text-[length:var(--text-body-sm)]">
            <span className="min-w-0 font-medium text-muted-foreground">
              3º colocado: <span className="font-bold text-foreground">{nomeLegivel(e.fora.nome_urna)}</span> ({e.fora.partido})
            </span>
            <span className="shrink-0 font-bold tabular-nums text-foreground">{formatarPercentual(foraPct)}</span>
          </p>
          {segunda !== null && foraPct !== null && (
            <p className="mt-1 text-[length:var(--text-caption)] font-medium text-muted-foreground">
              <span className="font-bold text-foreground">{formatarMargem(segunda - foraPct)}</span> atrás da segunda vaga
            </p>
          )}
        </div>
      )}
      <div className="mt-3 border-t border-border pt-1">
        <Link
          href={href1Turno(e.uf)}
          aria-label={`Ver resultado completo de ${e.nome}`}
          className="inline-flex min-h-11 items-center gap-1 whitespace-nowrap text-[length:var(--text-body-sm)] font-bold text-foreground underline underline-offset-4 hover:text-[var(--gray-600)]"
        >
          Resultado do estado <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
    </article>
  )
}

/**
 * Senado no 1º turno: mosaico das UFs com a cor das duas vagas e o card do
 * estado escolhido (eleitos, suplentes e o 3º colocado). Tudo do snapshot do
 * TSE; a cor sai do lado do partido, a mesma régua do espectro dos eleitos.
 */
export function Senado1Turno({ ufs, data, fotos }: { ufs: string[]; data: Resultados1Turno; fotos?: FotosCandidatos }) {
  const estados: EstadoSenado[] = ufs.flatMap((uf) => {
    const disputa = getDisputa1Turno("Senador", uf, data)
    const sigla = uf.toUpperCase()
    if (!disputa) return []
    const ordenados = disputa.candidatos.filter((c) => c.posicao !== null).sort((a, b) => (a.posicao ?? 0) - (b.posicao ?? 0))
    const eleitos = ordenados.filter((c) => c.fase === "eleito")
    if (eleitos.length === 0) return []
    return [{
      uf: sigla,
      nome: getEstadoNome(uf) ?? sigla,
      eleitos,
      fora: ordenados.find((c) => c.fase !== "eleito") ?? null,
      eleitorado: disputa.totais.eleitorado ?? 0,
    }]
  })
  if (estados.length === 0) return null

  const porUf = new Map(estados.map((e) => [e.uf, e]))
  /** Cor cheia com as duas vagas do mesmo lado; listras com uma vaga de cada lado. */
  const pares = new Map<string, [string, string]>()
  const preenchimento = (e: EstadoSenado | undefined): string => {
    if (!e) return SEM_COR
    const [a, b] = [0, 1].map((i) => corDoPartido(e.eleitos[i]?.partido))
    const ca = a?.cor ?? SEM_COR
    const cb = e.eleitos.length > 1 ? (b?.cor ?? SEM_COR) : ca
    if (ca === cb) return ca
    const [x, y] = [ca, cb].sort()
    const id = `pf-senado-listra-${[a?.classe ?? "sem", b?.classe ?? "sem"].sort().join("-")}`
    pares.set(id, [x, y])
    return `url(#${id})`
  }
  const fills = new Map(BRAZIL_STATES.map((estado) => [estado.sigla, preenchimento(porUf.get(estado.sigla))]))
  const mapa = (
    <svg viewBox="-20 -20 900 950" role="group" aria-label="Mapa do Senado: as duas vagas de cada estado pelo lado do partido de cada eleito" className="block w-full" data-pf-senado-mapa>
      <defs>
        {[...pares].map(([id, [x, y]]) => (
          <pattern key={id} id={id} width={18} height={18} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width={9} height={18} fill={x} />
            <rect x={9} width={9} height={18} fill={y} />
          </pattern>
        ))}
      </defs>
      {BRAZIL_STATES.map((estado) => {
        const e = porUf.get(estado.sigla)
        const rotulo = e ? `${e.nome}: ${e.eleitos.map((c) => `${c.nome_urna} (${c.partido})`).join(" e ")}` : `${estado.name}: sem dado`
        return (
          <path
            key={estado.sigla}
            id={`pf-senado-uf-${estado.sigla}`}
            d={estado.d}
            data-pf-senado-uf={estado.sigla.toLowerCase()}
            fill={fills.get(estado.sigla)}
            stroke="var(--background)"
            strokeWidth={estado.sigla === "DF" ? 2.4 : 1.2}
            {...(e ? { role: "button", tabIndex: 0, "aria-label": `${rotulo}. Ver detalhes` } : { role: "img", "aria-label": rotulo })}
            className="cursor-pointer outline-none transition-opacity duration-150 hover:opacity-85 focus-visible:opacity-80 motion-reduce:transition-none"
          >
            <title>{rotulo}</title>
          </path>
        )
      })}
      <RotulosMapaBrasil contorno />
    </svg>
  )
  const inicial = [...estados].sort((a, b) => b.eleitorado - a.eleitorado)[0].uf
  const cards = Object.fromEntries(estados.map((e) => [e.uf, <Card key={e.uf} e={e} fotos={fotos} />]))

  const contagem = new Map<string, { rotulo: string; cor: string; vagas: number }>()
  let semClasse = 0
  for (const c of estados.flatMap((e) => e.eleitos)) {
    const cor = corDoPartido(c.partido)
    if (!cor) {
      semClasse += 1
      continue
    }
    const atual = contagem.get(cor.classe) ?? { rotulo: cor.rotulo, cor: cor.cor, vagas: 0 }
    atual.vagas += 1
    contagem.set(cor.classe, atual)
  }
  const legenda = (
    <ul className="mx-auto mt-5 flex max-w-[34rem] flex-wrap justify-center gap-x-5 gap-y-2 text-[length:var(--text-caption)] font-medium text-muted-foreground" data-pf-senado-legenda>
      {[...contagem.values()].sort((a, b) => b.vagas - a.vagas).map((c) => (
        <li key={c.rotulo} className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block size-3 rounded-[3px]" style={{ background: c.cor }} />
          {c.rotulo}: <span className="font-bold tabular-nums text-foreground">{c.vagas} {c.vagas === 1 ? "vaga" : "vagas"}</span>
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="inline-block size-3 rounded-[3px]"
          style={{ background: "repeating-linear-gradient(45deg, var(--gray-700) 0 3px, var(--gray-300) 3px 6px)" }}
        />
        Listrado: uma vaga de cada lado
      </li>
      {semClasse > 0 && (
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block size-3 rounded-[3px]" style={{ background: "var(--gray-300)" }} />
          Sem classificação: <span className="font-bold tabular-nums text-foreground">{semClasse}</span>
        </li>
      )}
    </ul>
  )

  return (
    <section id="senado-1turno" className="scroll-mt-24" aria-labelledby="senado-1turno-titulo">
      <TituloSecao titulo="Senado" id="senado-1turno-titulo">
        As duas vagas de cada estado foram decididas no 1º turno. A cor mostra o lado do partido dos eleitos.
      </TituloSecao>
      <SlashDivider className="mb-5 mt-4" />
      <SenadoMapa mapa={mapa} cards={cards} legenda={legenda} inicial={inicial} />
      <p className="mt-4 text-[length:var(--text-caption)] font-medium text-muted-foreground">
        Fonte: TSE, resultado do 1º turno. Lado do partido pela mesma régua da seção de espectro.
      </p>
    </section>
  )
}

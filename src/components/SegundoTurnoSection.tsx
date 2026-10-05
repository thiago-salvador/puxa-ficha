import Link from "next/link"
import { ArrowRight, ExternalLink } from "lucide-react"
import type { Candidato } from "@/lib/types"
import { getEstadoNome } from "@/lib/api"
import { linkCompararFinalistas, rotuloFaseEleitoral } from "@/lib/fase-eleitoral-publica"
import { FaseEleitoralSelo } from "@/components/FaseEleitoralSelo"
import { UfResultadoSelector } from "@/components/UfResultadoSelector"

interface SegundoTurnoSectionProps {
  candidatos: Candidato[]
  /** Home mostra o índice por UF; páginas estaduais mostram o resultado local. */
  mostrarGovernadores?: boolean
  /** A home já lista os finalistas da Presidência na grade de candidatos; evita mostrá-los duas vezes. */
  mostrarPresidencia?: boolean
  className?: string
}

function ResultadoCandidato({ candidato }: { candidato: Candidato }) {
  const label = rotuloFaseEleitoral(candidato)
  if (!label) return null
  return (
    <article className="min-w-0 rounded-[16px] border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-col items-start gap-3 sm:flex-row">
        {candidato.foto_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={candidato.foto_url} alt="" className="size-14 shrink-0 rounded-full object-cover object-top" loading="lazy" />
        ) : null}
        <div className="min-w-0">
          <p className="break-words font-heading text-lg uppercase leading-tight text-foreground">{candidato.nome_urna}</p>
          <p className="mt-1 text-sm font-medium text-muted-foreground">{candidato.partido_sigla}</p>
        </div>
      </div>
      <FaseEleitoralSelo candidato={candidato} className="mt-4" compact />
      <Link
        href={`/candidato/${candidato.slug}`}
        className="mt-4 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-foreground underline underline-offset-4"
      >
        Ver ficha <ArrowRight className="size-3.5" aria-hidden="true" />
      </Link>
    </article>
  )
}

function grupoPorUf(candidatos: Candidato[]) {
  const groups = new Map<string, Candidato[]>()
  for (const candidato of candidatos) {
    if (candidato.cargo_disputado !== "Governador" || !candidato.estado) continue
    const grupo = groups.get(candidato.estado) ?? []
    grupo.push(candidato)
    groups.set(candidato.estado, grupo)
  }
  return [...groups.entries()]
    .map(([uf, items]) => [uf, items] as const)
    .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
}

export function SegundoTurnoSection({ candidatos, mostrarGovernadores = true, mostrarPresidencia = true, className = "" }: SegundoTurnoSectionProps) {
  const fasesAtivas = candidatos.some((candidato) => {
    const fase = candidato.fase_eleitoral_2026?.fase_eleitoral
    return Boolean(fase && fase !== "em_disputa")
  })
  if (!fasesAtivas) return null

  const presidentes = mostrarPresidencia ? candidatos.filter((candidato) => candidato.cargo_disputado === "Presidente") : []
  const presidenteEleito = presidentes.find((candidato) => candidato.fase_eleitoral_2026?.fase_eleitoral === "eleito")
  const presidentesFinalistas = presidentes.filter((candidato) => candidato.fase_eleitoral_2026?.fase_eleitoral === "segundo_turno")
  const presidenteDestaque = presidenteEleito ? [presidenteEleito] : presidentesFinalistas
  const compararPresidente = linkCompararFinalistas(presidentes)
  const gruposGovernadores = grupoPorUf(candidatos).filter(([, items]) => items.some((candidato) => {
    const fase = candidato.fase_eleitoral_2026?.fase_eleitoral
    return Boolean(fase && fase !== "em_disputa")
  }))
  const ufsComResultado = gruposGovernadores.map(([uf]) => ({ uf, label: getEstadoNome(uf) ?? uf.toUpperCase() }))

  if (presidenteDestaque.length === 0 && (!mostrarGovernadores || gruposGovernadores.length === 0)) return null

  return (
    <section className={`mx-auto max-w-7xl px-5 py-8 md:px-12 lg:py-12 ${className}`.trim()} data-pf-segundo-turno="">
      <div className="rounded-[20px] border border-foreground/20 bg-secondary/30 p-5 sm:p-8">
        <header className="max-w-3xl">
          <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-muted-foreground">Resultado oficial</p>
          <h2 className="mt-2 font-heading text-3xl uppercase leading-none text-foreground sm:text-5xl">2º turno</h2>
          <p className="mt-3 text-sm font-medium leading-relaxed text-muted-foreground">As fases abaixo refletem o resultado oficial do primeiro turno quando publicado nesta cobertura.</p>
        </header>

        {presidenteDestaque.length > 0 && (
          <div className="mt-7">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h3 className="font-heading text-xl uppercase text-foreground">Presidência</h3>
              {compararPresidente && (
                <Link href={compararPresidente} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-foreground underline underline-offset-4">
                  Comparar os dois finalistas <ExternalLink className="size-3.5" aria-hidden="true" />
                </Link>
              )}
            </div>
            <div className={`mt-3 grid ${presidenteDestaque.length === 1 ? "grid-cols-1" : "grid-cols-2"} gap-2 sm:gap-3`}>{presidenteDestaque.map((candidato) => <ResultadoCandidato key={candidato.id} candidato={candidato} />)}</div>
          </div>
        )}

        {mostrarGovernadores && gruposGovernadores.length > 0 && (
          <div className="mt-8 border-t border-border/70 pt-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="font-heading text-xl uppercase text-foreground">Governadores</h3>
                <p className="mt-1 text-sm text-muted-foreground">Finalistas e vencedores por estado.</p>
              </div>
              <UfResultadoSelector options={ufsComResultado} />
            </div>
            <div className="mt-4 space-y-5">
              {gruposGovernadores.map(([uf, items]) => {
                const resultado = items.filter((candidato) => candidato.fase_eleitoral_2026)
                const vencedores = resultado.filter((candidato) => candidato.fase_eleitoral_2026?.fase_eleitoral === "eleito")
                const finalistas = resultado.filter((candidato) => candidato.fase_eleitoral_2026?.fase_eleitoral === "segundo_turno")
                const destaques = vencedores.length > 0 ? vencedores : finalistas
                const comparar = linkCompararFinalistas(items)
                return (
                  <div key={uf} className="rounded-[16px] border border-border bg-card p-4 sm:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="font-heading text-lg uppercase text-foreground">{getEstadoNome(uf) ?? uf.toUpperCase()}</h4>
                      {comparar && <Link href={comparar} className="text-sm font-semibold text-foreground underline underline-offset-4">Comparar os dois finalistas</Link>}
                    </div>
                    <div className={`mt-3 grid ${destaques.length === 1 ? "grid-cols-1" : "grid-cols-2"} gap-2 sm:gap-3`}>{destaques.map((candidato) => <ResultadoCandidato key={candidato.id} candidato={candidato} />)}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

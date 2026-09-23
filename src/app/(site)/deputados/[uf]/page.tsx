import type { Metadata } from "next"
import { notFound, permanentRedirect } from "next/navigation"
import Link from "next/link"
import { Footer } from "@/components/Footer"
import { SectionDivider } from "@/components/SectionHeader"
import { DeputadosList } from "@/components/DeputadosList"
import { buildTwitterMetadata } from "@/lib/metadata"
import { getEstadoNome, getEstadoUFs } from "@/lib/br-uf"
import { getDeputadosRoster, type DeputadoCargo } from "@/lib/deputados-roster"

export const revalidate = 3600

export function generateStaticParams() {
  return getEstadoUFs().map((uf) => ({ uf }))
}

export async function generateMetadata({ params }: { params: Promise<{ uf: string }> }): Promise<Metadata> {
  const { uf } = await params
  const nome = getEstadoNome(uf)
  if (!nome) return {}
  const title = `Deputados de ${nome} (${uf.toUpperCase()}) | Puxa Ficha`
  const description = `Consulte candidaturas a deputado federal e estadual de ${nome} no snapshot oficial de 2026.`
  return {
    title,
    description,
    alternates: { canonical: `/deputados/${uf.toLowerCase()}` },
    openGraph: { title, description, url: `https://puxaficha.com.br/deputados/${uf.toLowerCase()}`, images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: title }] },
    twitter: buildTwitterMetadata({ title, description, image: "/opengraph-image" }),
  }
}

function parseCargo(value: string | string[] | undefined, uf: string): DeputadoCargo {
  const cargo = Array.isArray(value) ? value[0] : value
  if (cargo === "deputado_federal") return cargo
  return uf === "DF" ? "deputado_distrital" : "deputado_estadual"
}

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) || ""
}

export default async function DeputadosUfPage({
  params,
  searchParams,
}: {
  params: Promise<{ uf: string }>
  searchParams: Promise<{ cargo?: string | string[]; q?: string | string[]; pagina?: string | string[] }>
}) {
  const { uf: rawUf } = await params
  const uf = rawUf.toLowerCase()
  if (rawUf !== uf) permanentRedirect(`/deputados/${uf}`)
  const nome = getEstadoNome(uf)
  if (!nome) notFound()
  const query = await searchParams
  const cargo = parseCargo(query.cargo, uf.toUpperCase())
  const search = first(query.q).trim().slice(0, 80)
  const parsedPage = Number.parseInt(first(query.pagina), 10)
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1
  const result = await getDeputadosRoster({ uf: uf.toUpperCase(), cargo, search, page })
  const estadualCargo = uf.toUpperCase() === "DF" ? "deputado_distrital" : "deputado_estadual"
  const tabHref = (tab: DeputadoCargo) => {
    const params = new URLSearchParams({ cargo: tab })
    if (search) params.set("q", search)
    return `/deputados/${uf}?${params.toString()}`
  }
  return <div className="min-h-screen bg-background"><div>
    <section className="bg-foreground px-5 pb-12 pt-28 text-background sm:pt-36 md:px-12"><div className="mx-auto max-w-7xl"><p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-background/65">Eleições 2026 · {uf.toUpperCase()}</p><h1 className="mt-2 font-heading text-[clamp(2.75rem,8vw,6rem)] uppercase leading-[.88]">Deputados de {nome}</h1><p className="mt-5 max-w-2xl text-base font-medium leading-relaxed text-background/75">Candidaturas por UF com número de urna, partido e situação do registro. A lista indica quando a cobertura do snapshot ainda é parcial.</p></div></section>
    <SectionDivider />
    <nav aria-label="Cargo de deputado" className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-5 pt-8 md:px-12"><Link href={tabHref("deputado_federal")} className={`min-h-11 shrink-0 rounded-full border px-4 py-2 text-sm font-bold ${cargo === "deputado_federal" ? "border-foreground bg-foreground text-background" : "border-border text-foreground"}`}>Federal</Link><Link href={tabHref(estadualCargo)} className={`min-h-11 shrink-0 rounded-full border px-4 py-2 text-sm font-bold ${cargo === estadualCargo ? "border-foreground bg-foreground text-background" : "border-border text-foreground"}`}>{uf.toUpperCase() === "DF" ? "Distrital" : "Estadual"}</Link></nav>
    <DeputadosList uf={uf} cargo={cargo} search={search} page={page} total={result.total} rows={result.rows} snapshot={result.snapshot} partial={result.sourceStatus === "partial" || (!search && result.total === 0)} sourceMessage={result.sourceMessage} />
  </div><Footer /></div>
}

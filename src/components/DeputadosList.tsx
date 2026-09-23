import Link from "next/link"
import { ArrowLeft, ArrowRight, Search } from "lucide-react"
import { CandidatePhoto } from "@/components/CandidatePhoto"
import {
  cargoLabel,
  DEPUTADOS_PAGE_SIZE,
  formatRosterDate,
  type DeputadoCargo,
  type DeputadoRosterRow,
} from "@/lib/deputados-roster"

function queryHref(uf: string, cargo: DeputadoCargo, search: string, page: number) {
  const params = new URLSearchParams({ cargo })
  if (search) params.set("q", search)
  if (page > 1) params.set("pagina", String(page))
  return `/deputados/${uf.toLowerCase()}?${params.toString()}`
}

export function DeputadosList({
  uf,
  cargo,
  search,
  page,
  total,
  rows,
  snapshot,
  partial,
  sourceMessage,
}: {
  uf: string
  cargo: DeputadoCargo
  search: string
  page: number
  total: number
  rows: DeputadoRosterRow[]
  snapshot: string | null
  partial: boolean
  sourceMessage: string | null
}) {
  const pages = Math.max(1, Math.ceil(total / DEPUTADOS_PAGE_SIZE))
  return (
    <section aria-labelledby="lista-deputados" className="mx-auto max-w-7xl px-5 py-10 md:px-12 lg:py-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-muted-foreground">Snapshot TSE · 2026</p>
          <h2 id="lista-deputados" className="mt-2 font-heading text-[length:var(--text-heading-sm)] uppercase leading-none text-foreground sm:text-[length:var(--text-heading)]">{cargoLabel(cargo)}</h2>
        </div>
        <p className="text-sm font-semibold text-muted-foreground">{total ? `${total.toLocaleString("pt-BR")} candidaturas` : "Nenhuma candidatura carregada"}</p>
      </div>
      <form role="search" className="mt-7 flex flex-col gap-3 sm:flex-row" action={`/deputados/${uf.toLowerCase()}`}>
        <input type="hidden" name="cargo" value={cargo} />
        <label className="sr-only" htmlFor="deputados-busca">Buscar por nome, número ou partido</label>
        <div className="flex min-h-12 flex-1 items-center gap-2 rounded-lg border border-border bg-card px-3 focus-within:ring-2 focus-within:ring-foreground/30">
          <Search aria-hidden="true" className="size-4 text-muted-foreground" />
          <input id="deputados-busca" name="q" defaultValue={search} placeholder="Nome, número ou partido" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
        </div>
        <button type="submit" className="min-h-12 rounded-lg bg-foreground px-5 text-sm font-bold text-background transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2">Buscar</button>
      </form>
      <div className="mt-7 overflow-hidden rounded-xl border border-border bg-card">
        {rows.length ? <ul className="divide-y divide-border" aria-label={`Candidaturas a ${cargoLabel(cargo)}`}>
          {rows.map((row) => <li key={row.sq_candidato} className="flex flex-wrap items-center gap-4 px-4 py-4 sm:px-5">
            <CandidatePhoto src={row.foto_path} alt={`Foto de ${row.nome_urna}`} name={row.nome_urna} width={48} height={64} sizes="48px" className="h-16 w-12 shrink-0 rounded-md object-cover" initialsClassName="text-xs" />
            <div className="min-w-0 flex-1"><p className="font-bold text-foreground">{row.nome_urna}</p><p className="mt-1 text-xs text-muted-foreground">{row.nome_completo}</p></div>
            <div className="flex flex-wrap items-center gap-3 text-sm"><span className="font-mono font-bold text-foreground">{row.numero_urna}</span><span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-bold text-foreground">{row.partido_sigla || "Partido não informado"}</span><span className="text-xs text-muted-foreground">{row.situacao_registro || "Situação não informada"}</span></div>
          </li>)}
        </ul> : <div className="px-5 py-12 text-center"><p className="font-bold text-foreground">{partial ? "Cobertura parcial" : "Nenhuma candidatura encontrada"}</p><p className="mt-2 text-sm text-muted-foreground">{sourceMessage || (search ? "Tente outro nome, número ou partido." : "O snapshot oficial ainda não está disponível para esta UF e cargo.")}</p></div>}
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground"><span>Snapshot gerado em {formatRosterDate(snapshot)}. Fonte: <a className="font-semibold underline underline-offset-2" href="https://dadosabertos.tse.jus.br/dataset/candidatos-2026" target="_blank" rel="noopener noreferrer">TSE</a>.</span><span aria-label={`Página ${page} de ${pages}`}>Página {page} de {pages}</span></div>
      {pages > 1 && <nav aria-label="Paginação da lista de deputados" className="mt-5 flex justify-end gap-2"><Link aria-disabled={page <= 1} href={page > 1 ? queryHref(uf, cargo, search, page - 1) : "#"} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-bold text-foreground aria-disabled:pointer-events-none aria-disabled:opacity-40"><ArrowLeft aria-hidden="true" className="size-4" />Anterior</Link><Link aria-disabled={page >= pages} href={page < pages ? queryHref(uf, cargo, search, page + 1) : "#"} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-bold text-foreground aria-disabled:pointer-events-none aria-disabled:opacity-40">Próxima<ArrowRight aria-hidden="true" className="size-4" /></Link></nav>}
    </section>
  )
}

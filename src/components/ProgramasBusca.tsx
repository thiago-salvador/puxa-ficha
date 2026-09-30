"use client"

// cspell:words pesquisável

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState, type FormEvent, type ReactNode } from "react"
import type { ProgramaBuscaCandidato, ProgramaBuscaResposta, ProgramaBuscaResultado } from "@/lib/programa-governo-busca"

const fieldClass = "mt-2 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
const linkClass = "inline-flex min-h-11 items-center rounded-lg border border-border px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring hover:bg-muted"

function Highlight({ resultado }: { resultado: ProgramaBuscaResultado }) {
  const parts: ReactNode[] = []
  let cursor = 0
  for (const match of resultado.matches) {
    parts.push(resultado.trecho.slice(cursor, match.start))
    parts.push(<mark key={match.start} className="rounded-sm bg-yellow-200 text-black">{resultado.trecho.slice(match.start, match.end)}</mark>)
    cursor = match.end
  }
  parts.push(resultado.trecho.slice(cursor))
  return <>{parts}</>
}

function Result({ resultado: r }: { resultado: ProgramaBuscaResultado }) {
  return (
    <article className="rounded-xl border border-border bg-card p-5" data-pf-programa-busca-resultado="">
      <p className="text-xs font-semibold text-muted-foreground">
        Documento {r.documentoNumero} de {r.documentosTotal} · {r.paginaInicial === r.paginaFinal ? `Página ${r.paginaInicial}` : `Páginas ${r.paginaInicial} a ${r.paginaFinal}`}
      </p>
      <p className="mt-3 whitespace-normal break-words text-[15px] leading-7"><Highlight resultado={r} /></p>
      {r.origem === "ocr" && <p className="mt-3 text-sm text-muted-foreground">Texto extraído por OCR, pode conter erros.</p>}
      {r.paginasSemTexto > 0 && <p className="mt-3 text-sm text-muted-foreground">{r.paginasSemTexto === 1 ? "1 página deste documento não tem texto pesquisável." : `${r.paginasSemTexto} páginas deste documento não têm texto pesquisável.`}</p>}
      <p className="mt-4 break-words text-xs text-muted-foreground">
        Versão {r.version} · SHA-256 {r.sourceSha256.slice(0, 8)} · Coletado em {new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(r.coletadoEm))}
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <a href={r.originalUrl} target="_blank" rel="noreferrer" className={linkClass}>
          {r.originalUrl.includes("/arquivo/doc/") ? "Abrir PDF original" : "Abrir pacote oficial do TSE"}<span className="sr-only">, abre em nova aba</span>
        </a>
        <Link href={r.fichaUrl} prefetch={false} className={linkClass}>Ver seção na ficha</Link>
      </div>
    </article>
  )
}

export function ProgramasBusca({ candidatos }: { candidatos: ProgramaBuscaCandidato[] }) {
  const params = useSearchParams()
  const router = useRouter()
  const search = params.toString()
  const q = params.get("q") ?? ""
  const uf = (params.get("uf") ?? "").toUpperCase()
  const cargo = (params.get("cargo") ?? "").toUpperCase()
  const candidato = params.get("candidato") ?? ""
  const [state, setState] = useState<{ search: string; data: ProgramaBuscaResposta | null; error: string | null } | null>(null)
  const [retry, setRetry] = useState(0)
  const current = state?.search === search ? state : null
  const validQuery = q.trim().length >= 3 && q.trim().length <= 100
  const hasSearch = Boolean(q.trim())
  const loading = validQuery && !current

  useEffect(() => {
    if (!validQuery) return
    const controller = new AbortController()
    let cancelled = false
    fetch(`/api/programas?${search}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null)
          throw new Error(body?.message ?? "Não foi possível consultar os documentos. Tente novamente.")
        }
        return response.json() as Promise<ProgramaBuscaResposta>
      })
      .then((data) => { if (!cancelled) setState({ search, data, error: null }) })
      .catch((error: unknown) => {
        if (!cancelled) setState({ search, data: null, error: error instanceof Error ? error.message : "Busca indisponível." })
      })
    return () => { cancelled = true; controller.abort() }
  }, [search, validQuery, retry])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    const next = new URLSearchParams()
    for (const key of ["q", "uf", "cargo", "candidato"]) {
      const value = String(values.get(key) ?? "").trim()
      if (value) next.set(key, value)
    }
    router.push(`/programas${next.size ? `?${next}` : ""}`, { scroll: false })
  }

  const data = current?.data
  const groups = new Map<string, ProgramaBuscaResultado[]>()
  for (const result of data?.resultados ?? []) groups.set(result.slug, [...(groups.get(result.slug) ?? []), result])
  const semDocumento = data?.semDocumento ?? candidatos.filter((c) => c.estado === "sem_documento_oficial" && (!uf || c.uf === uf) && (!cargo || c.cargo === cargo) && (!candidato || c.slug === candidato))
  function pageUrl(page: number) {
    const next = new URLSearchParams(search)
    next.set("pagina", String(page))
    return `/programas?${next}`
  }

  return (
    <div>
      <form key={search} onSubmit={submit} className="rounded-xl border border-border bg-card p-5 sm:p-6" role="search" aria-label="Buscar em programas de governo">
        <label htmlFor="programas-q" className="text-sm font-semibold">O que você quer encontrar?</label>
        <input id="programas-q" name="q" type="search" defaultValue={q} minLength={3} maxLength={100} required placeholder="Ex.: segurança pública, tarifa zero" aria-describedby="programas-help" className={fieldClass} />
        <p id="programas-help" className="mt-2 text-xs leading-5 text-muted-foreground">Digite de 3 a 100 caracteres. A busca literal ignora acentos e diferenças entre maiúsculas e minúsculas.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <label className="text-sm font-semibold">Candidato
            <select name="candidato" defaultValue={candidato} className={fieldClass} aria-label="Candidato">
              <option value="">Todos os candidatos</option>
              {candidatos.map((c) => <option key={c.slug} value={c.slug}>{c.nomeUrna} ({c.uf})</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold">UF
            <select name="uf" defaultValue={uf} className={fieldClass} aria-label="UF">
              <option value="">Todas as UFs</option>
              {[...new Set(candidatos.map((c) => c.uf))].sort().map((value) => <option key={value} value={value}>{value === "BR" ? "Brasil (presidência)" : value}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold">Cargo
            <select name="cargo" defaultValue={cargo} className={fieldClass} aria-label="Cargo">
              <option value="">Presidente e governador</option>
              <option value="PRESIDENTE">Presidente</option><option value="GOVERNADOR">Governador</option>
            </select>
          </label>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <button className="min-h-11 rounded-lg bg-foreground px-6 py-2 text-sm font-bold text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" type="submit">Buscar programas</button>
          <Link className={linkClass} href="/programas" prefetch={false}>Limpar filtros</Link>
        </div>
      </form>
      <p className="mt-5 text-sm leading-6 text-muted-foreground">Os resultados seguem a ordem alfabética pelo nome de urna do candidato. Cada trecho corresponde a uma ocorrência do termo. A falta de resultado não significa ausência de proposta.</p>
      <div className="mt-6" role="status" aria-live="polite" aria-atomic="true">
        {loading ? "Buscando nos documentos filtrados..." : current?.error ? "Não foi possível concluir a busca." : data ? `${data.total} trechos encontrados. Página ${data.pagina} de ${Math.max(1, data.paginas)}.` : hasSearch ? "Digite de 3 a 100 caracteres para buscar." : "Digite um termo para consultar os programas aprovados."}
      </div>
      {current?.error && <div className="mt-4 rounded-xl border border-border p-5" role="alert"><p>{current.error}</p><button className={`${linkClass} mt-3`} onClick={() => { setState(null); setRetry((n) => n + 1) }}>Tentar novamente</button></div>}
      {data?.total === 0 && <p className="mt-6 rounded-xl border border-border p-5">Nenhum trecho encontrado nos documentos filtrados.</p>}
      <div className="mt-6 space-y-8" aria-busy={loading}>
        {[...groups].map(([slug, results]) => {
          const first = results[0]
          const total = data?.contagens.find((c) => c.slug === slug)?.total ?? results.length
          return <section key={slug} aria-labelledby={`busca-${slug}`}>
            <h2 id={`busca-${slug}`} className="font-heading text-2xl uppercase">{first.nomeUrna}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{first.partido} · {first.cargo === "PRESIDENTE" ? "Presidente" : "Governador"} · {first.uf} · {total} trechos</p>
            <div className="mt-4 space-y-3">{results.map((r, i) => <Result key={`${r.documentoId}-${r.secaoId}-${i}`} resultado={r} />)}</div>
          </section>
        })}
      </div>
      {data && data.paginas > 1 && <nav aria-label="Páginas dos resultados" className="mt-8 flex flex-wrap items-center gap-3">
        {data.pagina > 1 && <Link prefetch={false} className={linkClass} href={pageUrl(data.pagina - 1)}>Página anterior</Link>}
        <span className="text-sm">Página {data.pagina} de {data.paginas}</span>
        {data.pagina < data.paginas && <Link prefetch={false} className={linkClass} href={pageUrl(data.pagina + 1)}>Próxima página</Link>}
      </nav>}
      {semDocumento.length > 0 && <section className="mt-8 rounded-xl border border-border p-5" aria-labelledby="programas-sem-documento">
        <h2 id="programas-sem-documento" className="text-lg font-semibold">Documento oficial não localizado</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Na consulta registrada ao TSE, não foi localizado um programa para estas candidaturas. Isso não permite concluir que não tenham propostas ou que não tenham entregue o documento.</p>
        <ul className="mt-3 space-y-2">{semDocumento.map((c) => <li key={c.slug}><Link href={`/candidato/${c.slug}?tab=programa`} prefetch={false} className="underline underline-offset-4">{c.nomeUrna}</Link> · {c.partido} · {c.uf}</li>)}</ul>
      </section>}
    </div>
  )
}

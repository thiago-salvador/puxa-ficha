"use client"

import { useEffect, useState } from "react"
import type { NoticiaCandidato } from "@/lib/types"
import { formatDate } from "@/lib/utils"
import { normalizeNewsUrl } from "@/lib/news/google-news"
import { mergeLinkedNews, newsSummary, newsTitle } from "@/lib/news/display"
import { ExternalLink, ChevronDown, Search } from "lucide-react"
import { SectionLabel, SectionTitle } from "./SectionHeader"

const VISIBLE_LIMIT = 10

function NewsItem({ noticia, selected }: { noticia: NoticiaCandidato; selected: boolean }) {
  const [open, setOpen] = useState(selected)
  const url = normalizeNewsUrl(noticia.url)
  const summary = newsSummary(noticia)

  return (
    <article id={`noticia-${noticia.id}`} tabIndex={-1} data-pf-news-item={noticia.id}
      className="scroll-mt-32 rounded-lg border border-border bg-card focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring target:border-foreground">
      <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)} className="group">
        <summary className="flex min-h-11 cursor-pointer list-none items-start gap-4 rounded-lg p-5 focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden sm:p-6">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--text-eyebrow)] text-muted-foreground">
              <span className="font-bold uppercase tracking-[0.06em]">{noticia.fonte || "Fonte não informada"}</span>
              <time dateTime={noticia.data_publicacao} className="tabular-nums">{formatDate(noticia.data_publicacao.slice(0, 10))}</time>
              {noticia.contexto_do_pleito && (
                <span data-pf-news-contexto-pleito="" title="O título desta matéria não cita o candidato. É cobertura do pleito, não notícia sobre ele." className="rounded-full border border-border px-2 py-0.5 font-bold uppercase tracking-[0.06em]">Contexto do pleito</span>
              )}
            </div>
            <h3 className="text-base font-semibold leading-snug text-foreground sm:text-lg">{newsTitle(noticia)}</h3>
            <span className="mt-3 inline-block text-[length:var(--text-caption)] font-medium text-muted-foreground">{open ? "Fechar" : summary ? "Ler resumo" : "Ver notícia"}</span>
          </div>
          <ChevronDown aria-hidden="true" className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" />
        </summary>
        <div className="mx-5 border-t border-border pb-5 pt-4 sm:mx-6 sm:pb-6">
          {summary ? (
            <>
              <p className="mb-2 text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.06em] text-muted-foreground">Resumo</p>
              <p className="max-w-prose whitespace-pre-line text-[length:var(--text-body-sm)] leading-relaxed text-foreground">{summary}</p>
            </>
          ) : null}
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-4 py-2 text-[length:var(--text-caption)] font-semibold text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              Ler no portal <ExternalLink aria-hidden="true" className="size-3.5" /><span className="sr-only"> (abre em nova aba)</span>
            </a>
          ) : <p className="mt-3 text-sm text-muted-foreground">Link da matéria indisponível.</p>}
        </div>
      </details>
    </article>
  )
}

export function NewsSection({ noticias, candidateSlug, selectedNewsId }: {
  noticias: NoticiaCandidato[]
  candidateSlug: string
  selectedNewsId?: string | null
}) {
  const [expanded, setExpanded] = useState(false)
  const [query, setQuery] = useState("")
  const [retry, setRetry] = useState(0)
  const [remote, setRemote] = useState<{ id: string; noticia?: NoticiaCandidato; status: "ready" | "missing" | "error" } | null>(null)
  const localSelected = noticias.find((n) => n.id === selectedNewsId)
  const needsFetch = Boolean(selectedNewsId && !localSelected)

  useEffect(() => {
    if (!needsFetch || !selectedNewsId) return
    const controller = new AbortController()
    fetch(`/api/candidato-profile/${encodeURIComponent(candidateSlug)}/noticias/${encodeURIComponent(selectedNewsId)}`, { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 404 || response.status === 400) return { id: selectedNewsId, status: "missing" as const }
        if (!response.ok) throw new Error("Notícia indisponível")
        const body = await response.json() as { data: NoticiaCandidato }
        return { id: selectedNewsId, status: "ready" as const, noticia: body.data }
      })
      .then((result) => { if (!controller.signal.aborted) setRemote(result) })
      .catch(() => { if (!controller.signal.aborted) setRemote({ id: selectedNewsId, status: "error" }) })
    return () => controller.abort()
  }, [candidateSlug, needsFetch, selectedNewsId, retry])

  const remoteSelected = remote?.id === selectedNewsId ? remote : null
  const selected = localSelected ?? remoteSelected?.noticia
  useEffect(() => {
    if (!selected) return
    const element = document.getElementById(`noticia-${selected.id}`)
    element?.focus({ preventScroll: true })
    element?.scrollIntoView({ block: "start", behavior: "instant" })
  }, [selected])

  const sorted = mergeLinkedNews(noticias, remoteSelected?.noticia)
    .sort((a, b) => new Date(b.data_publicacao).getTime() - new Date(a.data_publicacao).getTime())
  const term = query.trim().toLocaleLowerCase("pt-BR")
  const filtered = sorted.filter((n) => !term || `${n.titulo} ${n.fonte ?? ""} ${n.snippet ?? ""}`.toLocaleLowerCase("pt-BR").includes(term))
  const limit = expanded || term ? filtered.length : Math.max(VISIBLE_LIMIT, filtered.findIndex((n) => n.id === selectedNewsId) + 1)
  const visible = filtered.slice(0, limit)

  return (
    <section aria-label="Notícias na mídia" className="space-y-6">
      <div>
        <SectionLabel>Mídia</SectionLabel>
        <SectionTitle>Notícias recentes</SectionTitle>
        <p className="mt-3 max-w-prose text-[length:var(--text-body-sm)] leading-relaxed text-muted-foreground">Acompanhe a cobertura, abra os resumos disponíveis e consulte as matérias nos portais.</p>
      </div>
      {needsFetch && !selected && (
        <div role="status" className="rounded-lg border border-border bg-secondary p-4 text-sm text-muted-foreground">
          {!remoteSelected ? "Abrindo a notícia do seu link…" : remoteSelected.status === "missing" ? "Esta notícia não está mais disponível nesta ficha. Veja a cobertura recente abaixo." : "Não foi possível carregar a notícia agora."}
          {remoteSelected?.status === "error" && <button className="ml-2 min-h-11 underline" onClick={() => { setRemote(null); setRetry((value) => value + 1) }}>Tentar novamente</button>}
        </div>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p role="status" className="text-[length:var(--text-caption)] text-muted-foreground">{`${filtered.length} notícia${filtered.length === 1 ? "" : "s"}${term ? ` encontrada${filtered.length === 1 ? "" : "s"}` : ` recente${filtered.length === 1 ? "" : "s"} · mais recentes primeiro`}`}</p>
        <label className="flex items-center gap-2 rounded-md border border-border px-3 sm:w-72">
          <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <input type="search" aria-label="Buscar notícias" placeholder="Buscar título, fonte ou resumo" value={query} onChange={(event) => setQuery(event.target.value)} className="min-h-11 w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" />
        </label>
      </div>
      <div className="space-y-3">
        {visible.map((noticia) => <NewsItem key={`${noticia.id}-${selectedNewsId ?? ""}`} noticia={noticia} selected={noticia.id === selectedNewsId} />)}
        {filtered.length === 0 && <p className="rounded-lg border border-border p-6 text-sm text-muted-foreground">{term ? "Nenhuma notícia encontrada para esta busca." : "Ainda não há notícias exibidas nesta ficha."}</p>}
      </div>
      {filtered.length > visible.length && <button onClick={() => setExpanded(true)} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-border px-4 py-3 text-sm font-semibold hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring">Ver mais ({filtered.length - visible.length})<ChevronDown aria-hidden="true" className="size-4" /></button>}
    </section>
  )
}

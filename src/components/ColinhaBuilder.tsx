"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, Check, Copy, ExternalLink, Printer, Search, Share2 } from "lucide-react"
import {
  buildColinhaUrl,
  formatColinhaText,
  isCandidateBlocked,
  parseColinhaState,
  resolveColinhaChoices,
  SLOT_LABELS,
  SLOT_ORDER,
  type ColinhaCandidate,
  type ColinhaState,
  type SlotId,
} from "@/lib/colinha"
import { CandidatePhoto } from "@/components/CandidatePhoto"
import { ANALYTICS_EVENTS } from "@/lib/analytics-events"
import { trackLaunchEvent } from "@/lib/analytics-client"

const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"]
type CandidateResponse = { candidates?: ColinhaCandidate[]; unavailable?: boolean; snapshot?: string | null }
const EMPTY_STATE: ColinhaState = { uf: null, df: null, de: null, s1: null, s2: null, g: null, p: null }
const EMPTY_CHOICES: Record<SlotId, ColinhaCandidate | null> = { df: null, de: null, s1: null, s2: null, g: null, p: null }

function formatDate(value: string | null) {
  if (!value) return "sem snapshot"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(date)
}

function status(candidate: ColinhaCandidate) {
  return candidate.situacao_registro || "Situação não informada"
}

function imageAlt(candidate: ColinhaCandidate) {
  return `${candidate.nome_urna}, número ${candidate.numero_urna}, partido ${candidate.partido_sigla}`
}

function safeEvent(format: string) {
  trackLaunchEvent(ANALYTICS_EVENTS.colinhaShare, { format })
}

export function ColinhaBuilder() {
  const [mounted, setMounted] = useState(false)
  const [state, setState] = useState<ColinhaState>(EMPTY_STATE)
  const [activeSlot, setActiveSlot] = useState<SlotId>("df")
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<ColinhaCandidate[]>([])
  const [choices, setChoices] = useState(EMPTY_CHOICES)
  const [issues, setIssues] = useState<Partial<Record<SlotId, string>>>({})
  const [snapshot, setSnapshot] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const shareUrl = useMemo(() => mounted ? buildColinhaUrl(window.location.href, state) : "", [mounted, state])
  const text = useMemo(() => formatColinhaText(state, choices, shareUrl), [state, choices, shareUrl])
  const cardUrl = (format: "feed" | "story") => {
    if (!shareUrl) return "#"
    const url = new URL("/api/colinha/card", window.location.origin)
    url.search = new URL(shareUrl).search
    url.searchParams.set("format", format)
    return url.toString()
  }

  useEffect(() => {
    // URL hydration is intentionally client-only to preserve the static shell.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
    const params = new URLSearchParams(window.location.search)
    const initial = parseColinhaState(params)
    const nextIssues: Partial<Record<SlotId, string>> = {}
    for (const slot of SLOT_ORDER) {
      const raw = params.get(slot)
      if (raw && !initial[slot]) nextIssues[slot] = slot === "s2" && raw === params.get("s1") ? "O segundo voto precisa ser outro senador." : "Escolha indisponível ou inválida."
    }
    setState(initial)
    setIssues(nextIssues)
    setActiveSlot(SLOT_ORDER.find((slot) => initial[slot] === null) ?? "df")
  }, [])

  useEffect(() => {
    if (!mounted || !state.uf) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    void fetch("/api/colinha/candidatos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "selection", state }) })
      .then((response) => response.ok ? response.json() as Promise<CandidateResponse> : Promise.reject(new Error("selection unavailable")))
      .then((payload) => {
        if (cancelled) return
        const candidates = payload.candidates ?? []
        const selected = resolveColinhaChoices(state, candidates)
        const nextIssues: Partial<Record<SlotId, string>> = {}
        for (const slot of SLOT_ORDER) {
          const requested = state[slot]
          if (!requested || selected[slot]) continue
          const found = candidates.find((candidate) => candidate.sq_candidato === requested)
          nextIssues[slot] = found ? `Escolha indisponível: ${status(found)}` : "Candidatura não encontrada neste snapshot."
        }
        setChoices(selected)
        setIssues((current) => ({ ...current, ...nextIssues }))
        setSnapshot(payload.snapshot ?? null)
        setUnavailable(Boolean(payload.unavailable))
      })
      .catch(() => { if (!cancelled) setUnavailable(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [mounted, state])

  const updateState = useCallback((next: ColinhaState) => {
    setState(next)
    if (typeof window !== "undefined") window.history.replaceState(null, "", buildColinhaUrl(window.location.href, next))
  }, [])

  async function searchCandidates(event: React.FormEvent) {
    event.preventDefault()
    if (!state.uf) return
    setLoading(true)
    try {
      const response = await fetch("/api/colinha/candidatos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "search", uf: state.uf, slot: activeSlot, query }) })
      const payload = await response.json() as CandidateResponse
      setResults(payload.candidates ?? [])
      setSnapshot(payload.snapshot ?? snapshot)
      setUnavailable(Boolean(payload.unavailable))
    } catch {
      setResults([])
      setUnavailable(true)
    } finally { setLoading(false) }
  }

  function selectCandidate(candidate: ColinhaCandidate) {
    if (isCandidateBlocked(candidate.situacao_registro)) return
    if ((activeSlot === "s1" || activeSlot === "s2") && state[activeSlot === "s1" ? "s2" : "s1"] === candidate.sq_candidato) return
    const next = { ...state, [activeSlot]: candidate.sq_candidato }
    updateState(next)
    setChoices((current) => ({ ...current, [activeSlot]: candidate }))
    setIssues((current) => ({ ...current, [activeSlot]: undefined }))
    setResults([])
    setQuery("")
    const nextSlot = SLOT_ORDER.find((slot) => next[slot] === null)
    if (nextSlot) setActiveSlot(nextSlot)
  }

  function clearSlot(slot: SlotId) {
    updateState({ ...state, [slot]: null })
    setChoices((current) => ({ ...current, [slot]: null }))
    setIssues((current) => ({ ...current, [slot]: undefined }))
    setActiveSlot(slot)
  }

  async function copyText() {
    try { await navigator.clipboard.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 2000) } catch { setCopied(false) }
  }

  const renderSummary = (candidate: ColinhaCandidate) => {
    if (!candidate.slug || !candidate.resumo) return null
    const values = [
      candidate.resumo.patrimonio != null ? `Patrimônio: R$ ${candidate.resumo.patrimonio.toLocaleString("pt-BR")}` : null,
      candidate.resumo.processos != null ? `Processos: ${candidate.resumo.processos}` : null,
      candidate.resumo.pontos_atencao != null ? `Pontos de atenção: ${candidate.resumo.pontos_atencao}` : null,
    ].filter((value): value is string => Boolean(value))
    return values.length ? <p className="mt-1 text-xs text-muted-foreground">{values.join(" · ")}</p> : null
  }

  if (!mounted) return <section className="mx-auto min-h-[38rem] max-w-7xl px-5 py-12 md:px-12" aria-busy="true"><div className="h-8 w-56 animate-pulse rounded bg-secondary" /></section>

  return <>
    <section data-colinha-screen="true" className="mx-auto max-w-7xl px-5 py-10 md:px-12 lg:py-16">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div>
          <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-muted-foreground">Seis escolhas</p><h2 className="mt-2 font-heading text-[length:var(--text-heading-sm)] uppercase leading-none text-foreground sm:text-[length:var(--text-heading)]">Monte seu voto</h2></div>{state.uf && <p className="text-sm font-semibold text-muted-foreground">UF: {state.uf}</p>}</div>
          <label className="mt-7 block text-sm font-bold text-foreground" htmlFor="colinha-uf">Seu estado</label>
          <select id="colinha-uf" value={state.uf ?? ""} onChange={(event) => { const uf = event.target.value || null; updateState({ ...EMPTY_STATE, uf }); setResults([]); setIssues({}) }} className="mt-2 min-h-12 w-full rounded-lg border border-border bg-card px-3 text-base font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"><option value="">Escolha uma UF</option>{UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}</select>
          {state.uf && <div className="mt-7 grid gap-3 sm:grid-cols-2">{SLOT_ORDER.map((slot, index) => { const choice = choices[slot]; const issue = issues[slot]; return <article key={slot} className={`rounded-xl border p-4 ${issue ? "border-amber-300" : "border-border"}`}><div className="flex items-start justify-between gap-2"><div><p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">{String(index + 1).padStart(2, "0")}</p><h3 className="mt-1 font-bold text-foreground">{SLOT_LABELS[slot]}</h3></div>{choice && <Check aria-label="Escolha preenchida" className="size-5 text-emerald-600" />}</div>{choice ? <div className="mt-4 flex items-center gap-3"><CandidatePhoto src={choice.foto_path} alt={imageAlt(choice)} name={choice.nome_urna} width={48} height={60} sizes="48px" className="size-12 rounded-md object-cover" initialsClassName="text-xs" /><div className="min-w-0 flex-1"><p className="truncate font-bold text-foreground">{choice.nome_urna}</p><p className="text-sm text-muted-foreground">{choice.numero_urna} · {choice.partido_sigla}</p><p className="text-xs text-muted-foreground">{status(choice)}</p>{renderSummary(choice)}</div>{choice.slug && <Link href={`/candidato/${choice.slug}`} target="_blank" className="p-2 text-muted-foreground" aria-label={`Abrir ficha de ${choice.nome_urna}`}><ExternalLink aria-hidden="true" className="size-4" /></Link>}<button type="button" onClick={() => clearSlot(slot)} className="min-h-11 px-2 text-xs font-bold text-muted-foreground underline underline-offset-2">Trocar</button></div> : <><button type="button" onClick={() => { setActiveSlot(slot); setResults([]) }} className="mt-4 min-h-11 w-full rounded-lg border border-dashed border-border text-sm font-bold text-muted-foreground hover:border-foreground hover:text-foreground">Escolher candidato</button>{issue && <p className="mt-3 flex items-start gap-2 text-xs font-semibold text-amber-800"><AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{issue}</p>}</>}</article> })}</div>}
          {state.uf && <div className="mt-8 rounded-xl border border-border bg-card p-5"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Escolhendo</p><h3 className="mt-1 font-bold text-foreground">{SLOT_LABELS[activeSlot]}</h3></div><span className="text-xs text-muted-foreground">{loading ? "Consultando…" : "Fonte oficial"}</span></div><form onSubmit={(event) => { void searchCandidates(event) }} className="mt-4 flex gap-2"><label className="sr-only" htmlFor="colinha-busca">Buscar candidato por nome, número ou partido</label><div className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border px-3"><Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" /><input id="colinha-busca" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome, número ou partido" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" /></div><button type="submit" className="min-h-12 rounded-lg bg-foreground px-4 text-sm font-bold text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2">Buscar</button></form>{unavailable && <p className="mt-4 flex items-start gap-2 text-sm font-semibold text-amber-800"><AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />Fonte indisponível. A cobertura desta escolha aparece como parcial.</p>}{results.length > 0 && <ul className="mt-4 divide-y divide-border rounded-lg border border-border" aria-label="Resultados da busca">{results.map((candidate) => { const blocked = isCandidateBlocked(candidate.situacao_registro); const duplicate = (activeSlot === "s1" || activeSlot === "s2") && state[activeSlot === "s1" ? "s2" : "s1"] === candidate.sq_candidato; return <li key={candidate.sq_candidato} className="flex items-center gap-2 px-3 py-2"><button type="button" disabled={blocked || duplicate} onClick={() => selectCandidate(candidate)} className="flex min-h-12 min-w-0 flex-1 items-center gap-3 text-left hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"><CandidatePhoto src={candidate.foto_path} alt={imageAlt(candidate)} name={candidate.nome_urna} width={40} height={48} sizes="40px" className="size-10 rounded object-cover" initialsClassName="text-xs" /><span className="min-w-0 flex-1"><span className="block truncate font-bold text-foreground">{candidate.nome_urna} · {candidate.numero_urna}</span><span className="block text-xs text-muted-foreground">{candidate.partido_sigla} · {status(candidate)}{duplicate ? " · já escolhido no outro voto" : ""}</span></span></button>{candidate.slug && <Link href={`/candidato/${candidate.slug}`} onClick={(event) => event.stopPropagation()} target="_blank" className="p-2 text-muted-foreground" aria-label={`Abrir ficha de ${candidate.nome_urna}`}><ExternalLink aria-hidden="true" className="size-4" /></Link>}</li> })}</ul>}</div>}
        </div>
        <aside className="h-fit rounded-xl border border-border bg-card p-5 lg:sticky lg:top-24"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Conferência</p><h2 className="mt-1 font-heading text-2xl uppercase leading-none text-foreground">Sua lista</h2></div><Share2 aria-hidden="true" className="size-5 text-muted-foreground" /></div><div className="mt-5 space-y-3">{SLOT_ORDER.map((slot) => <div key={slot} className="flex items-start justify-between gap-3 border-b border-border/70 pb-3 text-sm"><span className="text-muted-foreground">{SLOT_LABELS[slot]}</span><span className="text-right font-bold text-foreground">{choices[slot] ? `${choices[slot]!.numero_urna} · ${choices[slot]!.nome_urna}` : "a escolher"}</span></div>)}</div><p className="mt-4 text-xs leading-relaxed text-muted-foreground">Situação consultada no snapshot de {formatDate(snapshot)}. Confira novamente antes de votar.</p>{(unavailable || !snapshot) && <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs font-semibold leading-relaxed text-amber-900"><AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />Snapshot indisponível ou sem data de geração. Esta colinha tem cobertura parcial.</p>}<div className="mt-5 grid gap-2"><a href={cardUrl("feed")} onClick={() => safeEvent("feed")} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-foreground px-4 text-sm font-bold text-background"><Share2 aria-hidden="true" className="size-4" />Gerar imagem para feed</a><a href={cardUrl("story")} onClick={() => safeEvent("story")} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-4 text-sm font-bold text-foreground">Gerar imagem para stories</a><a href={shareUrl ? `https://wa.me/?text=${encodeURIComponent(text)}` : "#"} onClick={() => safeEvent("text")} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-4 text-sm font-bold text-foreground">Compartilhar no WhatsApp</a><button type="button" onClick={() => void copyText()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-bold text-foreground">{copied ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />}{copied ? "Texto copiado" : "Copiar texto"}</button><button type="button" onClick={() => { safeEvent("print"); window.print() }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-bold text-foreground"><Printer aria-hidden="true" className="size-4" />Imprimir A4</button></div></aside>
      </div>
    </section>
    <div className="colinha-print-sheet" aria-hidden="true"><h1>Minha colinha para 2026{state.uf ? ` · ${state.uf}` : ""}</h1>{SLOT_ORDER.map((slot) => { const choice = choices[slot]; return <div key={slot} className="colinha-print-choice"><strong>{SLOT_LABELS[slot]}</strong><span>{choice ? `${choice.numero_urna} · ${choice.nome_urna} (${choice.partido_sigla})` : "a escolher"}</span>{choice && <small>{status(choice)}</small>}</div> })}<p>Confira a situação do registro antes de votar.</p></div>
    <style jsx global>{`@media screen { .colinha-print-sheet { display:none; } } @media print { @page { size:A4; margin:18mm; } body * { visibility:hidden !important; } body:has(.colinha-print-sheet) { background:#fff !important; } body:has(.colinha-print-sheet) :is(header,footer,nav,[data-colinha-hero],[data-colinha-screen]) { display:none !important; } [data-colinha-page], #main-content { min-height:0 !important; margin:0 !important; padding:0 !important; } .colinha-print-sheet, .colinha-print-sheet * { visibility:visible !important; } .colinha-print-sheet { display:block !important; position:fixed; top:0; left:0; width:100%; color:#111; font-family:Arial,sans-serif; } .colinha-print-sheet h1 { font-size:24pt; margin:0 0 18pt; } .colinha-print-choice { display:grid; grid-template-columns: 42% 58%; gap:6pt; border-bottom:1px solid #bbb; padding:10pt 0; font-size:13pt; } .colinha-print-choice small { grid-column:2; font-size:9pt; color:#555; } .colinha-print-sheet p { margin-top:20pt; font-size:10pt; color:#555; } }`}</style>
  </>
}

"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Copy, ExternalLink, Printer, Search, Share2, Smartphone, X } from "lucide-react"
import {
  buildColinhaUrl,
  colinhaPhotoSrc,
  type ColinhaRoundInfo,
  describeSnapshotStatus,
  formatColinhaText,
  formatSlotDigits,
  formatSnapshotDate,
  isCandidateBlocked,
  LIST_START_HOURS,
  parseColinhaState,
  resolveColinhaChoices,
  SLOT_LABELS,
  SLOT_ORDER,
  VOTING_GUIDE_SOURCE_URL,
  type ColinhaCandidate,
  type ColinhaState,
  type SlotId,
} from "@/lib/colinha"
import { CandidatePhoto } from "@/components/CandidatePhoto"
import { ANALYTICS_EVENTS } from "@/lib/analytics-events"
import { trackLaunchEvent } from "@/lib/analytics-client"
import { formatBRL } from "@/lib/utils"
import { AntesDeVotar } from "@/components/AntesDeVotar"

const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"]
type CandidateResponse = { candidates?: ColinhaCandidate[]; unavailable?: boolean; snapshot?: string | null; listStart?: string | null; round?: ColinhaRoundInfo }
const EMPTY_STATE: ColinhaState = { uf: null, df: null, de: null, s1: null, s2: null, g: null, p: null }
const EMPTY_CHOICES: Record<SlotId, ColinhaCandidate | null> = { df: null, de: null, s1: null, s2: null, g: null, p: null }
/** Texto compilado da Lei 9.504/1997; o art. 91-A, parágrafo único, veda celular na cabine. */
const CELL_PHONE_LAW_URL = "https://www.planalto.gov.br/ccivil_03/leis/l9504.htm"
/** A caixa da lista tem a altura de 20 candidaturas; as demais aparecem com a barra de rolagem. */
const VISIBLE_ROWS = 20

function status(candidate: ColinhaCandidate) {
  return candidate.situacao_registro || "Situação não informada"
}

function imageAlt(candidate: ColinhaCandidate) {
  return `${candidate.nome_urna}, número ${candidate.numero_urna}, partido ${candidate.partido_sigla}`
}

function otherSenator(slot: SlotId): SlotId | null {
  if (slot === "s1") return "s2"
  if (slot === "s2") return "s1"
  return null
}

function safeEvent(format: string) {
  trackLaunchEvent(ANALYTICS_EVENTS.colinhaShare, { format })
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-muted-foreground">{children}</p>
}

export function ColinhaBuilder() {
  const [mounted, setMounted] = useState(false)
  const [state, setState] = useState<ColinhaState>(EMPTY_STATE)
  const [step, setStep] = useState(0)
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [results, setResults] = useState<ColinhaCandidate[]>([])
  const [resultsKey, setResultsKey] = useState<string | null>(null)
  const [listStart, setListStart] = useState<string | null>(null)
  const [showBlocked, setShowBlocked] = useState(false)
  const [choices, setChoices] = useState(EMPTY_CHOICES)
  const [issues, setIssues] = useState<Partial<Record<SlotId, string>>>({})
  const [snapshot, setSnapshot] = useState<string | null>(null)
  const [snapshotChecked, setSnapshotChecked] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [loading, setLoading] = useState(false)
  const [retry, setRetry] = useState(0)
  const [copied, setCopied] = useState(false)
  const [round, setRound] = useState<ColinhaRoundInfo | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const movedRef = useRef(false)
  const heroCopyRef = useRef<string | null>(null)

  const secondRoundAvailable = round?.status === "ready" && round.availableSlots.length > 0
  const secondRoundActive = state.turno === 2 && secondRoundAvailable
  const activeSlots = useMemo(() => state.turno === 2 ? (secondRoundActive ? round!.availableSlots : []) : SLOT_ORDER, [state.turno, secondRoundActive, round])
  const reviewIndex = activeSlots.length
  const slot: SlotId | null = step < reviewIndex ? activeSlots[step] : null
  const filled = activeSlots.filter((id) => choices[id]).length
  const shareUrl = useMemo(() => mounted ? buildColinhaUrl(window.location.href, state) : "", [mounted, state])
  const text = useMemo(() => formatColinhaText(state, choices, shareUrl, secondRoundActive ? { slots: activeSlots, message: round?.message ?? undefined } : undefined), [state, choices, shareUrl, secondRoundActive, activeSlots, round?.message])
  const snapshotCopy = useMemo(() => describeSnapshotStatus({
    hasUf: Boolean(state.uf),
    checked: snapshotChecked,
    formattedDate: formatSnapshotDate(snapshot),
    unavailable,
  }), [state.uf, snapshotChecked, snapshot, unavailable])
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
    const parsed = parseColinhaState(params)
    const initial = parsed
    const nextIssues: Partial<Record<SlotId, string>> = {}
    for (const id of SLOT_ORDER) {
      const raw = params.get(id)
      if (raw && !initial[id]) nextIssues[id] = id === "s2" && raw === params.get("s1") ? "O segundo voto precisa ser outro senador." : "Escolha indisponível ou inválida."
    }
    setState(initial)
    setIssues(nextIssues)
    // Link com escolhas abre na conferência; link vazio começa no primeiro voto.
    setStep(SLOT_ORDER.some((id) => initial[id] !== null) ? SLOT_ORDER.length : 0)
  }, [])

  useEffect(() => {
    if (!mounted || !state.uf) return
    let cancelled = false
    void fetch("/api/colinha/candidatos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "round", uf: state.uf }) })
      .then((response) => response.ok ? response.json() as Promise<CandidateResponse> : Promise.reject(new Error("round unavailable")))
      .then((payload) => {
        if (cancelled) return
        setRound(payload.round ?? null)
      })
      .catch(() => { if (!cancelled) setRound(null) })
    return () => { cancelled = true }
    // The round request is keyed by UF; selected choices do not alter its result.
  }, [mounted, state.uf])

  useEffect(() => {
    if (!mounted) return
    const heroCopy = document.querySelector<HTMLElement>("[data-colinha-hero] p:last-of-type")
    if (!heroCopy) return
    if (heroCopyRef.current === null) heroCopyRef.current = heroCopy.textContent ?? ""
    if (secondRoundActive && round?.message) {
      heroCopy.textContent = `2º turno. ${round.message} Escolha os votos confirmados e confira número e partido antes de votar.`
    } else if (heroCopy.textContent !== heroCopyRef.current) {
      heroCopy.textContent = heroCopyRef.current
    }
  }, [mounted, secondRoundActive, round?.message])

  // Reidrata as escolhas vindas do link. Sem escolhas, nada a consultar: a data
  // do snapshot chega pela lista do primeiro passo, sem aviso falso de parcial.
  const hasSelection = SLOT_ORDER.some((id) => state[id])
  const selectionKey = SLOT_ORDER.map((id) => state[id] ?? "").join(",")
  useEffect(() => {
    if (!mounted || !state.uf || state.turno || !secondRoundAvailable || hasSelection) return
    const nextState = { ...EMPTY_STATE, uf: state.uf, turno: 2 as const }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(nextState)
    if (typeof window !== "undefined") window.history.replaceState(null, "", buildColinhaUrl(window.location.href, nextState))
  }, [mounted, state.uf, state.turno, hasSelection, secondRoundAvailable])

  useEffect(() => {
    if (!mounted || !state.uf || (state.turno === 2 && !secondRoundActive) || !hasSelection) return
    const requested = { ...state }
    let cancelled = false
    void fetch("/api/colinha/candidatos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "selection", state: requested }) })
      .then((response) => response.ok ? response.json() as Promise<CandidateResponse> : Promise.reject(new Error("selection unavailable")))
      .then((payload) => {
        if (cancelled) return
        const candidates = payload.candidates ?? []
        const selected = resolveColinhaChoices(requested, candidates)
        const nextIssues: Partial<Record<SlotId, string>> = {}
        for (const id of SLOT_ORDER) {
          const sq = requested[id]
          if (!sq || selected[id]) continue
          const found = candidates.find((candidate) => candidate.sq_candidato === sq)
          nextIssues[id] = found ? `Escolha indisponível: ${status(found)}` : "Candidatura não encontrada neste snapshot."
        }
        setChoices(selected)
        setIssues((current) => ({ ...current, ...nextIssues }))
        if (payload.snapshot) setSnapshot(payload.snapshot)
        if (payload.round) setRound(payload.round)
        setUnavailable(Boolean(payload.unavailable))
        setSnapshotChecked(true)
      })
      .catch(() => { if (!cancelled) { setUnavailable(true); setSnapshotChecked(true) } })
    return () => { cancelled = true }
    // selectionKey resume o estado; reconsultar a cada troca de passo seria desperdício.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, state.uf, state.turno, selectionKey, hasSelection, secondRoundActive])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 250)
    return () => window.clearTimeout(timer)
  }, [query])

  // A lista do cargo carrega sozinha ao entrar no passo; o filtro refina enquanto digita.
  useEffect(() => {
    if (!mounted || !state.uf || !slot) return
    const key = `${state.uf}|${slot}|${debouncedQuery.trim()}`
    const controller = new AbortController()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    void fetch("/api/colinha/candidatos", { method: "POST", signal: controller.signal, headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "search", uf: state.uf, slot, query: debouncedQuery.trim(), turno: secondRoundActive ? 2 : 1 }) })
      .then((response) => response.json() as Promise<CandidateResponse>)
      .then((payload) => {
        setResults(payload.candidates ?? [])
        setResultsKey(key)
        setListStart(payload.listStart ?? null)
        if (payload.round) setRound(payload.round)
        if (payload.snapshot) setSnapshot(payload.snapshot)
        setUnavailable(Boolean(payload.unavailable))
        setSnapshotChecked(true)
        setLoading(false)
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return
        setResults([])
        setResultsKey(key)
        setUnavailable(true)
        setSnapshotChecked(true)
        setLoading(false)
      })
    return () => controller.abort()
  }, [mounted, state.uf, slot, state.turno, debouncedQuery, retry, secondRoundActive])

  // Cada troca de passo leva o topo do painel para a vista e o foco para o título,
  // para quem usa leitor de tela saber em que voto está.
  useEffect(() => {
    if (!movedRef.current) return
    movedRef.current = false
    const panel = panelRef.current
    if (panel && panel.getBoundingClientRect().top < 0) panel.scrollIntoView({ block: "start" })
    headingRef.current?.focus({ preventScroll: true })
  }, [step, state.uf])

  const updateState = useCallback((next: ColinhaState) => {
    setState(next)
    if (typeof window !== "undefined") window.history.replaceState(null, "", buildColinhaUrl(window.location.href, next))
  }, [])

  function goTo(next: number) {
    movedRef.current = true
    setStep(Math.max(0, Math.min(reviewIndex, next)))
    setQuery("")
    setDebouncedQuery("")
    setShowBlocked(false)
  }

  function chooseUf(uf: string) {
    movedRef.current = true
    updateState({ ...EMPTY_STATE, uf })
    setChoices(EMPTY_CHOICES)
    setIssues({})
    setResults([])
    setResultsKey(null)
    setSnapshot(null)
    setSnapshotChecked(false)
    setUnavailable(false)
    setRound(null)
    goTo(0)
  }

  function resetUf() {
    if (filled > 0 && !window.confirm("Trocar de estado apaga as escolhas feitas até agora. Continuar?")) return
    movedRef.current = true
    updateState(EMPTY_STATE)
    setChoices(EMPTY_CHOICES)
    setIssues({})
    setResults([])
    setResultsKey(null)
    setSnapshot(null)
    setSnapshotChecked(false)
    setUnavailable(false)
    setRound(null)
  }

  function startSecondRound() {
    if (!state.uf || !round || round.status !== "ready" || round.availableSlots.length === 0) return
    const next = { ...EMPTY_STATE, uf: state.uf, turno: 2 as const }
    updateState(next)
    setChoices(EMPTY_CHOICES)
    setIssues({})
    setResults([])
    setResultsKey(null)
    setStep(0)
    setQuery("")
    setDebouncedQuery("")
  }

  function selectCandidate(candidate: ColinhaCandidate) {
    if (!slot || isCandidateBlocked(candidate.situacao_registro)) return
    const pair = otherSenator(slot)
    if (pair && state[pair] === candidate.sq_candidato) return
    const next = { ...state, [slot]: candidate.sq_candidato }
    updateState(next)
    setChoices((current) => ({ ...current, [slot]: candidate }))
    setIssues((current) => ({ ...current, [slot]: undefined }))
    const after = activeSlots.findIndex((id, index) => index > step && next[id] === null)
    goTo(after === -1 ? reviewIndex : after)
  }

  function clearSlot(id: SlotId) {
    updateState({ ...state, [id]: null })
    setChoices((current) => ({ ...current, [id]: null }))
    setIssues((current) => ({ ...current, [id]: undefined }))
  }

  async function copyText() {
    try { await navigator.clipboard.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 2000) } catch { setCopied(false) }
  }

  const renderSummary = (candidate: ColinhaCandidate) => {
    if (!candidate.slug || !candidate.resumo) return null
    const values = [
      candidate.resumo.patrimonio != null ? `Patrimônio: ${formatBRL(candidate.resumo.patrimonio)}` : null,
      candidate.resumo.processos != null ? `Processos: ${candidate.resumo.processos}` : null,
      candidate.resumo.pontos_atencao != null ? `Pontos de atenção: ${candidate.resumo.pontos_atencao}` : null,
    ].filter((value): value is string => Boolean(value))
    return values.length ? <p className="mt-1 text-xs text-muted-foreground">{values.join(" · ")}</p> : null
  }

  if (!mounted) return <section className="mx-auto min-h-[38rem] max-w-7xl px-5 py-12 md:px-12" aria-busy="true"><div className="h-8 w-56 animate-pulse rounded bg-secondary" /></section>

  // Passo 0: estado. Define deputados, senadores e governador.
  const ufStep = <div className="mx-auto max-w-3xl">
    <Eyebrow>Antes de começar</Eyebrow>
    <h2 ref={headingRef} tabIndex={-1} className="mt-2 font-heading text-[length:var(--text-heading-sm)] uppercase leading-none text-foreground outline-none sm:text-[length:var(--text-heading)]">Em que estado você vota?</h2>
    <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">O estado define quem aparece para deputado, senador e governador. Depois você escolhe os seis votos, um de cada vez, na ordem da urna.</p>
    <ul className="mt-6 grid grid-cols-4 gap-2 sm:grid-cols-7 lg:grid-cols-9" aria-label="Estados">{UFS.map((uf) => <li key={uf}><button type="button" onClick={() => chooseUf(uf)} className="min-h-12 w-full rounded-lg border border-border bg-card text-base font-bold text-foreground hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40">{uf}</button></li>)}</ul>
  </div>

  // Barra de progresso: seis votos mais a conferência, cada segmento leva ao passo.
  const progress = <nav aria-label="Progresso da colinha" className="rounded-xl border border-border bg-card p-3">
    <div className="flex items-center justify-between gap-3 text-xs font-semibold text-muted-foreground">
      <span>{filled} de {activeSlots.length} escolhidos</span>
      <button type="button" onClick={resetUf} className="min-h-6 underline underline-offset-2 hover:text-foreground">Estado: {state.uf} · trocar</button>
    </div>
    <ol className={`mt-2 grid gap-1 ${activeSlots.length === 1 ? "grid-cols-2" : activeSlots.length === 2 ? "grid-cols-3" : "grid-cols-7"}`}>{[...activeSlots, "conferir" as const].map((id, index) => {
      const current = index === step
      const done = id !== "conferir" && Boolean(choices[id])
      const label = id === "conferir" ? "Conferir e compartilhar" : SLOT_LABELS[id]
      return <li key={id}><button type="button" onClick={() => goTo(index)} aria-current={current ? "step" : undefined} aria-label={`${index + 1}. ${label}${done ? ", escolhido" : ""}`} className="group block w-full py-2"><span className={`block h-1.5 rounded-full ${current ? "bg-foreground" : done ? "bg-emerald-600" : "bg-secondary group-hover:bg-muted-foreground/40"}`} /></button></li>
    })}</ol>
    {slot && <button type="button" onClick={() => goTo(reviewIndex)} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-foreground px-4 text-sm font-bold text-background lg:hidden">Conferir e compartilhar<ArrowRight aria-hidden="true" className="size-4" /></button>}
  </nav>

  const pair = slot ? otherSenator(slot) : null
  const currentKey = slot ? `${state.uf}|${slot}|${debouncedQuery.trim()}` : null
  const settled = resultsKey === currentKey && !loading
  const allowed = results.filter((candidate) => !isCandidateBlocked(candidate.situacao_registro))
  const blocked = results.filter((candidate) => isCandidateBlocked(candidate.situacao_registro))
  const visible = showBlocked ? [...allowed, ...blocked] : allowed
  const choice = slot ? choices[slot] : null
  const issue = slot ? issues[slot] : undefined

  // min-w-0: sem ele, um nome longo com truncate alarga a coluna da grade no celular.
  const slotStep = slot && <div className="min-w-0">
    <div className="flex items-center justify-between gap-3">
      <button type="button" onClick={() => goTo(step - 1)} disabled={step === 0} className="inline-flex min-h-11 items-center gap-1 text-sm font-bold text-muted-foreground hover:text-foreground disabled:invisible"><ArrowLeft aria-hidden="true" className="size-4" />Voltar</button>
      <button type="button" onClick={() => goTo(step + 1)} className="inline-flex min-h-11 items-center gap-1 text-sm font-bold text-muted-foreground hover:text-foreground">{choice ? "Continuar" : "Pular este voto"}<ArrowRight aria-hidden="true" className="size-4" /></button>
    </div>
    <Eyebrow>Voto {step + 1} de {activeSlots.length} · {formatSlotDigits(slot)} na urna</Eyebrow>
    <h2 ref={headingRef} tabIndex={-1} className="mt-2 font-heading text-[length:var(--text-heading-sm)] uppercase leading-none text-foreground outline-none sm:text-[length:var(--text-heading)]">{SLOT_LABELS[slot]}</h2>
    {secondRoundActive && round?.message && <p className="mt-3 rounded-lg border border-border p-3 text-sm font-semibold leading-relaxed text-foreground">{round.message}</p>}
    {pair && <p className="mt-3 text-sm text-muted-foreground">São dois votos para senador, e eles precisam ser em candidatos diferentes.</p>}
    {issue && <p className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-900"><AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{issue} Escolha outra candidatura abaixo.</p>}
    {choice && <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border-2 border-foreground p-4">
      <CandidatePhoto src={colinhaPhotoSrc(choice).src} unoptimized={colinhaPhotoSrc(choice).direct || undefined} alt={imageAlt(choice)} name={choice.nome_urna} width={48} height={60} sizes="48px" className="size-12 shrink-0 rounded-md object-cover" initialsClassName="text-xs" />
      <div className="min-w-[9rem] flex-1"><p className="text-xs font-bold uppercase tracking-[0.08em] text-emerald-700">Sua escolha</p><p className="truncate font-bold text-foreground">{choice.numero_urna} · {choice.nome_urna}</p><p className="text-sm text-muted-foreground">{choice.partido_sigla} · {status(choice)}</p>{renderSummary(choice)}</div>
      <button type="button" onClick={() => clearSlot(slot)} className="inline-flex min-h-11 items-center gap-1 px-2 text-xs font-bold text-muted-foreground underline underline-offset-2 hover:text-foreground"><X aria-hidden="true" className="size-3.5" />Remover</button>
    </div>}
    <label className="mt-6 block text-sm font-bold text-foreground" htmlFor="colinha-busca">{choice ? "Trocar por outra candidatura" : "Filtre por nome, número ou partido"}</label>
    <div className="mt-2 flex min-h-12 items-center gap-2 rounded-lg border border-border bg-card px-3 focus-within:ring-2 focus-within:ring-foreground/30">
      <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <input id="colinha-busca" type="search" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={70} autoComplete="off" placeholder="Ex.: nome, 13, PT" className="min-h-11 min-w-0 flex-1 self-stretch bg-transparent text-base outline-none placeholder:text-muted-foreground" />
      <span aria-live="polite" className="shrink-0 text-xs text-muted-foreground">{loading ? "Consultando…" : ""}</span>
    </div>
    {settled && !debouncedQuery.trim() && listStart && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Agora a lista começa pela letra {listStart} e dá a volta no alfabeto. A letra inicial troca a cada {LIST_START_HOURS} horas, igual para todo mundo, para nenhuma candidatura ficar sempre no topo.{results.length > VISIBLE_ROWS ? " Mostramos 20 por vez: digite o nome ou o número para achar a sua." : ""}</p>}
    {unavailable && settled && <p className="mt-4 flex flex-wrap items-center gap-2 text-sm font-semibold text-amber-800"><AlertTriangle aria-hidden="true" className="size-4 shrink-0" />Fonte indisponível. A cobertura desta escolha aparece como parcial.<button type="button" onClick={() => setRetry((value) => value + 1)} className="min-h-6 underline underline-offset-2">Tentar de novo</button></p>}
    {!settled && results.length === 0 && <ul className="mt-4 space-y-2" aria-hidden="true">{[0, 1, 2, 3].map((index) => <li key={index} className="h-16 animate-pulse rounded-lg bg-secondary" />)}</ul>}
    {settled && !unavailable && visible.length === 0 && blocked.length === 0 && <p className="mt-4 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">{debouncedQuery.trim() ? `Nenhuma candidatura encontrada para “${debouncedQuery.trim()}”.` : "Nenhuma candidatura registrada para este cargo neste snapshot."}</p>}
    {visible.length > 0 && <ul key={resultsKey ?? ""} className={`mt-4 max-h-[81.25rem] divide-y divide-border overflow-y-auto rounded-xl scrollbar-visible border border-border bg-card ${settled ? "" : "opacity-60"}`} aria-label={`Candidaturas para ${SLOT_LABELS[slot]}`}>{visible.map((candidate) => {
      const isBlocked = isCandidateBlocked(candidate.situacao_registro)
      const duplicate = pair !== null && state[pair] === candidate.sq_candidato
      const selected = choice?.sq_candidato === candidate.sq_candidato
      return <li key={candidate.sq_candidato} className="flex items-center gap-1 pr-2"><button type="button" disabled={isBlocked || duplicate} onClick={() => selectCandidate(candidate)} aria-pressed={selected} className={`flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent ${selected ? "bg-secondary" : ""}`}><CandidatePhoto src={colinhaPhotoSrc(candidate).src} unoptimized={colinhaPhotoSrc(candidate).direct || undefined} alt={imageAlt(candidate)} name={candidate.nome_urna} width={40} height={48} sizes="40px" className="size-10 shrink-0 rounded object-cover" initialsClassName="text-xs" /><span className="min-w-0 flex-1"><span className="block truncate font-bold text-foreground">{candidate.nome_urna}</span><span className="block text-xs text-muted-foreground">{candidate.partido_sigla} · {status(candidate)}{duplicate ? ` · já escolhido para ${SLOT_LABELS[pair!]}` : ""}</span></span><span className="shrink-0 font-heading text-xl tabular-nums text-foreground">{candidate.numero_urna}</span>{selected && <Check aria-hidden="true" className="size-5 shrink-0 text-emerald-600" />}</button>{candidate.slug && <Link href={`/candidato/${candidate.slug}`} target="_blank" className="grid size-11 shrink-0 place-items-center text-muted-foreground hover:text-foreground" aria-label={`Abrir ficha de ${candidate.nome_urna}`}><ExternalLink aria-hidden="true" className="size-4" /></Link>}</li>
    })}</ul>}
    {settled && blocked.length > 0 && <button type="button" onClick={() => setShowBlocked((value) => !value)} className="mt-3 min-h-11 text-sm font-semibold text-muted-foreground underline underline-offset-2 hover:text-foreground">{showBlocked ? "Esconder" : "Mostrar"} {blocked.length} {blocked.length === 1 ? "candidatura" : "candidaturas"} com registro indeferido, renúncia ou cassação</button>}
  </div>

  // Resumo lateral no desktop: cada linha volta ao passo daquele voto.
  const sidebar = <aside className="hidden h-fit rounded-xl border border-border bg-card p-5 lg:sticky lg:top-24 lg:block">
    <Eyebrow>Até agora</Eyebrow>
    <h2 className="mt-1 font-heading text-2xl uppercase leading-none text-foreground">Sua colinha</h2>
    <ol className="mt-4 space-y-1">{activeSlots.map((id, index) => <li key={id}><button type="button" onClick={() => goTo(index)} aria-current={index === step ? "step" : undefined} className={`flex w-full items-start justify-between gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-secondary ${index === step ? "bg-secondary" : ""}`}><span className="text-muted-foreground">{index + 1}. {SLOT_LABELS[id]}</span><span className="text-right font-bold text-foreground">{choices[id] ? `${choices[id]!.numero_urna} · ${choices[id]!.nome_urna}` : "—"}</span></button></li>)}</ol>
    <button type="button" onClick={() => goTo(reviewIndex)} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-foreground px-4 text-sm font-bold text-background">Conferir e compartilhar<ArrowRight aria-hidden="true" className="size-4" /></button>
    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{snapshotCopy.message}</p>
  </aside>

  const reviewPanel = <div className="mx-auto max-w-3xl">
    <button type="button" onClick={() => goTo(reviewIndex - 1)} className="inline-flex min-h-11 items-center gap-1 text-sm font-bold text-muted-foreground hover:text-foreground"><ArrowLeft aria-hidden="true" className="size-4" />Voltar</button>
    <Eyebrow>Conferência · {state.uf}{secondRoundActive ? " · 2º turno" : ""}</Eyebrow>
    <h2 ref={headingRef} tabIndex={-1} className="mt-2 font-heading text-[length:var(--text-heading-sm)] uppercase leading-none text-foreground outline-none sm:text-[length:var(--text-heading)]">Sua colinha</h2>
    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{filled === activeSlots.length ? (secondRoundActive ? "Os votos confirmados para o 2º turno estão prontos para conferência." : "Os seis votos estão escolhidos, na ordem em que aparecem na urna.") : `${filled} de ${activeSlots.length} votos escolhidos. Toque em um cargo para escolher ou trocar.`}</p>
    {state.turno === 2 && round && !secondRoundActive && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm font-semibold leading-relaxed text-amber-900">{round.message ?? "Não foi possível confirmar os cargos do 2º turno para este estado."}</p>}
    {!state.turno && round?.hasOfficialPhase && <p className="mt-3 rounded-lg border border-border p-3 text-sm leading-relaxed text-foreground">Esta colinha é do 1º turno.{round.status === "ready" && round.availableSlots.length > 0 ? <> A apuração oficial já confirmou o 2º turno para este estado.<button type="button" onClick={startSecondRound} className="mt-2 inline-flex min-h-11 items-center gap-2 font-bold underline underline-offset-2">Montar colinha do 2º turno<ArrowRight aria-hidden="true" className="size-4" /></button></> : <> {round.message ?? "A confirmação oficial do 2º turno para este estado está incompleta."}</>}</p>}
    <ol className="mt-6 divide-y divide-border rounded-xl border border-border bg-card">{activeSlots.map((id, index) => {
      const picked = choices[id]
      return <li key={id} className="flex items-center gap-3 p-4">
        <span className="w-6 shrink-0 font-heading text-lg tabular-nums text-muted-foreground">{index + 1}</span>
        {picked ? <CandidatePhoto src={colinhaPhotoSrc(picked).src} unoptimized={colinhaPhotoSrc(picked).direct || undefined} alt={imageAlt(picked)} name={picked.nome_urna} width={40} height={48} sizes="40px" className="size-10 shrink-0 rounded object-cover" initialsClassName="text-xs" /> : <span className="size-10 shrink-0 rounded border border-dashed border-border" aria-hidden="true" />}
        <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-muted-foreground">{SLOT_LABELS[id]} · {formatSlotDigits(id)}</p>{picked ? <><p className="truncate font-bold text-foreground">{picked.nome_urna}</p><p className="text-xs text-muted-foreground">{picked.partido_sigla} · {status(picked)}</p>{renderSummary(picked)}</> : <p className="font-semibold text-muted-foreground">{issues[id] ?? "Sem escolha"}</p>}</div>
        {picked && <span className="shrink-0 font-heading text-2xl tabular-nums text-foreground">{picked.numero_urna}</span>}
        <button type="button" onClick={() => goTo(index)} aria-label={`${picked ? "Trocar" : "Escolher"} candidato para ${SLOT_LABELS[id]}`} className="min-h-11 shrink-0 px-1 text-xs font-bold text-muted-foreground underline underline-offset-2 hover:text-foreground">{picked ? "Trocar" : "Escolher"}</button>
      </li>
    })}</ol>
    <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{snapshotCopy.message} Confira novamente antes de votar.</p>
    {snapshotCopy.showPartialWarning && <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs font-semibold leading-relaxed text-amber-900"><AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />Snapshot indisponível ou sem data de geração. Esta colinha tem cobertura parcial.</p>}

    <section aria-labelledby="colinha-levar" className="mt-8">
      <h3 id="colinha-levar" className="font-bold text-foreground">Leve no papel</h3>
      <p className="mt-2 flex items-start gap-2 rounded-lg border border-border p-3 text-sm leading-relaxed text-foreground"><Smartphone aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span>Celular não entra na cabine de votação (<a href={CELL_PHONE_LAW_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">Lei 9.504/1997, art. 91-A</a>). Imprima a colinha ou copie os números à mão.</span></p>
      {filled === 0 ? <p className="mt-3 text-sm text-muted-foreground">Escolha pelo menos um voto para imprimir, gerar a imagem ou o texto.</p> : <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button type="button" onClick={() => { safeEvent("print"); window.print() }} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-foreground px-4 text-sm font-bold text-background sm:col-span-2"><Printer aria-hidden="true" className="size-4" />Imprimir A4</button>
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground sm:col-span-2 mt-3">Compartilhar</p>
        <a href={cardUrl("feed")} onClick={() => safeEvent("feed")} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-bold text-foreground"><Share2 aria-hidden="true" className="size-4" />Gerar imagem para feed</a>
        <a href={cardUrl("story")} onClick={() => safeEvent("story")} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center justify-center rounded-lg border border-border px-4 text-sm font-bold text-foreground">Gerar imagem para stories</a>
        <a href={shareUrl ? `https://wa.me/?text=${encodeURIComponent(text)}` : "#"} onClick={() => safeEvent("text")} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center justify-center rounded-lg border border-border px-4 text-sm font-bold text-foreground">Compartilhar no WhatsApp</a>
        <button type="button" onClick={() => void copyText()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-bold text-foreground">{copied ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />}{copied ? "Texto copiado" : "Copiar texto"}</button>
      </div>}
    </section>

    <section aria-labelledby="colinha-urna" className="mt-8 rounded-xl bg-secondary/60 p-4">
      <h3 id="colinha-urna" className="text-sm font-bold text-foreground">Na hora de votar</h3>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{secondRoundActive ? "A urna pede os votos do 2º turno confirmados acima. Antes de apertar Confirma, confira foto, nome e partido na tela da urna." : "A urna pede os seis votos nesta mesma ordem. Os dois votos para senador precisam ser em candidatos diferentes. Antes de apertar Confirma, confira foto, nome e partido na tela da urna."} Resumo do <a href={VOTING_GUIDE_SOURCE_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">Manual do Eleitor do TSE</a>; não é a tela da urna.</p>
    </section>
  </div>

  return <>
    <section data-colinha-screen="true" className="mx-auto max-w-7xl px-5 py-8 md:px-12 lg:py-14">
      <div ref={panelRef} className="scroll-mt-24">
        {!state.uf ? ufStep : <>
          <div className={slot ? "" : "mx-auto max-w-3xl"}>{progress}</div>
          <div className={slot ? "mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]" : "mt-6"}>
            {slot ? <>{slotStep}{sidebar}</> : reviewPanel}
          </div>
        </>}
        <div className="mx-auto mt-6 max-w-3xl"><AntesDeVotar uf={state.uf} /></div>
      </div>
    </section>
    <div className="colinha-print-sheet" aria-hidden="true"><h1>Minha colinha{secondRoundActive ? " para o 2º turno" : " para 2026"}{state.uf ? ` · ${state.uf}` : ""}</h1>{activeSlots.map((id) => { const picked = choices[id]; return <div key={id} className="colinha-print-choice"><strong>{SLOT_LABELS[id]} <em>({formatSlotDigits(id)})</em></strong><span>{picked ? `${picked.numero_urna} · ${picked.nome_urna} (${picked.partido_sigla})` : "a escolher"}</span>{picked && <small>{status(picked)}</small>}</div> })}<p>{secondRoundActive ? "Confira foto, nome e partido na urna antes de confirmar e a situação do registro antes de votar." : "Ordem na urna: deputado federal, deputado estadual ou distrital, primeiro senador, segundo senador (outro candidato), governador e presidente. Confira foto, nome e partido na urna antes de confirmar e a situação do registro antes de votar."}</p></div>
    <style jsx global>{`@media screen { .colinha-print-sheet { display:none; } } @media print { @page { size:A4; margin:18mm; } body * { visibility:hidden !important; } body:has(.colinha-print-sheet) { background:#fff !important; } body:has(.colinha-print-sheet) :is(header,footer,nav,[data-colinha-hero],[data-colinha-screen]) { display:none !important; } [data-colinha-page], #main-content { min-height:0 !important; margin:0 !important; padding:0 !important; } .colinha-print-sheet, .colinha-print-sheet * { visibility:visible !important; } .colinha-print-sheet { display:block !important; position:fixed; top:0; left:0; width:100%; color:#111; font-family:Arial,sans-serif; } .colinha-print-sheet h1 { font-size:24pt; margin:0 0 18pt; } .colinha-print-choice { display:grid; grid-template-columns: 42% 58%; gap:6pt; border-bottom:1px solid #bbb; padding:10pt 0; font-size:13pt; } .colinha-print-choice em { font-style:normal; font-weight:400; color:#555; font-size:10pt; } .colinha-print-choice small { grid-column:2; font-size:9pt; color:#555; } .colinha-print-sheet p { margin-top:20pt; font-size:10pt; color:#555; } }`}</style>
  </>
}

/**
 * Cross-check read-only §15.3 entre `mudancas_partido` e `historico_politico`.
 * Não preenche gaps — só enumera para snapshot / curadoria.
 *
 * Dois recortes:
 * - `full`: todos os achados (auditoria).
 * - `actionable`: subconjunto após filtros operacionais (ruído TSE pleito↔mandato, cap por código).
 */

import { partiesHistoricallyEquivalent } from "../../src/lib/party-utils"
import { canonicalCargo } from "./cargo-utils"
import { resolveHistoricoRowProvenance } from "../../src/lib/historico-provenance"
import { canonicalPartiesEquivalent, resolveCanonicalParty } from "./party-canonical"

export type PartyHistoricoCrossSeverity = "media" | "baixa"

export interface PartyHistoricoCrossFinding {
  code:
    | "mandato_transicao_sem_mudanca"
    | "mudanca_partido_novo_sem_mandato"
    | "mudanca_partido_anterior_sem_rastro"
  severity: PartyHistoricoCrossSeverity
  /** id da row de mudanca ou do segundo mandato na transição */
  ref_id: string
  detail: string
}

export interface HistoricoLite {
  id: string
  cargo: string
  cargo_canonico: string | null
  periodo_inicio: number | null
  periodo_fim: number | null
  partido: string | null
  /** Usado para filtro TSE pleito stub ↔ mandato aberto no *actionable* */
  observacoes?: string | null
  proveniencia?: string | null
}

export interface MudancaLite {
  id: string
  partido_anterior: string
  partido_novo: string
  ano: number | null
  contexto?: string | null
}

/** Máximo de linhas por `code` no recorte *actionable* (por slug). */
const PARTY_HISTORICO_ACTIONABLE_MAX_PER_CODE = 8

interface PartyHistoricoCrossTransition {
  fromRow: HistoricoLite
  toRow: HistoricoLite
  fromParty: string
  toParty: string
}

function rankHistorico(row: HistoricoLite): number {
  if (row.periodo_inicio != null) return row.periodo_inicio
  return 0
}

function rowCanon(row: HistoricoLite): string {
  return ((row.cargo_canonico && row.cargo_canonico.trim()) || canonicalCargo(row.cargo)).trim()
}

function partySiglaToken(p: string): string {
  return resolveCanonicalParty(p)?.sigla ?? p.trim()
}

function splitPartyTokens(p: string): string[] {
  return p
    .split(/[\/,;]+/g)
    .map((token) => token.trim())
    .filter(Boolean)
}

function crossPartyEquivalentDirect(left: string, right: string): boolean {
  return canonicalPartiesEquivalent(left, right) || partiesHistoricallyEquivalent(left, right)
}

function crossPartyEquivalent(left: string, right: string): boolean {
  if (crossPartyEquivalentDirect(left, right)) return true
  const leftTokens = splitPartyTokens(left)
  const rightTokens = splitPartyTokens(right)
  return leftTokens.some((l) => rightTokens.some((r) => crossPartyEquivalentDirect(l, r)))
}

function historicoRowMatchesParty(row: HistoricoLite, party: string): boolean {
  const p = row.partido?.trim()
  if (!p) return false
  if (crossPartyEquivalent(p, party)) return true
  return splitPartyTokens(p).some((token) => crossPartyEquivalent(token, party))
}

function partyTokensHistorico(rows: HistoricoLite[]): Set<string> {
  const s = new Set<string>()
  for (const r of rows) {
    const p = r.partido?.trim()
    if (!p) continue
    s.add(partySiglaToken(p))
    s.add(p)
    for (const token of splitPartyTokens(p)) {
      s.add(partySiglaToken(token))
      s.add(token)
    }
  }
  return s
}

function isSemPartidoToken(p: string): boolean {
  const u = p.toUpperCase()
  return u.includes("SEM PARTIDO") || u.includes("SEMPARTIDO") || u === "—" || u === "-"
}

function isPlaceholderPartyToken(p: string): boolean {
  const u = p.trim().toUpperCase()
  return isSemPartidoToken(u) || u.includes("HISTORICO ANTERIOR") || u.includes("HISTÓRICO ANTERIOR")
}

function mudancaLooksAutoOnly(m: MudancaLite): boolean {
  const c = (m.contexto ?? "").toLowerCase()
  return c.includes("wikidata") || c.includes("mudança observada entre eleições tse") || c.includes("mudanca observada entre eleicoes tse")
}

function mudancaLooksCurated(m: MudancaLite): boolean {
  const c = (m.contexto ?? "").trim()
  return c.length > 0 && !mudancaLooksAutoOnly(m)
}

function orderedMudancas(mudancas: MudancaLite[]): MudancaLite[] {
  return [...mudancas].sort((a, b) => (a.ano ?? 0) - (b.ano ?? 0))
}

function partyHasHistoricoTrace(historicoRows: HistoricoLite[], party: string): boolean {
  return historicoRows.some((row) => historicoRowMatchesParty(row, party))
}

function partyHasTraceOrIsCurrent(
  historicoRows: HistoricoLite[],
  party: string,
  currentParty: string | null | undefined,
): boolean {
  if (partyHasHistoricoTrace(historicoRows, party)) return true
  return !!currentParty?.trim() && crossPartyEquivalent(party, currentParty)
}

function isCurrentPartyTailMudanca(
  m: MudancaLite,
  mudancas: MudancaLite[],
  currentParty: string | null | undefined,
): boolean {
  if (!currentParty?.trim()) return false
  if (!crossPartyEquivalent(m.partido_novo, currentParty)) return false
  if (mudancaLooksAutoOnly(m)) return false
  const maxAno = Math.max(...mudancas.map((row) => row.ano ?? Number.NEGATIVE_INFINITY))
  return (m.ano ?? Number.NEGATIVE_INFINITY) >= maxAno
}

function hasCurrentPartyTailMudancaForTransition(
  mudancas: MudancaLite[],
  fromParty: string,
  toParty: string,
  currentParty: string | null | undefined,
): boolean {
  return mudancas.some(
    (m) =>
      isCurrentPartyTailMudanca(m, mudancas, currentParty) &&
      crossPartyEquivalent(m.partido_anterior, fromParty) &&
      crossPartyEquivalent(m.partido_novo, toParty)
  )
}

function isCuratedTimelineIntermediateParty(
  party: string,
  historicoRows: HistoricoLite[],
  mudancas: MudancaLite[],
  currentParty: string | null | undefined,
): boolean {
  if (!party.trim()) return false
  const ordered = orderedMudancas(mudancas)
  for (let i = 0; i < ordered.length; i++) {
    const incoming = ordered[i]!
    if (!crossPartyEquivalent(incoming.partido_novo, party)) continue
    if (isPlaceholderPartyToken(incoming.partido_anterior)) continue
    for (let j = i + 1; j < ordered.length; j++) {
      const outgoing = ordered[j]!
      if (!crossPartyEquivalent(outgoing.partido_anterior, party)) continue
      if (isPlaceholderPartyToken(outgoing.partido_novo)) continue
      if (mudancaLooksAutoOnly(incoming) && mudancaLooksAutoOnly(outgoing)) continue
      if (!mudancaLooksCurated(incoming) && !mudancaLooksCurated(outgoing)) continue
      if (!partyHasTraceOrIsCurrent(historicoRows, incoming.partido_anterior, currentParty)) continue
      if (!partyHasTraceOrIsCurrent(historicoRows, outgoing.partido_novo, currentParty)) continue
      return true
    }
  }
  return false
}

/**
 * Espelha `isTsePleitoStubVsMandateOpen` do `audit-historico-runtime.ts` (artefato TSE, não “troca ausente”).
 */
export function isTsePleitoStubVsMandateOpenTransition(a: HistoricoLite, b: HistoricoLite): boolean {
  if (resolveHistoricoRowProvenance(a) !== "tse" || resolveHistoricoRowProvenance(b) !== "tse") return false
  const isSingleYearStub = (r: HistoricoLite) =>
    r.periodo_inicio != null && r.periodo_fim != null && r.periodo_inicio === r.periodo_fim
  const isOpenMandate = (r: HistoricoLite) => r.periodo_fim == null && r.periodo_inicio != null
  const looksLikePleito = (obs: string | null | undefined) => {
    if (!obs) return false
    const u = obs.toLowerCase()
    return u.includes("candidatura") || u.includes("pleito")
  }

  const ya = a.periodo_inicio
  const yb = b.periodo_inicio
  if (ya == null || yb == null) return false

  if (ya === yb) {
    if (isSingleYearStub(a) && isOpenMandate(b) && looksLikePleito(a.observacoes)) return true
    if (isSingleYearStub(b) && isOpenMandate(a) && looksLikePleito(b.observacoes)) return true
    return false
  }
  if (Math.abs(ya - yb) !== 1) return false
  const ordered = ya < yb ? ([a, b] as const) : ([b, a] as const)
  const [first, second] = ordered
  const y1 = first.periodo_inicio!
  const y2 = second.periodo_inicio!
  if (y2 !== y1 + 1) return false
  return (
    isSingleYearStub(first) &&
    isOpenMandate(second) &&
    looksLikePleito(first.observacoes) &&
    second.periodo_inicio === y1 + 1
  )
}

/**
 * Transições de partido entre linhas consecutivas **no mesmo cargo canônico**
 * (aproximação de “sequência de mandatos” §15.3).
 */
function listConsecutivePartyTransitions(rows: HistoricoLite[]): PartyHistoricoCrossTransition[] {
  const byCanon = new Map<string, HistoricoLite[]>()
  for (const r of rows) {
    if (!r.partido?.trim()) continue
    if (r.periodo_inicio == null) continue
    const k = rowCanon(r)
    const list = byCanon.get(k) ?? []
    list.push(r)
    byCanon.set(k, list)
  }
  const out: PartyHistoricoCrossTransition[] = []
  for (const group of byCanon.values()) {
    const sorted = [...group].sort((a, b) => rankHistorico(a) - rankHistorico(b))
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]!
      const cur = sorted[i]!
      const p0 = prev.partido!.trim()
      const p1 = cur.partido!.trim()
      if (canonicalPartiesEquivalent(p0, p1)) continue
      out.push({ fromRow: prev, toRow: cur, fromParty: p0, toParty: p1 })
    }
  }
  return out
}

/**
 * Janela de `ano` na mudança mais restrita que a v0 (`lo-2` … `hi+4`):
 * exige `ano` entre `min(inícios)-1` e `max(inícios)+1` (inclusive), alinhado ao intervalo dos dois mandatos.
 */
export function mudancaMatchesTransition(
  m: MudancaLite,
  fromParty: string,
  toParty: string,
  yFrom: number | null,
  yTo: number | null,
): boolean {
  if (!crossPartyEquivalent(m.partido_anterior, fromParty) || !crossPartyEquivalent(m.partido_novo, toParty)) {
    return false
  }
  if (m.ano == null) return true
  if (yFrom == null && yTo == null) return true
  const a = yFrom ?? m.ano
  const b = yTo ?? m.ano
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  return m.ano >= lo - 1 && m.ano <= hi + 1
}

function isMudancaInTransitionWindow(m: MudancaLite, yFrom: number | null, yTo: number | null): boolean {
  if (m.ano == null) return false
  if (yFrom == null && yTo == null) return true
  const a = yFrom ?? m.ano
  const b = yTo ?? m.ano
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  return m.ano >= lo - 1 && m.ano <= hi + 1
}

function hasHistoricoTraceForIntermediateParty(
  historicoRows: HistoricoLite[],
  party: string,
  yFrom: number | null,
  yTo: number | null,
): boolean {
  if (crossPartyEquivalent(party, "")) return false
  const lo = yFrom == null && yTo == null ? null : Math.min(yFrom ?? yTo!, yTo ?? yFrom!)
  const hi = yFrom == null && yTo == null ? null : Math.max(yFrom ?? yTo!, yTo ?? yFrom!)
  return historicoRows.some((row) => {
    if (!historicoRowMatchesParty(row, party)) return false
    if (lo == null || hi == null) return true
    const year = row.periodo_inicio
    if (year == null) return false
    return year >= lo - 1 && year <= hi + 1
  })
}

function findMaterializedMudancaChain(
  historicoRows: HistoricoLite[],
  mudancas: MudancaLite[],
  fromParty: string,
  toParty: string,
  yFrom: number | null,
  yTo: number | null,
  currentParty: string | null | undefined,
): MudancaLite[] | null {
  const chain: MudancaLite[] = []
  let current = fromParty
  const ordered = orderedMudancas(mudancas)
    .filter((m) => isMudancaInTransitionWindow(m, yFrom, yTo))

  for (const m of ordered) {
    if (!crossPartyEquivalent(m.partido_anterior, current)) continue
    chain.push(m)
    current = m.partido_novo
    if (crossPartyEquivalent(current, toParty)) break
  }

  if (chain.length < 2 || !crossPartyEquivalent(current, toParty)) return null

  const intermediateParties = chain
    .slice(0, -1)
    .map((m) => m.partido_novo.trim())
    .filter((party) => party && !crossPartyEquivalent(party, fromParty) && !crossPartyEquivalent(party, toParty))

  if (intermediateParties.length === 0) return null
  if (
    !intermediateParties.every((party) =>
      hasHistoricoTraceForIntermediateParty(historicoRows, party, yFrom, yTo) ||
      isCuratedTimelineIntermediateParty(party, historicoRows, mudancas, currentParty),
    )
  ) {
    return null
  }

  return chain
}

function buildFullFindings(
  slug: string,
  historicoRows: HistoricoLite[],
  mudancas: MudancaLite[],
  transitions: PartyHistoricoCrossTransition[],
  currentParty?: string | null,
): PartyHistoricoCrossFinding[] {
  const findings: PartyHistoricoCrossFinding[] = []

  for (const t of transitions) {
    if (crossPartyEquivalent(t.fromParty, t.toParty)) continue
    const y0 = t.fromRow.periodo_inicio
    const y1 = t.toRow.periodo_inicio
    const ok = mudancas.some((m) => mudancaMatchesTransition(m, t.fromParty, t.toParty, y0, y1))
    const hasMaterializedChain = findMaterializedMudancaChain(
      historicoRows,
      mudancas,
      t.fromParty,
      t.toParty,
      y0,
      y1,
      currentParty,
    )
    if (!ok) {
      if (!hasMaterializedChain) {
        findings.push({
          code: "mandato_transicao_sem_mudanca",
          severity: "baixa",
          ref_id: t.toRow.id,
          detail: `${slug}: transição ${t.fromParty}→${t.toParty} entre históricos sem mudança_partido alinhada`,
        })
      }
    }
  }

  const tokens = partyTokensHistorico(historicoRows)

  for (const m of mudancas) {
    const novoTok = partySiglaToken(m.partido_novo)
    const novoMatchesToken = [...tokens].some(
      (tok) => crossPartyEquivalent(tok, m.partido_novo) || crossPartyEquivalent(tok, novoTok),
    )
    if (!novoMatchesToken) {
      findings.push({
        code: "mudanca_partido_novo_sem_mandato",
        severity: "media",
        ref_id: m.id,
        detail: `${slug}: mudança ano=${m.ano ?? "null"} para ${m.partido_novo} sem partido correspondente no histórico`,
      })
    }

    const ant = m.partido_anterior.trim()
    if (!isPlaceholderPartyToken(ant)) {
      const antTok = partySiglaToken(ant)
      const antMatches = [...tokens].some(
        (tok) => crossPartyEquivalent(tok, ant) || crossPartyEquivalent(tok, antTok),
      )
      if (!antMatches) {
        findings.push({
          code: "mudanca_partido_anterior_sem_rastro",
          severity: "baixa",
          ref_id: m.id,
          detail: `${slug}: mudança com partido_anterior=${ant} sem partido correspondente no histórico`,
        })
      }
    }
  }

  return findings
}

function capFindingsByCode(findings: PartyHistoricoCrossFinding[], maxPerCode: number): PartyHistoricoCrossFinding[] {
  const seen = new Map<string, number>()
  const out: PartyHistoricoCrossFinding[] = []
  for (const f of findings) {
    const n = (seen.get(f.code) ?? 0) + 1
    if (n <= maxPerCode) {
      seen.set(f.code, n)
      out.push(f)
    }
  }
  return out
}

export interface PartyHistoricoCrossCheckResult {
  full: PartyHistoricoCrossFinding[]
  actionable: PartyHistoricoCrossFinding[]
}

export interface PartyHistoricoCrossCheckOptions {
  actionableMaxPerCode?: number
  currentParty?: string | null
}

/**
 * Cross-check completo + recorte *actionable* (§15.3).
 */
export function collectPartyHistoricoCrossCheck(
  slug: string,
  historicoRows: HistoricoLite[],
  mudancas: MudancaLite[],
  options?: PartyHistoricoCrossCheckOptions,
): PartyHistoricoCrossCheckResult {
  const transitions = listConsecutivePartyTransitions(historicoRows)
  const full = buildFullFindings(slug, historicoRows, mudancas, transitions, options?.currentParty)

  let actionable = full.filter((f) => {
    if (f.code === "mandato_transicao_sem_mudanca") {
      const t = transitions.find((tr) => tr.toRow.id === f.ref_id)
      if (!t) return true
      if (isTsePleitoStubVsMandateOpenTransition(t.fromRow, t.toRow)) return false
      if (
        hasCurrentPartyTailMudancaForTransition(
          mudancas,
          t.fromParty,
          t.toParty,
          options?.currentParty,
        )
      ) {
        return false
      }
      return true
    }

    const m = mudancas.find((row) => row.id === f.ref_id)
    if (!m) return true

    if (f.code === "mudanca_partido_novo_sem_mandato") {
      if (isCurrentPartyTailMudanca(m, mudancas, options?.currentParty)) return false
      if (isCuratedTimelineIntermediateParty(m.partido_novo, historicoRows, mudancas, options?.currentParty)) return false
    }

    if (f.code === "mudanca_partido_anterior_sem_rastro") {
      if (isCuratedTimelineIntermediateParty(m.partido_anterior, historicoRows, mudancas, options?.currentParty)) {
        return false
      }
    }

    return true
  })

  const maxPer = options?.actionableMaxPerCode ?? PARTY_HISTORICO_ACTIONABLE_MAX_PER_CODE
  actionable = capFindingsByCode(actionable, maxPer)

  return { full, actionable }
}

/** Retrocompat: só o conjunto *full* (comportamento anterior ao *actionable*). */
export function collectPartyHistoricoCrossFindings(
  slug: string,
  historicoRows: HistoricoLite[],
  mudancas: MudancaLite[],
): PartyHistoricoCrossFinding[] {
  return collectPartyHistoricoCrossCheck(slug, historicoRows, mudancas).full
}

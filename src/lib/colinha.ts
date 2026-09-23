/** Estado público de uma colinha. A URL contém escolhas e deve ser tratada como dado sensível. */
import { stripAccents } from "@/lib/strip-accents"

export const SLOT_ORDER = ["df", "de", "s1", "s2", "g", "p"] as const
export type SlotId = (typeof SLOT_ORDER)[number]

export const SLOT_LABELS: Record<SlotId, string> = {
  df: "Deputado federal",
  de: "Deputado estadual ou distrital",
  s1: "Senador 1",
  s2: "Senador 2",
  g: "Governador",
  p: "Presidente",
}

const UFS = new Set([
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
])
const SQ_PATTERN = /^\d{1,20}$/

export interface ColinhaState extends Record<SlotId, string | null> {
  uf: string | null
}

export interface ColinhaCandidate {
  ano: number
  sq_candidato: string
  uf: string
  cargo: string
  nome_urna: string
  numero_urna: string
  partido_sigla: string
  situacao_registro: string
  foto_path: string | null
  slug?: string | null
  resumo?: { patrimonio: number | null; processos: number | null; pontos_atencao: number | null } | null
}

type SearchInput = URLSearchParams | Record<string, string | string[] | undefined>

function one(input: SearchInput, key: string): string | null {
  if (input instanceof URLSearchParams) {
    const values = input.getAll(key)
    return values.length === 1 ? values[0] : null
  }
  const value = input[key]
  return typeof value === "string" ? value : null
}

export function parseColinhaState(input: SearchInput): ColinhaState {
  const ufRaw = one(input, "uf")?.toUpperCase() ?? ""
  const uf = UFS.has(ufRaw) ? ufRaw : null
  const state: ColinhaState = { uf, df: null, de: null, s1: null, s2: null, g: null, p: null }
  if (!uf) return state
  for (const slot of SLOT_ORDER) {
    const value = one(input, slot)
    state[slot] = value && SQ_PATTERN.test(value) ? value : null
  }
  if (state.s1 && state.s1 === state.s2) state.s2 = null
  return state
}

export function buildColinhaUrl(base: string, state: ColinhaState): string {
  const url = new URL(base)
  url.search = ""
  if (state.uf && UFS.has(state.uf)) {
    url.searchParams.set("uf", state.uf)
    for (const slot of SLOT_ORDER) {
      const value = state[slot]
      if (value && SQ_PATTERN.test(value) && !(slot === "s2" && value === state.s1)) {
        url.searchParams.set(slot, value)
      }
    }
  }
  return url.toString()
}

/** Situação é sempre exibida. Estes estados jamais entram no PNG. */
export function isCandidateBlocked(status: string): boolean {
  return /indeferid|cassad|renunci|cancelad|substitu/i.test(stripAccents(status))
}

function matchesSlot(candidate: ColinhaCandidate, slot: SlotId, uf: string): boolean {
  if (candidate.ano !== 2026 || !SQ_PATTERN.test(candidate.sq_candidato)) return false
  const cargo = candidate.cargo.toLowerCase()
  if (slot === "p") return cargo === "presidente" && (candidate.uf === "BR" || candidate.uf === uf)
  if (candidate.uf !== uf) return false
  if (slot === "df") return cargo === "deputado_federal"
  if (slot === "de") return cargo === (uf === "DF" ? "deputado_distrital" : "deputado_estadual")
  if (slot === "s1" || slot === "s2") return cargo === "senador"
  return cargo === "governador"
}

export function resolveColinhaChoices(
  state: ColinhaState,
  candidates: ColinhaCandidate[],
): Record<SlotId, ColinhaCandidate | null> {
  const choices: Record<SlotId, ColinhaCandidate | null> = {
    df: null, de: null, s1: null, s2: null, g: null, p: null,
  }
  if (!state.uf) return choices
  for (const slot of SLOT_ORDER) {
    const sq = state[slot]
    if (!sq || (slot === "s2" && sq === state.s1)) continue
    choices[slot] = candidates.find((candidate) =>
      candidate.sq_candidato === sq && matchesSlot(candidate, slot, state.uf!)
      && !isCandidateBlocked(candidate.situacao_registro)
    ) ?? null
  }
  return choices
}

export function formatColinhaText(
  state: ColinhaState,
  choices: Record<SlotId, ColinhaCandidate | null>,
  url: string,
): string {
  const lines = [`Minha colinha para 2026${state.uf ? ` · ${state.uf}` : ""}`]
  for (const slot of SLOT_ORDER) {
    const candidate = choices[slot]
    lines.push(`${SLOT_LABELS[slot]}: ${candidate ? `${candidate.numero_urna} · ${candidate.nome_urna} (${candidate.partido_sigla})` : "a escolher"}`)
  }
  lines.push("Confira a situação do registro antes de votar.", url)
  return lines.join("\n")
}

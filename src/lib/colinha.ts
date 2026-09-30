/** Estado público de uma colinha. A URL contém escolhas e deve ser tratada como dado sensível. */
import { stripAccents } from "@/lib/strip-accents"
import type { FaseEleitoral2026 } from "@/lib/types"

export const SLOT_ORDER = ["df", "de", "s1", "s2", "g", "p"] as const
export type SlotId = (typeof SLOT_ORDER)[number]
export type ColinhaTurno = 1 | 2

export const SLOT_LABELS: Record<SlotId, string> = {
  df: "Deputado federal",
  de: "Deputado estadual ou distrital",
  s1: "Senador 1",
  s2: "Senador 2",
  g: "Governador",
  p: "Presidente",
}

/** Dígitos por cargo na urna, conforme o Manual do Eleitor do TSE (24/09/2026). */
export const SLOT_DIGITS: Record<SlotId, number> = {
  df: 4,
  de: 5,
  s1: 3,
  s2: 3,
  g: 2,
  p: 2,
}

export const VOTING_GUIDE_SOURCE_URL =
  "https://www.tse.jus.br/comunicacao/noticias/2026/Setembro/manual-do-eleitor-veja-como-se-preparar-para-a-votacao"

export function formatSlotDigits(slot: SlotId): string {
  return `${SLOT_DIGITS[slot]} dígitos`
}

const UFS = new Set([
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
])
const SQ_PATTERN = /^\d{1,20}$/

export interface ColinhaState extends Record<SlotId, string | null> {
  uf: string | null
  /** Ausente em links legados; só o valor 2 altera o modo da colinha. */
  turno?: 2
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
  /** Preenchido somente pelo cruzamento server-side SQ -> slug -> fase oficial. */
  fase_eleitoral_2026?: FaseEleitoral2026 | null
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
  if (one(input, "turno") === "2") state.turno = 2
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
    if (state.turno === 2) url.searchParams.set("turno", "2")
    for (const slot of SLOT_ORDER) {
      const value = state[slot]
      if (value && SQ_PATTERN.test(value) && !(slot === "s2" && value === state.s1)) {
        url.searchParams.set(slot, value)
      }
    }
  }
  return url.toString()
}

/**
 * Ordem neutra da lista: continua alfabética, mas a letra por onde ela começa
 * troca a cada LIST_START_HOURS, igual para todo mundo na mesma hora. A
 * sequência de letras foi embaralhada uma vez e fica fixa neste arquivo, para
 * que qualquer data possa ser conferida com antecedência. Nada do candidato
 * (partido, número, situação) entra na conta.
 */
export const LIST_START_ORDER = [
  "M", "C", "T", "F", "R", "B", "J", "P", "E", "W", "S", "G", "N",
  "A", "L", "V", "D", "K", "O", "H", "U", "I", "Z", "Q", "Y", "X",
] as const
export const LIST_START_HOURS = 5
/** 29/09/2026, 0h de Brasília. */
export const LIST_START_ANCHOR = Date.UTC(2026, 8, 29, 3, 0, 0)

export function listStartLetter(now: Date = new Date()): string {
  const slot = Math.floor((now.getTime() - LIST_START_ANCHOR) / (LIST_START_HOURS * 3_600_000))
  const size = LIST_START_ORDER.length
  return LIST_START_ORDER[((slot % size) + size) % size]
}

/** Situação é sempre exibida. Estes estados jamais entram no PNG. */
/** Código da eleição geral de 2026 no DivulgaCandContas. */
export const TSE_ELEICAO_2026 = "20322002026"

/**
 * Foto exibida na colinha. Sem miniatura gravada, usa a foto oficial servida
 * pelo DivulgaCandContas direto ao navegador. O TSE recusa requisição de
 * servidor (403), então essa URL não pode passar pelo otimizador do Next nem
 * pelo card PNG. Solução provisória até as miniaturas oficiais entrarem em
 * `foto_path`.
 */
export function colinhaPhotoSrc(candidate: Pick<ColinhaCandidate, "foto_path" | "sq_candidato" | "uf">): { src: string | null; direct: boolean } {
  if (candidate.foto_path) return { src: candidate.foto_path, direct: false }
  if (!/^\d{6,15}$/.test(candidate.sq_candidato) || !/^[A-Z]{2}$/.test(candidate.uf)) return { src: null, direct: false }
  return {
    src: `https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/${TSE_ELEICAO_2026}/${candidate.sq_candidato}/${candidate.uf}`,
    direct: true,
  }
}

export function isCandidateBlocked(status: string): boolean {
  return /indeferid|cassad|renunci|cancelad|substitu/i.test(stripAccents(status))
}

/** Data curta pt-BR do snapshot, ou null quando ausente/inválida. Nunca a string literal "sem snapshot". */
export function formatSnapshotDate(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(date)
}

export interface SnapshotStatus {
  message: string
  showPartialWarning: boolean
}

/**
 * Decide a frase do snapshot e se o aviso de cobertura parcial aparece.
 * Nunca produz frase quebrada nem aviso falso enquanto a consulta ainda não terminou.
 */
export function describeSnapshotStatus(input: {
  hasUf: boolean
  checked: boolean
  formattedDate: string | null
  unavailable: boolean
}): SnapshotStatus {
  if (!input.hasUf) {
    return { message: "Escolha um estado para conferir o snapshot da fonte oficial.", showPartialWarning: false }
  }
  if (!input.checked) {
    return { message: "Consultando o snapshot mais recente da fonte oficial…", showPartialWarning: false }
  }
  if (input.formattedDate) {
    return { message: `Situação consultada no snapshot de ${input.formattedDate}.`, showPartialWarning: input.unavailable }
  }
  return {
    message: "Não foi possível confirmar a data do snapshot.",
    showPartialWarning: true,
  }
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
      && (state.turno !== 2
        || ((slot === "p" || slot === "g")
          && candidate.fase_eleitoral_2026?.fase_eleitoral === "segundo_turno"
          && candidate.fase_eleitoral_2026.fase_turno === 1))
      && !isCandidateBlocked(candidate.situacao_registro)
    ) ?? null
  }
  return choices
}

export type ColinhaRoundStatus = "legacy" | "ready" | "partial"
export type ColinhaGovernorOutcome = "second_turno" | "eleito_primeiro_turno" | "unknown"

/** Estado oficial do 2º turno, derivado somente de fases e identidades exatas. */
export interface ColinhaRoundInfo {
  status: ColinhaRoundStatus
  hasOfficialPhase: boolean
  availableSlots: SlotId[]
  presidentFinalistSlugs: string[]
  governorFinalistSlugs: string[]
  presidentFinalistSqs: string[]
  governorFinalistSqs: string[]
  governorOutcome: ColinhaGovernorOutcome
  message: string | null
}

export function deriveColinhaRoundInfo(
  phases: Array<Pick<FaseEleitoral2026, "fase_eleitoral" | "fase_turno"> & { candidato_id?: string; slug: string; cargo_disputado: string }>,
  candidates: Array<Pick<ColinhaCandidate, "slug" | "uf" | "cargo" | "sq_candidato" | "nome_urna"> & { candidato_id?: string }>,
  uf: string,
): ColinhaRoundInfo {
  const legacy: ColinhaRoundInfo = {
    status: "legacy", hasOfficialPhase: false, availableSlots: [...SLOT_ORDER],
    presidentFinalistSlugs: [], governorFinalistSlugs: [], presidentFinalistSqs: [], governorFinalistSqs: [], governorOutcome: "unknown", message: null,
  }
  if (phases.length === 0) return legacy
  const bySlug = new Map(candidates.filter((candidate) => candidate.slug).map((candidate) => [candidate.slug!, candidate]))
  const valid = (phase: typeof phases[number], candidate: typeof candidates[number] | undefined) => {
    if (!candidate || candidate.slug !== phase.slug) return false
    const cargo = candidate.cargo.toLowerCase()
    const candidateId = (candidate as { candidato_id?: string }).candidato_id
    if (candidateId && phase.candidato_id !== candidateId) return false
    return phase.cargo_disputado === "Presidente" ? cargo === "presidente" : cargo === "governador"
  }
  const presidentRows = phases.filter((phase) => phase.cargo_disputado === "Presidente")
  const governorRows = phases.filter((phase) => phase.cargo_disputado === "Governador")
  const presidentFinalists = presidentRows.filter((phase) => phase.fase_eleitoral === "segundo_turno" && valid(phase, bySlug.get(phase.slug)))
    .map((phase) => phase.slug).sort((a, b) => (bySlug.get(a)?.nome_urna ?? a).localeCompare(bySlug.get(b)?.nome_urna ?? b, "pt-BR"))
  const governorsInUf = governorRows.filter((phase) => bySlug.get(phase.slug)?.uf === uf)
  const governorFinalists = governorsInUf.filter((phase) => phase.fase_eleitoral === "segundo_turno" && valid(phase, bySlug.get(phase.slug)))
    .map((phase) => phase.slug).sort((a, b) => (bySlug.get(a)?.nome_urna ?? a).localeCompare(bySlug.get(b)?.nome_urna ?? b, "pt-BR"))
  const presidentReady = presidentFinalists.length === 2
  const governorWinner = governorsInUf.some((phase) => phase.fase_eleitoral === "eleito" && phase.fase_turno === 1 && valid(phase, bySlug.get(phase.slug)))
  const governorReady = governorFinalists.length === 2
  const governorKnown = governorWinner || governorReady
  const presidentKnown = presidentRows.length > 0 && presidentRows.every((phase) => valid(phase, bySlug.get(phase.slug)))
  const availableSlots: SlotId[] = []
  if (presidentReady) availableSlots.push("p")
  if (governorReady) availableSlots.push("g")
  // Ausência de uma linha estadual não prova que o estado não terá 2º turno:
  // sem identidade/fase estadual completa, mantemos o estado parcial.
  const partial = (!presidentReady && !presidentKnown) || !governorKnown
  const presidentWinner = presidentRows.some((phase) => phase.fase_eleitoral === "eleito" && phase.fase_turno === 1 && valid(phase, bySlug.get(phase.slug)))
  const noSecondRoundConfirmed = presidentWinner && governorWinner && presidentKnown && !partial
  const status: ColinhaRoundStatus = availableSlots.length > 0 ? (partial ? "partial" : "ready") : noSecondRoundConfirmed ? "ready" : "partial"
  const message = governorWinner && presidentReady
    ? "Seu estado já elegeu governador no 1º turno. Esta colinha tem apenas presidente."
    : noSecondRoundConfirmed ? "A fase oficial não habilita cargos do 2º turno para este estado."
    : status === "partial" ? "Ainda não foi possível confirmar todos os cargos do 2º turno para este estado." : null
  return {
    status, hasOfficialPhase: true, availableSlots, presidentFinalistSlugs: presidentFinalists,
    governorFinalistSlugs: governorFinalists,
    presidentFinalistSqs: presidentFinalists.map((slug) => bySlug.get(slug)?.sq_candidato).filter((sq): sq is string => Boolean(sq)),
    governorFinalistSqs: governorFinalists.map((slug) => bySlug.get(slug)?.sq_candidato).filter((sq): sq is string => Boolean(sq)),
    governorOutcome: governorReady ? "second_turno" : governorWinner ? "eleito_primeiro_turno" : "unknown", message,
  }
}

export function formatColinhaText(
  state: ColinhaState,
  choices: Record<SlotId, ColinhaCandidate | null>,
  url: string,
  options: { slots?: readonly SlotId[]; message?: string } = {},
): string {
  const slots = options.slots ?? SLOT_ORDER
  const lines = [state.turno === 2 ? `Minha colinha para o 2º turno${state.uf ? ` · ${state.uf}` : ""}` : `Minha colinha para 2026${state.uf ? ` · ${state.uf}` : ""}`]
  if (options.message) lines.push(options.message)
  for (const slot of slots) {
    const candidate = choices[slot]
    lines.push(`${SLOT_LABELS[slot]}: ${candidate ? `${candidate.numero_urna} · ${candidate.nome_urna} (${candidate.partido_sigla})` : "a escolher"}`)
  }
  lines.push("Confira a situação do registro antes de votar.", url)
  return lines.join("\n")
}

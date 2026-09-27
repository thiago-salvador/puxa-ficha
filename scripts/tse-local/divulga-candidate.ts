import { createHash } from "node:crypto"

import { withVisibleTseChrome, type TseChromeClient } from "./chrome-fetch"

const DIVULGACAND_ROOT = "https://divulgacandcontas.tse.jus.br/divulga/rest/v1"
const ORDINARIAS_URL = `${DIVULGACAND_ROOT}/eleicao/ordinarias`
const UF_PATTERN = /^(?:AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/

export type SeedCandidateIdentity = {
  slug: string
  uf: string
  sqCandidato: string
}

export type DivulgaAsset = {
  tipo: string | null
  descricao: string | null
  valor: number | null
}

export type PreviousElection = {
  year: number | null
  cargo: string | null
  partido: string | null
  uf: string | null
  situacaoTotalizacao: string | null
  sqCandidato: string | null
}

export type PartyChange = {
  fromYear: number
  fromParty: string
  toYear: number
  toParty: string
}

export type DivulgaCandidateSummary = {
  status: "ok" | "erro"
  slug: string
  ano: 2026
  uf: string
  sqCandidato: string
  source: string
  sha256_payload: string | null
  motivo?: "identidade_seed_invalida" | "eleicoes_ordinarias_indisponiveis" | "eleicao_2026_nao_resolvida" | "detalhe_divergente" | "consulta_falhou"
  bens?: DivulgaAsset[] | null
  totalDeBens?: number | null
  gastoCampanha1T?: number | null
  eleicoesAnteriores?: PreviousElection[] | null
  mudancasPartido?: PartyChange[] | null
  numeroProcessoPrestContas?: string | null
}

type WithClient = <T>(run: (client: TseChromeClient) => Promise<T>) => Promise<T>

function textField(value: unknown): string | null {
  if (typeof value !== "string") return null
  const clean = value.trim().replace(/\b\d[\d\s./-]{9,}\d\b/g, (match) => {
    const digits = match.replace(/\D/g, "")
    return digits.length === 11 || digits.length === 12 ? "[redigido]" : match
  })
  return clean || null
}

function first(record: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) if (record[key] !== undefined) return record[key]
  return undefined
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value.trim())) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function electionIdFrom(payload: unknown): string | null {
  const found = new Set<string>()
  const queue: unknown[] = [payload]
  const visited = new Set<object>()
  while (queue.length) {
    const current = queue.pop()
    if (Array.isArray(current)) {
      queue.push(...current)
      continue
    }
    const record = asRecord(current)
    if (!record || visited.has(record)) continue
    visited.add(record)
    const year = Number(record.ano)
    const id = String(record.id ?? "")
    if (year === 2026 && /^\d{5,20}$/.test(id)) found.add(id)
    queue.push(...Object.values(record))
  }
  return found.size === 1 ? [...found][0]! : null
}

function candidateUrl(identity: SeedCandidateIdentity, electionId: string): string {
  return `${DIVULGACAND_ROOT}/candidatura/buscar/2026/${identity.uf}/${electionId}/candidato/${identity.sqCandidato}`
}

function validIdentity(identity: SeedCandidateIdentity): boolean {
  return /^[a-z0-9][a-z0-9-]{0,119}$/i.test(identity.slug) &&
    UF_PATTERN.test(identity.uf) && /^\d{5,20}$/.test(identity.sqCandidato)
}

function sanitizeBens(value: unknown): DivulgaAsset[] | null {
  if (!Array.isArray(value)) return null
  return value.map((item) => {
    const record = asRecord(item) ?? {}
    return {
      tipo: textField(first(record, "tipoBem", "ds_TIPO_BEM", "descricaoTipoBem", "tipo")),
      descricao: textField(first(record, "descricaoBem", "ds_BEM", "descricao")),
      valor: finiteNumber(first(record, "valorBem", "vr_BEM", "valor")),
    }
  })
}

function sanitizePreviousElections(value: unknown): PreviousElection[] | null {
  if (!Array.isArray(value)) return null
  return value.map((item) => {
    const record = asRecord(item) ?? {}
    const year = finiteNumber(first(record, "year", "ano"))
    const uf = textField(first(record, "UF", "uf"))?.toUpperCase() ?? null
    const sq = first(record, "SQ", "sqCandidato", "sq_CANDIDATO")
    return {
      year: year === null ? null : Math.trunc(year),
      cargo: textField(first(record, "cargo", "nomeCargo")),
      partido: textField(first(record, "partido", "siglaPartido")),
      uf: uf && UF_PATTERN.test(uf) ? uf : null,
      situacaoTotalizacao: textField(first(record, "situacaoTotalizacao", "descricaoTotalizacao")),
      sqCandidato: typeof sq === "string" || typeof sq === "number" ? String(sq).match(/^\d{5,20}$/)?.[0] ?? null : null,
    }
  })
}

/** Compara apenas candidaturas anteriores com ano e partido explícitos. */
export function derivePartyChanges(elections: readonly PreviousElection[] | null): PartyChange[] | null {
  if (elections === null) return null
  const byYear = new Map<number, Set<string>>()
  for (const election of elections) {
    if (election.year === null || !election.partido) continue
    const parties = byYear.get(election.year) ?? new Set<string>()
    parties.add(election.partido.trim().toUpperCase())
    byYear.set(election.year, parties)
  }
  const ordered = [...byYear].sort(([a], [b]) => a - b)
  const changes: PartyChange[] = []
  let previous: { year: number; party: string } | null = null
  for (const [year, parties] of ordered) {
    if (parties.size !== 1) { previous = null; continue }
    const party = [...parties][0]!
    if (previous && previous.party !== party) changes.push({
      fromYear: previous.year, fromParty: previous.party, toYear: year, toParty: party,
    })
    previous = { year, party }
  }
  return changes
}

function failure(identity: SeedCandidateIdentity, motivo: DivulgaCandidateSummary["motivo"], source = ORDINARIAS_URL): DivulgaCandidateSummary {
  return {
    status: "erro", slug: /^[a-z0-9][a-z0-9-]{0,119}$/i.test(identity.slug) ? identity.slug : "", ano: 2026,
    uf: UF_PATTERN.test(identity.uf) ? identity.uf : "",
    sqCandidato: /^\d{5,20}$/.test(identity.sqCandidato) ? identity.sqCandidato : "",
    source, sha256_payload: null, motivo,
  }
}

function summarize(identity: SeedCandidateIdentity, electionId: string, source: string, payload: unknown): DivulgaCandidateSummary {
  const record = asRecord(payload)
  const election = asRecord(record?.eleicao)
  if (!record || String(record.id ?? "") !== identity.sqCandidato ||
      String(record.ufCandidatura ?? "").toUpperCase() !== identity.uf ||
      String(election?.id ?? "") !== electionId || Number(election?.ano) !== 2026) {
    return failure(identity, "detalhe_divergente", source)
  }
  const bensValue = record.bens
  const bens = bensValue === undefined || bensValue === null ? null : sanitizeBens(bensValue)
  const previous = sanitizePreviousElections(record.eleicoesAnteriores)
  return {
    status: "ok", slug: identity.slug, ano: 2026, uf: identity.uf,
    sqCandidato: identity.sqCandidato, source,
    // getJson exposes parsed JSON only; this hashes its canonical serialization, not wire bytes.
    sha256_payload: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
    bens,
    totalDeBens: finiteNumber(record.totalDeBens),
    gastoCampanha1T: finiteNumber(record.gastoCampanha1T),
    eleicoesAnteriores: previous,
    mudancasPartido: derivePartyChanges(previous),
    numeroProcessoPrestContas: textField(record.numeroProcessoPrestContas),
  }
}

/** Read-only DivulgaCand fallback keyed only by the seed's official 2026 SQ and UF. */
export async function collectDivulgaCandidateFallback(
  candidates: readonly SeedCandidateIdentity[],
  withClient: WithClient = withVisibleTseChrome,
): Promise<DivulgaCandidateSummary[]> {
  const results = new Map<number, DivulgaCandidateSummary>()
  const valid = candidates.map((identity, index) => {
    if (!validIdentity(identity)) results.set(index, failure(identity, "identidade_seed_invalida"))
    return validIdentity(identity) ? { identity, index } : null
  }).filter((row): row is { identity: SeedCandidateIdentity; index: number } => row !== null)
  if (!valid.length) return candidates.map((_, index) => results.get(index)!)

  try {
    await withClient(async (client) => {
      let electionId: string | null = null
      let ordinariasUnavailable = false
      try { electionId = electionIdFrom(await client.getJson(ORDINARIAS_URL)) }
      catch { ordinariasUnavailable = true /* Keep public receipts free of arbitrary endpoint error text. */ }
      if (!electionId) {
        const reason = ordinariasUnavailable ? "eleicoes_ordinarias_indisponiveis" : "eleicao_2026_nao_resolvida"
        for (const { identity, index } of valid) results.set(index, failure(identity, reason))
        return
      }
      for (const { identity, index } of valid) {
        const source = candidateUrl(identity, electionId!)
        try {
          const payload = await client.getJson(source)
          results.set(index, summarize(identity, electionId, source, payload))
        } catch {
          results.set(index, failure(identity, "consulta_falhou", source))
        }
      }
    })
  } catch {
    for (const { identity, index } of valid) {
      if (!results.has(index)) results.set(index, failure(identity, "consulta_falhou"))
    }
  }
  return candidates.map((_, index) => results.get(index)!)
}

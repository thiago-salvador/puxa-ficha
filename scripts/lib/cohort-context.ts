import { AsyncLocalStorage } from "node:async_hooks"

import type { CandidatoConfig } from "./types"
import type { CoorteAtualizacao } from "./coorte-atualizacao"

const UFS = new Set([
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
])
interface CohortContext {
  candidates: readonly CandidatoConfig[]
  coorteAtualizacao?: CoorteAtualizacao
}

const storage = new AsyncLocalStorage<CohortContext>()

function validateCohortConfig(candidates: readonly CandidatoConfig[]): readonly CandidatoConfig[] {
  if (candidates.length === 0) throw new Error("coorte explícita vazia")
  const slugs = new Set<string>()
  const sqs = new Set<string>()
  for (const candidate of candidates) {
    const slug = String(candidate.slug ?? "").trim()
    const sq = String(candidate.ids?.tse_sq_candidato?.["2026"] ?? "").trim()
    const uf = String(candidate.estado ?? "").trim().toUpperCase()
    if (!slug || slugs.has(slug)) throw new Error(`coorte explícita com slug ausente ou duplicado: ${slug || "(vazio)"}`)
    if (!/^\d+$/.test(sq) || sqs.has(sq)) throw new Error(`coorte explícita com SQ ausente ou duplicado: ${sq || "(vazio)"}`)
    if (candidate.cargo_disputado !== "Senador") throw new Error(`coorte explícita aceita somente cargo Senador: ${slug}`)
    if (!UFS.has(uf)) throw new Error(`coorte explícita com UF inválida: ${uf || "(vazio)"}`)
    slugs.add(slug)
    sqs.add(sq)
  }
  return candidates.map((candidate) => ({
    ...candidate,
    estado: candidate.estado?.trim().toUpperCase(),
    ids: { ...candidate.ids, tse_sq_candidato: { ...candidate.ids.tse_sq_candidato } },
  }))
}

export function withExplicitCohort<T>(candidates: readonly CandidatoConfig[], fn: () => T, coorteAtualizacao?: CoorteAtualizacao): T
export function withExplicitCohort<T>(candidates: readonly CandidatoConfig[], fn: () => Promise<T>, coorteAtualizacao?: CoorteAtualizacao): Promise<T>
export function withExplicitCohort<T>(candidates: readonly CandidatoConfig[], fn: () => T | Promise<T>, coorteAtualizacao?: CoorteAtualizacao): T | Promise<T> {
  return storage.run({ candidates: validateCohortConfig(candidates), coorteAtualizacao: coorteAtualizacao ?? storage.getStore()?.coorteAtualizacao }, fn)
}

export function getExplicitCohort(): readonly CandidatoConfig[] | null {
  return storage.getStore()?.candidates ?? null
}

export function getInjectedCoorteAtualizacao(): CoorteAtualizacao | null {
  return storage.getStore()?.coorteAtualizacao ?? null
}

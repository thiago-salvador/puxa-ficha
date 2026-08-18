/**
 * Heurísticas §15.2 — sinais read-only de contaminação cruzada (homônimo / identidade).
 * Nenhuma auto-cura; só lista achados para snapshot de audit.
 */

import { canonicalCargo } from "./cargo-utils"

export type HomonymSignalSeverity = "media" | "baixa"

export interface HomonymSignal {
  code: "idade_minima_cargo" | "cpf_obs_incompativel" | "deputado_estadual_uf_coorte"
  severity: HomonymSignalSeverity
  historico_row_id: string
  detail: string
}

export interface CandidatoHomonymMeta {
  slug: string
  /** Ano de nascimento (ex.: de `data_nascimento`); ausente = não avalia idade mínima */
  birthYear: number | null
  /** CPF só dígitos; ausente = não avalia CPF em observações */
  cpfDigits: string | null
  /** UF da coorte (`candidatos.estado`), quando aplicável */
  estadoCoorte: string | null
}

interface HistoricoLite {
  id: string
  cargo: string
  cargo_canonico: string | null
  periodo_inicio: number | null
  estado: string | null
  observacoes: string | null
}

const MIN_AGE_BY_CANON: Record<string, number> = {
  Presidente: 35,
  "Vice-Presidente": 35,
  Senador: 35,
  Governador: 30,
  "Vice-Governador": 30,
  Prefeito: 21,
  "Vice-Prefeito": 21,
  "Deputado Federal": 21,
  "Deputado Estadual": 21,
  "Deputado Distrital": 21,
  Vereador: 18,
}

function historicoCanon(cargo: string, cargoCanonico: string | null | undefined): string {
  return ((cargoCanonico && cargoCanonico.trim()) || canonicalCargo(cargo)).trim()
}

function onlyDigits(s: string): string {
  return s.replace(/\D/g, "")
}

/** Extrai CPFs colados ou pontuados que parecem CPF (não valida DV). */
export function extractCpfsFromObservacoes(obs: string | null | undefined): string[] {
  if (!obs) return []
  const tokens = [...obs.matchAll(/(?:^|\D)(\d{3}\.?\d{3}\.?\d{3}-?\d{2})(?=\D|$)/g)].map((match) => match[1]!)
  if (!tokens?.length) return []
  return [...new Set(tokens.map(onlyDigits))]
}

export function collectHomonymSignals(
  historicoRows: HistoricoLite[],
  meta: CandidatoHomonymMeta,
): HomonymSignal[] {
  const out: HomonymSignal[] = []

  for (const row of historicoRows) {
    const canon = historicoCanon(row.cargo, row.cargo_canonico)
    const minAge = MIN_AGE_BY_CANON[canon]
    const y = row.periodo_inicio
    if (minAge != null && meta.birthYear != null && y != null) {
      const ageAt = y - meta.birthYear
      if (ageAt < minAge) {
        out.push({
          code: "idade_minima_cargo",
          severity: "media",
          historico_row_id: row.id,
          detail: `${meta.slug}: cargo=${canon} ano=${y} idade_aprox=${ageAt} < mínimo ${minAge}`,
        })
      }
    }

    const cpfsInObs = extractCpfsFromObservacoes(row.observacoes)
    if (meta.cpfDigits && meta.cpfDigits.length === 11 && cpfsInObs.length > 0) {
      for (const c of cpfsInObs) {
        if (c !== meta.cpfDigits) {
          out.push({
            code: "cpf_obs_incompativel",
            severity: "media",
            historico_row_id: row.id,
            detail: `${meta.slug}: observação cita CPF distinto do cadastro do candidato`,
          })
          break
        }
      }
    }

    if (canon === "Deputado Estadual" && row.estado && meta.estadoCoorte) {
      const ufRow = row.estado.trim().toUpperCase()
      const ufCoorte = meta.estadoCoorte.trim().toUpperCase()
      if (ufRow.length === 2 && ufCoorte.length === 2 && ufRow !== ufCoorte) {
        out.push({
          code: "deputado_estadual_uf_coorte",
          severity: "baixa",
          historico_row_id: row.id,
          detail: `${meta.slug}: Deputado Estadual UF=${ufRow} vs coorte UF=${ufCoorte}`,
        })
      }
    }
  }

  return out
}

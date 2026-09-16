import "server-only"

import { createServerSupabaseClient } from "@/lib/supabase"
import { SUPABASE_FIRST_FOLD_ATTEMPT_TIMEOUT_MS, withSupabaseRetry } from "@/lib/supabase-retry"

export interface SenadoRunningMate {
  ordem: 1 | 2
  nome_urna: string
  situacao: string | null
  fonte_url: string
  sq_candidato: string
}

export interface SenadoRunningMateRow extends SenadoRunningMate {
  titular_slug: string
  uf: string
  titular_publicavel: boolean
  vinculo_verificado: boolean
}

export interface SenadoRunningMateAbsence {
  /** Arquivo oficial que o comprovante validado examinou (`source_url`). */
  fonte_url: string
  /** SHA-256 do arquivo examinado, para quem quiser conferir o mesmo snapshot. */
  fonte_sha256?: string
  complemento_url?: string
  complemento_sha256?: string
  fonte_data: string
}

const SENADO_SOURCE_URL = "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip"
const SENADO_COMPLEMENT_URL = "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand_complementar/consulta_cand_complementar_2026.zip"
const SHA256 = /^[a-f0-9]{64}$/i

type SenadoRunningMateAbsenceProof = {
  kind?: unknown
  titular_slug?: unknown
  titular_sq?: unknown
  uf?: unknown
  source_url?: unknown
  source_sha256?: unknown
  complement_url?: unknown
  complement_sha256?: unknown
  consulted_at?: unknown
  positions?: unknown
}

export function isValidSenadoRunningMateAbsenceProof(
  proof: unknown,
  row: { slug: string; estado: string; registration_sq: string | undefined },
): proof is SenadoRunningMateAbsenceProof {
  if (!proof || typeof proof !== "object") return false
  const detail = proof as SenadoRunningMateAbsenceProof
  const positions = Array.isArray(detail.positions) ? detail.positions as Array<{ ordem?: unknown; sq?: unknown; nome?: unknown; status?: unknown }> : []
  const validPositions = positions.length === 2 && positions.every((position, index) => position.ordem === index + 1 && /^\d+$/.test(String(position.sq ?? "")) && String(position.nome ?? "").trim() !== "" && position.status === "INDEFERIDO")
  return detail.kind === "senado_suplencias_official_records_without_current_eligible_positions" && detail.titular_slug === row.slug && /^\d+$/.test(String(detail.titular_sq ?? "")) && detail.titular_sq === row.registration_sq && detail.uf === row.estado && detail.source_url === SENADO_SOURCE_URL && SHA256.test(String(detail.source_sha256 ?? "")) && detail.complement_url === SENADO_COMPLEMENT_URL && SHA256.test(String(detail.complement_sha256 ?? "")) && typeof detail.consulted_at === "string" && Number.isFinite(Date.parse(detail.consulted_at)) && validPositions
}

/**
 * A ausência confirmada cita o arquivo e o hash que o próprio comprovante
 * declara e que `isValidSenadoRunningMateAbsenceProof` acabou de conferir, não
 * uma URL fixa do módulo: se a URL aceita mudar, a fonte exibida acompanha o
 * comprovante em vez de apontar para outro arquivo.
 */
export function senadoRunningMateAbsenceFromProof(
  proof: unknown,
  row: { slug: string; estado: string; registration_sq: string | undefined },
): SenadoRunningMateAbsence | null {
  if (!isValidSenadoRunningMateAbsenceProof(proof, row)) return null
  const detail = proof as { source_url: string; source_sha256: string; complement_url: string; complement_sha256: string; consulted_at: string }
  return {
    fonte_url: detail.source_url,
    fonte_sha256: detail.source_sha256,
    complemento_url: detail.complement_url,
    complemento_sha256: detail.complement_sha256,
    fonte_data: detail.consulted_at.slice(0, 10).split("-").reverse().join("/"),
  }
}

export function selectSenadoRunningMates(
  rows: readonly SenadoRunningMateRow[],
  slugs: readonly string[],
  uf: string,
): Record<string, SenadoRunningMate[]> {
  const result: Record<string, SenadoRunningMate[]> = {}
  const wantedUf = uf.trim().toUpperCase()
  for (const slug of new Set(slugs)) {
    const matches = rows
      .filter((row) => row.titular_slug === slug && row.uf.toUpperCase() === wantedUf && row.titular_publicavel && row.vinculo_verificado)
      .sort((a, b) => a.ordem - b.ordem)
    const orders = new Set(matches.map((row) => row.ordem))
    if (matches.length !== 2 || orders.size !== 2) continue
    result[slug] = matches.map(({ ordem, nome_urna, situacao, fonte_url, sq_candidato }) => ({ ordem, nome_urna, situacao, fonte_url, sq_candidato }))
  }
  return result
}

/**
 * Reader fail-closed: indisponibilidade do banco/fonte retorna unavailable=true
 * e preserva a distinção entre ausência confirmada e erro operacional.
 */
export async function loadSenadoRunningMates(
  slugs: string[],
  uf: string,
): Promise<{ data: Record<string, SenadoRunningMate[]>; absence: Record<string, SenadoRunningMateAbsence>; unavailable: boolean }> {
  if (slugs.length === 0 || !/^[A-Z]{2}$/i.test(uf)) return { data: {}, absence: {}, unavailable: false }
  try {
    const client = createServerSupabaseClient()
    const wantedSlugs = [...new Set(slugs)]
    const runningMates = await withSupabaseRetry("senado-running-mates", async (signal) =>
      client.from("senado_suplencias_publico")
        .select("titular_slug,uf,ordem,nome_urna,situacao,fonte_url,sq_candidato,titular_publicavel,vinculo_verificado")
        .in("titular_slug", wantedSlugs)
        .eq("uf", uf.toUpperCase())
        .abortSignal(signal),
      { attemptTimeoutMs: SUPABASE_FIRST_FOLD_ATTEMPT_TIMEOUT_MS },
    )
    if (runningMates.error) throw runningMates.error
    const absence: Record<string, SenadoRunningMateAbsence> = {}
    try {
      const receipts = await withSupabaseRetry("senado-running-mates-absence", async (signal) =>
        client.from("candidatos_publico")
          .select("slug,estado,verificacao_campos")
          .in("slug", wantedSlugs)
          .eq("estado", uf.toUpperCase())
          .eq("cargo_disputado", "Senador")
          .abortSignal(signal),
        { attemptTimeoutMs: SUPABASE_FIRST_FOLD_ATTEMPT_TIMEOUT_MS },
      )
      if (receipts.error) throw receipts.error
      for (const row of (receipts.data ?? []) as { slug: string; estado: string; verificacao_campos: unknown }[]) {
        const proof = row.verificacao_campos && typeof row.verificacao_campos === "object" ? (row.verificacao_campos as Record<string, unknown>).senado_suplencias_ausencia : null
        if (!proof || typeof proof !== "object") continue
        const registration = row.verificacao_campos && typeof row.verificacao_campos === "object" ? (row.verificacao_campos as Record<string, unknown>).candidate_registration : null
        const registrationSources = registration && typeof registration === "object" && Array.isArray((registration as { fontes_consultadas?: unknown }).fontes_consultadas)
          ? (registration as { fontes_consultadas: Array<{ escopo?: unknown }> }).fontes_consultadas
          : []
        const registrationSq = registrationSources.map((source) => typeof source.escopo === "string" ? /\bSQ_CANDIDATO\s+(\d+)\b/i.exec(source.escopo)?.[1] : undefined).find(Boolean)
        const confirmed = senadoRunningMateAbsenceFromProof(proof, { slug: row.slug, estado: row.estado, registration_sq: registrationSq })
        if (confirmed) absence[row.slug] = confirmed
      }
    } catch {
      // An absence proof failure leaves the candidate unknown, while valid mate rows remain usable.
      console.error("Senado running mates absence proof could not be loaded")
    }
    return { data: selectSenadoRunningMates((runningMates.data ?? []) as SenadoRunningMateRow[], slugs, uf), absence, unavailable: false }
  } catch {
    console.error("Senado running mates could not be loaded")
    return { data: {}, absence: {}, unavailable: true }
  }
}

import "server-only"

import { createServiceRoleSupabaseClient } from "@/lib/supabase"
import { supabaseQueryTimeoutSignal } from "@/lib/supabase-retry"
import { buildMethodSourceRows, IMPRENSA_METHOD_SOURCES, type MethodSourceRow } from "@/lib/imprensa-frescor"

/** Resultados de `coleta_log` que contam como coleta bem-sucedida. */
const SUCCESS_RESULTS = ["encontrado", "vazio_confirmado"]

type LatestQuery = (fontes: readonly string[]) => Promise<string | null>

/**
 * Data da coleta bem-sucedida mais recente entre as fontes pedidas. Uma linha
 * por consulta, ordenada no banco: não pagina o log inteiro.
 */
async function queryLatestSuccessfulCollection(fontes: readonly string[]): Promise<string | null> {
  const admin = createServiceRoleSupabaseClient({ cacheMode: "no-store" })
  const { data, error } = await admin
    .from("coleta_log_ultima")
    .select("executado_em")
    .in("fonte", [...fontes])
    .in("resultado", SUCCESS_RESULTS)
    .order("executado_em", { ascending: false })
    .limit(1)
    .abortSignal(supabaseQueryTimeoutSignal())
  if (error) throw new Error(`coleta_log_ultima (${fontes.join(",")}): ${error.message}`)
  const value = Array.isArray(data) ? (data[0] as { executado_em?: unknown } | undefined)?.executado_em : null
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null
}

export interface ImprensaMethodFreshness {
  checkedAt: string
  rows: MethodSourceRow[]
}

export function createImprensaMethodFreshnessLoader(query: LatestQuery = queryLatestSuccessfulCollection) {
  return async function load(now: string = new Date().toISOString()): Promise<ImprensaMethodFreshness> {
    const entries = await Promise.all(
      IMPRENSA_METHOD_SOURCES.map(async (source) => [source.id, await query(source.receiptSources)] as const),
    )
    return { checkedAt: now, rows: buildMethodSourceRows(Object.fromEntries(entries), now) }
  }
}

export const getImprensaMethodFreshness = createImprensaMethodFreshnessLoader()

/**
 * Última leitura bem-sucedida da situação das candidaturas no TSE. É a coleta
 * que detecta as mudanças de situação em O que mudou. Falha vira null: a página
 * não mostra data que não conseguiu comprovar.
 */
export async function getLatestSituacaoCheck(query: LatestQuery = queryLatestSuccessfulCollection): Promise<string | null> {
  try {
    return await query(["tse-situacao"])
  } catch {
    return null
  }
}

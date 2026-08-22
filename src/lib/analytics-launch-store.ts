import "server-only"

import {
  ANALYTICS_EVENT_NAMES,
  type AnalyticsEventName,
  type AnalyticsPayload,
  getAnalyticsProofIdFromPayload,
} from "@/lib/analytics-events"
import { createServiceRoleSupabaseClient } from "@/lib/supabase"
import { isMissingQuotaRpc, readQuotaRpcStatus } from "@/lib/quota-rpc"

export type AnalyticsLaunchCounts = Record<AnalyticsEventName, number>

function emptyCounts(): AnalyticsLaunchCounts {
  return Object.fromEntries(ANALYTICS_EVENT_NAMES.map((eventName) => [eventName, 0])) as AnalyticsLaunchCounts
}

/**
 * A coluna `ip_hash` chega pela migration `..._analytics_launch_events_ip_hash`.
 * Enquanto ela não estiver aplicada, o PostgREST responde coluna desconhecida
 * (`42703` na leitura, `PGRST204` na escrita). Reconhecer essa assinatura é o que
 * permite que o deploy do código e a aplicação da migration aconteçam em qualquer
 * ordem sem derrubar a ingestão de eventos: sem coluna, o limite durável não roda
 * e o limite em memória continua sendo o teto.
 */
function isMissingIpHashColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === "42703" || error.code === "PGRST204") return true
  const message = error.message?.toLowerCase() ?? ""
  return message.includes("ip_hash") && (message.includes("column") || message.includes("schema cache"))
}

export type AnalyticsIpHashCount =
  | { status: "ok"; count: number }
  | { status: "coluna_ausente" }

/**
 * Conta eventos aceitos do mesmo cliente na janela. É o lado durável do limite:
 * ao contrário do contador em memória, sobrevive a troca de instância e é
 * compartilhado por todas elas. Mesmo formato do `countRecentByIpHash` de
 * `/api/quiz/short-link`.
 */
async function countRecentAnalyticsEventsByIpHash(
  ipHash: string,
  sinceIso: string,
): Promise<AnalyticsIpHashCount> {
  const supabase = createServiceRoleSupabaseClient({ cacheMode: "no-store" })
  const { count, error } = await supabase
    .from("analytics_launch_events")
    .select("*", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", sinceIso)

  if (error) {
    if (isMissingIpHashColumn(error)) return { status: "coluna_ausente" }
    throw new Error(`analytics_launch_events rate count failed: ${error.message}`)
  }

  return { status: "ok", count: count ?? 0 }
}

/**
 * Janela de retenção dos eventos, em dias.
 *
 * Desde que a tabela passou a guardar `ip_hash`, guardar linha para sempre
 * deixou de ser só volume e virou dado pseudônimo parado: pela LGPD, o que foi
 * coletado para limitar abuso não pode sobreviver à finalidade. 90 dias cobrem
 * com folga a janela de um minuto do limitador e ainda deixam espaço para
 * investigar abuso retroativo. O outro motivo é teto físico: o banco é Free de
 * 500 MB, e sink de evento sem expurgo é a forma mais barata de estourar a cota
 * justamente no pico de lançamento.
 *
 * Quem executa o expurgo é o cron diário que já existe
 * (`/api/internal/published-consistency`), porque o projeto não tem pg_cron
 * habilitado. A política também está registrada no comentário da tabela pela
 * migration `..._analytics_launch_events_retencao_90_dias`.
 */
export const ANALYTICS_LAUNCH_RETENTION_DAYS = 90

const MS_POR_DIA = 24 * 60 * 60 * 1000

/** Instante a partir do qual o evento ainda é retido. Tudo antes disso é expurgado. */
export function analyticsLaunchRetentionCutoffIso(agora: Date = new Date()): string {
  return new Date(agora.getTime() - ANALYTICS_LAUNCH_RETENTION_DAYS * MS_POR_DIA).toISOString()
}

export type AnalyticsPurgeResult =
  | { status: "ok"; removidos: number; cutoffIso: string }
  | { status: "tabela_ausente" }
  | { status: "falhou"; message: string }

/**
 * A tabela pode não existir no ambiente (migration ainda não aplicada, banco de
 * preview recém-criado). O PostgREST responde `42P01` na consulta e `PGRST205`
 * quando o cache de schema não conhece o recurso.
 */
function isMissingAnalyticsTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === "42P01" || error.code === "PGRST205") return true
  const message = error.message?.toLowerCase() ?? ""
  return message.includes("analytics_launch_events") && message.includes("does not exist")
}

/**
 * Apaga os eventos fora da janela de retenção. Nunca lança: é passo acessório de
 * um cron cujo trabalho principal é outro, então falha de expurgo vira log e
 * resultado tipado, não 500 que apagaria o sinal do gate de consistência.
 * O DELETE por `created_at` apoia no índice `idx_analytics_launch_events_created`.
 */
export async function purgeAnalyticsLaunchEventsOlderThan(
  cutoffIso: string,
): Promise<AnalyticsPurgeResult> {
  try {
    const supabase = createServiceRoleSupabaseClient({ cacheMode: "no-store" })
    const { count, error } = await supabase
      .from("analytics_launch_events")
      .delete({ count: "exact" })
      .lt("created_at", cutoffIso)

    if (error) {
      if (isMissingAnalyticsTable(error)) return { status: "tabela_ausente" }
      return { status: "falhou", message: error.message }
    }

    return { status: "ok", removidos: count ?? 0, cutoffIso }
  } catch (erro) {
    return { status: "falhou", message: erro instanceof Error ? erro.message : String(erro) }
  }
}

interface AnalyticsLaunchEventRow {
  event_name: AnalyticsEventName
  payload: AnalyticsPayload
  proof_id: string | null
  ip_hash?: string
}

export async function recordAnalyticsLaunchEvent(input: {
  eventName: AnalyticsEventName
  payload: AnalyticsPayload
  ipHash?: string | null
}) {
  const supabase = createServiceRoleSupabaseClient({ cacheMode: "no-store" })
  const proofId = getAnalyticsProofIdFromPayload(input.payload)
  const row: AnalyticsLaunchEventRow = {
    event_name: input.eventName,
    payload: input.payload,
    proof_id: proofId,
  }
  const rowComIpHash: AnalyticsLaunchEventRow = input.ipHash
    ? { ...row, ip_hash: input.ipHash }
    : row

  const { error } = await supabase.from("analytics_launch_events").insert(rowComIpHash)

  if (!error) return

  // Sem a coluna ainda, grava o evento sem o identificador em vez de perdê-lo:
  // analytics é sink de auditoria, e um evento a menos não volta.
  if (input.ipHash && isMissingIpHashColumn(error)) {
    const { error: retryError } = await supabase.from("analytics_launch_events").insert(row)
    if (!retryError) return
    throw new Error(`analytics_launch_events insert failed: ${retryError.message}`)
  }

  throw new Error(`analytics_launch_events insert failed: ${error.message}`)
}

export type AnalyticsQuotaInsertResult =
  | { status: "inserted" }
  | { status: "quota_exceeded" }
  | { status: "coluna_ausente" }

/**
 * Reserva a cota por ip_hash e grava o evento na mesma transação. Sem a RPC
 * ainda, cai no COUNT+INSERT antigo (janela de deploy). Sem a coluna, devolve
 * `coluna_ausente` para o caller gravar o evento sem hash.
 */
export async function recordAnalyticsLaunchEventUnderQuota(input: {
  eventName: AnalyticsEventName
  payload: AnalyticsPayload
  ipHash: string
  sinceIso: string
  max: number
}): Promise<AnalyticsQuotaInsertResult> {
  const supabase = createServiceRoleSupabaseClient({ cacheMode: "no-store" })
  const proofId = getAnalyticsProofIdFromPayload(input.payload)
  const { data, error } = await supabase.rpc("insert_analytics_launch_event_under_ip_quota", {
    p_event_name: input.eventName,
    p_payload: input.payload,
    p_proof_id: proofId,
    p_ip_hash: input.ipHash,
    p_since: input.sinceIso,
    p_max: input.max,
  })

  if (error) {
    if (isMissingIpHashColumn(error)) return { status: "coluna_ausente" }
    if (!isMissingQuotaRpc(error, "insert_analytics_launch_event_under_ip_quota")) {
      throw new Error(`analytics_launch_events quota insert failed: ${error.message}`)
    }

    const durable = await countRecentAnalyticsEventsByIpHash(input.ipHash, input.sinceIso)
    if (durable.status === "coluna_ausente") return { status: "coluna_ausente" }
    if (durable.count >= input.max) return { status: "quota_exceeded" }
    await recordAnalyticsLaunchEvent({
      eventName: input.eventName,
      payload: input.payload,
      ipHash: input.ipHash,
    })
    return { status: "inserted" }
  }

  const status = readQuotaRpcStatus(data)
  if (status === "inserted" || status === "quota_exceeded") return { status }
  throw new Error(`insert_analytics_launch_event_under_ip_quota: status inesperado ${String(status)}`)
}

export async function readAnalyticsLaunchCounts(input: {
  sinceIso: string
  proofId: string
}): Promise<{ counts: AnalyticsLaunchCounts; missing: AnalyticsEventName[] }> {
  if (typeof input.proofId !== "string" || input.proofId.trim() === "") {
    throw new Error("analytics_launch_events readback requires proofId")
  }

  const supabase = createServiceRoleSupabaseClient({ cacheMode: "no-store" })
  const { data, error } = await supabase
    .from("analytics_launch_events")
    .select("event_name")
    .gte("created_at", input.sinceIso)
    .eq("proof_id", input.proofId)

  if (error) {
    throw new Error(`analytics_launch_events readback failed: ${error.message}`)
  }

  const counts = emptyCounts()
  for (const row of data ?? []) {
    const eventName = row.event_name as AnalyticsEventName
    if (Object.prototype.hasOwnProperty.call(counts, eventName)) {
      counts[eventName] += 1
    }
  }

  return {
    counts,
    missing: ANALYTICS_EVENT_NAMES.filter((eventName) => counts[eventName] <= 0),
  }
}

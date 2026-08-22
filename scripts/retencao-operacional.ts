/**
 * Retenção limitada das tabelas operacionais.
 *
 * O padrão é dry-run. `--apply` é a única forma de remover linhas e cada lote
 * passa pela trilha de escrita auditada. Short links seguem o TTL de
 * `expires_at`; o histórico mínimo de envio segue a janela operacional de
 * 90 dias já adotada pelo projeto para registros operacionais.
 *
 * Uso:
 *   npx tsx scripts/retencao-operacional.ts
 *   npx tsx scripts/retencao-operacional.ts --apply
 */

import { pathToFileURL } from "node:url"

import { escreverAuditado } from "./lib/escrita-auditada"
import { supabase } from "./lib/supabase"

export const RETENCAO_BATCH_SIZE = 100
export const RETENCAO_MAX_BATCHES_PER_TABLE = 20
export const NOTIFICATION_LOG_RETENTION_DAYS = 90

type RetentionTable = "quiz_result_short_links" | "notification_log"
type RetentionPolicy = "expires_at <= now" | "digest_date < now - 90 days"

export interface RetencaoOperacionalDeps {
  apply: boolean
  now: Date
  batchSize?: number
  maxBatchesPerTable?: number
  contarShortLinksExpirados: (limiteIso: string) => Promise<number>
  apagarShortLinksLote: (limiteIso: string, limite: number, lote: number) => Promise<number>
  contarNotificationLogsAntigos: (limiteData: string) => Promise<number>
  apagarNotificationLogsLote: (
    limiteData: string,
    limite: number,
    lote: number,
  ) => Promise<number>
}

export interface RetencaoTableResult {
  table: RetentionTable
  policy: RetentionPolicy
  cutoff: string
  eligible: number
  deleted: number
  batches: number
  limitReached: boolean
}

export interface RetencaoOperacionalResult {
  mode: "dry-run" | "apply"
  runAt: string
  batchSize: number
  maxBatchesPerTable: number
  tables: RetencaoTableResult[]
}

interface PurgaTabelaParams {
  apply: boolean
  table: RetentionTable
  policy: RetentionPolicy
  cutoff: string
  batchSize: number
  maxBatches: number
  contar: (cutoff: string) => Promise<number>
  apagarLote: (cutoff: string, limite: number, lote: number) => Promise<number>
}

export function parseRetencaoArgs(argv: string[]): { apply: boolean } {
  const desconhecidos = argv.filter((arg) => arg !== "--apply" && arg !== "--dry-run")
  if (desconhecidos.length > 0) {
    throw new Error(`argumento(s) desconhecido(s): ${desconhecidos.join(", ")}`)
  }
  if (argv.includes("--apply") && argv.includes("--dry-run")) {
    throw new Error("use --apply ou --dry-run, nunca os dois")
  }
  return { apply: argv.includes("--apply") }
}

export function notificationLogRetentionCutoffDate(now: Date): string {
  const cutoff = new Date(now)
  cutoff.setUTCDate(cutoff.getUTCDate() - NOTIFICATION_LOG_RETENTION_DAYS)
  return cutoff.toISOString().slice(0, 10)
}

function validarLimite(nome: string, valor: number): void {
  if (!Number.isInteger(valor) || valor <= 0) {
    throw new Error(`retencao-operacional: ${nome} deve ser inteiro positivo`)
  }
}

async function purgarTabela({
  apply,
  table,
  policy,
  cutoff,
  batchSize,
  maxBatches,
  contar,
  apagarLote,
}: PurgaTabelaParams): Promise<RetencaoTableResult> {
  let eligible: number
  try {
    eligible = await contar(cutoff)
  } catch (error) {
    throw new Error(
      `retencao-operacional: ${table}: contagem falhou: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  if (!Number.isInteger(eligible) || eligible < 0) {
    throw new Error(`retencao-operacional: ${table}: contagem inválida: ${eligible}`)
  }

  let deleted = 0
  let batches = 0

  if (apply && eligible > 0) {
    for (let lote = 1; lote <= maxBatches; lote += 1) {
      let removidas: number
      try {
        removidas = await apagarLote(cutoff, batchSize, lote)
      } catch (error) {
        throw new Error(
          `retencao-operacional: ${table}: lote ${lote} falhou: ${error instanceof Error ? error.message : String(error)}`,
        )
      }

      if (!Number.isInteger(removidas) || removidas < 0 || removidas > batchSize) {
        throw new Error(
          `retencao-operacional: ${table}: lote ${lote} devolveu volume inválido ${removidas}; limite ${batchSize}`,
        )
      }
      if (removidas === 0) break

      deleted += removidas
      batches += 1
    }
  }

  return {
    table,
    policy,
    cutoff,
    eligible,
    deleted,
    batches,
    limitReached: apply && batches === maxBatches && eligible > deleted,
  }
}

export async function runRetencaoOperacional({
  apply,
  now,
  batchSize = RETENCAO_BATCH_SIZE,
  maxBatchesPerTable = RETENCAO_MAX_BATCHES_PER_TABLE,
  contarShortLinksExpirados,
  apagarShortLinksLote,
  contarNotificationLogsAntigos,
  apagarNotificationLogsLote,
}: RetencaoOperacionalDeps): Promise<RetencaoOperacionalResult> {
  validarLimite("batchSize", batchSize)
  validarLimite("maxBatchesPerTable", maxBatchesPerTable)

  const runAt = now.toISOString()
  const notificationCutoff = notificationLogRetentionCutoffDate(now)
  const shortLinks = await purgarTabela({
    apply,
    table: "quiz_result_short_links",
    policy: "expires_at <= now",
    cutoff: runAt,
    batchSize,
    maxBatches: maxBatchesPerTable,
    contar: contarShortLinksExpirados,
    apagarLote: apagarShortLinksLote,
  })
  const notificationLogs = await purgarTabela({
    apply,
    table: "notification_log",
    policy: "digest_date < now - 90 days",
    cutoff: notificationCutoff,
    batchSize,
    maxBatches: maxBatchesPerTable,
    contar: contarNotificationLogsAntigos,
    apagarLote: apagarNotificationLogsLote,
  })

  return {
    mode: apply ? "apply" : "dry-run",
    runAt,
    batchSize,
    maxBatchesPerTable,
    tables: [shortLinks, notificationLogs],
  }
}

async function contarShortLinksExpirados(limiteIso: string): Promise<number> {
  const { count, error } = await supabase
    .from("quiz_result_short_links")
    .select("token", { count: "exact", head: true })
    .lte("expires_at", limiteIso)

  if (error) throw new Error(error.message)
  if (count === null) throw new Error("Supabase não devolveu a contagem exata dos short-links expirados")
  return count
}

async function apagarShortLinksLote(
  limiteIso: string,
  limite: number,
  lote: number,
): Promise<number> {
  const { data, error } = await supabase
    .from("quiz_result_short_links")
    .select("token")
    .lte("expires_at", limiteIso)
    .order("expires_at", { ascending: true })
    .order("token", { ascending: true })
    .limit(limite)

  if (error) throw new Error(error.message)
  const tokens = (data ?? []).map((row) => row.token)
  if (tokens.length === 0) return 0

  const linhas = await escreverAuditado(
    {
      script: "retencao-operacional",
      tabela: "quiz_result_short_links",
      motivo: "remove short-links depois do vencimento registrado",
      recorte: `lote ${lote}, até ${limite} linhas, expires_at <= ${limiteIso}`,
    },
    () =>
      supabase
        .from("quiz_result_short_links")
        .delete()
        .in("token", tokens)
        .lte("expires_at", limiteIso)
        .select("token"),
  )
  return linhas.length
}

async function contarNotificationLogsAntigos(limiteData: string): Promise<number> {
  const { count, error } = await supabase
    .from("notification_log")
    .select("id", { count: "exact", head: true })
    .lt("digest_date", limiteData)

  if (error) throw new Error(error.message)
  if (count === null) throw new Error("Supabase não devolveu a contagem exata dos logs antigos")
  return count
}

async function apagarNotificationLogsLote(
  limiteData: string,
  limite: number,
  lote: number,
): Promise<number> {
  const { data, error } = await supabase
    .from("notification_log")
    .select("id")
    .lt("digest_date", limiteData)
    .order("digest_date", { ascending: true })
    .order("id", { ascending: true })
    .limit(limite)

  if (error) throw new Error(error.message)
  const ids = (data ?? []).map((row) => row.id)
  if (ids.length === 0) return 0

  const linhas = await escreverAuditado(
    {
      script: "retencao-operacional",
      tabela: "notification_log",
      motivo: "remove histórico mínimo de envio fora da retenção",
      recorte: `lote ${lote}, até ${limite} linhas, digest_date < ${limiteData}`,
    },
    () =>
      supabase
        .from("notification_log")
        .delete()
        .in("id", ids)
        .lt("digest_date", limiteData)
        .select("id"),
  )
  return linhas.length
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const { apply } = parseRetencaoArgs(argv)
  const result = await runRetencaoOperacional({
    apply,
    now: new Date(),
    contarShortLinksExpirados,
    apagarShortLinksLote,
    contarNotificationLogsAntigos,
    apagarNotificationLogsLote,
  })
  console.log(JSON.stringify(result, null, 2))
}

const isDirectRun = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false

if (isDirectRun) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}

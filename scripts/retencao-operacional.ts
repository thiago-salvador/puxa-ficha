/**
 * Retenção limitada das tabelas operacionais.
 *
 * O padrão é dry-run. `--apply` é a única forma de remover linhas e cada lote
 * passa pela trilha de escrita auditada. Short links seguem o TTL de
 * `expires_at`; notification_log só entra na execução quando o operador
 * fornece um cutoff explícito.
 *
 * Uso:
 *   npx tsx scripts/retencao-operacional.ts
 *   npx tsx scripts/retencao-operacional.ts --notification-before=YYYY-MM-DD
 *   npx tsx scripts/retencao-operacional.ts --apply --notification-before=YYYY-MM-DD
 */

import { pathToFileURL } from "node:url"

import { escreverAuditado as escreverAuditadoPadrao } from "./lib/escrita-auditada"
import { supabase } from "./lib/supabase"

export const RETENCAO_BATCH_SIZE = 100
export const RETENCAO_MAX_BATCHES_PER_TABLE = 20

type RetentionTable = "quiz_result_short_links" | "notification_log"
type RetentionPolicy = "expires_at <= now" | "digest_date < operator cutoff"

export interface RetencaoOperacionalDeps {
  apply: boolean
  now: Date
  notificationBefore?: string
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

export interface RetencaoQueryResult {
  data: Array<Record<string, string>> | null
  error: { message: string } | null
  count: number | null
}

export interface RetencaoQueryBuilder extends PromiseLike<RetencaoQueryResult> {
  select: (columns: string, options?: { count: "exact"; head: true }) => RetencaoQueryBuilder
  delete: () => RetencaoQueryBuilder
  in: (column: string, values: string[]) => RetencaoQueryBuilder
  lte: (column: string, value: string) => RetencaoQueryBuilder
  lt: (column: string, value: string) => RetencaoQueryBuilder
  order: (column: string, options: { ascending: boolean }) => RetencaoQueryBuilder
  limit: (value: number) => RetencaoQueryBuilder
}

export interface RetencaoSupabaseClient {
  from: (table: string) => RetencaoQueryBuilder
}

export type EscritorAuditado = typeof escreverAuditadoPadrao

const retencaoSupabase = supabase as unknown as RetencaoSupabaseClient

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

function validarNotificationBefore(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("--notification-before deve usar YYYY-MM-DD")
  }
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("--notification-before deve ser uma data válida em YYYY-MM-DD")
  }
  return value
}

export function parseRetencaoArgs(
  argv: string[],
): { apply: boolean; notificationBefore?: string } {
  const notificationArgs = argv.filter((arg) => arg.startsWith("--notification-before="))
  const desconhecidos = argv.filter(
    (arg) =>
      arg !== "--apply" &&
      arg !== "--dry-run" &&
      !arg.startsWith("--notification-before="),
  )
  if (desconhecidos.length > 0) {
    throw new Error(`argumento(s) desconhecido(s): ${desconhecidos.join(", ")}`)
  }
  if (argv.includes("--apply") && argv.includes("--dry-run")) {
    throw new Error("use --apply ou --dry-run, nunca os dois")
  }
  if (notificationArgs.length > 1) {
    throw new Error("use --notification-before uma única vez")
  }
  const apply = argv.includes("--apply")
  if (notificationArgs.length === 0) return { apply }
  return {
    apply,
    notificationBefore: validarNotificationBefore(notificationArgs[0].slice("--notification-before=".length)),
  }
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
  notificationBefore,
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
  const notificationCutoff = notificationBefore === undefined
    ? undefined
    : validarNotificationBefore(notificationBefore)
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
  const tables: RetencaoTableResult[] = [shortLinks]
  if (notificationCutoff !== undefined) {
    tables.push(await purgarTabela({
      apply,
      table: "notification_log",
      policy: "digest_date < operator cutoff",
      cutoff: notificationCutoff,
      batchSize,
      maxBatches: maxBatchesPerTable,
      contar: contarNotificationLogsAntigos,
      apagarLote: apagarNotificationLogsLote,
    }))
  }

  return {
    mode: apply ? "apply" : "dry-run",
    runAt,
    batchSize,
    maxBatchesPerTable,
    tables,
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

export async function apagarShortLinksLote(
  limiteIso: string,
  limite: number,
  lote: number,
  client: RetencaoSupabaseClient = retencaoSupabase,
  escreverAuditado: EscritorAuditado = escreverAuditadoPadrao,
): Promise<number> {
  const tokens = await selecionarShortLinksLote(client, limiteIso, limite)
  if (tokens.length === 0) return 0

  const linhas = await escreverAuditado(
    {
      script: "retencao-operacional",
      tabela: "quiz_result_short_links",
      motivo: "remove short-links depois do vencimento registrado",
      recorte: `lote ${lote}, até ${limite} linhas, expires_at <= ${limiteIso}`,
    },
    () =>
      client
        .from("quiz_result_short_links")
        .delete()
        .in("token", tokens)
        .lte("expires_at", limiteIso)
        .select("token"),
  )
  return linhas.length
}

export async function selecionarShortLinksLote(
  client: RetencaoSupabaseClient,
  limiteIso: string,
  limite: number,
): Promise<string[]> {
  const { data, error } = await client
    .from("quiz_result_short_links")
    .select("token")
    .lte("expires_at", limiteIso)
    .order("expires_at", { ascending: true })
    .order("token", { ascending: true })
    .limit(limite)

  if (error) throw new Error(error.message)
  return (data ?? [])
    .map((row) => row.token)
    .filter((token): token is string => typeof token === "string")
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

export async function apagarNotificationLogsLote(
  limiteData: string,
  limite: number,
  lote: number,
  client: RetencaoSupabaseClient = retencaoSupabase,
  escreverAuditado: EscritorAuditado = escreverAuditadoPadrao,
): Promise<number> {
  const ids = await selecionarNotificationLogsLote(client, limiteData, limite)
  if (ids.length === 0) return 0

  const linhas = await escreverAuditado(
    {
      script: "retencao-operacional",
      tabela: "notification_log",
      motivo: "remove histórico de envio anterior ao cutoff explícito",
      recorte: `lote ${lote}, até ${limite} linhas, digest_date < ${limiteData}`,
    },
    () =>
      client
        .from("notification_log")
        .delete()
        .in("id", ids)
        .lt("digest_date", limiteData)
        .select("id"),
  )
  return linhas.length
}

export async function selecionarNotificationLogsLote(
  client: RetencaoSupabaseClient,
  limiteData: string,
  limite: number,
): Promise<string[]> {
  const { data, error } = await client
    .from("notification_log")
    .select("id")
    .lt("digest_date", limiteData)
    .order("digest_date", { ascending: true })
    .order("id", { ascending: true })
    .limit(limite)

  if (error) throw new Error(error.message)
  return (data ?? [])
    .map((row) => row.id)
    .filter((id): id is string => typeof id === "string")
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const { apply, notificationBefore } = parseRetencaoArgs(argv)
  const result = await runRetencaoOperacional({
    apply,
    now: new Date(),
    notificationBefore,
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

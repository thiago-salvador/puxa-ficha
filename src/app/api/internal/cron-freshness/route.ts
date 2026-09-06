import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { secretsMatch } from "@/lib/crypto-utils"
import { createServiceRoleSupabaseClient } from "@/lib/supabase"
import { supabaseQueryTimeoutSignal } from "@/lib/supabase-retry"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

/**
 * Frescor dos crons da Vercel que deixam rastro no banco. O watchdog
 * (`scripts/cron-watchdog.sh`) só conseguia ver o `runtime-smoke`; os outros
 * cinco crons dependiam de a Vercel notificar um HTTP 500, o que não cobre cron
 * que simplesmente não dispara. Esta rota devolve o último instante conhecido
 * de cada cron com rastro, e o watchdog abre issue quando passa do limite.
 *
 * `published-consistency` e `revalidate-public-cache` deixam recibos privados
 * após conclusão; esta sonda apenas lê, nunca executa os crons nem escreve.
 */
export const CRON_FRESHNESS_CHECKS = [
  { name: "news-refresh", table: "coleta_log", column: "executado_em", filter: { fonte: "google-news" } },
  { name: "news-refresh-recover", table: "cron_execution_receipts", column: "completed_at", filter: { name: "news-refresh-recover" } },
  { name: "send-digest", table: "notification_log", column: "sent_at", filter: { status: "sent" } },
  { name: "published-consistency", table: "cron_execution_receipts", column: "completed_at", filter: { name: "published-consistency" } },
  { name: "revalidate-public-cache", table: "cron_execution_receipts", column: "completed_at", filter: { name: "revalidate-public-cache" } },
] as const

type FreshnessCheck = (typeof CRON_FRESHNESS_CHECKS)[number]

export interface CronFreshnessDeps {
  expectedSecret: string | undefined
  readLatest: (check: FreshnessCheck) => Promise<string | null>
  now: () => Date
}

export async function readLatestFromSupabase(check: FreshnessCheck): Promise<string | null> {
  const supabase = createServiceRoleSupabaseClient({ cacheMode: "no-store" })
  const [filterColumn, filterValue] = Object.entries(check.filter)[0] as [string, string]
  const { data, error } = await supabase
    .from(check.table)
    .select(check.column)
    .abortSignal(supabaseQueryTimeoutSignal())
    .eq(filterColumn, filterValue)
    .not(check.column, "is", null)
    .order(check.column, { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`${check.name}: ${error.message}`)
  const value = (data as Record<string, unknown> | null)?.[check.column]
  return typeof value === "string" ? value : null
}

function bearer(req: NextRequest): string | null {
  const value = req.headers.get("authorization")?.trim()
  return value?.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() : null
}

export function createCronFreshnessHandler(deps: CronFreshnessDeps) {
  return async function cronFreshness(req: NextRequest) {
    if (!secretsMatch(bearer(req), deps.expectedSecret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const now = deps.now()
    const checks = await Promise.all(
      CRON_FRESHNESS_CHECKS.map(async (check) => {
        try {
          const last = await deps.readLatest(check)
          const ageHours = last ? (now.getTime() - new Date(last).getTime()) / 3_600_000 : null
          return { name: check.name, last, age_hours: ageHours === null ? null : Math.round(ageHours * 10) / 10 }
        } catch (error) {
          return { name: check.name, last: null, age_hours: null, error: error instanceof Error ? error.message : "read_failed" }
        }
      }),
    )
    const failed = checks.filter((check) => "error" in check)
    return NextResponse.json(
      { ok: failed.length === 0, generated_at: now.toISOString(), checks },
      { status: failed.length === 0 ? 200 : 500, headers: { "cache-control": "no-store" } },
    )
  }
}

export const GET = createCronFreshnessHandler({
  expectedSecret: process.env.CRON_SECRET,
  readLatest: readLatestFromSupabase,
  now: () => new Date(),
})

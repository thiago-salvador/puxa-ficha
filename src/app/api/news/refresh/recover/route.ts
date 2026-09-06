import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { secretsMatch } from "@/lib/crypto-utils"
import { resolveChainOrigin, validarOrigemEncadeamento } from "@/lib/cron-chain-origin"
import { confirmsNewsRefreshAcceptance } from "@/lib/news/refresh-ack"
import { withCronExecutionReceipt } from "@/lib/cron-execution-receipt"
import {
  createNewsRefreshRunStore,
  NEWS_REFRESH_EXECUTION_HEADER,
  type NewsRefreshRecoverable,
} from "@/lib/news/refresh-run-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const RECOVERY_LIMIT = 12
const RECOVERY_CONCURRENCY = 4
const RECOVERY_FETCH_TIMEOUT_MS = 15_000

interface NewsRefreshRecoveryDeps {
  listRecoverable: (limit: number) => Promise<NewsRefreshRecoverable[]>
  fetchImpl: typeof fetch
  log: (event: string, detail: Record<string, unknown>) => void
}

function getBearer(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization")?.trim()
  if (authHeader?.toLowerCase().startsWith("bearer ")) return authHeader.slice(7).trim()
  return null
}

function safeErrorMessage(error: unknown, secret: string | undefined): string {
  let message = error instanceof Error ? error.message : String(error)
  message = message.replace(/Bearer\s+[^\s"']+/gi, "Bearer [REDACTED]")
  if (secret) message = message.split(secret).join("[REDACTED]")
  return message.slice(0, 300)
}

const defaultStore = createNewsRefreshRunStore()
const defaultDeps: NewsRefreshRecoveryDeps = {
  listRecoverable: (limit) => defaultStore.listRecoverable(limit),
  fetchImpl: fetch,
  log: (event, detail) => console.log(`[news-refresh-recovery] ${event} ${JSON.stringify(detail)}`),
}

export function createNewsRefreshRecoveryHandler(deps: NewsRefreshRecoveryDeps = defaultDeps) {
  return async function newsRefreshRecoveryHandler(req: NextRequest) {
    const expectedSecret = process.env.CRON_SECRET?.trim()
    if (!secretsMatch(getBearer(req), expectedSecret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const origemBruta = resolveChainOrigin(req)
    const origem = validarOrigemEncadeamento(origemBruta)
    if (!origem.ok) {
      deps.log("recovery_origin_rejected", { origem: origemBruta, motivo: origem.motivo })
      return NextResponse.json({ ok: false, error: "invalid_origin" }, { status: 503 })
    }

    let recoverable: NewsRefreshRecoverable[]
    try {
      recoverable = await deps.listRecoverable(RECOVERY_LIMIT)
    } catch (error) {
      deps.log("recovery_scan_failed", { message: safeErrorMessage(error, expectedSecret) })
      return NextResponse.json({ ok: false, error: "scan_failed" }, { status: 503 })
    }

    const results: boolean[] = []
    for (let offset = 0; offset < recoverable.length; offset += RECOVERY_CONCURRENCY) {
      const slice = recoverable.slice(offset, offset + RECOVERY_CONCURRENCY)
      const sliceResults = await Promise.all(
        slice.map(async (item) => {
          const url = new URL("/api/news/refresh", origem.origin)
          url.searchParams.set("cursor", String(item.cursor))
          url.searchParams.set("limit", String(item.limit))
          url.searchParams.set("chain", "1")
          url.searchParams.set("depth", String(item.chainDepth))
          if (item.revalidateRequested) url.searchParams.set("revalidate", "1")

          const controller = new AbortController()
          const timer = setTimeout(() => controller.abort(), RECOVERY_FETCH_TIMEOUT_MS)
          try {
            const response = await deps.fetchImpl(url.toString(), {
              method: "POST",
              headers: {
                Authorization: `Bearer ${expectedSecret}`,
                [NEWS_REFRESH_EXECUTION_HEADER]: item.executionId,
              },
              cache: "no-store",
              redirect: "manual",
              signal: controller.signal,
            })
            const accepted = await confirmsNewsRefreshAcceptance(
              response,
              item.executionId,
              item.cursor,
            )
            if (!accepted) {
              deps.log("recovery_redrive_failed", {
                executionId: item.executionId,
                cursor: item.cursor,
                kind: item.kind,
                status: response.status,
              })
            }
            return accepted
          } catch (error) {
            deps.log("recovery_redrive_failed", {
              executionId: item.executionId,
              cursor: item.cursor,
              kind: item.kind,
              message: safeErrorMessage(error, expectedSecret),
            })
            return false
          } finally {
            clearTimeout(timer)
          }
        }),
      )
      results.push(...sliceResults)
    }

    const redriven = results.filter(Boolean).length
    const failed = results.length - redriven
    deps.log("recovery_sweep_completed", { scanned: recoverable.length, redriven, failed })
    return NextResponse.json(
      { ok: failed === 0, scanned: recoverable.length, redriven, failed },
      { status: failed === 0 ? 200 : 503 },
    )
  }
}

const handler = createNewsRefreshRecoveryHandler()
export const GET = withCronExecutionReceipt("news-refresh-recover", handler)

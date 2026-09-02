import { createServiceRoleSupabaseClient } from "@/lib/supabase"

export const NEWS_REFRESH_EXECUTION_HEADER = "x-puxaficha-news-execution-id"

type NewsRefreshBatchState = "processing" | "retryable" | "completed"
type NewsRefreshContinuationState = "none" | "pending" | "dispatching" | "dispatched"

interface NewsRefreshBatchConfig {
  executionId: string
  cursor: number
  limit: number
  chainDepth: number
  shouldChain: boolean
  revalidateRequested: boolean
}

export interface NewsRefreshBatchClaim extends NewsRefreshBatchConfig {
  acquired: boolean
  state: NewsRefreshBatchState
  ownerToken: string | null
  nextCursor: number | null
  continuationState: NewsRefreshContinuationState
}

interface NewsRefreshContinuationClaim {
  acquired: boolean
  token: string | null
  nextCursor: number | null
  limit: number
  chainDepth: number
  revalidateRequested: boolean
}

export interface NewsRefreshRecoverable {
  executionId: string
  cursor: number
  limit: number
  chainDepth: number
  revalidateRequested: boolean
  kind:
    | "batch_retryable"
    | "batch_lease_expired"
    | "continuation_pending"
    | "continuation_lease_expired"
}

export interface NewsRefreshRunStore {
  acquireBatch: (config: NewsRefreshBatchConfig, leaseSeconds: number) => Promise<NewsRefreshBatchClaim>
  renewBatchLease: (args: {
    executionId: string
    cursor: number
    ownerToken: string
    leaseSeconds: number
  }) => Promise<boolean>
  completeBatch: (args: {
    executionId: string
    cursor: number
    ownerToken: string
    nextCursor: number | null
  }) => Promise<boolean>
  markBatchRetryable: (args: {
    executionId: string
    cursor: number
    ownerToken: string
    error: string
  }) => Promise<boolean>
  claimContinuation: (args: {
    executionId: string
    cursor: number
    leaseSeconds: number
  }) => Promise<NewsRefreshContinuationClaim>
  finishContinuation: (args: {
    executionId: string
    cursor: number
    token: string
    accepted: boolean
  }) => Promise<boolean>
  listRecoverable: (limit: number) => Promise<NewsRefreshRecoverable[]>
}

interface AcquireRow {
  acquired: boolean
  state: NewsRefreshBatchState
  owner_token: string | null
  next_cursor: number | null
  continuation_state: NewsRefreshContinuationState
  batch_limit: number
  chain_depth: number
  chain_enabled: boolean
  revalidate_requested: boolean
}

interface ContinuationRow {
  acquired: boolean
  continuation_token: string | null
  next_cursor: number | null
  batch_limit: number
  chain_depth: number
  revalidate_requested: boolean
}

interface RecoverableRow {
  execucao_id: string
  cursor: number
  batch_limit: number
  chain_depth: number
  revalidate_requested: boolean
  recovery_kind: NewsRefreshRecoverable["kind"]
}

function firstRow<T>(data: unknown, rpcName: string): T {
  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row !== "object") {
    throw new Error(`${rpcName} returned no row`)
  }
  return row as T
}

function requireRpcSuccess<T>(result: { data: T; error: { message: string } | null }, rpcName: string): T {
  if (result.error) throw new Error(`${rpcName} failed: ${result.error.message}`)
  return result.data
}

export function createNewsRefreshRunStore(): NewsRefreshRunStore {
  const client = () => createServiceRoleSupabaseClient({ cacheMode: "no-store" })

  return {
    async acquireBatch(config, leaseSeconds) {
      const data = requireRpcSuccess(
        await client().rpc("acquire_news_refresh_lote", {
          p_execucao_id: config.executionId,
          p_cursor: config.cursor,
          p_limit: config.limit,
          p_chain_depth: config.chainDepth,
          p_chain_enabled: config.shouldChain,
          p_revalidate_requested: config.revalidateRequested,
          p_lease_seconds: leaseSeconds,
        }),
        "acquire_news_refresh_lote",
      )
      const row = firstRow<AcquireRow>(data, "acquire_news_refresh_lote")
      return {
        executionId: config.executionId,
        cursor: config.cursor,
        limit: row.batch_limit,
        chainDepth: row.chain_depth,
        shouldChain: row.chain_enabled,
        revalidateRequested: row.revalidate_requested,
        acquired: row.acquired,
        state: row.state,
        ownerToken: row.owner_token,
        nextCursor: row.next_cursor,
        continuationState: row.continuation_state,
      }
    },

    async renewBatchLease({ executionId, cursor, ownerToken, leaseSeconds }) {
      return Boolean(
        requireRpcSuccess(
          await client().rpc("renew_news_refresh_lote_lease", {
            p_execucao_id: executionId,
            p_cursor: cursor,
            p_owner_token: ownerToken,
            p_lease_seconds: leaseSeconds,
          }),
          "renew_news_refresh_lote_lease",
        ),
      )
    },

    async completeBatch({ executionId, cursor, ownerToken, nextCursor }) {
      return Boolean(
        requireRpcSuccess(
          await client().rpc("complete_news_refresh_lote", {
            p_execucao_id: executionId,
            p_cursor: cursor,
            p_owner_token: ownerToken,
            p_next_cursor: nextCursor,
          }),
          "complete_news_refresh_lote",
        ),
      )
    },

    async markBatchRetryable({ executionId, cursor, ownerToken, error }) {
      return Boolean(
        requireRpcSuccess(
          await client().rpc("retry_news_refresh_lote", {
            p_execucao_id: executionId,
            p_cursor: cursor,
            p_owner_token: ownerToken,
            p_error_code: error,
          }),
          "retry_news_refresh_lote",
        ),
      )
    },

    async claimContinuation({ executionId, cursor, leaseSeconds }) {
      const data = requireRpcSuccess(
        await client().rpc("claim_news_refresh_continuacao", {
          p_execucao_id: executionId,
          p_cursor: cursor,
          p_lease_seconds: leaseSeconds,
        }),
        "claim_news_refresh_continuacao",
      )
      const row = firstRow<ContinuationRow>(data, "claim_news_refresh_continuacao")
      return {
        acquired: row.acquired,
        token: row.continuation_token,
        nextCursor: row.next_cursor,
        limit: row.batch_limit,
        chainDepth: row.chain_depth,
        revalidateRequested: row.revalidate_requested,
      }
    },

    async finishContinuation({ executionId, cursor, token, accepted }) {
      return Boolean(
        requireRpcSuccess(
          await client().rpc("finish_news_refresh_continuacao", {
            p_execucao_id: executionId,
            p_cursor: cursor,
            p_continuation_token: token,
            p_accepted: accepted,
          }),
          "finish_news_refresh_continuacao",
        ),
      )
    },

    async listRecoverable(limit) {
      const rows = requireRpcSuccess(
        await client().rpc("list_news_refresh_recuperaveis", { p_limit: limit }),
        "list_news_refresh_recuperaveis",
      ) as RecoverableRow[] | null
      return (rows ?? []).map((row) => ({
        executionId: row.execucao_id,
        cursor: row.cursor,
        limit: row.batch_limit,
        chainDepth: row.chain_depth,
        revalidateRequested: row.revalidate_requested,
        kind: row.recovery_kind,
      }))
    },
  }
}

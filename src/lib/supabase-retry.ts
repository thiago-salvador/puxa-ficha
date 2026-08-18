import * as Sentry from "@sentry/nextjs"

import { sleep } from "./async-utils"

const SUPABASE_RETRY_ATTEMPTS = 3

// Per-attempt timeout so a hung Supabase query degrades gracefully instead of blocking the
// serverless function until the platform limit (~300s) and returning a 504. Worst-case total
// across retries (timeout + backoff per attempt) stays well under that limit; on a healthy
// query the timeout never fires, so behavior is unchanged.
// Overridable via env (sem redeploy) desde 2026-08-04: os timeouts diários de
// produção mostraram que 3 x 15s + backoff = ~45s de espera antes do banner
// degradado, e um pico pode exigir baixar isso na hora pelo painel da Vercel.
function readAttemptTimeoutFromEnv(): number | null {
  const raw = process.env.SUPABASE_ATTEMPT_TIMEOUT_MS?.trim()
  if (!raw) return null
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed >= 1_000 ? parsed : null
}
const SUPABASE_ATTEMPT_TIMEOUT_MS = readAttemptTimeoutFromEnv() ?? 15_000

/**
 * Timeout por tentativa das consultas de primeira dobra (lista da home, /uf e
 * comparador). Elas respondem em bem menos de 1s quando saudáveis; 5s por
 * tentativa mantém as 3 retentativas em ~15,75s no pior caso, em vez dos ~45s
 * que o default de 15s impunha antes do estado degradado aparecer.
 */
export const SUPABASE_FIRST_FOLD_ATTEMPT_TIMEOUT_MS = Math.min(
  5_000,
  SUPABASE_ATTEMPT_TIMEOUT_MS
)

export type SupabaseRunResult<T> = {
  data: T | null
  error: { message?: string; code?: string } | null
  /** Preservado quando a consulta Supabase usa `{ count: "exact" }`. */
  count?: number | null
}

/**
 * Codigos PostgREST/Postgres deterministicos: o mesmo erro volta identico na
 * segunda e na terceira tentativa. PGRST116 e `.single()` sem linha (a ficha
 * inexistente vira 404), 42501 e permissao negada e 42703 e coluna inexistente.
 * Retentar so gasta 3 round trips, 750ms de backoff e um issue de Sentry para
 * chegar na mesma resposta.
 *
 * 42703 entrou em 2026-08-08 por custo medido, nao por elegancia. O codigo
 * consulta `verificacao_campos` e cai para CANDIDATO_COLUMNS_LEGACY quando a
 * coluna nao existe (ver isMissingVerificationColumnError em api.ts). Enquanto
 * a migration que cria a coluna nao roda, TODA carga fria de ficha pagava as
 * 3 tentativas com timeout antes de chegar no fallback que sempre funciona:
 * `/candidato/lula` levou 20,9s, sendo 18,2s so nisso, contra 86ms na carga
 * quente. Falha deterministica nao merece retry.
 */
const NON_RETRYABLE_ERROR_CODES = new Set(["PGRST116", "42501", "42703"])

function errorCode(error: { code?: string } | null | undefined): string | undefined {
  const code = error?.code
  return typeof code === "string" && code.length > 0 ? code : undefined
}

function isNonRetryableError(error: { code?: string } | null | undefined): boolean {
  const code = errorCode(error)
  return code !== undefined && NON_RETRYABLE_ERROR_CODES.has(code)
}

/**
 * Labels carregam o slug consultado (`patrimonio(ze-batista)`). Para agrupar no
 * Sentry por operacao, e nao um issue por candidato, o fingerprint usa so a
 * parte estavel do label.
 */
function retryGroupKey(label: string): string {
  return label.replace(/\(.*\)\s*$/, "").trim() || label
}

/**
 * Falha de Supabase que sobrevive a todas as tentativas nao lanca: os callers
 * degradam a pagina e seguem. Sem isto ela so existiria como `console.error` e
 * um span `internal_error` solto, sem issue, sem alerta e sem agrupamento.
 */
function reportExhaustedRetries(params: {
  label: string
  attempts: number
  timeouts: number
  attemptTimeoutMs: number
  lastError?: string
  lastCode?: string
  thrown?: unknown
}): void {
  const { label, attempts, timeouts, attemptTimeoutMs, lastError, lastCode, thrown } = params
  const timedOut = timeouts > 0

  Sentry.withScope((scope) => {
    scope.setTag("supabase.operation", retryGroupKey(label))
    scope.setTag("supabase.timed_out", timedOut ? "true" : "false")
    scope.setTag("supabase.outcome", thrown ? "threw" : "error_result")
    // Sem o codigo, operacoes diferentes do mesmo label caem no mesmo issue e
    // escondem o PostgREST que realmente falhou.
    if (lastCode) scope.setTag("supabase.code", lastCode)
    scope.setContext("supabase_retry", {
      label,
      attempts,
      timeouts,
      attemptTimeoutMs,
      lastError: lastError ?? null,
      lastCode: lastCode ?? null,
    })
    scope.setFingerprint(
      lastCode
        ? ["supabase-retry-exhausted", retryGroupKey(label), lastCode]
        : ["supabase-retry-exhausted", retryGroupKey(label)]
    )

    if (thrown !== undefined) {
      Sentry.captureException(thrown)
      return
    }
    Sentry.captureMessage(
      `Supabase ${timedOut ? "timeout" : "failure"} after ${attempts} attempts: ${retryGroupKey(label)}` +
        (lastCode ? ` [${lastCode}]` : ""),
      "error"
    )
  })
}

export async function withSupabaseRetry<T>(
  label: string,
  run: (signal: AbortSignal) => Promise<SupabaseRunResult<T>>,
  options: { attemptTimeoutMs?: number } = {}
): Promise<SupabaseRunResult<T>> {
  const attemptTimeoutMs = options.attemptTimeoutMs ?? SUPABASE_ATTEMPT_TIMEOUT_MS
  let lastResult: SupabaseRunResult<T> | null = null
  let lastThrown: unknown = null
  let timeouts = 0

  for (let attempt = 1; attempt <= SUPABASE_RETRY_ATTEMPTS; attempt += 1) {
    let timer: ReturnType<typeof setTimeout> | undefined
    let attemptTimedOut = false
    // Aborta a tentativa no timeout. Callers que repassam o signal para
    // `.abortSignal()` do PostgREST liberam o slot de conexao em vez de deixar a
    // query pendurada; callers antigos (assinatura `() => ...`) ignoram o arg e
    // mantem o comportamento anterior.
    const controller = new AbortController()
    try {
      const result = await Promise.race<SupabaseRunResult<T>>([
        run(controller.signal),
        new Promise<SupabaseRunResult<T>>((resolve) => {
          timer = setTimeout(() => {
            attemptTimedOut = true
            timeouts += 1
            controller.abort()
            resolve({ data: null, error: { message: `${label} timed out after ${attemptTimeoutMs}ms` } })
          }, attemptTimeoutMs)
        }),
      ])
      if (!result.error) {
        return result
      }
      // Erro deterministico nao melhora na proxima tentativa: devolve na hora,
      // sem backoff, sem breadcrumb e sem issue de Sentry.
      if (isNonRetryableError(result.error)) {
        return result
      }
      lastResult = result
    } catch (error) {
      lastThrown = error
    } finally {
      if (timer) clearTimeout(timer)
    }

    // Trilha da tentativa que falhou. Vira contexto do evento se as retentativas
    // se esgotarem, e nao emite nada quando a proxima tentativa recupera.
    Sentry.addBreadcrumb({
      category: "supabase",
      level: "warning",
      message: `${label} attempt ${attempt}/${SUPABASE_RETRY_ATTEMPTS} failed`,
      data: {
        timedOut: attemptTimedOut,
        attemptTimeoutMs,
        error: lastThrown ? String(lastThrown) : (lastResult?.error?.message ?? null),
      },
    })

    if (attempt < SUPABASE_RETRY_ATTEMPTS) {
      await sleep(attempt * 250)
    }
  }

  if (lastResult) {
    console.error(`${label} failed after retries:`, lastResult.error?.message)
    reportExhaustedRetries({
      label,
      attempts: SUPABASE_RETRY_ATTEMPTS,
      timeouts,
      attemptTimeoutMs,
      lastError: lastResult.error?.message,
      lastCode: errorCode(lastResult.error),
    })
    return lastResult
  }

  const thrown = lastThrown instanceof Error ? lastThrown : new Error(`${label} failed after retries`)
  reportExhaustedRetries({
    label,
    attempts: SUPABASE_RETRY_ATTEMPTS,
    timeouts,
    attemptTimeoutMs,
    lastError: thrown.message,
    thrown,
  })
  throw thrown
}

import "server-only"
import { createClient } from "@supabase/supabase-js"
import { sleep } from "@/lib/async-utils"

interface SupabaseClientOptions {
  cacheMode?: "isr" | "no-store"
  revalidate?: number
}

// A ficha de candidato dispara 13 consultas num unico `Promise.all`
// (`fetchCandidatoCompleto` em src/lib/api.ts). Com teto 12 a propria pagina se
// enfileirava atras de si mesma: a 13a query so comecava depois que outra
// terminasse. O teto cobre a ficha inteira e ainda sobra folga para o resto do
// request na mesma instancia Fluid Compute.
export const DEFAULT_SUPABASE_FETCH_CONCURRENCY = 24

// Teto de espera na fila do semaforo. Sem ele, um slot vazado (tentativa
// abandonada que nunca libera) deixa todo caller seguinte pendurado ate o limite
// da plataforma; com ele a espera falha rapido e com mensagem propria.
//
// O numero precisa ficar ABAIXO do timeout por tentativa de `withSupabaseRetry`
// (SUPABASE_ATTEMPT_TIMEOUT_MS, 15s). Sob fila saturada o caller hoje espera ate
// aquele timeout disparar, ou seja 3 x 15s no pior caso; com o teto em 10s o
// mesmo pior caso cai para 3 x 10s. Enquanto `SupabaseFetchQueueTimeoutError`
// nao for classificado como nao-retryable em supabase-retry.ts, o teto so pode
// reduzir o pior caso, nunca aumentar.
export const DEFAULT_SUPABASE_FETCH_QUEUE_TIMEOUT_MS = 10_000

function readPositiveIntEnv(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? `${fallback}`, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export interface SupabaseFetchLimiter {
  /** Reserva um slot. Rejeita no teto da fila ou quando o `signal` aborta. */
  acquire(signal?: AbortSignal): Promise<void>
  release(): void
  readonly active: number
  readonly pending: number
}

interface SupabaseFetchWaiter {
  settled: boolean
  resolve: () => void
  reject: (error: Error) => void
  timer?: ReturnType<typeof setTimeout>
  signal?: AbortSignal
  onAbort?: () => void
}

function createAbortError(signal?: AbortSignal): Error {
  const reason = signal?.reason
  if (reason instanceof Error) return reason
  const error = new Error("Supabase fetch abortado antes de consumir slot")
  error.name = "AbortError"
  return error
}

function createQueueTimeoutError(queueTimeoutMs: number): Error {
  const error = new Error(`Supabase fetch queue timed out after ${queueTimeoutMs}ms`)
  error.name = "SupabaseFetchQueueTimeoutError"
  return error
}

/**
 * Semaforo de fetches para o PostgREST. O slot e transferido dentro de
 * `release()` (decrementa e ja reincrementa para o proximo da fila) para que um
 * caller sincrono nao roube a vaga entre o `resolve` e a retomada do waiter.
 */
export function createSupabaseFetchLimiter(
  options: { maxConcurrent?: number; queueTimeoutMs?: number } = {}
): SupabaseFetchLimiter {
  const maxConcurrent =
    options.maxConcurrent && options.maxConcurrent > 0
      ? options.maxConcurrent
      : DEFAULT_SUPABASE_FETCH_CONCURRENCY
  const queueTimeoutMs =
    options.queueTimeoutMs && options.queueTimeoutMs > 0
      ? options.queueTimeoutMs
      : DEFAULT_SUPABASE_FETCH_QUEUE_TIMEOUT_MS

  let active = 0
  const pending: SupabaseFetchWaiter[] = []

  // Waiter que desiste (teto da fila ou abort) sai da fila na hora. Sem isto ele
  // continuaria elegivel e receberia um slot que ninguem mais devolve.
  function dropWaiter(waiter: SupabaseFetchWaiter): void {
    waiter.settled = true
    const index = pending.indexOf(waiter)
    if (index >= 0) pending.splice(index, 1)
    if (waiter.timer) clearTimeout(waiter.timer)
    if (waiter.signal && waiter.onAbort) {
      waiter.signal.removeEventListener("abort", waiter.onAbort)
    }
  }

  return {
    get active() {
      return active
    },
    get pending() {
      return pending.length
    },
    acquire(signal?: AbortSignal): Promise<void> {
      if (signal?.aborted) return Promise.reject(createAbortError(signal))
      if (active < maxConcurrent) {
        active += 1
        return Promise.resolve()
      }

      return new Promise<void>((resolve, reject) => {
        const waiter: SupabaseFetchWaiter = { settled: false, resolve, reject, signal }
        const giveUp = (error: Error) => {
          if (waiter.settled) return
          dropWaiter(waiter)
          reject(error)
        }

        waiter.timer = setTimeout(() => giveUp(createQueueTimeoutError(queueTimeoutMs)), queueTimeoutMs)
        if (signal) {
          waiter.onAbort = () => giveUp(createAbortError(signal))
          signal.addEventListener("abort", waiter.onAbort, { once: true })
        }
        pending.push(waiter)
      })
    },
    release(): void {
      active = Math.max(0, active - 1)
      const waiter = pending[0]
      if (!waiter) return
      dropWaiter(waiter)
      active += 1
      waiter.resolve()
    },
  }
}

const supabaseFetchLimiter = createSupabaseFetchLimiter({
  maxConcurrent: readPositiveIntEnv(
    process.env.PF_SUPABASE_FETCH_CONCURRENCY,
    DEFAULT_SUPABASE_FETCH_CONCURRENCY
  ),
  queueTimeoutMs: readPositiveIntEnv(
    process.env.PF_SUPABASE_FETCH_QUEUE_TIMEOUT_MS,
    DEFAULT_SUPABASE_FETCH_QUEUE_TIMEOUT_MS
  ),
})

function resolvePublicSiteSupabaseConfig() {
  return {
    url: process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(),
    key: process.env.SUPABASE_ANON_KEY?.trim() || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
  }
}

function resolveServiceRoleSupabaseConfig() {
  return {
    url: process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(),
    key: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  }
}

export function getAppSupabaseUrl() {
  return resolvePublicSiteSupabaseConfig().url ?? null
}

export function createConfiguredFetch(
  options: SupabaseClientOptions = {},
  limiter: SupabaseFetchLimiter = supabaseFetchLimiter
) {
  const cacheMode = options.cacheMode ?? "isr"
  const revalidate = options.revalidate ?? 3600

  return async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const nextOptions = init?.next ?? {}
    // O `signal` que o PostgREST monta em `.abortSignal()` viaja no proprio
    // `init`, e o spread abaixo o entrega intacto ao fetch global: nenhum campo
    // desta funcao pode sobrescrever `signal`. O local aqui existe para as duas
    // decisoes do semaforo (nao entrar na fila com signal ja abortado, e nao
    // retentar depois de um abort em voo).
    //
    // Os call sites de query direta em src/lib/api.ts repassam o signal para
    // `.abortSignal()`, entao em producao `callerSignal` chega preenchido. O
    // gate que impede um call site novo de esquecer disso e
    // `npm run audit:supabase-abort-signal`.
    const callerSignal = init?.signal ?? undefined
    const requestInit: Parameters<typeof fetch>[1] = {
      ...init,
      cache: cacheMode === "no-store" ? "no-store" : "force-cache",
      next:
        cacheMode === "no-store"
          ? { ...nextOptions, revalidate: 0 }
          : { ...nextOptions, revalidate },
    }
    const method = requestInit?.method?.toUpperCase() ?? "GET"
    const canRetry = method === "GET" || method === "HEAD"
    const attempts = canRetry ? 3 : 1

    let lastError: unknown = null

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      // Barreira unica de abort antes do slot: `acquire` rejeita na hora quando
      // o signal ja abortou, entao a chamada nao consome vaga nem chega ao
      // fetch. A rejeicao sai por fora do `try`, logo nao vira retentativa.
      await limiter.acquire(callerSignal)
      try {
        return await fetch(input, requestInit)
      } catch (error) {
        lastError = error
        if (attempt === attempts) break
        // Abort em voo: o slot ja voltou no `finally` e retentar so repetiria o
        // mesmo abort. Encerra com o erro original.
        if (callerSignal?.aborted) break
        await sleep(attempt * 250)
      } finally {
        limiter.release()
      }
    }

    throw lastError
  }
}

// Read-only public site: no auth/cookie management needed.
// If adding auth later, implement proper cookie handling here.
export function createServerSupabaseClient(options?: SupabaseClientOptions) {
  const { url, key } = resolvePublicSiteSupabaseConfig()

  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL/SUPABASE_ANON_KEY or legacy NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY"
    )
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: createConfiguredFetch(options),
    },
  })
}

export function createServiceRoleSupabaseClient(options?: SupabaseClientOptions) {
  const { url, key } = resolveServiceRoleSupabaseConfig()

  if (!url || !key) {
    // A mensagem carrega o chamador. Sem isso, o erro chega no log de produção
    // como um `at <unknown>` em chunk minificado, e descobrir quem pediu a
    // credencial vira arqueologia. Incidente de 16/08/2026: a ficha quebrou
    // inteira em Preview e o rastro não dizia de onde vinha.
    const faltando = [!url && "SUPABASE_URL", !key && "SUPABASE_SERVICE_ROLE_KEY"]
      .filter(Boolean)
      .join(" e ")
    const chamador =
      new Error().stack?.split("\n").slice(2, 4).join(" <- ").trim() || "chamador desconhecido"
    throw new Error(`Missing ${faltando} (pedido por: ${chamador})`)
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      fetch: createConfiguredFetch(options),
    },
  })
}

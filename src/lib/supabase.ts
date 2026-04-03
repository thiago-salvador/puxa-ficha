import "server-only"
import { createClient } from "@supabase/supabase-js"
import { sleep } from "@/lib/async-utils"

interface SupabaseClientOptions {
  cacheMode?: "isr" | "no-store"
  revalidate?: number
}

const DEFAULT_SUPABASE_FETCH_CONCURRENCY = 12
const configuredConcurrency = Number.parseInt(
  process.env.PF_SUPABASE_FETCH_CONCURRENCY ?? `${DEFAULT_SUPABASE_FETCH_CONCURRENCY}`,
  10
)
const MAX_CONCURRENT_SUPABASE_FETCHES =
  Number.isFinite(configuredConcurrency) && configuredConcurrency > 0
    ? configuredConcurrency
    : DEFAULT_SUPABASE_FETCH_CONCURRENCY

let activeSupabaseFetches = 0
const pendingSupabaseFetches: Array<() => void> = []

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

async function acquireSupabaseFetchSlot() {
  if (activeSupabaseFetches < MAX_CONCURRENT_SUPABASE_FETCHES) {
    activeSupabaseFetches += 1
    return
  }

  await new Promise<void>((resolve) => {
    pendingSupabaseFetches.push(resolve)
  })
  activeSupabaseFetches += 1
}

function releaseSupabaseFetchSlot() {
  activeSupabaseFetches = Math.max(0, activeSupabaseFetches - 1)
  const next = pendingSupabaseFetches.shift()
  if (next) next()
}

function createConfiguredFetch(options: SupabaseClientOptions = {}) {
  const cacheMode = options.cacheMode ?? "isr"
  const revalidate = options.revalidate ?? 3600

  return async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const nextOptions = init?.next ?? {}
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
      await acquireSupabaseFetchSlot()
      try {
        return await fetch(input, requestInit)
      } catch (error) {
        lastError = error
        if (attempt === attempts) break
        await sleep(attempt * 250)
      } finally {
        releaseSupabaseFetchSlot()
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
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
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

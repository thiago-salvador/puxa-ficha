import { createServerClient } from "@supabase/ssr"
import { createClient } from "@supabase/supabase-js"

function createNoStoreFetch() {
  return async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
    fetch(input, {
      ...init,
      cache: "no-store",
      next: { revalidate: 0 },
    })
}

// Read-only public site: no auth/cookie management needed.
// If adding auth later, implement proper cookie handling here.
export function createServerSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY")
  }

  return createServerClient(url, key, {
    global: {
      fetch: createNoStoreFetch(),
    },
    cookies: {
      getAll() {
        return []
      },
      setAll() {},
    },
  })
}

export function createServiceRoleSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      fetch: createNoStoreFetch(),
    },
  })
}

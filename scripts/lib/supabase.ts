import { existsSync } from "node:fs"
import path from "node:path"
import { createClient } from "@supabase/supabase-js"

const envFiles = [".env.local", ".env"]
for (const file of envFiles) {
  const hasUrl = Boolean(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)
  const hasKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
  if (hasUrl && hasKey) break

  const envPath = path.resolve(process.cwd(), file)
  if (existsSync(envPath)) {
    process.loadEnvFile(envPath)
  }
}

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
}

export const supabase = createClient(url, key)

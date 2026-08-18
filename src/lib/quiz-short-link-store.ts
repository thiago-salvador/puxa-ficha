import "server-only"

import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { createServiceRoleSupabaseClient } from "@/lib/supabase"

/** TTL padrão do short-link do quiz (90 dias em milissegundos). */
export const QUIZ_SHORT_LINK_TTL_MS = 90 * 24 * 60 * 60 * 1000

interface QuizShortLinkRecord {
  token: string
  query_string: string
  ip_hash: string | null
  created_at: string
  expires_at: string
}

type InsertResult = "inserted" | "duplicate"

interface QuizShortLinkStore {
  countRecentByIpHash(ipHash: string, sinceIso: string): Promise<number>
  insertLink(record: QuizShortLinkRecord): Promise<InsertResult>
  resolveToken(token: string): Promise<string | null>
}

function resolveQuizShortLinkFixturePath() {
  const raw = process.env.PF_QUIZ_SHORT_LINKS_FILE?.trim()
  if (!raw) return null
  return path.resolve(raw)
}

function isUniqueViolation(error: unknown) {
  if (!error || typeof error !== "object") return false
  return "code" in error && error.code === "23505"
}

function normalizeFixtureRows(value: unknown): QuizShortLinkRecord[] {
  const rawRows =
    Array.isArray(value)
      ? value
      : value && typeof value === "object" && Array.isArray((value as { rows?: unknown[] }).rows)
        ? (value as { rows: unknown[] }).rows
        : []

  return rawRows.flatMap((row) => {
    if (!row || typeof row !== "object") return []
    const candidate = row as Partial<QuizShortLinkRecord>
    if (typeof candidate.token !== "string") return []
    if (typeof candidate.query_string !== "string") return []
    if (candidate.ip_hash != null && typeof candidate.ip_hash !== "string") return []
    if (typeof candidate.created_at !== "string") return []
    const expiresAt =
      typeof candidate.expires_at === "string"
        ? candidate.expires_at
        // Registros antigos do fixture (pré-TTL) herdam created_at + TTL default.
        : new Date(
            Date.parse(candidate.created_at) + QUIZ_SHORT_LINK_TTL_MS,
          ).toISOString()
    return [
      {
        token: candidate.token,
        query_string: candidate.query_string,
        ip_hash: candidate.ip_hash ?? null,
        created_at: candidate.created_at,
        expires_at: expiresAt,
      },
    ]
  })
}

async function readFixtureRows(filePath: string): Promise<QuizShortLinkRecord[]> {
  try {
    const raw = await readFile(filePath, "utf8")
    return normalizeFixtureRows(JSON.parse(raw))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
    throw error
  }
}

async function writeFixtureRows(filePath: string, rows: QuizShortLinkRecord[]) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify({ rows }, null, 2)}\n`, "utf8")
}

function createFixtureStore(filePath: string): QuizShortLinkStore {
  return {
    async countRecentByIpHash(ipHash, sinceIso) {
      const since = Date.parse(sinceIso)
      const rows = await readFixtureRows(filePath)
      return rows.filter((row) => row.ip_hash === ipHash && Date.parse(row.created_at) >= since).length
    },
    async insertLink(record) {
      const rows = await readFixtureRows(filePath)
      if (rows.some((row) => row.token === record.token)) return "duplicate"
      rows.push(record)
      await writeFixtureRows(filePath, rows)
      return "inserted"
    },
    async resolveToken(token) {
      const rows = await readFixtureRows(filePath)
      const now = Date.now()
      const match = rows.find(
        (row) => row.token === token && Date.parse(row.expires_at) > now,
      )
      return match?.query_string ?? null
    },
  }
}

function createSupabaseStore(): QuizShortLinkStore {
  const supabase = createServiceRoleSupabaseClient({ cacheMode: "no-store" })

  return {
    async countRecentByIpHash(ipHash, sinceIso) {
      const { count, error } = await supabase
        .from("quiz_result_short_links")
        .select("*", { count: "exact", head: true })
        .eq("ip_hash", ipHash)
        .gte("created_at", sinceIso)

      if (error) throw error
      return count ?? 0
    },
    async insertLink(record) {
      const { error } = await supabase.from("quiz_result_short_links").insert({
        token: record.token,
        query_string: record.query_string,
        ip_hash: record.ip_hash,
        created_at: record.created_at,
        expires_at: record.expires_at,
      })

      if (!error) return "inserted"
      if (isUniqueViolation(error)) return "duplicate"
      throw error
    },
    async resolveToken(token) {
      const { data, error } = await supabase
        .from("quiz_result_short_links")
        .select("query_string")
        .eq("token", token)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle()

      if (error || !data || typeof data.query_string !== "string") return null
      return data.query_string
    },
  }
}

export function createQuizShortLinkStore(): QuizShortLinkStore {
  const fixturePath = resolveQuizShortLinkFixturePath()
  if (fixturePath) return createFixtureStore(fixturePath)
  return createSupabaseStore()
}

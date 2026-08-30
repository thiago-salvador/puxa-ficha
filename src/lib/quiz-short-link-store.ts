import "server-only"

import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { isMissingQuotaRpc, readQuotaRpcStatus } from "@/lib/quota-rpc"
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

export type QuizShortLinkInsertResult = "inserted" | "duplicate" | "quota_exceeded"

interface QuizShortLinkStore {
  tryInsertLink(
    record: QuizShortLinkRecord,
    sinceIso: string,
    max: number,
  ): Promise<QuizShortLinkInsertResult>
  resolveToken(token: string): Promise<string | null>
}

const fixtureLocks = new Map<string, Promise<unknown>>()

function withFixtureLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  const previous = fixtureLocks.get(filePath) ?? Promise.resolve()
  const run = previous.then(fn, fn)
  fixtureLocks.set(
    filePath,
    run.then(
      () => undefined,
      () => undefined,
    ),
  )
  return run
}

/**
 * O store de arquivo existe para teste e dev: ele guarda os short-links num JSON
 * local, com lock em memoria do processo.
 *
 * Em producao serverless isso e um modo de falha silencioso: cada invocacao tem
 * seu proprio filesystem efemero, entao o link gravado numa instancia some ou
 * nao e visto pela proxima, e o lock em memoria nao coordena nada entre elas.
 * Qualquer valor na env, inclusive um deixado por engano numa copia de
 * configuracao entre ambientes, era suficiente para trocar o Supabase por isso.
 *
 * O discriminador e `VERCEL_ENV`, e a escolha e estreita de proposito:
 *
 *   - `NODE_ENV=production` NAO serve: tambem vale para `next start` local e no
 *     CI, onde o store de arquivo e legitimo e nao ha Supabase nenhum. E assim
 *     que `playwright.launch.config.ts` exercita o fluxo de short link.
 *   - `VERCEL` NAO serve: `vercel env pull` grava `VERCEL` no `.env.local`, e o
 *     Next carrega esse arquivo em `next dev`. Usar ele desligaria o fixture na
 *     maquina de quem desenvolve, que e justamente para quem ele existe.
 *   - `VERCEL_ENV` so existe no runtime da Vercel, e la todo ambiente e
 *     serverless com filesystem efemero, preview incluido.
 *
 * No runtime da Vercel o fixture e ignorado e a rota volta para o Supabase. O
 * aviso sai uma vez por processo para a configuracao errada nao passar
 * despercebida.
 */
let avisouFixtureEmProducao = false

function isVercelRuntime() {
  return Boolean(process.env.VERCEL_ENV?.trim())
}

function resolveQuizShortLinkFixturePath() {
  const raw = process.env.PF_QUIZ_SHORT_LINKS_FILE?.trim()
  if (!raw) return null
  if (isVercelRuntime()) {
    if (!avisouFixtureEmProducao) {
      avisouFixtureEmProducao = true
      console.warn(
        "[quiz-short-link] PF_QUIZ_SHORT_LINKS_FILE ignorada na Vercel: o store de arquivo nao sobrevive a invocacao serverless. Usando Supabase.",
      )
    }
    return null
  }
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
    async tryInsertLink(record, sinceIso, max) {
      return withFixtureLock(filePath, async () => {
        const since = Date.parse(sinceIso)
        const rows = await readFixtureRows(filePath)
        const recent = rows.filter(
          (row) => row.ip_hash === record.ip_hash && Date.parse(row.created_at) >= since,
        ).length
        if (recent >= max) return "quota_exceeded"
        if (rows.some((row) => row.token === record.token)) return "duplicate"
        rows.push(record)
        await writeFixtureRows(filePath, rows)
        return "inserted"
      })
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

async function countRecentByIpHash(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  ipHash: string,
  sinceIso: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("quiz_result_short_links")
    .select("*", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", sinceIso)

  if (error) throw error
  return count ?? 0
}

async function insertLink(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  record: QuizShortLinkRecord,
): Promise<"inserted" | "duplicate"> {
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
}

function createSupabaseStore(): QuizShortLinkStore {
  const supabase = createServiceRoleSupabaseClient({ cacheMode: "no-store" })

  return {
    async tryInsertLink(record, sinceIso, max) {
      if (!record.ip_hash) {
        throw new Error("quiz short-link insert requires ip_hash")
      }

      const { data, error } = await supabase.rpc("insert_quiz_short_link_under_ip_quota", {
        p_token: record.token,
        p_query_string: record.query_string,
        p_ip_hash: record.ip_hash,
        p_created_at: record.created_at,
        p_expires_at: record.expires_at,
        p_since: sinceIso,
        p_max: max,
      })

      if (error && isMissingQuotaRpc(error, "insert_quiz_short_link_under_ip_quota")) {
        const count = await countRecentByIpHash(supabase, record.ip_hash, sinceIso)
        if (count >= max) return "quota_exceeded"
        return insertLink(supabase, record)
      }

      if (error) throw error

      const status = readQuotaRpcStatus(data)
      if (status === "inserted" || status === "duplicate" || status === "quota_exceeded") {
        return status
      }
      throw new Error(`insert_quiz_short_link_under_ip_quota: status inesperado ${String(status)}`)
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

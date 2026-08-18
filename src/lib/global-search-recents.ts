import { normalizeForSearch, type GlobalSearchIndexItem } from "@/lib/global-search"

export const GLOBAL_SEARCH_STORAGE_CANDIDATES = "pf_gsearch_recent_candidates_v1"
export const GLOBAL_SEARCH_STORAGE_QUERIES = "pf_gsearch_recent_queries_v1"

export const GLOBAL_SEARCH_MAX_RECENT_CANDIDATES = 8
export const GLOBAL_SEARCH_MAX_RECENT_QUERIES = 5

export type GlobalSearchRecentCandidateStored = {
  href: string
  title: string
  subtitle: string
  foto_url?: string | null
  ts: number
}

function safeGetStorage(): Storage | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function readRecentCandidates(
  storage: Storage | null = safeGetStorage()
): GlobalSearchRecentCandidateStored[] {
  if (!storage) return []
  try {
    const raw = storage.getItem(GLOBAL_SEARCH_STORAGE_CANDIDATES)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const out: GlobalSearchRecentCandidateStored[] = []
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue
      const r = row as Record<string, unknown>
      if (typeof r.href !== "string" || typeof r.title !== "string" || typeof r.subtitle !== "string") {
        continue
      }
      if (typeof r.ts !== "number" || !Number.isFinite(r.ts)) continue
      out.push({
        href: r.href,
        title: r.title,
        subtitle: r.subtitle,
        foto_url: typeof r.foto_url === "string" || r.foto_url === null ? r.foto_url : undefined,
        ts: r.ts,
      })
    }
    return out
  } catch {
    return []
  }
}

export function writeRecentCandidates(
  entries: GlobalSearchRecentCandidateStored[],
  storage: Storage | null = safeGetStorage()
): void {
  if (!storage) return
  try {
    storage.setItem(GLOBAL_SEARCH_STORAGE_CANDIDATES, JSON.stringify(entries))
  } catch {
    /* private mode / quota */
  }
}

export function readRecentQueries(storage: Storage | null = safeGetStorage()): string[] {
  if (!storage) return []
  try {
    const raw = storage.getItem(GLOBAL_SEARCH_STORAGE_QUERIES)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is string => typeof x === "string")
  } catch {
    return []
  }
}

function writeRecentQueries(queries: string[], storage: Storage | null = safeGetStorage()): void {
  if (!storage) return
  try {
    storage.setItem(GLOBAL_SEARCH_STORAGE_QUERIES, JSON.stringify(queries))
  } catch {
    /* ignore */
  }
}

/** Ordena por `ts` desc e dedupe por `href` (mantém o mais recente). */
export function normalizeRecentCandidates(
  entries: GlobalSearchRecentCandidateStored[],
  max = GLOBAL_SEARCH_MAX_RECENT_CANDIDATES
): GlobalSearchRecentCandidateStored[] {
  const sorted = [...entries].sort((a, b) => b.ts - a.ts)
  const seen = new Set<string>()
  const out: GlobalSearchRecentCandidateStored[] = []
  for (const e of sorted) {
    if (seen.has(e.href)) continue
    seen.add(e.href)
    out.push(e)
    if (out.length >= max) break
  }
  return out
}

export function recordRecentCandidateVisit(
  entry: Omit<GlobalSearchRecentCandidateStored, "ts">,
  storage: Storage | null = safeGetStorage()
): void {
  if (!storage) return
  if (!entry.href.startsWith("/candidato/")) return
  const ts = Date.now()
  const prev = readRecentCandidates(storage)
  const next = normalizeRecentCandidates([{ ...entry, ts }, ...prev], GLOBAL_SEARCH_MAX_RECENT_CANDIDATES)
  writeRecentCandidates(next, storage)
}

export function recordRecentSearchQuery(
  rawQuery: string,
  storage: Storage | null = safeGetStorage()
): void {
  if (!storage) return
  const q = rawQuery.trim()
  if (q.length < 2) return
  const normalized = normalizeForSearch(q)
  if (normalized.length < 2) return
  const prev = readRecentQueries(storage)
  const filtered = prev.filter((x) => normalizeForSearch(x) !== normalized)
  const next = [q, ...filtered].slice(0, GLOBAL_SEARCH_MAX_RECENT_QUERIES)
  writeRecentQueries(next, storage)
}

/** Hidrata com dados do índice publicado; candidatos fora do índice são omitidos. */
export function hydrateRecentCandidatesFromIndex(
  stored: GlobalSearchRecentCandidateStored[],
  byHref: Map<string, GlobalSearchIndexItem>
): GlobalSearchIndexItem[] {
  const normalized = normalizeRecentCandidates(stored, GLOBAL_SEARCH_MAX_RECENT_CANDIDATES)
  const out: GlobalSearchIndexItem[] = []
  for (const s of normalized) {
    const live = byHref.get(s.href)
    if (live) out.push(live)
  }
  return out
}

export function exploreCandidatesExcludingHrefs(
  candidates: GlobalSearchIndexItem[],
  exclude: Set<string>,
  displayLimit: number
): GlobalSearchIndexItem[] {
  return candidates.filter((c) => !exclude.has(c.href)).slice(0, displayLimit)
}

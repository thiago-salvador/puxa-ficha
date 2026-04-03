import type { CandidatoConfig } from "./types"
import { readFileSync } from "fs"
import { createReadStream } from "fs"
import { resolve } from "path"
import { parse } from "csv-parse"
import { supabase } from "./supabase"

export function loadCandidatos(): CandidatoConfig[] {
  const path = resolve(process.cwd(), "data/candidatos.json")
  return JSON.parse(readFileSync(path, "utf-8"))
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim()
}

export async function resolveCandidatoId(slug: string): Promise<string | null> {
  const { data } = await supabase.from("candidatos").select("id").eq("slug", slug).single()
  return data?.id ?? null
}

function parseRetryAfterMs(value: string | null): number | null {
  if (!value) return null

  const asSeconds = Number(value)
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return asSeconds * 1000
  }

  const retryAt = Date.parse(value)
  if (!Number.isNaN(retryAt)) {
    return Math.max(retryAt - Date.now(), 0)
  }

  return null
}

export async function fetchJSON<T>(
  url: string,
  headers?: Record<string, string>,
  retries = 3,
  timeoutMs = 15000
): Promise<T> {
  for (let i = 0; i < retries; i++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, { headers, signal: controller.signal })
      if (res.status === 429) {
        const retryAfter = parseRetryAfterMs(res.headers.get("retry-after"))
        const wait = retryAfter ?? Math.min(5000, 1000 * (i + 1))
        await sleep(wait)
        continue
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`)
      return (await res.json()) as T
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        if (i === retries - 1) throw new Error(`Timeout (${timeoutMs}ms): ${url}`)
        await sleep(2000 * (i + 1))
        continue
      }
      if (i === retries - 1) throw err
      await sleep(1000 * (i + 1))
    } finally {
      clearTimeout(timer)
    }
  }
  throw new Error("unreachable")
}

export async function parseCSV(
  filePath: string,
  onRow: (row: Record<string, string>) => Promise<void> | void
): Promise<number> {
  let count = 0
  const parser = createReadStream(filePath, { encoding: "latin1" }).pipe(
    parse({
      delimiter: ";",
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      cast: (value) => value.trim(),
    })
  )

  for await (const row of parser) {
    await onRow(row as Record<string, string>)
    count++
  }

  return count
}

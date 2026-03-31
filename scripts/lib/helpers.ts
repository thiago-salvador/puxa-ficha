import type { CandidatoConfig } from "./types"
import { readFileSync } from "fs"
import { resolve } from "path"

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

export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
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
        const wait = Math.min(5000, 1000 * (i + 1))
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

export async function fetchAllPages<T>(
  baseUrl: string,
  params: Record<string, string> = {},
  timeoutMs = 15000
): Promise<T[]> {
  const all: T[] = []
  let page = 1
  const pageSize = 100

  while (true) {
    const searchParams = new URLSearchParams({
      ...params,
      itens: String(pageSize),
      pagina: String(page),
    })
    const url = `${baseUrl}?${searchParams}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, { signal: controller.signal })
      if (!res.ok) break

      const json = await res.json()
      const items = json.dados ?? json.data ?? json
      if (!Array.isArray(items) || items.length === 0) break

      all.push(...items)
      if (items.length < pageSize) break
      page++
      await sleep(300)
    } catch {
      break
    } finally {
      clearTimeout(timer)
    }
  }

  return all
}

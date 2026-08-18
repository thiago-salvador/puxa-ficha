import type { CandidatoConfig } from "./types"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

export { normalizeForMatch } from "./normalize-for-match"
export { parseCSV } from "./parse-csv-local"

/**
 * Escopo opcional de slugs para a coleta, via `PF_INGEST_SLUGS`.
 *
 * Todos os módulos de ingestão passam por `loadCandidatos()`, então o filtro
 * aqui escopa a coleta inteira de uma vez: `PF_INGEST_SLUGS=a,b npx tsx
 * scripts/ingest-all.ts wikipedia` roda só nesses dois candidatos em vez dos
 * 271 do seed. Serve para trabalhar um lote sem tocar na ficha de quem está
 * sendo curado em paralelo por outra sessão.
 *
 * Slug inexistente aborta a execução: um erro de digitação silencioso viraria
 * uma coleta vazia que parece sucesso.
 */
function parseSlugScope(): Set<string> | null {
  const raw = process.env.PF_INGEST_SLUGS?.trim()
  if (!raw) return null
  const slugs = raw.split(",").map((s) => s.trim()).filter(Boolean)
  return slugs.length > 0 ? new Set(slugs) : null
}

export function loadCandidatos(): CandidatoConfig[] {
  const path = resolve(process.cwd(), "data/candidatos.json")
  const todos: CandidatoConfig[] = JSON.parse(readFileSync(path, "utf-8"))

  const escopo = parseSlugScope()
  if (!escopo) return todos

  const conhecidos = new Set(todos.map((c) => c.slug))
  const desconhecidos = [...escopo].filter((s) => !conhecidos.has(s))
  if (desconhecidos.length > 0) {
    throw new Error(
      `PF_INGEST_SLUGS cita slug que não existe em data/candidatos.json: ${desconhecidos.join(", ")}`,
    )
  }

  return todos.filter((c) => escopo.has(c.slug))
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export async function fetchJSON<T>(
  url: string,
  headers?: Record<string, string>,
  retries = 3,
  timeoutMs = 15000,
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

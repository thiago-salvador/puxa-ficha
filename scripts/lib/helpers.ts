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

/**
 * Prazo padrao de qualquer chamada de rede dos scripts de coleta.
 *
 * `fetchJSON` ja usava 15s. Varias coletas chamavam `fetch` cru, sem prazo
 * nenhum: quando a origem aceita a conexao e nunca responde (o caso classico do
 * Cloudflare 522 do jarbas, mas tambem proxy silencioso e origem sobrecarregada),
 * o processo fica pendurado ate o timeout do job, e o run inteiro morre sem
 * coletar nada e sem dizer por que.
 *
 * Quem precisa do objeto `Response` (branch por status, content-type, bytes) nao
 * pode usar `fetchJSON`, que devolve JSON ja parseado e perde essa distincao.
 * Nesses casos o contrato e `signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)`.
 */
export const FETCH_TIMEOUT_MS = 15_000

/** Tentativas padrao de `fetchJSON`, contando a primeira. */
export const FETCH_RETRIES = 4

/**
 * Escada de espera entre tentativas de `fetchJSON`, em ms.
 *
 * A escada antiga era 1s e 2s: 3 tentativas gastas em 3s de espera. Queda de
 * origem federal dura minutos, nao segundos, entao as 3 tentativas caiam dentro
 * do mesmo soluço e o candidato virava erro. 2s, 6s, 15s e 30s atravessam ~53s
 * de indisponibilidade sem mudar nada quando a origem esta de pe.
 *
 * O ultimo degrau e o teto: quem pede mais tentativas (Camara pede 5) repete
 * 30s em vez de crescer sem limite.
 */
const BACKOFF_MS = [2_000, 6_000, 15_000, 30_000] as const

/** Jitter de +-25% para nao sincronizar os candidatos na mesma origem. */
export function proximaEsperaMs(tentativa: number, random: () => number = Math.random): number {
  const base = BACKOFF_MS[Math.min(tentativa, BACKOFF_MS.length - 1)]
  return Math.round(base * (0.75 + random() * 0.5))
}

/**
 * Relogio de `fetchJSON`. Existe para o teste percorrer a escada inteira sem
 * esperar os 23s reais dela.
 */
export interface FetchRelogio {
  now: () => number
  sleep: (ms: number) => Promise<void>
  random: () => number
}

const RELOGIO_REAL: FetchRelogio = { now: () => Date.now(), sleep, random: Math.random }

export interface FetchJSONOptions {
  /**
   * Teto de tempo da chamada inteira, esperas incluidas. Default: a soma dos
   * prazos das tentativas (`retries * timeoutMs`), que e o pior caso que o
   * chamador ja aceitava antes desta escada existir.
   *
   * O orcamento existe para o retry nao estourar sozinho o teto por candidato
   * (`CANDIDATO_WALL_MS` na Camara, `withTimeout` no Senado): quando o tempo que
   * sobra nao cobre a proxima espera, a chamada desiste com o erro corrente em
   * vez de dormir alem do prazo de quem chamou.
   */
  budgetMs?: number
  relogio?: FetchRelogio
}

/** 4xx que nao seja 408 ou 429 e resposta determinista: repetir so queima o orcamento. */
function statusRetentavel(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}

type Tentativa<T> =
  | { ok: true; valor: T }
  | { ok: false; erro: Error; retentavel: boolean; esperaMs?: number }

async function tentarFetchJSON<T>(
  url: string,
  headers: Record<string, string> | undefined,
  timeoutMs: number,
  tentativa: number,
  relogio: FetchRelogio,
): Promise<Tentativa<T>> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { headers, signal: controller.signal })
    if (res.status === 429) {
      const retryAfter = parseRetryAfterMs(res.headers.get("retry-after"))
      return {
        ok: false,
        erro: new Error(`HTTP 429: ${url}`),
        retentavel: true,
        esperaMs: retryAfter ?? proximaEsperaMs(tentativa, relogio.random),
      }
    }
    if (!res.ok) {
      return {
        ok: false,
        erro: new Error(`HTTP ${res.status}: ${url}`),
        retentavel: statusRetentavel(res.status),
      }
    }
    return { ok: true, valor: (await res.json()) as T }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, erro: new Error(`Timeout (${timeoutMs}ms): ${url}`), retentavel: true }
    }
    // `fetch failed` do undici: erro de rede sem status, que e exatamente o que
    // a escada de espera existe para atravessar.
    return { ok: false, erro: err instanceof Error ? err : new Error(String(err)), retentavel: true }
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchJSON<T>(
  url: string,
  headers?: Record<string, string>,
  retries = FETCH_RETRIES,
  timeoutMs = FETCH_TIMEOUT_MS,
  options: FetchJSONOptions = {},
): Promise<T> {
  const relogio = options.relogio ?? RELOGIO_REAL
  const prazoFinal = relogio.now() + (options.budgetMs ?? retries * timeoutMs)
  let ultimoErro: Error = new Error(`Nenhuma tentativa executada: ${url}`)

  for (let tentativa = 0; tentativa < retries; tentativa++) {
    const desfecho = await tentarFetchJSON<T>(url, headers, timeoutMs, tentativa, relogio)
    if (desfecho.ok) return desfecho.valor

    ultimoErro = desfecho.erro
    if (!desfecho.retentavel) break
    if (tentativa === retries - 1) break

    const espera = desfecho.esperaMs ?? proximaEsperaMs(tentativa, relogio.random)
    if (relogio.now() + espera > prazoFinal) break
    await relogio.sleep(espera)
  }

  throw ultimoErro
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

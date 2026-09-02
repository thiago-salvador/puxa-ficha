import "server-only"

import * as Sentry from "@sentry/nextjs"
import { unstableCacheWithSingleFlight } from "@/lib/cache-single-flight"
import {
  DOADOR_REVERSE_MAX_QUERY_LENGTH,
  DOADOR_REVERSE_MIN_QUERY_LENGTH,
  DOADOR_REVERSE_PAGE_SIZE,
  parseDoadorReverseRpcRows,
  type DoadorReverseFinanciamentoRow,
  type DoadorReverseSearchResult,
} from "@/lib/doador-reverse-shared"
import { normalizeForSearch } from "@/lib/search-normalize"
import { createServiceRoleSupabaseClient, getAppSupabaseUrl } from "@/lib/supabase"

export {
  DOADOR_REVERSE_DISCLAIMER,
  DOADOR_REVERSE_MIN_QUERY_LENGTH,
  DOADOR_REVERSE_PAGE_SIZE,
  type DoadorReverseSearchResult,
} from "@/lib/doador-reverse-shared"

const supabaseUrl = getAppSupabaseUrl()
const USE_MOCK = !supabaseUrl || supabaseUrl.includes("placeholder")

function resolveFixtureFile(): string | null {
  const raw = process.env.PF_DOADOR_REVERSE_FIXTURE_FILE?.trim()
  if (!raw) return null
  if (raw.startsWith("/")) return raw

  const filename = raw.split(/[\\/]/).filter(Boolean).at(-1)
  return filename ? `tests/fixtures/${filename}` : null
}

const FIXTURE_FILE = resolveFixtureFile()

async function readDoadorReverseFixture(filePath: string): Promise<DoadorReverseFinanciamentoRow[]> {
  const { readFile } = await import("node:fs/promises")
  const raw = await readFile(filePath, "utf-8")
  return parseDoadorReverseRpcRows(JSON.parse(raw))
}

/** RPC caller contract for dependency injection (tests). */
export interface DoadorReverseRpcCaller {
  rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>
}

interface DoadorReversePage {
  rows: DoadorReverseFinanciamentoRow[]
  error: string | null
  truncado: boolean
}

/**
 * Pede uma linha a mais do que a página para saber se havia mais sem precisar
 * de um COUNT separado.
 */
const FETCH_LIMIT = DOADOR_REVERSE_PAGE_SIZE + 1

function paginar(rows: DoadorReverseFinanciamentoRow[]): DoadorReversePage {
  return {
    rows: rows.slice(0, DOADOR_REVERSE_PAGE_SIZE),
    error: null,
    truncado: rows.length > DOADOR_REVERSE_PAGE_SIZE,
  }
}

async function fetchDoadorReverseRows(
  normalizedQuery: string,
  rpcCaller?: DoadorReverseRpcCaller
): Promise<DoadorReversePage> {
  if (!normalizedQuery) {
    return { rows: [], error: null, truncado: false }
  }

  // Prioritize fixture when PF_DOADOR_REVERSE_FIXTURE_FILE is set (even in mock mode for tests)
  if (!rpcCaller && FIXTURE_FILE) {
    return Sentry.startSpan(
      {
        name: "doador_reverse.fixture_search",
        op: "db.fixture",
        attributes: {
          "http.route": "/doadores",
          "puxaficha.query_length": normalizedQuery.length,
        },
      },
      async () => {
        try {
          const allRows = await readDoadorReverseFixture(FIXTURE_FILE)
          const matching = allRows.filter(
            (r) => normalizeForSearch(r.doador_nome_exibicao).includes(normalizedQuery)
          )
          return paginar(matching.slice(0, FETCH_LIMIT))
        } catch {
          return { rows: [], error: null, truncado: false }
        }
      },
    )
  }

  if (!rpcCaller && USE_MOCK) {
    return {
      rows: [],
      error: "Dados indisponíveis sem Supabase configurado.",
      truncado: false,
    }
  }

  // service_role: a RPC nao tem mais EXECUTE para anon. O limiter de /doadores
  // so e real se o visitante nao puder POST /rest/v1/rpc com a chave publica.
  const caller = rpcCaller ?? createServiceRoleSupabaseClient()
  const { data, error } = await Sentry.startSpan(
    {
      name: "doador_reverse.rpc",
      op: "db.supabase.rpc",
      attributes: {
        "db.system": "postgresql",
        "db.operation": "search_financiamento_by_doador_normalized",
        "http.route": "/doadores",
        "puxaficha.query_length": normalizedQuery.length,
        "puxaficha.page_size": DOADOR_REVERSE_PAGE_SIZE,
      },
    },
    async () =>
      caller.rpc("search_financiamento_by_doador_normalized", {
        p_query: normalizedQuery,
        p_limit: FETCH_LIMIT,
        p_offset: 0,
      }),
  )

  if (error) {
    console.error("search_financiamento_by_doador_normalized:", error.message)
    // LANCA em vez de retornar o estado de erro. Um valor resolvido seria gravado
    // pelo unstable_cache abaixo e serviria a mensagem de falha por 1 HORA a todo
    // mundo que buscasse o mesmo termo, com cache HIT e sem nenhum log novo: um
    // blip de 45s no Supabase virava 1h de resultado errado, invisivel na
    // observabilidade. Rejeicao nao entra no Data Cache. Mesma mecanica que o
    // PR #40 aplicou aos 9 wrappers de src/lib/api.ts; este arquivo ficou de fora
    // na epoca e foi reencontrado no master review de 2026-08-03.
    throw new DoadorReverseUnavailableError(error.message)
  }

  return paginar(parseDoadorReverseRpcRows(data))
}

/** Falha de leitura da RPC. Existe para nunca ser confundida com "0 resultados". */
class DoadorReverseUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DoadorReverseUnavailableError"
  }
}

const getCachedDoadorReverseRows = unstableCacheWithSingleFlight(
  async (normalizedQuery: string) => fetchDoadorReverseRows(normalizedQuery),
  // Sufixo trocado para descartar o cache ja envenenado no deploy, do mesmo jeito
  // que o PR #40 fez com `cache-poison-fix-20260802` nos wrappers de api.ts.
  // Bumpado de novo em 2026-08-03 pela paginacao: entrada gravada antes disso
  // guarda o resultado inteiro, sem teto de 100 linhas e sem o campo `truncado`.
  ["doador-reverse", "paginacao-20260803", "chapas-tse-20260815"],
  {
    revalidate: 3600,
    tags: ["doador-reverse"],
  }
)

/**
 * Busca campanhas em que o nome do doador (top 10 TSE) contém o termo normalizado.
 * Cache Next 1h, tag `doador-reverse`.
 * Pass `rpcCaller` or PF_DOADOR_REVERSE_FIXTURE_FILE to bypass cache and Supabase (tests).
 */
export async function getDoadorReverseSearchResult(
  rawQuery: string,
  rpcCaller?: DoadorReverseRpcCaller
): Promise<DoadorReverseSearchResult> {
  // O corte de comprimento acontece ANTES de o termo virar chave de cache e
  // antes de chegar ao banco, e vale para os dois: chave truncada com termo
  // inteiro faria dois termos longos de mesmo prefixo dividirem a mesma entrada.
  const displayQuery = rawQuery.trim().slice(0, DOADOR_REVERSE_MAX_QUERY_LENGTH)
  const normalizedQuery = normalizeForSearch(displayQuery).slice(
    0,
    DOADOR_REVERSE_MAX_QUERY_LENGTH,
  )

  if (!normalizedQuery) {
    return {
      rows: [],
      displayQuery,
      normalizedQuery: "",
      error: null,
      termoCurtoDemais: false,
      truncado: false,
    }
  }

  // Piso de comprimento: termo curto casa com quase tudo, varre a base inteira e
  // ainda deixa o resultado gravado por 1h sob aquela chave.
  if (normalizedQuery.length < DOADOR_REVERSE_MIN_QUERY_LENGTH) {
    return {
      rows: [],
      displayQuery,
      normalizedQuery,
      error: null,
      termoCurtoDemais: true,
      truncado: false,
    }
  }

  // O estado de erro e reconstruido AQUI, fora do unstable_cache, para que a
  // falha nunca seja persistida no Data Cache. A mensagem ao usuario e a mesma
  // de antes; o que muda e que a proxima request tenta o banco de novo em vez de
  // servir a falha por 1h.
  try {
    const { rows, error, truncado } = rpcCaller || FIXTURE_FILE
      ? await fetchDoadorReverseRows(normalizedQuery, rpcCaller)
      : await getCachedDoadorReverseRows(normalizedQuery)
    return { rows, displayQuery, normalizedQuery, error, termoCurtoDemais: false, truncado }
  } catch {
    return {
      rows: [],
      displayQuery,
      normalizedQuery,
      error: "Não foi possível carregar os resultados agora.",
      termoCurtoDemais: false,
      truncado: false,
    }
  }
}

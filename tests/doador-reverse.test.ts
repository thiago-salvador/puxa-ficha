import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { describe, it } from "node:test"
import {
  buildDoadorReverseHref,
  parseDoadorReverseRpcRows,
  DOADOR_REVERSE_DISCLAIMER,
} from "@/lib/doador-reverse-shared"
import { normalizeForSearch } from "@/lib/search-normalize"

// --- Mock server-only + next/cache for doador-reverse import ---
const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as never

const {
  getDoadorReverseSearchResult,
} = require("../src/lib/doador-reverse") as typeof import("../src/lib/doador-reverse")

describe("buildDoadorReverseHref", () => {
  it("encodeURIComponent no query string", () => {
    const nome = 'Empresa "X" & Y'
    const href = buildDoadorReverseHref(nome)
    assert.equal(href, `/doadores?q=${encodeURIComponent(nome)}`)
    assert.ok(!href.includes('"'))
    assert.ok(!href.includes("&"))
  })

  it("trim e vazio vai para /doadores", () => {
    assert.equal(buildDoadorReverseHref("  "), "/doadores")
    assert.equal(buildDoadorReverseHref(""), "/doadores")
  })

  it("roundtrip: decodificar q bate com entrada", () => {
    const original = "João  Silva"
    const href = buildDoadorReverseHref(original)
    const u = new URL(href, "https://example.com")
    assert.equal(u.searchParams.get("q"), original.trim())
  })
})

describe("parseDoadorReverseRpcRows", () => {
  it("aceita linhas válidas e ignora inválidas", () => {
    const rows = parseDoadorReverseRpcRows([
      {
        candidato_id: "a",
        slug: "fulano",
        nome_urna: "Fulano",
        partido_sigla: "PX",
        cargo_disputado: "Presidente",
        estado: "RJ",
        ano_eleicao: 2022,
        valor: 1000.5,
        tipo: "PJ",
        doador_nome_exibicao: "ACME",
      },
      { slug: "bad" },
    ])
    assert.equal(rows.length, 1)
    assert.equal(rows[0]?.slug, "fulano")
    assert.equal(rows[0]?.valor, 1000.5)
  })

  it("não-array retorna vazio", () => {
    assert.equal(parseDoadorReverseRpcRows(null).length, 0)
    assert.equal(parseDoadorReverseRpcRows({}).length, 0)
  })

  it("skips rows missing required string fields", () => {
    const data = [
      { candidato_id: 123, slug: "s", nome_urna: "N", ano_eleicao: 2022, valor: 100 },
      { candidato_id: "c", slug: null, nome_urna: "N", ano_eleicao: 2022, valor: 100 },
      { candidato_id: "c", slug: "s", nome_urna: undefined, ano_eleicao: 2022, valor: 100 },
    ]
    assert.equal(parseDoadorReverseRpcRows(data).length, 0)
  })

  it("skips rows with non-finite numeric fields", () => {
    const data = [
      { candidato_id: "c", slug: "s", nome_urna: "N", ano_eleicao: "abc", valor: 100 },
      { candidato_id: "c", slug: "s", nome_urna: "N", ano_eleicao: 2022, valor: NaN },
    ]
    assert.equal(parseDoadorReverseRpcRows(data).length, 0)
  })

  it("defaults optional fields when missing", () => {
    const data = [
      { candidato_id: "c", slug: "s", nome_urna: "N", ano_eleicao: 2022, valor: 100 },
    ]
    const rows = parseDoadorReverseRpcRows(data)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].partido_sigla, "")
    assert.equal(rows[0].cargo_disputado, "")
    assert.equal(rows[0].estado, null)
    assert.equal(rows[0].tipo, "")
    assert.equal(rows[0].doador_nome_exibicao, "")
  })

  it("coerces numeric strings for ano_eleicao and valor", () => {
    const data = [
      { candidato_id: "c", slug: "s", nome_urna: "N", ano_eleicao: "2022", valor: "5000.50" },
    ]
    const rows = parseDoadorReverseRpcRows(data)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].ano_eleicao, 2022)
    assert.equal(rows[0].valor, 5000.5)
  })

  it("skips null/non-object items in array", () => {
    const data = [null, undefined, 42, "str", { candidato_id: "c", slug: "s", nome_urna: "N", ano_eleicao: 2022, valor: 1 }]
    assert.equal(parseDoadorReverseRpcRows(data).length, 1)
  })
})

// --- normalizeForSearch ---

describe("normalizeForSearch", () => {
  it("strips diacritics and lowercases", () => {
    assert.equal(normalizeForSearch("João da Silva"), "joao da silva")
  })

  it("trims whitespace", () => {
    assert.equal(normalizeForSearch("  foo  "), "foo")
  })

  it("handles empty string", () => {
    assert.equal(normalizeForSearch(""), "")
  })

  it("normalizes cedilla", () => {
    assert.equal(normalizeForSearch("Gonçalves"), "goncalves")
  })

  it("preserves numbers", () => {
    assert.equal(normalizeForSearch("2022"), "2022")
  })

  it("handles all-diacritics name", () => {
    assert.equal(normalizeForSearch("José Açúcar Ñoño"), "jose acucar nono")
  })
})

// --- DOADOR_REVERSE_DISCLAIMER ---

describe("DOADOR_REVERSE_DISCLAIMER", () => {
  it("is a non-empty string mentioning TSE", () => {
    assert.ok(typeof DOADOR_REVERSE_DISCLAIMER === "string")
    assert.ok(DOADOR_REVERSE_DISCLAIMER.length > 10)
    assert.ok(DOADOR_REVERSE_DISCLAIMER.includes("TSE"))
  })
})

// --- getDoadorReverseSearchResult (SSR+DB with mocked RPC) ---

describe("getDoadorReverseSearchResult RPC path", () => {
  it("returns parsed rows from successful RPC call", async () => {
    const mockRpc = {
      async rpc(_fn: string, _params: Record<string, unknown>) {
        void _fn
        void _params
        return {
          data: [
            {
              candidato_id: "c-1",
              slug: "fulano",
              nome_urna: "FULANO",
              partido_sigla: "PT",
              cargo_disputado: "Deputado Federal",
              estado: "SP",
              ano_eleicao: 2022,
              valor: 50000,
              tipo: "PJ",
              doador_nome_exibicao: "Empresa X",
            },
          ],
          error: null,
        }
      },
    }

    const result = await getDoadorReverseSearchResult("Empresa X", mockRpc)
    assert.equal(result.error, null)
    assert.equal(result.displayQuery, "Empresa X")
    assert.equal(result.normalizedQuery, "empresa x")
    assert.equal(result.rows.length, 1)
    assert.equal(result.rows[0].slug, "fulano")
    assert.equal(result.rows[0].valor, 50000)
  })

  it("returns empty rows on RPC error", async () => {
    const mockRpc = {
      async rpc(_fn: string, _params: Record<string, unknown>) {
        void _fn
        void _params
        return {
          data: null,
          error: { message: "relation does not exist" },
        }
      },
    }

    const result = await getDoadorReverseSearchResult("empresa x", mockRpc)
    assert.equal(result.rows.length, 0)
    assert.ok(result.error !== null)
    assert.match(result.error!, /carregar os resultados/)
  })

  it("returns empty rows when RPC returns no matches", async () => {
    const mockRpc = {
      async rpc(_fn: string, _params: Record<string, unknown>) {
        void _fn
        void _params
        return { data: [], error: null }
      },
    }

    const result = await getDoadorReverseSearchResult("ninguem", mockRpc)
    assert.equal(result.error, null)
    assert.equal(result.rows.length, 0)
  })

  it("passes normalized query to RPC", async () => {
    let capturedParams: Record<string, unknown> = {}
    const mockRpc = {
      async rpc(_fn: string, params: Record<string, unknown>) {
        capturedParams = params
        return { data: [], error: null }
      },
    }

    await getDoadorReverseSearchResult("João Silva", mockRpc)
    assert.equal(capturedParams.p_query, "joao silva")
  })

  it("filters out invalid rows from RPC response", async () => {
    const mockRpc = {
      async rpc(_fn: string, _params: Record<string, unknown>) {
        void _fn
        void _params
        return {
          data: [
            { candidato_id: "c-1", slug: "ok", nome_urna: "OK", ano_eleicao: 2022, valor: 100 },
            { slug: "bad" }, // missing required fields
            null,
          ],
          error: null,
        }
      },
    }

    const result = await getDoadorReverseSearchResult("test", mockRpc)
    assert.equal(result.rows.length, 1)
    assert.equal(result.rows[0].slug, "ok")
  })
})

// --- getDoadorReverseSearchResult (end-to-end: raw query -> normalize -> RPC -> parse -> result) ---

describe("getDoadorReverseSearchResult (end-to-end)", () => {
  it("empty raw query returns immediately without RPC call", async () => {
    let rpcCalled = false
    const mockRpc = {
      async rpc(_fn: string, _params: Record<string, unknown>) {
        void _fn
        void _params
        rpcCalled = true
        return { data: [], error: null }
      },
    }

    const result = await getDoadorReverseSearchResult("", mockRpc)
    assert.equal(result.normalizedQuery, "")
    assert.equal(result.rows.length, 0)
    assert.equal(result.error, null)
    assert.equal(rpcCalled, false)
  })

  it("whitespace-only query returns immediately without RPC call", async () => {
    let rpcCalled = false
    const mockRpc = {
      async rpc(_fn: string, _params: Record<string, unknown>) {
        void _fn
        void _params
        rpcCalled = true
        return { data: [], error: null }
      },
    }

    const result = await getDoadorReverseSearchResult("   ", mockRpc)
    assert.equal(result.normalizedQuery, "")
    assert.equal(rpcCalled, false)
  })

  it("raw PT-BR query is normalized before RPC call: diacritics stripped, lowercased", async () => {
    let capturedQuery = ""
    const mockRpc = {
      async rpc(_fn: string, params: Record<string, unknown>) {
        capturedQuery = params.p_query as string
        return { data: [], error: null }
      },
    }

    const result = await getDoadorReverseSearchResult("  João Gonçalves  ", mockRpc)
    assert.equal(result.displayQuery, "João Gonçalves")
    assert.equal(result.normalizedQuery, "joao goncalves")
    assert.equal(capturedQuery, "joao goncalves")
  })

  it("full pipeline: raw query -> normalize -> RPC data -> parsed rows", async () => {
    const mockRpc = {
      async rpc(_fn: string, _params: Record<string, unknown>) {
        void _fn
        void _params
        return {
          data: [
            {
              candidato_id: "c-1",
              slug: "fulano-sp",
              nome_urna: "FULANO",
              partido_sigla: "PT",
              cargo_disputado: "Deputado Federal",
              estado: "SP",
              ano_eleicao: 2022,
              valor: 25000,
              tipo: "PF",
              doador_nome_exibicao: "JOAO GONCALVES",
            },
            {
              candidato_id: "c-2",
              slug: "beltrana-rj",
              nome_urna: "BELTRANA",
              partido_sigla: "PSOL",
              cargo_disputado: "Senadora",
              estado: "RJ",
              ano_eleicao: 2022,
              valor: 10000,
              tipo: "PJ",
              doador_nome_exibicao: "GONCALVES & CIA LTDA",
            },
          ],
          error: null,
        }
      },
    }

    const result = await getDoadorReverseSearchResult("Gonçalves", mockRpc)
    assert.equal(result.displayQuery, "Gonçalves")
    assert.equal(result.normalizedQuery, "goncalves")
    assert.equal(result.error, null)
    assert.equal(result.rows.length, 2)
    assert.equal(result.rows[0].slug, "fulano-sp")
    assert.equal(result.rows[0].valor, 25000)
    assert.equal(result.rows[1].slug, "beltrana-rj")
  })

  it("RPC error propagates through the full pipeline", async () => {
    const mockRpc = {
      async rpc(_fn: string, _params: Record<string, unknown>) {
        void _fn
        void _params
        return { data: null, error: { message: "connection refused" } }
      },
    }

    const result = await getDoadorReverseSearchResult("silva", mockRpc)
    assert.equal(result.rows.length, 0)
    assert.ok(result.error !== null)
    assert.match(result.error!, /carregar os resultados/)
  })
})

// --- SQL contract: doador-reverse RPC uses candidatos_publico and normalize_for_search ---

describe("doador-reverse SQL contract", () => {
  const migrationPath = "supabase/migrations/20260407190000_doador_reverse_rpc.sql"
  let sql: string

  it("migration file exists and is readable", async () => {
    const { readFileSync } = await import("node:fs")
    const { resolve } = await import("node:path")
    sql = readFileSync(resolve(process.cwd(), migrationPath), "utf-8")
    assert.ok(sql.length > 100)
  })

  it("RPC joins candidatos_publico (not candidatos directly) to enforce publicavel gate", () => {
    assert.ok(sql.includes("candidatos_publico"), "RPC must join candidatos_publico view")
    // Must NOT use FROM candidatos (without _publico) for the main join
    const mainJoin = sql.match(/INNER JOIN public\.(\w+) c ON c\.id/)
    assert.ok(mainJoin, "Expected INNER JOIN pattern")
    assert.equal(mainJoin![1], "candidatos_publico", "Join target must be candidatos_publico, not candidatos")
  })

  it("RPC uses normalize_for_search for substring matching", () => {
    assert.ok(sql.includes("normalize_for_search"), "RPC must use normalize_for_search function")
    // The match is substring: position(... IN normalize_for_search(d.nome)) > 0
    assert.ok(sql.includes("position("), "Matching uses position() for substring search")
  })

  it("normalize_for_search SQL mirrors TypeScript: NFD + strip diacritics + lower + trim", () => {
    // The SQL function should contain the same normalization steps as normalizeForSearch
    assert.ok(sql.includes("lower(trim("), "SQL normalizes with lower(trim(...))")
    assert.ok(sql.includes("normalize(t, NFD)"), "SQL uses NFD normalization")
    assert.ok(sql.includes("0300-\\u036F") || sql.includes("0300-036F"), "SQL strips combining marks U+0300-U+036F")
  })

  it("TypeScript and SQL normalize the same test vectors", () => {
    // These are the contract: if TS normalizes X to Y, the SQL function must too.
    // We can't run SQL here, but we verify the TS side and assert the SQL has
    // the same algorithm structure (NFD + strip + lower + trim).
    const vectors: [string, string][] = [
      ["João da Silva", "joao da silva"],
      ["Gonçalves", "goncalves"],
      ["  EMPRESA X  ", "empresa x"],
      ["José Açúcar Ñoño", "jose acucar nono"],
    ]
    for (const [input, expected] of vectors) {
      assert.equal(normalizeForSearch(input), expected, `normalizeForSearch("${input}") should be "${expected}"`)
    }
  })
})

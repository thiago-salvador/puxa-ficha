/**
 * Loaders enxutos para as superfícies que só contam ou indexam candidatos.
 *
 * O Data Cache do Next recusa itens acima de 2 MB ("items over 2MB can not be
 * cached"). Com a coorte do Senado ligada, `getCandidatosResource("Senador")`
 * trazia todas as colunas públicas só para o mapa de /parlamentares contar
 * candidatos por UF, e o índice de busca global carregava a lista completa pelo
 * mesmo caminho. Os dois passavam do limite e perdiam o cache.
 *
 * O stub de PostgREST abaixo honra `select=`: devolve só as colunas pedidas,
 * como o banco faria. Assim o tamanho medido é o do payload real que o loader
 * entregaria ao `unstable_cache`, e não o da linha sintética inteira.
 */

import assert from "node:assert/strict"
import Module from "node:module"
import { afterEach, describe, it } from "node:test"

type Loader = typeof Module & {
  _load: (request: string, parent: NodeModule | null | undefined, isMain: boolean) => unknown
}

// Env antes do import: api.ts congela USE_MOCK e SENADO_CACHE_VARIANT no load.
process.env.SUPABASE_URL = "https://senado-perf-test.supabase.co"
process.env.SUPABASE_ANON_KEY = "test-anon-key"
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://senado-perf-test.supabase.co"
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key"
process.env.SENADO_ENABLED = "true"

const DATA_CACHE_ITEM_LIMIT_BYTES = 2 * 1024 * 1024

interface CacheCall {
  keys: string[]
  outcome: "resolved" | "rejected"
  bytes?: number
}

const cacheCalls: CacheCall[] = []

let apiPromise: Promise<typeof import("../src/lib/api")> | null = null

function loadApi() {
  if (apiPromise) return apiPromise
  const moduleLoader = Module as Loader
  const originalLoad = moduleLoader._load
  moduleLoader._load = function loadWithNextServerMocks(request, parent, isMain) {
    if (request === "server-only") return {}
    if (request === "next/cache") {
      return {
        unstable_cache:
          (fn: (...args: unknown[]) => Promise<unknown>, keys: string[]) =>
          async (...args: unknown[]) => {
            try {
              const result = await fn(...args)
              cacheCalls.push({
                keys,
                outcome: "resolved",
                bytes: Buffer.byteLength(JSON.stringify(result), "utf8"),
              })
              return result
            } catch (error) {
              cacheCalls.push({ keys, outcome: "rejected" })
              throw error
            }
          },
        unstable_noStore: () => {},
      }
    }
    if (request === "next/headers") {
      return { headers: async () => new Headers() }
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  apiPromise = import("../src/lib/api").finally(() => {
    moduleLoader._load = originalLoad
  })
  return apiPromise
}

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  cacheCalls.length = 0
})

const UFS = ["AC", "AL", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO", "AP"]

/** Recibo de verificação volumoso, na ordem de grandeza do que a coorte do Senado carrega por linha. */
function heavyVerification(index: number): Record<string, unknown> {
  const receipts: Record<string, unknown> = {}
  for (let i = 0; i < 40; i += 1) {
    receipts[`campo_${i}`] = {
      verificado_em: "2026-09-15T00:00:00Z",
      fonte: `https://dados.exemplo.gov.br/recibo/${index}/${i}`,
      observacao: "Recibo sintético de verificação usado só para medir o tamanho do payload em teste.",
    }
  }
  return receipts
}

function syntheticRow(index: number, cargo: string) {
  const estado = UFS[index % UFS.length]
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    nome_completo: `Pessoa Sintética ${index} da Silva`,
    nome_urna: `Pessoa ${index}`,
    slug: `pessoa-sintetica-${cargo.toLowerCase()}-${index}`,
    data_nascimento: "1970-01-01",
    idade: 56,
    naturalidade: "Cidade Fictícia",
    formacao: "Superior completo",
    profissao_declarada: "Profissão fictícia",
    genero: "feminino",
    estado_civil: null,
    cor_raca: null,
    partido_atual: "Partido Fictício",
    partido_sigla: "PF",
    cargo_atual: index % 7 === 0 ? "Deputado(a) Federal" : null,
    cargo_disputado: cargo,
    estado,
    status: "candidato",
    situacao_candidatura: "APTO",
    biografia: "Biografia sintética. ".repeat(20),
    foto_url: `/candidates/pessoa-sintetica-${index}.webp`,
    site_campanha: null,
    redes_sociais: { instagram: `https://instagram.com/pessoa${index}` },
    fonte_dados: ["Fixture sintética"],
    ultima_atualizacao: "2026-09-15",
    verificacao_campos: heavyVerification(index),
    foto_credito: null,
    formacao_instituicao: null,
  }
}

type Row = ReturnType<typeof syntheticRow>

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}

interface StubState {
  candidatosSelects: string[]
  candidatosUrls: URL[]
}

/** PostgREST mínimo: aplica `select`, `cargo_disputado=eq.` e `neq.` sobre as linhas dadas. */
function stubPostgrest(rows: Row[]): StubState {
  const state: StubState = { candidatosSelects: [], candidatosUrls: [] }
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input instanceof Request ? input.url : input))
    if (url.pathname.endsWith("/rest/v1/candidatos_publico")) {
      const select = url.searchParams.get("select") ?? "*"
      state.candidatosSelects.push(select)
      state.candidatosUrls.push(url)
      const cargoFilter = url.searchParams.get("cargo_disputado")
      const columns = select.split(",").map((column) => column.trim())
      const filtered = rows.filter((row) => {
        if (cargoFilter?.startsWith("eq.")) return row.cargo_disputado === cargoFilter.slice(3)
        if (cargoFilter?.startsWith("neq.")) return row.cargo_disputado !== cargoFilter.slice(4)
        return true
      })
      const projected = filtered.map((row) =>
        Object.fromEntries(columns.map((column) => [column, (row as Record<string, unknown>)[column] ?? null])),
      )
      return okJson(projected)
    }
    if (url.pathname.endsWith("/rest/v1/votos_candidato")) {
      return okJson([])
    }
    return okJson([])
  }) as typeof fetch
  return state
}

function lastCacheCall(keyHead: string): CacheCall | undefined {
  const calls = cacheCalls.filter((c) => Array.isArray(c.keys) && c.keys[0] === keyHead)
  return calls[calls.length - 1]
}

const senadores = Array.from({ length: 309 }, (_, index) => syntheticRow(index, "Senador"))
const governadores = Array.from({ length: 120 }, (_, index) => syntheticRow(1000 + index, "Governador"))
const presidentes = Array.from({ length: 12 }, (_, index) => syntheticRow(2000 + index, "Presidente"))

describe("contagem por UF para o mapa de /parlamentares e /governadores", () => {
  it("o caminho antigo (lista completa) passa de 2 MB com 309 senadores sintéticos", async (t) => {
    const api = await loadApi()
    stubPostgrest(senadores)

    const resource = await api.getCandidatosResource("Senador")

    assert.equal(resource.data.length, 309)
    const call = lastCacheCall("public-candidatos-resource")
    assert.ok(call?.bytes, "camada de cache não foi exercitada")
    t.diagnostic(`lista completa em cache: ${call.bytes} bytes`)
    assert.ok(
      call.bytes > DATA_CACHE_ITEM_LIMIT_BYTES,
      `a fixture precisa reproduzir o estouro medido (${call.bytes} bytes)`,
    )
  })

  it("projeta só `estado`, filtra o cargo e cabe muito abaixo de 2 MB", async (t) => {
    const api = await loadApi()
    const state = stubPostgrest([...senadores, ...governadores])

    const resource = await api.getCandidatoCountByEstadoResource("Senador")

    assert.equal(resource.sourceStatus, "live")
    assert.deepEqual(state.candidatosSelects, ["estado"])
    const url = state.candidatosUrls[0]
    assert.equal(url.searchParams.get("cargo_disputado"), "eq.Senador")
    assert.equal(url.searchParams.get("status"), "neq.removido")

    const total = Object.values(resource.data).reduce((sum, count) => sum + count, 0)
    assert.equal(total, 309)
    assert.equal(resource.data.SP, senadores.filter((row) => row.estado === "SP").length)

    const call = lastCacheCall("public-candidato-count-by-estado")
    assert.ok(call?.bytes, "camada de cache não foi exercitada")
    assert.equal(call.outcome, "resolved")
    t.diagnostic(`contagem por UF em cache: ${call.bytes} bytes`)
    assert.ok(
      call.bytes < DATA_CACHE_ITEM_LIMIT_BYTES / 100,
      `payload em cache ficou em ${call.bytes} bytes`,
    )
  })

  it("a chave de cache separa a flag do Senado e a onda de dados", async () => {
    const api = await loadApi()
    stubPostgrest(governadores)

    await api.getCandidatoCountByEstadoResource("Governador")

    const call = lastCacheCall("public-candidato-count-by-estado")
    assert.ok(call)
    assert.ok(call.keys.includes("senado-on"), `chaves: ${call.keys.join(", ")}`)
    assert.ok(call.keys.includes(api.CURRENT_DATA_WAVE), `chaves: ${call.keys.join(", ")}`)
  })

  it("falha transiente rejeita dentro do cache e degrada fora dele", async () => {
    const api = await loadApi()
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ message: "falha simulada", code: "XX000" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      })) as typeof fetch

    const resource = await api.getCandidatoCountByEstadoResource("Senador")

    assert.equal(resource.sourceStatus, "degraded")
    assert.deepEqual(resource.data, {})
    assert.equal(lastCacheCall("public-candidato-count-by-estado")?.outcome, "rejected")
  })
})

describe("índice de busca global com a coorte do Senado", () => {
  it("não carrega colunas pesadas e o índice fica abaixo de 2 MB", async (t) => {
    const api = await loadApi()
    const state = stubPostgrest([...presidentes, ...governadores, ...senadores])

    const resource = await api.getGlobalSearchIndexResource()

    assert.equal(resource.sourceStatus, "live")
    assert.equal(resource.data.length, presidentes.length + governadores.length + senadores.length)
    assert.ok(state.candidatosSelects.length > 0, "o índice precisa consultar candidatos_publico")
    for (const select of state.candidatosSelects) {
      const columns = select.split(",").map((column) => column.trim())
      for (const heavy of ["verificacao_campos", "biografia", "redes_sociais", "fonte_dados"]) {
        assert.ok(!columns.includes(heavy), `select do índice ainda carrega ${heavy}: ${select}`)
      }
    }
    assert.equal(
      lastCacheCall("public-candidatos-resource"),
      undefined,
      "o índice não deve passar pela lista completa (entrada acima de 2 MB no Data Cache)",
    )

    const call = lastCacheCall("global-search-index")
    assert.ok(call?.bytes, "camada de cache do índice não foi exercitada")
    assert.equal(call.outcome, "resolved")
    assert.ok(call.keys.includes("senado-on"))
    assert.ok(call.keys.includes(api.CURRENT_DATA_WAVE))
    t.diagnostic(`índice de busca em cache: ${call.bytes} bytes`)
    assert.ok(
      call.bytes < DATA_CACHE_ITEM_LIMIT_BYTES / 4,
      `índice em cache ficou em ${call.bytes} bytes`,
    )
  })
})

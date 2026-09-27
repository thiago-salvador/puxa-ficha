/**
 * F3 na grade: o DTO de lista (`CandidatoResumo`) carrega só um booleano
 * `patrimonio_atipico`, calculado no servidor a partir da série de patrimônio
 * (candidato_id, ano_eleicao, valor_total). A série inteira não entra no payload.
 *
 * Fixtures sintéticas: nomes e ids fictícios, sem dado de pessoa real.
 */
import assert from "node:assert/strict"
import Module from "node:module"
import { afterEach, describe, it } from "node:test"

type Loader = typeof Module & {
  _load: (request: string, parent: NodeModule | null | undefined, isMain: boolean) => unknown
}

// Env staged ANTES do import dinâmico: api.ts congela USE_MOCK no load do módulo.
process.env.SUPABASE_URL = "https://patrimonio-atipico-test.supabase.co"
process.env.SUPABASE_ANON_KEY = "test-anon-key"
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://patrimonio-atipico-test.supabase.co"
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key"

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
          (fn: (...args: unknown[]) => Promise<unknown>) =>
          (...args: unknown[]) =>
            fn(...args),
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
})

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}

function failResponse(): Response {
  return new Response(JSON.stringify({ message: "falha transiente simulada", code: "XX000" }), {
    status: 500,
    headers: { "content-type": "application/json" },
  })
}

function candidatoRow(id: string, slug: string, nome: string) {
  return {
    id,
    nome_completo: `${nome} da Silva`,
    nome_urna: nome,
    slug,
    data_nascimento: "1970-01-01",
    idade: 56,
    naturalidade: null,
    formacao: null,
    profissao_declarada: null,
    genero: null,
    estado_civil: null,
    cor_raca: null,
    partido_atual: null,
    partido_sigla: null,
    cargo_atual: null,
    cargo_disputado: "Presidente",
    estado: null,
    status: "ativo",
    situacao_candidatura: null,
    biografia: null,
    foto_url: null,
    site_campanha: null,
    redes_sociais: null,
    fonte_dados: null,
    ultima_atualizacao: "2026-08-01",
  }
}

const CEM_VEZES = candidatoRow("aaaaaaaa-0000-4000-8000-000000000001", "pessoa-cem-vezes", "Pessoa Cem")
const NOVENTA_E_NOVE = candidatoRow("aaaaaaaa-0000-4000-8000-000000000002", "pessoa-noventa-e-nove", "Pessoa Noventa")
const SEM_ANTERIOR = candidatoRow("aaaaaaaa-0000-4000-8000-000000000003", "pessoa-sem-anterior", "Pessoa Sem")

const PATRIMONIO_ROWS = [
  { candidato_id: CEM_VEZES.id, ano_eleicao: 2018, valor_total: 500 },
  { candidato_id: CEM_VEZES.id, ano_eleicao: 2022, valor_total: "1000.00" },
  { candidato_id: CEM_VEZES.id, ano_eleicao: 2026, valor_total: 100_000 },
  { candidato_id: NOVENTA_E_NOVE.id, ano_eleicao: 2022, valor_total: 1000 },
  { candidato_id: NOVENTA_E_NOVE.id, ano_eleicao: 2026, valor_total: 99_000 },
  { candidato_id: SEM_ANTERIOR.id, ano_eleicao: 2022, valor_total: 0 },
  { candidato_id: SEM_ANTERIOR.id, ano_eleicao: 2026, valor_total: 5_000_000 },
]

function comparadorRow(id: string, patrimonio: number) {
  return {
    id,
    cargo_disputado: "Presidente",
    estado: null,
    total_processos: 0,
    patrimonio_declarado: patrimonio,
    pontos_atencao: [],
  }
}

describe("DTO de lista: patrimonio_atipico calculado no servidor", () => {
  it("marca 100x como atípico e deixa 99x e sem ano anterior positivo como não atípicos", async () => {
    const api = await loadApi()
    const patrimonioUrls: string[] = []
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input)
      if (url.includes("/rest/v1/candidatos_publico")) return okJson([CEM_VEZES, NOVENTA_E_NOVE, SEM_ANTERIOR])
      if (url.includes("/rest/v1/v_comparador")) {
        return okJson([
          comparadorRow(CEM_VEZES.id, 100_000),
          comparadorRow(NOVENTA_E_NOVE.id, 99_000),
          comparadorRow(SEM_ANTERIOR.id, 5_000_000),
        ])
      }
      if (url.includes("/rest/v1/processos")) return okJson([])
      if (url.includes("/rest/v1/patrimonio")) {
        patrimonioUrls.push(url)
        return okJson(PATRIMONIO_ROWS)
      }
      return failResponse()
    }) as typeof fetch

    const resource = await api.getCandidatosComResumoResource()
    assert.equal(resource.sourceStatus, "live")

    const porSlug = Object.fromEntries(resource.data.map((row) => [row.candidato.slug, row]))
    assert.equal(porSlug[CEM_VEZES.slug]?.patrimonio_atipico, true)
    assert.equal(porSlug[NOVENTA_E_NOVE.slug]?.patrimonio_atipico, false)
    assert.equal(porSlug[SEM_ANTERIOR.slug]?.patrimonio_atipico, false)

    // Consulta mínima: só as três colunas da série, e a série não vaza no DTO.
    assert.ok(patrimonioUrls.length > 0, "a série de patrimônio não foi consultada")
    for (const url of patrimonioUrls) {
      const select = new URL(url).searchParams.get("select")
      assert.equal(select, "candidato_id,ano_eleicao,valor_total")
    }
    for (const row of resource.data) {
      assert.deepEqual(
        Object.keys(row).sort(),
        ["candidato", "patrimonio", "patrimonio_atipico", "pontos_atencao", "processos", "processos_ordenacao"],
      )
    }
  })

  it("falha na série não publica 'não atípico' como verdade: o resumo degrada", async () => {
    const api = await loadApi()
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input)
      if (url.includes("/rest/v1/candidatos_publico")) return okJson([CEM_VEZES])
      if (url.includes("/rest/v1/v_comparador")) return okJson([comparadorRow(CEM_VEZES.id, 100_000)])
      if (url.includes("/rest/v1/processos")) return okJson([])
      return failResponse()
    }) as typeof fetch

    const resource = await api.getCandidatosComResumoResource()
    assert.equal(resource.sourceStatus, "degraded")
    assert.equal(resource.data.length, 1)
    assert.equal(resource.data[0]?.patrimonio_atipico, false)
  })
})

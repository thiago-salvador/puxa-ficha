/**
 * Envenenamento do Data Cache por falha transiente (incidente 2026-08-02).
 *
 * Uma falha de 45s do Supabase virava `degradedResource` DENTRO de
 * `unstable_cache` e ficava congelada por APP_DATA_REVALIDATE_SECONDS (1h),
 * servida instantaneamente para todo mundo: home com "Não foi possível
 * carregar a lista de candidatos" e busca com 0 resultados, com o banco
 * saudável respondendo 200 no mesmo segundo. A ficha e a metadata já eram
 * protegidas por `requireLiveResourceForCache` (suffix no-cache-degraded-v1);
 * este teste cobre os 9 recursos que ficaram de fora.
 *
 * Contrato validado aqui, wrapper a wrapper:
 * 1. Falha transiente REJEITA dentro da camada de cache (nada cacheável é
 *    produzido) e o wrapper exportado degrada fora do cache, com a MESMA
 *    mensagem de antes (contrato dos callers preservado, zero mudança de UI).
 * 2. Fail-soft legítimo continua cacheável: lista vazia real é live.
 * 3. Degradação PARCIAL com dados reais (votos do índice de busca, resumo sem
 *    enriquecimento, quiz sem mapa de votações) CHEGA ao usuário com o payload
 *    intacto, mas também NÃO entra no cache. Revisto em 2026-08-04, véspera do
 *    lançamento: a versão anterior deixava o parcial cacheável de propósito, e
 *    um timeout de segundos em `v_comparador` congelou a home por uma hora com
 *    processos, patrimônio e pontos de atenção zerados, que é exatamente o
 *    conteúdo que dá sentido ao site. Servir zero por uma hora é pior do que
 *    tentar de novo na requisição seguinte.
 *
 * O mock de `unstable_cache` é um pass-through que REGISTRA se o callback
 * resolveu ou rejeitou: é essa a fronteira exata do envenenamento, porque só
 * resultado resolvido entra no Data Cache da Vercel.
 */

import assert from "node:assert/strict"
import Module from "node:module"
import { afterEach, describe, it } from "node:test"

type Loader = typeof Module & {
  _load: (request: string, parent: NodeModule | null | undefined, isMain: boolean) => unknown
}

// Env staged ANTES do import dinâmico: api.ts congela USE_MOCK no load do módulo.
process.env.SUPABASE_URL = "https://cache-poison-test.supabase.co"
process.env.SUPABASE_ANON_KEY = "test-anon-key"
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://cache-poison-test.supabase.co"
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key"

interface CacheCall {
  keys: string[]
  outcome: "resolved" | "rejected"
  sourceStatus?: string
  errorMessage?: string
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
          (fn: (...args: unknown[]) => Promise<Record<string, unknown>>, keys: string[]) =>
          async (...args: unknown[]) => {
            try {
              const result = await fn(...args)
              cacheCalls.push({
                keys,
                outcome: "resolved",
                sourceStatus:
                  typeof result?.sourceStatus === "string" ? result.sourceStatus : undefined,
              })
              return result
            } catch (error) {
              cacheCalls.push({
                keys,
                outcome: "rejected",
                errorMessage: error instanceof Error ? error.message : String(error),
              })
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

function failResponse(): Response {
  return new Response(JSON.stringify({ message: "falha transiente simulada", code: "XX000" }), {
    status: 500,
    headers: { "content-type": "application/json" },
  })
}

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}

/** Roteia o fetch global por tabela PostgREST; o resto cai no fallback. */
function stubFetchByTable(
  handlers: Record<string, () => Response>,
  fallback: () => Response
): void {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input)
    for (const [table, make] of Object.entries(handlers)) {
      if (url.includes(`/rest/v1/${table}`)) return make()
    }
    return fallback()
  }) as typeof fetch
}

function stubAllFail(): void {
  stubFetchByTable({}, failResponse)
}

function lastCacheCall(keyHead: string): CacheCall | undefined {
  const calls = cacheCalls.filter((c) => Array.isArray(c.keys) && c.keys[0] === keyHead)
  return calls[calls.length - 1]
}

/** Linha mínima de candidatos_publico com todas as CANDIDATO_COLUMNS. */
const CANDIDATO_ROW = {
  id: "11111111-1111-4111-8111-111111111111",
  nome_completo: "Candidata Teste da Silva",
  nome_urna: "Candidata Teste",
  slug: "candidata-teste",
  data_nascimento: "1970-01-01",
  idade: 56,
  naturalidade: "São Paulo (SP)",
  formacao: "Superior",
  profissao_declarada: "Professora",
  genero: "feminino",
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

const MSG_CANDIDATOS = "Não foi possível carregar a lista de candidatos nesta tentativa."
const MSG_NAV = "Não foi possível carregar a navegação entre candidatos nesta tentativa."
const MSG_COMPARACAO = "Não foi possível montar a comparação nesta tentativa."
const MSG_INDICADORES_ESTADO = "Não foi possível carregar indicadores estaduais nesta tentativa."
const MSG_INDICADORES_ALL = "Não foi possível carregar indicadores para ranking nesta tentativa."

describe("falha transiente não pode entrar no Data Cache", () => {
  it("getCandidatosResource: rejeita no cache e degrada fora dele com a mensagem atual", async () => {
    const api = await loadApi()
    stubAllFail()

    const resource = await api.getCandidatosResource()

    assert.equal(resource.sourceStatus, "degraded")
    assert.equal(resource.sourceMessage, MSG_CANDIDATOS)
    assert.deepEqual(resource.data, [])

    const call = lastCacheCall("public-candidatos-resource")
    assert.ok(call, "camada de cache não foi exercitada")
    assert.equal(
      call.outcome,
      "rejected",
      "falha transiente resolveu dentro do unstable_cache: o degraded ficaria congelado por 1h"
    )
  })

  it("getCandidatoNavResource: rejeita no cache e degrada fora dele", async () => {
    const api = await loadApi()
    stubAllFail()

    const resource = await api.getCandidatoNavResource("Presidente")

    assert.equal(resource.sourceStatus, "degraded")
    assert.equal(resource.sourceMessage, MSG_NAV)
    assert.deepEqual(resource.data, [])
    assert.equal(lastCacheCall("public-candidato-nav-resource")?.outcome, "rejected")
  })

  it("getCandidatosComparaveisResource: rejeita no cache e degrada fora dele", async () => {
    const api = await loadApi()
    stubAllFail()

    const resource = await api.getCandidatosComparaveisResource("Presidente")

    assert.equal(resource.sourceStatus, "degraded")
    assert.equal(resource.sourceMessage, MSG_COMPARACAO)
    assert.deepEqual(resource.data, [])
    assert.equal(lastCacheCall("public-candidatos-comparaveis-resource")?.outcome, "rejected")
  })

  it("getIndicadoresEstadoResource: rejeita no cache e degrada fora dele", async () => {
    const api = await loadApi()
    stubAllFail()

    const resource = await api.getIndicadoresEstadoResource("SP")

    assert.equal(resource.sourceStatus, "degraded")
    assert.equal(resource.sourceMessage, MSG_INDICADORES_ESTADO)
    assert.deepEqual(resource.data, [])
    assert.equal(lastCacheCall("public-indicadores-estado-resource")?.outcome, "rejected")
  })

  it("getIndicadoresAllEstadosResource: rejeita no cache e degrada fora dele", async () => {
    const api = await loadApi()
    stubAllFail()

    const resource = await api.getIndicadoresAllEstadosResource()

    assert.equal(resource.sourceStatus, "degraded")
    assert.equal(resource.sourceMessage, MSG_INDICADORES_ALL)
    assert.deepEqual(resource.data, [])
    assert.equal(lastCacheCall("public-indicadores-all-estados-resource")?.outcome, "rejected")
  })

  it("cascata: índice de busca global não cacheia índice vazio quando a lista degradou", async () => {
    const api = await loadApi()
    stubAllFail()

    const resource = await api.getGlobalSearchIndexResource()

    assert.equal(resource.sourceStatus, "degraded")
    assert.equal(resource.sourceMessage, MSG_CANDIDATOS)
    assert.deepEqual(resource.data, [])
    assert.equal(lastCacheCall("global-search-index")?.outcome, "rejected")
  })

  it("cascata: resumo de candidatos não cacheia lista vazia quando a lista degradou", async () => {
    const api = await loadApi()
    stubAllFail()

    const resource = await api.getCandidatosComResumoResource()

    assert.equal(resource.sourceStatus, "degraded")
    assert.equal(resource.sourceMessage, MSG_CANDIDATOS)
    assert.deepEqual(resource.data, [])
    assert.equal(lastCacheCall("public-candidatos-resumo-resource")?.outcome, "rejected")
  })

  it("cascata: ranking não cacheia dataset vazio quando os comparáveis degradaram", async () => {
    const api = await loadApi()
    stubAllFail()

    const resource = await api.getRankingDataResource("patrimonio-declarado")

    assert.equal(resource.sourceStatus, "degraded")
    assert.equal(resource.sourceMessage, MSG_COMPARACAO)
    assert.equal(resource.data.definition.slug, "patrimonio-declarado")
    assert.deepEqual(resource.data.entries, [])
    assert.equal(lastCacheCall("ranking-data-resource-public-copy-20260521")?.outcome, "rejected")
  })

  it("cascata: quiz não cacheia dataset vazio quando a lista degradou", async () => {
    const api = await loadApi()
    stubAllFail()

    const resource = await api.getQuizAlignmentDatasetResource()

    assert.equal(resource.sourceStatus, "degraded")
    assert.equal(resource.sourceMessage, MSG_CANDIDATOS)
    assert.deepEqual(resource.data, {
      candidatos: [],
      votacoes_mapeadas: [],
      votacao_titulo_to_id: {},
      votacao_fonte_por_titulo: {},
    })
    assert.equal(lastCacheCall("quiz-alignment-dataset-resource")?.outcome, "rejected")
  })
})

describe("fail-soft legítimo continua cacheável", () => {
  it("lista vazia real (query ok, 0 linhas) é live e resolve dentro do cache", async () => {
    const api = await loadApi()
    stubFetchByTable({}, () => okJson([]))

    const resource = await api.getCandidatosResource()

    assert.equal(resource.sourceStatus, "live")
    assert.deepEqual(resource.data, [])

    const call = lastCacheCall("public-candidatos-resource")
    assert.equal(call?.outcome, "resolved")
    assert.equal(call?.sourceStatus, "live")
  })

  it("degradação parcial entrega o payload e NÃO cacheia: busca sem temas de votação", async () => {
    const api = await loadApi()
    stubFetchByTable({ candidatos_publico: () => okJson([CANDIDATO_ROW]) }, failResponse)

    const resource = await api.getGlobalSearchIndexResource()

    assert.equal(resource.sourceStatus, "degraded")
    assert.equal(
      resource.sourceMessage,
      "Temas de votação não puderam ser carregados; a busca usa só nome, partido e estado."
    )
    assert.equal(resource.data.length, 1)
    assert.equal(lastCacheCall("global-search-index")?.outcome, "rejected")
  })

  it("degradação parcial entrega o payload e NÃO cacheia: resumo sem enriquecimento", async () => {
    const api = await loadApi()
    stubFetchByTable({ candidatos_publico: () => okJson([CANDIDATO_ROW]) }, failResponse)

    const resource = await api.getCandidatosComResumoResource()

    assert.equal(resource.sourceStatus, "degraded")
    assert.equal(
      resource.sourceMessage,
      "Nem todos os resumos puderam ser enriquecidos. Alguns totais podem estar zerados temporariamente."
    )
    assert.equal(resource.data.length, 1)
    assert.equal(lastCacheCall("public-candidatos-resumo-resource")?.outcome, "rejected")
  })

  it("resumo degradado repete o último número conhecido em vez de publicar zero", async () => {
    const api = await loadApi()

    // 1. Rodada saudável: o enriquecimento responde e fica na memória.
    stubFetchByTable(
      {
        candidatos_publico: () => okJson([CANDIDATO_ROW]),
        v_comparador: () =>
          okJson([
            {
              id: CANDIDATO_ROW.id,
              cargo_disputado: "Presidente",
              estado: null,
              total_processos: 3,
              patrimonio_declarado: 1234.56,
              pontos_atencao: [{ titulo: "a" }, { titulo: "b" }],
            },
          ]),
      },
      failResponse
    )

    const vivo = await api.getCandidatosComResumoResource()
    assert.equal(vivo.sourceStatus, "live")
    assert.equal(vivo.data[0].processos, 3)
    assert.equal(vivo.data[0].pontos_atencao, 2)

    // 2. Enriquecimento cai; a lista de candidatos continua de pé.
    stubFetchByTable({ candidatos_publico: () => okJson([CANDIDATO_ROW]) }, failResponse)

    const degradado = await api.getCandidatosComResumoResource()
    assert.equal(degradado.sourceStatus, "degraded")
    assert.equal(degradado.data[0].processos, 3, "não pode zerar quem tem 3 processos")
    assert.equal(degradado.data[0].pontos_atencao, 2)
    assert.equal(degradado.data[0].patrimonio, 1234.56)
    assert.equal(lastCacheCall("public-candidatos-resumo-resource")?.outcome, "rejected")
  })

  it("degradação parcial entrega o payload e NÃO cacheia: quiz sem mapa de votações", async () => {
    const api = await loadApi()
    stubFetchByTable({ candidatos_publico: () => okJson([CANDIDATO_ROW]) }, failResponse)

    const resource = await api.getQuizAlignmentDatasetResource()

    assert.equal(resource.sourceStatus, "degraded")
    assert.equal(resource.data.candidatos.length, 1)
    assert.equal(lastCacheCall("quiz-alignment-dataset-resource")?.outcome, "rejected")
  })
})

/**
 * Ordem de promoção: o código do release do Senado pode chegar à produção antes
 * das migrations 20260915210000 e 20260915220000. Nesse intervalo o PostgREST
 * responde 400/42703 para as colunas novas de contexto eleitoral. A ficha de
 * Presidente/Governador não pode cair por isso: a leitura refaz a consulta com
 * o conjunto de colunas anterior (o mesmo de origin/main) e marca o resto como
 * null. Qualquer outro erro mantém o comportamento fail-closed.
 */

import assert from "node:assert/strict"
import Module from "node:module"
import { afterEach, describe, it } from "node:test"

type Loader = typeof Module & {
  _load: (request: string, parent: NodeModule | null | undefined, isMain: boolean) => unknown
}

process.env.SUPABASE_URL = "https://pre-migration-test.supabase.co"
process.env.SUPABASE_ANON_KEY = "test-anon-key"
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://pre-migration-test.supabase.co"
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key"
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key"

let apiPromise: Promise<typeof import("../src/lib/api")> | null = null

/**
 * Cache falso que guarda de verdade (como o Data Cache do Next): mesma chave e
 * mesmos argumentos devolvem o valor gravado; rejeição não é gravada. Registra
 * as chaves e o `revalidate` de cada loader para as asserções de cache.
 */
interface RegistroCache {
  keyParts: string[]
  revalidate: number | false | undefined
  tags: string[] | undefined
}
const registrosCache: RegistroCache[] = []
const valoresCache = new Map<string, unknown>()
const execucoesCache: string[] = []

function unstableCacheQueGrava(
  fn: (...args: unknown[]) => Promise<unknown>,
  keyParts: string[] = [],
  options: { revalidate?: number | false; tags?: string[] } = {},
) {
  registrosCache.push({ keyParts, revalidate: options.revalidate, tags: options.tags })
  return async (...args: unknown[]) => {
    const chave = JSON.stringify([keyParts, args])
    if (valoresCache.has(chave)) return structuredClone(valoresCache.get(chave))
    execucoesCache.push(keyParts[0] ?? "")
    const valor = await fn(...args)
    valoresCache.set(chave, structuredClone(valor))
    return structuredClone(valor)
  }
}

function loadApi() {
  if (apiPromise) return apiPromise
  const moduleLoader = Module as Loader
  const originalLoad = moduleLoader._load
  moduleLoader._load = function loadWithNextServerMocks(request, parent, isMain) {
    if (request === "server-only") return {}
    if (request === "next/cache") {
      return {
        unstable_cache: unstableCacheQueGrava,
        unstable_noStore: () => {},
        revalidateTag: () => {},
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
const originalWarn = console.warn
const originalError = console.error

afterEach(() => {
  valoresCache.clear()
  execucoesCache.length = 0
  globalThis.fetch = originalFetch
  console.warn = originalWarn
  console.error = originalError
})

const CANDIDATO_ROW = {
  id: "22222222-2222-4222-8222-222222222222",
  nome_completo: "Governadora Teste da Silva",
  nome_urna: "Governadora Teste",
  slug: "governadora-teste-pre-migration",
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
  cargo_disputado: "Governador",
  estado: "SP",
  status: "ativo",
  situacao_candidatura: null,
  biografia: null,
  foto_url: null,
  site_campanha: null,
  redes_sociais: null,
  fonte_dados: ["TSE"],
  ultima_atualizacao: "2026-08-01",
}

const AUSENCIA_PRE_MIGRATION = {
  ano_eleicao: 2018,
  fonte_url: "https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2018.zip",
  verificado_em: "2026-08-07T18:27:03.374Z",
}

const VERIFICACAO_PRE_MIGRATION = {
  ano_eleicao: 2018,
  resultado: "ausencia_oficial",
  fonte_url: "https://dadosabertos.tse.jus.br/dataset/prestacao-de-contas-eleitorais-2018",
  verificado_em: "2026-08-07T18:27:03.374Z",
  detalhe: "Pacote oficial lido sem receitas para o SQ.",
}

const NEW_AUSENCIA_COLUMNS = ["ano_arquivo", "uf_candidatura", "cargo_candidatura", "data_eleicao", "tipo_eleicao"]
const NEW_VERIFICACAO_COLUMNS = ["sq_candidato", "uf_candidatura", "cargo_candidatura"]

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "content-range": "0-0/0", ...extraHeaders },
  })
}

function postgrestError(code: string, message: string): Response {
  return json({ code, message, details: null, hint: null }, 400)
}

interface StubOptions {
  ausenciaError?: Response
  despesasError?: Response
  /** Respostas das leituras de despesas em ordem; a última se repete. */
  despesasRespostas?: Array<() => Response>
  selects: Record<string, string[]>
  projetosUrls?: string[]
}

/**
 * Banco "antes das migrations": colunas novas respondem 42703, o resto das
 * tabelas responde vazio. Registra os `select` por tabela para as asserções.
 */
function stubPreMigrationDatabase(options: StubOptions): void {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input))
    const match = /\/rest\/v1\/([^/?]+)/.exec(url.pathname)
    if (!match) return json([])
    const table = match[1]
    const select = url.searchParams.get("select") ?? ""
    ;(options.selects[table] ??= []).push(select)
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    const wantsObject = (headers.get("accept") ?? "").includes("vnd.pgrst.object")

    if (table === "projetos_lei" && options.projetosUrls) {
      options.projetosUrls.push(url.toString())
      const publico = url.searchParams.get("despublicado_em") === "is.null"
      const count = publico ? 0 : 1
      const method = init?.method ?? (input instanceof Request ? input.method : "GET")
      return new Response(method === "HEAD" ? null : JSON.stringify(publico ? [] : [{ id: "projeto-despublicado" }]), {
        status: 200,
        headers: { "content-type": "application/json", "content-range": `*/${count}` },
      })
    }

    if (table === "candidatos_publico" || table === "candidatos") {
      if (table === "candidatos_publico" && select.split(",").includes("numero_urna")) {
        return postgrestError("42703", "column candidatos_publico.numero_urna does not exist")
      }
      return wantsObject ? json(CANDIDATO_ROW) : json([CANDIDATO_ROW])
    }
    if (table === "patrimonio_ausencia_oficial") {
      if (options.ausenciaError) return options.ausenciaError.clone()
      const missing = NEW_AUSENCIA_COLUMNS.find((column) => select.includes(column))
      if (missing) {
        return postgrestError("42703", `column patrimonio_ausencia_oficial.${missing} does not exist`)
      }
      return json([AUSENCIA_PRE_MIGRATION])
    }
    if (table === "financiamento_despesas_publico" && options.despesasRespostas?.length) {
      const leitura = (options.selects[table] ?? []).length - 1
      return options.despesasRespostas[Math.min(leitura, options.despesasRespostas.length - 1)]!()
    }
    if (table === "financiamento_despesas_publico" && options.despesasError) {
      return options.despesasError.clone()
    }
    if (table === "financiamento_verificacoes_publico") {
      const missing = NEW_VERIFICACAO_COLUMNS.find((column) => select.includes(column))
      if (missing) {
        return postgrestError("42703", `column financiamento_verificacoes_publico.${missing} does not exist`)
      }
      return json([VERIFICACAO_PRE_MIGRATION])
    }
    return wantsObject ? postgrestError("PGRST116", "JSON object requested, multiple (or no) rows returned") : json([])
  }) as typeof fetch
}

describe("ficha antes das migrations de contexto eleitoral", () => {
  it("mantém busca por nome sem numero_urna e não cacheia índice incompleto", async () => {
    const api = await loadApi()
    const selects: Record<string, string[]> = {}
    console.warn = () => {}
    console.error = () => {}
    stubPreMigrationDatabase({ selects })

    const first = await api.getGlobalSearchIndexResource()
    assert.equal(first.sourceStatus, "degraded")
    assert.equal(first.data.length, 1)
    assert.equal(first.data[0].title, CANDIDATO_ROW.nome_urna)
    assert.equal(first.data[0].numero_urna, null)

    const candidateSelects = (selects.candidatos_publico ?? []).filter((columns) =>
      columns.includes("nome_completo") && columns.includes("foto_url") && !columns.includes("verificacao_campos")
    )
    assert.equal(candidateSelects.length, 2, "uma consulta nova e um fallback")
    assert.ok(candidateSelects[0].includes("numero_urna"))
    assert.ok(!candidateSelects[1].includes("numero_urna"))

    await api.getGlobalSearchIndexResource()
    const repeated = (selects.candidatos_publico ?? []).filter((columns) => columns === candidateSelects[0])
    assert.equal(repeated.length, 2, "índice incompleto não pode entrar no cache")
  })

  it("Governador carrega com o conjunto de colunas de origin/main e avisa uma vez", async () => {
    const api = await loadApi()
    const selects: Record<string, string[]> = {}
    const warnings: string[] = []
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "))
    }
    console.error = () => {}
    stubPreMigrationDatabase({ selects })

    const resource = await api.getCandidatoBySlugResource(CANDIDATO_ROW.slug)

    assert.equal(resource.sourceStatus, "live", resource.sourceMessage ?? "")
    assert.ok(resource.data, "a ficha do Governador precisa carregar")
    assert.deepEqual(resource.data.patrimonio_ausencias_oficiais, [
      {
        ...AUSENCIA_PRE_MIGRATION,
        detalhe: null,
        ano_arquivo: null,
        sq_candidato: null,
        uf_candidatura: null,
        cargo_candidatura: null,
        data_eleicao: null,
        tipo_eleicao: null,
      },
    ])

    const ausenciaSelects = selects.patrimonio_ausencia_oficial ?? []
    assert.equal(ausenciaSelects.length, 2, "uma tentativa nova e exatamente um retry")
    assert.equal(ausenciaSelects[1], "ano_eleicao,fonte_url,verificado_em")

    const verificacaoSelects = selects.financiamento_verificacoes_publico ?? []
    assert.equal(verificacaoSelects.length, 2, "selos de financiamento também têm um retry")
    assert.equal(verificacaoSelects[1], "ano_eleicao,resultado,fonte_url,verificado_em,detalhe")

    const schemaWarnings = warnings.filter((line) => line.includes("42703"))
    assert.equal(
      schemaWarnings.filter((line) => line.includes("patrimonio_ausencia_oficial")).length,
      1,
      `esperado um aviso para patrimonio_ausencia_oficial, veio: ${JSON.stringify(warnings)}`
    )
    assert.equal(
      schemaWarnings.filter((line) => line.includes("financiamento_verificacoes_publico")).length,
      1,
      `esperado um aviso para financiamento_verificacoes_publico, veio: ${JSON.stringify(warnings)}`
    )
  })

  it("erro diferente de coluna ausente continua fail-closed, sem retry", async () => {
    const api = await loadApi()
    const selects: Record<string, string[]> = {}
    console.warn = () => {}
    console.error = () => {}
    stubPreMigrationDatabase({
      selects,
      ausenciaError: postgrestError("42501", "permission denied for table patrimonio_ausencia_oficial"),
    })

    await assert.rejects(
      () => api.getCandidatoBySlugResource(CANDIDATO_ROW.slug),
      (error: unknown) => (error as { code?: string }).code === "42501"
    )
    const ausenciaSelects = selects.patrimonio_ausencia_oficial ?? []
    assert.ok(ausenciaSelects.length > 0)
    assert.ok(
      ausenciaSelects.every((select) => select.includes("ano_arquivo")),
      `42501 não pode disparar o retry pré-migration: ${JSON.stringify(ausenciaSelects)}`
    )
  })

  for (const [codigo, mensagem, status, leituras] of [
    ["42P01", 'relation "public.financiamento_despesas_publico" does not exist', "ausente", 1],
    ["42501", "permission denied for view financiamento_despesas_publico", "indisponivel", 2],
    ["42703", "column financiamento_despesas_publico.fonte does not exist", "indisponivel", 2],
    ["57014", "canceling statement due to statement timeout", "indisponivel", 2],
  ] as const) {
    it(`despesas com erro ${codigo}: a ficha carrega com status ${status} e a seção é omitida`, async () => {
      const api = await loadApi()
      const selects: Record<string, string[]> = {}
      const warnings: string[] = []
      console.warn = (...args: unknown[]) => {
        warnings.push(args.map(String).join(" "))
      }
      console.error = () => {}
      stubPreMigrationDatabase({ selects, despesasError: postgrestError(codigo, mensagem) })

      const resource = await api.getCandidatoBySlugResource(CANDIDATO_ROW.slug)

      assert.equal(resource.sourceStatus, "live", resource.sourceMessage ?? "")
      assert.ok(resource.data, "a ficha precisa carregar mesmo sem a view de despesas")
      assert.equal(resource.data.financiamento_despesas_status, status)
      assert.equal(resource.data.financiamento_despesas, null)
      assert.ok(
        warnings.some((line) => line.includes("financiamento_despesas_publico") && line.includes("seção de despesas omitida")),
        `esperado aviso de despesas omitidas, veio: ${JSON.stringify(warnings)}`,
      )
      // View ausente: uma leitura só, e a ficha fica no cache. Indisponível: a
      // ficha também fica no cache e só as despesas são relidas uma vez (cache
      // curto próprio), sem reconstruir a ficha.
      assert.equal((selects.financiamento_despesas_publico ?? []).length, leituras)
    })
  }

  it("despesas indisponíveis: ficha em cache uma vez, releitura só das despesas sob chave própria de 60 s", async () => {
    const api = await loadApi()
    const selects: Record<string, string[]> = {}
    console.warn = () => {}
    console.error = () => {}
    stubPreMigrationDatabase({
      selects,
      despesasError: postgrestError("57014", "canceling statement due to statement timeout"),
    })

    const primeira = await api.getCandidatoBySlugResource(CANDIDATO_ROW.slug)
    const leiturasFicha = (selects.candidatos_publico ?? []).length
    const segunda = await api.getCandidatoBySlugResource(CANDIDATO_ROW.slug)
    const terceira = await api.getCandidatoBySlugResource(CANDIDATO_ROW.slug)

    for (const resource of [primeira, segunda, terceira]) {
      assert.equal(resource.data?.financiamento_despesas_status, "indisponivel")
      assert.equal(resource.data?.financiamento_despesas, null)
    }
    assert.ok(leiturasFicha > 0)
    assert.equal((selects.candidatos_publico ?? []).length, leiturasFicha, "a ficha não é reconstruída a cada visita")
    assert.equal((selects.financiamento_despesas_publico ?? []).length, 2, "uma leitura da ficha e uma releitura em cache")
    assert.deepEqual(
      execucoesCache.filter((chave) => chave.startsWith("public-candidato-ficha")),
      ["public-candidato-ficha-resource", "public-candidato-ficha-despesas-releitura"],
    )

    const ficha = registrosCache.find((r) => r.keyParts[0] === "public-candidato-ficha-resource")
    const releitura = registrosCache.find((r) => r.keyParts[0] === "public-candidato-ficha-despesas-releitura")
    assert.ok(ficha && releitura, JSON.stringify(registrosCache.map((r) => r.keyParts[0])))
    assert.equal(releitura.revalidate, 60)
    assert.deepEqual(releitura.tags, ["public-candidato-ficha"])
    assert.equal(ficha.revalidate, 43200)
    assert.ok(ficha.keyParts.includes("financiamento-despesas-v1-20260929"))
    assert.notDeepEqual(releitura.keyParts, ficha.keyParts)
  })

  it("despesas indisponíveis na ficha e lidas na releitura: a seção volta sem refazer a ficha", async () => {
    const api = await loadApi()
    const selects: Record<string, string[]> = {}
    console.warn = () => {}
    console.error = () => {}
    stubPreMigrationDatabase({
      selects,
      despesasRespostas: [
        () => postgrestError("57014", "canceling statement due to statement timeout"),
        () => json([]),
      ],
    })

    const resource = await api.getCandidatoBySlugResource(CANDIDATO_ROW.slug)
    assert.equal(resource.data?.financiamento_despesas_status, "ok")
    assert.deepEqual(resource.data?.financiamento_despesas, [])
    assert.equal((selects.financiamento_despesas_publico ?? []).length, 2)
  })

  it("despesas lidas com sucesso: status ok, uma leitura, e a segunda visita sai do cache da ficha", async () => {
    const api = await loadApi()
    const selects: Record<string, string[]> = {}
    console.warn = () => {}
    console.error = () => {}
    stubPreMigrationDatabase({ selects })

    const resource = await api.getCandidatoBySlugResource(CANDIDATO_ROW.slug)
    const deNovo = await api.getCandidatoBySlugResource(CANDIDATO_ROW.slug)

    assert.equal(resource.data?.financiamento_despesas_status, "ok")
    assert.deepEqual(resource.data?.financiamento_despesas, [])
    assert.deepEqual(deNovo.data, resource.data)
    assert.equal((selects.financiamento_despesas_publico ?? []).length, 1, "uma leitura só, sem refazer")
    assert.ok(!execucoesCache.includes("public-candidato-ficha-despesas-releitura"), "sem releitura quando a leitura foi ok")
  })

  it("preview omite projeto despublicado da lista e das três contagens", async () => {
    const api = await loadApi()
    const selects: Record<string, string[]> = {}
    const projetosUrls: string[] = []
    console.warn = () => {}
    console.error = () => {}
    stubPreMigrationDatabase({ selects, projetosUrls })

    const resource = await api.getCandidatoBySlugPreviewResource(CANDIDATO_ROW.slug)
    assert.ok(resource.data)
    assert.deepEqual(resource.data.projetos_lei, [])
    assert.equal(resource.data.projetos_lei_total, 0)
    assert.equal(resource.data.projetos_lei_natureza_projetos_total, 0)
    assert.equal(resource.data.projetos_lei_destaques_total, 0)
    assert.equal(resource.data.projetos_lei_camara_total, 0)
    assert.equal(resource.data.projetos_lei_senado_total, 0)
    assert.equal(projetosUrls.length, 5)
    assert.ok(projetosUrls.every((url) => new URL(url).searchParams.get("despublicado_em") === "is.null"))
  })
})

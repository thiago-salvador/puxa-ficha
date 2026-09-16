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
          async (...args: unknown[]) =>
            fn(...args),
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
  selects: Record<string, string[]>
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

    if (table === "candidatos_publico" || table === "candidatos") {
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
})

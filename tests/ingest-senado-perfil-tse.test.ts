import assert from "node:assert/strict"
import test from "node:test"
import { ingestSenado } from "../scripts/lib/ingest-senado"
import { withExplicitCohort } from "../scripts/lib/cohort-context"
import { __resetSupabaseParaTeste } from "../scripts/lib/supabase"

// Issue #472: the Senado profile lags party switches (it still listed PSD for
// a senator whose 2026 TSE registration is PT). TSE data wins; the Senado only
// fills fields TSE does not publish. Synthetic identity below.
const CANDIDATO_ID = "00000000-0000-4000-8000-000000000472"
const SLUG = "tse-2026-999999999472"
const PERFIL_SENADO = {
  DetalheParlamentar: {
    Parlamentar: {
      IdentificacaoParlamentar: {
        NomeParlamentar: "Senadora Fixture",
        UfParlamentar: "MA",
        CodigoPublicoNaLegAtual: "999",
        SiglaPartidoParlamentar: "PSD",
        UrlFotoParlamentar: "https://example.test/senado-fixture.jpg",
      },
      DadosBasicosParlamentar: {
        NomeCompletoParlamentar: "Senadora Fixture da Silva",
        DataNascimento: "1970-01-01",
        Naturalidade: "Cidade Fixture",
        UfNaturalidade: "MA",
      },
    },
  },
}

async function perfilGravado(atual: Record<string, unknown>): Promise<{ patch: Record<string, unknown>; errors: string[] }> {
  const previousFetch = globalThis.fetch
  const previousUrl = process.env.SUPABASE_URL
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  process.env.SUPABASE_URL = "http://127.0.0.1:9"
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only"
  __resetSupabaseParaTeste()
  let patch: Record<string, unknown> = {}
  const response = (data: unknown) => new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } })
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input))
    const method = init?.method ?? "GET"
    if (url.hostname === "legis.senado.leg.br") {
      if (url.pathname.endsWith("/9999.json")) return response(PERFIL_SENADO)
      if (url.pathname.endsWith("/9999/mandatos.json")) return response({})
      if (url.pathname.endsWith("/9999/autorias.json")) return response({})
      throw new Error(`Unexpected Senate request: ${url.pathname}`)
    }
    if (url.pathname.endsWith("/votacoes_chave")) return response([])
    if (url.pathname.endsWith("/candidatos")) {
      if (method === "PATCH") {
        patch = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>
        return response(null)
      }
      const select = url.searchParams.get("select") ?? ""
      if (select.includes("verificacao_campos")) return response([{ slug: SLUG, verificacao_campos: null }])
      if (select.includes("sq_candidato_2026")) return response(atual)
      return response({ id: CANDIDATO_ID })
    }
    throw new Error(`Unexpected database request: ${method} ${url.pathname}`)
  }
  try {
    const [receipt] = await withExplicitCohort([{
      slug: SLUG,
      nome_completo: "SENADORA FIXTURE DA SILVA",
      nome_urna: "SENADORA FIXTURE",
      cargo_disputado: "Senador",
      estado: "MA",
      ids: { camara: null, senado: 9999, tse_sq_candidato: { "2026": "999999999472" } },
    }], () => ingestSenado())
    return { patch, errors: receipt.errors }
  } finally {
    globalThis.fetch = previousFetch
    if (previousUrl === undefined) delete process.env.SUPABASE_URL
    else process.env.SUPABASE_URL = previousUrl
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey
    __resetSupabaseParaTeste()
  }
}

test("Senado: com registro TSE 2026, perfil do Senado não sobrescreve partido, data de nascimento nem naturalidade", async () => {
  const { patch, errors } = await perfilGravado({ foto_url: "https://example.test/foto.jpg", sq_candidato_2026: "999999999472" })
  assert.deepEqual(errors, [])
  assert.equal("partido_sigla" in patch, false)
  assert.equal("partido_atual" in patch, false)
  assert.equal("data_nascimento" in patch, false)
  assert.equal("foto_url" in patch, false, "foto existente não é trocada")
  // A coorte grava naturalidade a partir do complemento do TSE.
  assert.equal("naturalidade" in patch, false)
  // O que o TSE não publica continua vindo do Senado.
  assert.equal(patch.cargo_atual, "Senador(a)")
})

test("Senado: sem registro TSE 2026, perfil do Senado mantém o comportamento anterior", async () => {
  const { patch, errors } = await perfilGravado({ foto_url: null, sq_candidato_2026: null })
  assert.deepEqual(errors, [])
  assert.equal(patch.partido_sigla, "PSD")
  assert.equal(patch.partido_atual, "PSD")
  assert.equal(patch.data_nascimento, "1970-01-01")
  assert.equal(patch.foto_url, "https://example.test/senado-fixture.jpg")
  assert.equal(patch.cargo_atual, "Senador(a)")
  assert.equal(patch.naturalidade, "Cidade Fixture/MA")
})

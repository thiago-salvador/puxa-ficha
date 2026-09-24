import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { ingestSenado } from "../scripts/lib/ingest-senado"
import { withExplicitCohort } from "../scripts/lib/cohort-context"
import { __resetSupabaseParaTeste } from "../scripts/lib/supabase"

// Payload de https://legis.senado.leg.br/dadosabertos/senador/5718/mandatos
// (lido em 23/09/2026): o mandato 542 tem o exercício 2900 (2019-02-01 a
// 2024-07-16, afastamento AFO) e o exercício 3069 (desde 2024-10-17).
const MANDATOS_5718 = JSON.parse(readFileSync(new URL("./fixtures/senado-mandatos-5718.json", import.meta.url), "utf8"))
const CANDIDATO_ID = "b8e8b3d1-1e2e-482f-b0dd-dbf927c5c681"
const SLUG = "tse-2026-100002541459"
const LINHA_2019 = "a9fed6c6-7402-42fd-81b8-44b1b62ff246"

type Escrita = { method: string; id: string | null; body: Record<string, unknown> }

async function rodar(existentes: Array<Record<string, unknown>>): Promise<{ escritas: Escrita[]; errors: string[] }> {
  const previousFetch = globalThis.fetch
  const previousUrl = process.env.SUPABASE_URL
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  process.env.SUPABASE_URL = "http://127.0.0.1:9"
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only"
  __resetSupabaseParaTeste()
  const escritas: Escrita[] = []
  const response = (data: unknown) => new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } })
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input))
    const method = init?.method ?? "GET"
    if (url.hostname === "legis.senado.leg.br") {
      if (url.pathname.endsWith("/5718.json")) return response({ DetalheParlamentar: { Parlamentar: { IdentificacaoParlamentar: { NomeParlamentar: "Eliziane Gama", UfParlamentar: "MA" } } } })
      if (url.pathname.endsWith("/5718/mandatos.json")) return response(MANDATOS_5718)
      if (url.pathname.endsWith("/5718/autorias.json")) return response({})
      throw new Error(`Unexpected Senate request: ${url.pathname}`)
    }
    if (url.pathname.endsWith("/votacoes_chave")) return response([])
    if (url.pathname.endsWith("/candidatos")) {
      if (method === "PATCH") return response(null)
      if (url.searchParams.get("select")?.includes("verificacao_campos")) return response([{ slug: SLUG, verificacao_campos: null }])
      return response({ id: CANDIDATO_ID })
    }
    if (url.pathname.endsWith("/historico_politico")) {
      if (method === "GET") return response(existentes)
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>
      escritas.push({ method, id: url.searchParams.get("id")?.replace(/^eq\./, "") ?? null, body })
      return response(null)
    }
    throw new Error(`Unexpected database request: ${method} ${url.pathname}`)
  }
  try {
    const [receipt] = await withExplicitCohort([{
      slug: SLUG,
      nome_completo: "ELIZIANE PEREIRA GAMA MELO",
      nome_urna: "ELIZIANE GAMA",
      cargo_disputado: "Senador",
      estado: "MA",
      ids: { camara: null, senado: 5718, tse_sq_candidato: { "2026": "100002541459" } },
    }], () => ingestSenado())
    return { escritas, errors: receipt.errors }
  } finally {
    globalThis.fetch = previousFetch
    if (previousUrl === undefined) delete process.env.SUPABASE_URL
    else process.env.SUPABASE_URL = previousUrl
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey
    __resetSupabaseParaTeste()
  }
}

const linha2019 = { id: LINHA_2019, periodo_inicio: 2019, periodo_fim: 2024, partido: "", eleito_por: "voto direto", proveniencia: "senado", tipo_evento: "mandato" }

test("Senado: afastamento no meio do mandato grava um período por intervalo de exercício", async () => {
  const { escritas, errors } = await rodar([linha2019])
  assert.deepEqual(errors, [])
  assert.equal(escritas.length, 2)
  const [primeiro, segundo] = escritas
  assert.equal(primeiro.method, "PATCH")
  assert.equal(primeiro.id, LINHA_2019)
  assert.equal(primeiro.body.periodo_inicio, 2019)
  assert.equal(primeiro.body.periodo_fim, 2024)
  assert.equal(segundo.method, "POST")
  assert.equal(segundo.id, null)
  assert.equal(segundo.body.periodo_inicio, 2024)
  assert.equal(segundo.body.periodo_fim, null)
  assert.equal(segundo.body.cargo, "Senador")
  assert.equal(segundo.body.tipo_evento, "mandato")
  assert.equal(segundo.body.proveniencia, "senado")
  assert.equal(segundo.body.estado, "MA")
  assert.equal(segundo.body.candidato_id, CANDIDATO_ID)
})

test("Senado: período reaberto não sobrescreve linha de outra proveniência", async () => {
  const { escritas } = await rodar([linha2019, { id: "manual-2024", periodo_inicio: 2024, periodo_fim: null, partido: "PSD", eleito_por: null, proveniencia: "manual", tipo_evento: "mandato" }])
  assert.deepEqual(escritas.map((escrita) => [escrita.method, escrita.id]), [["PATCH", LINHA_2019]])
})

test("Senado: período reaberto com duas linhas no mesmo início fica pendente", async () => {
  const { escritas } = await rodar([
    linha2019,
    { id: "a-2024", periodo_inicio: 2024, periodo_fim: null, partido: "", eleito_por: null, proveniencia: "senado", tipo_evento: "mandato" },
    { id: "b-2024", periodo_inicio: 2024, periodo_fim: null, partido: "", eleito_por: null, proveniencia: null, tipo_evento: "mandato" },
  ])
  assert.deepEqual(escritas.map((escrita) => [escrita.method, escrita.id]), [["PATCH", LINHA_2019]])
})

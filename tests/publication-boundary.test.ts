import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { createClient } from "@supabase/supabase-js"
import { fetchMudancasPartidoRowsPaged } from "../src/lib/fetch-gastos-votos-in-batch"
import { isPublicAttentionPoint } from "../src/lib/public-attention-point"
import { countPartySwitches } from "../src/lib/party-switches"

test("ponto despublicado não é público mesmo visível, curado e verificado", () => {
  const ponto = { visivel: true, gerado_por: "curadoria" as const, verificado: true, gravidade: "baixa", fontes: [], despublicado_em: "2026-08-01T00:00:00Z" }
  assert.equal(isPublicAttentionPoint(ponto), false)
  assert.equal(isPublicAttentionPoint({ ...ponto, despublicado_em: null }), true)
  assert.equal(isPublicAttentionPoint({ ...ponto, despublicado_em: null, visivel: false }), false)
})

test("comparador solicita apenas trajetória publicada sem perder mudança válida", async () => {
  const rows = [
    { id: "valid", candidato_id: "candidate", partido_anterior: "PT", partido_novo: "PSB", ano: 2022, despublicado_em: null },
    { id: "quarantine", candidato_id: "candidate", partido_anterior: "PSB", partido_novo: "PSD", ano: 2024, despublicado_em: "2026-08-01" },
  ]
  const client = createClient("https://fixture.supabase.co", "fixture", { global: { fetch: async (input) => {
    const url = new URL(String(input))
    const data = url.searchParams.get("despublicado_em") === "is.null" ? rows.filter((row) => row.despublicado_em === null) : rows
    return new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } })
  } } })
  const result = await fetchMudancasPartidoRowsPaged(client, ["candidate"])
  assert.deepEqual(result.map((row) => row.id), ["valid"])
  assert.equal(countPartySwitches(result), 1)
})

test("consulta principal da ficha aplica despublicação antes de carregar pontos", () => {
  const api = readFileSync("src/lib/api.ts", "utf8")
  const query = api.slice(api.indexOf('withSupabaseRetry(`pontos_atencao('), api.indexOf('withSupabaseRetry(`projetos_lei('))
  assert.match(query, /\.is\("despublicado_em", null\)/)
})

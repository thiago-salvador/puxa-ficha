import assert from "node:assert/strict"
import test from "node:test"
import { ingestSenado, withinSenadoTextoUpdateCap } from "../scripts/lib/ingest-senado"
import { __resetSupabaseParaTeste } from "../scripts/lib/supabase"

// O Senado edita o texto de matérias já publicadas (ex.: a ementa de um
// requerimento reescrita). O upsert ignora conflito para nunca republicar
// tombstone, então a linha publicada precisa de UPDATE guardado; sem ele o
// readback recusava a matéria em toda rodada. Matérias e textos sintéticos.
const CANDIDATO_ID = "candidate-test"
const OLD_TEXT = "Requer a convocação, perante o Plenário, de autoridade fixture, para prestar informações sobre tema A."
const NEW_TEXT = "Requer a convocação para prestar informações, perante o Plenário, de autoridade fixture, sobre tema A."

type Row = Record<string, unknown>

function storedRow(matterId: string, ementa: string, despublicado_em: string | null = null): Row {
  return {
    id: `row-${matterId}`, candidato_id: CANDIDATO_ID, fonte: "Senado", proposicao_id_api: matterId,
    tipo: "RQS", numero: matterId.slice(-2), ano: 2024, ementa, despublicado_em, despublicacao_motivo: despublicado_em ? "curadoria" : null,
  }
}

function autoria(matterId: string, ementa: string) {
  return { IndicadorAutorPrincipal: "Sim", Materia: { Codigo: matterId, Sigla: "RQS", Numero: matterId.slice(-2), Ano: 2024, Ementa: ementa } }
}

const FILTER_COLUMNS = new Set(["id", "candidato_id", "fonte", "proposicao_id_api", "tipo", "numero", "ano", "ementa", "despublicado_em"])

// Avaliador mínimo dos filtros PostgREST usados pelo writer.
function matches(row: Row, params: URLSearchParams): boolean {
  for (const [column, raw] of params) {
    if (!FILTER_COLUMNS.has(column)) continue
    const value = row[column]
    if (raw === "is.null") { if (value != null) return false; continue }
    if (raw === "not.is.null") { if (value == null) return false; continue }
    if (raw.startsWith("eq.")) { if (value == null || String(value) !== raw.slice(3)) return false; continue }
    if (raw.startsWith("in.(")) {
      const list = raw.slice(4, -1).split(",").map((item) => item.replace(/^"|"$/g, ""))
      if (value == null || !list.includes(String(value))) return false
      continue
    }
    throw new Error(`filtro não suportado no teste: ${column}=${raw}`)
  }
  return true
}

async function runIngest(input: {
  stored: Row[]
  autorias: ReturnType<typeof autoria>[]
  beforePatch?: (store: Row[]) => void
}) {
  const previousFetch = globalThis.fetch
  const previousUrl = process.env.SUPABASE_URL
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  process.env.SUPABASE_URL = "http://127.0.0.1:9"
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only"
  __resetSupabaseParaTeste()
  const store = input.stored.map((row) => ({ ...row }))
  const patches: Array<{ params: URLSearchParams; body: Row }> = []
  const posts: Row[][] = []
  const response = (data: unknown) => new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } })
  globalThis.fetch = async (request, init) => {
    const url = new URL(String(request))
    const method = init?.method ?? "GET"
    if (url.hostname === "legis.senado.leg.br") {
      if (url.pathname.endsWith("/635.json")) return response({ DetalheParlamentar: { Parlamentar: { IdentificacaoParlamentar: { NomeParlamentar: "Ricardo Ferraco", UfParlamentar: "ES" } } } })
      if (url.pathname.endsWith("/mandatos.json")) return response({})
      if (url.pathname.endsWith("/autorias.json")) return response({ MateriasAutoriaParlamentar: { Parlamentar: { Codigo: "635", Autorias: { Autoria: input.autorias } } } })
      throw new Error(`Unexpected Senate request: ${url.pathname}`)
    }
    if (url.pathname.endsWith("/candidaturas_fase_2026_publico")) return new Response(JSON.stringify({ code: "PGRST205", message: "Could not find the table candidaturas_fase_2026_publico in the schema cache" }), { status: 404 })
    if (url.pathname.endsWith("/candidatos_publico")) return response([{ slug: "ricardo-ferraco" }])
    if (url.pathname.endsWith("/votacoes_chave")) return response([])
    if (url.pathname.endsWith("/candidatos")) {
      if (method === "PATCH") return response(null)
      if (url.searchParams.get("select")?.includes("verificacao_campos")) return response([{ slug: "ricardo-ferraco", verificacao_campos: null }])
      return response({ id: CANDIDATO_ID })
    }
    if (url.pathname.endsWith("/coleta_log")) return response(method === "POST" ? null : [{ id: "audit-log" }])
    if (url.pathname.endsWith("/projetos_lei")) {
      if (method === "GET") return response(store.filter((row) => matches(row, url.searchParams)))
      const body = JSON.parse(String(init?.body ?? "{}")) as Row | Row[]
      if (method === "PATCH") {
        input.beforePatch?.(store)
        patches.push({ params: url.searchParams, body: body as Row })
        const hit = store.filter((row) => matches(row, url.searchParams))
        for (const row of hit) Object.assign(row, body)
        return response(hit.map((row) => ({ id: row.id })))
      }
      if (method === "POST") {
        assert.match(new Headers(init?.headers).get("Prefer") ?? "", /resolution=ignore-duplicates/)
        const batch = Array.isArray(body) ? body : [body]
        posts.push(batch)
        // ON CONFLICT (candidato_id, fonte, proposicao_id_api) DO NOTHING.
        const inserted = batch.filter((row) => !store.some((existing) => existing.candidato_id === row.candidato_id
          && existing.fonte === row.fonte && existing.proposicao_id_api === row.proposicao_id_api))
          .map((row) => ({ id: `row-${String(row.proposicao_id_api)}`, ...row }))
        store.push(...inserted)
        return response(inserted)
      }
    }
    throw new Error(`Unexpected database request: ${method} ${url.pathname}`)
  }
  try {
    const [receipt] = await ingestSenado({ targetSlugs: ["ricardo-ferraco"], forceFrozen: true })
    return { receipt: receipt!, store, patches, posts }
  } finally {
    globalThis.fetch = previousFetch
    if (previousUrl === undefined) delete process.env.SUPABASE_URL
    else process.env.SUPABASE_URL = previousUrl
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey
    __resetSupabaseParaTeste()
  }
}

test("Senado: ementa editada na fonte atualiza a linha publicada e o readback confirma", async () => {
  const { receipt, store, patches } = await runIngest({
    stored: [storedRow("900107", OLD_TEXT), storedRow("900108", "Texto inalterado.")],
    autorias: [autoria("900107", NEW_TEXT), autoria("900108", "Texto inalterado.")],
  })
  assert.deepEqual(receipt.errors, [])
  assert.equal(patches.length, 1, "só a matéria com texto divergente é atualizada")
  const [patch] = patches
  assert.deepEqual(patch!.body, { tipo: "RQS", numero: "07", ano: 2024, ementa: NEW_TEXT })
  assert.equal(patch!.params.get("despublicado_em"), "is.null")
  assert.equal(patch!.params.get("ementa"), `eq.${OLD_TEXT}`, "concorrência otimista sobre o texto antigo")
  assert.equal(patch!.params.get("proposicao_id_api"), "eq.900107")
  const row = store.find((item) => item.proposicao_id_api === "900107")!
  assert.equal(row.ementa, NEW_TEXT)
  assert.equal(row.despublicado_em, null)
  assert.ok(receipt.tables_updated.includes("projetos_lei"))
})

test("Senado: tombstone com ementa editada na fonte não é atualizado nem republicado", async () => {
  const { receipt, store, patches, posts } = await runIngest({
    stored: [storedRow("900107", OLD_TEXT, "2026-09-01T00:00:00Z")],
    autorias: [autoria("900107", NEW_TEXT)],
  })
  assert.deepEqual(receipt.errors, [])
  assert.equal(patches.length, 0)
  assert.equal(posts.flat().some((row) => row.proposicao_id_api === "900107"), false)
  const row = store.find((item) => item.proposicao_id_api === "900107")!
  assert.equal(row.ementa, OLD_TEXT)
  assert.equal(row.despublicado_em, "2026-09-01T00:00:00Z")
})

test("Senado: teto recusa reescrita em massa do acervo publicado", async () => {
  const ids = Array.from({ length: 10 }, (_, i) => String(900200 + i))
  const { receipt, store, patches } = await runIngest({
    stored: ids.map((id) => storedRow(id, `${OLD_TEXT} ${id}`)),
    autorias: ids.map((id) => autoria(id, `${NEW_TEXT} ${id}`)),
  })
  assert.equal(patches.length, 0, "nenhuma linha atualizada acima do teto")
  assert.match(receipt.errors.join(" "), /teto de reescrita de texto excedido: 10 de 10/)
  assert.doesNotMatch(receipt.errors.join(" "), /readback ausente/)
  assert.ok(store.every((row) => String(row.ementa).startsWith(OLD_TEXT)))
})

test("Senado: atualização que não casa com a linha publicada fica em revisão com erro explícito", async () => {
  const { receipt, store, patches } = await runIngest({
    stored: [storedRow("900107", OLD_TEXT)],
    autorias: [autoria("900107", NEW_TEXT)],
    // Curadoria despublica a linha entre a leitura e o UPDATE.
    beforePatch: (rows) => { rows[0]!.despublicado_em = "2026-09-30T00:00:00Z" },
  })
  assert.equal(patches.length, 1)
  assert.match(receipt.errors.join(" "), /proposição 900107: atualização de texto não casou com a linha publicada/)
  assert.doesNotMatch(receipt.errors.join(" "), /readback ausente/)
  assert.equal(store[0]!.ementa, OLD_TEXT)
  assert.equal(store[0]!.despublicado_em, "2026-09-30T00:00:00Z")
})

test("Senado: teto de reescrita de texto por candidato", () => {
  assert.equal(withinSenadoTextoUpdateCap(1, 1), true)
  assert.equal(withinSenadoTextoUpdateCap(3, 3), true)
  assert.equal(withinSenadoTextoUpdateCap(4, 10), false)
  assert.equal(withinSenadoTextoUpdateCap(10, 100), true)
  assert.equal(withinSenadoTextoUpdateCap(11, 100), false)
  assert.equal(withinSenadoTextoUpdateCap(50, 5000), true)
  assert.equal(withinSenadoTextoUpdateCap(51, 5000), false)
})

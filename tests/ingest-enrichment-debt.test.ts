import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { enrichWikipedia, type EnrichWikipediaDependencies } from "../scripts/lib/enrich-wikipedia"
import { queryWikidataById } from "../scripts/lib/ingest-wikidata"
import { fetchPartyMemberships, fetchOffices } from "../scripts/lib/ingest-wikidata-politico"

const candidate = {
  slug: "teste-enriquecimento", nome_completo: "Teste", nome_urna: "Teste",
  cargo_disputado: "Governador" as const, estado: "SP", wikipedia_title: "Teste",
  ids: { camara: null, senado: null, tse_sq_candidato: {} },
}
const complete = {
  id: "test-id", foto_url: "foto-local", data_nascimento: "1980-02-03",
  naturalidade: "Cidade", formacao: "Superior completo", formacao_instituicao: "Instituição",
  biografia: "Biografia existente", redes_sociais: { instagram: { username: "curado", followers: 100 } },
  wikidata_id: "Q123",
}
const page = (qid = "Q123", photo?: string) => ({ query: { pages: { "1": {
  title: "Teste", pageprops: { wikibase_item: qid }, ...(photo ? { thumbnail: { source: photo } } : {}),
} } } })

async function run(options: {
  response?: unknown; noTitle?: boolean; row?: Record<string, unknown>;
  readError?: string; writeError?: string;
} = {}) {
  const writes: Record<string, unknown>[] = []
  let fetchCalls = 0
  const database = { from: () => ({
    select: () => ({ eq: () => ({ single: async () => ({
      data: options.row ?? complete,
      error: options.readError ? { message: options.readError } : null,
    }) }) }),
    update: (payload: Record<string, unknown>) => {
      writes.push(payload)
      return { eq: async () => ({ error: options.writeError ? { message: options.writeError } : null }) }
    },
  }) } as unknown as EnrichWikipediaDependencies["database"]
  const [result] = await enrichWikipedia({
    database,
    loadCandidates: async () => [{ ...candidate, wikipedia_title: options.noTitle ? undefined : "Teste" }],
    fetchJson: async <T>() => {
      fetchCalls++
      if (options.response instanceof Error) throw options.response
      return (options.response ?? page()) as T
    },
    wait: async () => {},
  })
  return { result, writes, fetchCalls }
}

describe("dívida de enriquecimento: desfecho integrado e identidade", () => {
  it("Wikipedia existente sem alterações declara encontrado com zero escritas", async () => {
    const { result, writes } = await run()
    assert.equal(result.coleta_resultado, "encontrado")
    assert.equal(result.coleta_volume, 1)
    assert.equal(result.rows_upserted, 0)
    assert.deepEqual(writes, [])
  })
  it("sem título é não aplicável sem consulta, sem inventar identificador", async () => {
    const { result, writes, fetchCalls } = await run({ noTitle: true })
    assert.equal(result.coleta_resultado, "nao_aplicavel")
    assert.equal(fetchCalls, 0)
    assert.deepEqual(writes, [])
  })
  it("ausência explícita é vazio confirmado, acesso/schema quebrado é erro", async () => {
    const missing = await run({ response: { query: { pages: { "-1": { title: "Teste", missing: "" } } } } })
    assert.equal(missing.result.coleta_resultado, "vazio_confirmado")
    for (const response of [new Error("HTTP 403"), { query: {} }, page("Q0")]) {
      const { result, writes } = await run({ response })
      assert.equal(result.coleta_resultado, "erro")
      assert.deepEqual(writes, [])
    }
  })
  it("QID divergente recusa foto e dados de outra identidade", async () => {
    const { result, writes, fetchCalls } = await run({ response: page("Q999", "foto-outra-pessoa") })
    assert.equal(result.coleta_resultado, "erro")
    assert.match(result.coleta_detalhe ?? "", /diverge/)
    assert.equal(fetchCalls, 1)
    assert.deepEqual(writes, [])
  })
  it("QID coincidente permite foto sem alterar dados e redes já curados", async () => {
    const { result, writes } = await run({ response: page("Q123", "foto-fonte") })
    assert.equal(result.coleta_resultado, "encontrado")
    assert.equal(result.rows_upserted, 1)
    assert.equal(writes[0].foto_url, "foto-fonte")
    assert.deepEqual(Object.keys(writes[0]).sort(), ["foto_url", "ultima_atualizacao"])
  })
  it("falha de leitura ou escrita nunca vira ausência nem sucesso", async () => {
    const read = await run({ readError: "leitura recusada" })
    assert.equal(read.result.coleta_resultado, "erro")
    assert.equal(read.fetchCalls, 0)
    const write = await run({ response: page("Q123", "foto-fonte"), writeError: "escrita recusada" })
    assert.equal(write.result.coleta_resultado, "erro")
    assert.equal(write.result.rows_upserted, 0)
    assert.equal(write.writes.length, 1)
  })
  it("SPARQL não aceita uma entidade diferente do QID solicitado", async () => {
    await assert.rejects(queryWikidataById("Q123", async <T>() => ({ results: { bindings: [
      { item: { value: "http://www.wikidata.org/entity/Q999" }, instagram: { value: "outra_pessoa" } },
    ] } }) as T), /QID diferente/)
  })
  it("histórico e filiação sem datas preservam linhas da fonte sem inventar datas", async () => {
    const parties = await fetchPartyMemberships("Q123", async <T>() => ({ results: { bindings: [
      { party: { value: "http://www.wikidata.org/entity/Q1" }, partyLabel: { value: "Partido" } },
    ] } }) as T)
    const offices = await fetchOffices("Q123", async <T>() => ({ results: { bindings: [
      { office: { value: "http://www.wikidata.org/entity/Q2" }, officeLabel: { value: "Governador" } },
    ] } }) as T)
    assert.equal(parties.sourceRows, 1)
    assert.equal(offices.sourceRows, 1)
    assert.equal(parties.items[0].startDate, null)
    assert.equal(offices.items[0].startDate, null)
  })
})

import "./helpers/server-only"
import assert from "node:assert/strict"
import test from "node:test"
import { GET } from "../src/app/api/imprensa/export/route"
import { __setImprensaDataDependenciesForTests } from "../src/lib/imprensa-data"

test("falha da fonte devolve 503 sem revelar detalhes da consulta", async () => {
  __setImprensaDataDependenciesForTests({ loadSlugs: async () => { throw new Error("segredo-interno-da-fonte") } })
  try {
    const response = await GET(new Request("https://example.org/api/imprensa/export?format=json"))
    assert.equal(response.status, 503)
    assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/)
    const body = await response.json()
    assert.equal(body.error, "fonte_indisponivel")
    assert.doesNotMatch(JSON.stringify(body), /segredo-interno-da-fonte/)
  } finally {
    __setImprensaDataDependenciesForTests(null)
  }
})

test("recorte acima do limite devolve 413", async () => {
  __setImprensaDataDependenciesForTests({
    loadSlugs: async () => [{ slug: "candidato" }],
    loadCandidates: async () => [{ id: "1", slug: "candidato", nome_urna: "A".repeat(4 * 1024 * 1024 + 1), cargo_disputado: "Governador", estado: "SP", partido_sigla: "ABC" }],
    loadProcesses: async () => [],
    loadChapas: async () => [],
    loadSites: async () => null,
  })
  try {
    const response = await GET(new Request("https://example.org/api/imprensa/export?format=json"))
    assert.equal(response.status, 413)
    assert.equal((await response.json()).error, "export_muito_grande")
  } finally {
    __setImprensaDataDependenciesForTests(null)
  }
})

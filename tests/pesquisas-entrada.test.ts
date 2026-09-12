import "./helpers/server-only"
import assert from "node:assert/strict"
import test from "node:test"
import { validarEntradasDescobertas } from "../scripts/lib/pesquisas-monitoramento-entrada"
import { criarClienteHttpMonitoramento } from "../scripts/lib/pesquisas-monitoramento-rede"
import type { ObservacaoPesqele } from "../scripts/lib/pesquisas-monitoramento-pesqele"
import type { ObservacaoListagemPesquisas } from "../scripts/lib/pesquisas-monitoramento-descoberta"

const observation: ObservacaoPesqele = {
  registry: { registration_id: "BR-07561/2026", office: "Presidente", geography: "BRASIL", field_start: "2026-08-30", field_end: "2026-09-02", sample_size: 3000, margin_error_pp: 2, institute: "PoderData" },
  confidence_percent: 95, method: "telefone", publication_date: "2026-09-03", source_url: "https://pesqele-divulgacao.tse.jus.br/app/pesquisa/listar.xhtml", observed_at: "2026-09-09T12:00:00Z", public_text: "Registro público", evidence_sha256: "a".repeat(64),
}
const listing = (urls: string[]): ObservacaoListagemPesquisas[] => [{ id: "poderdata", url: "https://www.poder360.com.br/poderdata/", observed_at: observation.observed_at, status: "observed", evidence_sha256: "b".repeat(64), error: null, links: urls.map((url) => ({ url, title: "Pesquisa de intenção de voto", listing_id: "poderdata", geography_hint: "BR", office_hint: "Presidente", state: "pending_validation" })) }]
const client = (html = "<p>BR-07561/2026</p>") => criarClienteHttpMonitoramento({ allowedOrigins: ["https://www.poder360.com.br"], minIntervalMs: 0, fetchImpl: async (url) => new Response(String(url).endsWith("robots.txt") ? "User-agent: *\nAllow: /" : html), sleep: async () => {} })

test("entrada cria alvo de registro novo e conserva publicações complementares sem duplicar pesquisa", async () => {
  let queries = 0
  const result = await validarEntradasDescobertas({ observations: listing(["https://www.poder360.com.br/poderdata/primeira/", "https://www.poder360.com.br/poderdata/segunda/"]), knownTargets: [], client: client(), queryRegistry: async () => { queries++; return observation } })
  assert.equal(result.targets.length, 1)
  assert.equal(queries, 1)
  assert.equal(result.targets[0].registration_id, "BR-07561/2026")
  assert.equal(result.targets[0].geography_code, "BR")
  assert.deepEqual(result.targets[0].alternative_urls, ["https://www.poder360.com.br/poderdata/segunda/"])
  assert.deepEqual(result.entries.map((entry) => entry.status), ["target_validated", "duplicate_registration"])
})

const publication = (id = "BR-07561/2026") => `<html><head><meta property="article:published_time" content="2026-09-03T10:00:00Z"></head><body><article><h1>PoderData divulga pesquisa de intenção de voto para presidente</h1><p>A pesquisa PoderData ouviu eleitores de todo o Brasil sobre a eleição presidencial. O levantamento apresenta as intenções de voto e está registrado sob o número ${id}. Os resultados e os dados metodológicos acompanham a publicação do instituto.</p></article></body></html>`

test("curadoria observada preserva bloqueio editorial sem falha operacional", async () => {
  const input = { observations: listing(["https://www.poder360.com.br/poderdata/teste/"]), knownTargets: [], client: client(publication()) }
  const conflict = await validarEntradasDescobertas({ ...input, queryRegistry: async () => ({ ...observation, registry: { ...observation.registry, office: "Senador" } }) })
  assert.equal(conflict.entries[0].status, "blocked")
  assert.equal(conflict.entries[0].execution_status, "complete")
  assert.match(conflict.entries[0].reason, /cargo/)
  const noId = await validarEntradasDescobertas({ ...input, client: client(publication("pendente")), queryRegistry: async () => { throw new Error("não deve consultar") } })
  assert.equal(noId.entries[0].classification, "discovery_exception")
  assert.equal(noId.entries[0].execution_status, "complete")
})

test("bloqueio HTTP 200, timeout e registro errado permanecem falhas operacionais", async () => {
  const input = { observations: listing(["https://www.poder360.com.br/poderdata/teste/"]), knownTargets: [] }
  const challenge = await validarEntradasDescobertas({ ...input, client: client("<h1>Verifique que você é humano</h1>"), queryRegistry: async () => observation })
  assert.equal(challenge.entries[0].execution_status, "failed")
  const timeout = await validarEntradasDescobertas({ ...input, client: client(publication()), queryRegistry: async () => { throw new Error("timeout") } })
  assert.equal(timeout.entries[0].execution_status, "failed")
  const wrongId = await validarEntradasDescobertas({ ...input, client: client(publication()), queryRegistry: async () => ({ ...observation, registry: { ...observation.registry, registration_id: "BR-99999/2026" } }) })
  assert.equal(wrongId.entries[0].execution_status, "failed")
})

test("entrada bloqueia destino externo antes da rede e não transforma pesquisa regional em nacional", async () => {
  let queries = 0
  const external = await validarEntradasDescobertas({ observations: listing(["https://example.com/poderdata/teste/"]), knownTargets: [], client: client(), queryRegistry: async () => { queries++; return observation } })
  assert.equal(external.targets.length, 0)
  assert.equal(queries, 0)
  const regional = await validarEntradasDescobertas({ observations: listing(["https://www.poder360.com.br/poderdata/teste/"]), knownTargets: [], client: client(), queryRegistry: async () => ({ ...observation, registry: { ...observation.registry, geography: "BAHIA" } }) })
  assert.equal(regional.targets.length, 0)
  assert.equal(regional.entries[0].status, "blocked")
})

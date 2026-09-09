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
const client = () => criarClienteHttpMonitoramento({ allowedOrigins: ["https://www.poder360.com.br"], minIntervalMs: 0, fetchImpl: async (url) => new Response(String(url).endsWith("robots.txt") ? "User-agent: *\nAllow: /" : "<p>BR-07561/2026</p>"), sleep: async () => {} })

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

test("entrada bloqueia destino externo antes da rede e não transforma pesquisa regional em nacional", async () => {
  let queries = 0
  const external = await validarEntradasDescobertas({ observations: listing(["https://example.com/poderdata/teste/"]), knownTargets: [], client: client(), queryRegistry: async () => { queries++; return observation } })
  assert.equal(external.targets.length, 0)
  assert.equal(queries, 0)
  const regional = await validarEntradasDescobertas({ observations: listing(["https://www.poder360.com.br/poderdata/teste/"]), knownTargets: [], client: client(), queryRegistry: async () => ({ ...observation, registry: { ...observation.registry, geography: "BAHIA" } }) })
  assert.equal(regional.targets.length, 0)
  assert.equal(regional.entries[0].status, "blocked")
})

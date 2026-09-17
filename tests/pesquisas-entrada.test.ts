import "./helpers/server-only"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
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

const br04029Receipt = JSON.parse(readFileSync(resolve("tests/fixtures/pesquisas-monitoramento/pesqele-br-04029-receipt.json"), "utf8")) as {
  generated_at: string
  registry: ObservacaoPesqele[]
}
const br04029 = br04029Receipt.registry.find((value) => value.registry.registration_id === "BR-04029/2026")!
const br04029Url = "https://www1.folha.uol.com.br/poder/2026/09/datafolha-divulga-nova-pesquisa-presidencial-nesta-quinta-17-live-comenta-resultados.shtml"
const br04029Listing: ObservacaoListagemPesquisas[] = [{
  id: "folha-poder", url: "https://www1.folha.uol.com.br/poder/", observed_at: "2026-09-17T17:55:00Z", status: "observed", evidence_sha256: "b".repeat(64), error: null,
  links: [{ url: br04029Url, title: "Datafolha divulga pesquisa presidencial", listing_id: "folha-poder", geography_hint: "BR", office_hint: "Presidente", state: "pending_validation" }],
}]
const br04029Article = `<article><h1>Datafolha divulga nova pesquisa presidencial</h1><time datetime="2026-09-17">17/09/2026</time><p>Datafolha publicou pesquisa de intenção de voto para Presidente no Brasil, registrada no PesqEle sob BR-04029/2026. A matéria apresenta os resultados da pesquisa eleitoral e informa o contexto da disputa nacional para os eleitores.</p></article>`
const br04029Client = criarClienteHttpMonitoramento({ allowedOrigins: ["https://www1.folha.uol.com.br"], minIntervalMs: 0, fetchImpl: async (url) => new Response(String(url).endsWith("robots.txt") ? "User-agent: *\nAllow: /" : br04029Article), sleep: async () => {} })

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

test("entrada preserva BR-04029 no manifesto real de oito recibos sem nova consulta", async () => {
  assert.equal(br04029Receipt.registry.length, 8)
  let queries = 0
  const result = await validarEntradasDescobertas({
    observations: br04029Listing, knownTargets: [], client: br04029Client,
    registryCache: br04029Receipt.registry, registryCacheGeneratedAt: br04029Receipt.generated_at,
    now: new Date("2026-09-17T18:00:00Z"), sourceId: "datafolha-folha-globo-nacional-2026", uf: "BR",
    queryRegistry: async () => { queries++; throw new Error("consulta TSE não deveria ocorrer") },
  })
  assert.equal(queries, 0)
  assert.equal(result.targets.length, 1)
  assert.equal(result.targets[0].poll_id, "datafolha-folha-globo-nacional-br-04029-2026")
  assert.equal(result.targets[0].registration_id, "BR-04029/2026")
  assert.equal(result.entries[0].status, "target_validated")
  assert.equal(result.entries[0].registry_sha256, br04029.evidence_sha256)
})

test("recibo PesqEle inválido recorre à fonte ao vivo e falha fechado sem ela", async () => {
  const invalid = [
    ["hash", (value: ObservacaoPesqele) => ({ ...value, evidence_sha256: "0".repeat(64) })],
    ["id", (value: ObservacaoPesqele) => ({ ...value, registry: { ...value.registry, registration_id: "BR-99999/2026" } })],
    ["escopo", (value: ObservacaoPesqele) => ({ ...value, registry: { ...value.registry, office: "Senador" } })],
    ["geografia", (value: ObservacaoPesqele) => ({ ...value, registry: { ...value.registry, geography: "SÃO PAULO" } })],
    ["instituto", (value: ObservacaoPesqele) => ({ ...value, registry: { ...value.registry, institute: "PoderData" } })],
    ["amostra", (value: ObservacaoPesqele) => ({ ...value, registry: { ...value.registry, sample_size: 2001 } })],
    ["amostra-prefixo", (value: ObservacaoPesqele) => ({ ...value, registry: { ...value.registry, sample_size: Math.floor(value.registry.sample_size / 10) } })],
    ["metodo", (value: ObservacaoPesqele) => ({ ...value, method: "telefone" })],
    ["metodo-prefixo", (value: ObservacaoPesqele) => ({ ...value, method: value.method.slice(0, 8) })],
    ["confianca-sufixo", (value: ObservacaoPesqele) => ({ ...value, confidence_percent: 5 })],
    ["margem-ausente", (value: ObservacaoPesqele) => ({ ...value, registry: { ...value.registry, margin_error_pp: null } })],
    ["data-invalida", (value: ObservacaoPesqele) => ({ ...value, registry: { ...value.registry, field_start: "2026-99-99" } })],
    ["timestamp-futuro", (value: ObservacaoPesqele) => ({ ...value, observed_at: "2026-09-17T20:01:00Z" })],
    ["timestamp-invalido", (value: ObservacaoPesqele) => ({ ...value, observed_at: "invalido" })],
    ["timestamp-stale", (value: ObservacaoPesqele) => ({ ...value, observed_at: "2026-09-17T15:00:00Z" })],
    ["duplicata", (value: ObservacaoPesqele) => [value, value]],
    ["duplicata-invalida-depois", (value: ObservacaoPesqele) => [value, { ...value, registry: { ...value.registry, sample_size: value.registry.sample_size + 1 } }]],
    ["duplicata-invalida-antes", (value: ObservacaoPesqele) => [{ ...value, registry: { ...value.registry, sample_size: value.registry.sample_size + 1 } }, value]],
  ] as const
  for (const [name, mutate] of invalid) {
    let queries = 0
    const cache = Array.isArray(mutate(br04029)) ? mutate(br04029) as ObservacaoPesqele[] : [mutate(br04029) as ObservacaoPesqele]
    const recovered = await validarEntradasDescobertas({
      observations: br04029Listing, knownTargets: [], client: br04029Client, registryCache: cache,
      registryCacheGeneratedAt: br04029Receipt.generated_at, now: new Date("2026-09-17T18:00:00Z"),
      queryRegistry: async () => { queries++; return br04029 },
    })
    assert.equal(queries, 1, name)
    assert.equal(recovered.targets.length, 1, name)
    let failedQueries = 0
    const failed = await validarEntradasDescobertas({
      observations: br04029Listing, knownTargets: [], client: br04029Client, registryCache: cache,
      registryCacheGeneratedAt: br04029Receipt.generated_at, now: new Date("2026-09-17T18:00:00Z"),
      queryRegistry: async () => { failedQueries++; throw new Error("TSE indisponível") },
    })
    assert.equal(failedQueries, 1, name)
    assert.equal(failed.targets.length, 0, name)
    assert.equal(failed.entries[0].execution_status, "failed", name)
  }
  for (const generatedAt of ["invalido", "2026-09-17T15:00:00Z"]) {
    let queries = 0
    const recovered = await validarEntradasDescobertas({
      observations: br04029Listing, knownTargets: [], client: br04029Client, registryCache: [br04029],
      registryCacheGeneratedAt: generatedAt, now: new Date("2026-09-17T18:00:00Z"),
      queryRegistry: async () => { queries++; return br04029 },
    })
    assert.equal(queries, 1, generatedAt)
    assert.equal(recovered.targets.length, 1, generatedAt)
  }
})

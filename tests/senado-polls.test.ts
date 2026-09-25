import "./helpers/server-only"
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { describe, it } from "node:test"
import type { ErroValidacaoPesquisasEleitorais as ErroValidacaoExport } from "@/lib/pesquisas-eleitorais"
import {
  carregarPesquisasSenado,
  loadSenadoPolls,
  parseSenadoPesquisasJson,
  selecionarSenadoPolls,
} from "../src/lib/senado-polls"

const require = createRequire(import.meta.url)
const { selecionarRegistroPublicado } = require("../scripts/lib/pesquisas-monitoramento-adapters") as typeof import("../scripts/lib/pesquisas-monitoramento-adapters")
const { groupPollSeries } = require("../src/lib/poll-series") as typeof import("../src/lib/poll-series")
const { ErroValidacaoPesquisasEleitorais } = require("../src/lib/pesquisas-eleitorais") as {
  ErroValidacaoPesquisasEleitorais: typeof ErroValidacaoExport
}

const UFS = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"]

function fontes(status: "aprovado" | "condicional" = "aprovado") {
  return {
    schema_version: "1.0.0",
    scope: { election_year: 2026, office: "senador" },
    preferred_source_ids: status === "aprovado" ? ["fonte-fixture"] : [],
    sources: [{
      id: "fonte-fixture", status,
      roles: { institute: "Instituto fixture" },
      representative_poll: {
        field_period: { start: "2026-08-01", end: "2026-08-02" },
        published_at: "2026-08-03", sample_size: 1000,
        method: "entrevistas presenciais", margin_of_error_pp: 3,
        confidence_level_pct: 95, office: "Senador", geography: "São Paulo", rounds: [1],
        registration_id: "SP-01234/2026", result_url: "https://example.test/pesquisa", registry_url: "https://example.test/registro",
      },
    }],
  }
}

function pesquisa(overrides: Record<string, unknown> = {}) {
  return {
    id: "fixture-senado-sp", source_id: "fonte-fixture", source_status: "aprovado", publishable_by_default: true, state: "publicado",
    instituto: { value: "Instituto fixture", status: "publicado" }, contratante: { value: "Contratante fixture", status: "publicado" },
    fieldwork: { start: { value: "2026-08-01", status: "publicado" }, end: { value: "2026-08-02", status: "publicado" } },
    publication_date: { value: "2026-08-03", status: "publicado" },
    sample: { size: { value: 1000, status: "publicado" }, population: { value: "eleitores de São Paulo", status: "publicado" } },
    margin_error_pp: { value: 3, status: "publicado" }, confidence_percent: { value: 95, status: "publicado" },
    method: { value: "entrevistas presenciais", status: "publicado" },
    registration: { code: { value: "SP-01234/2026", status: "publicado" }, url: { value: "https://example.test/registro", status: "publicado" } },
    geography: { type: "estado", label: "São Paulo", code: "SP" }, office: "Senador",
    provenance: { result_url: "https://example.test/pesquisa", supporting_urls: [], source_kind: "fixture", route_class: "primary", route_reason: "fixture sintética", consulted_at: "2026-08-04T00:00:00Z", capture: { format: "text", sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", status: "publicado" } },
    cenarios: [{ id: "fixture-primeiro-voto", turn: 1, geography: "São Paulo", label_raw: "Primeiro voto", question: { value: "Se a eleição fosse hoje, em quem votaria para senador?", status: "publicado" }, comparability_key: "2026|Senador|SP|1|primeiro-voto|fixture|eleitores", resultados: [{ raw_label: "Candidato sintético", candidate_slug: null, match_status: "indeterminado", value_percent: 40, status: "publicado" }] }],
    ...overrides,
  }
}

function dataset(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: "1.0.0", election_scope: { year: 2026, office: "Senador", geography: "São Paulo" }, alias_scope: { year: 2026, office: "Senador", geography: "São Paulo" },
    publication_scope: { election_year: 2026, office: "Senador", geography_code: "SP", turn: 1, comparability_key: "2026|Senador|SP|1|primeiro-voto|fixture|eleitores" }, exact_aliases_version: "fixture", exact_aliases: [], pesquisas: [pesquisa()], ...overrides,
  }
}

function parse(value: Record<string, unknown> = {}, source = fontes()) {
  return parseSenadoPesquisasJson(JSON.stringify(dataset(value)), JSON.stringify(source), "SP")
}

function rejects(run: () => unknown, pattern: RegExp) {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof ErroValidacaoPesquisasEleitorais)
    assert.match(error.message, pattern)
    return true
  })
}

describe("catálogo e loader de pesquisas do Senado", () => {
  it("declara as 27 UFs explicitamente e só publica rodada com registro da própria UF", () => {
    const catalogs = carregarPesquisasSenado()
    assert.deepEqual([...catalogs.keys()].sort(), UFS.sort())
    assert.equal(catalogs.size, 27)
    for (const uf of UFS) {
      for (const poll of loadSenadoPolls(uf)) {
        assert.equal(poll.office, "Senador")
        assert.match(poll.registration.code.value ?? "", new RegExp(`^${uf}-\\d{5}/2026$`), `${poll.id} registro da UF`)
        assert.ok(poll.provenance.resultUrl.startsWith("https://"), `${poll.id} com URL de resultado`)
      }
    }
    assert.deepEqual(loadSenadoPolls("invalid"), [])
  })

  it("seleciona cenário Senado com fonte aprovada, registro e metodologia publicados", () => {
    const catalog = parse()
    const selected = selecionarSenadoPolls(catalog, "sp")
    assert.equal(selected.length, 1)
    assert.equal(selected[0].office, "Senador")
    assert.equal(selected[0].scenario.comparabilityKey.split("|")[4], "primeiro-voto")
    assert.equal(selected[0].method.value, "entrevistas presenciais")
  })

  it("mantém primeiro voto, segundo voto e agregado separados e não junta enunciados distintos", () => {
    const base = pesquisa()
    const first = base.cenarios[0]
    const second = { ...first, id: "fixture-segundo-voto", label_raw: "Segundo voto", comparability_key: first.comparability_key.replace("primeiro-voto", "segundo-voto"), question: { value: "E para o segundo voto, em quem votaria?", status: "publicado" } }
    const aggregate = { ...first, id: "fixture-agregado", label_raw: "Agregado", comparability_key: first.comparability_key.replace("primeiro-voto", "agregado"), question: { value: "Em quem votaria para senador?", status: "publicado" } }
    const sameKeyDifferentQuestion = { ...first, id: "fixture-primeiro-voto-outra-pergunta", question: { value: "Qual seria sua primeira escolha?", status: "publicado" } }
    const catalog = parse({ pesquisas: [pesquisa({ cenarios: [first, second, aggregate, sameKeyDifferentQuestion] })] })
    const selected = selecionarSenadoPolls(catalog, "SP")
    assert.deepEqual(selected.map((poll) => poll.scenario.comparabilityKey.split("|")[4]).sort(), ["agregado", "primeiro-voto", "primeiro-voto", "segundo-voto"])
    assert.equal(groupPollSeries(selected).length, 4)
  })

  it("rejeita ano, cargo, UF, segundo turno e medida incompatíveis", () => {
    rejects(() => parse({ election_scope: { year: 2022, office: "Senador", geography: "São Paulo" } }), /eleição 2026|escopo incompatível|alias_scope/)
    rejects(() => parse({ election_scope: { year: 2026, office: "Governador", geography: "São Paulo" }, alias_scope: { year: 2026, office: "Governador", geography: "São Paulo" } }), /cargo Senador|escopo incompatível|publication_scope/)
    rejects(() => parse({ publication_scope: { election_year: 2026, office: "Senador", geography_code: "RJ", turn: 1, comparability_key: "2026|Senador|RJ|1|primeiro-voto|fixture" } }), /UF incompatível|escopo incompatível|geografia/)
    rejects(() => parse({ publication_scope: { election_year: 2026, office: "Senador", geography_code: "SP", turn: 2, comparability_key: "2026|Senador|SP|2|primeiro-voto|fixture" } }), /segundo turno/)
    rejects(() => parse({ pesquisas: [pesquisa({ cenarios: [{ ...pesquisa().cenarios[0], comparability_key: "2026|Senador|SP|1|turno-2|fixture" }] })] }), /medida Senado inválida/)
  })

  it("exige registro publicado; método, denominador e enunciado seguem a regra de governador", () => {
    for (const code of ["BR-01234/2026", "RJ-01234/2026", "SP-1234/2026", "SP-01234/2022"]) {
      rejects(() => parse({ pesquisas: [pesquisa({ registration: { code: { value: code, status: "publicado" }, url: { value: "https://example.test/registro", status: "publicado" } } })] }), /não é da UF SP/)
    }
    const missingRegistration = parse({ pesquisas: [pesquisa({ registration: { code: { value: null, status: "indeterminado" }, url: { value: null, status: "indeterminado" } } })] })
    assert.deepEqual(selecionarSenadoPolls(missingRegistration, "SP"), [])
    const missingMethod = parse({ pesquisas: [pesquisa({ method: { value: null, status: "indeterminado" } })] })
    assert.equal(selecionarSenadoPolls(missingMethod, "SP").length, 1)
    const missingPopulation = parse({ pesquisas: [pesquisa({ sample: { ...pesquisa().sample, population: { value: null, status: "indeterminado" } } })] })
    assert.equal(selecionarSenadoPolls(missingPopulation, "SP").length, 1)
    const missingQuestion = parse({ pesquisas: [pesquisa({ cenarios: [{ ...pesquisa().cenarios[0], question: { value: null, status: "indeterminado" } }] })] })
    assert.equal(selecionarSenadoPolls(missingQuestion, "SP").length, 1)
  })

  it("preserva deduplicação de resultados e rejeita colisão conflitante", () => {
    const first = pesquisa()
    const duplicate = structuredClone(first.cenarios[0].resultados[0])
    first.cenarios[0].resultados.push(duplicate)
    const parsed = parse({ pesquisas: [first] })
    assert.equal(parsed.pesquisas[0].cenarios[0].resultados.length, 1)
    first.cenarios[0].resultados.at(-1)!.value_percent = 41
    rejects(() => parse({ pesquisas: [first] }), /duplicada conflitante/)
  })

  it("exclui fonte não aprovada e falha fechada sem proveniência", () => {
    const rejected = parse({ pesquisas: [pesquisa({ source_status: "condicional", publishable_by_default: false })] }, fontes("condicional"))
    assert.deepEqual(selecionarSenadoPolls(rejected, "SP"), [])
    rejects(() => parse({ pesquisas: [pesquisa({ provenance: { ...pesquisa().provenance, result_url: null } })] }), /result_url|URL de resultado/)
  })

  it("seleciona registro estadual do Senado sem reabrir ambiguidade nacional", () => {
    assert.equal(selecionarRegistroPublicado(["BR-00001/2026", "SP-01234/2026"], "Senador", "SP"), "SP-01234/2026")
    assert.equal(selecionarRegistroPublicado(["BA-01234/2026"], "Senador", "SP"), null)
    assert.equal(selecionarRegistroPublicado(["BR-00001/2026"], "Senador", "SP"), null)
    assert.equal(selecionarRegistroPublicado(["SP-01234/2026", "RJ-00001/2026"], "Senador", "SP"), null)
    assert.equal(selecionarRegistroPublicado(["BR-00001/2026"], "Senador", "BR"), null)
  })
})

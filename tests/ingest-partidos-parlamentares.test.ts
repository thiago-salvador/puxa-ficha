import assert from "node:assert/strict"
import test from "node:test"
import {
  coletarHistoricoPartidarioParlamentar,
  classificarResultadoPartidario,
  parseCamaraDeputyIdentity,
  parseCamaraLegislatureRoster,
  parseFiliacoesPartidariasSenado,
  parseHistoricoPartidarioCamara,
  parseSenadoLegislatureRange,
  parseSenadoLegislatureRoster,
  identidadePorNomeComScore,
  jevScriptMatchesPinnedHash,
  jevShadowEnv,
  JEV_SCRIPT_SHA256_PIN_PARTIDOS,
  partyWritesAllowed,
  assertPartyInsertCardinality,
  mesmaJanelaMudancaPartidaria,
  normalizePartyForTimeline,
  RENOMEACOES_PARTIDARIAS_OFICIAIS,
  selecionarCandidatosPartidarios,
  transitionsFromSources,
} from "../scripts/lib/ingest-partidos-parlamentares"
import type { CandidatoConfig } from "../scripts/lib/types"

const candidate = (patch: Partial<CandidatoConfig> = {}): CandidatoConfig => ({
  slug: "candidato-a",
  nome_completo: "Nome Não Usado",
  nome_urna: "Nome Não Usado",
  cargo_disputado: "Deputado Federal",
  ids: { camara: 123, senado: null, tse_sq_candidato: {} },
  ...patch,
})

test("diretórios exigem estrutura e nomes oficiais são resolvidos pelo detalhe Câmara", () => {
  assert.throws(() => parseSenadoLegislatureRoster({ ListaParlamentarLegislatura: { Metadados: {} } }, 36), /Parlamentar ausente/)
  const [blankName] = parseCamaraLegislatureRoster({ dados: [{ id: 456, nome: null, siglaUf: "SP" }] }, 52)
  assert.deepEqual(blankName.nomes, [])
  assert.deepEqual(parseCamaraDeputyIdentity({ dados: { id: 456, nomeCivil: "Nome Civil Sintético", ultimoStatus: { nome: "Nome Parlamentar Sintético", siglaUf: "SP", siglaPartido: "PT" } } }, 456, 52), {
    casa: "camara", id: 456, nomes: ["Nome Civil Sintético", "Nome Parlamentar Sintético"], uf: "SP", partido: "PT", legislatura: 52,
  })
})

test("roster Senado por intervalo expande mandatos para as legislaturas declaradas", () => {
  const records = parseSenadoLegislatureRange({ ListaParlamentarLegislatura: { Parlamentares: { Parlamentar: [{
    IdentificacaoParlamentar: { CodigoParlamentar: "777", NomeCompletoParlamentar: "Senadora Sintética", NomeParlamentar: "Senadora" },
    Mandatos: { Mandato: [{ PrimeiraLegislaturaDoMandato: { NumeroLegislatura: "56" }, SegundaLegislaturaDoMandato: { NumeroLegislatura: "57" }, UfParlamentar: "XX" }] },
  }] } } }, 1, 57)
  assert.deepEqual(records.map(({ id, legislatura, uf }) => ({ id, legislatura, uf })), [
    { id: 777, legislatura: 56, uf: "XX" }, { id: 777, legislatura: 57, uf: "XX" },
  ])
})

test("Câmara exige identidade oficial correspondente e mantém datas observadas", () => {
  assert.deepEqual(parseHistoricoPartidarioCamara({ dados: [
    { id: 123, siglaPartido: "PT", dataHora: "2022-03-10T00:00" },
    { id: 123, siglaPartido: "PSB", dataHora: "2020-02-01T00:00" },
  ] }, 123), [
    { partido: "PSB", data_inicio: "2020-02-01", data_fim: null },
    { partido: "PT", data_inicio: "2022-03-10", data_fim: null },
  ])
  assert.throws(() => parseHistoricoPartidarioCamara({ dados: [{ id: 124, siglaPartido: "PT", dataHora: "2022-03-10" }] }, 123), /identidade divergente/)
  assert.throws(() => parseHistoricoPartidarioCamara({ dados: [{ id: 123, siglaPartido: "PT", dataHora: "2022-02-30" }] }, 123), /data válida/)
})

test("Senado valida código, aceita filiação única e preserva início/fim", () => {
  const payload = { FiliacaoParlamentar: { Parlamentar: { Codigo: "5894", Filiacoes: { Filiacao: [
    { Partido: { SiglaPartido: "PL" }, DataFiliacao: "2021-11-30" },
    { Partido: { SiglaPartido: "PSL" }, DataFiliacao: "2019-01-01", DataDesfiliacao: "2019-11-19" },
  ] } } } }
  assert.deepEqual(parseFiliacoesPartidariasSenado(payload, 5894), [
    { partido: "PSL", data_inicio: "2019-01-01", data_fim: "2019-11-19" },
    { partido: "PL", data_inicio: "2021-11-30", data_fim: null },
  ])
  assert.throws(() => parseFiliacoesPartidariasSenado(payload, 9), /código parlamentar correspondente/)
})

test("receipt keeps sources separate for future TSE pairing and hashes response bodies", async () => {
  const body = JSON.stringify({ dados: [{ id: 123, siglaPartido: "PT", dataHora: "2023-02-01T00:00" }] })
  const senateBody = JSON.stringify({ FiliacaoParlamentar: { Parlamentar: { Codigo: "5894", Filiacoes: { Filiacao: [{ Partido: { SiglaPartido: "PL" }, DataFiliacao: "2021-01-02" }] } } } })
  const receipt = await coletarHistoricoPartidarioParlamentar(candidate({ ids: { camara: 123, senado: 5894, tse_sq_candidato: {} } }), {
    fetcher: async (url) => ({ status: 200, body: url.endsWith("/123/historico") ? body : senateBody }),
  })
  assert.equal(receipt.componente, "parlamentar")
  assert.equal(receipt.resultado, "ok")
  assert.equal(receipt.fontes[0].url, "https://dadosabertos.camara.leg.br/api/v2/deputados/123/historico")
  assert.match(receipt.fontes[0].sha256 ?? "", /^[a-f0-9]{64}$/)
  assert.equal(receipt.fontes[0].mudancas[0].data_inicio, "2023-02-01")
  const detail = JSON.parse(receipt.detalhe)
  assert.equal(detail.schema_version, "partidos-parlamentares-coleta-detail-v1")
  assert.equal(detail.tse_source_separate, true)
  assert.equal(detail.fontes[0].sha256, receipt.fontes[0].sha256)
})

test("Câmara snapshots duplicate same-day same-party rows; conflicting parties stay indeterminate", async () => {
  const body = JSON.stringify({ dados: [
    { id: 123, siglaPartido: "DEM", dataHora: "2023-02-01T00:00", idLegislatura: 54 },
    { id: 123, siglaPartido: "DEM", dataHora: "2023-02-01T00:00", idLegislatura: 53 },
    { id: 123, siglaPartido: "PT", dataHora: "2023-02-01T00:00", idLegislatura: 52 },
  ] })
  const receipt = await coletarHistoricoPartidarioParlamentar(candidate({ ids: { camara: 123, senado: null, tse_sq_candidato: {} } }), {
    fetcher: async () => ({ status: 200, body }),
  })
  assert.equal(receipt.fontes[0].mudancas.length, 2)
  const resolved = transitionsFromSources(receipt)
  assert.deepEqual(resolved.transicoes, [])
  assert.deepEqual(resolved.ambiguidades, [])
})

test("Câmara status event timestamps never become party affiliation dates", async () => {
  const body = JSON.stringify({ dados: [
    { id: 123, siglaPartido: "PT", dataHora: "2022-01-01T00:00", idLegislatura: 56 },
    { id: 123, siglaPartido: "PL", dataHora: "2023-02-01T00:00", idLegislatura: 57 },
  ] })
  const receipt = await coletarHistoricoPartidarioParlamentar(candidate(), { fetcher: async () => ({ status: 200, body }) })
  assert.equal(receipt.fontes[0].mudancas.length, 2)
  assert.deepEqual(transitionsFromSources(receipt).transicoes, [])
})

test("no local ID is indeterminate until a separate official no-ID proof is supplied", async () => {
  const withoutIds = candidate({ ids: { camara: null, senado: null, tse_sq_candidato: {} } })
  const unknown = await coletarHistoricoPartidarioParlamentar(withoutIds)
  assert.equal(unknown.resultado, "indeterminado")
  assert.equal(unknown.identidade, "nao_verificada")
  assert.equal(unknown.fontes.length, 2)
  const proven = await coletarHistoricoPartidarioParlamentar(withoutIds, {
    provaSemIdPorCasa: {
      camara: { verificado: true, detalhe: "roster Câmara consultado", url: "https://example.invalid/camara", sha256: "a".repeat(64) },
      senado: { verificado: true, detalhe: "roster Senado consultado", url: "https://example.invalid/senado", sha256: "b".repeat(64) },
    },
  })
  assert.equal(proven.resultado, "vazio_confirmado")
  assert.equal(proven.identidade, "sem_id_verificado")
  assert.deepEqual(proven.fontes.map((source) => source.resultado), ["vazio_confirmado", "vazio_confirmado"])
  assert.deepEqual(classificarResultadoPartidario(proven, 0), {
    resultado: "vazio_confirmado", volume: 0, motivo: "sem_id_parlamentar_verificado_em_ambas_as_casas",
  })
})

test("source observations with an official ID are found even when no party transition is derived", async () => {
  const receipt = await coletarHistoricoPartidarioParlamentar(candidate({ ids: { camara: 123, senado: 5894, tse_sq_candidato: {} } }), {
    fetcher: async (url) => {
      const body = url.endsWith("/123/historico")
        ? JSON.stringify({ dados: [{ id: 123, siglaPartido: "PT", dataHora: "2023-02-01" }, { id: 123, siglaPartido: "PT", dataHora: "2022-02-01" }] })
        : JSON.stringify({ FiliacaoParlamentar: { Parlamentar: { Codigo: "5894", Filiacoes: { Filiacao: [{ Partido: { SiglaPartido: "PL" }, DataFiliacao: "2022-01-01" }] } } } })
      return { status: 200, body }
    },
  })
  assert.equal(receipt.resultado, "ok")
  assert.equal(receipt.volume, 3)
  assert.deepEqual(classificarResultadoPartidario(receipt, 0), {
    resultado: "encontrado", volume: 3, motivo: "observacoes_oficiais_sem_transicao_partidaria",
  })
  assert.deepEqual(classificarResultadoPartidario(receipt, 1), {
    resultado: "encontrado", volume: 1, motivo: "transicoes_partidarias_encontradas",
  })
})

test("uma Casa sem ID não fica coberta pela leitura bem-sucedida da outra", async () => {
  const partiallyIdentified = candidate({ ids: { camara: 123, senado: null, tse_sq_candidato: {} } })
  const receipt = await coletarHistoricoPartidarioParlamentar(partiallyIdentified, {
    fetcher: async () => ({ status: 200, body: JSON.stringify({ dados: [{ id: 123, siglaPartido: "PT", dataHora: "2023-02-01" }] }) }),
  })
  assert.equal(receipt.resultado, "indeterminado")
  assert.equal(receipt.fontes.length, 2)
  assert.equal(receipt.fontes.find((source) => source.casa === "senado")?.resultado, "indeterminado")
})

test("fonte indisponível e resposta HTTP ruim nunca viram ausência confirmada", async () => {
  const unavailable = await coletarHistoricoPartidarioParlamentar(candidate(), {
    fetcher: async () => { throw new Error("offline") },
  })
  assert.equal(unavailable.resultado, "indisponivel")
  assert.notEqual(unavailable.resultado, "vazio_confirmado")
  const httpError = await coletarHistoricoPartidarioParlamentar(candidate(), {
    fetcher: async () => ({ status: 503, body: "unavailable" }),
  })
  assert.equal(httpError.resultado, "erro")
})

test("ID parlamentar existente com endpoint vazio fica indeterminado, nunca vazio confirmado", async () => {
  const identified = candidate({ ids: { camara: 123, senado: 5894, tse_sq_candidato: {} } })
  const receipt = await coletarHistoricoPartidarioParlamentar(identified, {
    fetcher: async (url) => ({
      status: 200,
      body: url.endsWith("/123/historico")
        ? JSON.stringify({ dados: [] })
        : JSON.stringify({ FiliacaoParlamentar: { Parlamentar: { Codigo: "5894", Filiacoes: { Filiacao: [] } } } }),
    }),
  })
  assert.equal(receipt.resultado, "indeterminado")
  assert.deepEqual(receipt.fontes.map((source) => source.resultado), ["indeterminado", "indeterminado"])
})

test("candidate selection applies the optional cohort predicate once", () => {
  const candidates = [candidate(), candidate({ slug: "candidato-b" })]
  assert.deepEqual(selecionarCandidatosPartidarios(candidates, (row) => row.slug === "candidato-b").map((row) => row.slug), ["candidato-b"])
  assert.equal(selecionarCandidatosPartidarios(candidates).length, 2)
})

test("party history writes require explicit apply and a non-dry-run context", () => {
  assert.equal(partyWritesAllowed(false, false), false)
  assert.equal(partyWritesAllowed(true, true), false)
  assert.equal(partyWritesAllowed(true, false), true)
})

test("party insert cardinality accepts full writes and rejects partial writes", () => {
  assert.equal(assertPartyInsertCardinality(3, 3), 3)
  assert.throws(() => assertPartyInsertCardinality(2, 3), /2 linhas gravadas para 3 planejadas/)
})

test("party identity shadow pins the helper and passes only TypeSafe key and PATH", () => {
  assert.match(JEV_SCRIPT_SHA256_PIN_PARTIDOS, /^[a-f0-9]{64}$/)
  assert.equal(jevScriptMatchesPinnedHash(Buffer.from("different helper")), false)
  assert.deepEqual(jevShadowEnv({ TYPESAFE_API_KEY: "fake-test-key", PATH: "/bin", SUPABASE_SERVICE_ROLE_KEY: "must-not-pass" }), {
    TYPESAFE_API_KEY: "fake-test-key", PATH: "/bin",
  })
})

test("Jev name scores never establish parliamentary identity or verified absence", () => {
  for (const score of [0.99, 0.01, null]) {
    assert.deepEqual(identidadePorNomeComScore(score), {
      id_oficial: null, status: "revisar", score_sombra: score, prova_sem_id: null,
    })
  }
})

test("official party aliases normalize before transition detection and cite TSE sources", () => {
  assert.equal(normalizePartyForTimeline("PMDB", 2018), "MDB")
  assert.equal(normalizePartyForTimeline("PR", 2020), "PL")
  assert.equal(normalizePartyForTimeline("PPS", 2020), "CIDADANIA")
  assert.equal(normalizePartyForTimeline("PRB", 2020), "REPUBLICANOS")
  assert.equal(normalizePartyForTimeline("DEM", 2023), "UNIAO")
  assert.equal(normalizePartyForTimeline("PSL", 2023), "UNIAO")
  assert.ok(RENOMEACOES_PARTIDARIAS_OFICIAIS.every((rename) => rename.fonte.startsWith("https://www.tse.jus.br/")))
})

test("party duplicate key includes predecessor and same-year change window", () => {
  const proposed = { partido_anterior: "MDB", partido_novo: "PT", ano: 2022 }
  assert.equal(mesmaJanelaMudancaPartidaria({ partido_anterior: "PMDB", partido_novo: "PT", ano: 2022 }, proposed), true)
  assert.equal(mesmaJanelaMudancaPartidaria({ partido_anterior: "PSDB", partido_novo: "PT", ano: 2022 }, proposed), false)
  assert.equal(mesmaJanelaMudancaPartidaria({ partido_anterior: "MDB", partido_novo: "PT", ano: 2021 }, proposed), false)
})

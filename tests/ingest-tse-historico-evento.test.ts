import assert from "node:assert/strict"
import test from "node:test"
import {
  buildTseHistoricoEvento,
  buildTseHistoricoObservacoes,
  resolveTseHistoricoElectionYear,
  tseHistoricoCandidacyKey,
} from "../scripts/lib/ingest-tse-historico"

test("resultado eleitoral TSE vira candidatura datada em qualquer ano coberto", () => {
  for (const ano of [1998, 2014, 2020, 2022]) {
    const evento = buildTseHistoricoEvento(ano)
    assert.deepEqual(evento, { tipo_evento: "candidatura", periodo_fim: ano })
    assert.notEqual(evento.tipo_evento, "mandato")
  }
})

test("eleicao TSE nao cria mandato aberto ou presente", () => {
  const evento = buildTseHistoricoEvento(2014)
  assert.equal(evento.periodo_fim, 2014)
  assert.equal("periodo_atual" in evento, false)
})

test("texto eleitoral permanece compatível e separado da classificação do evento", () => {
  assert.equal(buildTseHistoricoObservacoes("ELEITO", 2022, true), "ELEITO (TSE 2022)")
  assert.equal(buildTseHistoricoObservacoes("NÃO ELEITO", 2022, false), "Candidatura: NÃO ELEITO (TSE 2022)")
})

test("reingest TSE preserva linha curada ou sem proveniência", async () => {
  const { shouldUpdateTseHistoricoRow } = await import("../scripts/lib/ingest-tse-historico")
  assert.equal(shouldUpdateTseHistoricoRow("tse"), true)
  assert.equal(shouldUpdateTseHistoricoRow("manual"), false)
  assert.equal(shouldUpdateTseHistoricoRow("wikidata"), false)
  assert.equal(shouldUpdateTseHistoricoRow(null), false)
})

test("histórico separa eleição ordinária e suplementar que coexistem no mesmo arquivo-base", () => {
  const ordinaryYear = resolveTseHistoricoElectionYear({
    ANO_ELEICAO: "2014",
    DT_ELEICAO: "05/10/2014",
    NM_TIPO_ELEICAO: "ELEIÇÃO ORDINÁRIA",
  }, 2014)
  const supplementaryYear = resolveTseHistoricoElectionYear({
    ANO_ELEICAO: "2014",
    DT_ELEICAO: "27/08/2017",
    NM_TIPO_ELEICAO: "ELEIÇÃO SUPLEMENTAR",
  }, 2014)

  assert.equal(ordinaryYear, 2014)
  assert.equal(supplementaryYear, 2017)
  assert.notEqual(
    tseHistoricoCandidacyKey("eduardo-braga", "Governador", ordinaryYear),
    tseHistoricoCandidacyKey("eduardo-braga", "Governador", supplementaryYear),
  )
})

test("histórico suplementar usa a data real e mantém chave idempotente", () => {
  const row = {
    ANO_ELEICAO: "2018",
    DT_ELEICAO: "15/11/2020",
    NM_TIPO_ELEICAO: "ELEIÇÃO SUPLEMENTAR",
  }
  const firstYear = resolveTseHistoricoElectionYear(row, 2018)
  const secondYear = resolveTseHistoricoElectionYear(row, 2018)

  assert.equal(firstYear, 2020)
  assert.equal(
    tseHistoricoCandidacyKey("jose-medeiros", "Senador", firstYear),
    tseHistoricoCandidacyKey("jose-medeiros", "Senador", secondYear),
  )
})

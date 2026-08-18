import { strict as assert } from "node:assert"
import { describe, it } from "node:test"
import {
  formatFinanciamentoPleitoPublicLabelForRow,
  resolveFinanciamentoPleitoPublicLabel,
} from "../src/lib/financiamento-pleito-public-label"
import type { Financiamento, HistoricoPolitico } from "../src/lib/types"

function h(partial: Partial<HistoricoPolitico> & Pick<HistoricoPolitico, "id" | "cargo">): HistoricoPolitico {
  return {
    id: partial.id,
    candidato_id: partial.candidato_id ?? "c1",
    cargo: partial.cargo,
    cargo_canonico: partial.cargo_canonico ?? null,
    tipo_evento: partial.tipo_evento ?? null,
    periodo_inicio: partial.periodo_inicio ?? null,
    periodo_fim: partial.periodo_fim ?? null,
    partido: partial.partido ?? "PT",
    estado: partial.estado ?? "",
    eleito_por: partial.eleito_por ?? "",
    observacoes: partial.observacoes ?? null,
    proveniencia: partial.proveniencia ?? null,
  }
}

describe("financiamento-pleito-public-label", () => {
  it("resolve match único por ano (tipo_evento candidatura)", () => {
    const historico: HistoricoPolitico[] = [
      h({
        id: "1",
        cargo: "Governador",
        tipo_evento: "candidatura",
        periodo_inicio: 2022,
        periodo_fim: 2022,
        estado: "BA",
        observacoes: "TSE 2022",
      }),
    ]
    const r = resolveFinanciamentoPleitoPublicLabel(2022, historico)
    assert.equal(r.resolution, "unique")
    assert.equal(r.label, "2022 - Governador (BA)")
  })

  it("deduplica BA e Bahia como o mesmo pleito (UF canónica)", () => {
    const historico: HistoricoPolitico[] = [
      h({
        id: "a",
        cargo: "Governador",
        tipo_evento: "candidatura",
        periodo_inicio: 2022,
        periodo_fim: 2022,
        estado: "BA",
        observacoes: "TSE 2022",
      }),
      h({
        id: "b",
        cargo: "Governador",
        tipo_evento: "candidatura",
        periodo_inicio: 2022,
        periodo_fim: 2022,
        estado: "Bahia",
        observacoes: "TSE 2022",
      }),
    ]
    const r = resolveFinanciamentoPleitoPublicLabel(2022, historico)
    assert.equal(r.resolution, "deduped")
    assert.equal(r.label, "2022 - Governador (BA)")
  })

  it("deduplica RJ e Rio de Janeiro como o mesmo pleito (UF canónica)", () => {
    const historico: HistoricoPolitico[] = [
      h({
        id: "a",
        cargo: "Senador",
        cargo_canonico: "senador",
        tipo_evento: "candidatura",
        periodo_inicio: 2018,
        periodo_fim: 2018,
        estado: "RJ",
      }),
      h({
        id: "b",
        cargo: "Senador",
        cargo_canonico: "senador",
        tipo_evento: "candidatura",
        periodo_inicio: 2018,
        periodo_fim: 2018,
        estado: "Rio de Janeiro",
      }),
    ]
    const r = resolveFinanciamentoPleitoPublicLabel(2018, historico)
    assert.equal(r.resolution, "deduped")
    assert.equal(r.label, "2018 - Senador (RJ)")
  })

  it("deduplica várias linhas iguais (mesmo canon e UF)", () => {
    const historico: HistoricoPolitico[] = [
      h({
        id: "a",
        cargo: "Senador",
        cargo_canonico: "senador",
        tipo_evento: "candidatura",
        periodo_inicio: 2018,
        periodo_fim: 2018,
        estado: "RJ",
      }),
      h({
        id: "b",
        cargo: "Senador",
        cargo_canonico: "senador",
        tipo_evento: "candidatura",
        periodo_inicio: 2018,
        periodo_fim: 2018,
        estado: "RJ",
      }),
    ]
    const r = resolveFinanciamentoPleitoPublicLabel(2018, historico)
    assert.equal(r.resolution, "deduped")
    assert.equal(r.label, "2018 - Senador (RJ)")
  })

  it("ambíguo quando há mais de um pleito distinto no mesmo ano", () => {
    const historico: HistoricoPolitico[] = [
      h({
        id: "1",
        cargo: "Deputado Federal",
        tipo_evento: "candidatura",
        periodo_inicio: 2022,
        periodo_fim: 2022,
        estado: "SP",
      }),
      h({
        id: "2",
        cargo: "Senador",
        tipo_evento: "candidatura",
        periodo_inicio: 2022,
        periodo_fim: 2022,
        estado: "SP",
      }),
    ]
    const r = resolveFinanciamentoPleitoPublicLabel(2022, historico)
    assert.equal(r.resolution, "ambiguous")
    assert.ok(r.label.includes("ambíguos"))
  })

  it("ambíguo quando mesmo cargo canónico mas UF distinta", () => {
    const historico: HistoricoPolitico[] = [
      h({
        id: "1",
        cargo: "Deputado Federal",
        tipo_evento: "candidatura",
        periodo_inicio: 2014,
        periodo_fim: 2014,
        estado: "MG",
      }),
      h({
        id: "2",
        cargo: "Deputado Federal",
        tipo_evento: "candidatura",
        periodo_inicio: 2014,
        periodo_fim: 2014,
        estado: "RJ",
      }),
    ]
    const r = resolveFinanciamentoPleitoPublicLabel(2014, historico)
    assert.equal(r.resolution, "ambiguous")
  })

  it("no_match sem candidatura alinhada ao ano", () => {
    const historico: HistoricoPolitico[] = [
      h({
        id: "1",
        cargo: "Governador",
        tipo_evento: "candidatura",
        periodo_inicio: 2020,
        periodo_fim: 2020,
        estado: "PE",
      }),
    ]
    const r = resolveFinanciamentoPleitoPublicLabel(2022, historico)
    assert.equal(r.resolution, "no_match")
    assert.ok(r.label.includes("não identificado"))
  })

  it("ignora mandato no mesmo ano (não é candidatura classificada)", () => {
    const historico: HistoricoPolitico[] = [
      h({
        id: "1",
        cargo: "Governador",
        tipo_evento: "mandato",
        periodo_inicio: 2022,
        periodo_fim: 2026,
        estado: "BA",
      }),
    ]
    const r = resolveFinanciamentoPleitoPublicLabel(2022, historico)
    assert.equal(r.resolution, "no_match")
  })

  it("alinha teaser do overview, aba Dinheiro e timeline (mesmo helper por linha)", () => {
    const historico: HistoricoPolitico[] = [
      h({
        id: "1",
        cargo: "Presidente",
        tipo_evento: "candidatura",
        periodo_inicio: 2018,
        periodo_fim: 2018,
        estado: "BR",
        observacoes: "TSE 2018",
      }),
    ]
    const fin: Financiamento = {
      id: "f1",
      candidato_id: "c1",
      ano_eleicao: 2018,
      total_arrecadado: 1,
      total_fundo_partidario: 0,
      total_fundo_eleitoral: 0,
      total_pessoa_fisica: 0,
      total_recursos_proprios: 0,
      maiores_doadores: [],
    }
    const overview = formatFinanciamentoPleitoPublicLabelForRow(fin, historico)
    const moneyLinha = formatFinanciamentoPleitoPublicLabelForRow(fin, historico)
    const timeline = resolveFinanciamentoPleitoPublicLabel(2018, historico).label
    assert.equal(overview, moneyLinha)
    assert.equal(overview, timeline)
    assert.equal(overview, "2018 - Presidente")
  })

  it("não usa inferência de candidatura quando o ano não coincide (periodo_inicio)", () => {
    const historico: HistoricoPolitico[] = [
      h({
        id: "1",
        cargo: "Vereador",
        tipo_evento: "candidatura",
        periodo_inicio: 2020,
        periodo_fim: 2020,
        estado: "SP",
      }),
    ]
    const r = resolveFinanciamentoPleitoPublicLabel(2022, historico)
    assert.equal(r.resolution, "no_match")
  })
})

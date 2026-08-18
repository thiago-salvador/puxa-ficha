import assert from "node:assert/strict"
import { test } from "node:test"

import { auditHistoricoDisplay, isBadDisplayPeriodo } from "../scripts/lib/historico-display-runtime-rules"
import type { HistoricoPolitico } from "@/lib/types"

function row(partial: Partial<HistoricoPolitico> & Pick<HistoricoPolitico, "id">): HistoricoPolitico {
  return {
    candidato_id: "c1",
    cargo: "Deputado Federal",
    cargo_canonico: "Deputado Federal",
    tipo_evento: "mandato",
    periodo_inicio: 2022,
    periodo_fim: null,
    partido: "PT",
    estado: "SP",
    eleito_por: "Voto popular",
    observacoes: null,
    ...partial,
    id: partial.id,
  }
}

test("isBadDisplayPeriodo reconhece labels problemáticos da UI", () => {
  assert.equal(isBadDisplayPeriodo("Período não determinado"), true)
  assert.equal(isBadDisplayPeriodo("2019 - mandato encerrado"), true)
  assert.equal(isBadDisplayPeriodo("Até 2022"), true)
  assert.equal(isBadDisplayPeriodo("2023 - atual"), false)
})

test("auditHistoricoDisplay não sinaliza o caso tarcisio já corrigido", () => {
  const out = auditHistoricoDisplay([
    row({
      id: "gov-current",
      cargo: "Governador de São Paulo",
      cargo_canonico: "Governador",
      periodo_inicio: 2023,
      periodo_fim: null,
    }),
    row({
      id: "gov-null",
      cargo: "Governador de São Paulo",
      cargo_canonico: "Governador",
      periodo_inicio: null,
      periodo_fim: null,
      observacoes: "Cargo atual confirmado na atualização do perfil em 01/04/2026; inicio do mandato ainda não determinado.",
    }),
    row({
      id: "min-2019",
      cargo: "Ministro da Infraestrutura",
      cargo_canonico: "Ministro da Infraestrutura",
      periodo_inicio: 2019,
      periodo_fim: 2022,
      partido: "sem partido",
      estado: "",
      eleito_por: "Nomeação",
    }),
  ])

  assert.deepEqual(out.counts, { alta: 0, media: 0, baixa: 0 })
  assert.equal(out.issues.length, 0)
})

test("auditHistoricoDisplay classifica quebra alta quando o teaser ainda repete o mesmo cargo com período ruim", () => {
  const out = auditHistoricoDisplay([
    row({
      id: "df-current",
      cargo: "Deputado Federal",
      cargo_canonico: "Deputado Federal",
      periodo_inicio: 2023,
      periodo_fim: null,
    }),
    row({
      id: "minister",
      cargo: "Ministro",
      cargo_canonico: "Ministro",
      periodo_inicio: 2021,
      periodo_fim: 2022,
    }),
    row({
      id: "df-bad",
      cargo: "Deputado Federal",
      cargo_canonico: "Deputado Federal",
      periodo_inicio: null,
      periodo_fim: 2022,
      observacoes: "mandato anterior sem ano inicial consolidado",
    }),
  ])

  assert.equal(out.issues.length, 1)
  assert.equal(out.issues[0]?.severity, "alta")
  assert.equal(out.issues[0]?.teaserBroken, true)
})

test("auditHistoricoDisplay classifica quebra média quando só a trajetória mantém o mesmo título ruim", () => {
  const out = auditHistoricoDisplay([
    row({ id: "df-2023", periodo_inicio: 2023, periodo_fim: null }),
    row({ id: "df-2019", periodo_inicio: 2019, periodo_fim: 2022 }),
    row({ id: "pref-2017", cargo: "Prefeito", cargo_canonico: "Prefeito", periodo_inicio: 2017, periodo_fim: 2020 }),
    row({
      id: "df-bad",
      cargo: "Deputado Federal",
      cargo_canonico: "Deputado Federal",
      periodo_inicio: null,
      periodo_fim: 2010,
      observacoes: "mandato antigo sem ano inicial consolidado",
    }),
  ])

  assert.equal(out.issues.length, 1)
  assert.equal(out.issues[0]?.severity, "media")
  assert.equal(out.issues[0]?.teaserBroken, false)
  assert.equal(out.issues[0]?.titleOverlap, true)
})

test("auditHistoricoDisplay classifica suspeita baixa quando só sobra variante canônica de título", () => {
  const out = auditHistoricoDisplay([
    row({
      id: "gov-current",
      cargo: "Governador",
      cargo_canonico: "Governador",
      periodo_inicio: 2023,
      periodo_fim: null,
    }),
    row({
      id: "sen-2019",
      cargo: "Senador",
      cargo_canonico: "Senador",
      periodo_inicio: 2019,
      periodo_fim: 2022,
    }),
    row({
      id: "gov-bad",
      cargo: "Governador de Goiás",
      cargo_canonico: "Governador",
      periodo_inicio: null,
      periodo_fim: 2022,
      observacoes: "mandato estadual sem ano inicial consolidado",
    }),
  ])

  assert.equal(out.issues.length, 1)
  assert.equal(out.issues[0]?.severity, "baixa")
  assert.equal(out.issues[0]?.titleOverlap, false)
})

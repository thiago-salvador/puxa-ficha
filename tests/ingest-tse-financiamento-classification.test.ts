import test from "node:test"
import assert from "node:assert/strict"
import { classifyFinanciamentoOrigem } from "../scripts/lib/ingest-tse"
import { normalizeFinanciamentoReceitaRow } from "../scripts/lib/financiamento-receita-legacy-row"
import { financiamentoReceitaDedupKey } from "../scripts/lib/financiamento-receita-dedup"

test("classifica categorias legadas com plural e acentos", () => {
  assert.equal(classifyFinanciamentoOrigem("Recursos de pessoas físicas"), "pessoa_fisica")
  assert.equal(classifyFinanciamentoOrigem("Recursos próprios"), "recursos_proprios")
  assert.equal(classifyFinanciamentoOrigem("Recursos de pessoas jurídicas"), "outros")
})

test("preserva categorias de fundo dos layouts atuais", () => {
  assert.equal(classifyFinanciamentoOrigem("Fundo Partidário"), "fundo_partidario")
  assert.equal(classifyFinanciamentoOrigem("Fundo Especial de Financiamento de Campanha"), "fundo_eleitoral")
  assert.equal(classifyFinanciamentoOrigem("FEFC"), "fundo_eleitoral")
})

test("preserva DS_FONTE_RECEITA e classifica a fonte oficial antes da origem", () => {
  const row = normalizeFinanciamentoReceitaRow({
    SQ_CANDIDATO: "1",
    SQ_RECEITA: "2",
    VR_RECEITA: "10,00",
    DS_FONTE_RECEITA: "FUNDO PARTIDARIO",
    DS_ORIGEM_RECEITA: "Recursos de partido político",
  })

  assert.equal(row.DS_FONTE_RECEITA, "FUNDO PARTIDARIO")
  assert.equal(
    classifyFinanciamentoOrigem([row.DS_FONTE_RECEITA, row.DS_ORIGEM_RECEITA].join(" — ")),
    "fundo_partidario",
  )
})

test("marcadores de fonte/origem não viram categoria nem dedup válido", () => {
  const row = normalizeFinanciamentoReceitaRow({
    SQ_CANDIDATO: "1",
    SQ_RECEITA: "#NULO",
    VR_RECEITA: "0,00",
    DS_FONTE_RECEITA: "#NULO",
    DS_ORIGEM_RECEITA: "#NULO",
  })

  assert.equal(classifyFinanciamentoOrigem(`${row.DS_FONTE_RECEITA} — ${row.DS_ORIGEM_RECEITA}`), "outros")
  assert.equal(
    financiamentoReceitaDedupKey(row, { ano: 2026, uf: "SP", sqCandidato: "1" }),
    null,
  )
})

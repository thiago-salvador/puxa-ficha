import assert from "node:assert/strict"
import { test } from "node:test"

import {
  normalizeFinanciamentoForDisplay,
  normalizePatrimonioForDisplay,
} from "@/lib/person-level-dedupe"
import type { Financiamento, Patrimonio } from "@/lib/types"

test("normalizePatrimonioForDisplay colapsa duplicata entre slugs da mesma pessoa e deduplica bens repetidos", () => {
  const rowA: Patrimonio = {
    id: "pat-a",
    candidato_id: "c-a",
    ano_eleicao: 2022,
    valor_total: 4_684_323.54,
    bens: [
      { tipo: "Apartamento", descricao: "SQNW 303", valor: 2_137_160 },
      { tipo: "Apartamento", descricao: "SQNW 303", valor: 2_137_160 },
      { tipo: "Veículo", descricao: "JEEP COMPASS", valor: 119_000 },
    ],
  }
  const rowB: Patrimonio = {
    id: "pat-b",
    candidato_id: "c-b",
    ano_eleicao: 2022,
    valor_total: 4_684_323.54,
    bens: [],
  }

  const out = normalizePatrimonioForDisplay([rowA, rowB])

  assert.equal(out.length, 1)
  assert.equal(out[0]?.id, "pat-a")
  assert.deepEqual(out[0]?.bens, [
    { tipo: "Apartamento", descricao: "SQNW 303", valor: 2_137_160 },
    { tipo: "Veículo", descricao: "JEEP COMPASS", valor: 119_000 },
  ])
})

test("normalizePatrimonioForDisplay mantém anos ou valores distintos", () => {
  const row2022: Patrimonio = {
    id: "pat-2022",
    candidato_id: "c-a",
    ano_eleicao: 2022,
    valor_total: 100,
    bens: [],
  }
  const row2018: Patrimonio = {
    id: "pat-2018",
    candidato_id: "c-b",
    ano_eleicao: 2018,
    valor_total: 100,
    bens: [],
  }
  const row2022DifferentValue: Patrimonio = {
    id: "pat-2022-b",
    candidato_id: "c-c",
    ano_eleicao: 2022,
    valor_total: 200,
    bens: [],
  }

  const out = normalizePatrimonioForDisplay([row2022, row2018, row2022DifferentValue])

  assert.equal(out.length, 3)
})

test("normalizePatrimonioForDisplay remove marcadores TSE dos bens sem perder o valor", () => {
  const row: Patrimonio = {
    id: "pat-marker",
    candidato_id: "c-a",
    ano_eleicao: 2018,
    valor_total: 101_000,
    bens: [
      { tipo: "Apartamento", descricao: "#NULO#", valor: 100_000 },
      { tipo: "#NE#", descricao: "TSE: #NULO#", valor: 1_000 },
    ],
  }

  const out = normalizePatrimonioForDisplay([row])

  assert.deepEqual(out[0]?.bens, [
    { tipo: "Apartamento", descricao: "", valor: 100_000 },
    { tipo: "", descricao: "TSE:", valor: 1_000 },
  ])
})

test("normalizeFinanciamentoForDisplay colapsa duplicata entre slugs da mesma pessoa e deduplica doadores repetidos", () => {
  const rowA: Financiamento = {
    id: "fin-a",
    candidato_id: "c-a",
    ano_eleicao: 2022,
    total_arrecadado: 77_216_377.38,
    total_fundo_partidario: 0,
    total_fundo_eleitoral: 0,
    total_pessoa_fisica: 0,
    total_recursos_proprios: 0,
    maiores_doadores: [
      { nome: "Fundo Eleitoral X", valor: 10, tipo: "fundo_eleitoral" },
      { nome: "Fundo Eleitoral X", valor: 10, tipo: "fundo_eleitoral" },
    ],
  }
  const rowB: Financiamento = {
    id: "fin-b",
    candidato_id: "c-b",
    ano_eleicao: 2022,
    total_arrecadado: 77_216_377.38,
    total_fundo_partidario: 0,
    total_fundo_eleitoral: 0,
    total_pessoa_fisica: 0,
    total_recursos_proprios: 0,
    maiores_doadores: [],
  }

  const out = normalizeFinanciamentoForDisplay([rowA, rowB])

  assert.equal(out.length, 1)
  assert.equal(out[0]?.id, "fin-a")
  assert.deepEqual(out[0]?.maiores_doadores, [
    { nome: "Fundo Eleitoral X", valor: 10, tipo: "fundo_eleitoral" },
  ])
})

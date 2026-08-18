import test from "node:test"
import assert from "node:assert/strict"

import {
  classifyAttentionPoints,
  isContradictionAttentionCategory,
  isNegativeCriticalAttentionPoint,
  isNegativeHighestSeverityAttentionPoint,
  isPositiveAttentionPoint,
} from "../src/lib/attention-points"
import type { PontoAtencao } from "../src/lib/types"

const mixedPoints: PontoAtencao[] = [
  {
    id: "neg-critical",
    candidato_id: "1",
    categoria: "processo_grave",
    titulo: "Condenacao relevante",
    descricao: "Descricao",
    fontes: [],
    gravidade: "critica",
    verificado: true,
    gerado_por: "curadoria",
  },
  {
    id: "neg-medium",
    candidato_id: "1",
    categoria: "contradição",
    titulo: "Contradicao programatica",
    descricao: "Descricao",
    fontes: [],
    gravidade: "media",
    verificado: true,
    gerado_por: "curadoria",
  },
  {
    id: "pos-low",
    candidato_id: "1",
    categoria: "feito_positivo",
    titulo: "Programa social consolidado",
    descricao: "Descricao",
    fontes: [],
    gravidade: "baixa",
    verificado: true,
    gerado_por: "curadoria",
  },
  {
    id: "pos-high",
    candidato_id: "1",
    categoria: "feito_positivo",
    titulo: "Saiu do mapa da fome",
    descricao: "Descricao",
    fontes: [],
    gravidade: "alta",
    verificado: true,
    gerado_por: "curadoria",
  },
]

test("classifyAttentionPoints separates positives from negative alerts", () => {
  const result = classifyAttentionPoints(mixedPoints)

  assert.deepEqual(
    result.alertasGraves.map((item) => item.id),
    ["neg-critical"]
  )
  assert.deepEqual(
    result.alertasNaoPositivos.map((item) => item.id),
    ["neg-critical", "neg-medium"]
  )
  assert.deepEqual(
    result.pontosPositivos.map((item) => item.id),
    ["pos-high", "pos-low"]
  )
})

test("positive points never count as negative grave alerts", () => {
  assert.equal(isPositiveAttentionPoint(mixedPoints[2]), true)
  assert.equal(isPositiveAttentionPoint(mixedPoints[3]), true)
  assert.equal(isNegativeCriticalAttentionPoint(mixedPoints[3]), false)
  assert.equal(isNegativeHighestSeverityAttentionPoint(mixedPoints[3]), false)
})

test("historical judicial information with low gravity stays out of grave alerts", () => {
  const historical = {
    ...mixedPoints[0],
    id: "historical-judicial",
    titulo: "STF anulou a ação por incompetência do juízo",
    gravidade: "baixa" as const,
  }

  const result = classifyAttentionPoints([historical])

  assert.deepEqual(result.alertasGraves, [])
  assert.deepEqual(result.alertasNaoPositivos.map((item) => item.id), ["historical-judicial"])
})

test("categorias de contradicao seguem a mesma normalizacao da regua de cobertura", () => {
  for (const categoria of ["contradição", "contradicao", "mudanca_posicao", "mudança_posição"]) {
    assert.equal(isContradictionAttentionCategory(categoria), true, categoria)
  }
  assert.equal(isContradictionAttentionCategory("processo_grave"), false)
})

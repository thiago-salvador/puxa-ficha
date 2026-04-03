import test from "node:test"
import assert from "node:assert/strict"

import {
  classifyAttentionPoints,
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

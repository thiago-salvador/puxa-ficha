import assert from "node:assert/strict"
import { test } from "node:test"
import { analyzePublishedConsistency, type PublishedRow } from "../src/lib/published-consistency"

function row(overrides: Partial<PublishedRow> = {}): PublishedRow {
  return {
    slug: "candidata",
    nome_urna: "Candidata",
    cargo_disputado: "Governador",
    estado: "SP",
    partido_sigla: "ABC",
    status: "candidato",
    situacao_candidatura: "aguardando julgamento",
    foto_url: "/foto.jpg",
    ...overrides,
  }
}

test("pedido de registro 2026 aguardando julgamento é estado público canônico", () => {
  const report = analyzePublishedConsistency([row()])
  assert.deepEqual(report.hard, [])
  assert.deepEqual(report.soft, [])
})

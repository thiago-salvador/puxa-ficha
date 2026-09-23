import test from "node:test"
import assert from "node:assert/strict"
import {
  buildImprensaFreshnessDataset,
  buildImprensaFreshnessSource,
  IMPRENSA_FRESHNESS_SOURCES,
  type FreshnessReceipt,
} from "../src/lib/imprensa-frescor"

const source = {
  id: "tse",
  label: "TSE",
  authorityUrl: "https://dadosabertos.tse.jus.br",
  cadence: "not_demonstrated" as const,
  maxAgeHours: null,
}

const receipt = (overrides: Partial<FreshnessReceipt> = {}): FreshnessReceipt => ({
  fonte: "tse",
  executado_em: "2026-09-22T10:00:00.000Z",
  resultado: "encontrado",
  url: "https://dadosabertos.tse.jus.br/snapshot.zip",
  ...overrides,
})

test("coleta bem-sucedida sem agenda fica distinta de verificação e atualização", () => {
  const result = buildImprensaFreshnessSource(source, [receipt()])
  assert.equal(result.status, "sem_agenda")
  assert.equal(result.ultimaColetaBemSucedida, "2026-09-22T10:00:00.000Z")
  assert.equal(result.verificacaoDoCampo, null)
  assert.equal(result.atualizacaoDaFicha, null)
  assert.equal(result.proximaColetaDemonstrada, null)
})

test("erro mais recente não é convertido em coleta bem-sucedida", () => {
  const result = buildImprensaFreshnessSource(
    source,
    [receipt(), receipt({ executado_em: "2026-09-22T12:00:00.000Z", resultado: "erro", url: null })],
  )
  assert.equal(result.status, "erro_na_fonte")
  assert.equal(result.ultimaColetaTentada, "2026-09-22T12:00:00.000Z")
  assert.equal(result.ultimaColetaBemSucedida, "2026-09-22T10:00:00.000Z")
})

test("ausência de recibo não vira zero nem agenda futura", () => {
  const result = buildImprensaFreshnessDataset([], "2026-09-22T16:00:00.000Z", [source])
  assert.equal(result.sources[0]?.status, "sem_prova")
  assert.equal(result.sources[0]?.ultimaColetaBemSucedida, null)
  assert.equal(result.sources[0]?.proximaColetaDemonstrada, null)
})

test("limiar do catálogo distingue recibo antigo de agenda futura", () => {
  const camara = IMPRENSA_FRESHNESS_SOURCES.find((item) => item.id === "camara")
  assert.equal(camara?.maxAgeHours, 216)
  assert.equal(camara?.cadence, "weekly")
  const current = { ...source, maxAgeHours: 36 }
  const atLimit = buildImprensaFreshnessSource(current, [receipt()], "2026-09-23T22:00:00.000Z")
  assert.equal(atLimit.status, "sem_agenda")
  const beyondLimit = buildImprensaFreshnessSource(current, [receipt()], "2026-09-23T22:00:01.000Z")
  assert.equal(beyondLimit.status, "limiar_excedido")
  assert.equal(beyondLimit.proximaColetaDemonstrada, null)
})

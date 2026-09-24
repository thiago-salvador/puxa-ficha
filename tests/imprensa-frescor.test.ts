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

test("linha do TSE lê todos os membros de tse-current no catálogo, inclusive a observação", () => {
  const tse = IMPRENSA_FRESHNESS_SOURCES.find((item) => item.id === "tse")
  assert.deepEqual(tse?.receiptSources, ["tse", "tse-situacao", "tse-cpf", "tse-observacao"])
  assert.equal(tse?.maxAgeHours, 36)
  for (const id of ["camara", "senado", "transparencia"]) {
    assert.equal(IMPRENSA_FRESHNESS_SOURCES.find((item) => item.id === id)?.receiptSources, undefined)
  }
})

test("observação semanal dos pacotes do TSE conta como última coleta, e fonte alheia não conta", () => {
  // Regressão de 24/09: o ingest manual parou em 14/09 e a observação de 23/09
  // leu os pacotes oficiais, mas a página só olhava a fonte `tse`.
  const tse = IMPRENSA_FRESHNESS_SOURCES.find((item) => item.id === "tse")
  assert.ok(tse)
  const receipts = [
    receipt({ executado_em: "2026-09-14T21:04:36.000Z" }),
    receipt({
      fonte: "tse-observacao",
      executado_em: "2026-09-23T13:19:18.000Z",
      url: "https://dadosabertos.tse.jus.br/dataset/candidatos-2026",
    }),
    receipt({ fonte: "tse-historico", executado_em: "2026-09-24T09:00:00.000Z" }),
    receipt({ fonte: "camara", executado_em: "2026-09-24T09:30:00.000Z" }),
  ]
  const result = buildImprensaFreshnessSource(tse, receipts, "2026-09-24T12:00:00.000Z")
  assert.equal(result.status, "sem_agenda")
  assert.equal(result.ultimaColetaBemSucedida, "2026-09-23T13:19:18.000Z")
  assert.equal(result.ultimaColetaTentada, "2026-09-23T13:19:18.000Z")
  assert.equal(result.fonteUrl, "https://dadosabertos.tse.jus.br/dataset/candidatos-2026")
  assert.equal(result.verificacaoDoCampo, null)
  assert.equal(result.atualizacaoDaFicha, null)

  const withoutObservation = buildImprensaFreshnessSource(tse, receipts.slice(0, 1), "2026-09-24T12:00:00.000Z")
  assert.equal(withoutObservation.status, "limiar_excedido")
})

test("erro mais recente da observação continua visível na linha do TSE", () => {
  const tse = IMPRENSA_FRESHNESS_SOURCES.find((item) => item.id === "tse")
  assert.ok(tse)
  const result = buildImprensaFreshnessSource(tse, [
    receipt({ executado_em: "2026-09-23T10:00:00.000Z" }),
    receipt({ fonte: "tse-observacao", executado_em: "2026-09-23T13:00:00.000Z", resultado: "erro", url: null }),
  ], "2026-09-23T14:00:00.000Z")
  assert.equal(result.status, "erro_na_fonte")
  assert.equal(result.ultimaColetaBemSucedida, "2026-09-23T10:00:00.000Z")
})

import assert from "node:assert/strict"
import { test } from "node:test"

import { collectDivulgaFinancing, type FinancingIdentity } from "../scripts/tse-local/divulga-financing"
import type { TseChromeClient } from "../scripts/tse-local/chrome-fetch"

const identity: FinancingIdentity = {
  uf: "AP", sqCandidato: "30002549911", cargoCodigo: 5, partidoNumero: 15, numeroCandidato: 151,
}
const electionId = "20322002026"
const root = "https://divulgacandcontas.tse.jus.br/divulga/rest/v1"
const elections = [{ id: electionId, ano: 2026 }, { id: "2040602024", ano: 2024 }]
type WithClient = NonNullable<Parameters<typeof collectDivulgaFinancing>[1]>
const accountUrl = `${root}/prestador/consulta/${electionId}/2026/AP/5/15/151/${identity.sqCandidato}`
const receiptsUrl = (page: number) => `${root}/prestador/consulta/receitas/${electionId}/6825852639/991/lista?pagina=${page}`
const accountWithDelivery = {
  idEleicao: Number(electionId),
  ano: 2026,
  sgUe: identity.uf,
  nrPartido: 15,
  nrCandidato: 151,
  idCandidato: identity.sqCandidato,
  idPrestador: "6825852639",
  idUltimaEntrega: "991",
  entregaAtual: null,
  historicoEntregas: [{ idEntrega: "991" }],
  cpf: "CPF-TESTE-FICTICIO",
}

function clientFor(
  getJson: (url: string) => unknown | Promise<unknown>,
  seen: string[],
): WithClient {
  return async <T>(run: (client: TseChromeClient) => Promise<T>): Promise<T> => run({
    getJson: async (url) => { seen.push(url); return getJson(url) },
    downloadZip: async () => { throw new Error("não usado") },
  } as TseChromeClient)
}

function matchingPayload(url: string, receiptsByPage: Record<number, unknown>): unknown {
  if (url === `${root}/eleicao/ordinarias`) return elections
  if (url === accountUrl) return accountWithDelivery
  const page = Number(new URL(url).searchParams.get("pagina"))
  return receiptsByPage[page]
}

test("collects every receipt page and returns only whitelisted finance fields", async () => {
  const seen: string[] = []
  const receipt = (amount: number, date: string) => ({
    cpfCnpjDoador: "CPF-TESTE-FICTICIO",
    nomeDoador: "NOME-TESTE-FICTICIO",
    cpfCnpjDoadorOriginario: "CPF-ORIGEM-TESTE-FICTICIO",
    nomeDoadorOriginario: "NOME-ORIGEM-TESTE-FICTICIO",
    tituloEleitor: "TITULO-TESTE-FICTICIO",
    dtReceita: date,
    codReceita: 1001,
    valorReceita: amount,
    especieRecurso: "Financeiro",
    fonteOrigem: "Pessoa física",
    stFinanciamentoColetivo: false,
    stPessoaRateio: false,
    nrReciboEleitoral: "RECIBO-1",
  })
  const rows = await collectDivulgaFinancing([identity], clientFor(
    (url) => matchingPayload(url, { 1: [receipt(12.5, "2026-08-01"), receipt(20, "2026-08-02")], 2: [receipt(4, "2026-08-03")], 3: [] }),
    seen,
  ))

  assert.equal(rows[0]?.resultado, "encontrado")
  assert.equal(rows[0]?.estado_prestacao, "apresentada")
  assert.equal(rows[0]?.quantidade_receitas, 3)
  assert.equal(rows[0]?.total_arrecadado, 36.5)
  assert.equal(rows[0]?.paginas_consultadas, 3)
  assert.match(rows[0]?.sha256_receitas_sanitizadas ?? "", /^[a-f0-9]{64}$/)
  assert.equal(rows[0]?.fonte, receiptsUrl(3))
  assert.equal(rows[0]?.receitas?.length, 3)
  assert.equal(seen.includes(receiptsUrl(1)), true)
  assert.equal(seen.includes(receiptsUrl(2)), true)
  assert.equal(seen.includes(receiptsUrl(3)), true)
  const serialized = JSON.stringify(rows)
  for (const secret of ["CPF-TESTE-FICTICIO", "CPF-ORIGEM-TESTE-FICTICIO", "NOME-TESTE-FICTICIO", "NOME-ORIGEM-TESTE-FICTICIO", "TITULO-TESTE-FICTICIO", "RECIBO-1"]) {
    assert.equal(serialized.includes(secret), false)
  }
  assert.deepEqual(Object.keys(rows[0]!.receitas![0]!).sort(), [
    "codigo_receita", "data_receita", "especie_recurso", "financiamento_coletivo",
    "fonte_origem", "rateio_pessoa_fisica", "valor",
  ])
})

test("confirms no submission only when official account response explicitly has no delivery", async () => {
  const seen: string[] = []
  const noSubmission = {
    idEleicao: Number(electionId), ano: 2026, sgUe: identity.uf,
    nrPartido: 15, nrCandidato: 151,
    idCandidato: identity.sqCandidato, idPrestador: "6825852639",
    idUltimaEntrega: null, entregaAtual: null, historicoEntregas: [],
    dadosConsolidados: null,
  }
  const rows = await collectDivulgaFinancing([identity], clientFor((url) => {
    if (url === `${root}/eleicao/ordinarias`) return elections
    if (url === accountUrl) return noSubmission
    throw new Error("receipt request must not run")
  }, seen))

  assert.equal(rows[0]?.resultado, "vazio_confirmado")
  assert.equal(rows[0]?.estado_prestacao, "nao_apresentada")
  assert.equal(rows[0]?.quantidade_receitas, 0)
  assert.equal(rows[0]?.total_arrecadado, null)
  assert.deepEqual(rows[0]?.receitas, [])
  assert.equal(rows[0]?.paginas_consultadas, 0)
  assert.equal(rows[0]?.sha256_receitas_sanitizadas, null)
  assert.equal(seen.some((url) => url.includes("/receitas/")), false)
})

test("keeps a submitted account with an empty receipts list distinct from no submission", async () => {
  const rows = await collectDivulgaFinancing([identity], clientFor(
    (url) => matchingPayload(url, { 1: [] }), [],
  ))
  assert.equal(rows[0]?.resultado, "vazio_confirmado")
  assert.equal(rows[0]?.estado_prestacao, "apresentada")
  assert.equal(rows[0]?.quantidade_receitas, 0)
  assert.equal(rows[0]?.total_arrecadado, 0)
  assert.deepEqual(rows[0]?.receitas, [])
  assert.equal(rows[0]?.paginas_consultadas, 1)
  assert.match(rows[0]?.sha256_receitas_sanitizadas ?? "", /^[a-f0-9]{64}$/)
})

test("account identity mismatch cannot be reported as confirmed no submission", async () => {
  const noSubmission = {
    idEleicao: Number(electionId), ano: 2026, sgUe: identity.uf,
    nrPartido: 99, nrCandidato: 151,
    idCandidato: identity.sqCandidato, idPrestador: "6825852639",
    idUltimaEntrega: null, entregaAtual: null, historicoEntregas: [], dadosConsolidados: null,
  }
  const rows = await collectDivulgaFinancing([identity], clientFor((url) => {
    if (url === `${root}/eleicao/ordinarias`) return elections
    if (url === accountUrl) return noSubmission
    throw new Error("unexpected request")
  }, []))
  assert.equal(rows[0]?.resultado, "indeterminado")
  assert.equal(rows[0]?.estado_prestacao, "indeterminada")
  assert.equal(rows[0]?.receitas, null)
})

test("maps HTTP 403 to a safe error state without preserving exception text", async () => {
  const rows = await collectDivulgaFinancing([identity], clientFor((url) => {
    if (url === `${root}/eleicao/ordinarias`) return elections
    if (url === accountUrl) throw new Error("HTTP 403 private-body-sentinel blocked")
    throw new Error("unexpected request")
  }, []))
  assert.equal(rows[0]?.resultado, "erro")
  assert.equal(rows[0]?.estado_prestacao, "indeterminada")
  assert.equal(rows[0]?.receitas, null)
  const serialized = JSON.stringify(rows)
  assert.equal(serialized.includes("private-body-sentinel"), false)
  assert.equal(serialized.includes("blocked"), false)
})

test("an endpoint error after a non-empty page fails closed instead of returning partial receipts", async () => {
  const seen: string[] = []
  const rows = await collectDivulgaFinancing([identity], clientFor((url) => {
    if (url === `${root}/eleicao/ordinarias`) return elections
    if (url === accountUrl) return accountWithDelivery
    if (url === receiptsUrl(1)) return [{ dtReceita: "2026-08-01", codReceita: 1, valorReceita: 9 }]
    throw new Error("temporary source error")
  }, seen))
  assert.equal(rows[0]?.resultado, "erro")
  assert.equal(rows[0]?.receitas, null)
  assert.equal(rows[0]?.quantidade_receitas, null)
  assert.equal(JSON.stringify(rows).includes("temporary source error"), false)
  assert.equal(seen.includes(receiptsUrl(2)), true)
})

test("malformed receipt response stays indeterminate, not confirmed empty", async () => {
  const rows = await collectDivulgaFinancing([identity], clientFor(
    (url) => matchingPayload(url, { 1: { error: "bad response" } }), [],
  ))
  assert.equal(rows[0]?.resultado, "indeterminado")
  assert.equal(rows[0]?.receitas, null)
})

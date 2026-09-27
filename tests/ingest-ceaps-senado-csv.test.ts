import assert from "node:assert/strict"
import test from "node:test"
import { agregarDespesasCeapsCsv, ceapsNamesForSenator, ceapsReceiptOutcome, classifyCeapsLegacyRow, fetchCeapsSnapshot, parseCeapsCsv, withinCeapsUnpublishCaps } from "../scripts/lib/ingest-ceaps-senado"
import { parseCeapsRows } from "../scripts/audit/fetch-parliamentary-family-sources-local"

const HEADER = '"ULTIMA ATUALIZACAO";"26/09/2026 02:02"\r\n"ANO";"MES";"SENADOR";"TIPO_DESPESA";"CNPJ_CPF";"FORNECEDOR";"DOCUMENTO";"DATA";"DETALHAMENTO";"VALOR_REEMBOLSADO";"COD_DOCUMENTO"\r\n'

test("CEAPS CSV: lê o cabeçalho após o preâmbulo e descarta campos documentais", () => {
  const csv = `${HEADER}"2026";"1";"ANA SENADORA";"PASSAGENS";"12345678000199";"FORNECEDOR";"DOC-1";"20/01/2026";"Detalhe";"1.234,56";"42"\r\n`
  const rows = parseCeapsCsv(Buffer.from(csv, "latin1"), 2026)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].SENADOR, "ANA SENADORA")
  assert.equal("CNPJ_CPF" in rows[0], false)
  assert.equal(JSON.stringify(rows).includes("12345678000199"), false)
})

test("CEAPS CSV: decodifica Windows-1252 antes da guarda e mantém o cabeçalho após o preâmbulo", () => {
  const csv = `${HEADER}"2026";"1";"ANA SENADORA";"\u0001Divulgação\u0002 da atividade parlamentar";"12345678000199";"FORNECEDOR";"DOC-1";"20/01/2026";"Detalhe";"1.234,56";"42"\r\n`
  const bytes = Buffer.from(csv, "latin1")
  const openQuote = bytes.indexOf(0x01)
  const closeQuote = bytes.indexOf(0x02)
  assert.notEqual(openQuote, -1)
  assert.notEqual(closeQuote, -1)
  bytes[openQuote] = 0x93
  bytes[closeQuote] = 0x94

  const rows = parseCeapsCsv(bytes, 2026)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].TIPO_DESPESA, "“Divulgação” da atividade parlamentar")
  assert.doesNotMatch(rows[0].TIPO_DESPESA, /[\u0080-\u009f\uFFFD]/)
})

test("CEAPS CSV: preserva linha sem DATA com a coluna vazia na posição oficial", () => {
  const csv = `${HEADER}"2026";"1";"ANA SENADORA";"PASSAGENS";"12345678000199";"FORNECEDOR";"DOC-1";"Detalhe";"1.234,56";"42"\r\n`
  const rows = parseCeapsCsv(Buffer.from(csv, "latin1"), 2026)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].DATA, "")
  const aggregate = agregarDespesasCeapsCsv(rows, "ANA SENADORA", 2026)
  assert.equal(aggregate.dados?.total, 1234.56)
})

test("CEAPS CSV: alinha uma linha sem DOCUMENTO pela data que ocupa a coluna DOCUMENTO", () => {
  const csv = `${HEADER}"2020";"1";"SENADOR DE TESTE";"SERVICO";"00.000.000/0000-00";"FORNECEDOR TESTE";"20/01/2020";"DESCRICAO DE TESTE";"123,45";"42"\r\n`
  const rows = parseCeapsCsv(Buffer.from(csv, "latin1"), 2020)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].DATA, "20/01/2020")
  assert.equal(rows[0].VALOR_REEMBOLSADO, "123,45")
})

test("CEAPS CSV: reconstitui grupo de milhar separado por CRLF no arquivo oficial", () => {
  const csv = `${HEADER}"2013";"1";"ANA SENADORA";"PASSAGENS";"12345678000199";"FORNECEDOR";"DOC-1";"20/01/2013";"Detalhe";"1\r\n675,55";"42"\r\n`
  const rows = parseCeapsCsv(Buffer.from(csv, "latin1"), 2013)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].VALOR_REEMBOLSADO, "1.675,55")
  const aggregate = agregarDespesasCeapsCsv(rows, "ANA SENADORA", 2013)
  assert.equal(aggregate.dados?.total, 1675.55)
})

test("CEAPS captura de recibos compartilha a normalização restrita do valor antigo", () => {
  const csv = `${HEADER}"2013";"1";"ANA SENADORA";"PASSAGENS";"12345678000199";"FORNECEDOR";"DOC-1";"20/01/2013";"Detalhe";"1\r\n675,55";"42"\r\n`
  const rows = parseCeapsRows(Buffer.from(csv, "latin1"), 2013)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].VALOR_REEMBOLSADO, "1.675,55")
})

test("CEAPS CSV: mantém quebra de linha inválida como erro, sem corrigir o valor por palpite", () => {
  const csv = `${HEADER}"2013";"1";"ANA SENADORA";"PASSAGENS";"12345678000199";"FORNECEDOR";"DOC-1";"20/01/2013";"Detalhe";"1\r\n67,55";"42"\r\n`
  assert.throws(() => parseCeapsCsv(Buffer.from(csv, "latin1"), 2013), /campos obrigatórios inválidos/)
})

test("CEAPS CSV: falha fechada em ano divergente ou sem registros", () => {
  assert.throws(() => parseCeapsCsv(Buffer.from(`${HEADER}"2025";"1";"ANA SENADORA";"PASSAGENS";"x";"FORNECEDOR";"DOC";"20/01/2025";"";"10,00";"42"\r\n`, "latin1"), 2026), /ano inválido/)
  assert.throws(() => parseCeapsCsv(Buffer.from(HEADER, "latin1"), 2026), /sem linhas/)
})

test("CEAPS CSV: tolera aspas literais não escapadas e vírgula decimal parcial sem perder linha", () => {
  const csv = `${HEADER}2026;1;ANA SENADORA;PASSAGENS;;FORNE"CEDOR;DOC;20/01/2026;;,0;42\r\n2026;2;ANA SENADORA;PASSAGENS;;FORNECEDOR;DOC;20/02/2026;;1,;43\r\n`
  const rows = parseCeapsCsv(Buffer.from(csv, "latin1"), 2026)
  assert.equal(rows.length, 2)
  const aggregate = agregarDespesasCeapsCsv(rows, "ANA SENADORA", 2026)
  assert.equal(aggregate.dados?.total, 1)
})

test("CEAPS CSV: reconstitui uma única coluna vazia omitida quando datas e valor confirmam a posição", () => {
  const csv = `${HEADER}2026;1;ANA SENADORA;PASSAGENS;FORNECEDOR;DOC;20/01/2026;;10,00;42\r\n`
  const rows = parseCeapsCsv(Buffer.from(csv, "latin1"), 2026)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].FORNECEDOR, "FORNECEDOR")
  assert.equal("CNPJ_CPF" in rows[0], false)
})

test("CEAPS CSV: agrega somente o nome e o ano pedidos sem expor CNPJ", () => {
  const csv = `${HEADER}"2026";"1";"ANA SENADORA";"PASSAGENS";"12345678000199";"FORNECEDOR";"DOC-1";"20/01/2026";"";"1.234,56";"42"\r\n"2026";"2";"OUTRO SENADOR";"HOSPEDAGEM";"98765432000199";"OUTRO";"DOC-2";"20/02/2026";"";"99,00";"43"\r\n`
  const rows = parseCeapsCsv(Buffer.from(csv, "latin1"), 2026)
  const aggregate = agregarDespesasCeapsCsv(rows, "ANA SENADORA", 2026)
  assert.equal(aggregate.quantidade, 1)
  assert.equal(aggregate.dados?.total, 1234.56)
  assert.deepEqual(aggregate.dados?.porCategoria, { PASSAGENS: 1234.56 })
  assert.equal(JSON.stringify(aggregate).includes("12345678000199"), false)
})

test("CEAPS: null na outra Casa não autoriza tombstone de linha legada", () => {
  assert.equal(classifyCeapsLegacyRow({ sourceRows: 0, annualCsvComplete: true, rosterMembershipVerified: true, noCompetingHouseIdentity: true }), "review")
})

test("CEAPS: tombstone considera somente proveniência Senado positiva e aliases históricos", () => {
  assert.equal(classifyCeapsLegacyRow({ sourceRows: 0, annualCsvComplete: true, rosterMembershipVerified: false, noCompetingHouseIdentity: true, senateProvenanceVerified: true }), "absent")
  assert.deepEqual(ceapsNamesForSenator("17", [new Map([["17", "Nome Atual"]]), new Map([["17", "Nome Anterior"]])]), ["Nome Atual", "Nome Anterior"])
})

test("CEAPS fetch: resposta 200 vazia ou Content-Length truncado nunca comprova cobertura", async () => {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = async () => new Response("", { status: 200, headers: { "content-type": "text/csv" } })
    await assert.rejects(fetchCeapsSnapshot(2026), /sem cabeçalho|sem linhas|sem registros/i)
    globalThis.fetch = async () => new Response(`${HEADER}2026;1;ANA;PASSAGENS;;FORNECEDOR;DOC;20/01/2026;;10,00;42\r\n`, { status: 200, headers: { "content-length": "999999", "content-type": "text/csv" } })
    await assert.rejects(fetchCeapsSnapshot(2026), /Content-Length divergente/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("CEAPS: tombstones falham fechados por teto de lote e razão", () => {
  assert.equal(withinCeapsUnpublishCaps({ candidateUnpublishes: 1, runUnpublishes: 0, candidateScopeYears: 19 }), true)
  assert.equal(withinCeapsUnpublishCaps({ candidateUnpublishes: 2, runUnpublishes: 0, candidateScopeYears: 19 }), false)
  assert.equal(withinCeapsUnpublishCaps({ candidateUnpublishes: 1, runUnpublishes: 100, candidateScopeYears: 19 }), false)
  assert.equal(withinCeapsUnpublishCaps({ candidateUnpublishes: 1, runUnpublishes: 0, candidateScopeYears: 5 }), false)
})

test("CEAPS: receipt mantém achado confirmado quando uma escrita posterior falha", () => {
  assert.equal(ceapsReceiptOutcome({ scopeIndeterminate: false, hasErrors: true, sourceRows: 4, rowsUpserted: 2 }), "encontrado")
  assert.equal(ceapsReceiptOutcome({ scopeIndeterminate: false, hasErrors: true, sourceRows: 0, rowsUpserted: 0 }), "erro")
})

import assert from "node:assert/strict"
import test from "node:test"
import { agregarDespesasCeapsCsv, parseCeapsCsv } from "../scripts/lib/ingest-ceaps-senado"

const HEADER = '"ULTIMA ATUALIZACAO";"26/09/2026 02:02"\r\n"ANO";"MES";"SENADOR";"TIPO_DESPESA";"CNPJ_CPF";"FORNECEDOR";"DOCUMENTO";"DATA";"DETALHAMENTO";"VALOR_REEMBOLSADO";"COD_DOCUMENTO"\r\n'

test("CEAPS CSV: lê o cabeçalho após o preâmbulo e descarta campos documentais", () => {
  const csv = `${HEADER}"2026";"1";"ANA SENADORA";"PASSAGENS";"12345678000199";"FORNECEDOR";"DOC-1";"20/01/2026";"Detalhe";"1.234,56";"42"\r\n`
  const rows = parseCeapsCsv(Buffer.from(csv, "latin1"), 2026)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].SENADOR, "ANA SENADORA")
  assert.equal("CNPJ_CPF" in rows[0], false)
  assert.equal(JSON.stringify(rows).includes("12345678000199"), false)
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

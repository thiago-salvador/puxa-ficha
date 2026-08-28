import assert from "node:assert/strict"
import test from "node:test"

import { conferirReembolsos, declararJarbasNaoAplicavel } from "../scripts/lib/ingest-jarbas"
import type { IngestResult } from "../scripts/lib/types"
import {
  agregarDespesasCeapsOficial,
  agregarDespesasDoAno,
  detalhamentoCeaps,
} from "../scripts/lib/ingest-ceaps-senado"

// Irmaos do incidente de 2026-08-04 (sancoes com `cpfCnpj`, parametro que a API
// ignorava em silencio, devolvendo a lista nacional para todo candidato).
//
// A auditoria que veio depois procurou o mesmo desenho em todos os ingests: (A)
// filtrar por parametro de query, e (B) nao conferir no retorno se o registro e
// mesmo da entidade consultada. B sozinho ja basta para o dado falso entrar.
//
// Achados que estes testes cobrem:
//   - jarbas: monta `?applicant_id=`, declara `applicant_id` no retorno e nunca
//     compara. O que ele grava e `pontos_atencao` com gravidade alta, texto de
//     acusacao nomeada. Em 2026-08-05 a API esta 404, entao e risco dormente.
//   - ceaps-senado: nunca lia `IdentificacaoParlamentar`, e somava na linha do
//     ano PEDIDO qualquer ano que a API devolvesse.

const DEPUTADO = 204554
const OUTRO_DEPUTADO = 999888

function reembolso(overrides: Record<string, unknown> = {}) {
  return {
    document_id: 6789,
    applicant_id: DEPUTADO,
    year: 2023,
    month: 5,
    subquota_description: "DIVULGAÇÃO DA ATIVIDADE PARLAMENTAR",
    supplier: "FORNECEDOR GENERICO LTDA",
    net_values: [1200.5],
    suspicions: { over_monthly_subquota_limit: true },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Jarbas
// ---------------------------------------------------------------------------

test("jarbas: reembolso de outro applicant_id condena a resposta inteira", () => {
  const conferencia = conferirReembolsos(
    [reembolso(), reembolso({ document_id: 2, applicant_id: OUTRO_DEPUTADO })],
    DEPUTADO
  )
  assert.equal(conferencia.ok, false)
  assert.ok(!conferencia.ok && /nao foi respeitado/.test(conferencia.motivo))
})

test("jarbas: lista inteira de terceiros (filtro ignorado) e recusada", () => {
  const conferencia = conferirReembolsos(
    [
      reembolso({ document_id: 1, applicant_id: 111111 }),
      reembolso({ document_id: 2, applicant_id: 222222 }),
      reembolso({ document_id: 3, applicant_id: 333333 }),
    ],
    DEPUTADO
  )
  assert.equal(conferencia.ok, false)
})

test("jarbas: applicant_id ausente no registro nao passa", () => {
  const conferencia = conferirReembolsos([reembolso({ applicant_id: undefined })], DEPUTADO)
  assert.equal(conferencia.ok, false)
  assert.ok(!conferencia.ok && /ausente/.test(conferencia.motivo))
})

test("jarbas: resposta sem lista nao passa", () => {
  assert.equal(conferirReembolsos(undefined, DEPUTADO).ok, false)
  assert.equal(conferirReembolsos(null, DEPUTADO).ok, false)
})

test("jarbas: reembolsos do proprio deputado passam (guard nao rejeita tudo)", () => {
  const conferencia = conferirReembolsos([reembolso(), reembolso({ document_id: 2 })], DEPUTADO)
  assert.equal(conferencia.ok, true)
  assert.equal(conferencia.ok && conferencia.reembolsos.length, 2)
})

test("jarbas: candidato sem ID da Camara e nao aplicavel, nao indeterminado", () => {
  const resultado: IngestResult = {
    source: "jarbas",
    candidato: "sem-id-camara",
    tables_updated: [],
    rows_upserted: 0,
    errors: [],
    duration_ms: 0,
  }

  declararJarbasNaoAplicavel(resultado)

  assert.equal(resultado.coleta_resultado, "nao_aplicavel")
  assert.match(resultado.coleta_detalhe ?? "", /sem ID da Camara/)
})

test("jarbas: lista vazia passa e nao inventa reembolso", () => {
  const conferencia = conferirReembolsos([], DEPUTADO)
  assert.equal(conferencia.ok, true)
  assert.deepEqual(conferencia.ok && conferencia.reembolsos, [])
})

// ---------------------------------------------------------------------------
// CEAPS Senado
// ---------------------------------------------------------------------------

function payloadDespesas(codigo: string | number | undefined, anos: { NumAno: string; valor: string }[]) {
  return {
    DespesasSenador: {
      Parlamentar: {
        IdentificacaoParlamentar:
          codigo === undefined ? {} : { CodigoParlamentar: codigo, NomeParlamentar: "SENADOR GENERICO" },
      },
      Periodo: {
        Ano: anos.map((a) => ({
          NumAno: a.NumAno,
          Mes: [{ NumMes: "3", Despesa: [{ TipoDespesa: "PASSAGENS", ValorDespesa: a.valor }] }],
        })),
      },
    },
  }
}

test("ceaps: despesas de outro parlamentar sao recusadas", () => {
  const conferencia = agregarDespesasDoAno(
    payloadDespesas(9999, [{ NumAno: "2021", valor: "1.000,00" }]),
    456,
    2021
  )
  assert.equal(conferencia.ok, false)
  assert.ok(!conferencia.ok && /nao do 456/.test(conferencia.motivo))
})

test("ceaps: ano que a API devolveu sem ser o pedido nao entra na linha do ano pedido", () => {
  const conferencia = agregarDespesasDoAno(
    payloadDespesas(456, [
      { NumAno: "2021", valor: "1.000,00" },
      { NumAno: "2023", valor: "9.000,00" },
    ]),
    456,
    2021
  )
  assert.equal(conferencia.ok, true)
  assert.ok(conferencia.ok && conferencia.dados)
  const dados = conferencia.ok ? conferencia.dados : null
  assert.equal(dados?.total, 1000, "somar 2023 na linha de 2021 nao e dado incompleto, e dado errado")
  assert.deepEqual(dados?.anosDescartados, ["2023"])
})

test("ceaps: bloco sem NumAno e descartado, nao somado na linha do ano pedido", () => {
  for (const semAno of ["", "   "]) {
    const conferencia = agregarDespesasDoAno(
      payloadDespesas(456, [
        { NumAno: "2021", valor: "1.000,00" },
        { NumAno: semAno, valor: "9.000,00" },
      ]),
      456,
      2021
    )
    assert.equal(conferencia.ok, true)
    const dados = conferencia.ok ? conferencia.dados : null
    assert.equal(
      dados?.total,
      1000,
      "despesa de ano desconhecido nao pode virar despesa do ano pedido"
    )
    assert.deepEqual(dados?.anosDescartados, ["sem ano"], "o descarte precisa ser visivel")
  }
})

test("ceaps: CodigoParlamentar ausente nao reprova a resposta", () => {
  const conferencia = agregarDespesasDoAno(
    payloadDespesas(undefined, [{ NumAno: "2021", valor: "2.500,50" }]),
    456,
    2021
  )
  assert.equal(conferencia.ok, true)
  assert.equal(conferencia.ok && conferencia.dados?.total, 2500.5)
})

test("ceaps: codigo do proprio senador passa e agrega por categoria", () => {
  const conferencia = agregarDespesasDoAno(
    payloadDespesas("456", [{ NumAno: "2021", valor: "1.234,56" }]),
    456,
    2021
  )
  assert.equal(conferencia.ok, true)
  const dados = conferencia.ok ? conferencia.dados : null
  assert.equal(dados?.total, 1234.56)
  assert.equal(dados?.porCategoria["PASSAGENS"], 1234.56)
  assert.equal(dados?.destaques.length, 1)
  assert.deepEqual(dados?.anosDescartados, [])
})

test("ceaps: payload vazio ou sem periodo devolve nulo sem erro", () => {
  assert.deepEqual(agregarDespesasDoAno(null, 456, 2021), { ok: true, dados: null })
  assert.deepEqual(agregarDespesasDoAno({}, 456, 2021), { ok: true, dados: null })
  assert.deepEqual(agregarDespesasDoAno({ DespesasSenador: {} }, 456, 2021), { ok: true, dados: null })
})

test("ceaps: so o ano pedido volta zerado quando todo valor e de outro ano", () => {
  const conferencia = agregarDespesasDoAno(
    payloadDespesas(456, [{ NumAno: "2024", valor: "5.000,00" }]),
    456,
    2021
  )
  assert.equal(conferencia.ok, true)
  assert.equal(conferencia.ok && conferencia.dados, null, "sem despesa do ano pedido, nada e gravado")
})

test("ceaps oficial: filtra senador e ano no conjunto anual", () => {
  const conferencia = agregarDespesasCeapsOficial(
    [
      { codSenador: 456, ano: 2026, tipoDespesa: "Passagens", fornecedor: "A", data: "2026-02-01", valorReembolsado: 100.5 },
      { codSenador: 999, ano: 2026, tipoDespesa: "Passagens", fornecedor: "B", data: "2026-02-02", valorReembolsado: 9000 },
      { codSenador: 456, ano: 2025, tipoDespesa: "Passagens", fornecedor: "C", data: "2025-02-03", valorReembolsado: 8000 },
      { codSenador: "456", ano: "2026", tipoDespesa: "Aluguel", fornecedor: "D", data: "2026-02-04", valorReembolsado: "200,25" },
    ],
    456,
    2026,
  )

  assert.equal(conferencia.ok, true)
  const dados = conferencia.ok ? conferencia.dados : null
  assert.equal(dados?.total, 300.75)
  assert.equal(dados?.porCategoria.PASSAGENS, 100.5)
  assert.equal(dados?.porCategoria.ALUGUEL, 200.25)
  assert.deepEqual(dados?.anosDescartados, ["2025"])
})

test("ceaps oficial: ausencia do senador no conjunto nao vira gasto de outra pessoa", () => {
  const conferencia = agregarDespesasCeapsOficial(
    [{ codSenador: 999, ano: 2026, tipoDespesa: "Passagens", valorReembolsado: 5000 }],
    456,
    2026,
  )
  assert.deepEqual(conferencia, { ok: true, dados: null })
})

test("ceaps grava detalhamento no contrato de lista consumido pela ficha", () => {
  assert.deepEqual(detalhamentoCeaps({ PASSAGENS: 100.567, ALUGUEL: 200 }), [
    { categoria: "PASSAGENS", valor: 100.57 },
    { categoria: "ALUGUEL", valor: 200 },
  ])
})

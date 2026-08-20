import assert from "node:assert/strict"
import test from "node:test"
import type { GastoExecutivo } from "@/lib/types"
import {
  formatarStatusSigilo,
  groupGastosExecutivoPorOrgao,
  nomeDePortadorNaFicha,
  rotuloFonteGastosExecutivo,
  rotuloUnidadeGestora,
} from "@/lib/gastos-executivo-display"

function row(
  partial: Partial<GastoExecutivo> & Pick<GastoExecutivo, "id" | "mes_extrato" | "valor_total">,
): GastoExecutivo {
  return {
    candidato_id: "candidato-teste",
    orgao_codigo: "20101",
    orgao_nome: "Presidência da República",
    ug_codigo: "110322",
    ug_nome: "GABINETE DE SEGURANCA INSTITUCIONAL/PR",
    qtd_transacoes: 1,
    qtd_portador_sigiloso: 1,
    qtd_portador_nominado: 0,
    qtd_portador_ausente: 0,
    qtd_estabelecimento_sigiloso: 1,
    qtd_estabelecimento_nominado: 0,
    qtd_estabelecimento_ausente: 0,
    fonte: "https://portaldatransparencia.gov.br/cartoes",
    coletado_em: "2026-08-16T04:00:00.000Z",
    ...partial,
  }
}

test("agrupa por órgão, nunca soma órgãos diferentes, e devolve mandato, ano corrente e último mês com movimento", () => {
  const now = new Date("2026-08-19T15:00:00-03:00")
  const grouped = groupGastosExecutivoPorOrgao(
    [
      row({ id: "pref", mes_extrato: "2024-06-01", valor_total: 5_000, orgao_codigo: "99001", orgao_nome: "Prefeitura" }),
      row({ id: "2025-12", mes_extrato: "2025-12-01", valor_total: 40 }),
      row({ id: "2026-01", mes_extrato: "2026-01-01", valor_total: 10 }),
      row({ id: "2026-02-zero", mes_extrato: "2026-02-01", valor_total: 0 }),
      row({ id: "2026-03", mes_extrato: "2026-03-01", valor_total: 50 }),
    ],
    now,
  )

  assert.deepEqual(
    grouped.map((orgao) => orgao.codigo),
    ["99001", "20101"],
  )

  const presidencia = grouped.find((orgao) => orgao.codigo === "20101")
  assert.ok(presidencia)
  assert.equal(presidencia.nome, "Presidência da República")
  assert.equal(presidencia.totalMandato, 100)
  assert.equal(presidencia.anoCorrente, 2026)
  assert.equal(presidencia.totalAnoCorrente, 60)
  assert.equal(presidencia.ultimoMesComMovimento?.mes_extrato, "2026-03-01")
  assert.equal(presidencia.ultimoMesComMovimento?.valor_total, 50)
  assert.deepEqual(
    presidencia.anos.map((ano) => ({ ano: ano.ano, total: ano.total })),
    [
      { ano: 2026, total: 60 },
      { ano: 2025, total: 40 },
    ],
  )

  const prefeitura = grouped.find((orgao) => orgao.codigo === "99001")
  assert.ok(prefeitura)
  assert.equal(prefeitura.totalMandato, 5_000)
  assert.equal(prefeitura.totalAnoCorrente, 0)
})

test("ano civil corrente sem linha na série rende total zero, sem inventar mês", () => {
  const grouped = groupGastosExecutivoPorOrgao(
    [row({ id: "2025-12", mes_extrato: "2025-12-01", valor_total: 40 })],
    new Date("2026-08-19T15:00:00-03:00"),
  )

  assert.equal(grouped[0].totalMandato, 40)
  assert.equal(grouped[0].totalAnoCorrente, 0)
  assert.equal(grouped[0].ultimoMesComMovimento?.mes_extrato, "2025-12-01")
})

test("compõe o mandato por unidade gestora e fecha a soma das UGs no total do órgão", () => {
  const grouped = groupGastosExecutivoPorOrgao(
    [
      row({
        id: "gsi-jan",
        mes_extrato: "2026-01-01",
        valor_total: 100,
        qtd_transacoes: 4,
        qtd_portador_sigiloso: 4,
        qtd_estabelecimento_sigiloso: 4,
      }),
      row({
        id: "sg-jan",
        mes_extrato: "2026-01-01",
        valor_total: 50,
        ug_codigo: "110001",
        ug_nome: "SECRETARIA-GERAL/PR",
        qtd_transacoes: 2,
        qtd_portador_sigiloso: 1,
        qtd_portador_nominado: 1,
        qtd_estabelecimento_sigiloso: 2,
      }),
      row({
        id: "gsi-fev",
        mes_extrato: "2026-02-01",
        valor_total: 20,
        qtd_transacoes: 1,
        qtd_portador_sigiloso: 1,
        qtd_estabelecimento_sigiloso: 1,
      }),
    ],
    new Date("2026-08-19T15:00:00-03:00"),
  )

  const presidencia = grouped[0]
  assert.equal(presidencia.totalMandato, 170)
  assert.deepEqual(
    presidencia.unidades.map((ug) => [ug.codigo, ug.valorTotal, ug.qtdTransacoes]),
    [
      ["110322", 120, 5],
      ["110001", 50, 2],
    ],
  )
  const somaUgs = presidencia.unidades.reduce((sum, ug) => sum + ug.valorTotal, 0)
  assert.equal(somaUgs, presidencia.totalMandato)

  assert.equal(presidencia.meses.length, 2)
  assert.equal(presidencia.meses[0].mes_extrato, "2026-02-01")
  assert.equal(presidencia.meses[0].valor_total, 20)
  assert.equal(presidencia.meses[1].mes_extrato, "2026-01-01")
  assert.equal(presidencia.meses[1].valor_total, 150)
  assert.equal(presidencia.ultimoMesComMovimento?.valor_total, 20)

  assert.deepEqual(presidencia.portador, { total: 7, sigiloso: 6, nominado: 1, ausente: 0 })
  assert.deepEqual(presidencia.estabelecimento, { total: 7, sigiloso: 7, nominado: 0, ausente: 0 })
  assert.match(formatarStatusSigilo(presidencia.portador, "Portador"), /sigiloso/)
  assert.match(formatarStatusSigilo(presidencia.portador, "Portador"), /identificado/)
  assert.doesNotMatch(formatarStatusSigilo(presidencia.portador, "Portador"), /Sigiloso/)
  assert.equal(nomeDePortadorNaFicha("Sigiloso"), null)
  assert.equal(nomeDePortadorNaFicha("JOAO PORTADOR"), "JOAO PORTADOR")
})

test("rótulo da fonte distingue o download oficial do CPGF da API de cartões", () => {
  assert.equal(
    rotuloFonteGastosExecutivo("https://portaldatransparencia.gov.br/download-de-dados/cpgf/202601"),
    "Download oficial do CPGF",
  )
  assert.equal(
    rotuloFonteGastosExecutivo("https://portaldatransparencia.gov.br/cartoes"),
    "Portal da Transparência",
  )
})

test("rótulo de unidade gestora usa o nome da fonte e desambigua homônimos pelo código", () => {
  const abin538 = { codigo: "110538", nome: "AGENCIA BRASILEIRA DE INTELIGENCIA" }
  const abin120 = { codigo: "110120", nome: "AGENCIA BRASILEIRA DE INTELIGENCIA" }
  const gsi = { codigo: "110322", nome: "GABINETE DE SEGURANCA INSTITUCIONAL/PR" }
  assert.equal(rotuloUnidadeGestora(gsi, [gsi, abin538]), gsi.nome)
  assert.equal(
    rotuloUnidadeGestora(abin538, [abin538, abin120]),
    "AGENCIA BRASILEIRA DE INTELIGENCIA (110538)",
  )
  assert.equal(
    rotuloUnidadeGestora(abin120, [abin538, abin120]),
    "AGENCIA BRASILEIRA DE INTELIGENCIA (110120)",
  )
})

/**
 * Proveniencia do pleito declarado (auditoria de integridade 2026-07-24,
 * achado A0.1).
 *
 * Estado do banco em 2026-07-25 (project_id wskpzsobvqwhnbsdsmok, somente
 * SELECT): 195 de 195 publicaveis com `status = 'pre-candidato'`, sendo
 * `situacao_candidatura` = 'pre-candidato' em 179, 'incerto' em 15 e NULL em 1.
 * Nenhum registro deferido pelo TSE. Por isso o default tem de ser
 * "declaracao_editorial" em todos os caminhos, inclusive nos ausentes.
 *
 * Desde a migration 20260726120000 sao 184 publicaveis (Senado e Camara fora
 * do escopo do lancamento). A proporcao nao muda o comportamento testado aqui:
 * segue nenhum registro deferido pelo TSE.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  buildCargoDisputadoProvenienceLabel,
  buildCargoDisputadoProvenienceNote,
  resolveCargoDisputadoProveniencia,
} from "@/lib/candidatura-proveniencia"

describe("resolveCargoDisputadoProveniencia", () => {
  it("classifica os tres estados que existem hoje no banco como declaracao editorial", () => {
    assert.equal(
      resolveCargoDisputadoProveniencia({ status: "pre-candidato", situacao_candidatura: "pre-candidato" }),
      "declaracao_editorial",
    )
    assert.equal(
      resolveCargoDisputadoProveniencia({ status: "pre-candidato", situacao_candidatura: "incerto" }),
      "declaracao_editorial",
    )
    assert.equal(
      resolveCargoDisputadoProveniencia({ status: "pre-candidato", situacao_candidatura: null }),
      "declaracao_editorial",
    )
  })

  it("nunca vira registro oficial por ausencia de dado", () => {
    assert.equal(resolveCargoDisputadoProveniencia(null), "declaracao_editorial")
    assert.equal(resolveCargoDisputadoProveniencia({}), "declaracao_editorial")
    assert.equal(resolveCargoDisputadoProveniencia({ status: "" }), "declaracao_editorial")
  })

  it("reconhece registro no TSE quando o pipeline passar a marcar isso", () => {
    assert.equal(
      resolveCargoDisputadoProveniencia({ status: "candidato", situacao_candidatura: "deferido" }),
      "registro_tse",
    )
    // Acento e caixa nao podem mudar a classificacao.
    assert.equal(
      resolveCargoDisputadoProveniencia({ status: null, situacao_candidatura: "DEFERIDO" }),
      "registro_tse",
    )
  })

  it("separa pedido aguardando julgamento de candidatura deferida", () => {
    assert.equal(
      resolveCargoDisputadoProveniencia({
        status: "candidato",
        situacao_candidatura: "aguardando julgamento",
      }),
      "registro_tse_pendente",
    )
    assert.equal(
      buildCargoDisputadoProvenienceLabel("registro_tse_pendente"),
      "Pedido de registro no TSE",
    )
    assert.match(
      buildCargoDisputadoProvenienceNote("registro_tse_pendente"),
      /não equivale a candidatura deferida/i,
    )
  })

  it("não chama situação não informada pelo TSE de julgamento pendente", () => {
    assert.equal(
      resolveCargoDisputadoProveniencia({
        status: "candidato",
        situacao_candidatura: "pedido de registro no TSE; situação não informada no snapshot",
      }),
      "registro_tse_situacao_nao_informada",
    )
    assert.equal(
      buildCargoDisputadoProvenienceLabel("registro_tse_situacao_nao_informada"),
      "Pedido de registro no TSE",
    )
    assert.match(
      buildCargoDisputadoProvenienceNote("registro_tse_situacao_nao_informada"),
      /situação ainda não foi informada/i,
    )
    assert.doesNotMatch(
      buildCargoDisputadoProvenienceNote("registro_tse_situacao_nao_informada"),
      /aguarda julgamento/i,
    )
  })

  it("a chapa vinculada por UUID prevalece sobre rótulo editorial legado", () => {
    assert.equal(
      resolveCargoDisputadoProveniencia({
        status: "pre-candidato",
        situacao_candidatura: "pre-candidato",
        chapa_2026: { tse_situacao_codigo: "#NE" },
      }),
      "registro_tse_situacao_nao_informada",
    )

  })

  it("não rebaixa aguardando julgamento quando o snapshot de chapas muda de SHA", () => {
    assert.equal(
      resolveCargoDisputadoProveniencia({
        status: "candidato",
        situacao_candidatura: "aguardando julgamento",
        chapa_2026: {
          tse_situacao_codigo: "#NE",
          fonte_sha256: "snapshot-oficial-mais-recente",
        },
      }),
      "registro_tse_pendente",
    )
  })
})

describe("copy da proveniencia", () => {
  it("o rotulo de candidatura declarada diz que nao e registro do TSE", () => {
    assert.equal(
      buildCargoDisputadoProvenienceLabel("declaracao_editorial"),
      "Candidatura declarada",
    )
    assert.match(
      buildCargoDisputadoProvenienceNote("declaracao_editorial"),
      /não é registro de candidatura deferido pelo TSE/i,
    )
  })
})

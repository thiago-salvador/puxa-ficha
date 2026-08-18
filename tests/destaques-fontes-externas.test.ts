import assert from "node:assert/strict"
import test from "node:test"

import {
  classificarPatrimonioTse,
  classificarTrajetoriaTse,
  parseValorTse,
  type CandidaturaTseAuditada,
} from "../scripts/audit/lib/destaques-fontes-externas"

const base: CandidaturaTseAuditada = {
  ano: 2022,
  sq: "123",
  identidade: "confirmada",
  resultadoEleitoral: "NÃO ELEITO",
  declarouBens: "N",
  bens: 0,
  valorTotal: 0,
}

test("trajetória TSE não transforma candidatura não eleita em vazio integral", () => {
  assert.equal(classificarTrajetoriaTse([base]), "sem_achado_no_escopo")
  assert.equal(
    classificarTrajetoriaTse([{ ...base, resultadoEleitoral: "ELEITO POR QP" }]),
    "encontrado",
  )
  assert.equal(
    classificarTrajetoriaTse([{ ...base, identidade: "ambigua" }]),
    "indeterminado",
  )
})

test("patrimônio só confirma vazio com identidade e declaração N", () => {
  assert.equal(classificarPatrimonioTse([base]), "vazio_confirmado")
  assert.equal(classificarPatrimonioTse([{ ...base, declarouBens: null }]), "indeterminado")
  assert.equal(classificarPatrimonioTse([{ ...base, bens: 1, valorTotal: 10 }]), "encontrado")
})

test("valor monetário do TSE preserva centavos", () => {
  assert.equal(parseValorTse("1.234.567,89"), 1_234_567.89)
  assert.equal(parseValorTse(""), 0)
})

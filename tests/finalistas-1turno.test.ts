import assert from "node:assert/strict"
import test from "node:test"

import { comFaseEfetiva, recortarFinalistas, statusUf1Turno } from "../src/lib/finalistas-1turno"
import type { FaseEleitoral2026 } from "../src/lib/types"

type Fase = FaseEleitoral2026["fase_eleitoral"]

function c(nome: string, fase?: Fase) {
  return {
    nome,
    fase_eleitoral_2026: fase
      ? { fase_eleitoral: fase, fase_turno: 1 as const, atualizacao_encerrada_em: null }
      : undefined,
  }
}

test("com finalistas, mantém só quem vai ao 2º turno", () => {
  const lista = [c("A", "segundo_turno"), c("B", "nao_eleito"), c("C", "segundo_turno"), c("D", "fora_da_disputa"), c("E")]
  const r = recortarFinalistas(lista)
  assert.equal(r.filtrado, true)
  assert.deepEqual(r.candidatos.map((x) => x.nome), ["A", "C"])
})

test("com vencedor no 1º turno, mantém só o eleito", () => {
  const lista = [c("A", "nao_eleito"), c("B", "eleito"), c("C", "nao_eleito")]
  const r = recortarFinalistas(lista)
  assert.equal(r.filtrado, true)
  assert.deepEqual(r.candidatos.map((x) => x.nome), ["B"])
})

test("sem finalista nem vencedor, devolve todos e não filtra", () => {
  const lista = [c("A"), c("B", "em_disputa"), c("C", "nao_eleito"), c("D", "fora_da_disputa")]
  const r = recortarFinalistas(lista)
  assert.equal(r.filtrado, false)
  assert.deepEqual(r.candidatos, lista)
})

test("lista vazia não filtra", () => {
  assert.deepEqual(recortarFinalistas([]), { candidatos: [], filtrado: false })
})

test("comFaseEfetiva: fase do banco fora de em_disputa vence; sem linha, mantém o candidato", () => {
  const banco = new Map([
    ["a", { fase_eleitoral: "segundo_turno" as const, fase_turno: 1 as const, atualizacao_encerrada_em: null }],
  ])
  const a = comFaseEfetiva({ slug: "a", cargo_disputado: "Governador" }, banco)
  assert.equal((a as { fase_eleitoral_2026?: FaseEleitoral2026 }).fase_eleitoral_2026?.fase_eleitoral, "segundo_turno")
  const semLinha = { slug: "zz-sem-linha", cargo_disputado: "Governador" }
  assert.equal(comFaseEfetiva(semLinha, banco), semLinha)
})

test("statusUf1Turno: vencedor, finalistas e ausência de resultado", () => {
  assert.equal(statusUf1Turno(["nao_eleito", "eleito", "nao_eleito"]), "Eleito no 1º turno")
  assert.equal(statusUf1Turno(["segundo_turno", "nao_eleito", "segundo_turno"]), "2º turno")
  assert.equal(statusUf1Turno(["nao_eleito", "fora_da_disputa", "em_apuracao", undefined, null]), null)
  assert.equal(statusUf1Turno([]), null)
})

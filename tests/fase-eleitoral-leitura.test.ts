import assert from "node:assert/strict"
import { test } from "node:test"
import { validarLeituraFases, linkCompararFinalistas, ordenarPorFaseEleitoral } from "../src/lib/fase-eleitoral-publica"
import type { Candidato } from "../src/lib/types"

const row = { candidato_id: "alfa", slug: "alfa", cargo_disputado: "Presidente", fase_eleitoral: "segundo_turno", fase_turno: 1, atualizacao_encerrada_em: null }
test("leitura parcial ou shape inválido não marca nem os registros válidos", () => {
  assert.deepEqual(validarLeituraFases([row], 2), [])
  assert.deepEqual(validarLeituraFases([row], null), [])
  assert.deepEqual(validarLeituraFases([row, { ...row, candidato_id: "beta", fase_eleitoral: "desconhecida" }], 2), [])
  assert.deepEqual(validarLeituraFases([row, row], 2), [])
  assert.deepEqual(validarLeituraFases([{ ...row, cargo_disputado: "Senador" }], 1), [])
  assert.deepEqual(validarLeituraFases([row], 1), [row])
})
test("confronto usa parser existente e ordem alfabética, com dois finalistas apenas", () => {
  const a = { slug: "alfa", nome_urna: "Alfa", cargo_disputado: "Governador", estado: "SP", fase_eleitoral_2026: row } as unknown as Candidato
  const z = { ...a, slug: "zeta", nome_urna: "Zeta" }
  assert.equal(linkCompararFinalistas([z, a]), "/comparar?c1=alfa&c2=zeta&cargo=Governador&uf=SP")
  assert.equal(linkCompararFinalistas([a]), null)
  assert.equal(linkCompararFinalistas([a, { ...z, estado: "MG" }]), null)
  const unmarked = [{ ...a, fase_eleitoral_2026: null }, { ...z, fase_eleitoral_2026: null }]
  assert.equal(ordenarPorFaseEleitoral(unmarked), unmarked)
})

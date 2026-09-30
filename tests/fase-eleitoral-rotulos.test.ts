import assert from "node:assert/strict"
import test from "node:test"

import { rotuloFaseEleitoral } from "../src/lib/fase-eleitoral-publica"
import type { Candidato } from "../src/lib/types"

const cargos: Candidato["cargo_disputado"][] = [
  "Presidente",
  "Vice-Presidente",
  "Governador",
  "Vice-Governador",
  "Senador",
  "Deputado Federal",
  "Nenhum",
]

function candidato(
  cargo_disputado: Candidato["cargo_disputado"],
  fase_eleitoral: "em_disputa" | "segundo_turno" | "eleito" | "nao_eleito" | "fora_da_disputa",
  fase_turno: 1 | 2,
) {
  return {
    cargo_disputado,
    fase_eleitoral_2026: { fase_eleitoral, fase_turno, atualizacao_encerrada_em: null },
  } as Pick<Candidato, "cargo_disputado" | "fase_eleitoral_2026">
}

test("rotula todos os resultados registrados sem datas ou percentuais", () => {
  assert.equal(rotuloFaseEleitoral(candidato("Presidente", "segundo_turno", 1)), "Vai ao 2º turno")
  assert.equal(rotuloFaseEleitoral(candidato("Governador", "eleito", 1)), "Venceu no 1º turno")
  assert.equal(rotuloFaseEleitoral(candidato("Governador", "eleito", 2)), "Venceu no 2º turno")

  for (const cargo of cargos.filter((value) => value !== "Senador")) {
    assert.equal(rotuloFaseEleitoral(candidato(cargo, "nao_eleito", 1)), "Não foi ao 2º turno", cargo)
    assert.equal(rotuloFaseEleitoral(candidato(cargo, "nao_eleito", 2)), "Não se elegeu", cargo)
    assert.equal(rotuloFaseEleitoral(candidato(cargo, "fora_da_disputa", 1)), "Não foi ao 2º turno", cargo)
    assert.equal(rotuloFaseEleitoral(candidato(cargo, "fora_da_disputa", 2)), "Não se elegeu", cargo)
  }
  assert.equal(rotuloFaseEleitoral(candidato("Senador", "nao_eleito", 1)), "Não se elegeu")
  assert.equal(rotuloFaseEleitoral(candidato("Senador", "nao_eleito", 2)), "Não se elegeu")
})

test("não inventa selo quando não há fase pública ou quando o senador está fora da disputa", () => {
  assert.equal(rotuloFaseEleitoral({ cargo_disputado: "Presidente", fase_eleitoral_2026: null }), null)
  assert.equal(rotuloFaseEleitoral({ cargo_disputado: "Presidente" }), null)
  assert.equal(rotuloFaseEleitoral(candidato("Presidente", "em_disputa", 1)), null)
  assert.equal(rotuloFaseEleitoral(candidato("Senador", "fora_da_disputa", 1)), null)
  assert.equal(rotuloFaseEleitoral(candidato("Senador", "fora_da_disputa", 2)), null)
})

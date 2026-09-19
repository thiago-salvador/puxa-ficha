import assert from "node:assert/strict"
import { test } from "node:test"

import { comporCenario } from "../../scripts/pesquisas-jev/compor-cenario.mjs"
import {
  avaliarResultados,
  contextoMateria,
  estadoGolden,
} from "../../scripts/pesquisas-jev/avaliar-golden.mjs"

const ACEITO = {
  atribuicao: { noul: 1 },
  atualidade: { noul: 1 },
  disputa_alvo: { noul: 1 },
  medida: { choice: "intencao_voto_primeiro_turno", confidence: 1 },
  revisao_humana: { noul: 0 },
}

test("comporCenario é seguro ao importar e reutiliza julgamentos idênticos", () => {
  const calls = []
  const html = [
    "<title>Pesquisa de teste</title>",
    "<p>Alice Silva (ABC) tem 42%.</p>",
    "<p>Bob Souza (XYZ) tem 31%.</p>",
    "<p>Alice Silva (ABC) tem 42%.</p>",
    "<p>Alice Silva tem 47% em outro recorte.</p>",
  ].join("")

  const result = comporCenario(html, { cargo: "governador", uf: "SP" }, "Teste", {
    ask(state) {
      calls.push(state)
      return ACEITO
    },
  })

  assert.equal(result.pares, 4)
  assert.equal(result.aceitos, 4)
  assert.deepEqual(result.cenario, [{ nome: "Bob Souza", percentual: 31 }])
  assert.deepEqual(result.conflitos, [{ nome: "Alice Silva", valores: [42, 47] }])
  assert.equal(result.soma, 31)
  assert.equal(calls.length, 3)
})

test("comporCenario falha fechado em alvo cinza, revisão humana e resposta ausente", () => {
  const html = "<title>Pesquisa</title><p>Pessoa Teste (ABC) tem 42%.</p>"
  const run = (answer) => comporCenario(html, { cargo: "governador", uf: "SP" }, "Teste", { ask: () => answer })

  assert.equal(run({ ...ACEITO, disputa_alvo: { noul: 0.5 } }).aceitos, 0)
  assert.equal(run({ ...ACEITO, revisao_humana: { noul: 0.5 } }).aceitos, 0)
  assert.equal(run({ ...ACEITO, revisao_humana: undefined }).aceitos, 0)
  assert.ok(run({ ...ACEITO, disputa_alvo: { noul: 0.8 }, revisao_humana: { noul: 0.2 } }).aceitos > 0)
  assert.equal(run({ ...ACEITO, disputa_alvo: { noul: 0.799 } }).aceitos, 0)
  assert.equal(run({ ...ACEITO, revisao_humana: { noul: 0.201 } }).aceitos, 0)
  assert.equal(run({ ...ACEITO, atribuicao: { noul: 1.1 } }).aceitos, 0)
  assert.equal(run({ ...ACEITO, revisao_humana: { noul: -0.1 } }).aceitos, 0)
})

test("a CLI exige instituto explícito antes de ler fixture ou chamar modelo", async () => {
  const { spawnSync } = await import("node:child_process")
  const result = spawnSync(process.execPath, ["scripts/pesquisas-jev/compor-cenario.mjs", "/tmp/fixture-inexistente.html", "Governador", "SP"], { encoding: "utf8" })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /instituto obrigatório/)
})

test("avaliarResultados não transforma previsão ausente em decisão negativa", () => {
  const { resumo } = avaliarResultados([{
    id: "sem-previsao",
    atr_p: null,
    atr_y: 0,
    alv_p: null,
    alv_y: 1,
    med_p: null,
    med_conf: null,
    med_y: "intencao_voto_primeiro_turno",
    atu_p: null,
    atu_y: 0,
  }])

  assert.equal(resumo.atribuicao.decididos, 0)
  assert.equal(resumo.disputa_alvo.falsos_negativos, 0)
  assert.deepEqual(resumo.atualidade, {
    casos: 0,
    nota: "sem caso rotulado neste conjunto",
  })
})

test("estadoGolden usa metadados da linha e não inventa a fonte", () => {
  assert.deepEqual(contextoMateria({ titulo: "Sem fonte" }), { titulo: "Sem fonte" })
  assert.deepEqual(contextoMateria({ titulo: "Com fonte", instituto: "Real Time", veiculo: "Exame" }), {
    titulo: "Com fonte",
    instituto: "Real Time",
    veiculo: "Exame",
  })
  assert.equal(estadoGolden({ titulo: "Sem fonte" }).contexto.materia.instituto, undefined)
})

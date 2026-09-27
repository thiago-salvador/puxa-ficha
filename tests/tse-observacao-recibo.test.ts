import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { FONTES, montarLinhas } from "../scripts/lib/coleta-log"
import { FONTES_POR_CANDIDATO } from "../scripts/audit/lib/coleta-proveniencia"
import {
  FONTE_TSE_OBSERVACAO,
  reciboObservacaoTse,
  TSE_OBSERVACAO_URL,
} from "../scripts/lib/tse-observacao-recibo"

const rodada = {
  ano: 2026,
  baseline: 2,
  unchanged: 342,
  changed: 5,
  skipped: 314,
  errors: [] as string[],
  falha: null as string | null,
}

test("rodada com valores oficiais confirmados vira coleta encontrada da fonte própria", () => {
  const recibo = reciboObservacaoTse(rodada)
  assert.equal(recibo.fonte, FONTE_TSE_OBSERVACAO)
  assert.equal(recibo.escopo, "global")
  assert.equal(recibo.alvo, "observacao_candidaturas_2026")
  assert.equal(recibo.resultado, "encontrado")
  assert.equal(recibo.volume, 349)
  assert.equal(recibo.url, TSE_OBSERVACAO_URL)
  assert.match(recibo.detalhe ?? "", /não atualiza fatos da ficha/)
  assert.match(recibo.detalhe ?? "", /consulta_cand_complementar_2026/)
})

test("erro parcial fica no detalhe sem apagar a leitura confirmada", () => {
  // Cenário da rodada de 23/09: 349 valores confirmados e um erro na gravação
  // do histórico. A leitura do pacote aconteceu; o erro precisa ficar visível.
  const recibo = reciboObservacaoTse({
    ...rodada,
    errors: ["Verified change: Invalid verified registration status"],
  })
  assert.equal(recibo.resultado, "encontrado")
  assert.equal(recibo.volume, 349)
  assert.match(recibo.detalhe ?? "", /1 erro\(s\) na rodada: Verified change: Invalid verified registration status/)
})

test("rodada interrompida ou sem valor confirmado vira erro, nunca sucesso", () => {
  const interrompida = reciboObservacaoTse({ ...rodada, falha: "Official wealth CSV unavailable for 2026" })
  assert.equal(interrompida.resultado, "erro")
  assert.equal(interrompida.volume, 0)
  assert.match(interrompida.detalhe ?? "", /Rodada interrompida: Official wealth CSV unavailable/)

  const vazia = reciboObservacaoTse({ ...rodada, baseline: 0, unchanged: 0, changed: 0 })
  assert.equal(vazia.resultado, "erro")
  assert.match(vazia.detalhe ?? "", /Nenhum valor oficial confirmado/)
})

test("linha gravada é global, sem candidato e fora da régua por ficha", () => {
  assert.equal(FONTES[FONTE_TSE_OBSERVACAO], "global")
  assert.ok(!FONTES_POR_CANDIDATO.includes(FONTE_TSE_OBSERVACAO))
  const [linha] = montarLinhas([reciboObservacaoTse(rodada)], new Map())
  assert.equal(linha?.escopo, "global")
  assert.equal(linha?.candidato_id, null)
  assert.equal(linha?.resultado, "encontrado")
  assert.equal(linha?.volume, 349)
})

test("observação grava o recibo estrito antes de propagar falha e nunca em dry-run", () => {
  const source = readFileSync(new URL("../scripts/observe-home-updates.ts", import.meta.url), "utf8")
  const receipt = source.indexOf("await registrarColetaOuFalhar(reciboObservacaoTse(")
  assert.ok(receipt > 0, "entrypoint precisa gravar o recibo da observação")
  assert.ok(source.lastIndexOf("if (!dryRun) {", receipt) > 0)
  assert.ok(receipt < source.indexOf("if (failure !== null) throw new Error(failure)"))
  assert.ok(receipt < source.indexOf("if (errors.length) throw new Error"))
  assert.doesNotMatch(source, /\bregistrarColeta\(/)
})

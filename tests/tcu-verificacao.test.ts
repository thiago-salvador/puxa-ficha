import assert from "node:assert/strict"
import test from "node:test"

import { derivarTCUVerificacao } from "../src/lib/tcu-verificacao"

const CADIRREG = "https://certidoes.apps.tcu.gov.br/api/publico/responsaveis-contas-irregulares"
const INABILITADOS = "https://certidoes.apps.tcu.gov.br/api/publico/responsaveis-inabilitados"

test("recibo antigo com volume de linhas gravadas e sem contagem por cadastro não vira achado", () => {
  const recibo = derivarTCUVerificacao({
    resultado: "encontrado",
    executado_em: "2026-08-28T10:00:00Z",
    volume: 1,
    url: null,
    detalhe: "candidatos",
    escopo: "candidato",
  })
  assert.equal(recibo.estado, "pendente")
  assert.match(recibo.detalhe ?? "", /sem contagem de registros por cadastro/)
  assert.doesNotMatch(recibo.detalhe ?? "", /encontrou/)
  assert.deepEqual(recibo.fontes, [])
})

test("recibo com contagem por cadastro positiva segue em revisão editorial e conta registros do TCU", () => {
  const recibo = derivarTCUVerificacao({
    resultado: "encontrado",
    executado_em: "2026-09-15T10:00:00Z",
    volume: 3,
    url: null,
    detalhe: `consultas=${INABILITADOS},${CADIRREG}; inabilitados_itens=0; cadirreg_itens=5`,
    escopo: "candidato",
  })
  assert.equal(recibo.estado, "encontrado_em_revisao")
  assert.equal(recibo.volume, 5)
  assert.equal(recibo.url, CADIRREG)
  assert.equal(recibo.detalhe, "Consulta TCU encontrou 5 registros; revisão editorial pendente.")
})

test("encontrado com contagens zeradas por cadastro não sustenta achado", () => {
  const recibo = derivarTCUVerificacao({
    resultado: "encontrado",
    executado_em: "2026-09-15T10:00:00Z",
    volume: 1,
    url: null,
    detalhe: `consultas=${INABILITADOS},${CADIRREG}; inabilitados_itens=0; cadirreg_itens=0`,
    escopo: "candidato",
  })
  assert.equal(recibo.estado, "pendente")
})

test("vazio confirmado continua verificado", () => {
  const recibo = derivarTCUVerificacao({
    resultado: "vazio_confirmado",
    executado_em: "2026-09-15T10:00:00Z",
    volume: 0,
    url: null,
    detalhe: `consultas=${INABILITADOS},${CADIRREG}; inabilitados_itens=0; cadirreg_itens=0`,
    escopo: "candidato",
  })
  assert.equal(recibo.estado, "vazio_verificado")
  assert.equal(recibo.url, INABILITADOS)
})

test("detalhe do coletor com contagem por cadastro, sem URL de consulta, sustenta o achado", () => {
  const recibo = derivarTCUVerificacao({
    resultado: "encontrado",
    executado_em: "2026-09-28T10:00:00Z",
    volume: 2,
    url: null,
    detalhe: "escopo=TCU Plataforma de Certidões; consultas oficiais inabilitados e contas irregulares; inabilitados_itens=0; cadirreg_itens=1",
    escopo: "candidato",
  })
  assert.equal(recibo.estado, "encontrado_em_revisao")
  assert.equal(recibo.volume, 1)
  assert.equal(recibo.url, CADIRREG)
})

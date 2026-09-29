import assert from "node:assert/strict"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"

import { type PlanoFinancas2026 } from "../scripts/lib/tse-2026-financas-plano"
import { parseRiscoIdentidadePinado } from "../scripts/lib/tse-identidade-celulas"
import { carregarPinadoAgendado, linhasDeReciboAplicaveis, linhasDeReciboDeFalha, prepararPlanoAgendado } from "../scripts/tse-2026-financas"

const pinado = () => ({
  schema_version: 1,
  kind: "tse-identidade-risco",
  gerado_em: "2026-09-29",
  origem: "rodada revisada",
  slugs: ["risco"],
  celulas_liberadas: [],
})

function plano(): PlanoFinancas2026 {
  return {
    acoes: [
      { tipo: "inserir_financiamento", slug: "risco", linha: {} },
      { tipo: "inserir_financiamento", slug: "seguro", linha: {} },
    ],
    recibos: [
      { fonte: "tse-financiamento", alvo: "risco", candidato_id: "id-risco", resultado: "encontrado", volume: 1, detalhe: "{}" },
      { fonte: "tse-financiamento", alvo: "seguro", candidato_id: "id-seguro", resultado: "encontrado", volume: 1, detalhe: "{}" },
    ],
    revisao: [],
    resumo: {
      fichas_publicas: 2,
      financiamento: { fichas_com_linha_apos_plano: 2, inserir: 2, atualizar: 0, inalterado: 0, preservado_curadoria: 0,
        verificacoes_vencidas_apagadas: 0, fichas_vazio_confirmado: 0, fichas_erro: 0, aguardando_backfill_categorias: 0 },
      patrimonio: { fichas_com_linha_apos_plano: 0, inserir: 0, inalterado: 0, divergente_revisao: 0,
        ausencias_desmentidas_apagadas: 0, fichas_vazio_confirmado: 0, fichas_erro: 0 },
      recibos: { financiamento: 2, patrimonio: 0 },
    },
    resumo_por_perfil: {
      risco: { financiamento: { fichas_com_linha_apos_plano: 1, inserir: 1 }, patrimonio: {} },
      seguro: { financiamento: { fichas_com_linha_apos_plano: 1, inserir: 1 }, patrimonio: {} },
    },
  }
}

describe("pin de identidade do agendado", () => {
  it("adia ação de risco, mantém a segura e impede recibos do perfil bloqueado", () => {
    const { plano: pronto, deferred } = prepararPlanoAgendado(plano(), parseRiscoIdentidadePinado(JSON.stringify(pinado())))
    assert.equal(deferred, 1)
    assert.deepEqual(pronto.acoes.map((acao) => acao.slug), ["seguro"])
    assert.deepEqual(pronto.identity_risk_slugs, ["risco"])
    assert.deepEqual(pronto.identity_released_cells, [])
    assert.equal(pronto.recibos[0]?.resultado, "indeterminado")
    assert.match(pronto.recibos[0]?.detalhe ?? "", /identidade_em_revisao/)
    assert.deepEqual(linhasDeReciboAplicaveis(pronto, []).map((r) => r.alvo), ["seguro"])
    const falha = linhasDeReciboDeFalha([{ id: "id-risco", slug: "risco" }, { id: "id-seguro", slug: "seguro" }], "falha",
      new Set(pronto.identity_risk_slugs), new Set(pronto.identity_released_cells))
    assert.deepEqual([...new Set(falha.map((r) => r.alvo))], ["seguro"])
  })

  it("libera apenas a família autorizada", () => {
    const raw = { ...pinado(), celulas_liberadas: ["risco|financiamento"] }
    const { plano: pronto, deferred } = prepararPlanoAgendado(plano(), parseRiscoIdentidadePinado(JSON.stringify(raw)))
    assert.equal(deferred, 0)
    assert.deepEqual(pronto.acoes.map((acao) => acao.slug), ["risco", "seguro"])
    assert.deepEqual(linhasDeReciboAplicaveis(pronto, []).map((r) => r.alvo), ["risco", "seguro"])
    const falha = linhasDeReciboDeFalha([{ id: "id-risco", slug: "risco" }], "falha", new Set(["risco"]), new Set(raw.celulas_liberadas))
    assert.deepEqual(falha.map((r) => r.fonte), ["tse-financiamento"])
  })

  it("arquivo ausente ou inválido falha antes de preparar o plano", () => {
    const dir = mkdtempSync(join(tmpdir(), "financas-pin-"))
    try {
      assert.throws(() => carregarPinadoAgendado(join(dir, "ausente.json")), /pin.*identidade|ENOENT/i)
      const path = join(dir, "pin.json")
      writeFileSync(path, "{}")
      assert.throws(() => carregarPinadoAgendado(path), /inválid/i)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it("parser rejeita campos extras, duplicatas, ordem errada e família desconhecida", () => {
    const ok = pinado()
    assert.deepEqual(parseRiscoIdentidadePinado(JSON.stringify(ok)).slugs, ["risco"])
    for (const bad of [
      { ...ok, cpf: "x" },
      { ...ok, slugs: ["risco", "risco"] },
      { ...ok, slugs: ["z", "a"] },
      { ...ok, celulas_liberadas: ["risco|desconhecida"] },
      { ...ok, celulas_liberadas: ["risco|patrimonio", "risco|financiamento"] },
      { ...ok, gerado_em: "data" },
    ]) assert.throws(() => parseRiscoIdentidadePinado(JSON.stringify(bad)), /inválid/i)
  })
})

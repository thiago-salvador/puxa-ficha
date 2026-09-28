import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  AGENCIAS_CHECAGEM,
  POLITICA_CHECAGENS,
  SCHEMA_DECISOES_CHECAGENS,
  SCHEMA_RECIBOS_CHECAGENS,
  aplicarDecisoesMesa,
  consolidarCatalogoRecibos,
  validarDecisoesChecagens,
  type DecisaoLeadChecagem,
  type LeadMesaChecagem,
  type ReciboChecagem,
} from "../scripts/lib/checagens-coleta"

const ID = "00000000-0000-4000-8000-000000000001"
const SLUG = "fulano-de-tal"

function lead(link: string, motivo: LeadMesaChecagem["motivo"], agencia = "lupa"): LeadMesaChecagem {
  return { agencia, titulo: `Fulano de Tal ${link}`, link, data_publicacao: null, motivo, noul_identidade: null }
}

function recibo(mesa: LeadMesaChecagem[], agencias: ReciboChecagem["agencias"] = {
  lupa: { status: "ok", itens: 10, leads: 0, pendentes: mesa.filter((item) => item.agencia === "lupa").length || undefined },
  comprova: { status: "ok", itens: 3, leads: 0, pendentes: mesa.filter((item) => item.agencia === "comprova").length || undefined },
}): ReciboChecagem {
  return {
    schema_version: SCHEMA_RECIBOS_CHECAGENS, policy: POLITICA_CHECAGENS,
    candidate_id: ID, candidate_slug: SLUG, candidate_name: "Fulano de Tal", office: "Governador", uf: "SP",
    searched_at: "2026-09-28T12:00:00.000Z", result: "nao_confirmado", leads: [], mesa, agencias, escopo: "teste",
  }
}

function arquivo(decisoes: Array<Pick<DecisaoLeadChecagem, "link" | "decisao" | "origem">>) {
  return validarDecisoesChecagens({
    schema_version: SCHEMA_DECISOES_CHECAGENS, policy: POLITICA_CHECAGENS,
    decisoes: decisoes.map((decisao) => ({ candidate_id: ID, candidate_slug: SLUG, ...decisao })),
  })
}

describe("decisões da Mesa e da validação sobre leads em revisão", () => {
  it("publica o lead decidido e passa o recibo a encontrado com a contagem da agência", () => {
    const { recibos, aplicadas, sem_lead } = aplicarDecisoesMesa(
      [recibo([lead("https://a/1", "identidade_jev"), lead("https://a/2", "identidade_jev")])],
      arquivo([{ link: "https://a/1", decisao: "publicar", origem: "jev-validacao" }]),
    )
    assert.equal(aplicadas, 1)
    assert.equal(sem_lead, 0)
    assert.equal(recibos[0].result, "encontrado")
    assert.deepEqual(recibos[0].leads.map((item) => item.link), ["https://a/1"])
    assert.equal("motivo" in recibos[0].leads[0], false, "campos da Mesa não vão para o lead publicado")
    assert.equal(recibos[0].agencias.lupa.leads, 1)
    assert.equal(recibos[0].agencias.lupa.pendentes, 1)
    assert.deepEqual(recibos[0].mesa?.map((item) => item.link), ["https://a/2"])
  })

  it("recusa publicar lead da regra 3 sem decisão da Mesa", () => {
    assert.throws(() => aplicarDecisoesMesa(
      [recibo([lead("https://a/1", "regra3")])],
      arquivo([{ link: "https://a/1", decisao: "publicar", origem: "jev-validacao" }]),
    ), /só a Mesa publica/)
    const { recibos } = aplicarDecisoesMesa(
      [recibo([lead("https://a/1", "regra3")])],
      arquivo([{ link: "https://a/1", decisao: "publicar", origem: "mesa" }]),
    )
    assert.equal(recibos[0].result, "encontrado")
  })

  it("descarte de todos os leads permite ausência confirmada", () => {
    const { recibos } = aplicarDecisoesMesa(
      [recibo([lead("https://a/1", "identidade_jev")])],
      arquivo([{ link: "https://a/1", decisao: "descartar", origem: "jev-validacao" }]),
    )
    assert.equal(recibos[0].result, "vazio_confirmado")
    assert.equal(recibos[0].mesa, undefined)
    assert.equal(recibos[0].agencias.lupa.descartados, 1)
    assert.equal(recibos[0].agencias.lupa.pendentes, undefined)
  })

  it("lead sem decisão mantém o recibo fora do catálogo público", () => {
    const { recibos } = aplicarDecisoesMesa([recibo([lead("https://a/1", "identidade_jev")])], arquivo([]))
    assert.equal(recibos[0].result, "nao_confirmado")
    const catalogo = consolidarCatalogoRecibos(null, recibos, new Date("2026-09-28T13:00:00Z"))
    assert.equal(catalogo.receipts.length, 0)
  })

  it("agência sem resposta impede ausência mesmo depois das decisões", () => {
    const { recibos } = aplicarDecisoesMesa(
      [recibo([lead("https://a/1", "identidade_jev")], { lupa: { status: "ok", itens: 1, leads: 0, pendentes: 1 }, "uol-confere": { status: "erro", erro: "HTTP 403" } })],
      arquivo([{ link: "https://a/1", decisao: "descartar", origem: "jev-validacao" }]),
    )
    assert.equal(recibos[0].result, "erro")
  })

  it("decisão de outra candidatura com o mesmo link não se aplica", () => {
    const decisoes = validarDecisoesChecagens({
      schema_version: SCHEMA_DECISOES_CHECAGENS, policy: POLITICA_CHECAGENS,
      decisoes: [{ candidate_id: "00000000-0000-4000-8000-000000000002", candidate_slug: "fulano-de-tal-rn", link: "https://a/1", decisao: "publicar", origem: "jev-validacao" }],
    })
    const { recibos, aplicadas, sem_lead } = aplicarDecisoesMesa([recibo([lead("https://a/1", "identidade_jev")])], decisoes)
    assert.equal(aplicadas, 0)
    assert.equal(sem_lead, 1)
    assert.equal(recibos[0].leads.length, 0)
  })

  it("recalcula o resultado de recibo antigo sem Mesa: descartado vira ausência, pendente não", () => {
    const antigoDescartado = { ...recibo([], { lupa: { status: "ok", itens: 5, leads: 0, descartados: 2 }, comprova: { status: "ok", itens: 1, leads: 0 } }), mesa: undefined, result: "nao_confirmado" as const }
    const antigoPendente = { ...recibo([], { lupa: { status: "ok", itens: 5, leads: 0, pendentes: 1 }, comprova: { status: "ok", itens: 1, leads: 0 } }), mesa: undefined, result: "nao_confirmado" as const }
    const { recibos } = aplicarDecisoesMesa([antigoDescartado, antigoPendente], arquivo([]))
    assert.deepEqual(recibos.map((item) => item.result), ["vazio_confirmado", "nao_confirmado"])
  })

  it("catálogo afirma ausência com uma agência sem resposta, nunca com duas ou com pendente", () => {
    const agora = new Date("2026-09-28T20:00:00Z")
    const todas = Object.fromEntries(AGENCIAS_CHECAGEM.map((agencia) => [agencia.id, { status: "ok" as const, itens: 1, leads: 0 }])) as ReciboChecagem["agencias"]
    const umaFora = { ...recibo([], { ...todas, "aos-fatos": { status: "erro", erro: "disjuntor" } }), mesa: undefined, result: "erro" as const }
    const [publico] = consolidarCatalogoRecibos(null, [umaFora], agora).receipts
    assert.equal(publico?.result, "vazio_confirmado")
    assert.deepEqual(publico?.agencias, AGENCIAS_CHECAGEM.filter((agencia) => agencia.id !== "aos-fatos").map((agencia) => agencia.nome))
    const duasFora = { ...umaFora, agencias: { ...umaFora.agencias, comprova: { status: "erro" as const, erro: "HTTP 503" } } }
    assert.equal(consolidarCatalogoRecibos(null, [duasFora], agora).receipts.length, 0)
    const comPendente = { ...umaFora, agencias: { ...umaFora.agencias, lupa: { status: "ok" as const, itens: 1, leads: 0, pendentes: 1 } } }
    assert.equal(consolidarCatalogoRecibos(null, [comPendente], agora).receipts.length, 0)
  })

  it("homônimo com matéria descartada e uma agência fora não vira ausência", () => {
    const todas = Object.fromEntries(AGENCIAS_CHECAGEM.map((agencia) => [agencia.id, { status: "ok" as const, itens: 1, leads: 0 }])) as ReciboChecagem["agencias"]
    const homonimo = {
      ...recibo([], { ...todas, "aos-fatos": { status: "erro", erro: "disjuntor" } }), mesa: undefined, result: "erro" as const,
      homonimo: { grupo: [SLUG, "fulano-de-tal-rj"], descartados: 1, marcadores: [], leads_brutos: [] },
    }
    assert.equal(consolidarCatalogoRecibos(null, [homonimo], new Date("2026-09-28T20:00:00Z")).receipts.length, 0)
  })

  it("recusa arquivo malformado, de outra política ou com decisão repetida", () => {
    assert.throws(() => validarDecisoesChecagens({ schema_version: "x", policy: POLITICA_CHECAGENS, decisoes: [] }), /inválido/)
    assert.throws(() => validarDecisoesChecagens({ schema_version: SCHEMA_DECISOES_CHECAGENS, policy: "pf-checagens-v1", decisoes: [] }), /política/)
    const repetida = { candidate_id: ID, candidate_slug: SLUG, link: "https://a/1", decisao: "publicar", origem: "mesa" }
    assert.throws(() => validarDecisoesChecagens({ schema_version: SCHEMA_DECISOES_CHECAGENS, policy: POLITICA_CHECAGENS, decisoes: [repetida, repetida] }), /repetida/)
    assert.throws(() => validarDecisoesChecagens({ schema_version: SCHEMA_DECISOES_CHECAGENS, policy: POLITICA_CHECAGENS, decisoes: [{ ...repetida, origem: "jev" }] }), /Origem/)
  })
})

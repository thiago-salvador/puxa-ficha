import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  POLITICA_CHECAGENS,
  SCHEMA_DECISOES_CHECAGENS,
  SCHEMA_RECIBOS_CHECAGENS,
  aplicarDecisoesMesa,
  validarDecisoesChecagens,
  type CandidatoChecagem,
  type DecisaoLeadChecagem,
  type LeadChecagem,
  type ReciboChecagem,
} from "../scripts/lib/checagens-coleta"

const ID = "00000000-0000-4000-8000-000000000002"
const SLUG = "fernando-haddad-teste"
const CANDIDATO: CandidatoChecagem = { id: ID, slug: SLUG, nome_urna: "Fernando Haddad", nome_completo: "Fernando Haddad", cargo_disputado: "Governador", estado: "SP" }

function recibo(leads: LeadChecagem[] = [], agencias: ReciboChecagem["agencias"] = {
  lupa: { status: "ok", itens: 10, leads: leads.length },
  comprova: { status: "ok", itens: 3, leads: 0 },
}, candidato = CANDIDATO): ReciboChecagem {
  return {
    schema_version: SCHEMA_RECIBOS_CHECAGENS, policy: POLITICA_CHECAGENS,
    candidate_id: candidato.id, candidate_slug: candidato.slug, candidate_name: candidato.nome_urna, office: candidato.cargo_disputado, uf: candidato.estado,
    searched_at: "2026-09-28T12:00:00.000Z", result: leads.length ? "encontrado" : "vazio_confirmado", leads, agencias, escopo: "teste",
  }
}

function decisao(lead: Partial<NonNullable<DecisaoLeadChecagem["lead"]>> & { link: string }, extra: Partial<DecisaoLeadChecagem> = {}): DecisaoLeadChecagem {
  return {
    candidate_id: ID, candidate_slug: SLUG, link: lead.link, decisao: "publicar", origem: "mesa",
    lead: { agencia: "lupa", titulo: "Erros e acertos de Fernando Haddad no Jornal Nacional", data_publicacao: "2018-09-15", ...lead },
    ...extra,
  }
}

function arquivo(decisoes: DecisaoLeadChecagem[]) {
  return validarDecisoesChecagens({ schema_version: SCHEMA_DECISOES_CHECAGENS, policy: POLITICA_CHECAGENS, decisoes })
}

describe("lead trazido pela decisão da Mesa", () => {
  it("publica lead de agência da lista que nenhuma coleta viu", () => {
    const link = "https://www.agencialupa.org/jornalismo/2018/09/14/haddad-jornal-nacional/"
    const saida = aplicarDecisoesMesa([recibo()], arquivo([decisao({ link })]), [CANDIDATO])
    assert.equal(saida.leads_da_mesa, 1)
    assert.deepEqual(saida.rejeitadas, [])
    assert.equal(saida.sem_lead, 0)
    assert.equal(saida.recibos[0].result, "encontrado")
    assert.deepEqual(saida.recibos[0].leads, [{ agencia: "lupa", titulo: "Erros e acertos de Fernando Haddad no Jornal Nacional", link, data_publicacao: "2018-09-15" }])
    assert.equal(saida.recibos[0].agencias.lupa.leads, 1)
  })

  it("título com parte do nome passa com o nome inteiro no trecho do corpo", () => {
    const link = "https://noticias.uol.com.br/confere/ultimas-noticias/eder-content/2018/09/19/haddad-promete.htm"
    const saida = aplicarDecisoesMesa([recibo([], { "uol-confere": { status: "ok", itens: 5, leads: 0 } })], arquivo([decisao({
      link, agencia: "uol-confere", titulo: "Haddad promete revogar reforma do ensino médio",
      trecho_confirmacao: "Nesta quarta, será abordada uma proposta de Fernando Haddad (PT): a revogação da reforma do ensino médio.",
    })]), [CANDIDATO])
    assert.equal(saida.leads_da_mesa, 1)
    assert.equal(saida.recibos[0].leads[0].confirmado_por, "corpo")
    assert.equal(saida.recibos[0].agencias["uol-confere"].leads, 1)
  })

  it("rejeita título com parte do nome sem trecho do corpo com o nome inteiro", () => {
    const link = "https://checamos.afp.com/doc.afp.com.33PB87N"
    const saida = aplicarDecisoesMesa([recibo()], arquivo([decisao({ link, agencia: "afp-checamos", titulo: "Patrimonialismo é confundido com patrimônio em fala de Haddad" })]), [CANDIDATO])
    assert.equal(saida.leads_da_mesa, 0)
    assert.deepEqual(saida.rejeitadas, [{ candidate_slug: SLUG, link, motivo: "nome_inteiro_ausente" }])
    assert.equal(saida.recibos[0].leads.length, 0)
  })

  it("\"Declaração de Haddad\" não é outra pessoa com o sobrenome dele", () => {
    const link = "https://www.aosfatos.org/noticias/declaracao-haddad-imposto-diesel-2023-nao-recente/"
    const saida = aplicarDecisoesMesa([recibo([], { "aos-fatos": { status: "ok", itens: 2, leads: 0 } })], arquivo([decisao({
      link, agencia: "aos-fatos", titulo: "Declaração de Haddad sobre volta do imposto do diesel é de 2023, não recente",
      trecho_confirmacao: "O ministro da Fazenda, Fernando Haddad, falou sobre o imposto do diesel em 2023.",
    })]), [CANDIDATO])
    assert.deepEqual(saida.rejeitadas, [])
    assert.equal(saida.leads_da_mesa, 1)
  })

  it("recusa agência fora da lista e link fora do domínio da agência", () => {
    assert.throws(() => arquivo([decisao({ link: "https://www.boatos.org/politica/haddad.html", agencia: "boatos" })]), /Agência fora da lista/)
    assert.throws(() => arquivo([decisao({ link: "https://www.boatos.org/politica/haddad.html", agencia: "lupa" })]), /fora do domínio/)
  })

  it("recusa lead em decisão que não é publicar da Mesa", () => {
    const link = "https://www.agencialupa.org/jornalismo/2023/02/02/cpi-assinaturas/"
    assert.throws(() => arquivo([decisao({ link }, { decisao: "descartar" })]), /Só decisão publicar da Mesa/)
    assert.throws(() => arquivo([decisao({ link }, { origem: "jev-validacao" })]), /Só decisão publicar da Mesa/)
  })

  it("item nao_publicar fica fora: sem decisão, nada entra", () => {
    const saida = aplicarDecisoesMesa([recibo()], arquivo([]), [CANDIDATO])
    assert.equal(saida.recibos[0].leads.length, 0)
    assert.equal(saida.leads_da_mesa, 0)
  })

  it("link já contado com outra codificação não conta de novo", () => {
    const publicado: LeadChecagem = { agencia: "comprova", titulo: "Haddad defendeu estabilidade; entenda", link: "https://projetocomprova.com.br/publicações/haddad-estabilidade/", data_publicacao: null }
    const saida = aplicarDecisoesMesa([recibo([publicado])], arquivo([decisao({
      link: "https://projetocomprova.com.br/publica%C3%A7%C3%B5es/haddad-estabilidade/", agencia: "comprova", titulo: publicado.titulo,
    })]), [CANDIDATO])
    assert.equal(saida.recibos[0].leads.length, 1)
    assert.equal(saida.leads_da_mesa, 0)
    assert.equal(saida.aplicadas, 1)
    assert.deepEqual(saida.rejeitadas, [])
  })

  it("homônimo sem marca distintiva no título é rejeitado; sem cadastro também", () => {
    const outro: CandidatoChecagem = { id: "00000000-0000-4000-8000-000000000003", slug: "fernando-haddad-rj", nome_urna: "Fernando Haddad", nome_completo: "Fernando Haddad Souza", cargo_disputado: "Governador", estado: "RJ" }
    const link = "https://www.agencialupa.org/jornalismo/2018/09/14/haddad-jornal-nacional/"
    const comHomonimo = aplicarDecisoesMesa([recibo()], arquivo([decisao({ link })]), [CANDIDATO, outro])
    assert.deepEqual(comHomonimo.rejeitadas.map((item) => item.motivo), ["homonimo_sem_marca"])
    const semCadastro = aplicarDecisoesMesa([recibo()], arquivo([decisao({ link })]))
    assert.deepEqual(semCadastro.rejeitadas.map((item) => item.motivo), ["sem_cadastro"])
    assert.equal(semCadastro.recibos[0].leads.length, 0)
  })
})

import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  buildImprensaFactCards,
  buildImprensaFactGroups,
  computeImprensaFacts,
  formatImprensaCargoList,
  IMPRENSA_DATA_BUCKETS,
  IMPRENSA_FACT_CARD_ORDER,
  IMPRENSA_FACT_GROUPS,
  imprensaDataBucket,
  imprensaDataBucketLabel,
  temProcessoPublicado,
  type ImprensaFactsRow,
} from "../src/lib/imprensa-facts"

type RowOverrides = {
  cargo?: string
  patrimonio?: Partial<ImprensaFactsRow["patrimonio"]>
  processos?: Partial<ImprensaFactsRow["processos"]>
  sancoes?: Partial<ImprensaFactsRow["sancoes"]>
  tcu?: Partial<ImprensaFactsRow["tcu"]>
  gastos?: Partial<ImprensaFactsRow["gastos"]>
  chapa?: Partial<ImprensaFactsRow["chapa"]>
}

function row(overrides: RowOverrides = {}): ImprensaFactsRow {
  return {
    cargo: overrides.cargo ?? "Governador",
    patrimonio: { estado: "sem_dado", ano: null, total: null, valorEstado: null, anoAnterior: null, totalAnterior: null, variacaoPct: null, fonteUrl: null, ...overrides.patrimonio },
    processos: { estado: "indeterminado", buscaEstado: "indeterminado", quantidade: null, ...overrides.processos },
    sancoes: { estado: "nao-verificado", quantidade: null, consultadoEm: null, fonteUrl: null, ...overrides.sancoes },
    tcu: { estado: "nao_verificado", registros: null, consultadoEm: null, fonteUrl: null, ...overrides.tcu },
    gastos: { estado: "sem_dado", ultimoAno: null, ultimoAnoTotal: null, anosEmRevisao: [], ...overrides.gastos },
    chapa: { estado: "sem_dado", suplentesEstado: "nao_aplicavel", viceNome: null, viceNomeOriginal: null, suplentes: [], fonteUrl: null, fonteSha256: null, snapshotEm: null, ...overrides.chapa },
  }
}

const FIXTURE: ImprensaFactsRow[] = [
  row({
    patrimonio: { estado: "publicado", total: 12_000_000, variacaoPct: 150 },
    processos: { estado: "publicado", quantidade: 3, quantidadeEmConfirmacao: 1 },
    sancoes: { estado: "vazio-confirmado", quantidade: 0 },
    tcu: { estado: "vazio_verificado" },
    gastos: { estado: "publicado" },
    chapa: { estado: "publicado", viceNome: "Vice Um" },
  }),
  row({
    patrimonio: { estado: "publicado", total: 500_000, variacaoPct: 100 },
    processos: { estado: "vazio_confirmado", quantidade: 0 },
    sancoes: { estado: "com-registros", quantidade: 2 },
    tcu: { estado: "encontrado_em_revisao" },
  }),
  row({
    cargo: "Senador",
    patrimonio: { estado: "publicado", total: 10_000_000, variacaoPct: null },
    processos: { estado: "cobertura_parcial", quantidade: 2, quantidadeEmConfirmacao: 0 },
    sancoes: { estado: "com-registros", quantidade: 0 },
    tcu: { estado: "pendente" },
    gastos: { estado: "publicado" },
    chapa: { suplentesEstado: "publicado", suplentes: ["A", "B"] },
  }),
  row({
    cargo: "Senador",
    patrimonio: { estado: "valor_nao_informado", total: null, variacaoPct: 300 },
    chapa: { suplentesEstado: "indeferidos_comprovados" },
  }),
  row({
    cargo: "Presidente",
    patrimonio: { estado: "publicado", total: 20_000_000, variacaoPct: -10 },
    processos: { estado: "publicado", quantidade: null },
    chapa: { estado: "publicado", viceNome: null },
  }),
  row({ cargo: "Senador", chapa: { suplentesEstado: "indeterminado" } }),
]

describe("computeImprensaFacts", () => {
  const facts = computeImprensaFacts(FIXTURE)

  it("conta candidatos por cargo na ordem presidente, governador, Senado", () => {
    assert.equal(facts.total, 6)
    assert.deepEqual(facts.porCargo, [
      { cargo: "Presidente", total: 1 },
      { cargo: "Governador", total: 2 },
      { cargo: "Senador", total: 3 },
    ])
  })

  it("conta patrimônio só nas declarações publicadas, com limites estritos", () => {
    assert.deepEqual(facts.patrimonio, { publicado: 4, comVariacao: 3, variacaoAcima100: 1, acima10Milhoes: 2 })
  })

  it("soma processos só de publicado e cobertura parcial com registro; sem quantidade não conta", () => {
    assert.deepEqual(facts.processos, {
      candidatosComProcesso: 2,
      publicado: 1,
      coberturaParcial: 1,
      registros: 5,
      judiciais: 5,
      disciplinares: 0,
      emConfirmacao: 1,
      indeterminado: 2,
      vazioConfirmado: 1,
    })
  })

  it("conta sanção só com registro; com-registros sem quantidade não entra", () => {
    assert.deepEqual(facts.sancoes, { comRegistro: 1, vazioConfirmado: 1, naoVerificado: 3 })
  })

  it("separa os quatro estados do TCU, cota e chapas", () => {
    assert.deepEqual(facts.tcu, { encontradoEmRevisao: 1, vazioVerificado: 1, pendente: 1, naoVerificado: 3 })
    assert.deepEqual(facts.cota, { publicado: 2 })
    assert.deepEqual(facts.chapas, { titulares: 3, vicePublicado: 1, senadores: 3, suplentesPublicados: 1, suplentesIndeferidos: 1 })
  })

  it("devolve zeros, sem erro, para um recorte vazio", () => {
    const empty = computeImprensaFacts([])
    assert.equal(empty.total, 0)
    assert.deepEqual(empty.porCargo, [])
    assert.equal(empty.processos.registros, 0)
  })
})

describe("processo publicado na ficha", () => {
  it("não conta como com processo quem teve todas as ocorrências fora da conta por falta de fonte", () => {
    const semFonte = row({ processos: { estado: "cobertura_parcial", buscaEstado: "encontrado", quantidade: null, quantidadeOmitida: 2 } })
    const zerado = row({ processos: { estado: "publicado", buscaEstado: "encontrado", quantidade: 0 } })
    const comProcesso = row({ processos: { estado: "cobertura_parcial", buscaEstado: "encontrado", quantidade: 2, quantidadeEmConfirmacao: 2 } })
    assert.equal(temProcessoPublicado(semFonte.processos), false)
    assert.equal(temProcessoPublicado(zerado.processos), false)
    assert.equal(temProcessoPublicado(comProcesso.processos), true)
    const facts = computeImprensaFacts([semFonte, zerado, comProcesso])
    assert.equal(facts.processos.candidatosComProcesso, 1)
    assert.equal(facts.processos.registros, 2)
    const [card] = buildImprensaFactCards(facts, ["processos"])
    assert.equal(card.value, 1)
    assert.equal(card.label, "candidato com processo publicado na ficha")
    assert.equal(card.detail, "2 registros na ficha: 2 judiciais · 0 disciplinares; 2 com fonte oficial em confirmação.")
    assert.doesNotMatch(card.label, /link do tribunal/)
  })

  it("lista só os cargos presentes, na ordem presidente, governador e Senado", () => {
    assert.equal(formatImprensaCargoList(["Senador", "Governador", "Presidente"]), "presidente, governador e Senado")
    assert.equal(formatImprensaCargoList(["Governador", "Presidente"]), "presidente e governador")
    assert.equal(formatImprensaCargoList(["Governador"]), "governador")
    assert.equal(formatImprensaCargoList([]), "")
  })
})

describe("contagem única de processos (judiciais + disciplinares)", () => {
  const rows = [
    row({ processos: { estado: "publicado", quantidade: 1, quantidadeEmConfirmacao: 0, contagem: { judiciais: 1, disciplinares: 6, total: 7 } } }),
    row({ processos: { estado: "vazio_confirmado", quantidade: 0, contagem: { judiciais: 0, disciplinares: 2, total: 2 } } }),
    row({ processos: { estado: "indeterminado", quantidade: null, contagem: { judiciais: null, disciplinares: 0, total: null } } }),
  ]
  const facts = computeImprensaFacts(rows)

  it("conta candidato com processo pelo total, inclusive só disciplinar", () => {
    assert.equal(facts.processos.candidatosComProcesso, 2)
    assert.equal(facts.processos.judiciais, 1)
    assert.equal(facts.processos.disciplinares, 8)
    assert.equal(facts.processos.registros, 9)
    assert.equal(facts.processos.vazioConfirmado, 1, "o estado da busca judicial continua separado")
  })

  it("mostra a quebra e o aviso de que disciplinar não é judicial", () => {
    const [card] = buildImprensaFactCards(facts, ["processos"])
    assert.equal(card.value, 2)
    assert.equal(card.detail, "9 registros na ficha: 1 judicial · 8 disciplinares; 0 com fonte oficial em confirmação.")
    assert.match(card.caveat, /Processo disciplinar não é processo judicial nem condenação\./)
  })
})

describe("buildImprensaFactGroups", () => {
  const facts = computeImprensaFacts(FIXTURE)

  it("cobre cada card uma vez, com Justiça em alerta antes de Dinheiro e Chapas", () => {
    assert.deepEqual(IMPRENSA_FACT_GROUPS.flatMap((group) => group.ids).sort(), [...IMPRENSA_FACT_CARD_ORDER].sort())
    const groups = buildImprensaFactGroups(facts)
    assert.deepEqual(groups.map((group) => [group.id, group.tone]), [["justica", "alerta"], ["dinheiro", "atencao"], ["chapas", "info"]])
    for (const group of groups) {
      const values = group.cards.map((card) => card.value)
      assert.deepEqual(values, [...values].sort((a, b) => b - a), `${group.id} em ordem decrescente`)
    }
  })

  it("respeita os ids pedidos e some com grupo vazio", () => {
    const groups = buildImprensaFactGroups(facts, ["sancoes", "chapas"])
    assert.deepEqual(groups.map((group) => group.id), ["justica", "chapas"])
    assert.deepEqual(groups[0].cards.map((card) => card.id), ["sancoes"])
  })
})

describe("buildImprensaFactCards", () => {
  const cards = buildImprensaFactCards(computeImprensaFacts(FIXTURE))

  it("segue a ordem padrão e nunca inclui o TCU em revisão", () => {
    assert.deepEqual(cards.map((card) => card.id), [...IMPRENSA_FACT_CARD_ORDER])
    assert.ok(cards.every((card) => !/TCU/.test(`${card.label} ${card.detail}`)))
  })

  it("mantém denominador e ressalva obrigatória em cada card", () => {
    const byId = Object.fromEntries(cards.map((card) => [card.id, card]))
    assert.equal(byId.patrimonio_variacao.value, 1)
    assert.equal(byId.patrimonio_variacao.label, "patrimônio cresceu mais de 100% entre duas eleições")
    assert.equal(byId.patrimonio_variacao.detail, "Entre 3 candidatos com duas declarações comparáveis, de 4 declarações publicadas.")
    assert.equal(byId.patrimonio_variacao.caveat, "Variação nominal, sem correção pela inflação. Declaração ao TSE, não auditoria.")
    assert.equal(byId.processos.detail, "5 registros na ficha: 5 judiciais · 0 disciplinares; 1 com fonte oficial em confirmação.")
    assert.equal(byId.processos.caveat, "Processo não é condenação. Processo disciplinar não é processo judicial nem condenação. Homônimo não confirmado não entra.")
    assert.equal(byId.sancoes.label, "candidato em cadastro federal de sanções")
    assert.equal(byId.sancoes.caveat, "CEIS, CNEP ou CEAF, da CGU.")
    assert.deepEqual(byId.patrimonio_variacao.mesaQuery, { ordem: "variacao" })
    assert.deepEqual(byId.processos.mesaQuery, { com: "processo" })
    for (const card of cards) assert.ok(card.caveat.length > 0 && card.detail.length > 0, card.id)
  })

  it("mantém o card com zero e o denominador visível", () => {
    const [sancoes] = buildImprensaFactCards(computeImprensaFacts([FIXTURE[0], FIXTURE[4]]), ["sancoes"])
    assert.equal(sancoes.value, 0)
    assert.equal(sancoes.label, "candidatos em cadastro federal de sanções")
    assert.equal(sancoes.detail, "1 consultado sem registro; 1 sem consulta.")
  })

  it("não usa travessão em nenhum texto", () => {
    for (const card of cards) assert.doesNotMatch(`${card.label} ${card.detail} ${card.caveat} ${card.cta}`, /[\u2013\u2014]/)
  })
})

describe("imprensaDataBucket", () => {
  it("agrupa os estados internos nos quatro grupos da legenda", () => {
    assert.equal(imprensaDataBucket("publicado"), "publicado")
    assert.equal(imprensaDataBucket("com-registros"), "publicado")
    assert.equal(imprensaDataBucket("indeferidos_comprovados"), "publicado")
    assert.equal(imprensaDataBucket("vazio_confirmado"), "nada_consta")
    assert.equal(imprensaDataBucket("vazio-confirmado"), "nada_consta")
    assert.equal(imprensaDataBucket("vazio_verificado"), "nada_consta")
    assert.equal(imprensaDataBucket("cobertura_parcial"), "parcial")
    assert.equal(imprensaDataBucket("encontrado_em_revisao"), "parcial")
    assert.equal(imprensaDataBucket("contraditorio"), "parcial")
    for (const state of ["indeterminado", "nao_buscado", "erro", "desatualizado", "sem_dado", "indisponivel", "nao-verificado", "nao_verificado", "pendente", "valor_nao_informado", "multiplas_declaracoes"]) {
      assert.equal(imprensaDataBucket(state), "sem_confirmacao", state)
    }
  })

  it("nunca trata estado desconhecido como publicado e ignora o que não se aplica", () => {
    assert.equal(imprensaDataBucket("estado_novo"), "sem_confirmacao")
    assert.equal(imprensaDataBucket(null), "sem_confirmacao")
    assert.equal(imprensaDataBucket("nao_aplicavel"), null)
  })

  it("usa as mesmas quatro palavras em toda a seção", () => {
    assert.deepEqual(IMPRENSA_DATA_BUCKETS.map((bucket) => bucket.label), [
      "Publicado",
      "Buscado, nada consta",
      "Parcial ou em revisão",
      "Sem confirmação ou sem dado",
    ])
    assert.equal(imprensaDataBucketLabel("parcial"), "Parcial ou em revisão")
  })
})

import test, { describe } from "node:test"
import assert from "node:assert/strict"
import {
  agruparProposicoesPorEmenta,
  chaveDeIdentidadeDaProposicao,
  chaveDeTextoDaProposicao,
  descreverReapresentacoes,
  deduplicarProposicoesPorEmenta,
  umaLinhaPorTextoDeEmenta,
} from "../src/lib/proposicao-dedupe"
import { groupLegislacaoProfileItems } from "../src/lib/legislacao-profile-groups"
import type { ProjetoLei } from "../src/lib/types"

/**
 * As ementas abaixo são cópia literal das linhas de `cabo-daciolo` em
 * `projetos_lei`, lidas do banco em 09/08/2026. Nenhum texto foi inventado para
 * o teste: o caso do print é reproduzível porque o dado é o dado.
 *
 * O acervo do candidato tem 204 linhas, 58 delas projeto de lei e nenhuma com
 * `destaque` editorial. As 24 linhas do requerimento da PEC 446/09 se dividem em
 * dois textos que só diferem pelo ponto final, e é por isso que a chave de
 * identidade normaliza pontuação de fim.
 */
const EMENTA_REQ_PEC_446 =
  'Requer a inclusão da PEC 446/09 (PEC 300/08), que "dispõe do piso salarial e remuneração dos Policiais Militares, Bombeiros e Civis", na pauta do Plenário da Câmara dos Deputados'
const EMENTA_REQ_PEC_446_COM_PONTO = `${EMENTA_REQ_PEC_446}.`
const EMENTA_PL_1656 =
  "Cria o Programa de Financiamento Habitacional para os Militares da Defesa Nacional e agentes de Segurança Pública"
const EMENTA_PL_4367 =
  "Dispõe sobre a reorganização das vagas de Concurso Público na área de Segurança Pública de todo País."

function projeto(overrides: Partial<ProjetoLei> & Pick<ProjetoLei, "id">): ProjetoLei {
  return {
    candidato_id: "cabo-daciolo",
    tipo: "REQ",
    numero: null,
    ano: null,
    ementa: null,
    tema: null,
    situacao: null,
    url_inteiro_teor: null,
    destaque: false,
    destaque_motivo: null,
    fonte: "Camara",
    ...overrides,
  }
}

/** As 24 linhas reais do requerimento repetido, com os números do banco. */
const REQS_PEC_446: ProjetoLei[] = [
  ["5197", 2016],
  ["5255", 2016],
  ["5450", 2016],
  ["5626", 2016],
  ["5795", 2017],
  ["6083", 2017],
  ["6190", 2017],
  ["6362", 2017],
  ["6642", 2017],
  ["6909", 2017],
  ["7162", 2017],
  ["7360", 2017],
  ["7596", 2017],
  ["7861", 2017],
  ["8016", 2018],
  ["8175", 2018],
  ["8352", 2018],
  ["8588", 2018],
  ["8767", 2018],
  ["8986", 2018],
  ["9159", 2018],
  ["9201", 2018],
  ["9245", 2018],
  ["9344", 2018],
].map(([numero, ano], index) =>
  projeto({
    id: `req-${numero}`,
    tipo: "REQ",
    numero: numero as string,
    ano: ano as number,
    // Metade das linhas do banco traz o ponto final, metade não.
    ementa: index % 2 === 0 ? EMENTA_REQ_PEC_446 : EMENTA_REQ_PEC_446_COM_PONTO,
  })
)

describe("dedupe de autoria legislativa (item 8)", () => {
  test("as 24 reapresentações do requerimento da PEC 446/09 viram um grupo só", () => {
    const grupos = agruparProposicoesPorEmenta(REQS_PEC_446)

    assert.equal(grupos.length, 1, "ponto final no fim da ementa não cria proposição nova")
    assert.equal(grupos[0].totalNoGrupo, 24)
    assert.equal(grupos[0].reapresentacoes.length, 23)
    assert.equal(grupos[0].anoInicial, 2016)
    assert.equal(grupos[0].anoFinal, 2018)
  })

  test("o representante é a linha mais recente do grupo", () => {
    const grupos = agruparProposicoesPorEmenta(REQS_PEC_446)
    assert.equal(grupos[0].representante.numero, "9344")
    assert.equal(grupos[0].representante.ano, 2018)
  })

  test("destaque editorial vence a linha mais recente na escolha do representante", () => {
    const comCuradoria = REQS_PEC_446.map((item) =>
      item.numero === "5450" ? { ...item, destaque: true, destaque_motivo: "curadoria" } : item
    )
    const grupos = agruparProposicoesPorEmenta(comCuradoria)
    assert.equal(grupos[0].representante.numero, "5450")
  })

  test("ementa vazia nunca agrupa", () => {
    // As 6 linhas de `cabo-daciolo` sem ementa são proposições diferentes cujo
    // texto não veio na fonte. Colapsá-las inventaria uma reapresentação.
    const semEmenta = [
      projeto({ id: "emp-7-2015", tipo: "EMP", numero: "7", ano: 2015, ementa: "" }),
      projeto({ id: "emp-2-2016", tipo: "EMP", numero: "2", ano: 2016, ementa: null }),
      projeto({ id: "emp-5-2016", tipo: "EMP", numero: "5", ano: 2016, ementa: "   " }),
      projeto({ id: "emc-150-2017", tipo: "EMC", numero: "150", ano: 2017, ementa: "" }),
    ]
    const grupos = agruparProposicoesPorEmenta(semEmenta)
    assert.equal(grupos.length, 4)
    assert.ok(grupos.every((g) => g.totalNoGrupo === 1))
  })

  /**
   * `helder-salomao` tem 147 linhas de EMC de 2025 com a ementa do projeto dos
   * portos e 144 números diferentes: são 147 emendas distintas ao mesmo
   * projeto, e a ementa gravada é a da proposição hospedeira. `efraim-filho`
   * repete o padrão com 87 EMC sobre "Altera o Sistema Tributário Nacional".
   */
  test("emenda não agrupa: a ementa dela é do projeto hospedeiro", () => {
    const ementaHospedeira =
      "Dispõe sobre o Sistema Portuário Brasileiro, regula a exploração dos portos e dá outras providências."
    const emendas = Array.from({ length: 147 }, (_, i) =>
      projeto({ id: `emc-${i}`, tipo: "EMC", numero: String(i + 1), ano: 2025, ementa: ementaHospedeira })
    )
    const grupos = agruparProposicoesPorEmenta(emendas)
    assert.equal(grupos.length, 147, "cada emenda é um ato próprio")
  })

  test("parecer e substitutivo também não agrupam", () => {
    for (const tipo of ["PRL", "SBT", "VTS", "ERD", "EMA", "REC", "XYZ"]) {
      const linhas = [
        projeto({ id: `${tipo}-1`, tipo, numero: "1", ano: 2020, ementa: "Parecer pela aprovação." }),
        projeto({ id: `${tipo}-2`, tipo, numero: "2", ano: 2020, ementa: "Parecer pela aprovação." }),
      ]
      assert.equal(agruparProposicoesPorEmenta(linhas).length, 2, tipo)
    }
  })

  test("projeto de lei reapresentado agrupa", () => {
    const linhas = [
      projeto({ id: "pl-a", tipo: "PL", numero: "100", ano: 2015, ementa: EMENTA_PL_1656 }),
      projeto({ id: "pl-b", tipo: "PL", numero: "200", ano: 2019, ementa: EMENTA_PL_1656 }),
    ]
    assert.equal(agruparProposicoesPorEmenta(linhas).length, 1)
  })

  test("mesma ementa em tipos diferentes continua sendo duas proposições", () => {
    const grupos = agruparProposicoesPorEmenta([
      projeto({ id: "a", tipo: "PL", numero: "1", ano: 2015, ementa: EMENTA_PL_1656 }),
      projeto({ id: "b", tipo: "REQ", numero: "2", ano: 2015, ementa: EMENTA_PL_1656 }),
    ])
    assert.equal(grupos.length, 2, "pedir pauta e propor norma não são o mesmo ato")
  })

  test("a chave normaliza espaço e caixa, e não normaliza acento", () => {
    const base = projeto({ id: "x", tipo: "REQ", ementa: "Requer  a INCLUSÃO da PEC 446/09." })
    const igual = projeto({ id: "y", tipo: "req", ementa: "requer a inclusão da pec 446/09" })
    const diferente = projeto({ id: "z", tipo: "REQ", ementa: "Requer a inclusao da PEC 446/09" })

    assert.equal(chaveDeIdentidadeDaProposicao(base), chaveDeIdentidadeDaProposicao(igual))
    assert.notEqual(chaveDeIdentidadeDaProposicao(base), chaveDeIdentidadeDaProposicao(diferente))
    assert.equal(chaveDeIdentidadeDaProposicao(projeto({ id: "w", ementa: "  " })), null)
  })

  test("a ordem de entrada é preservada", () => {
    const entrada = [
      projeto({ id: "pl", tipo: "PL", numero: "1656", ano: 2015, ementa: EMENTA_PL_1656 }),
      ...REQS_PEC_446,
      projeto({ id: "pl2", tipo: "PL", numero: "4367", ano: 2016, ementa: EMENTA_PL_4367 }),
    ]
    assert.deepEqual(
      deduplicarProposicoesPorEmenta(entrada).map((p) => p.id),
      ["pl", "req-9344", "pl2"]
    )
  })

  test("o cartão colapsado declara a contagem e a janela", () => {
    const [grupo] = agruparProposicoesPorEmenta(REQS_PEC_446)
    const texto = descreverReapresentacoes(grupo)
    assert.ok(texto)
    assert.match(texto, /Apresentada 24 vezes com a mesma ementa entre 2016 e 2018\./)
    assert.match(texto, /REQ 5197\/2016/)
    assert.equal(
      descreverReapresentacoes(agruparProposicoesPorEmenta([REQS_PEC_446[0]])[0]),
      null,
      "grupo de um não declara nada"
    )
  })
})

describe("promoção ao box destacado (item 8)", () => {
  const acervoDaciolo: ProjetoLei[] = [
    ...REQS_PEC_446,
    projeto({ id: "pl-1656", tipo: "PL", numero: "1656", ano: 2015, ementa: EMENTA_PL_1656 }),
    projeto({ id: "pl-4367", tipo: "PL", numero: "4367", ano: 2016, ementa: EMENTA_PL_4367 }),
  ]

  function agrupar(projetosLei: ProjetoLei[]) {
    return groupLegislacaoProfileItems({
      projetosLei,
      legislacaoMandatoExecutivo: [],
      votos: [],
      cargoDisputado: "Presidente",
    })
  }

  test("o PL entra no recorte de destaques", () => {
    const grupos = agrupar(acervoDaciolo)
    assert.ok(
      grupos.destaquesParlamentares.some((p) => p.id === "pl-1656"),
      "PL 1656/2015 (programa habitacional para agentes de segurança pública) precisa aparecer"
    )
  })

  /**
   * A ementa real do requerimento da PEC 446/09 pontua 3 na heurística
   * (`/pol[ií]cia/` e `/policiais?/` casam as duas em "Policiais", mais
   * "Bombeiros"), exatamente o corte. Sem dedupe, as 24 linhas entram como 24
   * candidatos de score idêntico e, no desempate por data, as de 2018 passam na
   * frente do PL 1656/2015: o recorte publicava dez cópias do mesmo texto e
   * nenhum projeto de lei. É este o caso do print.
   */
  test("as 24 reapresentações rendem no máximo um destaque", () => {
    // Controle: uma linha só já passa do corte. Sem isto o teste passaria mesmo
    // com o dedupe removido.
    const controle = agrupar([{ ...REQS_PEC_446[0], id: "controle" }])
    assert.equal(
      controle.destaquesParlamentares.length,
      1,
      "a ementa real do REQ precisa pontuar acima do corte para o teste ter valor"
    )

    const grupos = agrupar(acervoDaciolo)
    const reqs = grupos.destaquesParlamentares.filter((p) => p.tipo === "REQ")
    assert.ok(reqs.length <= 1, `24 reapresentações renderam ${reqs.length} destaques`)
  })

  test("nenhum texto de ementa aparece duas vezes no recorte, entre tipos inclusive", () => {
    const grupos = agrupar(acervoDaciolo)
    const chaves = grupos.destaquesParlamentares.map((p) => chaveDeTextoDaProposicao(p))
    assert.equal(new Set(chaves).size, chaves.length)
  })

  /**
   * A chave do box é o texto puro, sem sigla. Um REQ com a mesma ementa de um
   * PL não pode gastar uma segunda vaga, e a vaga é do PL: esconder o projeto
   * atrás do requerimento é o erro que o print denunciou. O REQ entra PRIMEIRO
   * na ordem de entrada de propósito, para provar que a escolha é por
   * precedência e não por posição.
   */
  test("PL e REQ de mesma ementa gastam uma vaga só no box, e a vaga é do PL", () => {
    const ementa =
      "Institui o programa de segurança pública, saúde e educação nas escolas públicas"
    const req = projeto({ id: "req-igual", tipo: "REQ", numero: "10", ano: 2018, ementa })
    const pl = projeto({ id: "pl-igual", tipo: "PL", numero: "20", ano: 2015, ementa })

    const grupos = agrupar([req, pl])
    const noBox = grupos.destaquesParlamentares.filter((p) => p.ementa === ementa)
    assert.equal(noBox.length, 1, "mesmo texto não pode ocupar duas vagas")
    assert.equal(noBox[0].id, "pl-igual", "a vaga é do projeto de lei, não do requerimento")
    assert.equal(grupos.propostasParlamentares.length, 2, "a lista continua com os dois atos")
  })

  /**
   * Curadoria humana sobrevive ao dedupe textual. Sem a precedência, uma EMC
   * comum na frente da EMC curada de mesmo texto tomaria a vaga e mataria o
   * `destaque` editorial em silêncio.
   */
  test("EMC curada sobrevive à EMC comum de mesmo texto no box", () => {
    const ementa = "Dispõe sobre o programa de saúde e educação básica"
    const comum = projeto({ id: "emc-comum", tipo: "EMC", numero: "1", ano: 2020, ementa })
    const curada = projeto({
      id: "emc-curada",
      tipo: "EMC",
      numero: "2",
      ano: 2019,
      ementa,
      destaque: true,
      destaque_motivo: "Marcada pela curadoria",
    })

    const grupos = agrupar([comum, curada])
    assert.deepEqual(
      grupos.destaquesParlamentares.map((p) => p.id),
      ["emc-curada"],
      "a linha curada fica com a vaga, mesmo entrando depois"
    )
  })

  test("precedência do box: curadoria, depois projeto de lei, depois ordem de entrada", () => {
    const ementa = "Cria o fundo de infraestrutura"
    const reqComum = projeto({ id: "a", tipo: "REQ", numero: "1", ano: 2020, ementa })
    const plComum = projeto({ id: "b", tipo: "PL", numero: "2", ano: 2019, ementa })
    const reqCurado = projeto({ id: "c", tipo: "REQ", numero: "3", ano: 2018, ementa, destaque: true })

    assert.deepEqual(umaLinhaPorTextoDeEmenta([reqComum, plComum]).map((p) => p.id), ["b"])
    assert.deepEqual(umaLinhaPorTextoDeEmenta([plComum, reqCurado]).map((p) => p.id), ["c"])
    const reqComum2 = { ...reqComum, id: "a2" }
    assert.deepEqual(
      umaLinhaPorTextoDeEmenta([reqComum, reqComum2]).map((p) => p.id),
      ["a"],
      "empate fica com a primeira da ordem de entrada"
    )
  })

  /**
   * Emendas ao mesmo projeto são atos distintos e a LISTA mostra todas, mas o
   * box gasta uma vaga por texto. Caso medido: `marcio-franca` levava 6 das 10
   * vagas com a mesma ementa.
   */
  test("emendas distintas de mesmo texto não repetem no box, mas continuam na lista", () => {
    const ementaHospedeira =
      "Dispõe sobre o programa de segurança pública, saúde e educação, e dá outras providências"
    const emendas = Array.from({ length: 12 }, (_, i) =>
      projeto({ id: `emc-${i}`, tipo: "EMC", numero: String(i + 1), ano: 2025, ementa: ementaHospedeira })
    )
    const grupos = agrupar(emendas)

    assert.equal(grupos.destaquesParlamentares.length, 1, "uma vaga por texto no recorte")
    assert.equal(grupos.propostasParlamentares.length, 12, "a lista mantém as 12 emendas")
  })

  test("projeto de lei vem antes de proposição acessória no recorte", () => {
    // Um requerimento cuja ementa pontua alto na heurística não pode empurrar o
    // projeto de lei para fora das 10 vagas.
    const requerimentoQuePontuaAlto = projeto({
      id: "req-alto",
      tipo: "REQ",
      numero: "1",
      ano: 2018,
      ementa:
        "Requer sessão sobre o programa de segurança pública, saúde, educação, assistência social, orçamento, crédito e infraestrutura",
    })
    const grupos = agrupar([requerimentoQuePontuaAlto, ...acervoDaciolo])
    const primeiroAcessorio = grupos.destaquesParlamentares.findIndex((p) => p.tipo === "REQ")
    const ultimoNormativo = grupos.destaquesParlamentares.reduce(
      (acc, p, i) => (p.tipo === "PL" ? i : acc),
      -1
    )
    assert.ok(
      primeiroAcessorio === -1 || primeiroAcessorio > ultimoNormativo,
      "requerimento apareceu antes de projeto de lei no recorte"
    )
  })

  test("destaque editorial em requerimento continua no topo", () => {
    const comCuradoria = acervoDaciolo.map((item) =>
      item.id === "req-9344"
        ? { ...item, destaque: true, destaque_motivo: "Marcado pela curadoria" }
        : item
    )
    const grupos = agrupar(comCuradoria)
    assert.equal(grupos.destaquesParlamentares[0]?.id, "req-9344")
  })

  test("acervo sem proposição relevante não inventa destaque", () => {
    const grupos = agrupar([
      projeto({ id: "req-x", tipo: "REQ", numero: "1", ano: 2018, ementa: "Requer a juntada de documento ao processo" }),
    ])
    assert.equal(grupos.destaquesParlamentares.length, 0)
    assert.equal(grupos.hasLegislationHighlights, false)
  })
})

import assert from "node:assert/strict"
import test, { describe } from "node:test"
import {
  buildFinanciamentoEleicoes,
  descreverFinanciamentoEleicao,
  FINANCIAMENTO_ANO_INICIAL_DA_SERIE_TSE,
  FINANCIAMENTO_SERIE_TSE_FONTE_URL,
  FINANCIAMENTO_SERIE_TSE_VERIFICADO_EM,
  FINANCIAMENTO_ULTIMO_PLEITO_COM_PRESTACAO_DEVIDA,
} from "@/lib/financiamento-eleicoes"
import type { HistoricoPolitico } from "@/lib/types"

/**
 * Regressão dos casos provados na auditoria de 10/08/2026 contra os pacotes
 * oficiais do TSE. Antes desta função, um pleito disputado sem linha de
 * financiamento simplesmente sumia da aba Dinheiro, e o estado vazio da seção
 * afirmava que o TSE não tinha registro.
 */

function candidatura(
  partial: Partial<HistoricoPolitico> & Pick<HistoricoPolitico, "id" | "periodo_inicio">,
): HistoricoPolitico {
  return {
    candidato_id: "candidato-teste",
    cargo: "Deputado Estadual",
    cargo_canonico: "Deputado Estadual",
    tipo_evento: "candidatura",
    periodo_fim: null,
    partido: "PPB",
    estado: "RJ",
    eleito_por: "voto direto",
    observacoes: null,
    proveniencia: "tse",
    ...partial,
    id: partial.id,
    periodo_inicio: partial.periodo_inicio,
  }
}

describe("buildFinanciamentoEleicoes", () => {
  test("flavio-bolsonaro: 2002 aparece como pleito sem coleta, não some da aba", () => {
    // O TSE publica R$ 5.988,00 para FLAVIO NANTES BOLSONARO no
    // ReceitaCandidato.csv de 2002. A ficha não tem a linha, e não pode calar.
    const eleicoes = buildFinanciamentoEleicoes(
      [{ ano_eleicao: 2018 }, { ano_eleicao: 2016 }, { ano_eleicao: 2014 }, { ano_eleicao: 2010 }, { ano_eleicao: 2006 }],
      [
        candidatura({ id: "h-2018", periodo_inicio: 2018, cargo: "Senador", cargo_canonico: "Senador" }),
        candidatura({ id: "h-2016", periodo_inicio: 2016, cargo: "Prefeito", cargo_canonico: "Prefeito" }),
        candidatura({ id: "h-2014", periodo_inicio: 2014 }),
        candidatura({ id: "h-2010", periodo_inicio: 2010 }),
        candidatura({ id: "h-2006", periodo_inicio: 2006 }),
        candidatura({ id: "h-2002", periodo_inicio: 2002 }),
      ],
    )

    const dois_mil_e_dois = eleicoes.find((e) => e.ano === 2002)
    assert.ok(dois_mil_e_dois, "2002 tem de existir na série, e não sumir")
    assert.equal(dois_mil_e_dois.estado, "nao_coletado")
    assert.equal(eleicoes.filter((e) => e.estado === "publicado").length, 5)
    assert.deepEqual(
      eleicoes.map((e) => e.ano),
      [2018, 2016, 2014, 2010, 2006, 2002],
      "ordem decrescente, sem buraco",
    )
  })

  test("cabo-daciolo: 2006 e 2008 aparecem como não coletados", () => {
    // Provados no pacote oficial: R$ 1.259,44 em 2006 e R$ 720,00 em 2008.
    const eleicoes = buildFinanciamentoEleicoes(
      [{ ano_eleicao: 2022 }, { ano_eleicao: 2018 }, { ano_eleicao: 2014 }],
      [
        candidatura({ id: "h-2022", periodo_inicio: 2022, cargo: "Senador", cargo_canonico: "Senador" }),
        candidatura({ id: "h-2018", periodo_inicio: 2018, cargo: "Presidente", cargo_canonico: "Presidente" }),
        candidatura({ id: "h-2014", periodo_inicio: 2014, cargo: "Deputado Federal", cargo_canonico: "Deputado Federal" }),
        candidatura({ id: "h-2008", periodo_inicio: 2008, cargo: "Vereador", cargo_canonico: "Vereador" }),
        candidatura({ id: "h-2006", periodo_inicio: 2006 }),
      ],
    )

    for (const ano of [2008, 2006]) {
      const eleicao = eleicoes.find((e) => e.ano === ano)
      assert.ok(eleicao, `${ano} tem de aparecer`)
      assert.equal(eleicao.estado, "nao_coletado", `${ano} não pode ser ausência afirmada`)
      assert.equal(eleicao.fonte_url, null)
    }
  })

  test("pleito anterior a 2002 é ausência VERIFICADA, com fonte e data", () => {
    const eleicoes = buildFinanciamentoEleicoes(
      [],
      [
        candidatura({ id: "h-2000", periodo_inicio: 2000, cargo: "Prefeito", cargo_canonico: "Prefeito" }),
        candidatura({ id: "h-1996", periodo_inicio: 1996, cargo: "Vereador", cargo_canonico: "Vereador" }),
      ],
    )

    assert.equal(eleicoes.length, 2)
    for (const eleicao of eleicoes) {
      assert.equal(eleicao.estado, "fora_da_serie_oficial")
      assert.equal(eleicao.fonte_url, FINANCIAMENTO_SERIE_TSE_FONTE_URL)
      assert.equal(eleicao.verificado_em, FINANCIAMENTO_SERIE_TSE_VERIFICADO_EM)
      assert.match(
        descreverFinanciamentoEleicao(eleicao),
        new RegExp(`a partir de ${FINANCIAMENTO_ANO_INICIAL_DA_SERIE_TSE}`),
      )
    }
  })

  test("pleito que ainda não ocorreu não vira pendência de coleta", () => {
    const futuro = FINANCIAMENTO_ULTIMO_PLEITO_COM_PRESTACAO_DEVIDA + 2
    const eleicoes = buildFinanciamentoEleicoes(
      [],
      [candidatura({ id: "h-futuro", periodo_inicio: futuro, cargo: "Governador", cargo_canonico: "Governador" })],
    )

    assert.deepEqual(eleicoes, [
      { ano: futuro, estado: "pleito_futuro", fonte_url: null, verificado_em: null },
    ])
    assert.equal(
      buildFinanciamentoEleicoes(
        [],
        [
          candidatura({
            id: "h-devido",
            periodo_inicio: FINANCIAMENTO_ULTIMO_PLEITO_COM_PRESTACAO_DEVIDA,
            cargo: "Vereador",
            cargo_canonico: "Vereador",
          }),
        ],
      )[0]?.estado,
      "nao_coletado",
      "o último pleito com prestação devida é lacuna nossa, não pleito futuro",
    )
  })

  test("nenhum estado insinua ausência de arrecadação quando só faltou coleta", () => {
    const [eleicao] = buildFinanciamentoEleicoes(
      [],
      [candidatura({ id: "h-2016", periodo_inicio: 2016, cargo: "Vereador", cargo_canonico: "Vereador" })],
    )
    assert.ok(eleicao)
    assert.equal(eleicao.estado, "nao_coletado")
    const texto = descreverFinanciamentoEleicao(eleicao)
    assert.match(texto, /não significa que não houve arrecadação/)
    assert.doesNotMatch(texto, /não há registros?/i)
  })

  test("posse por sucessão não vira pleito disputado", () => {
    // Edilson Damião assumiu o governo de RR em 2026 por sucessão. 2026 ser ano
    // de eleição não transforma a posse dele numa candidatura.
    const eleicoes = buildFinanciamentoEleicoes(
      [],
      [
        candidatura({
          id: "h-sucessao",
          periodo_inicio: 2026,
          cargo: "Governador",
          cargo_canonico: "Governador",
          eleito_por: "sucessao",
          tipo_evento: "mandato",
        }),
      ],
    )
    assert.deepEqual(eleicoes, [])
  })

  test("linha de wiki ou curadoria não ancora pleito", () => {
    const eleicoes = buildFinanciamentoEleicoes(
      [],
      [candidatura({ id: "h-wiki", periodo_inicio: 2014, proveniencia: "wikidata" })],
    )
    assert.deepEqual(eleicoes, [])
  })

  test("ano com linha publicada continua publicado mesmo sem trajetória", () => {
    const eleicoes = buildFinanciamentoEleicoes([{ ano_eleicao: 2022, total_arrecadado: 1 }], [])
    assert.deepEqual(eleicoes, [
      { ano: 2022, estado: "publicado", fonte_url: null, verificado_em: null },
    ])
  })

  test("zero declarado é distinto de dado positivo e carrega a fonte da linha", () => {
    const eleicoes = buildFinanciamentoEleicoes(
      [{ ano_eleicao: 2008, total_arrecadado: 0, fonte: "https://dadosabertos.tse.jus.br/2008" }],
      [candidatura({ id: "h-2008-zero", periodo_inicio: 2008, cargo: "Vereador" })],
    )
    assert.deepEqual(eleicoes, [
      {
        ano: 2008,
        estado: "zero_declarado",
        fonte_url: "https://dadosabertos.tse.jus.br/2008",
        verificado_em: null,
      },
    ])
    assert.match(descreverFinanciamentoEleicao(eleicoes[0]!), /zero declarado/i)
  })

  test("ausência oficial e erro persistidos vencem o fallback não coletado", () => {
    const historico = [
      candidatura({ id: "h-2004", periodo_inicio: 2004, cargo: "Prefeito" }),
      candidatura({ id: "h-2008", periodo_inicio: 2008, cargo: "Vereador" }),
    ]
    const eleicoes = buildFinanciamentoEleicoes([], historico, [
      {
        ano_eleicao: 2008,
        resultado: "ausencia_oficial",
        fonte_url: "https://dadosabertos.tse.jus.br/2008",
        verificado_em: "2026-08-10",
        detalhe: "SQ, ano e UF conferidos no pacote oficial; nenhuma receita publicada.",
      },
      {
        ano_eleicao: 2004,
        resultado: "erro",
        fonte_url: "https://dadosabertos.tse.jus.br/2004",
        verificado_em: "2026-08-10",
        detalhe: "Layout oficial sem SQ_CANDIDATO; identidade recusada.",
      },
    ])

    assert.equal(eleicoes.find((e) => e.ano === 2008)?.estado, "ausencia_oficial")
    assert.equal(eleicoes.find((e) => e.ano === 2004)?.estado, "erro")
    assert.match(descreverFinanciamentoEleicao(eleicoes.find((e) => e.ano === 2004)!), /não foi possível concluir/i)
  })
})

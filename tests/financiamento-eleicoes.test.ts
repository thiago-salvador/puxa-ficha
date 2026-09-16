import assert from "node:assert/strict"
import test, { describe } from "node:test"
import {
  buildFinanciamentoEleicoes,
  descreverFinanciamentoEleicao,
  humanizarDetalheFinanciamentoAusente,
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

  test("pleito anterior a 2002 está fora da série consultada, com fonte e data", () => {
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
        new RegExp(`começa em ${FINANCIAMENTO_ANO_INICIAL_DA_SERIE_TSE}`),
      )
      assert.match(descreverFinanciamentoEleicao(eleicao), /não comprova inexistência de documentos em outros acervos/)
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

  test("traduz marcador técnico de receita ausente sem afirmar ausência global", () => {
    const texto = descreverFinanciamentoEleicao({
      ano: 2026,
      estado: "ausencia_oficial",
      fonte_url: "https://example.test/receitas.zip",
      verificado_em: "2026-09-15T00:00:00Z",
      detalhe: "Arquivo oficial contém #NULO, sem SQ_RECEITA válido e sem receita materializável.",
    })
    assert.equal(
      texto,
      "Nenhum registro de receitas foi localizado para esta candidatura no arquivo oficial consultado. Isso não comprova ausência global de recursos.",
    )
    assert.doesNotMatch(texto, /#NULO|SQ_RECEITA|materializável/i)
  })

  test("preserva detalhe humano de financiamento já explicado", () => {
    const detalhe = "Nenhum registro de receitas foi localizado no arquivo oficial consultado. Isso não comprova ausência global de recursos."
    assert.equal(
      descreverFinanciamentoEleicao({ ano: 2026, estado: "ausencia_oficial", fonte_url: null, verificado_em: null, detalhe }),
      detalhe,
    )
  })

  test("não reescreve marcador TSE quando não prova ausência de receita", () => {
    const detalhe = "Arquivo oficial contém #NULO no campo de origem; SQ_RECEITA válido foi localizado."
    assert.equal(humanizarDetalheFinanciamentoAusente(detalhe), detalhe)
  })

  test("não aplicável preserva a prova sem inventar candidatura na UI", () => {
    const eleicoes = buildFinanciamentoEleicoes(
      [{ ano_eleicao: 2002, total_arrecadado: 54050 }],
      [
        candidatura({ id: "h-2002", periodo_inicio: 2002, cargo: "Senador", cargo_canonico: "Senador" }),
        candidatura({ id: "h-2004", periodo_inicio: 2004, cargo: "Prefeito", cargo_canonico: "Prefeito" }),
        candidatura({ id: "h-2008", periodo_inicio: 2008, cargo: "Prefeito", cargo_canonico: "Prefeito" }),
        candidatura({ id: "h-2020", periodo_inicio: 2020, cargo: "Prefeito", cargo_canonico: "Prefeito" }),
      ],
      [
        { ano_eleicao: 2004, resultado: "nao_aplicavel", fonte_url: "https://cdn.tse.jus.br/2004", verificado_em: "2026-09-15", detalhe: "prova" },
        { ano_eleicao: 2008, resultado: "nao_aplicavel", fonte_url: "https://cdn.tse.jus.br/2008", verificado_em: "2026-09-15", detalhe: "prova" },
        { ano_eleicao: 2020, resultado: "nao_aplicavel", fonte_url: "https://cdn.tse.jus.br/2020", verificado_em: "2026-09-15", detalhe: "prova" },
      ],
    )

    // Uma verificação contraditória não pode esconder candidaturas reais.
    assert.deepEqual(eleicoes.map((eleicao) => eleicao.ano), [2020, 2008, 2004, 2002])
    assert.equal(eleicoes.find((eleicao) => eleicao.ano === 2002)?.estado, "publicado")
    assert.equal(eleicoes.find((eleicao) => eleicao.ano === 2004)?.estado, "nao_coletado")
    assert.deepEqual(buildFinanciamentoEleicoes([], [], [
      { ano_eleicao: 2004, resultado: "nao_aplicavel", fonte_url: "https://cdn.tse.jus.br/2004", verificado_em: "2026-09-15" },
    ]), [])
  })

  test("mantém duas verificações do mesmo ano separadas por SQ e cargo", () => {
    const eleicoes = buildFinanciamentoEleicoes([], [], [
      {
        ano_eleicao: 2018,
        sq_candidato: "sq-federal",
        uf_candidatura: "GO",
        cargo_candidatura: "Deputado Federal",
        resultado: "ausencia_oficial",
        fonte_url: "https://dadosabertos.tse.jus.br/2018",
        verificado_em: "2026-09-15",
        detalhe: "contexto federal",
      },
      {
        ano_eleicao: 2018,
        sq_candidato: "sq-estadual",
        uf_candidatura: "GO",
        cargo_candidatura: "Deputado Estadual",
        resultado: "erro",
        fonte_url: "https://dadosabertos.tse.jus.br/2018",
        verificado_em: "2026-09-15",
        detalhe: "contexto estadual",
      },
    ])

    assert.equal(eleicoes.length, 2)
    assert.deepEqual(eleicoes.map((row) => row.sq_candidato), ["sq-federal", "sq-estadual"])
    assert.deepEqual(eleicoes.map((row) => row.cargo_candidatura), ["Deputado Federal", "Deputado Estadual"])
  })
})

describe("recibos nominais que superam tentativas gerais", () => {
  const nominal = {
    ano_eleicao: 2010,
    sq_candidato: "sq-federal",
    uf_candidatura: "MT",
    resultado: "ausencia_oficial" as const,
    fonte_url: "https://cdn.tse.jus.br/receitas-2010.zip",
    verificado_em: "2026-09-15T12:00:00Z",
  }
  const tentativa = {
    ano_eleicao: 2010,
    resultado: "erro" as const,
    fonte_url: "https://cdn.tse.jus.br/consulta-2010.zip",
    verificado_em: "2026-08-10T12:00:00Z",
  }

  test("não cria terceira candidatura a partir da falha geral superada", () => {
    const result = buildFinanciamentoEleicoes([], [], [
      tentativa,
      nominal,
      { ...nominal, sq_candidato: "sq-suplente" },
    ])
    assert.equal(result.length, 2)
    assert.deepEqual(result.map((row) => row.estado), ["ausencia_oficial", "ausencia_oficial"])
  })

  test("preserva falha nominal e falha geral posterior", () => {
    const result = buildFinanciamentoEleicoes([], [], [
      { ...tentativa, verificado_em: "2026-09-16T12:00:00Z" },
      { ...tentativa, sq_candidato: "sq-estadual", uf_candidatura: "MT" },
      nominal,
    ])
    assert.equal(result.filter((row) => row.estado === "erro").length, 2)
  })

  test("não supera falha sem prova nominal datada e atribuída", () => {
    for (const incomplete of [
      { ...nominal, fonte_url: null },
      { ...nominal, verificado_em: null },
      { ...nominal, uf_candidatura: null },
    ]) {
      const result = buildFinanciamentoEleicoes([], [], [tentativa, incomplete])
      assert.ok(result.some((row) => row.estado === "erro"))
    }
  })
})

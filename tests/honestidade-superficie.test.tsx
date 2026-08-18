import assert from "node:assert/strict"
import test, { describe } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import { MoneyTabSection } from "@/components/CandidatoProfileSections"
import { getProcessosEmptyState } from "@/components/EmptyState"
import { processosOverviewDisplay, processosResumoLabel } from "@/lib/processos-display"
import type { Financiamento, HistoricoPolitico, Patrimonio } from "@/lib/types"
import type { FinanciamentoEleicaoPublico } from "@/lib/financiamento-eleicoes"

/**
 * As duas afirmações falsas que a superfície pública publicava em 10/08/2026.
 *
 * 1. Financiamento afirmava "Não há registros de financiamento de campanha para
 *    este candidato no TSE" sem nunca ter consultado o TSE, e escondia todo
 *    pleito disputado sem linha.
 * 2. Judicial dizia "não verificado" para ficha cuja busca FOI feita e fechou
 *    como identidade não confirmada.
 */

/** A frase que não pode voltar à superfície em hipótese nenhuma. */
const FRASE_PROIBIDA = "Não há registros de financiamento de campanha para este candidato no TSE"

function patrimonioRow(partial: Partial<Patrimonio> & Pick<Patrimonio, "id">): Patrimonio {
  return {
    candidato_id: "candidato-teste",
    ano_eleicao: 2018,
    valor_total: 150_000,
    bens: [],
    ...partial,
    id: partial.id,
  }
}

function financiamentoRow(
  partial: Partial<Financiamento> & Pick<Financiamento, "id">,
): Financiamento {
  return {
    candidato_id: "candidato-teste",
    ano_eleicao: 2018,
    total_arrecadado: 50_000,
    total_fundo_partidario: 0,
    total_fundo_eleitoral: 0,
    total_pessoa_fisica: 0,
    total_recursos_proprios: 0,
    maiores_doadores: [],
    ...partial,
    id: partial.id,
  }
}

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

function renderMoneyTab(args: {
  patrimonio?: Patrimonio[]
  financiamento?: Financiamento[]
  financiamentoEleicoes?: FinanciamentoEleicaoPublico[]
  historico?: HistoricoPolitico[]
  historicoLength?: number
}) {
  return renderToStaticMarkup(
    <MoneyTabSection
      patrimonio={args.patrimonio ?? []}
      financiamento={args.financiamento ?? []}
      financiamentoEleicoes={args.financiamentoEleicoes}
      historico={args.historico ?? []}
      gastos={[]}
      historicoLength={args.historicoLength ?? (args.historico ?? []).length}
      suggestion={null}
    />,
  )
}

describe("defeito 1: financiamento não pode afirmar ausência sem verificar", () => {
  test("flavio-bolsonaro: 2002 aparece na aba com estado explícito", () => {
    const html = renderMoneyTab({
      financiamento: [
        financiamentoRow({ id: "fin-2018", ano_eleicao: 2018 }),
        financiamentoRow({ id: "fin-2006", ano_eleicao: 2006, total_arrecadado: 13_000 }),
      ],
      historico: [
        candidatura({ id: "h-2018", periodo_inicio: 2018, cargo: "Senador", cargo_canonico: "Senador" }),
        candidatura({ id: "h-2006", periodo_inicio: 2006 }),
        candidatura({ id: "h-2002", periodo_inicio: 2002 }),
      ],
    })

    assert.ok(
      html.includes('data-pf-financiamento-eleicao="2002"'),
      "o pleito de 2002 tem de aparecer na aba Dinheiro",
    )
    assert.ok(
      html.includes('data-pf-financiamento-eleicao-estado="nao_coletado"'),
      "2002 é lacuna de coleta nossa, o TSE publica o ano",
    )
    assert.ok(!html.includes(FRASE_PROIBIDA))
  })

  test("cabo-daciolo: 2006 e 2008 deixam de sumir da aba", () => {
    const html = renderMoneyTab({
      financiamento: [financiamentoRow({ id: "fin-2022", ano_eleicao: 2022 })],
      historico: [
        candidatura({ id: "h-2022", periodo_inicio: 2022, cargo: "Senador", cargo_canonico: "Senador" }),
        candidatura({ id: "h-2008", periodo_inicio: 2008, cargo: "Vereador", cargo_canonico: "Vereador" }),
        candidatura({ id: "h-2006", periodo_inicio: 2006 }),
      ],
    })

    assert.ok(html.includes('data-pf-financiamento-eleicao="2008"'))
    assert.ok(html.includes('data-pf-financiamento-eleicao="2006"'))
    assert.ok(
      html.includes("não significa que não houve arrecadação"),
      "lacuna de coleta não pode insinuar ausência de arrecadação",
    )
    assert.ok(!html.includes(FRASE_PROIBIDA))
  })

  test("ausência afirmada (pleito anterior a 2002) sai com fonte E data", () => {
    const html = renderMoneyTab({
      historico: [
        candidatura({ id: "h-1998", periodo_inicio: 1998, cargo: "Deputado Federal", cargo_canonico: "Deputado Federal" }),
      ],
    })

    assert.ok(html.includes('data-pf-financiamento-eleicao-estado="fora_da_serie_oficial"'))
    assert.ok(html.includes("Verificado em"), "ausência afirmada precisa de data")
    assert.ok(html.includes("Fonte oficial"), "ausência afirmada precisa de fonte")
    assert.ok(html.includes("dadosabertos.tse.jus.br"))
  })

  test("ficha com patrimônio e sem financiamento não afirma mais ausência no TSE", () => {
    const html = renderMoneyTab({
      patrimonio: [patrimonioRow({ id: "pat-2018" })],
      historico: [candidatura({ id: "h-2018", periodo_inicio: 2018 })],
    })

    assert.ok(!html.includes(FRASE_PROIBIDA), "a frase falsa não pode voltar")
    assert.ok(html.includes('data-pf-financiamento-eleicao="2018"'))
  })

  test("sem pleito nenhum, o estado vazio não fala pelo acervo do TSE", () => {
    const html = renderMoneyTab({ patrimonio: [patrimonioRow({ id: "pat-2018" })] })

    assert.ok(!html.includes(FRASE_PROIBIDA))
    assert.ok(html.includes("nenhuma ausência foi verificada na fonte oficial"))
  })

  test("linha publicada continua visível: a correção não esconde dado", () => {
    const html = renderMoneyTab({
      financiamento: [financiamentoRow({
        id: "fin-2018",
        ano_eleicao: 2018,
        categorias_origem: { fundo_eleitoral: 40_000, outros_recursos: 10_000 },
        maiores_doadores: [{ nome: "Direção partidária", valor: 40_000, tipo: "fundo_eleitoral" }],
      })],
      historico: [candidatura({ id: "h-2018", periodo_inicio: 2018 })],
    })

    assert.ok(html.includes('data-pf-timeline-ref="financiamento-fin-2018"'))
    assert.ok(html.includes("data-pf-financiamento-total-visivel"))
    assert.ok(html.includes("data-pf-financiamento-composicao-visivel"))
    assert.ok(html.includes("data-pf-financiamento-doador-visivel"))
    assert.ok(html.includes("50.000"))
    assert.ok(html.includes("Fundo Eleitoral (80%)"))
    assert.ok(html.includes("Direção partidária"))
    assert.ok(!html.includes('data-pf-financiamento-eleicao="2018"'), "ano publicado não vira linha de lacuna")
  })

  test("DTO composto chega ao DOM distinguindo zero, ausência oficial e erro", () => {
    const html = renderMoneyTab({
      financiamentoEleicoes: [
        { ano: 2008, estado: "zero_declarado", fonte_url: "https://dadosabertos.tse.jus.br/2008", verificado_em: null },
        { ano: 2006, estado: "ausencia_oficial", fonte_url: "https://dadosabertos.tse.jus.br/2006", verificado_em: "2026-08-10" },
        { ano: 2004, estado: "erro", fonte_url: "https://dadosabertos.tse.jus.br/2004", verificado_em: "2026-08-10", detalhe: "Layout sem SQ_CANDIDATO." },
      ],
    })

    for (const estado of ["zero_declarado", "ausencia_oficial", "erro"]) {
      assert.ok(html.includes(`data-pf-financiamento-eleicao-estado="${estado}"`), estado)
    }
    assert.ok(html.includes("Verificado em"))
    assert.ok(html.includes("Fonte oficial"))
    assert.ok(!html.includes(FRASE_PROIBIDA))
  })
})

describe("defeito 2: judicial não pode dizer que a busca não foi feita", () => {
  const EXECUTADO_EM = "2026-08-06T00:47:13.702258+00:00"

  /**
   * As 7 fichas que a curadoria do DJEN de 10/08/2026 fechou como
   * indeterminado: a busca foi feita, exaustiva, e o que falta é segundo
   * identificador no ato judicial.
   */
  const INDETERMINADAS = [
    "cabo-daciolo",
    "edmilson-costa",
    "samara-martins",
    "jayme-campos",
    "joao-campos",
    "marcelo-maranata",
    "raquel-lyra",
  ]

  test("estado vazio diz busca feita, identidade não confirmada, e nunca ficha limpa", () => {
    for (const slug of INDETERMINADAS) {
      const estado = getProcessosEmptyState({ resultado: "indeterminado", executado_em: EXECUTADO_EM })
      assert.equal(estado.title, "Busca feita, identidade não confirmada", slug)
      assert.match(estado.description, /A busca judicial foi executada/, slug)
      assert.match(estado.description, /segundo identificador/, slug)
      assert.match(estado.description, /não significa ficha limpa/, slug)
      assert.doesNotMatch(
        estado.description,
        /ainda não há uma tentativa|ainda não foi feita/i,
        `${slug}: não pode dizer que a busca não aconteceu`,
      )
    }
  })

  test("nenhum estado de processos expõe CPF, nem mascarado", () => {
    const estados = (["indeterminado", "vazio_confirmado", "encontrado", "erro", "sem_achado_no_escopo"] as const).map(
      (resultado) => getProcessosEmptyState({ resultado, executado_em: EXECUTADO_EM }),
    )
    for (const estado of estados) {
      const texto = `${estado.title} ${estado.description}`
      assert.doesNotMatch(texto, /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/, "CPF é prova interna e não vai à superfície")
      assert.doesNotMatch(texto, /\*{3,}/, "nem CPF mascarado")
    }
  })

  test("ficha sem tentativa registrada continua dizendo que não houve tentativa", () => {
    const estado = getProcessosEmptyState(null)
    assert.equal(estado.title, "Processos judiciais ainda não verificados")
    assert.match(estado.description, /não significa ficha limpa/)
  })

  test("curadoria de escopo limitado deixa de ler como busca inexistente", () => {
    const estado = getProcessosEmptyState({ resultado: "sem_achado_no_escopo", executado_em: EXECUTADO_EM })
    assert.equal(estado.title, "Busca feita, escopo limitado")
    assert.match(estado.description, /não é conclusão nem ficha limpa/)
  })

  test("card do overview troca a legenda falsa por identidade não confirmada", () => {
    // O overview só precisa do desfecho: a assinatura é
    // `Pick<ProcessosVerificacao, "resultado">` e a data não entra na legenda.
    // Quem carrega data é o estado vazio, testado acima.
    assert.deepEqual(processosOverviewDisplay(0, 0, { resultado: "indeterminado" }), {
      value: "—",
      sub: "identidade não confirmada",
    })
    assert.deepEqual(processosOverviewDisplay(0, 0, null), { value: "—", sub: "não verificado" })
    assert.deepEqual(processosOverviewDisplay(0, 0, { resultado: "vazio_confirmado" }), {
      value: 0,
      sub: "escopo verificado",
    })
  })

  test("o comparador, que não recebe o desfecho, para de afirmar não verificado", () => {
    assert.equal(processosResumoLabel(0), "sem contagem de processos verificada")
    assert.equal(processosResumoLabel(2), "2 processos")
  })
})

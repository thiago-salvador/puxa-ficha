import assert from "node:assert/strict"
import test from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { MoneyTabSection } from "@/components/CandidatoProfileSections"
import type { Financiamento, Patrimonio, PatrimonioEleicaoPublico } from "@/lib/types"

function patrimonioRow(partial: Partial<Patrimonio> & Pick<Patrimonio, "id">): Patrimonio {
  return {
    candidato_id: "candidato-teste",
    ano_eleicao: 2022,
    valor_total: 150_000,
    bens: [
      {
        tipo: "Imóvel",
        descricao: "Apartamento residencial",
        valor: 150_000,
      },
    ],
    ...partial,
    id: partial.id,
  }
}

function financiamentoRow(
  partial: Partial<Financiamento> & Pick<Financiamento, "id">
): Financiamento {
  return {
    candidato_id: "candidato-teste",
    ano_eleicao: 2022,
    total_arrecadado: 50_000,
    total_fundo_partidario: 10_000,
    total_fundo_eleitoral: 20_000,
    total_pessoa_fisica: 15_000,
    total_recursos_proprios: 5_000,
    maiores_doadores: [],
    ...partial,
    id: partial.id,
  }
}

function renderMoneyTab(args: {
  patrimonio: Patrimonio[]
  financiamento: Financiamento[]
  historicoLength: number
  patrimonioEleicoes?: PatrimonioEleicaoPublico[] | null
}) {
  return renderToStaticMarkup(
    createElement(MoneyTabSection, {
      patrimonio: args.patrimonio,
      financiamento: args.financiamento,
      historico: [],
      gastos: [],
      historicoLength: args.historicoLength,
      suggestion: null,
      patrimonioEleicoes: args.patrimonioEleicoes,
    })
  )
}

function eleicao(
  ano: number,
  estado: PatrimonioEleicaoPublico["estado"]
): PatrimonioEleicaoPublico {
  return {
    ano,
    estado,
    fonte_url: estado === "vazio_confirmado" ? "https://divulgacandcontas.tse.jus.br/x" : null,
    verificado_em: estado === "vazio_confirmado" ? "2026-08-07" : null,
  }
}

/*
  Regressão de 2026-08-12. Estes dois primeiros casos afirmavam a ausência na
  base do TSE a partir de `historicoLength`, sem nenhuma ausência conferida na
  fonte. Em produção isso valia para 30 das 194 fichas públicas, com 23 delas
  ainda carimbadas "Dado relevante". Coleta pendente não é ausência de bens, e o
  contrato de `ui-labels.ts` já dizia isso para `nao_coletado`.
*/
test("MoneyTabSection não afirma ausência no TSE quando a série por eleição é desconhecida", () => {
  const html = renderMoneyTab({
    patrimonio: [],
    financiamento: [],
    historicoLength: 3,
  })

  assert.ok(html.includes("Dinheiro"), "deve exibir o section label Dinheiro")
  assert.ok(html.includes("Dados financeiros"), "deve exibir o section title Dados financeiros")
  assert.ok(
    html.includes("Patrimônio ainda não coletado"),
    "deve exibir o estado honesto de coleta pendente"
  )
  assert.ok(
    html.includes("nenhuma ausência de bens foi verificada na fonte oficial"),
    "deve deixar explícito que a fonte oficial não foi consultada"
  )
  assert.ok(
    !html.includes("Nenhum patrimônio declarado no TSE"),
    "não pode afirmar ausência no TSE sem ausência conferida"
  )
  assert.ok(
    !html.includes("Dado relevante"),
    "não pode dramatizar como notable uma pendência de coleta"
  )
  assert.ok(
    html.includes('data-pf-notice-tone="neutral"'),
    "o NoticePanel interno deve renderizar com tone neutral"
  )
  assert.ok(
    !html.includes("Sem dados de financiamento"),
    "não deve exibir o empty state separado de financiamento quando ambos estão vazios"
  )
})

test("MoneyTabSection não afirma ausência no TSE quando algum pleito segue nao_coletado", () => {
  const html = renderMoneyTab({
    patrimonio: [],
    financiamento: [],
    historicoLength: 3,
    patrimonioEleicoes: [eleicao(2022, "vazio_confirmado"), eleicao(2018, "nao_coletado")],
  })

  assert.ok(
    html.includes("Patrimônio ainda não coletado"),
    "uma ausência conferida não autoriza falar pelos pleitos ainda não coletados"
  )
  assert.ok(
    !html.includes("Nenhum patrimônio declarado no TSE"),
    "não pode generalizar a conferência de um pleito para a ficha inteira"
  )
})

test("MoneyTabSection afirma a ausência no TSE quando todos os pleitos aplicáveis têm ausência conferida", () => {
  const html = renderMoneyTab({
    patrimonio: [],
    financiamento: [],
    historicoLength: 3,
    patrimonioEleicoes: [eleicao(2022, "vazio_confirmado"), eleicao(2018, "vazio_confirmado")],
  })

  assert.ok(
    html.includes("Nenhum patrimônio declarado no TSE"),
    "com a fonte oficial conferida em todos os pleitos, a ausência é afirmável"
  )
  assert.ok(
    html.includes("A fonte oficial foi conferida em todos os pleitos aplicáveis"),
    "a descrição deve dizer o que sustenta a afirmação"
  )
  assert.ok(html.includes("Dado relevante"), "ausência provada em quem tem histórico é notable")
  assert.ok(
    html.includes('data-pf-notice-tone="caution"'),
    "o NoticePanel interno deve renderizar com tone caution quando notable"
  )
})

test("MoneyTabSection separa ausência conferida de histórico político ausente", () => {
  const html = renderMoneyTab({
    patrimonio: [],
    financiamento: [],
    historicoLength: 0,
    patrimonioEleicoes: [eleicao(2022, "vazio_confirmado")],
  })

  assert.ok(
    html.includes("Sem bens declarados ao TSE"),
    "deve exibir o título neutral quando não há histórico"
  )
  assert.ok(
    !html.includes("Dado relevante"),
    "não deve exibir o eyebrow notable quando o empty state é neutral"
  )
  assert.ok(
    html.includes('data-pf-notice-tone="neutral"'),
    "o NoticePanel interno deve renderizar com tone neutral"
  )
  assert.ok(
    !html.includes("Nenhum patrimônio declarado no TSE"),
    "não deve exibir o título notable quando não há histórico"
  )
})

test("MoneyTabSection diz que não há pleito com declaração devida quando a série aplicável é vazia", () => {
  const html = renderMoneyTab({
    patrimonio: [],
    financiamento: [],
    historicoLength: 2,
    patrimonioEleicoes: [],
  })

  assert.ok(
    html.includes("Sem pleito com declaração de bens nesta ficha"),
    "série aplicável vazia é fato sobre a trajetória, não sobre a base do TSE"
  )
  assert.ok(
    !html.includes("Nenhum patrimônio declarado no TSE"),
    "não pode afirmar ausência na base oficial"
  )
  assert.ok(
    !html.includes("Patrimônio ainda não coletado"),
    "não pode sugerir coleta pendente quando não há pleito aplicável"
  )
})

test("MoneyTabSection mostra empty state só de patrimônio quando há financiamento mas não há bens declarados", () => {
  const html = renderMoneyTab({
    patrimonio: [],
    financiamento: [financiamentoRow({ id: "fin-2022" })],
    historicoLength: 0,
  })

  assert.ok(
    html.includes("Patrimônio ainda não coletado"),
    "deve exibir o estado honesto de patrimônio, sem afirmar a base oficial"
  )
  assert.ok(
    !html.includes("Este candidato não possui declarações de bens registradas no TSE."),
    "não pode afirmar ausência no TSE sem ausência conferida"
  )
  assert.ok(
    !html.includes("Sem dados de financiamento"),
    "não deve exibir o empty state de financiamento quando há linha válida"
  )
  assert.ok(
    !html.includes("Dados financeiros"),
    "não deve cair no empty state combinado quando há financiamento"
  )
  assert.ok(
    html.includes("De onde vem o dinheiro"),
    "deve renderizar a seção real de financiamento"
  )
})

test("Leonardo 2018: zero arrecadado e zero doadores exibe ausência declarada, não R$ 0", () => {
  const html = renderMoneyTab({
    patrimonio: [],
    financiamento: [
      financiamentoRow({
        id: "leonardo-2018",
        ano_eleicao: 2018,
        total_arrecadado: 0,
        total_fundo_partidario: 0,
        total_fundo_eleitoral: 0,
        total_pessoa_fisica: 0,
        total_recursos_proprios: 0,
        maiores_doadores: [],
      }),
    ],
    historicoLength: 1,
  })

  assert.match(html, /Sem receitas declaradas na prestação de contas \(TSE 2018\)/)
  assert.doesNotMatch(html, />R\$\s*0(?:,00)?</)
  assert.doesNotMatch(html, /Maiores doadores/)
  assert.match(html, /data-pf-money-card-state="sem_receitas_declaradas"/)
})

test("MoneyTabSection mostra empty state só de financiamento quando há patrimônio mas não há receitas", () => {
  const html = renderMoneyTab({
    patrimonio: [patrimonioRow({ id: "patr-2022" })],
    financiamento: [],
    historicoLength: 0,
  })

  assert.ok(
    html.includes("Sem financiamento de campanha nesta ficha"),
    "deve exibir o empty state de financiamento"
  )
  /*
    Correção de 2026-08-10: a copy anterior ("Não há registros de financiamento
    de campanha para este candidato no TSE") afirmava o acervo da fonte oficial
    sem nunca tê-la consultado, e era falsa em casos provados. O estado vazio
    agora fala só do que esta ficha tem.
  */
  assert.ok(
    !html.includes("Não há registros de financiamento de campanha para este candidato no TSE"),
    "não pode afirmar ausência no TSE sem ter verificado o TSE"
  )
  assert.ok(
    html.includes("nenhuma ausência foi verificada na fonte oficial"),
    "deve deixar explícito que nenhuma fonte oficial foi consultada"
  )
  assert.ok(
    !html.includes("Patrimônio ainda não coletado"),
    "não deve exibir o empty state de patrimônio neutral quando há linha de patrimônio"
  )
  assert.ok(
    !html.includes("Nenhum patrimônio declarado no TSE"),
    "não deve exibir o empty state de patrimônio notable quando há linha de patrimônio"
  )
  assert.ok(
    !html.includes("Dados financeiros"),
    "não deve cair no empty state combinado quando há patrimônio"
  )
  assert.ok(
    html.includes("Patrimônio declarado"),
    "deve renderizar a seção real de patrimônio"
  )
})

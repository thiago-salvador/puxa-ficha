import assert from "node:assert/strict"
import test from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { DespesasCampanhaSection } from "@/components/DespesasCampanhaSection"
import { MoneyTabSection } from "@/components/CandidatoProfileSections"
import type { FinanciamentoDespesasPublico } from "@/lib/public-profile-dto"

function linha(partial: Partial<FinanciamentoDespesasPublico> = {}): FinanciamentoDespesasPublico {
  return {
    id: "desp-1-abc",
    ano_eleicao: 2026,
    uf: "SP",
    cargo_candidatura: "Governador",
    estado_coleta: "declarado",
    total_despesas_contratadas: 150_000,
    total_despesas_pagas: 90_000,
    total_doacoes_a_terceiros: 5_000,
    recursos_financeiros: 100_000,
    recursos_estimaveis: 20_000,
    divida_campanha: null,
    sobra_financeira: null,
    concentracao_despesas: [
      { tipo: "Publicidade", quantidade: 10, valor: 80_000 },
      { tipo: "Serviços prestados por terceiros", quantidade: 4, valor: 45_000 },
    ],
    maiores_fornecedores: [
      { tipo: "PJ", nome: "Gráfica Exemplo Ltda", quantidade: 3, valor: 30_000 },
      { tipo: "PF_agregado", quantidade_prestadores: 12, quantidade: 20, valor: 25_000 },
    ],
    doacoes_a_terceiros: [
      {
        destinatario_tipo: "partido",
        destinatario_nome: "Partido Exemplo",
        uf: "SP",
        cargo: null,
        partido: "PEX",
        valor: 5_000,
        candidato_slug: null,
      },
    ],
    prestacao_parcial: false,
    data_entrega: "2026-09-20",
    fonte: "TSE",
    fonte_url: "https://divulgacandcontas.tse.jus.br/",
    coletado_em: "2026-09-28T12:00:00.000Z",
    ...partial,
  }
}

function secao(props: {
  despesas?: FinanciamentoDespesasPublico[] | null
  status?: "ok" | "indisponivel"
  anosComReceitas?: number[]
}) {
  return renderToStaticMarkup(
    createElement(DespesasCampanhaSection, {
      despesas: props.despesas,
      status: props.status,
      anosComReceitas: props.anosComReceitas,
    }),
  )
}

test("status indisponivel não renderiza nada, nem afirmação de ausência", () => {
  assert.equal(secao({ despesas: null, status: "indisponivel", anosComReceitas: [2014, 2022] }), "")
  assert.equal(secao({ despesas: [linha()], status: "indisponivel" }), "")
  assert.equal(secao({ despesas: [linha()] }), "", "sem status a seção também fica omitida")
})

test("status ok sem linhas e sem ano anterior a 2018 não renderiza nada", () => {
  assert.equal(secao({ despesas: [], status: "ok", anosComReceitas: [2022] }), "")
})

test("mostra contratado e pago com data e a nota de que o TSE informa o pago separadamente", () => {
  const html = secao({ despesas: [linha()], status: "ok" })
  assert.match(html, /Despesas de campanha em 2026 \(Governador, SP\)/)
  assert.match(html, /Contratado/)
  assert.match(html, /até 20\/09\/2026/)
  assert.match(html, /R\$\s*150\.000/)
  assert.match(html, /R\$\s*90\.000/)
  assert.match(html, /O TSE informa o valor pago separadamente do valor contratado\./)
  assert.match(html, /Por tipo de despesa, sobre o total contratado/)
  assert.match(html, /Publicidade/)
  assert.match(html, /Gráfica Exemplo Ltda/)
})

test("pago nulo não vira zero", () => {
  const html = secao({ despesas: [linha({ total_despesas_pagas: null })], status: "ok" })
  assert.match(html, /data-pf-despesas-pago/)
  assert.match(html, /Não informado pela fonte/)
  assert.doesNotMatch(html, /R\$\s*0(?![\d.,])/)
})

test("sem prestação diz 'Nenhuma despesa declarada até <data>' e não mostra totais", () => {
  const html = secao({
    despesas: [linha({ estado_coleta: "sem_prestacao", total_despesas_contratadas: null, total_despesas_pagas: null, concentracao_despesas: [], maiores_fornecedores: [], doacoes_a_terceiros: [] })],
    status: "ok",
  })
  assert.match(html, /Nenhuma despesa declarada até 20\/09\/2026\./)
  assert.doesNotMatch(html, /data-pf-despesas-contratado/)
})

test("prestação declarada com zero e lista vazia usa o mesmo texto de zero declarado", () => {
  const html = secao({
    despesas: [linha({ total_despesas_contratadas: 0, total_despesas_pagas: 0, concentracao_despesas: [], maiores_fornecedores: [], doacoes_a_terceiros: [] })],
    status: "ok",
  })
  assert.match(html, /Nenhuma despesa declarada até/)
})

test("falha de coleta da candidatura não gera afirmação nenhuma", () => {
  assert.equal(secao({ despesas: [linha({ estado_coleta: "falha_coleta" })], status: "ok" }), "")
})

test("prestação parcial mostra o aviso com a data", () => {
  const html = secao({ despesas: [linha({ prestacao_parcial: true })], status: "ok" })
  assert.match(html, /data-pf-despesas-parcial/)
  assert.match(html, /Prestação parcial/)
  assert.match(html, /entregue até 20\/09\/2026 e podem mudar nas próximas entregas/)
  assert.doesNotMatch(secao({ despesas: [linha()], status: "ok" }), /data-pf-despesas-parcial/)
})

test("pessoas físicas aparecem numa linha agregada, sem nome nem documento", () => {
  const html = secao({ despesas: [linha()], status: "ok" })
  assert.match(html, /Pessoas físicas \(12 prestadores\)/)
  const singular = secao({
    despesas: [linha({ maiores_fornecedores: [{ tipo: "PF_agregado", quantidade_prestadores: 1, quantidade: 1, valor: 10 }] })],
    status: "ok",
  })
  assert.match(singular, /Pessoas físicas \(1 prestador\)/)
})

test("doações a outros candidatos e partidos trazem a nota de que já estão no contratado", () => {
  const html = secao({ despesas: [linha()], status: "ok" })
  assert.match(html, /Doações a outros candidatos e partidos/)
  assert.match(html, /Essas doações já fazem parte do total contratado\./)
  assert.match(html, /Partido Exemplo/)
  assert.doesNotMatch(html, /href="\/candidato\//, "slug null não vira link")
  assert.doesNotMatch(
    secao({ despesas: [linha({ doacoes_a_terceiros: [] })], status: "ok" }),
    /Essas doações já fazem parte/,
  )
})

test("link para a ficha só quando há slug", () => {
  const html = secao({
    despesas: [linha({ doacoes_a_terceiros: [{ destinatario_tipo: "candidato", destinatario_nome: "Candidata Exemplo", uf: "RJ", cargo: "Deputado Federal", partido: "PEX", valor: 100, candidato_slug: "candidata-exemplo" }] })],
    status: "ok",
  })
  assert.match(html, /href="\/candidato\/candidata-exemplo"/)
})

test("destinatário sem nome aparece como não identificado", () => {
  const html = secao({
    despesas: [linha({ doacoes_a_terceiros: [{ destinatario_tipo: "outro", destinatario_nome: null, uf: null, cargo: null, partido: null, valor: 100, candidato_slug: null }] })],
    status: "ok",
  })
  assert.match(html, /Destinatário não identificado/)
})

test("recursos financeiros e estimáveis aparecem juntos; dívida e sobra só quando não nulas", () => {
  const html = secao({ despesas: [linha()], status: "ok" })
  assert.match(html, /Recursos da campanha:/)
  assert.match(html, /R\$\s*100\.000 financeiros e R\$\s*20\.000/)
  assert.match(html, /estimáveis/)
  assert.doesNotMatch(html, /Dívida de campanha|Sobra financeira/)

  const comSaldo = secao({ despesas: [linha({ divida_campanha: 1_234, sobra_financeira: 0 })], status: "ok" })
  assert.match(comSaldo, /Dívida de campanha declarada: R\$\s*1\.234\./)
  assert.match(comSaldo, /Sobra financeira declarada: R\$\s*0\./, "zero declarado aparece; null não")

  const semRecursos = secao({ despesas: [linha({ recursos_financeiros: null, recursos_estimaveis: null })], status: "ok" })
  assert.doesNotMatch(semRecursos, /Recursos da campanha/)
})

test("anos anteriores a 2018 ganham uma linha só; linhas de despesas dessa época não aparecem", () => {
  const html = secao({ despesas: [linha({ ano_eleicao: 2014 })], status: "ok", anosComReceitas: [2010, 2014, 2022] })
  assert.equal((html.match(/Despesas disponíveis a partir de 2018\./g) ?? []).length, 1)
  assert.doesNotMatch(html, /Despesas de campanha em 2014/)
  const soAntigo = secao({ despesas: [], status: "ok", anosComReceitas: [2006] })
  assert.match(soAntigo, /Despesas disponíveis a partir de 2018\./)
})

test("linhas saem da mais recente para a mais antiga", () => {
  const html = secao({
    despesas: [linha({ id: "a", ano_eleicao: 2018 }), linha({ id: "b", ano_eleicao: 2026 }), linha({ id: "c", ano_eleicao: 2022 })],
    status: "ok",
  })
  const posicoes = [2026, 2022, 2018].map((ano) => html.indexOf(`Despesas de campanha em ${ano}`))
  assert.ok(posicoes.every((pos) => pos >= 0))
  assert.deepEqual([...posicoes].sort((a, b) => a - b), posicoes)
})

test("o HTML renderizado não tem sequência de 11 a 14 dígitos", () => {
  const html = secao({
    despesas: [linha({ total_despesas_contratadas: 123_456_789.12 }), linha({ id: "x", ano_eleicao: 2022, estado_coleta: "sem_prestacao" })],
    status: "ok",
    anosComReceitas: [2010],
  })
  assert.doesNotMatch(html, /\d{11,14}/)
})

test("texto sem insinuação: nada de termos de irregularidade", () => {
  const html = secao({ despesas: [linha({ divida_campanha: 10 })], status: "ok" })
  assert.doesNotMatch(html, /irregular|suspeit|fraude|ilegal|indício|desvio/i)
})

/* ─── Integração na aba Dinheiro ─────────────────── */

function abaDinheiro(props: {
  despesas?: FinanciamentoDespesasPublico[] | null
  despesasStatus?: "ok" | "indisponivel"
  patrimonio?: never[]
  financiamento?: never[]
  historicoLength?: number
}) {
  return renderToStaticMarkup(
    createElement(MoneyTabSection, {
      patrimonio: props.patrimonio ?? [],
      financiamento: props.financiamento ?? [],
      historico: [],
      gastos: [],
      historicoLength: props.historicoLength ?? 0,
      suggestion: null,
      despesas: props.despesas,
      despesasStatus: props.despesasStatus,
    }),
  )
}

test("aba Dinheiro mostra as despesas quando o status é ok", () => {
  const html = abaDinheiro({ despesas: [linha()], despesasStatus: "ok" })
  assert.match(html, /Despesas de campanha/)
  assert.match(html, /Contratado/)
})

test("aba Dinheiro omite a seção de despesas com status indisponivel", () => {
  const html = abaDinheiro({ despesas: null, despesasStatus: "indisponivel" })
  assert.doesNotMatch(html, /data-pf-despesas-secao|Despesas de campanha|Nenhuma despesa declarada/)
})

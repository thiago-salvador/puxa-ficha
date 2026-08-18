import assert from "node:assert/strict"
import test from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { ProfileOverview } from "@/components/ProfileOverview"
import { normalizeHistoricoPoliticoForDisplay } from "@/lib/historico-dedupe"
import type { FichaCandidato, HistoricoPolitico } from "@/lib/types"

function historicoRow(
  partial: Partial<HistoricoPolitico> & Pick<HistoricoPolitico, "id">
): HistoricoPolitico {
  return {
    candidato_id: "14",
    cargo: "Governador de São Paulo",
    cargo_canonico: "Governador",
    tipo_evento: "mandato",
    periodo_inicio: 2023,
    periodo_fim: null,
    partido: "REPUBLICANOS",
    estado: "SP",
    eleito_por: "voto direto",
    observacoes: null,
    ...partial,
    id: partial.id,
  }
}

function buildFicha(historico: HistoricoPolitico[]): FichaCandidato {
  return {
    id: "14",
    nome_completo: "Tarcísio Gomes de Freitas",
    nome_urna: "Tarcísio de Freitas",
    slug: "tarcisio-gov-sp",
    data_nascimento: "1975-01-07",
    idade: 51,
    naturalidade: "Rio de Janeiro/RJ",
    formacao: "Engenharia",
    profissao_declarada: "Engenheiro",
    partido_atual: "Republicanos",
    partido_sigla: "REPUBLICANOS",
    cargo_atual: "Governador de São Paulo",
    cargo_disputado: "Governador",
    estado: "SP",
    status: "pre-candidato",
    situacao_candidatura: "incerto",
    biografia:
      "Tarcísio de Freitas é governador de São Paulo desde 1º de janeiro de 2023.",
    foto_url: null,
    site_campanha: null,
    redes_sociais: {},
    fonte_dados: ["curadoria"],
    ultima_atualizacao: "2026-04-12",
    historico,
    mudancas_partido: [],
    patrimonio: [],
    financiamento: [],
    votos: [],
    processos: [],
    pontos_atencao: [],
    projetos_lei: [],
    legislacao_mandato_executivo: [],
    gastos_parlamentares: [],
    sancoes_administrativas: [],
    noticias: [],
    indicadores_estaduais: [],
    total_processos: 0,
    processos_criminais: 0,
    total_mudancas_partido: 0,
    total_pontos_atencao: 0,
    pontos_criticos: 0,
    total_sancoes: 0,
  }
}

test("ProfileOverview teaser de carreira não repete governador com período indeterminado para tarcisio-gov-sp", () => {
  const historico = normalizeHistoricoPoliticoForDisplay([
    historicoRow({
      id: "gov-2022",
      cargo: "Governador de Sao Paulo",
      periodo_inicio: 2022,
      observacoes: "ELEITO (TSE 2022)",
    }),
    historicoRow({
      id: "gov-2023",
      cargo: "Governador de São Paulo",
      periodo_inicio: 2023,
      observacoes: "Mandato desde 1º de janeiro de 2023 (TSE + curadoria 17.csv)",
    }),
    historicoRow({
      id: "min-2019",
      cargo: "Ministro da Infraestrutura",
      cargo_canonico: "Ministro da Infraestrutura",
      periodo_inicio: 2019,
      periodo_fim: 2022,
      estado: "",
      eleito_por: "nomeacao",
      observacoes: "Governo Bolsonaro",
    }),
  ])

  const html = renderToStaticMarkup(
    createElement(ProfileOverview, {
      ficha: buildFicha(historico),
      onNavigateTab: () => {},
    })
  )

  assert.equal((html.match(/Governador de São Paulo/g) ?? []).length, 1)
  assert.ok(html.includes("2023 - atual"))
  assert.ok(html.includes("Ministro da Infraestrutura"))
  assert.ok(html.includes("2019 - 2022"))
  assert.ok(!html.includes("Período não determinado"))
})

test("ProfileOverview teaser de carreira mostra observação útil e esconde boilerplate puro do TSE", () => {
  const historico = normalizeHistoricoPoliticoForDisplay([
    historicoRow({
      id: "dep-2010",
      cargo: "Deputado Federal",
      cargo_canonico: "Deputado Federal",
      periodo_inicio: 2010,
      periodo_fim: 2014,
      partido: "PCdoB",
      estado: "SP",
      observacoes: "Mandato parlamentar; licenciou-se da Câmara para assumir o Ministério do Esporte entre 2011 e 2014.",
      tipo_evento: "mandato",
    }),
    historicoRow({
      id: "min-2011",
      cargo: "Ministro do Esporte",
      cargo_canonico: "Ministro do Esporte",
      periodo_inicio: 2011,
      periodo_fim: 2014,
      partido: "PCdoB",
      estado: "",
      eleito_por: "nomeação",
      observacoes: "Governo Dilma Rousseff",
      tipo_evento: "mandato",
    }),
    historicoRow({
      id: "gov-2022",
      cargo: "Governador de São Paulo",
      cargo_canonico: "Governador",
      periodo_inicio: 2022,
      periodo_fim: null,
      partido: "REPUBLICANOS",
      estado: "SP",
      observacoes: "ELEITO (TSE 2022)",
      tipo_evento: "mandato",
    }),
  ])

  const html = renderToStaticMarkup(
    createElement(ProfileOverview, {
      ficha: buildFicha(historico),
      onNavigateTab: () => {},
    })
  )

  assert.ok(html.includes("licenciou-se da Câmara"))
  assert.ok(!html.includes("ELEITO (TSE 2022)"))
})

test("ProfileOverview teaser de carreira exibe a eleição TSE como candidatura e o mandato uma única vez (Eduardo Leite)", () => {
  const historico = normalizeHistoricoPoliticoForDisplay([
    historicoRow({
      id: "gov-2018-eleito",
      cargo: "Governador do Rio Grande do Sul",
      cargo_canonico: "Governador",
      periodo_inicio: 2018,
      periodo_fim: 2022,
      partido: "PSDB",
      estado: "RS",
      observacoes: "ELEITO (TSE 2018)",
      tipo_evento: "mandato",
    }),
    historicoRow({
      id: "gov-2019-mandato",
      cargo: "Governador do Rio Grande do Sul",
      cargo_canonico: "Governador",
      periodo_inicio: 2019,
      periodo_fim: 2022,
      partido: "PSDB",
      estado: "RS",
      observacoes: null,
      tipo_evento: "mandato",
    }),
    historicoRow({
      id: "pref-2012-eleito",
      cargo: "Prefeito de Pelotas",
      cargo_canonico: "Prefeito",
      periodo_inicio: 2012,
      periodo_fim: 2018,
      partido: "PSDB",
      estado: "RS",
      observacoes: "ELEITO (TSE 2012)",
      tipo_evento: "mandato",
    }),
    historicoRow({
      id: "pref-2013-mandato",
      cargo: "Prefeito de Pelotas",
      cargo_canonico: "Prefeito",
      periodo_inicio: 2013,
      periodo_fim: 2016,
      partido: "PSDB",
      estado: "RS",
      observacoes: null,
      tipo_evento: "mandato",
    }),
  ])

  const html = renderToStaticMarkup(
    createElement(ProfileOverview, {
      ficha: buildFicha(historico),
      onNavigateTab: () => {},
    })
  )

  // Eleição (candidatura) + mandato: dois eventos distintos para o governo.
  assert.equal((html.match(/Governador do Rio Grande do Sul/g) ?? []).length, 2)
  assert.ok(html.includes("2019 - 2022"))
  assert.ok(html.includes("2013 - 2016"))
  // O mandato não herda o período da eleição colapsada.
  assert.ok(!html.includes("2018 - 2022"))
  assert.ok(!html.includes("2012 - 2018"))
})

test("ProfileOverview shows 'Perfil em construção' when ficha has no data at all", () => {
  const html = renderToStaticMarkup(
    createElement(ProfileOverview, {
      ficha: buildFicha([]),
      onNavigateTab: () => {},
    })
  )

  assert.match(html, /Perfil em construção/)
  assert.match(html, /Estamos coletando dados públicos/)
})

test("ProfileOverview does NOT fall to 'Perfil em construção' when ficha has only financiamento", () => {
  const ficha: FichaCandidato = {
    ...buildFicha([]),
    financiamento: [
      {
        id: "fin-2022",
        candidato_id: "14",
        ano_eleicao: 2022,
        total_arrecadado: 9_900_000,
        total_fundo_partidario: 0,
        total_fundo_eleitoral: 0,
        total_pessoa_fisica: 9_900_000,
        total_recursos_proprios: 0,
        maiores_doadores: [],
      },
    ],
  }

  const html = renderToStaticMarkup(
    createElement(ProfileOverview, {
      ficha,
      onNavigateTab: () => {},
    })
  )

  assert.doesNotMatch(html, /Perfil em construção/)
  assert.match(html, /R\$[\s ]9,9[\s ]mi/)
})

test("ProfileOverview financiamento teaser picks the most recent ano_eleicao", () => {
  const ficha: FichaCandidato = {
    ...buildFicha([]),
    financiamento: [
      {
        id: "fin-2018",
        candidato_id: "14",
        ano_eleicao: 2018,
        total_arrecadado: 1_100_000,
        total_fundo_partidario: 0,
        total_fundo_eleitoral: 0,
        total_pessoa_fisica: 1_100_000,
        total_recursos_proprios: 0,
        maiores_doadores: [],
      },
      {
        id: "fin-2022",
        candidato_id: "14",
        ano_eleicao: 2022,
        total_arrecadado: 9_900_000,
        total_fundo_partidario: 0,
        total_fundo_eleitoral: 0,
        total_pessoa_fisica: 9_900_000,
        total_recursos_proprios: 0,
        maiores_doadores: [],
      },
    ],
  }

  const html = renderToStaticMarkup(
    createElement(ProfileOverview, {
      ficha,
      onNavigateTab: () => {},
    })
  )

  assert.match(html, /R\$[\s ]9,9[\s ]mi/)
  assert.doesNotMatch(html, /R\$ 1\.1M/)
})

test("ProfileOverview cota parlamentar teaser picks the most recent ano", () => {
  const ficha: FichaCandidato = {
    ...buildFicha([]),
    gastos_parlamentares: [
      {
        id: "gp-2019",
        candidato_id: "14",
        ano: 2019,
        total_gasto: 1_200_000,
        detalhamento: [],
        gastos_destaque: [],
      },
      {
        id: "gp-2023",
        candidato_id: "14",
        ano: 2023,
        total_gasto: 5_500_000,
        detalhamento: [],
        gastos_destaque: [],
      },
    ],
  }

  const html = renderToStaticMarkup(
    createElement(ProfileOverview, {
      ficha,
      onNavigateTab: () => {},
    })
  )

  assert.match(html, /Ano do registro: 2023/)
  assert.doesNotMatch(html, /Ano do registo: 2019/)
  assert.match(html, /R\$[\s ]5,5[\s ]mi/)
  assert.doesNotMatch(html, /R\$ 1\.2M/)
})

test("ProfileOverview recognizes legislacao_mandato_executivo as existing data", () => {
  const fichaComLegislacao: FichaCandidato = {
    ...buildFicha([]),
    patrimonio: [],
    financiamento: [],
    processos: [],
    votos: [],
    pontos_atencao: [],
    projetos_lei: [],
    legislacao_mandato_executivo: [
      {
        id: "lme-1",
        candidato_id: "14",
        historico_politico_id: null,
        tipo_relacao: "lei_sancionada",
        esfera: "federal",
        uf_norma: null,
        municipio_norma: null,
        tipo_norma: "lei",
        numero: "14.611",
        ano: 2023,
        data_norma: "2023-07-03",
        ementa: "Teste",
        signatario: "Test",
        autoridade_papel: "titular",
        fonte_primaria_url: "https://www.planalto.gov.br/test",
        fonte_primaria_titulo: null,
        fonte_tramitacao_url: null,
        identificador_fonte: null,
        metadata: {},
        created_at: "2023-07-03",
      },
    ],
    gastos_parlamentares: [],
  }

  const html = renderToStaticMarkup(
    createElement(ProfileOverview, {
      ficha: fichaComLegislacao,
      onNavigateTab: () => {},
    })
  )

  assert.doesNotMatch(html, /Perfil em construção/, "must not show 'Perfil em construção' when legislacao_mandato_executivo exists")
})

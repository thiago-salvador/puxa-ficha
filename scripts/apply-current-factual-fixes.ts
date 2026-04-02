import { ASSERTIONS_MAP } from "./lib/factual-assertions"
import { log, warn } from "./lib/logger"
import { partiesEquivalent, resolveCanonicalParty } from "./lib/party-canonical"
import { supabase } from "./lib/supabase"

interface PartyTimelineDeleteRule {
  partido_novo: string
  ano?: number
  contexto_includes?: string
}

interface HistoricoFix {
  cargo: string
  periodo_inicio: number
  periodo_fim: number | null
  partido?: string | null
  estado?: string | null
  eleito_por?: string | null
  observacoes?: string | null
}

interface CandidateFix {
  slug: string
  source: string
  candidateUpdate: {
    nome_completo?: string
    partido_sigla?: string
    partido_atual?: string
    cargo_atual?: string | null
    situacao_candidatura?: string | null
    data_nascimento?: string | null
    formacao?: string | null
    foto_url?: string | null
    biografia?: string
  }
  historicoFix?: HistoricoFix
  deleteTimelineRows?: PartyTimelineDeleteRule[]
  deletePatrimonioYears?: number[]
  deleteFinanciamentoYears?: number[]
  ensureCurrentPartyTimeline?: boolean
}

const TODAY = "2026-04-02"
const THIS_YEAR = 2026

const FIXES: CandidateFix[] = [
  {
    slug: "eduardo-braide",
    source: "PSD MA 2026-01-19",
    candidateUpdate: {
      partido_sigla: "PSD",
      partido_atual: "Partido Social Democratico",
      cargo_atual: "Prefeito",
      biografia:
        "Eduardo Costa Braide e advogado e politico brasileiro, filiado ao Partido Social Democratico (PSD). E prefeito de Sao Luis desde 2021, reeleito em 2024.",
    },
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 2021,
      periodo_fim: null,
      partido: "PSD",
      estado: "MA",
      eleito_por: "voto direto",
      observacoes: "cargo atual verificado manualmente (PSD MA 2026-01-19)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "pedro-cunha-lima",
    source: "MaisPB 2025-11-01",
    candidateUpdate: {
      partido_sigla: "PSD",
      partido_atual: "Partido Social Democratico",
      cargo_atual: null,
      biografia:
        "Pedro Oliveira Cunha Lima e advogado e politico brasileiro, filiado ao Partido Social Democratico (PSD). Foi deputado federal pela Paraiba de 2015 a 2023 e candidato ao governo do estado em 2022.",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "paula-belmonte",
    source: "CLDF 2025-12-23",
    candidateUpdate: {
      partido_sigla: "PSDB",
      partido_atual: "Partido da Social Democracia Brasileira",
      cargo_atual: "Deputada Distrital",
      biografia:
        "Paula Francinete Belmonte da Silva e empresaria e politica brasileira, filiada ao Partido da Social Democracia Brasileira (PSDB). Atualmente exerce mandato de deputada distrital pelo Distrito Federal, eleita em 2022.",
    },
    historicoFix: {
      cargo: "Deputada Distrital",
      periodo_inicio: 2023,
      periodo_fim: null,
      partido: "PSDB",
      estado: "DF",
      eleito_por: "voto direto",
      observacoes: "cargo atual verificado manualmente (CLDF 2025-12-23)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "lucas-ribeiro",
    source: "Governo da Paraiba oficial + Paraiba Online 2026-04-02",
    candidateUpdate: {
      cargo_atual: "Vice-Governador da Paraiba",
      biografia:
        "Lucas Ribeiro e advogado e politico brasileiro, filiado ao Progressistas (PP). E o atual vice-governador da Paraiba, eleito na chapa de Joao Azevedo em 2022.",
    },
    historicoFix: {
      cargo: "Vice-Governador",
      periodo_inicio: 2023,
      periodo_fim: null,
      partido: "PP",
      estado: "PB",
      eleito_por: "voto direto",
      observacoes: "cargo atual verificado manualmente (Governo da Paraiba oficial + Paraiba Online 2026-04-02)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "mateus-simoes",
    source: "MG.GOV oficial + Prefeitura de Claraval 2026-03-23",
    candidateUpdate: {
      cargo_atual: "Governador de Minas Gerais",
      biografia:
        "Mateus Simoes de Almeida e advogado, professor e politico brasileiro, filiado ao Partido Social Democratico (PSD). E o atual governador de Minas Gerais. Eleito vice-governador em 2022, assumiu a titularidade do mandato em 2026 apos a renuncia de Romeu Zema.",
    },
    historicoFix: {
      cargo: "Governador",
      periodo_inicio: 2026,
      periodo_fim: null,
      partido: "PSD",
      estado: "MG",
      eleito_por: "sucessao constitucional",
      observacoes: "Cargo atual verificado manualmente (MG.GOV oficial + Prefeitura de Claraval 2026-03-23)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "laurez-moreira",
    source: "Voz do Bico 2025-12-11",
    candidateUpdate: {
      partido_sigla: "PSD",
      partido_atual: "Partido Social Democratico",
      cargo_atual: "Vice-Governador",
      biografia:
        "Laurez da Rocha Moreira e advogado e politico brasileiro, filiado ao Partido Social Democratico (PSD). Atualmente e vice-governador do Tocantins.",
    },
    historicoFix: {
      cargo: "Vice-Governador",
      periodo_inicio: 2023,
      periodo_fim: null,
      partido: "PSD",
      estado: "TO",
      eleito_por: "voto direto",
      observacoes: "cargo atual verificado manualmente (Voz do Bico 2025-12-11)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "pazolini",
    source: "DOM ES 2026-03-27 + A Gazeta 2025-04-16",
    candidateUpdate: {
      cargo_atual: "Prefeito de Vitoria",
      biografia:
        "Lorenzo Silva de Pazolini e delegado de policia, advogado e politico brasileiro, filiado ao Republicanos. E o atual prefeito de Vitoria, reeleito em 2024 para um segundo mandato na capital capixaba.",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "cadu-xavier",
    source: "Diario Oficial RN 2025-09-19 + Agora RN 2025-07-09",
    candidateUpdate: {
      cargo_atual: "Secretario de Estado da Fazenda do Rio Grande do Norte",
      biografia:
        "Carlos Eduardo Xavier e auditor fiscal e gestor publico brasileiro, filiado ao Partido dos Trabalhadores (PT). E secretario de Estado da Fazenda do Rio Grande do Norte e foi lancado como pre-candidato ao governo potiguar para 2026.",
    },
    historicoFix: {
      cargo: "Secretario de Estado da Fazenda do Rio Grande do Norte",
      periodo_inicio: 2019,
      periodo_fim: null,
      partido: "PT",
      estado: "RN",
      eleito_por: "nomeacao",
      observacoes: "cargo atual verificado manualmente (Diario Oficial RN 2025-09-19 + Agora RN 2025-07-09)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "ataides-oliveira",
    source: "Senado Federal perfil 5164",
    candidateUpdate: {
      formacao: "Direito (Superior, Faculdade de Direito de Anapolis)",
    },
  },
  {
    slug: "renan-santos",
    source: "TSE consulta_cand 2020/2022/2024 revisado em 2026-04-02",
    candidateUpdate: {
      situacao_candidatura: null,
    },
    deleteFinanciamentoYears: [2020, 2022],
  },
  {
    slug: "dr-daniel",
    source: "O Liberal 2026-03-28",
    candidateUpdate: {
      partido_sigla: "PSB",
      partido_atual: "Partido Socialista Brasileiro",
      cargo_atual: "Prefeito",
      biografia:
        "Daniel Barbosa Santos, conhecido como Dr. Daniel, e medico e politico brasileiro, filiado ao Partido Socialista Brasileiro (PSB). E prefeito de Ananindeua desde 2021.",
    },
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 2021,
      periodo_fim: null,
      partido: "PSB",
      estado: "PA",
      eleito_por: "voto direto",
      observacoes: "cargo atual verificado manualmente (O Liberal 2026-03-28)",
    },
  },
  {
    slug: "efraim-filho",
    source: "Senado Federal 2026-04-01",
    candidateUpdate: {
      partido_sigla: "UNIAO",
      partido_atual: "Uniao Brasil",
      cargo_atual: "Senador(a)",
      biografia:
        "Efraim de Araujo Morais Filho e advogado e politico brasileiro, filiado ao Uniao Brasil. E senador pela Paraiba desde 2023 e foi deputado federal entre 2007 e 2023.",
    },
    deleteTimelineRows: [
      {
        partido_novo: "PL",
        ano: 2026,
        contexto_includes: "filiacao atual curada",
      },
    ],
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "luciano-zucco",
    source: "Camara dos Deputados 2026-04-01",
    candidateUpdate: {
      partido_sigla: "PL",
      partido_atual: "Partido Liberal",
      cargo_atual: "Deputado(a) Federal",
      biografia:
        "Luciano Lorenzini Zucco, conhecido como Luciano Zucco, e militar e politico brasileiro, filiado ao Partido Liberal (PL). E deputado federal pelo Rio Grande do Sul e foi deputado estadual no mesmo estado.",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "alvaro-dias-rn",
    source: "Agora RN 2026-03-23",
    candidateUpdate: {
      nome_completo: "Alvaro Costa Dias",
      partido_sigla: "REPUBLICANOS",
      partido_atual: "Republicanos",
      cargo_atual: null,
      biografia:
        "Alvaro Costa Dias e medico e politico brasileiro, filiado ao Republicanos. Foi vice-prefeito de Natal entre 2017 e 2018 e prefeito da capital potiguar de 2018 a 2024.",
    },
    deleteTimelineRows: [
      {
        partido_novo: "PL",
        ano: 2026,
        contexto_includes: "partido atual curado",
      },
    ],
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "renan-filho",
    source: "DETRAN PB 2025-12-16 + Wikipedia Renan Filho 2026-04-02",
    candidateUpdate: {
      cargo_atual: "Ministro dos Transportes",
      biografia:
        "Jose Renan Vasconcelos Calheiros Filho e economista e politico brasileiro, filiado ao Movimento Democratico Brasileiro (MDB). E o atual ministro dos Transportes do Brasil e senador licenciado por Alagoas, eleito em 2022. Foi governador do Estado de Alagoas de 2015 a 2022.",
    },
  },
  {
    slug: "teresa-surita",
    source: "Wikipedia Teresa Surita 2026-04-02",
    candidateUpdate: {
      biografia:
        "Maria Teresa Saenz Surita Guimaraes e turismologa e politica brasileira, filiada ao Movimento Democratico Brasileiro (MDB). Foi prefeita de Boa Vista por cinco mandatos e deputada federal por Roraima em duas legislaturas.",
    },
    historicoFix: {
      cargo: "Prefeita",
      periodo_inicio: 2013,
      periodo_fim: 2021,
      partido: "MDB",
      estado: "RR",
      eleito_por: "voto direto",
      observacoes: "Prefeita de Boa Vista (Wikipedia Teresa Surita, revisado em 2026-04-02)",
    },
  },
  {
    slug: "juliana-brizola",
    source: "Wikipedia Juliana Brizola 2026-04-02",
    candidateUpdate: {
      biografia:
        "Juliana Daudt Brizola e advogada e politica brasileira, filiada ao Partido Democratico Trabalhista (PDT). Foi vereadora de Porto Alegre e deputada estadual do Rio Grande do Sul por tres legislaturas.",
    },
    historicoFix: {
      cargo: "Deputada Estadual",
      periodo_inicio: 2011,
      periodo_fim: 2023,
      partido: "PDT",
      estado: "RS",
      eleito_por: "voto direto",
      observacoes: "Deputada estadual do RS por tres legislaturas (Wikipedia Juliana Brizola, revisado em 2026-04-02)",
    },
  },
  {
    slug: "anderson-ferreira",
    source: "Wikipedia Anderson Ferreira 2026-04-02",
    candidateUpdate: {
      biografia:
        "Anderson Ferreira Rodrigues e empresario e politico brasileiro, filiado ao Partido Liberal (PL). Foi deputado federal por Pernambuco e prefeito de Jaboatao dos Guararapes entre 2017 e 2022.",
    },
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 2017,
      periodo_fim: 2022,
      partido: "PL",
      estado: "PE",
      eleito_por: "voto direto",
      observacoes: "Prefeito de Jaboatao dos Guararapes (Wikipedia Anderson Ferreira, revisado em 2026-04-02)",
    },
  },
  {
    slug: "garotinho",
    source: "Wikipedia Anthony Garotinho 2026-04-02",
    candidateUpdate: {
      biografia:
        "Anthony William Matheus de Oliveira, conhecido como Garotinho, e radialista e politico brasileiro, filiado ao Republicanos. Foi governador do Rio de Janeiro, prefeito de Campos dos Goytacazes e deputado federal.",
    },
    historicoFix: {
      cargo: "Governador",
      periodo_inicio: 1999,
      periodo_fim: 2002,
      partido: "PDT",
      estado: "RJ",
      eleito_por: "voto direto",
      observacoes: "Governador do Rio de Janeiro (Wikipedia Anthony Garotinho, revisado em 2026-04-02)",
    },
  },
  {
    slug: "joao-rodrigues",
    source: "Gazeta do Povo SC 2026-03 + Wikipedia Joao Rodrigues 2026-04-02",
    candidateUpdate: {
      partido_sigla: "PSD",
      partido_atual: "Partido Social Democratico",
      cargo_atual: "Ex-prefeito de Chapeco",
      biografia:
        "Joao Rodrigues e empresario e politico brasileiro, filiado ao Partido Social Democratico (PSD). Foi prefeito de Chapeco entre 2021 e 2026, apos ter exercido mandato como deputado federal por Santa Catarina.",
    },
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 2021,
      periodo_fim: 2026,
      partido: "PSD",
      estado: "SC",
      eleito_por: "voto direto",
      observacoes: "Prefeito de Chapeco ate marco de 2026 (Gazeta do Povo SC 2026-03; revisado em 2026-04-02)",
    },
    deleteTimelineRows: [
      {
        partido_novo: "AVANTE",
        ano: 2026,
        contexto_includes: "Filiacao atual observada",
      },
    ],
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "lahesio-bonfim",
    source: "Wikipedia Lahesio Bonfim 2026-04-02",
    candidateUpdate: {
      biografia:
        "Lahesio Rodrigues Bonfim, conhecido como Dr. Lahesio, e medico e politico brasileiro, filiado ao Partido Novo. Foi prefeito de Sao Pedro dos Crentes entre 2017 e 2022, quando deixou o cargo para disputar o governo do Maranhao.",
    },
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 2017,
      periodo_fim: 2022,
      partido: "PSC",
      estado: "MA",
      eleito_por: "voto direto",
      observacoes: "Prefeito de Sao Pedro dos Crentes ate abril de 2022 (Wikipedia Lahesio Bonfim, revisado em 2026-04-02)",
    },
  },
  {
    slug: "natasha-slhessarenko",
    source: "HNT 2021-12-05 + coluna aniversario 2024-11-23",
    candidateUpdate: {
      data_nascimento: "1967-11-23",
      biografia:
        "Natasha Slhessarenko e medica pediatra, patologista clinica e empresaria brasileira, filiada ao Partido Social Democratico (PSD). Foi pre-candidata ao Senado por Mato Grosso em 2022 e e nome cotado para disputas majoritarias no estado.",
    },
  },
  {
    slug: "paulo-martins-gov-pr",
    source: "Prefeitura de Curitiba oficial 2025-01-01 + NOVO oficial 2025-07-23 + RIC 2025-08-11",
    candidateUpdate: {
      partido_sigla: "NOVO",
      partido_atual: "Partido Novo",
      cargo_atual: "Vice-prefeito de Curitiba",
      biografia:
        "Paulo Eduardo Martins e jornalista e politico brasileiro, filiado ao Partido Novo (NOVO). Foi deputado federal pelo Parana entre 2019 e 2023 e atualmente exerce o cargo de vice-prefeito de Curitiba na gestao 2025-2028.",
    },
    historicoFix: {
      cargo: "Vice-Prefeito",
      periodo_inicio: 2025,
      periodo_fim: null,
      partido: "NOVO",
      estado: "PR",
      eleito_por: "voto direto",
      observacoes: "cargo atual verificado manualmente (Prefeitura de Curitiba oficial 2025-01-01 + NOVO oficial 2025-07-23)",
    },
    deleteTimelineRows: [
      {
        partido_novo: "PL",
        ano: 2026,
        contexto_includes: "Filiacao atual observada",
      },
    ],
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "marcelo-maranata",
    source:
      "Retrato oficial curado (arquivo local /candidates/marcelo-maranata.jpg); contexto alinhado a Camara de Guaiba oficial 2025-03-12 + Radio Guaiba 2025-12-21",
    candidateUpdate: {
      foto_url: "/candidates/marcelo-maranata.jpg",
    },
  },
  {
    slug: "adriana-accorsi",
    source: "Camara dos Deputados oficial 2026-04-02",
    candidateUpdate: {
      cargo_atual: "Deputada Federal por Goias",
    },
    historicoFix: {
      cargo: "Deputado Federal",
      periodo_inicio: 2023,
      periodo_fim: null,
      partido: "PT",
      estado: "GO",
      eleito_por: "voto direto",
      observacoes: "cargo atual verificado manualmente (Camara dos Deputados 2026-04-02)",
    },
  },
  {
    slug: "tadeu-de-souza",
    source: "Diario da Capital + Credited 2026-03-11",
    candidateUpdate: {
      cargo_atual: "Vice-Governador do Amazonas",
    },
    historicoFix: {
      cargo: "Vice-Governador",
      periodo_inicio: 2023,
      periodo_fim: null,
      partido: "PP",
      estado: "AM",
      eleito_por: "voto direto",
      observacoes: "cargo atual verificado manualmente (Credited 2026-03-11)",
    },
  },
  {
    slug: "andre-kamai",
    source: "ac24horas.com 2024-10-07 + SAPL Camara de Rio Branco",
    candidateUpdate: {
      cargo_atual: "Vereador de Rio Branco (AC)",
    },
    historicoFix: {
      cargo: "Vereador",
      periodo_inicio: 2025,
      periodo_fim: null,
      partido: "PT",
      estado: "AC",
      eleito_por: "voto direto",
      observacoes: "cargo atual verificado manualmente (ac24horas.com 2024-10-07)",
    },
  },
  {
    slug: "mailza-assis",
    source: "Agencia de Noticias do Acre 2026-04-02",
    candidateUpdate: {
      cargo_atual: "Governadora do Estado do Acre",
      biografia:
        "Mailza Gomes Assis e politica brasileira, filiada ao Progressistas (PP). Foi senadora pelo Acre (2019-2022), vice-governadora eleita em 2022 e, desde 2 de abril de 2026, governadora do Acre apos a renuncia de Gladson Cameli.",
    },
    historicoFix: {
      cargo: "Governadora",
      periodo_inicio: 2026,
      periodo_fim: null,
      partido: "PP",
      estado: "AC",
      eleito_por: "sucessao constitucional",
      observacoes: "assumiu apos renuncia de Gladson Cameli em mar/2026 (Agencia de Noticias do Acre 2026-04-02)",
    },
  },
  {
    slug: "eduardo-braga",
    source: "Senado Federal oficial + Em Tempo 2026-03-01",
    candidateUpdate: {
      cargo_atual: "Senador(a)",
    },
    historicoFix: {
      cargo: "Senador",
      periodo_inicio: 2019,
      periodo_fim: null,
      partido: "MDB",
      estado: "AM",
      eleito_por: "voto direto",
      observacoes: "cargo atual verificado manualmente (Senado Federal oficial + Em Tempo 2026-03-01)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "leandro-grass",
    source: "Correio Braziliense 2025-11-01",
    candidateUpdate: {
      cargo_atual: "Presidente do IPHAN",
      biografia:
        "Leandro Grass Peixoto e politico e militante brasileiro, filiado ao Partido dos Trabalhadores (PT). Presidente do Instituto do Patrimonio Historico e Artistico Nacional (IPHAN) desde 2023.",
    },
    historicoFix: {
      cargo: "Presidente do IPHAN",
      periodo_inicio: 2023,
      periodo_fim: null,
      partido: "PT",
      estado: "DF",
      eleito_por: "indicacao",
      observacoes: "cargo atual verificado manualmente (Correio Braziliense 2025-11-01)",
    },
  },
]

function mergeFonteDados(existing: string[] | null | undefined): string[] {
  return [...new Set([...(existing ?? []), "curadoria"])]
}

function canonicalParty(value: string | null | undefined): string | null {
  if (!value) return null
  return resolveCanonicalParty(value)?.sigla ?? value.trim().toUpperCase()
}

async function ensureHistorico(candidatoId: string, fix: CandidateFix) {
  if (!fix.historicoFix) return

  const { data: historico, error } = await supabase
    .from("historico_politico")
    .select("id, cargo, periodo_inicio, periodo_fim")
    .eq("candidato_id", candidatoId)

  if (error) {
    throw new Error(`Erro ao buscar historico: ${error.message}`)
  }

  const existing = (historico ?? []).find(
    (row) =>
      row.cargo === fix.historicoFix?.cargo &&
      row.periodo_inicio === fix.historicoFix?.periodo_inicio &&
      (row.periodo_fim ?? null) === (fix.historicoFix?.periodo_fim ?? null)
  )

  if (existing) {
    return
  }

  const { error: insertError } = await supabase.from("historico_politico").insert({
    candidato_id: candidatoId,
    cargo: fix.historicoFix.cargo,
    periodo_inicio: fix.historicoFix.periodo_inicio,
    periodo_fim: fix.historicoFix.periodo_fim,
    partido: fix.historicoFix.partido ?? null,
    estado: fix.historicoFix.estado ?? null,
    eleito_por: fix.historicoFix.eleito_por ?? null,
    observacoes: fix.historicoFix.observacoes ?? null,
  })

  if (insertError) {
    throw new Error(`Erro ao inserir historico: ${insertError.message}`)
  }
}

async function deleteTimelineRows(candidatoId: string, rules: PartyTimelineDeleteRule[] | undefined) {
  if (!rules || rules.length === 0) return

  const { data: rows, error } = await supabase
    .from("mudancas_partido")
    .select("id, partido_novo, ano, contexto")
    .eq("candidato_id", candidatoId)

  if (error) {
    throw new Error(`Erro ao buscar timeline: ${error.message}`)
  }

  for (const row of rows ?? []) {
    const shouldDelete = rules.some((rule) => {
      if (!partiesEquivalent(rule.partido_novo, row.partido_novo)) return false
      if (rule.ano != null && row.ano !== rule.ano) return false
      if (rule.contexto_includes && !(row.contexto ?? "").includes(rule.contexto_includes)) return false
      return true
    })

    if (!shouldDelete) continue

    const { error: deleteError } = await supabase.from("mudancas_partido").delete().eq("id", row.id)
    if (deleteError) {
      throw new Error(`Erro ao remover timeline stale: ${deleteError.message}`)
    }
  }
}

async function deleteTseRows(
  candidatoId: string,
  table: "patrimonio" | "financiamento",
  years: number[] | undefined
) {
  if (!years || years.length === 0) return

  const { error } = await supabase.from(table).delete().eq("candidato_id", candidatoId).in("ano_eleicao", years)
  if (error) {
    throw new Error(`Erro ao remover ${table}: ${error.message}`)
  }
}

function rankMudanca(row: { ano: number | null; data_mudanca: string | null }): number {
  if (row.data_mudanca) {
    const parsed = Date.parse(row.data_mudanca)
    if (Number.isFinite(parsed)) return parsed
  }
  if (row.ano != null) {
    return Date.UTC(row.ano, 11, 31)
  }
  return 0
}

async function ensureCurrentPartyTimeline(candidatoId: string, fix: CandidateFix) {
  if (!fix.ensureCurrentPartyTimeline) return

  const expectedParty = canonicalParty(fix.candidateUpdate.partido_sigla ?? fix.candidateUpdate.partido_atual)
  if (!expectedParty) return

  const { data: rows, error } = await supabase
    .from("mudancas_partido")
    .select("id, partido_anterior, partido_novo, ano, data_mudanca")
    .eq("candidato_id", candidatoId)

  if (error) {
    throw new Error(`Erro ao buscar timeline atualizada: ${error.message}`)
  }

  const ordered = [...(rows ?? [])].sort((a, b) => rankMudanca(a) - rankMudanca(b))
  const latest = ordered.at(-1) ?? null
  if (latest && partiesEquivalent(latest.partido_novo, expectedParty)) {
    return
  }

  const { data: existingCurrent } = await supabase
    .from("mudancas_partido")
    .select("id, partido_novo")
    .eq("candidato_id", candidatoId)
    .eq("ano", THIS_YEAR)
    .eq("data_mudanca", TODAY)

  const matchingCurrent = (existingCurrent ?? []).find((row) =>
    partiesEquivalent(row.partido_novo, expectedParty)
  )
  if (matchingCurrent) {
    return
  }

  const partidoAnterior = latest?.partido_novo ?? "Historico anterior nao determinado"
  const { error: insertError } = await supabase.from("mudancas_partido").insert({
    candidato_id: candidatoId,
    partido_anterior: partidoAnterior,
    partido_novo: expectedParty,
    data_mudanca: TODAY,
    ano: THIS_YEAR,
    contexto: `partido atual verificado manualmente (${fix.source})`,
  })

  if (insertError) {
    throw new Error(`Erro ao inserir timeline atual: ${insertError.message}`)
  }
}

async function applyFix(fix: CandidateFix) {
  const assertion = ASSERTIONS_MAP.get(fix.slug)
  const { data: candidato, error } = await supabase
    .from("candidatos")
    .select("id, slug, fonte_dados")
    .eq("slug", fix.slug)
    .single()

  if (error || !candidato) {
    throw new Error(`Candidato ${fix.slug} nao encontrado`)
  }

  const updatePayload = {
    ...Object.fromEntries(
      Object.entries(fix.candidateUpdate).filter(([, value]) => value !== undefined)
    ),
    fonte_dados: mergeFonteDados(candidato.fonte_dados),
    ultima_atualizacao: new Date().toISOString(),
  }

  const { error: updateError } = await supabase
    .from("candidatos")
    .update(updatePayload)
    .eq("id", candidato.id)

  if (updateError) {
    throw new Error(`Erro ao atualizar candidato: ${updateError.message}`)
  }

  await deleteTseRows(candidato.id, "patrimonio", fix.deletePatrimonioYears)
  await deleteTseRows(candidato.id, "financiamento", fix.deleteFinanciamentoYears)
  await deleteTimelineRows(candidato.id, fix.deleteTimelineRows)
  await ensureCurrentPartyTimeline(candidato.id, fix)
  await ensureHistorico(candidato.id, fix)

  log(
    "apply-current-factual-fixes",
    `Atualizado ${fix.slug}${assertion ? ` via assertion ${assertion.source}` : ""}`
  )
}

async function main() {
  for (const fix of FIXES) {
    try {
      await applyFix(fix)
    } catch (error) {
      warn(
        "apply-current-factual-fixes",
        `${fix.slug}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

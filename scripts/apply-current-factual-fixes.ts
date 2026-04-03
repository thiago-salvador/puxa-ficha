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
    cargo_disputado?: string | null
    situacao_candidatura?: string | null
    data_nascimento?: string | null
    formacao?: string | null
    profissao_declarada?: string | null
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
    source: "TSE Partido Missao + consulta_cand 2018/2020/2022/2024 revisado em 2026-04-03",
    candidateUpdate: {
      nome_completo: "Renan Antonio Ferreira dos Santos",
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
    slug: "confucio-moura",
    source: "Senado Federal oficial + Rondonia Dinamica 2026-03-23",
    candidateUpdate: {
      cargo_atual: "Senador(a)",
      cargo_disputado: "Senador",
      biografia:
        "Jose Confucio Aires Moura e medico e politico brasileiro, filiado ao Movimento Democratico Brasileiro (MDB). Ex-governador de Rondonia por dois mandatos, exerce atualmente o cargo de senador pelo estado e passou a ser tratado como pre-candidato a reeleicao ao Senado em 2026.",
    },
    historicoFix: {
      cargo: "Senador",
      periodo_inicio: 2019,
      periodo_fim: 2027,
      partido: "MDB",
      estado: "RO",
      eleito_por: "voto direto",
      observacoes: "Mandato no Senado confirmado em 2026; nome tratado como pre-candidato a reeleicao (Senado Federal oficial + Rondonia Dinamica 2026-03-23)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "dr-fernando-maximo",
    source: "Camara dos Deputados oficial + Boto na Rede 2025-08-18",
    candidateUpdate: {
      cargo_atual: "Deputado(a) Federal",
      biografia:
        "Fernando Maximo de Oliveira e medico e politico brasileiro, filiado ao Uniao Brasil. E deputado federal por Rondonia desde 2023 e aparece entre os principais nomes testados para a disputa ao governo do estado em 2026.",
    },
    historicoFix: {
      cargo: "Deputado Federal",
      periodo_inicio: 2023,
      periodo_fim: null,
      partido: "UNIAO",
      estado: "RO",
      eleito_por: "voto direto",
      observacoes:
        "Mandato federal atual confirmado na Camara; nome testado para o governo de Rondonia em 2026 (Camara dos Deputados oficial + Boto na Rede 2025-08-18)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "teresa-surita",
    source: "AGN Online 2026-03-23 + Roraima em Tempo 2026-03-29",
    candidateUpdate: {
      cargo_disputado: "Senador",
      biografia:
        "Maria Teresa Saenz Surita Guimaraes e turismologa e politica brasileira, filiada ao Movimento Democratico Brasileiro (MDB). Foi prefeita de Boa Vista por cinco mandatos e deputada federal por Roraima em duas legislaturas. Em 2026, passou a confirmar publicamente sua pre-candidatura ao Senado pelo estado.",
    },
    historicoFix: {
      cargo: "Prefeita",
      periodo_inicio: 2013,
      periodo_fim: 2021,
      partido: "MDB",
      estado: "RR",
      eleito_por: "voto direto",
      observacoes: "Prefeita de Boa Vista (AGN Online 2026-03-23 + Roraima em Tempo 2026-03-29)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "edilson-damiao",
    source: "Folha BV 2026-03-18 + Folha BV 2026-03-20",
    candidateUpdate: {
      partido_sigla: "UNIAO",
      partido_atual: "Uniao Brasil",
      cargo_atual: "Governador de Roraima",
      cargo_disputado: "Governador",
      biografia:
        "Edilson Damiao da Silva e politico brasileiro, filiado ao Uniao Brasil. Eleito vice-governador de Roraima em 2022, assumiu o governo do estado em 2026 e passou a conduzir a propria pre-candidatura ao Palacio Senador Helio Campos.",
    },
    historicoFix: {
      cargo: "Governador",
      periodo_inicio: 2026,
      periodo_fim: null,
      partido: "UNIAO",
      estado: "RR",
      eleito_por: "sucessao constitucional",
      observacoes: "Assumiu o governo de Roraima em 2026 e conduz pre-candidatura propria (Folha BV 2026-03-18 + Folha BV 2026-03-20)",
    },
    deleteTimelineRows: [
      {
        partido_novo: "PP",
        ano: 2026,
        contexto_includes: "Filiacao atual observada",
      },
    ],
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "juliana-brizola",
    source: "Jornal do Comercio 2025-07-17 + ABC+ 2026-03-10",
    candidateUpdate: {
      data_nascimento: "1975-08-03",
      formacao: "Direito",
      foto_url: "https://upload.wikimedia.org/wikipedia/commons/e/e7/JulianaFotoWiki.jpg",
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
      observacoes: "Deputada estadual do RS por tres legislaturas (Jornal do Comercio 2025-07-17 + ABC+ 2026-03-10)",
    },
  },
  {
    slug: "adailton-furia",
    source: "TCE-RO 2025-12-15 + Rondonia Dinamica 2026-02-26",
    candidateUpdate: {
      cargo_atual: "Prefeito de Cacoal",
      data_nascimento: "1986-09-24",
      formacao: "SUPERIOR COMPLETO",
      foto_url: "https://sapl.al.ro.leg.br/media/sapl/public/parlamentar/253/adailton_furia.jpeg",
      biografia:
        "Adailton de Souza Furia e advogado e politico brasileiro, filiado ao Partido Social Democratico (PSD). E prefeito de Cacoal desde 2021, reeleito em 2024, e foi vereador e deputado estadual em Rondonia.",
    },
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 2021,
      periodo_fim: null,
      partido: "PSD",
      estado: "RO",
      eleito_por: "voto direto",
      observacoes: "Prefeito de Cacoal e pre-candidato ao governo (TCE-RO 2025-12-15 + Rondonia Dinamica 2026-02-26)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "thiago-de-joaldo",
    source: "Camara dos Deputados oficial 2026-04-02 + ITNet 2025-11-12",
    candidateUpdate: {
      cargo_atual: "Deputado(a) Federal",
      data_nascimento: "1982-06-20",
      formacao: "Pos-Graduacao",
      foto_url: "https://www.camara.leg.br/internet/deputado/bandep/220560.jpg",
      biografia:
        "Jose Thiago Alves de Carvalho e advogado e politico brasileiro, filiado ao Progressistas (PP). Ex-secretario municipal de Educacao de Itabaianinha, exerce mandato de deputado federal por Sergipe desde 2023.",
    },
    historicoFix: {
      cargo: "Deputado(a) Federal",
      periodo_inicio: 2023,
      periodo_fim: null,
      partido: "PP",
      estado: "SE",
      eleito_por: "voto direto",
      observacoes: "Mandato federal atual verificado manualmente (Camara dos Deputados oficial 2026-04-02 + ITNet 2025-11-12)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "anderson-ferreira",
    source: "JC 2025-03-21 + Diario de Pernambuco 2026-02-06",
    candidateUpdate: {
      cargo_disputado: "Senador",
      biografia:
        "Anderson Ferreira de Alencar e empresario e politico brasileiro, filiado ao Partido Liberal (PL). Foi deputado federal e prefeito de Jaboatao dos Guararapes entre 2017 e 2022, e passou a ser tratado pelo PL como nome para o Senado em Pernambuco em 2026.",
    },
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 2017,
      periodo_fim: 2022,
      partido: "PL",
      estado: "PE",
      eleito_por: "voto direto",
      observacoes: "Prefeito de Jaboatao dos Guararapes (JC 2025-03-21 + Diario de Pernambuco 2026-02-06)",
    },
  },
  {
    slug: "guilherme-derrite",
    source: "Camara dos Deputados oficial 2026-04-02 + UOL 2025-05-19",
    candidateUpdate: {
      partido_sigla: "PP",
      partido_atual: "PP",
      cargo_atual: "Deputado(a) Federal",
      cargo_disputado: "Senador",
      biografia:
        "Guilherme Muraro Derrite e policial militar reformado e politico brasileiro, filiado ao PP. Ex-secretario da Seguranca Publica de Sao Paulo entre 2023 e 2025, retomou o mandato de deputado federal e passou a ser tratado como nome do partido para o Senado em 2026.",
    },
    historicoFix: {
      cargo: "Deputado Federal",
      periodo_inicio: 2025,
      periodo_fim: null,
      partido: "PP",
      estado: "SP",
      eleito_por: "voto direto",
      observacoes: "Mandato federal retomado apos saida da Secretaria de Seguranca Publica (Camara dos Deputados oficial 2026-04-02 + UOL 2025-05-19)",
    },
    ensureCurrentPartyTimeline: true,
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
    slug: "felipe-camarao",
    source: "Sedihpop.ma.gov.br 2023-01-01 + PT.org.br 2025-01-01",
    candidateUpdate: {
      cargo_atual: "Vice-Governador do Maranhao",
    },
    historicoFix: {
      cargo: "Vice-Governador",
      periodo_inicio: 2023,
      periodo_fim: null,
      partido: "PT",
      estado: "MA",
      eleito_por: "voto direto",
      observacoes: "cargo atual verificado manualmente (Sedihpop.ma.gov.br 2023 + PT.org.br 2025)",
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
    source: "O Tempo Eleicoes 2024 (dados TSE) + SAPL Camara de Rio Branco",
    candidateUpdate: {
      cargo_atual: "Vereador de Rio Branco (AC)",
      profissao_declarada: "Sociologo",
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
    slug: "soldado-sampaio",
    source: "ALE-RR oficial 2026-02-24 + Folha BV 2025-10-06",
    candidateUpdate: {
      partido_sigla: "REPUBLICANOS",
      partido_atual: "Republicanos",
      cargo_atual: "Presidente da Assembleia Legislativa de Roraima",
      biografia:
        "Francisco dos Santos Sampaio, conhecido como Soldado Sampaio, e policial militar e politico brasileiro, filiado ao Republicanos. E deputado estadual por Roraima desde 2011 e preside a Assembleia Legislativa do estado desde 2021.",
    },
    historicoFix: {
      cargo: "Presidente da Assembleia Legislativa de Roraima",
      periodo_inicio: 2021,
      periodo_fim: null,
      partido: "REPUBLICANOS",
      estado: "RR",
      eleito_por: "eleicao interna",
      observacoes: "cargo atual verificado manualmente (ALE-RR oficial 2026-02-24 + Folha BV 2025-10-06)",
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
    slug: "amelio-cayres",
    source: "ALETO oficial 2023-02-13 + diario oficial ALETO 2026-03",
    candidateUpdate: {
      partido_sigla: "REPUBLICANOS",
      partido_atual: "Republicanos",
      cargo_atual: "Presidente da Assembleia Legislativa do Tocantins",
      biografia:
        "Amelio Antunes Cayres e politico brasileiro, filiado ao Republicanos. E deputado estadual e presidente da Assembleia Legislativa do Tocantins, cargo que ocupa desde 2023.",
    },
    historicoFix: {
      cargo: "Presidente da Assembleia Legislativa do Tocantins",
      periodo_inicio: 2025,
      periodo_fim: null,
      partido: "REPUBLICANOS",
      estado: "TO",
      eleito_por: "eleicao interna",
      observacoes: "cargo atual e filiacao verificados manualmente (ALETO oficial 2023-02-13 + diario oficial ALETO 2026-03)",
    },
    deleteTimelineRows: [
      {
        partido_novo: "MDB",
        ano: 2026,
      },
      {
        partido_novo: "REPUBLICANOS",
        ano: 2026,
        contexto_includes: "partido atual verificado manualmente",
      },
    ],
    ensureCurrentPartyTimeline: true,
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
  {
    slug: "orleans-brandao",
    source: "Boletim do Sertao 2023-03-14 + G1 2026-03",
    candidateUpdate: {
      partido_sigla: "MDB",
      partido_atual: "Movimento Democratico Brasileiro",
      formacao: "Administracao",
      profissao_declarada: "Administrador",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "joao-henrique-catan",
    source: "G1 MS 2023-02-01 + ALEMS + NOVO oficial 2026",
    candidateUpdate: {
      partido_sigla: "NOVO",
      partido_atual: "Partido Novo",
      cargo_atual: null,
      profissao_declarada: "Advogado",
    },
    ensureCurrentPartyTimeline: true,
    historicoFix: {
      cargo: "Deputado Federal",
      periodo_inicio: 2023,
      periodo_fim: null,
      partido: "NOVO",
      estado: "MS",
      eleito_por: "voto direto",
      observacoes: "Deputado Federal pelo MS. Migrou do PL para NOVO em marco/2026 (Capital News 2026-03-08)",
    },
  },
  {
    slug: "lucien-rezende",
    source: "O Tempo Eleicoes 2024 (dados TSE)",
    candidateUpdate: {
      profissao_declarada: "Empresario",
    },
  },
  {
    slug: "janaina-riva",
    source: "O Livre 2025 + PNB Online 2026",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Deputada Estadual",
      periodo_inicio: 2019,
      periodo_fim: null,
      partido: "MDB",
      estado: "MT",
      eleito_por: "voto direto",
      observacoes: "Deputada Estadual MT (18a, 19a e 20a legislatura, MDB). Source: O Livre 2025",
    },
  },
  // lote 11
  {
    slug: "alysson-bezerra",
    source: "O Tempo Eleicoes 2024 (dados TSE) + Agora RN 2026-03",
    candidateUpdate: {
      nome_completo: "Allyson Leandro Bezerra Silva",
      profissao_declarada: "Servidor Publico Federal",
    },
  },
  {
    slug: "hildon-chaves",
    source: "Portal364 2026-03 + News Rondonia 2026-03-20",
    candidateUpdate: {
      partido_atual: "Uniao Brasil",
      partido_sigla: "UNIAO",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "gilberto-kassab",
    source: "Governo de SP oficial + O Globo 2025-03-24",
    candidateUpdate: {
      cargo_atual: "Secretario de Governo e Relacoes Institucionais de Sao Paulo",
      biografia:
        "Gilberto Kassab e engenheiro civil, economista, empresario e politico brasileiro, filiado ao Partido Social Democratico (PSD), legenda que preside nacionalmente. Atualmente ocupa o cargo de secretario de Governo e Relacoes Institucionais do Estado de Sao Paulo e segue citado como nome do partido para a disputa ao governo paulista em 2026.",
    },
    historicoFix: {
      cargo: "Secretario de Governo e Relacoes Institucionais de Sao Paulo",
      periodo_inicio: 2023,
      periodo_fim: null,
      partido: "PSD",
      estado: "SP",
      eleito_por: "nomeacao",
      observacoes:
        "Cargo atual verificado manualmente (Governo de SP oficial + O Globo 2025-03-24)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "valmir-de-francisquinho",
    source: "SEnoticias 2026-04-02 + Fan F1 2026-04-02 + Atualiza Sergipe 2026-03-29",
    candidateUpdate: {
      partido_atual: "Republicanos",
      partido_sigla: "REPUBLICANOS",
      cargo_atual: null,
      biografia:
        "Valmir dos Santos Costa, conhecido como Valmir de Francisquinho, e empresario e politico brasileiro, atualmente filiado ao Republicanos. Ex-prefeito de Itabaiana, renunciou ao cargo em 2 de abril de 2026 e passou a disputar o governo de Sergipe pela nova legenda.",
    },
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 2025,
      periodo_fim: 2026,
      partido: "REPUBLICANOS",
      estado: "SE",
      eleito_por: "voto direto",
      observacoes:
        "Renunciou a Prefeitura de Itabaiana em 02/04/2026 para disputar o governo de Sergipe (SEnoticias 2026-04-02 + Fan F1 2026-04-02)",
    },
    ensureCurrentPartyTimeline: true,
  },
  // lote 10
  {
    slug: "joel-rodrigues",
    source: "Parlamento Piaui 2026 + Cidades em Foco 2026",
    candidateUpdate: {
      nome_completo: "Joel Rodrigues da Silva",
    },
  },
  {
    slug: "requiao-filho",
    source: "Brasil de Fato 2025-05-09 + Brasil de Fato 2026-03-31",
    candidateUpdate: {},
  },
  {
    slug: "douglas-ruas",
    source: "Agencia Brasil 2026-03 + Portal Multiplix 2026-02-24",
    candidateUpdate: {
      nome_completo: "Douglas Ruas dos Santos",
    },
  },
  {
    slug: "otaviano-pivetta",
    source: "ALMT posse 2026-03-31 + Republicanos10 2026-03-31",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Governador de Mato Grosso",
      periodo_inicio: 2026,
      periodo_fim: null,
      partido: "REPUBLICANOS",
      estado: "MT",
      eleito_por: "sucessao",
      observacoes: "assumiu governadoria em 31/03/2026 apos renúncia de Mauro Mendes (ALMT posse 2026-03-31)",
    },
  },
  {
    slug: "marcelo-brigadeiro",
    source: "Fesporte-SC 2020-08-07 + SCTodoDia 2026-01-09 + 4oito 2026-01-29",
    candidateUpdate: {
      partido_atual: "Partido Missao",
      partido_sigla: "MISSAO",
      cargo_atual: null,
      profissao_declarada: "Medico Veterinario",
      biografia:
        "Marcelo Brigadeiro e empresario, ex-lutador de MMA e influenciador digital, filiado ao Partido Missao. Em janeiro de 2026 confirmou a pre-candidatura ao governo de Santa Catarina pela nova legenda.",
    },
    ensureCurrentPartyTimeline: true,
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
    .select("id, cargo, periodo_inicio, periodo_fim, partido, estado, eleito_por, observacoes")
    .eq("candidato_id", candidatoId)

  if (error) {
    throw new Error(`Erro ao buscar historico: ${error.message}`)
  }

  const exactMatch = (historico ?? []).find(
    (row) =>
      row.cargo === fix.historicoFix?.cargo &&
      row.periodo_inicio === fix.historicoFix?.periodo_inicio &&
      (row.periodo_fim ?? null) === (fix.historicoFix?.periodo_fim ?? null)
  )
  const uniqueKeyMatch = (historico ?? []).find(
    (row) => row.cargo === fix.historicoFix?.cargo && row.periodo_inicio === fix.historicoFix?.periodo_inicio
  )
  const existing = exactMatch ?? uniqueKeyMatch

  if (existing) {
    const updatePayload = {
      periodo_fim: fix.historicoFix.periodo_fim,
      partido: fix.historicoFix.partido ?? null,
      estado: fix.historicoFix.estado ?? null,
      eleito_por: fix.historicoFix.eleito_por ?? null,
      observacoes: fix.historicoFix.observacoes ?? null,
    }

    const needsUpdate =
      (existing.periodo_fim ?? null) !== updatePayload.periodo_fim ||
      (existing.partido ?? null) !== updatePayload.partido ||
      (existing.estado ?? null) !== updatePayload.estado ||
      (existing.eleito_por ?? null) !== updatePayload.eleito_por ||
      (existing.observacoes ?? null) !== updatePayload.observacoes

    if (!needsUpdate) {
      return
    }

    const { error: updateError } = await supabase
      .from("historico_politico")
      .update(updatePayload)
      .eq("id", existing.id)

    if (updateError) {
      throw new Error(`Erro ao atualizar historico existente: ${updateError.message}`)
    }

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

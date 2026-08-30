import { ASSERTIONS_MAP } from "./lib/factual-assertions"
import { findHistoricoRowForFix } from "./lib/apply-factual-historico-match"
import { canonicalCargo } from "./lib/cargo-utils"
import { runAfterCuratedPartyTimelineWrites } from "./lib/apply-party-timeline-rechain-step"
import { inferHistoricoTipoEventoFromRow } from "./lib/historico-tipo-evento"
import { log, warn } from "./lib/logger"
import { canonicalPartiesEquivalent, resolveCanonicalParty } from "./lib/party-canonical"
import { rankPartyTimelineConsistencyRow } from "./lib/party-timeline-consistency"
import { sanitizeTemplateText } from "./lib/ptbr-sanitize"
import { selectCurrentFactualFixes } from "./lib/current-factual-fixes-selection"
import { supabase } from "./lib/supabase"
import { escreverAuditado } from "./lib/escrita-auditada"
import { sanitizeNullablePtBrText } from "../src/lib/ptbr-text"

interface PartyTimelineDeleteRule {
  partido_anterior?: string
  partido_novo: string
  ano?: number
  contexto_includes?: string
}

interface PartyTimelineEnsureRow {
  partido_anterior: string
  partido_novo: string
  ano: number
  data_mudanca?: string | null
  contexto: string
}

export interface HistoricoFix {
  cargo: string
  periodo_inicio: number
  periodo_fim: number | null
  partido?: string | null
  estado?: string | null
  eleito_por?: string | null
  observacoes?: string | null
  /**
   * Proveniência persistida; omitido ⇒ `manual` (blocos `historicoFix` são sempre curadoria).
   * Use `misto` quando a row sintetiza várias fontes com evidência explícita.
   */
  proveniencia?: "tse" | "wikidata" | "manual" | "misto" | "unknown"
}

export interface HistoricoDeleteRule {
  cargo?: string
  cargo_canonico?: string
  periodo_inicio?: number | null
  periodo_fim?: number | null
  tipo_evento?: "mandato" | "candidatura"
  observacoes_includes?: string
}

export interface CandidateFix {
  slug: string
  source: string
  candidateUpdate: {
    nome_completo?: string
    naturalidade?: string | null
    partido_sigla?: string
    partido_atual?: string
    cargo_atual?: string | null
    cargo_disputado?: string | null
    estado?: string | null
    situacao_candidatura?: string | null
    /** Alinhado a `candidatos.status` no Postgres (curadoria factual). */
    status?: "pre-candidato" | "candidato" | "indeferido" | "desistente" | "removido"
    publicavel?: boolean
    data_nascimento?: string | null
    formacao?: string | null
    profissao_declarada?: string | null
    foto_url?: string | null
    biografia?: string
  }
  historicoFix?: HistoricoFix
  deleteTimelineRows?: PartyTimelineDeleteRule[]
  /** Inserir arestas ausentes após deletes (partidos canônicos no banco). */
  ensureTimelineRows?: PartyTimelineEnsureRow[]
  deletePatrimonioYears?: number[]
  deleteFinanciamentoYears?: number[]
  deleteHistoricoRows?: HistoricoDeleteRule[]
  ensureCurrentPartyTimeline?: boolean
  manualVotes?: {
    titulo: string
    descricao: string
    data_votacao: string
    casa: "Câmara" | "Senado"
    tema: string
    impacto_popular: string
    proposicao_id?: string | null
    voto: "sim" | "não" | "abstenção" | "ausente" | "obstrução" | "artigo_17"
  }[]
}

const PUBLIC_CANDIDATE_TEXT_FIELDS = new Set([
  "naturalidade",
  "partido_atual",
  "cargo_atual",
  "cargo_disputado",
  "situacao_candidatura",
  "formacao",
  "profissao_declarada",
  "biografia",
])

function sanitizeCandidateUpdate(
  update: CandidateFix["candidateUpdate"]
): CandidateFix["candidateUpdate"] {
  return Object.fromEntries(
    Object.entries(update).map(([key, value]) => [
      key,
      PUBLIC_CANDIDATE_TEXT_FIELDS.has(key) ? sanitizeNullablePtBrText(value as string | null | undefined) : value,
    ])
  ) as CandidateFix["candidateUpdate"]
}

const TODAY = "2026-04-02"
const THIS_YEAR = 2026

export const FIXES: CandidateFix[] = [
  {
    slug: "alexandre-kalil",
    source:
      "Folha, 2026-05-25, 'Veja os pré-candidatos ao governo e Senado de cada estado' (https://www1.folha.uol.com.br/poder/2026/05/veja-quem-sao-os-pre-candidatos-ao-governo-e-ao-senado-em-cada-estado.shtml) + O Tempo, 2026-05-05, 'Kalil inicia giro no interior de Minas e mira palanques regionais' (https://www.otempo.com.br/eleicoes/2026/governadores/2026/5/5/kalil-mira-palanques-regionais-e-dara-inicio-a-giro-em-cidades-do-interior) + TSE, 2020-11-15, 'Belo Horizonte (MG): Kalil (PSD) é reeleito prefeito da cidade' (https://www.tse.jus.br/comunicacao/noticias/2020/Novembro/belo-horizonte-mg-kalil-psd-e-reeleito-prefeito-da-cidade) + TSE, 2016-10-30, 'Eleitores de Belo Horizonte (MG) elegem Alexandre Kalil para a Prefeitura' (https://www.tse.jus.br/comunicacao/noticias/2016/Outubro/eleitores-de-belo-horizonte-mg-elegem-alexandre-kalil-para-a-prefeitura) + Wikimedia Commons, categoria Alexandre Kalil e foto TSE 2016 (https://commons.wikimedia.org/wiki/Category:Alexandre_Kalil)",
    candidateUpdate: {
      partido_sigla: "PDT",
      partido_atual: "Partido Democrático Trabalhista",
      cargo_atual: "Ex-prefeito de Belo Horizonte (MG)",
      cargo_disputado: "Governador",
      estado: "MG",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      data_nascimento: "1959-03-25",
      naturalidade: "Belo Horizonte/MG",
      formacao: "Engenharia Civil incompleta",
      profissao_declarada: "Empresário",
      foto_url:
        "https://upload.wikimedia.org/wikipedia/commons/2/2e/2016_KALIL_CANDIDATO_PREFEITO_MG_BELO_HORIZONTE_TSE_%28130000083186%29.jpg",
      biografia:
        "Alexandre Kalil é empresário, ex-presidente do Clube Atlético Mineiro e ex-prefeito de Belo Horizonte. Filiado ao Partido Democrático Trabalhista, foi listado em 2026 entre os pré-candidatos ao governo de Minas Gerais, em cenário anterior às convenções partidárias e ao registro oficial de candidatura.",
    },
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 2017,
      periodo_fim: 2022,
      partido: null,
      estado: "MG",
      eleito_por: "voto direto",
      observacoes:
        "TSE registra Alexandre Kalil eleito prefeito de Belo Horizonte em 2016 e reeleito em 2020; deixou a prefeitura em março de 2022 para disputar o governo de Minas Gerais.",
      proveniencia: "misto",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "andre-marinho",
    source:
      "Veja Rio, 2026-04-14, 'Saiba quem são os pré-candidatos ao governo do Rio em 2026' (https://vejario.abril.com.br/cidade/pre-candidatos-governo-rio-2026/) + O Dia, 2026-05-09, 'Partido Novo lança André Marinho como pré-candidato ao governo do Rio' (https://odia.ig.com.br/rio-de-janeiro/2026/05/amp/7248297-partido-novo-lanca-andre-marinho-como-pre-candidato-ao-governo-do-rio.html) + CNN Brasil, 2026-05-09, 'Novo lança Marinho ao governo do Rio; pré-candidato critica rivais' (https://www.cnnbrasil.com.br/eleicoes/novo-lanca-marinho-ao-governo-do-rio-pre-candidato-critica-rivais/) + Folha, 2026-05-25, 'Veja os pré-candidatos ao governo e Senado de cada estado' (https://www1.folha.uol.com.br/poder/2026/05/veja-quem-sao-os-pre-candidatos-ao-governo-e-ao-senado-em-cada-estado.shtml) + Wikipédia, 'André Marinho (humorista)' (https://pt.wikipedia.org/wiki/Andr%C3%A9_Marinho_(humorista)) + Wikimedia Commons, File:André Marinho.tif (https://commons.wikimedia.org/wiki/File:Andr%C3%A9_Marinho.tif)",
    candidateUpdate: {
      partido_sigla: "NOVO",
      partido_atual: "Partido Novo",
      cargo_disputado: "Governador",
      estado: "RJ",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      naturalidade: "Rio de Janeiro (RJ)",
      formacao: "Ciência Política pela New York University",
      profissao_declarada: "Comunicador, humorista e apresentador",
      foto_url:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/Andr%C3%A9_Marinho.tif/lossy-page1-500px-Andr%C3%A9_Marinho.tif.jpg",
      biografia:
        "André Marinho é comunicador, humorista e apresentador, conhecido por imitações de figuras políticas e por passagem em programas como o Pânico, da Jovem Pan. Filiado ao Partido Novo, foi lançado em maio de 2026 como pré-candidato ao governo do Rio de Janeiro, em cenário anterior às convenções partidárias e ao registro oficial de candidatura.",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "andre-portugues",
    source:
      "Veja Rio, 2026-04-14, 'Saiba quem são os pré-candidatos ao governo do Rio em 2026' (https://vejario.abril.com.br/cidade/pre-candidatos-governo-rio-2026/) + Veja Rio, 2025-11-28, 'Devolver pertencimento ao miguelense é meu maior legado' (https://vejario.abril.com.br/cidade/devolver-pertencimento-ao-miguelense-e-meu-maior-legado/) + Folha1, 2026-05-13, 'Dilema no Republicanos: Garotinho lança hoje no Rio sua pré-candidatura a governador' (https://www.folha1.com.br/politica/2026/05/1316276-dilema-no-republicanos-garotinho-lanca-hoje-no-rio-sua-pre-candidatura-a-governdor.html) + TSE Dados Abertos, consulta_cand_2012/2014/2016/2020, Andre Pinto de Afonseca / Andre Portugues, SQs 190000025768, 190000001796, 190000006287 e 190000874427 + TSE DivulgaCandContas 2020, candidatura 190000874427 em Miguel Pereira/RJ (https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2020/58572/2030402020/candidato/190000874427)",
    candidateUpdate: {
      partido_sigla: "REPUBLICANOS",
      partido_atual: "Republicanos",
      cargo_atual: "Ex-prefeito de Miguel Pereira",
      cargo_disputado: "Governador",
      estado: "RJ",
      status: "pre-candidato",
      data_nascimento: "1975-01-30",
      naturalidade: "Miguel Pereira (RJ)",
      formacao: "Ensino médio completo",
      profissao_declarada: "Prefeito",
      foto_url: "https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/2030402020/190000874427/58572",
      biografia:
        "André Português é ex-prefeito de Miguel Pereira, município que administrou entre 2017 e 2024. Filiado ao Republicanos, foi listado em 2026 entre os pré-candidatos ao governo do Rio de Janeiro, em cenário anterior às convenções partidárias e ao registro oficial de candidatura.",
    },
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 2017,
      periodo_fim: 2024,
      estado: "RJ",
      eleito_por: "voto direto",
      observacoes:
        "Dois mandatos à frente da Prefeitura de Miguel Pereira entre 2017 e 2024; eleito em 2016 e reeleito em 2020 (Veja Rio 2025-11-28 e 2026-04-14).",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "araceli-lemos",
    source:
      "Ponto de Pauta, 2026-03-25, 'PSOL lança caravana de Araceli Lemos para construir programa de governo participativo' (https://pontodepauta.com/2026/03/25/psol-lanca-caravana-de-araceli-lemos-para-construir-programa-de-governo-participativo/) + Estado do Pará Online, 2025, 'PSOL apresenta Araceli Lemos como pré-candidata ao governo do Pará' (https://estadodoparaonline.com/psol-apresenta-araceli-lemos-como-pre-candidata-ao-governo-do-para/) + O Liberal, 2023-03-01, 'Professora Araceli Lemos é a nova titular da Semec em Belém' (https://www.oliberal.com/politica/professora-araceli-lemos-e-a-nova-titular-da-semec-em-belem-1.651483) + TSE Dados Abertos, consulta_cand_2002, Araceli Maria Pereira Lemos, deputado estadual PA, resultado ELEITO (https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2002.zip) + TSE DivulgaCandContas 2018, candidatura 140000604416 no Pará, foto pública e naturalidade PA-INHANGAPI (https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2018/PA/2022802018/candidato/140000604416)",
    candidateUpdate: {
      partido_sigla: "PSOL",
      partido_atual: "Partido Socialismo e Liberdade",
      cargo_disputado: "Governador",
      estado: "PA",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      data_nascimento: "1958-05-29",
      naturalidade: "Inhangapi (PA)",
      formacao:
        "Licenciatura Plena em História; especialização em Metodologia e Pesquisa Histórica na Amazônia pela UFPA",
      profissao_declarada: "Professora de História",
      foto_url: "https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/2022802018/140000604416/PA",
      biografia:
        "Araceli Lemos é professora de História, ex-deputada estadual e presidenta estadual do Partido Socialismo e Liberdade no Pará. Em 2026, o PSOL acolheu sua pré-candidatura ao governo do Pará e lançou uma caravana para construir um programa de governo participativo, em cenário anterior às convenções partidárias e ao registro oficial de candidatura.",
    },
    historicoFix: {
      cargo: "Deputado Estadual",
      periodo_inicio: 2003,
      periodo_fim: 2006,
      partido: "PT",
      estado: "PA",
      eleito_por: "voto direto",
      observacoes:
        "TSE Dados Abertos consulta_cand_2002 registra Araceli Maria Pereira Lemos eleita deputada estadual pelo PT no Pará nas Eleições Gerais de 2002.",
      proveniencia: "tse",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "ben-mendes",
    source:
      "Itatiaia, 2026-01-13, 'Influenciador de Contagem, Ben Mendes é filiado ao partido do MBL e pode concorrer ao governo' (https://www.itatiaia.com.br/politica/eleicoes/influenciador-de-contagem-ben-mendes-e-filiado-a-partido-do-mbl-e-pode-concorrer-ao-governo/) + Itatiaia, 2026-02-05, 'Influenciador Ben Mendes é confirmado como pré-candidato do MBL ao governo de Minas' (https://www.itatiaia.com.br/politica/eleicoes/influenciador-ben-mendes-e-confirmado-como-pre-candidato-do-mbl-ao-governo-de-minas/) + O Tempo, 2026-01-14, 'Partido do MBL filia influenciador de Minas mirando disputa pelo governo ou Senado' (https://www.otempo.com.br/politica/2026/1/14/partido-do-mbl-filia-influenciador-de-minas-mirando-disputa-pelo-governo-ou-senado) + Metrópoles, 2026-03-16, 'Cristão antiesquerda: quem é pré-candidato que brigou com mulher em MG' (https://www.metropoles.com/minas-gerais/cristao-antiesquerda-quem-e-pre-candidato-que-brigou-com-mulher-em-mg)",
    candidateUpdate: {
      partido_sigla: "MISSAO",
      partido_atual: "Partido Missão",
      cargo_disputado: "Governador",
      estado: "MG",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      formacao: "Medicina em andamento",
      naturalidade: "Contagem (MG)",
      profissao_declarada: "Advogado, jornalista, empresário e influenciador digital",
      biografia:
        "Ben Mendes é advogado, jornalista, empresário e influenciador digital ligado à defesa dos direitos do consumidor. Filiado ao Partido Missão, foi confirmado em 2026 como pré-candidato ao governo de Minas Gerais, em cenário anterior às convenções partidárias e ao registro oficial de candidatura.",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "cintia-dias",
    source:
      "CBN-GO, 2026-04-29, 'PSOL lança pré-candidatura da cientista social Cíntia Dias ao Governo de Goiás' (https://cbngoiania.com.br/cbn-goiania/psol-lanca-pre-candidatura-da-cientista-social-cintia-dias-ao-governo-de-goias-1.3403763) + TSE DivulgaCandContas 2024, Cintia Aparecida Dias, vereadora em Goiânia (https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2024/93734/2045202024/candidato/90002192685) + TSE DivulgaCandContas 2022, Cintia Aparecida Dias, governadora em Goiás (https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2022/GO/2040602022/candidato/90001674691)",
    candidateUpdate: {
      partido_sigla: "PSOL",
      partido_atual: "Partido Socialismo e Liberdade",
      cargo_disputado: "Governador",
      estado: "GO",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      data_nascimento: "1977-05-25",
      naturalidade: "Goiânia (GO)",
      formacao: "Superior completo",
      profissao_declarada: "Cientista social",
      foto_url: "https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/2045202024/90002192685/93734",
      biografia:
        "Cíntia Dias é cientista social e filiada ao Partido Socialismo e Liberdade. Candidata ao governo de Goiás em 2022, foi lançada pelo PSOL em abril de 2026 como pré-candidata ao governo do estado, em cenário anterior às convenções partidárias e ao registro oficial de candidatura.",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "cleber-rabelo",
    source:
      "Estado do Pará Online, 2026-05-21, 'PSTU anuncia pré-candidatura de Cleber Rabelo ao governo do Pará' (https://estadodoparaonline.com/pstu-anuncia-pre-candidatura-de-cleber-rabelo-ao-governo-do-para/) + TSE DivulgaCandContas 2022, José Cleber Barros Rabelo, governador no Pará (https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2022/PA/2040602022/candidato/140001650519) + PSTU, 2014-03-17, 'PSTU lança o vereador Cléber Rabelo como pré-candidato ao governo do Pará' (https://www.pstu.org.br/pstu-lanca-o-vereador-cleber-rabelo-como-pre-candidato-ao-governo-do-para/) + DOL, 2020-10-17, 'Pretendo governar por meio dos conselhos populares, diz Cleber Rabelo' (https://dol.com.br/noticias/para/613205/pretendo-governar-por-meio-dos-conselhos-populares-diz-cleber-rabelo) + Câmara Municipal de Belém, atividades legislativas 2015 (https://cmb.pa.gov.br/c/atividades-legislativas/)",
    candidateUpdate: {
      partido_sigla: "PSTU",
      partido_atual: "Partido Socialista dos Trabalhadores Unificado",
      cargo_disputado: "Governador",
      estado: "PA",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      data_nascimento: "1972-11-13",
      naturalidade: "Bacuri (MA)",
      formacao: "Ensino médio completo",
      profissao_declarada: "Eletricista e operário da construção civil",
      foto_url: "https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/2040602022/140001650519/PA",
      biografia:
        "Cleber Rabelo é eletricista, operário da construção civil, dirigente sindical e integrante do Partido Socialista dos Trabalhadores Unificado. Ex-vereador de Belém, foi anunciado pelo PSTU em maio de 2026 como pré-candidato ao governo do Pará, em cenário anterior às convenções partidárias e ao registro oficial de candidatura.",
    },
    historicoFix: {
      cargo: "Vereador",
      periodo_inicio: 2013,
      periodo_fim: 2016,
      partido: "PSTU",
      estado: "PA",
      eleito_por: "voto direto",
      observacoes:
        "DOL informa que Cleber Rabelo foi vereador de Belém de 2013 a 2016; registros da Câmara Municipal de Belém em 2015 listam processos de autoria do vereador Cleber Rabelo.",
      proveniencia: "misto",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "cyro-garcia",
    source:
      "Veja Rio, 2026-04-14, 'Saiba quem são os pré-candidatos ao governo do Rio em 2026' (https://vejario.abril.com.br/cidade/pre-candidatos-governo-rio-2026/) + TSE DivulgaCandContas 2024, Cyro Garcia, candidato a prefeito no Rio de Janeiro (https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2024/60011/2045202024/candidato/190001951101)",
    candidateUpdate: {
      partido_sigla: "PSTU",
      partido_atual: "Partido Socialista dos Trabalhadores Unificado",
      cargo_disputado: "Governador",
      estado: "RJ",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      data_nascimento: "1954-10-26",
      naturalidade: "Manhumirim (MG)",
      formacao: "Direito pela UFRJ; mestrado e doutorado em História pela UFF",
      profissao_declarada: "Professor de ensino superior e historiador",
      foto_url: "https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/2045202024/190001951101/60011",
      biografia:
        "Cyro Garcia é professor, historiador, ex-bancário e integrante do Partido Socialista dos Trabalhadores Unificado. Formado em Direito pela UFRJ, com mestrado e doutorado em História pela UFF, foi listado em abril de 2026 entre os pré-candidatos ao governo do Rio de Janeiro em cenário anterior às convenções partidárias e ao registro oficial de candidatura.",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "priscila-voigt",
    source:
      "Correio do Povo, 2026-04-20, 'UP lança pré-candidatura ao governo do RS' (https://www.correiodopovo.com.br/not%C3%ADcias/pol%C3%ADtica/up-lanca-pre-candidatura-ao-governo-do-rs-1.1706975) + Jornal do Comércio, 2026-04-19, 'Rio Grande do Sul tem seis pré-candidatos confirmados na disputa ao Piratini' (https://www.jornaldocomercio.com/politica/2026/04/1245458-rio-grande-do-sul-tem-seis-pre-candidatos-confirmados-na-disputa-ao-piratini.html) + TSE DivulgaCandContas 2024, Priscila Voigt Severiano, candidata a vereadora em Porto Alegre (https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2024/88013/2045202024/candidato/210001945324)",
    candidateUpdate: {
      partido_sigla: "UP",
      partido_atual: "Unidade Popular",
      cargo_disputado: "Governador",
      estado: "RS",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      data_nascimento: "1991-06-19",
      naturalidade: "Porto Alegre (RS)",
      formacao: "Superior completo",
      profissao_declarada: "Nutricionista",
      foto_url: "https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/2045202024/210001945324/88013",
      biografia:
        "Priscila Voigt é nutricionista, presidente da Unidade Popular no Rio Grande do Sul e integrante da executiva nacional da legenda. Também atuou na construção da Casa de Referência Mulheres Mirabal e na coordenação da Ocupação Lanceiros Negros. Em abril de 2026, a UP lançou sua pré-candidatura ao governo do Rio Grande do Sul, em cenário anterior às convenções partidárias e ao registro oficial de candidatura.",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "rejane-oliveira",
    source:
      "Informativo Regional, 2026-04-24, 'Rio Grande do Sul tem seis pré-candidatos confirmados na disputa ao Piratini' (https://www.informativoregional.net/geral/rio-grande-do-sul-tem-seis-pre-candidatos-confirmados-na-disputa-ao-piratini.15469988) + Jornal do Comércio, 2026-05-02, 'Metade das coligações ao governo do RS está definida a cinco meses das eleições' (https://www.jornaldocomercio.com/politica/2026/05/1247054-metade-das-coligacoes-ao-governo-do-rs-esta-definida-a-cinco-meses-das-eleicoes.html) + TSE DivulgaCandContas 2022, Rejane Silva de Oliveira, candidata a governadora no Rio Grande do Sul (https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2022/RS/2040602022/candidato/210001605930)",
    candidateUpdate: {
      partido_sigla: "PSTU",
      partido_atual: "Partido Socialista dos Trabalhadores Unificado",
      cargo_disputado: "Governador",
      estado: "RS",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      data_nascimento: "1961-03-01",
      naturalidade: "Porto Alegre (RS)",
      formacao: "Ensino médio completo",
      profissao_declarada: "Servidora pública civil aposentada",
      foto_url: "https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/2040602022/210001605930/RS",
      biografia:
        "Rejane de Oliveira é servidora pública civil aposentada e integrante do Partido Socialista dos Trabalhadores Unificado. Candidata ao governo do Rio Grande do Sul em 2022, foi listada em 2026 entre as pré-candidatas ao Palácio Piratini, em cenário anterior às convenções partidárias e ao registro oficial de candidatura.",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "juliete-pantoja",
    source:
      "Tempo Real RJ, 2026-04-13, 'Unidade Popular lança Juliete Pantoja como pré-candidata ao governo do estado' (https://temporealrj.com/unidade-popular-juliete-pantoja-governo/) + Veja Rio, 2026-04-14, 'Saiba quem são os pré-candidatos ao governo do Rio em 2026' (https://vejario.abril.com.br/cidade/pre-candidatos-governo-rio-2026/) + TSE DivulgaCandContas 2024, Juliete Pantoja Alves, candidata a prefeita no Rio de Janeiro (https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2024/60011/2045202024/candidato/190002135108)",
    candidateUpdate: {
      partido_sigla: "UP",
      partido_atual: "Unidade Popular",
      cargo_disputado: "Governador",
      estado: "RJ",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      data_nascimento: "1989-10-15",
      naturalidade: "Rio de Janeiro (RJ)",
      formacao: "Ensino médio completo",
      profissao_declarada: "Educadora popular",
      foto_url: "https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/2045202024/190002135108/60011",
      biografia:
        "Juliete Pantoja é educadora popular, presidente estadual da Unidade Popular no Rio de Janeiro e militante do Movimento de Luta nos Bairros, Vilas e Favelas. Em abril de 2026, a UP lançou sua pré-candidatura ao governo do Rio de Janeiro, em cenário anterior às convenções partidárias e ao registro oficial de candidatura.",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "luan-monteiro",
    source:
      "Veja Rio, 2026-04-14, 'Saiba quem são os pré-candidatos ao governo do Rio em 2026' (https://vejario.abril.com.br/cidade/pre-candidatos-governo-rio-2026/) + TSE DivulgaCandContas 2024, Luan Monteiro Paschoal Pires, candidato a vereador no Rio de Janeiro (https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2024/60011/2045202024/candidato/190002346684) + TSE DivulgaCandContas 2022, Luan Monteiro Paschoal Pires, candidato a deputado estadual no Rio de Janeiro (https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2022/RJ/2040602022/candidato/190001717287)",
    candidateUpdate: {
      partido_sigla: "PCO",
      partido_atual: "Partido da Causa Operária",
      cargo_disputado: "Governador",
      estado: "RJ",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      data_nascimento: "1996-08-05",
      naturalidade: "Rio de Janeiro (RJ)",
      formacao: "Superior completo",
      profissao_declarada: "Jornalista e redator",
      foto_url: "https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/2045202024/190002346684/60011",
      biografia:
        "Luan Monteiro é jornalista, redator e filiado ao Partido da Causa Operária. Em abril de 2026, foi listado entre os pré-candidatos ao governo do Rio de Janeiro pelo PCO, em cenário anterior às convenções partidárias e ao registro oficial de candidatura.",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "william-siri",
    source:
      "Metrópoles, 2026-04-12, 'PSol oficializa pré-candidatura de William Siri ao governo do RJ' (https://www.metropoles.com/brasil/psol-oficializa-pre-candidatura-de-william-siri-ao-governo-do-rj) + Veja Rio, 2026-04-13, 'Saiba quem é o candidato do PSOL ao governo do Rio' (https://vejario.abril.com.br/cidade/candidato-psol-governo-rio/) + O Dia, 2026-04-12, 'PSOL define pré-candidatos ao governo do Rio e ao Senado' (https://odia.ig.com.br/rio-de-janeiro/2026/04/7235238-psol-define-pre-candidatos-ao-governo-do-rio-e-ao-senado.html) + TSE DivulgaCandContas 2024, candidatura 190002142537 (https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2024/60011/2045202024/candidato/190002142537) + Câmara Municipal do Rio de Janeiro, perfil de vereador William Siri (https://camara.rio/vereadores/william-siri) + UOL/TSE, resultado das eleições 2024 no Rio de Janeiro (https://noticias.uol.com.br/eleicoes/2024/10/06/rio-de-janeiro-rj-william-siri-psol-e-eleito-vereador-nas-eleicoes-2024-veja-votos.htm)",
    candidateUpdate: {
      partido_sigla: "PSOL",
      partido_atual: "Partido Socialismo e Liberdade",
      cargo_atual: "Vereador do Rio de Janeiro",
      cargo_disputado: "Governador",
      estado: "RJ",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      data_nascimento: "1992-08-08",
      naturalidade: "Rio de Janeiro (RJ)",
      formacao: "Superior completo",
      profissao_declarada: "Vereador e economista",
      foto_url: "https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/2045202024/190002142537/60011",
      biografia:
        "William Siri é vereador do Rio de Janeiro, economista e filiado ao Partido Socialismo e Liberdade. Em abril de 2026, o PSOL o escolheu como pré-candidato ao governo do Rio de Janeiro, em cenário anterior às convenções partidárias e ao registro oficial de candidatura.",
    },
    historicoFix: {
      cargo: "Vereador",
      periodo_inicio: 2025,
      periodo_fim: 2028,
      partido: "PSOL",
      estado: "RJ",
      eleito_por: "voto direto",
      observacoes:
        "Câmara Municipal do Rio de Janeiro lista William Siri entre os vereadores atuais; UOL/TSE registra sua eleição para vereador no Rio de Janeiro em 2024.",
      proveniencia: "misto",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "tulio-lopes",
    source:
      "Tribuna de Minas, 2026-03-18, 'A 200 dias das eleições, veja as primeiras pré-candidaturas a Governo e Senado por Minas Gerais' (https://tribunademinas.com.br/noticias/politica/18-03-2026/eleicoes-pre-candidatos.html) + Estado de Minas, 2026-05-15, 'Pré-candidatos ao governo de MG, Cleitinho e Gabriel Azevedo trocam afagos' (https://www.em.com.br/politica/2026/05/7420695-pre-candidatos-ao-governo-de-mg-cleitinho-e-gabriel-azevedo-trocam-afagos.html) + TSE DivulgaCandContas 2018, Túlio Cesar Dias Lopes, candidato a senador em Minas Gerais (https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2018/MG/2022802018/candidato/130000606639)",
    candidateUpdate: {
      partido_sigla: "PCB",
      partido_atual: "Partido Comunista Brasileiro",
      cargo_disputado: "Governador",
      estado: "MG",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      data_nascimento: "1982-06-08",
      naturalidade: "Belo Horizonte (MG)",
      formacao: "Superior completo",
      profissao_declarada: "Professor",
      foto_url: "https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/2022802018/130000606639/MG",
      biografia:
        "Túlio Lopes é professor, presidente da Associação de Docentes da Universidade do Estado de Minas Gerais e dirigente do Partido Comunista Brasileiro em Minas Gerais. Candidato ao governo de Minas Gerais em 2014 e ao Senado em 2018, foi listado em 2026 entre os pré-candidatos ao governo mineiro pelo PCB, em cenário anterior às convenções partidárias e ao registro oficial de candidatura.",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "joaquim-barbosa",
    source:
      "Democracia Cristã, 2026-05-20, 'Lideranças do nordeste apóiam Joaquim Barbosa como pré-candidato da DC a Presidência da Republica' (https://www.democraciacrista.org.br/liderancas-do-nordeste-apoiam-joaquim-barbosa-como-pre-candidato-da-dc-a-presidencia-da-republica/) + STF, 2014-07-31, 'Publicado hoje (31) decreto de aposentadoria do ministro Joaquim Barbosa' (https://noticias.stf.jus.br/postsnoticias/publicado-hoje-31-decreto-de-aposentadoria-do-ministro-joaquim-barbosa/) + Governo de Minas, 2012-10-11, 'Joaquim Barbosa, o filho ilustre de Paracatu e de Minas Gerais' (https://www.governo.mg.gov.br/Noticias/Detalhe/3330) + Wikimedia Commons, File:Joaquim_Barbosa.jpg (https://commons.wikimedia.org/wiki/File:Joaquim_Barbosa.jpg)",
    candidateUpdate: {
      partido_sigla: "DC",
      partido_atual: "Democracia Cristã",
      cargo_atual: "Ex-ministro do Supremo Tribunal Federal",
      cargo_disputado: "Presidente",
      estado: "BR",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      data_nascimento: "1954-10-07",
      naturalidade: "Paracatu (MG)",
      formacao: "Direito pela Universidade de Brasília; doutorado em Direito Público pela Universidade de Paris",
      profissao_declarada: "Jurista e ex-ministro do Supremo Tribunal Federal",
      foto_url: "https://commons.wikimedia.org/wiki/Special:FilePath/Joaquim_Barbosa.jpg",
      biografia:
        "Joaquim Benedito Barbosa Gomes é jurista, ex-procurador da República e ex-ministro do Supremo Tribunal Federal, corte que presidiu entre 2012 e 2014. Natural de Paracatu, em Minas Gerais, foi apresentado em maio de 2026 pela Democracia Cristã como pré-candidato à Presidência da República, em cenário anterior às convenções partidárias e ao registro oficial de candidatura.",
    },
    historicoFix: {
      cargo: "Ministro do Supremo Tribunal Federal",
      periodo_inicio: 2003,
      periodo_fim: 2014,
      estado: null,
      eleito_por: "nomeação",
      observacoes:
        "Nomeado ministro do Supremo Tribunal Federal em 2003, presidiu a Corte entre 2012 e 2014 e aposentou-se em 2014 (STF e Governo de Minas).",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "wanderlei-barbosa",
    source:
      "Jornal Opção Tocantins, 2026-03-31, 'Wanderlei Barbosa volta a negar candidatura em 2026 e diz que cumprirá mandato até janeiro de 2027' (https://tocantins.jornalopcao.com.br/bastidores/wanderlei-barbosa-volta-a-negar-candidatura-em-2026-e-diz-que-cumprira-mandato-ate-janeiro-de-2027-585278/) + Republicanos, perfil 'Wanderlei Barbosa' (https://republicanos10.org.br/quem_e_quem/wanderlei-barbosa/) + Folha/TSE 2022, ficha de candidato a governador no Tocantins (https://www1.folha.uol.com.br/poder/eleicoes/candidatos/2022/to/governador/wanderlei-barbosa-270001652198.shtml)",
    candidateUpdate: {
      partido_sigla: "REPUBLICANOS",
      partido_atual: "Republicanos",
      cargo_atual: "Governador do Tocantins",
      cargo_disputado: "Nenhum",
      estado: "TO",
      situacao_candidatura: null,
      status: "desistente",
      data_nascimento: "1964-03-12",
      naturalidade: "Porto Nacional (TO)",
      formacao: "Ensino médio completo",
      profissao_declarada: "Governador",
      foto_url: "https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/2040602022/270001652198/TO",
      biografia:
        "Wanderlei Barbosa Castro é governador do Tocantins e filiado ao Republicanos. Natural de Porto Nacional, iniciou a trajetória eletiva como vereador, foi deputado estadual, vice-governador eleito em 2018, assumiu o governo do estado em 2021/2022 e foi reeleito governador em 2022. Em março de 2026, afirmou que não disputará as eleições de 2026 e que cumprirá o mandato até 5 de janeiro de 2027.",
    },
    historicoFix: {
      cargo: "Governador",
      periodo_inicio: 2022,
      periodo_fim: null,
      partido: "REPUBLICANOS",
      estado: "TO",
      eleito_por: "voto direto",
      observacoes:
        "Governador do Tocantins desde 2021/2022 e reeleito em 2022; mandato informado até 5 de janeiro de 2027 (Republicanos, Folha/TSE 2022 e Jornal Opção Tocantins 2026-03-31).",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "jenilson-leite",
    source:
      "TSE DivulgaCandContas 2024, Janilson Lopes Leite, prefeito em Rio Branco (https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2024/01392/2045202024/candidato/10002171655) + Acre Agora/G1, 2024-08-02, 'PSB oficializa Jenilson Leite candidato a prefeito de Rio Branco' (https://acreagora.com/2024/08/02/psb-oficializa-jenilson-leite-candidato-a-prefeito-de-rio-branco/) + Notícias da Hora, 2026-04-06, 'Thor Dantas evita polemizar declarações de Jenilson sobre intervenção no PSB' (https://www.noticiasdahora.com.br/politica/thor-dantas-evita-polemizar-declaracoes-de-jenilson-sobre-intervencao-no-psb-e-diz-tenho-certeza-que-o-voto-dele-e-pra-gente.html) + Notícias da Hora, 2026-04-02, 'Após Thor Dantas assumir PSB, Jenilson Leite deve deixar o partido' (https://www.noticiasdahora.com.br/politica/apos-thor-dantas-assumir-psb-jenilson-leite-deve-deixar-o-partido-e-reclama-de-intervencao-de-jorge-viana.html)",
    candidateUpdate: {
      partido_sigla: "SEMPARTIDO",
      partido_atual: "Sem partido",
      cargo_atual: "Sem cargo público confirmado",
      estado: "AC",
      situacao_candidatura: null,
      status: "removido",
      publicavel: false,
      data_nascimento: "1978-01-02",
      naturalidade: "Tarauacá (AC)",
      formacao: "Superior completo",
      profissao_declarada: "Médico",
      foto_url: "https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/2045202024/10002171655/01392",
      biografia:
        "Janilson Lopes Leite, conhecido como Dr. Jenilson, é médico e ex-deputado estadual do Acre. Natural de Tarauacá, foi deputado estadual entre 2015 e 2022, disputou o Senado em 2022 e a Prefeitura de Rio Branco em 2024 pelo PSB. Em abril de 2026, após a chegada de Thor Dantas à presidência do PSB no Acre e sua apresentação como pré-candidato ao governo, Jenilson anunciou desfiliação do partido; este fix não afirma candidatura majoritária atual por falta de fonte forte.",
    },
    historicoFix: {
      cargo: "Deputado Estadual",
      periodo_inicio: 2015,
      periodo_fim: 2022,
      partido: "PSB",
      estado: "AC",
      eleito_por: "voto direto",
      observacoes:
        "Aleac registrava Jenilson Leite como deputado estadual em 2015; Folha do Acre 2022 informa despedida do parlamento após oito anos e dois mandatos.",
      proveniencia: "misto",
    },
    ensureTimelineRows: [
      {
        partido_anterior: "PC do B",
        partido_novo: "PSB",
        ano: 2019,
        data_mudanca: null,
        contexto:
          "Acre Agora/G1 2024 informa filiação ao PC do B de 1996 a 2019 e quadro do PSB desde 2019.",
      },
      {
        partido_anterior: "PSB",
        partido_novo: "SEMPARTIDO",
        ano: 2026,
        data_mudanca: null,
        contexto:
          "Notícias da Hora 2026-04-06 informou que Jenilson anunciou desfiliação do PSB; novo partido não foi comprovado neste sublote.",
      },
    ],
  },
  {
    slug: "breno-barcelar",
    source:
      "A Folha Online, 2026-04-23, '5 pré-candidatos ao governo do Espírito Santo' (https://afolhaonline.com/5-pre-candidatos-ao-governo-do-espirito-santo/)",
    candidateUpdate: {
      partido_sigla: "MISSAO",
      partido_atual: "Partido Missão",
      cargo_disputado: "Governador",
      estado: "ES",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      profissao_declarada: "Engenheiro civil",
      biografia:
        "Breno Barcelar é engenheiro civil ligado ao Partido Missão. Foi citado em abril de 2026 como pré-candidato ao governo do Espírito Santo, em cenário ainda anterior às convenções partidárias e ao registro oficial de candidatura.",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "sandro-alex",
    source:
      "Metrópoles, 2026-04-14, 'PR: Curi decide disputar Senado em chapa montada por Ratinho Jr.' (https://www.metropoles.com/brasil/pr-curi-decide-disputar-senado-em-chapa-montada-por-ratinho-jr) + Câmara dos Deputados Dados Abertos, deputado 160621 (https://dadosabertos.camara.leg.br/api/v2/deputados/160621) + TSE DivulgaCandContas 2022, candidatura 160001622302 (https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2022/PR/2040602022/candidato/160001622302)",
    candidateUpdate: {
      partido_sigla: "PSD",
      partido_atual: "Partido Social Democrático",
      cargo_atual: "Deputado federal",
      cargo_disputado: "Governador",
      estado: "PR",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      data_nascimento: "1972-11-25",
      naturalidade: "Ponta Grossa (PR)",
      formacao: "Superior completo",
      profissao_declarada: "Deputado",
      foto_url: "https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/2040602022/160001622302/PR",
      biografia:
        "Sandro Alex é deputado federal pelo Paraná e filiado ao Partido Social Democrático. Em abril de 2026, foi anunciado como pré-candidato ao governo do Paraná em chapa articulada pelo governador Ratinho Junior, em cenário anterior às convenções partidárias e ao registro oficial de candidatura.",
    },
    historicoFix: {
      cargo: "Deputado Federal",
      periodo_inicio: 2023,
      periodo_fim: 2027,
      partido: "PSD",
      estado: "PR",
      eleito_por: "voto direto",
      observacoes:
        "TSE DivulgaCandContas 2022 registra Sandro Alex eleito deputado federal pelo Paraná pelo PSD; Câmara dos Deputados Dados Abertos, deputado 160621, registra situação em exercício e condição eleitoral titular.",
      proveniencia: "misto",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "luiz-franca",
    source:
      "Folha de Londrina, 2025-11-03, 'À espera do Missão, MBL tem pré-candidato ao governo do Paraná' (https://www.folhadelondrina.com.br/politica/a-espera-do-missao-mbl-tem-pre-candidato-ao-governo-do-parana-3288479e.html) + O Presente, 2026-05-05, 'Missão, partido criado pelo MBL, confirma pré-candidatura de Luiz França ao Governo do Paraná' (https://www.opresente.com.br/politica/missao-partido-criado-pelo-mbl-confirma-pre-candidatura-de-luiz-franca-ao-governo-do-parana/) + Tribuna do Paraná, 2026-05-05, 'Luiz França é pré-candidato ao Governo do Paraná pelo Missão' (https://www.tribunapr.com.br/noticias/parana/luiz-franca-e-pre-candidato-ao-governo-do-parana-pelo-missao/)",
    candidateUpdate: {
      partido_sigla: "MISSAO",
      partido_atual: "Partido Missão",
      cargo_disputado: "Governador",
      estado: "PR",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      formacao: "Direito e Economia",
      naturalidade: "Cianorte (PR)",
      profissao_declarada: "Advogado e ativista",
      biografia:
        "Luiz França é advogado, ativista e filiado ao Partido Missão. Em maio de 2026, foi confirmado como pré-candidato ao governo do Paraná pela legenda ligada ao Movimento Brasil Livre, em sua primeira disputa eleitoral e em cenário anterior às convenções partidárias e ao registro oficial de candidatura.",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "isael-munduruku",
    source:
      "g1 AM, 2026-04-07, 'Veja quem são os pré-candidatos ao Governo e ao Senado no Amazonas' (https://g1.globo.com/am/amazonas/eleicoes/2026/noticia/2026/04/07/veja-quem-sao-os-pre-candidatos-ao-governo-e-ao-senado-no-amazonas.ghtml)",
    candidateUpdate: {
      partido_sigla: "REDE",
      partido_atual: "Rede Sustentabilidade",
      cargo_disputado: "Governador",
      estado: "AM",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      formacao: "Especialização em Direito Civil e Processo Civil",
      profissao_declarada: "Advogado",
      biografia:
        "Isael Munduruku é advogado e uma liderança indígena no Amazonas. É um dos fundadores do Parque das Tribos, em Manaus, e presidiu a Comissão de Direitos dos Povos Indígenas da OAB/AM. Em março de 2026, a Rede Sustentabilidade lançou seu nome para disputar o governo do Amazonas.",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "lais-chaud",
    source:
      "g1 SC, 2026-04-20, 'Quem são os pré-candidatos ao governo de Santa Catarina em 2026' (https://g1.globo.com/sc/santa-catarina/eleicoes/2026/noticia/2026/04/20/quem-sao-os-pre-candidatos-ao-governo-de-santa-catarina-em-2026.ghtml); UFSC Repositório Institucional / BDTD, 2024, dissertação de mestrado de Laís Paganelli Chaud em Psicologia (https://repositorio.ufsc.br/handle/123456789/260058)",
    candidateUpdate: {
      partido_sigla: "UP",
      partido_atual: "Unidade Popular",
      cargo_disputado: "Governador",
      estado: "SC",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      formacao: "Mestrado em Psicologia pela Universidade Federal de Santa Catarina",
      profissao_declarada: "Psicóloga",
      biografia:
        "Laís Chaud é psicóloga, praticante de capoeira e dirigente nacional do Movimento de Luta nos Bairros, Vilas e Favelas. Em abril de 2026, a Unidade Popular anunciou seu nome como pré-candidata ao governo de Santa Catarina.",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "lucio-flavio",
    source:
      "UFPB SIGAA docentes (https://sigaa.ufpb.br/sigaa/public/departamento/professores.jsf?id=1354) + Jornal da Paraíba, 2026-02-09, 'Eleições 2026: Olímpio Rocha entra na corrida para Governo da Paraíba pelo PSOL' (https://jornaldaparaiba.com.br/politica/conversa-politica/eleicoes-2026-olimpio-rocha-pre-candidato-governo-paraiba-psol) + Folha de S.Paulo, 2026-05-25, 'Veja quem são os pré-candidatos ao governo e Senado de cada estado' (https://www1.folha.uol.com.br/poder/2026/05/veja-quem-sao-os-pre-candidatos-ao-governo-e-ao-senado-em-cada-estado.shtml) + Fonte83, 2026-05-09, entrevista de Olímpio Rocha como pré-candidato ao Governo da Paraíba pelo PSOL (https://fonte83.com.br/politica/eleicoes-2026/olimpio-rocha-admite-debate-interno-no-psol-e-comenta-possivel-voto-em-veneziano-ao-senado-nas-eleicoes/)",
    candidateUpdate: {
      partido_sigla: "PSOL",
      partido_atual: "Partido Socialismo e Liberdade",
      cargo_atual: null,
      estado: "PB",
      situacao_candidatura: null,
      status: "removido",
      publicavel: false,
      formacao:
        "Graduação em História pela UFPB; mestrado em História Econômica e doutorado em História Social pela USP",
      profissao_declarada: "Professor de História",
      biografia:
        "Lúcio Flávio de Vasconcelos é professor de História da Universidade Federal da Paraíba. Tem graduação em História pela UFPB, mestrado em História Econômica e doutorado em História Social pela USP. Seu nome foi cogitado pelo PSOL na Paraíba, mas fontes de fevereiro a maio de 2026 passaram a apontar Olímpio Rocha como pré-candidato do partido ao governo estadual; este registro não afirma candidatura majoritária atual.",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "rafaell-milas",
    source:
      "HiperNotícias, 2026-05-10, 'Conheça os 11 pré-candidatos ao governo de Mato Grosso' (https://www.hnt.com.br/politica/conheca-os-11-pre-candidatos-ao-governo-de-mato-grosso/551783) + site do pré-candidato, 'História' (https://quemerafaellmilas.com.br/historia/) + Wikipédia/Wikimedia Commons, 'Rafaell Milas' (https://pt.wikipedia.org/wiki/Rafaell_Milas)",
    candidateUpdate: {
      partido_sigla: "MISSAO",
      partido_atual: "Partido Missão",
      cargo_disputado: "Governador",
      estado: "MT",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      data_nascimento: "1983-02-17",
      naturalidade: "Umuarama (PR)",
      formacao:
        "Direito em andamento na Faculdade Unic; formação em marketing político digital",
      profissao_declarada: "Publicitário, marqueteiro político e podcaster",
      foto_url: "https://upload.wikimedia.org/wikipedia/commons/3/33/Rafaell_Milas.png",
      biografia:
        "Rafaell Milas é publicitário, marqueteiro político e podcaster radicado em Cuiabá. Atua na interseção entre comunicação audiovisual e política, integra o MBL desde 2016 e preside o Partido Missão em Mato Grosso. Em 2026, lançou pré-candidatura ao governo do estado.",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "alex-pucineli",
    source:
      "Foco MT, 2026-03-26, 'Alex Pucineli se filia ao Democrata 35 e se coloca como pré-candidato ao governo de MT' (https://focomt.com.br/alex-pucineli-se-filia-ao-democrata-35-e-se-coloca-como-pre-candidato-ao-governo-de-mt/) + Única News, 2026-04-09, 'Empresário Alex Pucineli entra na corrida pelo Governo de MT com discurso liberal' (https://www.unicanews.com.br/politica/empresario-alex-pucineli-entra-na-corrida-pelo-governo-de-mt-com-discurso-liberal/135886) + TSE, 'Democrata' (https://www.tse.jus.br/partidos/partidos-registrados-no-tse/democrata) + TSE Dados Abertos, consulta_cand_2012, Alex Pedde Pucineli / Alex Pucineli, vereador em Cuiabá (MT), SQ_CANDIDATO 110000010149, nascimento em Cuiabá/MT (https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2012.zip) + TSE DivulgaCandContas 2012, imagem pública por SQ_CANDIDATO 110000010149 (https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/47/110000010149/90670)",
    candidateUpdate: {
      partido_sigla: "D35",
      partido_atual: "Democrata",
      cargo_disputado: "Governador",
      estado: "MT",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      data_nascimento: "1985-10-12",
      naturalidade: "Cuiabá/MT",
      formacao: "Superior completo",
      foto_url: "https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/47/110000010149/90670",
      profissao_declarada: "Empresário",
      biografia:
        "Alex Pucineli é empresário e filiado ao Democrata. Em 2026, passou a se apresentar como pré-candidato ao governo de Mato Grosso pelo Democrata 35, em cenário anterior às convenções partidárias e ao registro oficial de candidatura.",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "laudicerio-aguiar",
    source:
      "RDM Online, 2026-05-26, 'Sargento Laudicério lança pré-candidatura ao Governo de MT e diz que quer representar a realidade da população' (https://rdmonline.com.br/sargento-laudicerio-lanca-pre-candidatura-ao-governo-de-mt-e-diz-que-quer-representar-a-realidade-da-populacao/) + Leia MT, 2026-05-10, 'Conheça os 11 pré-candidatos ao governo de Mato Grosso' (https://leiamt.com.br/eleicoes-2026-conheca-os-11-pre-candidatos-ao-governo-de-mato-grosso/) + TSE DivulgaCandContas 2024, Laudicério Aguiar Machado, vereador em Cuiabá (https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2024/90670/2045202024/candidato/110002118851)",
    candidateUpdate: {
      partido_sigla: "AGIR",
      partido_atual: "Agir",
      cargo_disputado: "Governador",
      estado: "MT",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      data_nascimento: "1978-12-18",
      naturalidade: "Cuiabá (MT)",
      formacao: "Superior completo",
      profissao_declarada: "Sargento da Polícia Militar e cientista social",
      foto_url: "https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/2045202024/110002118851/90670",
      biografia:
        "Laudicério Aguiar Machado, conhecido como Sargento Laudicério, é sargento da Polícia Militar, cientista social e político de Mato Grosso, natural de Cuiabá. Em maio de 2026, confirmou pré-candidatura ao governo de Mato Grosso pelo Agir, em cenário anterior às convenções partidárias e ao registro oficial de candidatura.",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "jayme-campos",
    source:
      "Senado Federal, perfil do senador Jayme Campos (https://www25.senado.leg.br/web/senadores/senador/-/perfil/4531) + HiperNotícias, 2026-05-10, 'Conheça os 11 pré-candidatos ao governo de Mato Grosso' (https://www.hnt.com.br/politica/conheca-os-11-pre-candidatos-ao-governo-de-mato-grosso/551783) + Folha, 2026-05-25, lista de pré-candidatos por estado (https://www1.folha.uol.com.br/poder/2026/05/veja-quem-sao-os-pre-candidatos-ao-governo-e-ao-senado-em-cada-estado.shtml)",
    candidateUpdate: {
      partido_sigla: "UNIAO",
      partido_atual: "União Brasil",
      cargo_atual: "Senador",
      cargo_disputado: "Governador",
      estado: "MT",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      data_nascimento: "1951-09-13",
      naturalidade: "Várzea Grande (MT)",
      formacao: "Ensino médio completo",
      profissao_declarada: "Empresário e agropecuarista",
      foto_url: "https://www.senado.leg.br/senadores/img/fotos-oficiais/senador4531.jpg",
      biografia:
        "Jayme Campos é empresário, agropecuarista e senador por Mato Grosso, filiado ao União Brasil. Foi prefeito de Várzea Grande, governador de Mato Grosso e exerce mandato no Senado. Em 2026, foi listado entre os pré-candidatos ao governo de Mato Grosso, em cenário ainda anterior às convenções partidárias e ao registro oficial de candidatura.",
    },
    historicoFix: {
      cargo: "Senador",
      periodo_inicio: 2019,
      periodo_fim: 2027,
      partido: "DEM",
      estado: "MT",
      eleito_por: "voto direto",
      observacoes:
        "TSE DivulgaCandContas 2018 registra Jayme Campos eleito senador por Mato Grosso; perfil do Senado Federal lista Jayme Campos como senador em exercício.",
      proveniencia: "misto",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "magno-malta",
    source:
      "Senado Federal, perfil do senador Magno Malta (https://www25.senado.leg.br/web/senadores/senador/-/perfil/631) + TSE Dados Abertos, consulta_cand_2022_ES.csv, Magno Pereira Malta / Magno Malta, senador ES, SQ_CANDIDATO 80001720164, grau de instrução SUPERIOR COMPLETO (https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2022.zip) + G1, 2026-05-02, 'Eleição de governadores: veja como estão as disputas em 11 estados, segundo a Quaest' (https://g1.globo.com/politica/eleicoes/2026/noticia/2026/05/02/eleicao-de-governadores-11-estados-quaest.ghtml) + A Folha Online, 2026-04-23, '5 pré-candidatos ao governo do Espírito Santo' (https://afolhaonline.com/5-pre-candidatos-ao-governo-do-espirito-santo/)",
    candidateUpdate: {
      partido_sigla: "PL",
      partido_atual: "Partido Liberal",
      cargo_atual: "Senador",
      cargo_disputado: "Governador",
      estado: "ES",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      data_nascimento: "1957-10-16",
      naturalidade: "Macarani (BA)",
      formacao: "Superior completo",
      foto_url: "https://www.senado.leg.br/senadores/img/fotos-oficiais/senador631.jpg",
      biografia:
        "Magno Malta é senador pelo Espírito Santo, filiado ao Partido Liberal. O perfil do Senado informa mandato no período 2023-2031. Em 2026, foi citado em cobertura eleitoral e pesquisa como nome do PL no cenário para o governo do Espírito Santo, em fase anterior às convenções partidárias e ao registro oficial de candidatura.",
    },
    historicoFix: {
      cargo: "Senador",
      periodo_inicio: 2023,
      periodo_fim: null,
      partido: "PL",
      estado: "ES",
      eleito_por: "voto direto",
      observacoes:
        "Perfil do Senado Federal registra Magno Malta como senador pelo Espírito Santo no período 2023-2031.",
      proveniencia: "manual",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "gelson-merisio",
    source:
      "g1 SC, 2026-04-20, 'Quem são os pré-candidatos ao governo de Santa Catarina em 2026' (https://g1.globo.com/sc/santa-catarina/eleicoes/2026/noticia/2026/04/20/quem-sao-os-pre-candidatos-ao-governo-de-santa-catarina-em-2026.ghtml) + Memória Política de Santa Catarina/ALESC, biografia de Gelson Merisio (https://memoriapolitica.alesc.sc.gov.br/biografia/1-Gelson_Merisio)",
    candidateUpdate: {
      partido_sigla: "PSB",
      partido_atual: "Partido Socialista Brasileiro",
      cargo_disputado: "Governador",
      estado: "SC",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      data_nascimento: "1966-01-31",
      naturalidade: "Xaxim (SC)",
      formacao: "Administração de Empresas pela Unoesc",
      profissao_declarada: "Empresário",
      foto_url: "https://memoriapolitica.alesc.sc.gov.br/uploads/biografia/foto/thumb/card/deputadoMerisio.jpg",
      biografia:
        "Gelson Merisio é empresário e político catarinense, filiado ao Partido Socialista Brasileiro. Foi vereador em Xanxerê, deputado estadual, presidente da Assembleia Legislativa de Santa Catarina e governador interino. Em abril de 2026, anunciou pré-candidatura ao governo de Santa Catarina pelo PSB, em fase anterior às convenções partidárias e ao registro oficial de candidatura.",
    },
    historicoFix: {
      cargo: "Deputado Estadual",
      periodo_inicio: 2005,
      periodo_fim: 2019,
      partido: null,
      estado: "SC",
      eleito_por: "voto direto/suplência",
      observacoes:
        "Memória Política de Santa Catarina/ALESC registra passagens de Gelson Merisio na Assembleia nas 15ª, 16ª, 17ª e 18ª Legislaturas, de 2005 a 2019, incluindo posse por convocação em 2004 e mandatos eletivos posteriores.",
      proveniencia: "manual",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "caiubi-kuhn",
    source:
      "HiperNotícias, 2026-05-10, 'Conheça os 11 pré-candidatos ao governo de Mato Grosso' (https://www.hnt.com.br/politica/conheca-os-11-pre-candidatos-ao-governo-de-mato-grosso/551783) + TSE DivulgaCandContas 2024, Caiubi Emanuel Souza Kuhn, vereador em Cuiabá (https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2024/90670/2045202024/candidato/110002246420) + Centro-Oeste Popular, 2024-08-13, 'Renovação com Experiência: Pré-candidato a vereador defende educação e inclusão ao trabalho como soluções para mudança expressiva em Cuiabá' (https://www.copopular.com.br/politica/renovacao-com-experiencia-pre-candidato-a-vereador-defende-educacao-e-inclusao-ao-trabalho-como-solucoes-para-mudanca-expressiva-em-cuiaba/212884)",
    candidateUpdate: {
      partido_sigla: "PDT",
      partido_atual: "Partido Democrático Trabalhista",
      cargo_disputado: "Governador",
      estado: "MT",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      data_nascimento: "1990-04-05",
      naturalidade: "Chapada dos Guimarães (MT)",
      formacao:
        "Especialização em Gestão Pública e mestrado em Geociências pela UFMT; doutorado em Geociências e Meio Ambiente pela Unesp",
      profissao_declarada: "Geólogo e professor",
      foto_url: "https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/2045202024/110002246420/90670",
      biografia:
        "Caiubi Kuhn é geólogo e professor da Universidade Federal de Mato Grosso, filiado ao Partido Democrático Trabalhista. Em maio de 2026, foi listado como pré-candidato ao governo de Mato Grosso pelo PDT, em cenário anterior às convenções partidárias e ao registro oficial de candidatura.",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "marcelo-maluf",
    source:
      "HiperNotícias, 2026-05-10, 'Conheça os 11 pré-candidatos ao governo de Mato Grosso' (https://www.hnt.com.br/politica/conheca-os-11-pre-candidatos-ao-governo-de-mato-grosso/551783) + TSE Dados Abertos, consulta_cand_2014, Marcelo Benedito Maluf / Marcelo Maluf, 1º suplente em Mato Grosso, SQ_CANDIDATO 110000000004, data de nascimento e escolaridade declarada (https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2014.zip) + Olhar Direto, 2014-07-17, 'Suplente mais rico declara à Justiça Eleitoral R$ 13 mi em imóveis, empresas, joias e depósitos' (https://www.olhardireto.com.br/noticias/exibir.asp?id=371761&noticia=suplente-mais-rico-declara-a-justica-eleitoral-r-13-mi-em-imoveis-empresas-joias-e-depositos) + TSE DivulgaCandContas 2014, candidatura 110000000004 em Mato Grosso, foto pública e naturalidade MT-CUIABÁ (https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2014/MT/680/candidato/110000000004)",
    candidateUpdate: {
      partido_sigla: "NOVO",
      partido_atual: "Partido Novo",
      cargo_disputado: "Governador",
      estado: "MT",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      data_nascimento: "1959-02-14",
      naturalidade: "Cuiabá (MT)",
      formacao: "Ensino médio completo",
      profissao_declarada: "Empresário",
      foto_url: "https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/680/110000000004/MT",
      biografia:
        "Marcelo Benedito Maluf é empresário e fundador do Grupo São Benedito, filiado ao Partido Novo. Em maio de 2026, foi listado como pré-candidato ao governo de Mato Grosso pelo Novo, em cenário anterior às convenções partidárias e ao registro oficial de candidatura.",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "mauricio-tonha",
    source:
      "HiperNotícias, 2026-05-10, 'Conheça os 11 pré-candidatos ao governo de Mato Grosso' (https://www.hnt.com.br/politica/conheca-os-11-pre-candidatos-ao-governo-de-mato-grosso/551783) + TSE Dados Abertos, consulta_cand_2008, Mauricio Cardoso Tonhá / Mauricio, prefeito eleito em Água Boa (MT), SQ_CANDIDATO 3028, nascimento em Santana/BA (https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2008.zip) + TSE Dados Abertos, consulta_cand_2020, Mauricio Cardoso Tonha / Mauricio, candidato a prefeito em Água Boa (MT), SQ_CANDIDATO 110001033922, data de nascimento e escolaridade declarada (https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2020.zip) + TSE DivulgaCandContas 2020, candidatura 110001033922 em Água Boa (MT), foto pública e naturalidade BA-SANTANA (https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2020/91910/2030402020/candidato/110001033922)",
    candidateUpdate: {
      partido_sigla: "DC",
      partido_atual: "Democracia Cristã",
      cargo_disputado: "Governador",
      estado: "MT",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      data_nascimento: "1962-08-17",
      naturalidade: "Santana/BA",
      formacao: "Ensino médio completo",
      profissao_declarada: "Empresário",
      foto_url: "https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/2030402020/110001033922/91910",
      biografia:
        "Maurício Tonhá é empresário e presidente da Estância Bahia Leilões. Em maio de 2026, foi listado como pré-candidato ao governo de Mato Grosso pela Democracia Cristã, em cenário anterior às convenções partidárias e ao registro oficial de candidatura.",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "mauricio-coelho",
    source:
      "HiperNotícias, 2026-05-10, 'Conheça os 11 pré-candidatos ao governo de Mato Grosso' (https://www.hnt.com.br/politica/conheca-os-11-pre-candidatos-ao-governo-de-mato-grosso/551783) + TSE Dados Abertos, consulta_cand_2012, Mauricio Coelho Ribeiro da Silva / Mauricio Coelho, vereador em Pontal do Araguaia (MT), SQ_CANDIDATO 110000010928, nascimento em Aragarças/GO (https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2012.zip) + TSE Dados Abertos, consulta_cand_2020, Mauricio Coelho Ribeiro da Silva / Maurício Coelho, vereador em Pontal do Araguaia (MT), SQ_CANDIDATO 110000951550, data de nascimento confirmada (https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2020.zip) + TSE DivulgaCandContas 2020, candidatura 110000951550 em Pontal do Araguaia (MT), foto pública e naturalidade GO-ARAGARÇAS (https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2020/90700/2030402020/candidato/110000951550)",
    candidateUpdate: {
      partido_sigla: "MOBILIZA",
      partido_atual: "Mobiliza",
      cargo_disputado: "Governador",
      estado: "MT",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      data_nascimento: "1974-10-05",
      naturalidade: "Aragarças/GO",
      formacao:
        "Ciências Econômicas pela Universidade Federal de Ouro Preto (UFOP)",
      profissao_declarada: "Empresário e comunicador",
      foto_url: "https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/2030402020/110000951550/90700",
      biografia:
        "Maurício Coelho Ribeiro da Silva é empresário, presidente do Instituto Brasil Cooperado e comunicador. Em maio de 2026, foi listado como pré-candidato ao governo de Mato Grosso pelo Mobiliza, em cenário anterior às convenções partidárias e ao registro oficial de candidatura.",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "toni-rodrigues",
    source:
      "GP1, 2025-08-22, 'PL anuncia pré-candidatura do jornalista Toni Rodrigues ao Governo do Piauí em 2026' (https://www.gp1.com.br/politica/noticia/2025/8/22/pl-anuncia-pre-candidatura-do-jornalista-toni-rodrigues-ao-governo-do-piaui-em-2026-602079.html) + GP1, 2026-05-22, 'Partido Liberal apresenta nomes dos pré-candidatos para as eleições no Piauí' (https://www.gp1.com.br/eleicoes-2026/amp/noticia/2026/5/22/partido-liberal-apresenta-nomes-dos-pre-candidatos-para-as-eleicoes-no-piaui-623508.html) + TSE Dados Abertos, consulta_cand_2008, Antonio Francisco Rodrigues / Toni Rodrigues, vereador em Altos (PI), naturalidade PI-PIRIPIRI (https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2008.zip) + TSE Dados Abertos, consulta_cand_2012, Antonio Francisco Rodrigues / Toni Rodrigues, vereador em Altos (PI), resultado ELEITO POR QP e naturalidade PI-ALTOS (https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2012.zip) + TSE Dados Abertos, consulta_cand_2016, Antonio Francisco Rodrigues / Toni Rodrigues, vereador em Altos (PI), resultado SUPLENTE e naturalidade PI-PIRIPIRI (https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2016.zip) + TSE DivulgaCandContas 2016, candidatura 180000004911 em Altos (PI), foto pública e dados básicos (https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2016/10073/2/candidato/180000004911) + 180graus, 2025-05-16, 'Helder Eugênio recebe o jornalista, radialista e escritor Toni Rodrigues', perfil biográfico informa natural de Piripiri e criado em Altos (https://180graus.com/analise-politica/helder-eugenio-recebe-o-jornalista-radialista-e-escritor-toni-rodrigues/)",
    candidateUpdate: {
      partido_sigla: "PL",
      partido_atual: "Partido Liberal",
      cargo_disputado: "Governador",
      estado: "PI",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      data_nascimento: "1967-06-08",
      formacao: "Superior completo",
      profissao_declarada: "Jornalista, radialista e escritor",
      naturalidade: "Piripiri (PI)",
      foto_url:
        "https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/2/180000004911/10073",
      biografia:
        "Toni Rodrigues é jornalista, radialista, escritor e ex-vereador de Altos, filiado ao Partido Liberal. Em 2026, foi anunciado como pré-candidato ao governo do Piauí pelo PL, em cenário anterior às convenções partidárias e ao registro oficial de candidatura.",
    },
    historicoFix: {
      cargo: "Vereador",
      periodo_inicio: 2013,
      periodo_fim: 2016,
      partido: "PTB",
      estado: "PI",
      eleito_por: "voto direto",
      observacoes:
        "TSE Dados Abertos consulta_cand_2012 registra Antonio Francisco Rodrigues / Toni Rodrigues eleito vereador em Altos (PI) pelo PTB em 2012; consulta_cand_2016 registra candidatura a vereador em Altos (PI) como suplente.",
      proveniencia: "tse",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "tonny-kerley",
    source:
      "Portal AZ, 2026-04-28, 'Pré-candidatos ao governo do Piauí em 2026' (https://www.portalaz.com.br/galeria/pre-candidatos-ao-governo-do-piaui-em-2026/) + GP1, 2023-10-15, 'Partido Novo lança pré-candidato a prefeito de Teresina em 2024' (https://www.gp1.com.br/eleicoes-2024/noticia/2023/10/15/partido-novo-lanca-pre-candidato-a-prefeito-de-teresina-em-2024-557772.html) + Partido Novo, 2023-11-03, 'NOVO anuncia pré-candidato à prefeitura de Teresina' (https://novo.org.br/noticias/novo-anuncia-pre-candidato-a-prefeitura-de-teresina/) + TSE DivulgaCandContas 2024, candidatura 180001885637 em Teresina (https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2024/12190/2045202024/candidato/180001885637)",
    candidateUpdate: {
      partido_sigla: "NOVO",
      partido_atual: "Partido Novo",
      cargo_disputado: "Governador",
      estado: "PI",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      data_nascimento: "1989-02-11",
      naturalidade: "Marcolândia (PI)",
      formacao: "Doutorado pela COPPEAD/UFRJ",
      profissao_declarada: "Economista, administrador e professor universitário",
      foto_url: "https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/2045202024/180001885637/12190",
      biografia:
        "Tonny Kerley é economista, administrador, professor universitário e filiado ao Partido Novo. Em abril de 2026, foi listado pelo Portal AZ entre os pré-candidatos ao governo do Piauí pelo Novo, em cenário anterior às convenções partidárias e ao registro oficial de candidatura.",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "lourdes-melo",
    source:
      "Central Piauí, 2026-04, 'Eleições 2026: veja quem são os pré-candidatos ao governo do Piauí' (https://centralpiaui.com.br/noticias/politica/eleicoes-2026-veja-quem-sao-os-pre-candidatos-ao-governo-do-piaui-16580.html) + GP1, 2026-04-13, 'Instituto GP1: Rafael Fonteles tem 51,7%, Joel Rodrigues 15,1%, Toni Rodrigues 1,6% e Mainha 1,4%' (https://www.gp1.com.br/eleicoes-2026/amp/noticia/2026/4/13/instituto-gp1-rafael-fonteles-tem-517-joel-rodrigues-151-toni-rodrigues-16-e-mainha-14-620593.html) + Teresina FM, 2026-02-03, 'Pesquisa Atlas: Rafael Fonteles lidera em todos os cenários' (https://www.teresinafm.com.br/politica/2026/02/03/pesquisa-atlas-rafael-fonteles-lidera-em-todos-os-cenarios/) + PCO, perfil eleitoral de Lourdes Mello (https://candidatos.pco.org.br/candidatos/lourdes-mello/) + TSE DivulgaCandContas 2024, candidatura 180002337603 em Teresina (https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2024/12190/2045202024/candidato/180002337603)",
    candidateUpdate: {
      partido_sigla: "PCO",
      partido_atual: "Partido da Causa Operária",
      cargo_disputado: "Governador",
      estado: "PI",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      data_nascimento: "1953-06-12",
      naturalidade: "Pedreiras (MA)",
      formacao: "Superior completo",
      profissao_declarada: "Professora",
      foto_url: "https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/2045202024/180002337603/12190",
      biografia:
        "Lourdes Melo é professora aposentada e militante sindical ligada ao Partido da Causa Operária no Piauí. Em 2026, foi listada como pré-candidata ao governo do Piauí pelo PCO, em cenário anterior às convenções partidárias e ao registro oficial de candidatura.",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "lucia-santos",
    source:
      "GP1, 2026-04-13, 'Instituto GP1: Rafael Fonteles tem 51,7%, Joel Rodrigues 15,1%, Toni Rodrigues 1,6% e Mainha 1,4%' (https://www.gp1.com.br/eleicoes-2026/amp/noticia/2026/4/13/instituto-gp1-rafael-fonteles-tem-517-joel-rodrigues-151-toni-rodrigues-16-e-mainha-14-620593.html) + Central Piauí, 2026-04-09, 'Eleições 2026: veja quem são os pré-candidatos ao Governo do Piauí' (https://centralpiaui.com.br/noticias/politica/eleicoes-2026-veja-quem-sao-os-pre-candidatos-ao-governo-do-piaui-16580.html) + Folha de S.Paulo, 2026-05-25, lista de pré-candidatos por estado (https://www1.folha.uol.com.br/poder/2026/05/veja-quem-sao-os-pre-candidatos-ao-governo-e-ao-senado-em-cada-estado.shtml) + TSE Dados Abertos, consulta_cand_2018, Lúcia Maria de Sousa Aguiar dos Santos / Dra. Lúcia Santos, deputada federal no Piauí, SQ_CANDIDATO 180000604119, data de nascimento e escolaridade declarada (https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2018.zip) + TSE Dados Abertos, consulta_cand_2020, Lucia Maria de Sousa Aguiar dos Santos / Dra. Lucia Santos, vereadora em Teresina (PI), SQ_CANDIDATO 180001057808, data de nascimento e escolaridade confirmadas (https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2020.zip) + TSE DivulgaCandContas 2018/2020, candidaturas 180000604119 e 180001057808, naturalidade Teresina (PI) e foto pública (https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2018/PI/2022802018/candidato/180000604119 e https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2020/12190/2030402020/candidato/180001057808)",
    candidateUpdate: {
      partido_sigla: "PSDB",
      partido_atual: "Partido da Social Democracia Brasileira",
      cargo_disputado: "Governador",
      estado: "PI",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      data_nascimento: "1964-11-03",
      naturalidade: "Teresina (PI)",
      formacao: "Superior completo",
      profissao_declarada: "Médica",
      foto_url: "https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/2030402020/180001057808/12190",
      biografia:
        "Lúcia Santos é médica e política do Piauí, filiada ao Partido da Social Democracia Brasileira. Em 2026, foi listada como pré-candidata ao governo do Piauí pelo PSDB, em cenário anterior às convenções partidárias e ao registro oficial de candidatura.",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "mainha",
    source:
      "GP1, 2026-04-13, 'Instituto GP1: Rafael Fonteles tem 51,7%, Joel Rodrigues 15,1%, Toni Rodrigues 1,6% e Mainha 1,4%' (https://www.gp1.com.br/eleicoes-2026/amp/noticia/2026/4/13/instituto-gp1-rafael-fonteles-tem-517-joel-rodrigues-151-toni-rodrigues-16-e-mainha-14-620593.html) + Central Piauí, 2026-04-09, 'Eleições 2026: veja quem são os pré-candidatos ao Governo do Piauí' (https://centralpiaui.com.br/noticias/politica/eleicoes-2026-veja-quem-sao-os-pre-candidatos-ao-governo-do-piaui-16580.html) + Câmara dos Deputados, perfil e biografia de Maia Filho (https://www.camara.leg.br/deputados/151965 e https://www.camara.leg.br/deputados/151965/biografia)",
    candidateUpdate: {
      partido_sigla: "PODE",
      partido_atual: "Podemos",
      cargo_disputado: "Governador",
      estado: "PI",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      data_nascimento: "1974-07-31",
      naturalidade: "Picos (PI)",
      formacao: "Escolaridade superior",
      profissao_declarada: "Empresário",
      foto_url: "https://www.camara.leg.br/internet/deputado/bandep/151965.jpg",
      biografia:
        "José de Andrade Maia Filho, conhecido como Mainha, é empresário e político piauiense, natural de Picos, filiado ao Podemos. Foi prefeito de Itainópolis e deputado federal pelo Piauí. Em 2026, foi listado como pré-candidato ao governo do Piauí pelo Podemos, em cenário anterior às convenções partidárias e ao registro oficial de candidatura.",
    },
    historicoFix: {
      cargo: "Deputado Federal",
      periodo_inicio: 2015,
      periodo_fim: 2019,
      partido: "SD",
      estado: "PI",
      eleito_por: "suplência/efetivação",
      observacoes:
        "Biografia da Câmara dos Deputados registra Maia Filho como deputado federal pelo Piauí na legislatura 2015-2019, com posse como suplente em 12/05/2015.",
      proveniencia: "manual",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "jose-roberto-arruda",
    source:
      "Senado Federal, perfil de José Roberto Arruda (https://www25.senado.leg.br/pt_BR/web/senadores/senador/-/perfil/46) + O Brasiliense, 2026-05, 'Eleições 2026: quem são os nomes colocados na disputa pelo Governo do Distrito Federal' (https://obrasiliense.com.br/eleicoes-2026-quem-sao-os-nomes-colocados-na-disputa-pelo-governo-do-distrito-federal/) + Folha de S.Paulo, 2026-05-25, lista de pré-candidatos por estado (https://www1.folha.uol.com.br/poder/2026/05/veja-quem-sao-os-pre-candidatos-ao-governo-e-ao-senado-em-cada-estado.shtml)",
    candidateUpdate: {
      partido_sigla: "PSD",
      partido_atual: "Partido Social Democrático",
      cargo_disputado: "Governador",
      estado: "DF",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      data_nascimento: "1954-01-05",
      naturalidade: "Itajubá (MG)",
      formacao:
        "Engenharia Elétrica pela Escola Federal de Engenharia de Itajubá; pós-graduação em Administração Pública; especialização em Engenharia de Segurança em Barcelona",
      profissao_declarada: "Engenheiro",
      foto_url: "https://www.senado.leg.br/senadores/img/fotos-oficiais/senador46.jpg",
      biografia:
        "José Roberto Arruda é engenheiro e político do Distrito Federal, filiado ao Partido Social Democrático. Foi senador pelo Distrito Federal e governador do Distrito Federal. Em 2026, foi listado como pré-candidato ao governo do Distrito Federal pelo PSD, em cenário anterior às convenções partidárias e ao registro oficial de candidatura.",
    },
    historicoFix: {
      cargo: "Senador",
      periodo_inicio: 1995,
      periodo_fim: 2001,
      partido: "PSDB",
      estado: "DF",
      eleito_por: "voto direto",
      observacoes:
        "Perfil do Senado Federal registra José Roberto Arruda como senador pelo Distrito Federal nas 50ª e 51ª Legislaturas, com exercício entre 1995 e 2001.",
      proveniencia: "manual",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "luiz-carlos-teodoro",
    source:
      "Eu Ideal, 2026-04-13, 'PSOL confirma Luiz Carlos Teodoro como pré-candidato ao governo de Rondônia' (https://www.euideal.com/noticia/59864/porto-velho/politica/psol-confirma-luiz-carlos-teodoro-como-pre-candidato-ao-governo-de-rondonia.html) + Rondo Notícias, 2026-05-13, 'Seis nomes entram no tabuleiro e três acirram corrida pelo Governo de Rondônia em 2026' (https://rondonoticias.com.br/noticia/politica/155891/seis-nomes-entram-no-tabuleiro-e-tres-acirram-corrida-pelo-governo-de-rondonia-em-2026) + Mídia Rondônia, 2026-05-05, 'De engraxate a pré-candidato ao governo de RO pelo PSOL' (https://midiarondonia.com.br/05/05/2026/de-engraxate-a-pre-candidato-ao-governo-de-ro-pelo-psol/) + TSE Dados Abertos, consulta_cand_2020, Luiz Carlos Teodoro / Luiz Neguinho, vice-prefeito em Guajará-Mirim (RO), SQ_CANDIDATO 220000977509, data de nascimento confirmada (https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2020.zip) + Câmara Municipal de Guajará-Mirim, Moção 0030/2023, Luiz Carlos Teodoro nascido em Medianeira, Paraná (https://sapl.guajaramirim.ro.leg.br/media/sapl/public/materialegislativa/2023/4040/cmgm_mocao-30.pdf) + TSE DivulgaCandContas 2020, candidatura 220000977509 em Guajará-Mirim (RO), foto pública e naturalidade PR-MEDIANEIRA (https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2020/00019/2030402020/candidato/220000977509)",
    candidateUpdate: {
      partido_sigla: "PSOL",
      partido_atual: "Partido Socialismo e Liberdade",
      cargo_disputado: "Governador",
      estado: "RO",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      data_nascimento: "1977-04-18",
      naturalidade: "Medianeira (PR)",
      formacao: "Graduação em Direito",
      profissao_declarada: "Advogado",
      foto_url: "https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/2030402020/220000977509/00019",
      biografia:
        "Luiz Carlos Teodoro é advogado e ativista na área de direitos humanos, filiado ao Partido Socialismo e Liberdade em Rondônia. Preside a Comissão de Direitos Humanos da OAB-RO desde outubro de 2023 e teve o nome oficializado pelo PSOL como pré-candidato ao governo de Rondônia em 2026, em cenário anterior às convenções partidárias e ao registro oficial de candidatura.",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "samuel-costa",
    source:
      "Rondônia Dinâmica, 2026-04-17, 'Samuel Costa pré-candidato ao Governo pelo PSB cobra reconhecimento a investimentos federais em Rondônia' (https://www.rondoniadinamica.com/noticias/2026/04/samuel-costa-pre-candidato-ao-governo-pelo-psb-cobra-reconhecimento-a-investimentos-federais-em-rondonia%2C242690.shtml) + Rondo Notícias, 2026-05-13, 'Seis nomes entram no tabuleiro e três acirram corrida pelo Governo de Rondônia em 2026' (https://rondonoticias.com.br/noticia/politica/155891/seis-nomes-entram-no-tabuleiro-e-tres-acirram-corrida-pelo-governo-de-rondonia-em-2026) + Eu Ideal, 2026-05-13, 'De subestimado a protagonista: Samuel Costa reorganiza o PSB e entra no jogo de 2026' (https://www.euideal.com/noticia/60663/porto-velho/politica/de-subestimado-a-protagonista-samuel-costa-reorganiza-o-psb-e-entra-no-jogo-de-2026.html) + Informa Rondônia, 2026-04-18, '#01 - RD ENTREVISTA - Samuel Costa' (https://informarondonia.com.br/rd_samuel_costa_psb_precandidato_ao_governo_de_rondonia/) + TSE DivulgaCandContas 2024, candidatura 220002330987 em Porto Velho (https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2024/00035/2045202024/candidato/220002330987)",
    candidateUpdate: {
      partido_sigla: "PSB",
      partido_atual: "Partido Socialista Brasileiro",
      cargo_disputado: "Governador",
      estado: "RO",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      data_nascimento: "1989-12-10",
      naturalidade: "Porto Velho (RO)",
      formacao: "Superior completo",
      profissao_declarada: "Advogado",
      foto_url: "https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/2045202024/220002330987/00035",
      biografia:
        "Samuel Costa Menezes é advogado e filiado ao Partido Socialista Brasileiro em Rondônia. Em 2026, foi anunciado como pré-candidato ao governo de Rondônia pelo PSB, em cenário anterior às convenções partidárias e ao registro oficial de candidatura.",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "ralf-zimmer",
    source:
      "g1 SC, 2026-04-20, 'Quem são os pré-candidatos ao governo de Santa Catarina em 2026' (https://g1.globo.com/sc/santa-catarina/eleicoes/2026/noticia/2026/04/20/quem-sao-os-pre-candidatos-ao-governo-de-santa-catarina-em-2026.ghtml) + TSE, 'Partido Renovação Democrática (PRD)' (https://www.tse.jus.br/partidos/partidos-registrados-no-tse/partido-renovacao-democratica-prd) + TSE DivulgaCandContas 2022, candidatura 240001611148 em Santa Catarina (https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2022/SC/2040602022/candidato/240001611148)",
    candidateUpdate: {
      partido_sigla: "PRD",
      partido_atual: "Partido Renovação Democrática",
      cargo_disputado: "Governador",
      estado: "SC",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      data_nascimento: "1979-05-28",
      naturalidade: "Chapecó (SC)",
      formacao: "Superior completo",
      profissao_declarada: "Defensor público",
      foto_url: "https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/2040602022/240001611148/SC",
      biografia:
        "Ralf Guimarães Zimmer Junior é defensor público e filiado ao Partido Renovação Democrática. Em abril de 2026, foi listado como pré-candidato ao governo de Santa Catarina pela Federação Renovação Solidária, formada por PRD e Solidariedade. Também concorreu ao governo catarinense em 2022 pelo PROS.",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "eduardo-braide",
    source: "TSE + G1 Maranhão (reeleição 2024) + curadoria 13.csv",
    candidateUpdate: {
      partido_sigla: "PSD",
      partido_atual: "Partido Social Democrático",
      cargo_atual: "Prefeito de São Luís",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      biografia:
        "Eduardo Costa Braide é advogado e político brasileiro, filiado ao Partido Social Democrático (PSD). Foi deputado estadual e deputado federal pelo Maranhão e é prefeito de São Luís, reeleito em 2024 para mandato até 2028. Há articulação ligada ao pleito ao governo do estado em 2026, sem registro deferido no TSE na data de curadoria.",
    },
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 2025,
      periodo_fim: null,
      partido: "PSD",
      estado: "MA",
      eleito_por: "voto direto",
      observacoes: "Mandato após reeleição em 2024 (TSE + G1; curadoria 13.csv)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "eduardo-braide",
    source: "TSE (mandatos municipais anteriores)",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 2021,
      periodo_fim: 2024,
      partido: "PODEMOS",
      estado: "MA",
      eleito_por: "voto direto",
      observacoes: "Primeiro mandato na Prefeitura de São Luís (Podemos/PSD conforme registros públicos; TSE)",
    },
  },
  {
    slug: "eduardo-braide",
    source: "Câmara dos Deputados / TSE — curadoria S15.3 lote 4",
    candidateUpdate: {},
    deleteHistoricoRows: [
      {
        cargo: "Deputado Federal",
        periodo_inicio: 2015,
        tipo_evento: "mandato",
        observacoes_includes: "PMN/PODE",
      },
    ],
  },
  {
    slug: "eduardo-braide",
    source: "Assembleia Legislativa do MA / TSE",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Deputado Estadual",
      periodo_inicio: 2007,
      periodo_fim: 2015,
      partido: "PMN",
      estado: "MA",
      eleito_por: "voto direto",
      observacoes: "Mandatos na ALEMA (curadoria 13.csv)",
    },
  },
  {
    slug: "eduardo-braide",
    source:
      "Remediação P0 2026-04-15: eliminar par PODE↔PSD em 2026 (rechainer + `ensureCurrentPartyTimeline` geraram `same_year_reversal`) e fixar uma única transição para o PSD publicado.",
    candidateUpdate: {},
    deleteTimelineRows: [
      { partido_anterior: "PODE", partido_novo: "PSD", ano: 2026 },
      { partido_anterior: "PSD", partido_novo: "PODE", ano: 2026 },
    ],
    ensureTimelineRows: [
      {
        partido_anterior: "PODE",
        partido_novo: "PSD",
        ano: 2026,
        data_mudanca: "2026-04-01",
        contexto:
          "Filiação consolidada ao PSD alinhada ao `partido_sigla` público (TSE + curadoria 13.csv; remediação `same_year_reversal` 2026-04-15).",
      },
    ],
  },
  {
    slug: "pedro-cunha-lima",
    source: "Portal da Paraiba / Correio da Paraiba 2026 + TSE (consulta_cand 2018 e 2022)",
    candidateUpdate: {
      partido_sigla: "PSD",
      partido_atual: "Partido Social Democrático",
      cargo_atual: null,
      cargo_disputado: "Nenhum",
      situacao_candidatura: null,
      status: "desistente",
      biografia:
        "Pedro Oliveira Cunha Lima é advogado e político brasileiro, filiado ao Partido Social Democrático (PSD). Foi deputado federal pela Paraíba de 2015 a 2023 (PSDB) e candidato ao governo do estado em 2022; em 2026 anunciou que não disputará as eleições. É presidente estadual do PSD na Paraíba.",
    },
    historicoFix: {
      cargo: "Deputado Federal",
      periodo_inicio: 2015,
      periodo_fim: 2023,
      partido: "PSDB",
      estado: "PB",
      eleito_por: "voto direto",
      observacoes: "Mandato federal (Câmara dos Deputados / TSE)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "pedro-cunha-lima",
    source: "Portal da Paraiba / Correio da Paraiba 2026 + TSE (consulta_cand 2018 e 2022)",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Governador",
      periodo_inicio: 2022,
      periodo_fim: 2022,
      partido: "PSDB",
      estado: "PB",
      eleito_por: "",
      observacoes:
        "candidatura: candidato ao governo da Paraíba em 2022 (pleito sem mandato exercido; TSE e imprensa)",
    },
  },
  {
    slug: "cicero-lucena",
    source: "TSE (mandatos e cargos) + imprensa da Paraiba 2026 (renuncia prefeitura)",
    candidateUpdate: {
      nome_completo: "Cicero de Lucena Filho",
      partido_sigla: "MDB",
      partido_atual: "Movimento Democrático Brasileiro",
      cargo_atual: null,
      situacao_candidatura: "pre-candidato",
      biografia:
        "Cícero de Lucena Filho é político brasileiro, filiado ao Movimento Democrático Brasileiro (MDB). Foi prefeito de João Pessoa (2021–2026), renunciando em 2026 para disputar o governo da Paraíba; foi governador (1994–1995), vice-governador (1991–1994) e senador (2003–2011).",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "cicero-lucena",
    source: "TSE (mandatos e cargos) + imprensa da Paraiba 2026 (renuncia prefeitura)",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 2021,
      periodo_fim: 2026,
      partido: "MDB",
      estado: "PB",
      eleito_por: "voto direto",
      observacoes:
        "Prefeitura de João Pessoa; reeleito em 2024; filiação PP/MDB conforme registros públicos consolidados na curadoria (TSE + imprensa)",
    },
  },
  {
    slug: "cicero-lucena",
    source: "TSE (mandatos e cargos) + imprensa da Paraiba 2026 (renuncia prefeitura)",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Governador",
      periodo_inicio: 1994,
      periodo_fim: 1995,
      partido: "PSDB",
      estado: "PB",
      eleito_por: "voto direto",
      observacoes: "Mandato estadual (TSE / trajetória pública)",
    },
  },
  {
    slug: "cicero-lucena",
    source: "TSE (mandatos e cargos) + imprensa da Paraiba 2026 (renuncia prefeitura)",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Vice-Governador",
      periodo_inicio: 1991,
      periodo_fim: 1994,
      partido: "PSDB",
      estado: "PB",
      eleito_por: "voto direto",
      observacoes: "Mandato estadual (TSE)",
    },
  },
  {
    slug: "cicero-lucena",
    source: "TSE (mandatos e cargos) + imprensa da Paraiba 2026 (renuncia prefeitura)",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Senador",
      periodo_inicio: 2003,
      periodo_fim: 2011,
      partido: "PSDB",
      estado: "PB",
      eleito_por: "voto direto",
      observacoes: "Mandato federal no Senado (Senado Federal / TSE)",
    },
  },
  {
    slug: "paula-belmonte",
    source: "CLDF + TSE + curadoria 13.csv",
    candidateUpdate: {
      partido_sigla: "PSDB",
      partido_atual: "Partido da Social Democracia Brasileira",
      cargo_atual: "Deputada Distrital",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      biografia:
        "Paula Francinete Belmonte da Silva é empresária e política brasileira, filiada ao Partido da Social Democracia Brasileira (PSDB). Foi deputada federal pelo Cidadania e, em 2022, elegeu-se deputada distrital pelo DF, hoje com registro de filiação ao PSDB na CLDF. Não há pré-candidatura majoritária ao governo do DF em 2026 claramente oficializada nas fontes prioritárias desta rodada.",
    },
    historicoFix: {
      cargo: "Deputada Distrital",
      periodo_inicio: 2023,
      periodo_fim: null,
      partido: "PSDB",
      estado: "DF",
      eleito_por: "voto direto",
      observacoes: "Mandato distrital atual (CLDF + curadoria 13.csv)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "paula-belmonte",
    source: "Câmara dos Deputados / TSE",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Deputado Federal",
      periodo_inicio: 2019,
      periodo_fim: 2023,
      partido: "CIDADANIA",
      estado: "DF",
      eleito_por: "voto direto",
      observacoes: "Mandato federal pelo Cidadania (TSE + curadoria 13.csv)",
    },
  },
  {
    slug: "paula-belmonte",
    source:
      "Remediação P0 2026-04-15: eliminar par PSDB↔CIDADANIA em 2026 (`same_year_reversal` + `incomplete_timeline` por último `partido_novo` fora do PSDB) e fixar retorno único ao PSDB.",
    candidateUpdate: {},
    deleteTimelineRows: [
      { partido_anterior: "PSDB", partido_novo: "CIDADANIA", ano: 2026 },
      { partido_anterior: "CIDADANIA", partido_novo: "PSDB", ano: 2026 },
    ],
    ensureTimelineRows: [
      {
        partido_anterior: "CIDADANIA",
        partido_novo: "PSDB",
        ano: 2026,
        data_mudanca: "2026-04-01",
        contexto:
          "Filiação ao PSDB consolidada conforme CLDF e `partido_sigla` público (curadoria 13.csv; remediação 2026-04-15).",
      },
    ],
  },
  {
    slug: "lucas-ribeiro",
    source: "Governo da Paraiba oficial 2026-04-08 + Wikimedia Commons/Ascomlr",
    candidateUpdate: {
      cargo_atual: "Governador da Paraíba",
      situacao_candidatura: "pre-candidato",
      biografia:
        "Lucas Ribeiro é advogado e político brasileiro, filiado ao Progressistas (PP). Eleito vice-governador da Paraíba na chapa de João Azevêdo em 2022, assumiu o governo do estado em abril de 2026.",
      foto_url:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/8/86/Lucas_Ribeiro_-_Vice-governador_da_Para%C3%ADba_2025.jpg/960px-Lucas_Ribeiro_-_Vice-governador_da_Para%C3%ADba_2025.jpg",
    },
    historicoFix: {
      cargo: "Vice-Governador",
      periodo_inicio: 2023,
      periodo_fim: 2026,
      partido: "PP",
      estado: "PB",
      eleito_por: "voto direto",
      observacoes: "Vice-governador ate abril de 2026, quando assumiu o governo (Governo da Paraiba oficial 2026-04-08)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "lucas-ribeiro",
    source: "Governo da Paraiba oficial 2026-04-08",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Governador",
      periodo_inicio: 2026,
      periodo_fim: null,
      partido: "PP",
      estado: "PB",
      eleito_por: "sucessao constitucional",
      observacoes: "Assumiu governo da PB em abril de 2026 (Governo da Paraiba oficial 2026-04-08)",
    },
  },
  {
    slug: "cleitinho",
    source:
      "Auditoria trajetória partidária 2026-04-12 (Senado Federal, Republicanos, Estado de Minas / O Tempo, Folha de S.Paulo)",
    candidateUpdate: {
      biografia:
        "Cleiton Gontijo de Azevedo, conhecido como Cleitinho, é político brasileiro filiado ao Republicanos. A trajetória partidária eleitoral relevante começa em 2016 no PPS (hoje Cidadania, após renomeação da legenda em 2019); em 2022 passou pelo PSC entre abril e dezembro e filiou-se ao Republicanos em dezembro de 2022. Filiações pretéritas a outras legendas citadas na imprensa antes da carreira política não integram a sequência consolidada nas fontes oficiais (Senado, partido e veículos citados na auditoria).",
    },
    deleteTimelineRows: [
      { partido_anterior: "PSDB", partido_novo: "PP", ano: 2008 },
      { partido_anterior: "PP", partido_novo: "PT DO B", ano: 2016 },
      { partido_anterior: "AVANTE", partido_novo: "PPS", ano: 2018 },
      { partido_anterior: "CIDADANIA", partido_novo: "AVANTE", ano: 2020 },
      { partido_anterior: "PSC", partido_novo: "REPUBLICANOS", ano: 2022, contexto_includes: "Wikidata" },
      {
        partido_anterior: "PSC",
        partido_novo: "REPUBLICANOS",
        ano: 2026,
        contexto_includes: "partido atual",
      },
    ],
    ensureCurrentPartyTimeline: false,
  },
  {
    slug: "maria-da-consolacao",
    source: "O Tempo 2026-01-07 + PSOL MG (lançamento formal) + TSE DivulgaCandContas (remediação trajetória 2026-04-15)",
    candidateUpdate: {
      situacao_candidatura: "pre-candidato",
      status: "pre-candidato",
      biografia:
        "Maria da Consolação Soares é política mineira filiada ao Partido Socialismo e Liberdade (PSOL), pré-candidata ao governo de Minas Gerais em 2026 conforme o O Tempo e o lançamento formal do PSOL em Minas. Tem mandatos e candidaturas municipais registrados no TSE (DivulgaCandContas); a trajetória partidária consolidada nesta curadoria mantém PSB → PSOL (2006), filiação ao Avante (PT DO B) em 2016 e retorno ao PSOL em 2026, sem o par contraditório PSC ↔ PSOL em 2012 proveniente de ingestão ruídosa.",
    },
    deleteTimelineRows: [
      { partido_anterior: "PSOL", partido_novo: "PSC", ano: 2012 },
      { partido_anterior: "PSC", partido_novo: "PSOL", ano: 2012 },
    ],
    ensureTimelineRows: [
      {
        partido_anterior: "PSOL",
        partido_novo: "PT DO B",
        ano: 2016,
        data_mudanca: null,
        contexto:
          "Linha idempotente: âncora PSOL → Avante (PT DO B) antes do retorno ao PSOL em 2026 (TSE DivulgaCandContas + O Tempo / PSOL MG; remediação 2026-04-15 remove par PSC↔PSOL espúrio em 2012).",
      },
    ],
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "mateus-simoes",
    source: "MG.GOV oficial + Prefeitura de Claraval 2026-03-23",
    candidateUpdate: {
      cargo_atual: "Governador de Minas Gerais",
      biografia:
        "Mateus Simões de Almeida é advogado, professor e político brasileiro, filiado ao Partido Social Democrático (PSD). É o atual governador de Minas Gerais. Eleito vice-governador em 2022, assumiu a titularidade do mandato em 2026 após a renúncia de Romeu Zema.",
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
    source:
      "Auditoria trajetória partidária 2026-04-12 (linha 16) + DivulgaCandContas TSE + G1 Tocantins + governo do Tocantins + Assembleia Legislativa do TO",
    candidateUpdate: {
      partido_sigla: "PSD",
      partido_atual: "Partido Social Democrático",
      cargo_atual: "Vice-Governador",
      situacao_candidatura: "pre-candidato",
      biografia:
        "Laurez da Rocha Moreira é advogado e político brasileiro, filiado ao Partido Social Democrático (PSD) desde abril de 2026, após o PDT. A trajetória partidária consolidada nas fontes oficiais e na imprensa inclui o PPR e, após a reorganização progressista, o PPB; em 2006 migrou ao PFL (hoje linha DEM); filiou-se ao PSB em 2010, permaneceu na legenda até 2022 e concorreu ao governo do Tocantins pelo PDT naquele ano, elegendo-se vice-governador. É vice-governador desde 2023 e figura como pré-candidato ao governo do estado em 2026.",
    },
    deleteTimelineRows: [
      { partido_anterior: "PSD", partido_novo: "PSB", ano: 2026 },
      { partido_anterior: "PSB", partido_novo: "PSD", ano: 2026 },
    ],
    ensureTimelineRows: [
      {
        partido_anterior: "PDT",
        partido_novo: "PSD",
        ano: 2026,
        data_mudanca: "2026-04-01",
        contexto:
          "Filiação ao PSD após o PDT (G1 Tocantins 01/04/2026 + governo do Tocantins + AL TO; auditoria trajetória 2026-04-12).",
      },
    ],
    historicoFix: {
      cargo: "Vice-Governador",
      periodo_inicio: 2023,
      periodo_fim: null,
      partido: "PSD",
      estado: "TO",
      eleito_por: "voto direto",
      observacoes:
        "Mandato de vice-governador desde 2023 (eleição 2022 pelo PDT); filiação ao PSD em abril de 2026 (G1 + portal do governo do Tocantins + AL TO; auditoria 2026-04-12).",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "pazolini",
    source: "Diário Oficial ES + A Gazeta (Vitória) 2026",
    candidateUpdate: {
      cargo_atual: "Prefeito de Vitória",
      situacao_candidatura: "pre-candidato",
      biografia:
        "Lorenzo Silva de Pazolini é delegado de polícia, advogado e político brasileiro, filiado ao Republicanos. É o atual prefeito de Vitória, reeleito em 2024 para o segundo mandato na capital capixaba e figura como pré-candidato ao governo do Espírito Santo em 2026.",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "cadu-xavier",
    source:
      "DOE/RN edição extra 31/03/2026 + Galera Vermelha (PT RN) 2026 + Agora RN + 98 FM Natal",
    candidateUpdate: {
      cargo_atual: null,
      situacao_candidatura: null,
      status: "pre-candidato",
      biografia:
        "Carlos Eduardo Xavier é auditor fiscal de carreira e político brasileiro, filiado ao Partido dos Trabalhadores (PT). Foi secretário de Estado da Fazenda do Rio Grande do Norte de 2019 a 2026, quando pediu exoneração para concorrer ao governo do estado. Figura como pré-candidato ao governo do RN em 2026, sem registro deferido no TSE na data de curadoria.",
    },
    historicoFix: {
      cargo: "Secretário de Estado da Fazenda do Rio Grande do Norte",
      periodo_inicio: 2019,
      periodo_fim: 2026,
      partido: "PT",
      estado: "RN",
      eleito_por: "nomeacao",
      observacoes:
        "Exoneração publicada em 30/03/2026 para desincompatibilização eleitoral (DOE/RN edição extra 31/03/2026)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "ataides-oliveira",
    source: "Senado Federal perfil 5164 + curadoria TO 2026-04-11",
    candidateUpdate: {
      nome_completo: "Ataídes de Oliveira Leite",
      partido_sigla: "incerto",
      partido_atual: "incerto",
      situacao_candidatura: "incerto",
      formacao: "Direito (Superior, Faculdade de Direito de Anapolis)",
      biografia:
        "Ataídes de Oliveira Leite é empresário e político brasileiro, ex-senador pelo Tocantins. A sua filiação partidária e o pleito majoritário em 2026 permanecem incertos na curadoria desta rodada.",
    },
    deleteTimelineRows: [
      {
        partido_anterior: "PSDB",
        partido_novo: "NOVO",
        ano: 2026,
        contexto_includes: "filiação NOVO",
      },
    ],
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
  // Auditoria 2026-04-12 (fechamento): slug amarra Daniel Barbosa Santos / PA em `data/candidatos.json`
  // (TSE 2018/2020/2022 + Câmara 220614). O bloqueio por “homônimo” da planilha `ainda-pendentes-3-casos`
  // não se aplica a este registro canônico.
  {
    slug: "dr-daniel",
    source:
      "Auditoria trajetória partidária 2026-04-12 (linha 10) + TSE DivulgaCandContas + G1 PA + O Liberal + DO Municipal Ananindeua 03/04/2026 + Wikimedia Commons/Flickr",
    candidateUpdate: {
      partido_sigla: "PODEMOS",
      partido_atual: "Podemos",
      cargo_atual: null,
      situacao_candidatura: "incerto",
      foto_url: "https://upload.wikimedia.org/wikipedia/commons/0/02/Dr._Daniel_Santos.jpg",
      biografia:
        "Daniel Barbosa Santos, conhecido como Dr. Daniel, é médico e político brasileiro, filiado ao Podemos desde março de 2026. A trajetória partidária consolidada na auditoria editorial, no TSE e na imprensa (G1, O Liberal) inclui o PSDB até 2018, filiação ao MDB em 2018 (eleição à Prefeitura de Ananindeua em 2020 pelo MDB), filiação ao PSB em 2024 e eleição à prefeitura pelo PSB no mesmo ano; em seguida filiou-se ao Podemos para disputar o governo do Pará. Registros editoriais antigos com datas ou siglas incorretas (incluindo PSD sem comprovação) foram afastados na auditoria de 2026-04-12. Foi deputado estadual (2019–2023) e prefeito de Ananindeua até 2 de abril de 2026, quando renunciou ao cargo. A situação de candidatura em 2026 permanece incerta quanto a registro deferido no TSE na data de curadoria.",
    },
    deleteTimelineRows: [
      { partido_anterior: "PSDB", partido_novo: "MDB", ano: 2020 },
      { partido_anterior: "PSD", partido_novo: "PODE", ano: 2025 },
      { partido_anterior: "MDB", partido_novo: "PSB", ano: 2026 },
    ],
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 2021,
      periodo_fim: 2026,
      partido: "PSB",
      estado: "PA",
      eleito_por: "voto direto",
      observacoes:
        "Prefeitura de Ananindeua; MDB até a filiação ao PSB em 2024 (TSE + auditoria trajetória 2026-04-12); filiação ao Podemos em março de 2026; renúncia em 02/04/2026 para disputar o governo do PA (G1 Pará + DO Municipal Ananindeua 03/04/2026)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "dr-daniel",
    source: "Auditoria trajetória partidária 2026-04-12 + TSE (mandatos estaduais)",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Deputado Estadual",
      periodo_inicio: 2019,
      periodo_fim: 2023,
      partido: "MDB",
      estado: "PA",
      eleito_por: "voto direto",
      observacoes:
        "Mandato 2019–2023; eleição de 2018 pelo PSDB com filiação ao MDB ainda em 2018 (auditoria trajetória 2026-04-12 + TSE)",
    },
  },
  {
    slug: "efraim-filho",
    source:
      "Auditoria trajetória partidária 2026-04-12 (linha 15) + Senado Federal + DivulgaCandContas TSE + Poder360 + TSE (fusão União Brasil)",
    candidateUpdate: {
      partido_sigla: "PL",
      partido_atual: "Partido Liberal",
      cargo_atual: "Senador(a)",
      situacao_candidatura: "pre-candidato",
      biografia:
        "Efraim de Araujo Morais Filho é advogado e político brasileiro, filiado ao Partido Liberal (PL) desde abril de 2026, após o União Brasil. Na trajetória partidária documentada no Senado, no TSE e no Poder360, atuou pelo DEM; filiou-se ao PSB em 2012 e retornou ao DEM em 2014; integrou o União Brasil a partir da fusão DEM+PSL homologada pelo TSE em 2022. É senador pela Paraíba desde 2023 e foi deputado federal entre 2007 e 2023.",
    },
    deleteTimelineRows: [{ partido_anterior: "PL", partido_novo: "UNIAO", ano: 2026 }],
    ensureTimelineRows: [
      {
        partido_anterior: "UNIAO",
        partido_novo: "PL",
        ano: 2026,
        data_mudanca: "2026-04-05",
        contexto:
          "Saída do União Brasil e filiação ao PL no início de abril de 2026 (Poder360 + perfil no Senado Federal; auditoria trajetória 2026-04-12).",
      },
    ],
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "efraim-filho",
    source: "Senado Federal + Poder360/Fonte83 + auditoria trajetória 2026-04-12 — curadoria S15.3 lote 4",
    candidateUpdate: {},
    deleteHistoricoRows: [
      {
        cargo: "Senador",
        periodo_inicio: 2023,
        tipo_evento: "mandato",
        observacoes_includes: "União Brasil até o início de abril de 2026",
      },
    ],
    historicoFix: {
      cargo: "Senador",
      periodo_inicio: 2026,
      periodo_fim: null,
      partido: "PL",
      estado: "PB",
      eleito_por: "voto direto",
      observacoes:
        "Mesmo mandato no Senado após saída do União Brasil e filiação ao PL no início de abril de 2026 (Senado Federal + Poder360/Fonte83; curadoria S15.3 lote 4).",
    },
  },
  {
    slug: "efraim-filho",
    source: "Senado Federal + TSE + Câmara dos Deputados + auditoria trajetória 2026-04-12",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Deputado Federal",
      periodo_inicio: 2007,
      periodo_fim: 2010,
      partido: "DEM",
      estado: "PB",
      eleito_por: "voto direto",
      observacoes:
        "Primeiro mandato federal (DEM) até 2010, cobrindo o trecho anterior às linhas TSE já segmentadas (2010–2022); interlúdio pelo PSB (2012–2014) com retorno ao DEM e migração para o União Brasil com a fusão de 2022 nas mesmas fontes (TSE + Senado + Câmara; auditoria 2026-04-12).",
    },
  },
  {
    slug: "alvaro-dias-rn",
    source:
      "Auditoria trajetória partidária 2026-04-12 (ALERN memorial legislativo RN, Republicanos10, Saiba Mais/JOR, Novo Notícias, TSE candidaturas) — distinto do homônimo Alvaro Fernandes Dias (PR)",
    candidateUpdate: {
      nome_completo: "Alvaro Costa Dias",
      partido_sigla: "PL",
      partido_atual: "Partido Liberal",
      cargo_atual: null,
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      biografia:
        "Álvaro Costa Dias é médico e político brasileiro, filiado ao Partido Liberal (PL) desde março de 2026, após filiações ao PMDB/MDB, PDT, PSDB e Republicanos. Foi deputado estadual pelo Rio Grande do Norte, vice-prefeito de Natal (2017–2018) e prefeito da capital potiguar (2018–2024). Não confundir com o homônimo Alvaro Fernandes Dias (PR), ex-senador paranaense. O pleito majoritário em 2026 permanece incerto nas fontes consultadas nesta rodada (sem pré-candidatura a governador claramente oficializada).",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "renan-filho",
    source:
      "Auditoria trajetória partidária 2026-04-12 (linha 12) + Senado Federal + TSE + MDB nacional + G1 AL + CNN Brasil + gov.br/transportes",
    candidateUpdate: {
      partido_sigla: "MDB",
      partido_atual: "Movimento Democrático Brasileiro",
      cargo_atual: "Senador(a)",
      situacao_candidatura: "pre-candidato",
      biografia:
        "José Renan Vasconcelos Calheiros Filho é economista e político brasileiro, filiado sem interrupção ao PMDB e, desde a renomeação institucional em 2017, ao Movimento Democrático Brasileiro (MDB), mesma legenda partidária. Foi governador de Alagoas de 2015 a 2022, ministro dos Transportes entre 2023 e março de 2026 e reassumiu o mandato de senador por Alagoas ao deixar o ministério para disputar novamente o governo estadual em 2026. A auditoria de trajetória de 2026-04-12 descarta trocas fictícias para PSD, PRB, Republicanos ou Solidariedade na timeline pública, atribuídas a ruído de homônimos ou erro de cadastro (Senado Federal, TSE, site do MDB, governo federal).",
    },
    deleteTimelineRows: [
      { partido_anterior: "PMDB", partido_novo: "PSD", ano: 2012 },
      { partido_anterior: "PSD", partido_novo: "PMDB", ano: 2014 },
      { partido_anterior: "MDB", partido_novo: "PRB", ano: 2018 },
      { partido_anterior: "MDB", partido_novo: "Solidariedade", ano: 2022 },
      { partido_anterior: "REPUBLICANOS", partido_novo: "MDB", ano: 2022 },
      { partido_anterior: "Solidariedade", partido_novo: "MDB", ano: 2026 },
    ],
    ensureCurrentPartyTimeline: true,
    manualVotes: [
      {
        titulo: "Ofício \"S\" nº 25, de 2023 - Guilherme Augusto Caputo Bastos (CNJ)",
        descricao:
          "Votação nominal do Ofício nº 25, de 2023, indicação de membro do Conselho Nacional de Justiça. Página oficial do Senado registra Renan Filho como presente/votante em 13/12/2023.",
        data_votacao: "2023-12-13",
        casa: "Senado",
        tema: "indicação_autoridade",
        impacto_popular: "alto",
        proposicao_id: "160914",
        voto: "sim",
      },
    ],
  },
  {
    slug: "confucio-moura",
    source: "Senado Federal oficial + Extra de Rondônia 2026-03-23",
    candidateUpdate: {
      nome_completo: "José Confúcio Aires Moura",
      cargo_atual: "Senador(a)",
      cargo_disputado: "Governador",
      situacao_candidatura: "incerto",
      biografia:
        "José Confúcio Aires Moura é médico e político brasileiro, filiado ao Movimento Democrático Brasileiro (MDB). Ex-governador de Rondônia por dois mandatos, e senador pelo estado em mandato em curso. O pleito majoritário de 2026 permanece incerto entre disputa estadual ou foco na reeleição ao Senado na data de curadoria.",
    },
    historicoFix: {
      cargo: "Senador",
      periodo_inicio: 2019,
      periodo_fim: 2027,
      partido: "MDB",
      estado: "RO",
      eleito_por: "voto direto",
      observacoes: "Mandato no Senado confirmado em 2026; pleito majoritário de 2026 incerto na curadoria (Senado Federal oficial + Extra de Rondônia 2026-03-23)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "dr-fernando-maximo",
    source:
      "Auditoria trajetória partidária 2026-04-12 (linha 14) + DivulgaCandContas TSE 2020/2022 + Câmara dos Deputados + Folha de Rondônia",
    candidateUpdate: {
      nome_completo: "Fernando Máximo de Oliveira",
      partido_sigla: "PL",
      partido_atual: "Partido Liberal",
      cargo_atual: "Deputado(a) Federal",
      cargo_disputado: "Senador",
      situacao_candidatura: "pre-candidato",
      biografia:
        "Fernando Máximo de Oliveira é médico e político brasileiro, filiado ao Partido Liberal (PL) desde 2025, após o União Brasil. Concorreu a vereador em Porto Velho em 2020 pelo MDB; em 2022 foi eleito deputado federal por Rondônia já pelo União Brasil, em linha com a janela partidária típica entre o MDB e a nova legenda. Em 2026 o PL o trata como pré-candidato ao Senado pelo estado, sem deferimento pelo TSE na data de curadoria.",
    },
    deleteTimelineRows: [{ partido_anterior: "PTC", partido_novo: "PMB", ano: 2020 }],
    ensureTimelineRows: [
      {
        partido_anterior: "Sem partido",
        partido_novo: "MDB",
        ano: 2020,
        data_mudanca: null,
        contexto:
          "Filiação ao MDB para candidatura a vereador em Porto Velho/RO (DivulgaCandContas TSE 2020; auditoria trajetória 2026-04-12).",
      },
      {
        partido_anterior: "MDB",
        partido_novo: "UNIAO",
        ano: 2022,
        data_mudanca: null,
        contexto:
          "Eleição à Câmara dos Deputados por Rondônia pelo União Brasil; transição a partir do MDB na janela partidária 2021–2022 (DivulgaCandContas TSE 2022; Câmara dos Deputados).",
      },
      {
        partido_anterior: "UNIAO",
        partido_novo: "PL",
        ano: 2025,
        data_mudanca: "2025-01-01",
        contexto:
          "Filiação ao Partido Liberal após o União Brasil (Folha de Rondônia; auditoria trajetória 2026-04-12).",
      },
    ],
    historicoFix: {
      cargo: "Deputado Federal",
      periodo_inicio: 2023,
      periodo_fim: null,
      partido: "PL",
      estado: "RO",
      eleito_por: "voto direto",
      observacoes:
        "Mandato federal 2023 em diante; trajetória partidária MDB (vereador Porto Velho 2020) → União Brasil (deputado federal 2022) → PL desde 2025 (TSE + Câmara + Folha de Rondônia; auditoria 2026-04-12). Pré-candidatura ao Senado em 2026 tratada pelo PL sem deferimento pelo TSE na data de curadoria.",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "dr-fernando-maximo",
    source: "TSE DivulgaCandContas 2020 — curadoria S15.3 lote 4",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Vereador",
      periodo_inicio: 2020,
      periodo_fim: 2020,
      partido: "MDB",
      estado: "RO",
      eleito_por: "",
      observacoes:
        "candidatura: vereador em Porto Velho/RO em 2020 pelo MDB (TSE DivulgaCandContas 2020; curadoria S15.3 lote 4).",
    },
  },
  {
    slug: "teresa-surita",
    source: "AGN Online 2026-03-23 + Roraima em Tempo 2026-03-29",
    candidateUpdate: {
      cargo_disputado: "Senador",
      biografia:
        "Maria Teresa Saenz Surita Guimarães é turismóloga e política brasileira, filiada ao Movimento Democrático Brasileiro (MDB). Foi prefeita de Boa Vista por cinco mandatos e deputada federal por Roraima em duas legislaturas. Em 2026, passou a confirmar publicamente sua pré-candidatura ao Senado pelo estado.",
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
    source: "ALERR 2026-03-27 + CNN 2026-04-30 + TRE-RR Res. 584/2026 + Folha BV 2026-05-13",
    candidateUpdate: {
      partido_sigla: "UNIAO",
      partido_atual: "União Brasil",
      cargo_atual: null,
      cargo_disputado: "Governador",
      situacao_candidatura: "pre-candidato",
      biografia:
        "Edilson Damião da Silva é político brasileiro, filiado ao União Brasil. Eleito vice-governador de Roraima em 2022, assumiu brevemente o governo estadual em 27 de março de 2026 após a renúncia de Antonio Denarium. Em 30 de abril de 2026, o TSE cassou seu mandato, determinou execução imediata da decisão e convocou eleição suplementar para o governo de Roraima. Após a cassação, Damião deixou de exercer cargo de governador ou vice-governador; o União Brasil passou a articular sua candidatura ao governo tampão na eleição suplementar de 21 de junho de 2026, ainda com discussão jurídica sobre o prazo de filiação.",
    },
    historicoFix: {
      cargo: "Governador",
      periodo_inicio: 2026,
      periodo_fim: 2026,
      partido: "UNIAO",
      estado: "RR",
      eleito_por: "sucessao constitucional",
      observacoes:
        "Assumiu o governo de Roraima em 27/03/2026 após renúncia de Antonio Denarium; TSE/CNN registraram em 30/04/2026 a cassação, execução imediata da decisão e convocação de eleição suplementar direta. Não tratar como governador ou vice atual.",
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
    slug: "adailton-furia",
    source: "DO Municipal Cacoal ed. extraordinaria 02/04/2026 + Rondonia Dinamica",
    candidateUpdate: {
      nome_completo: "Adailton de Souza Fúria",
      cargo_atual: null,
      situacao_candidatura: "pre-candidato",
      data_nascimento: "1986-09-24",
      formacao: "SUPERIOR COMPLETO",
      foto_url: "https://sapl.al.ro.leg.br/media/sapl/public/parlamentar/253/adailton_furia.jpeg",
      biografia:
        "Adailton de Souza Fúria é advogado e político brasileiro, filiado ao Partido Social Democrático (PSD). Foi prefeito de Cacoal de 2021 a 2026, reeleito em 2024, quando renunciou para disputar o governo de Rondônia.",
    },
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 2021,
      periodo_fim: 2026,
      partido: "PSD",
      estado: "RO",
      eleito_por: "voto direto",
      observacoes: "Renunciou em 02/04/2026 para disputar governo de RO (DO Municipal Cacoal ed. extraordinaria 02/04/2026)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "thiago-de-joaldo",
    source: "Camara dos Deputados oficial 2026-04-02 + ITNet 2025-11-12",
    candidateUpdate: {
      partido_sigla: "REPUBLICANOS",
      partido_atual: "Republicanos",
      cargo_atual: "Deputado(a) Federal",
      situacao_candidatura: "pre-candidato",
      data_nascimento: "1982-06-20",
      formacao: "Pós-Graduação",
      foto_url: "https://www.camara.leg.br/internet/deputado/bandep/220560.jpg",
      biografia:
        "José Thiago Alves de Carvalho é advogado e político brasileiro, filiado ao Republicanos. Foi secretário municipal de Educação de Itabaianinha e exerce mandato de deputado federal por Sergipe desde 2023; é apontado como nome competitivo ao governo do estado em pesquisas eleitorais.",
    },
    historicoFix: {
      cargo: "Deputado(a) Federal",
      periodo_inicio: 2023,
      periodo_fim: null,
      partido: "REPUBLICANOS",
      estado: "SE",
      eleito_por: "voto direto",
      observacoes: "Mandato federal atual (Câmara dos Deputados oficial 2026-04-02 + ITNet 2025-11-12)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "anderson-ferreira",
    source: "WORKFLOWS 2026-06-04 audit:published-consistency",
    candidateUpdate: {
      cargo_disputado: "Deputado Federal",
      cargo_atual: null,
      situacao_candidatura: null,
      status: "pre-candidato",
      partido_sigla: "PL",
      partido_atual: "Partido Liberal",
      biografia:
        "Anderson Ferreira de Alencar é empresário e político brasileiro, filiado ao Partido Liberal (PL). Foi deputado federal por Pernambuco (2011–2017), prefeito de Jaboatão dos Guararapes (2017–2021) e candidato ao governo de Pernambuco em 2022 pelo PL; a curadoria publicada de 2026 registra sua disputa como Deputado Federal.",
    },
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 2017,
      periodo_fim: 2021,
      partido: "PL",
      estado: "PE",
      eleito_por: "voto direto",
      observacoes: "Prefeitura de Jaboatão dos Guararapes (G1 Pernambuco + Diário de Pernambuco 2026-02-06)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "anderson-ferreira",
    source: "Câmara dos Deputados / TSE (mandatos federais)",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Deputado Federal",
      periodo_inicio: 2011,
      periodo_fim: 2017,
      partido: "PR",
      estado: "PE",
      eleito_por: "voto direto",
      observacoes: "Mandatos federais de Anderson Ferreira por Pernambuco pelo PR (Câmara dos Deputados / TSE; curadoria S15.3 lote 2).",
    },
  },
  {
    slug: "anderson-ferreira",
    source: "TSE (consulta_cand 2022) + imprensa",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Governador",
      periodo_inicio: 2022,
      periodo_fim: 2022,
      partido: "PL",
      estado: "PE",
      eleito_por: "",
      observacoes: "candidatura: pleito ao governo de Pernambuco em 2022 (TSE)",
    },
  },
  {
    slug: "guilherme-derrite",
    source: "Camara dos Deputados oficial 2026-04-02 + UOL 2025-05-19 + curadoria 17.csv",
    candidateUpdate: {
      partido_sigla: "PP",
      partido_atual: "PP",
      cargo_atual: "Deputado(a) Federal",
      cargo_disputado: "Senador",
      situacao_candidatura: "pre-candidato",
      biografia:
        "Guilherme Muraro Derrite é policial militar reformado e político brasileiro, filiado ao PP. Foi secretário da Segurança Pública de São Paulo entre 2023 e 2025, retomou o mandato de deputado federal e figura com pré-candidatura ao Senado por São Paulo em 2026 (Câmara dos Deputados + UOL + curadoria 17.csv).",
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
    source:
      "TSE consulta_cand 1998/2002/2010/2014/2018/2022/2024 + Câmara dos Deputados oficial id 160539 + Alesp 2001-02-22 + Folha1 2026-04-16 + Poder360 2024-03-13",
    candidateUpdate: {
      nome_completo: "Anthony William Garotinho Matheus de Oliveira",
      partido_sigla: "REPUBLICANOS",
      partido_atual: "Republicanos",
      cargo_atual: null,
      cargo_disputado: "Governador",
      situacao_candidatura: "pre-candidato",
      status: "pre-candidato",
      publicavel: true,
      data_nascimento: "1960-04-18",
      naturalidade: "Campos dos Goytacazes/RJ",
      formacao: "Superior completo",
      profissao_declarada: "Locutor e comentarista de radio e televisao e radialista",
      biografia:
        "Anthony William Garotinho Matheus de Oliveira, conhecido como Garotinho, e radialista e politico brasileiro, filiado ao Republicanos. Foi governador do Rio de Janeiro, deputado federal pelo Rio de Janeiro e prefeito de Campos dos Goytacazes. Em 2026, declarou pre-candidatura ao governo do Rio de Janeiro.",
    },
    deleteHistoricoRows: [
      {
        cargo: "Vereador",
        periodo_inicio: 2000,
        tipo_evento: "mandato",
        observacoes_includes: "TSE 2000",
      },
      {
        cargo: "Vereador",
        periodo_inicio: 2012,
        tipo_evento: "candidatura",
        observacoes_includes: "TSE 2012",
      },
      {
        cargo: "Governador",
        periodo_inicio: 1998,
        periodo_fim: 1999,
        tipo_evento: "mandato",
        observacoes_includes: "TSE 1998",
      },
      {
        cargo: "Governador",
        periodo_inicio: 1999,
        periodo_fim: 2002,
        tipo_evento: "mandato",
        observacoes_includes: "TSE consulta_cand 1998",
      },
      {
        cargo: "Deputado Federal",
        periodo_inicio: 2010,
        periodo_fim: 2014,
        tipo_evento: "mandato",
        observacoes_includes: "TSE 2010",
      },
    ],
    deleteTimelineRows: [
      { partido_anterior: "PR", partido_novo: "PT", ano: 2012 },
      { partido_anterior: "PT", partido_novo: "PR", ano: 2014 },
      { partido_anterior: "UNIAO", partido_novo: "REPUBLICANOS", ano: 2026 },
    ],
    ensureTimelineRows: [
      {
        partido_anterior: "UNIAO",
        partido_novo: "REPUBLICANOS",
        ano: 2024,
        data_mudanca: "2024-03-13",
        contexto:
          "Filiacao ao Republicanos em marco de 2024; TSE 2024 registra candidatura a vereador pelo Republicanos (SQ 190002208866).",
      },
    ],
    historicoFix: {
      cargo: "Governador",
      periodo_inicio: 1999,
      periodo_fim: 2000,
      partido: "PDT",
      estado: "RJ",
      eleito_por: "voto direto",
      observacoes:
        "Segmento inicial do mandato de governador do Rio de Janeiro apos eleicao de 1998 pelo PDT; fontes posteriores registram adesao ao PSB ja em 2001 (TSE consulta_cand 1998; Alesp 2001-02-22).",
    },
  },
  {
    slug: "garotinho",
    source: "Alesp 2001-02-22 + TSE consulta_cand 2002 BRASIL",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Governador",
      periodo_inicio: 2001,
      periodo_fim: 2002,
      partido: "PSB",
      estado: "RJ",
      eleito_por: "voto direto",
      observacoes:
        "Segmento final do mandato de governador do Rio de Janeiro com filiacao ao PSB ja documentada em 2001 e candidatura presidencial pelo PSB em 2002 (Alesp 2001-02-22; TSE consulta_cand 2002, SQ 9578).",
    },
  },
  {
    slug: "garotinho",
    source: "TSE consulta_cand 2002 BRASIL",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Filiação ao PSB",
      periodo_inicio: 2002,
      periodo_fim: 2002,
      partido: "PSB",
      estado: "BR",
      eleito_por: null,
      observacoes:
        "Evento de filiação ao PSB materializado pela candidatura presidencial de 2002 (TSE consulta_cand 2002, SQ 9578).",
    },
  },
  {
    slug: "garotinho",
    source: "Câmara dos Deputados oficial id 160539 + TSE consulta_cand 2010",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Deputado Federal",
      periodo_inicio: 2011,
      periodo_fim: 2015,
      partido: "PR",
      estado: "RJ",
      eleito_por: "voto direto",
      observacoes:
        "Mandato na Camara dos Deputados apos eleicao de 2010 pelo PR (Camara id 160539; TSE consulta_cand 2010, SQ 190000002498).",
    },
  },
  {
    slug: "garotinho",
    source: "TSE consulta_cand 2018 RJ",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Filiação ao PRP",
      periodo_inicio: 2018,
      periodo_fim: 2018,
      partido: "PRP",
      estado: "RJ",
      eleito_por: null,
      observacoes:
        "Evento de filiação ao PRP materializado pela candidatura ao governo do RJ em 2018 (TSE consulta_cand 2018, SQ 190000621818).",
    },
  },
  {
    slug: "garotinho",
    source: "TSE consulta_cand 2022 RJ",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Filiação ao União Brasil",
      periodo_inicio: 2022,
      periodo_fim: 2022,
      partido: "UNIAO",
      estado: "RJ",
      eleito_por: null,
      observacoes:
        "Evento de filiação ao Uniao Brasil materializado pelo registro TSE 2022; a row publica conserva somente a filiacao partidaria factual (TSE consulta_cand 2022, SQ 190001619506).",
    },
  },
  {
    slug: "garotinho",
    source: "Poder360 2024-03-13 + TSE consulta_cand 2024 RJ",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Vereador",
      periodo_inicio: 2024,
      periodo_fim: 2024,
      partido: "REPUBLICANOS",
      estado: "RJ",
      eleito_por: null,
      observacoes:
        "Candidatura a vereador no Rio de Janeiro em 2024 pelo Republicanos, com resultado suplente no TSE (consulta_cand 2024, SQ 190002208866).",
    },
  },
  {
    slug: "lahesio-bonfim",
    source: "TSE + Wikipedia + imprensa local + curadoria 13.csv + Imirante 2026-06-11",
    candidateUpdate: {
      partido_sigla: "NOVO",
      partido_atual: "Partido Novo",
      situacao_candidatura: "pre-candidato",
      status: "pre-candidato",
      biografia:
        "Lahesio Rodrigues Bonfim, conhecido como Dr. Lahesio, é médico e político brasileiro, filiado ao Partido Novo (NOVO). Foi prefeito de São Pedro dos Crentes em dois períodos, eleito pelo PSDB em 2016 e reeleito pelo PSL em 2020, renunciando em 2022 para disputar o governo do Maranhão pelo PSC. Em junho de 2026, a candidatura ao governo deixou de ser o enquadramento seguro; o Imirante registrou movimento ligado à disputa ao Senado.",
    },
    ensureCurrentPartyTimeline: false,
  },
  {
    slug: "lahesio-bonfim",
    source: "TSE (pleito 2022) / DivulgaCandContas 2022 MA PSC",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Governador",
      periodo_inicio: 2022,
      periodo_fim: 2022,
      partido: "PSC",
      estado: "MA",
      eleito_por: "",
      observacoes: "candidatura: pleito ao governo do Maranhão em 2022 pelo PSC (TSE DivulgaCandContas 2022 MA).",
    },
  },
  {
    slug: "natasha-slhessarenko",
    source: "Gazeta Digital MT + PNB Online 2026",
    candidateUpdate: {
      data_nascimento: "1967-11-23",
      partido_atual: "Partido Social Democrático",
      partido_sigla: "PSD",
      cargo_atual: "Sem cargo público",
      situacao_candidatura: "pre-candidato",
      foto_url:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/1/17/Dr.natasha_Slhessarenko.jpg/960px-Dr.natasha_Slhessarenko.jpg",
      biografia:
        "Natasha Slhessarenko é médica pediatra, patologista clínica e empresária brasileira, filiada ao Partido Social Democrático (PSD). Foi pré-candidata ao Senado por Mato Grosso em 2022 e aparece nas tratativas públicas como pré-candidata ao governo do estado em 2026, sem registro deferido no TSE na data de curadoria.",
    },
  },
  {
    slug: "natasha-slhessarenko",
    source: "Imprensa MT + partidos (pleito 2026)",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Governador",
      periodo_inicio: 2026,
      periodo_fim: 2026,
      partido: "PSD",
      estado: "MT",
      eleito_por: "",
      observacoes:
        "candidatura: pré-candidatura ao governo de Mato Grosso em 2026 (imprensa estadual; sem mandato decorrente)",
    },
  },
  {
    slug: "paulo-martins-gov-pr",
    source:
      "TSE consulta_cand_1998/2004/2008/2016/2020/2022/2024 + Prefeitura de Curitiba + NOVO oficial",
    candidateUpdate: {
      partido_sigla: "NOVO",
      partido_atual: "Partido Novo",
      cargo_atual: "Vice-prefeito de Curitiba",
      situacao_candidatura: "pre-candidato",
      status: "pre-candidato",
      biografia:
        "Paulo Eduardo Martins é jornalista e político brasileiro, filiado ao Partido Novo (NOVO) desde 2025. Foi deputado federal pelo Paraná (2019–2023) e é vice-prefeito de Curitiba na gestão 2025–2028, eleito na chapa de 2024 pelo PL; figura como pré-candidato ao governo do Paraná em 2026, sem registro deferido no TSE na data de curadoria.",
    },
    historicoFix: {
      cargo: "Vice-Prefeito",
      periodo_inicio: 2025,
      periodo_fim: null,
      partido: "NOVO",
      estado: "PR",
      eleito_por: "voto direto",
      observacoes:
        "Vice-prefeito eleito na chapa pelo PL em 2024; filiação ao NOVO desde 2025 (Globo + Prefeitura de Curitiba + NOVO oficial + curadoria 18.csv). Coluna `partido` alinhada ao partido atual público e à aresta `mudancas_partido` PL→NOVO/2026 (#28 §15.3 v1).",
    },
    deleteHistoricoRows: [
      {
        cargo: "Deputado Federal",
        periodo_inicio: 1998,
        tipo_evento: "candidatura",
        observacoes_includes: "TSE 1998",
      },
      {
        cargo: "Vereador",
        periodo_inicio: 2004,
        tipo_evento: "candidatura",
        observacoes_includes: "TSE 2004",
      },
      {
        cargo: "Vereador",
        periodo_inicio: 2008,
        tipo_evento: "candidatura",
        observacoes_includes: "TSE 2008",
      },
      {
        cargo: "Vereador",
        periodo_inicio: 2016,
        tipo_evento: "candidatura",
        observacoes_includes: "TSE 2016",
      },
    ],
    deleteTimelineRows: [
      {
        partido_anterior: "PT",
        partido_novo: "PHS",
        ano: 2008,
        contexto_includes: "Mudança observada entre eleições TSE (2008)",
      },
      {
        partido_anterior: "PHS",
        partido_novo: "PSC",
        ano: 2014,
        contexto_includes: "Mudança observada entre eleições TSE (2014)",
      },
      {
        partido_anterior: "PSC",
        partido_novo: "PDT",
        ano: 2016,
        contexto_includes: "Mudança observada entre eleições TSE (2016)",
      },
      {
        partido_anterior: "PDT",
        partido_novo: "PSC",
        ano: 2018,
        contexto_includes: "Mudança observada entre eleições TSE (2018)",
      },
      {
        partido_anterior: "PSC",
        partido_novo: "PP",
        ano: 2020,
        contexto_includes: "Mudança observada entre eleições TSE (2020)",
      },
      {
        partido_anterior: "PP",
        partido_novo: "PL",
        ano: 2022,
        contexto_includes: "Mudança observada entre eleições TSE (2022)",
      },
      {
        partido_novo: "PL",
        ano: 2026,
        contexto_includes: "Filiacao atual observada",
      },
    ],
    ensureTimelineRows: [
      {
        partido_anterior: "PSC",
        partido_novo: "PL",
        ano: 2022,
        contexto:
          "Correção §15.3/#28: remove SQ homônimo 2020 (PAULO MARTINS/NEQUINHO, PP-RS) e liga o último partido real TSE 2018 (PSC) ao TSE 2022 real de Paulo Eduardo Lima Martins (PL, SQ 160001621868).",
      },
    ],
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "paulo-martins-gov-pr",
    source:
      "TSE consulta_cand_2018/2022 — remover duplicata manual Deputado Federal 2019–2023 PL; mandato eleito real já existe como TSE 2018 PSC e candidatura Senado 2022 PL",
    candidateUpdate: {},
    deleteHistoricoRows: [{ cargo: "Deputado Federal", periodo_inicio: 2019, tipo_evento: "mandato" }],
  },
  {
    slug: "felipe-camarao",
    source: "Governo do MA + PT.org.br + Sedihpop + curadoria 13.csv",
    candidateUpdate: {
      cargo_atual: "Vice-Governador do Maranhão",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      biografia:
        "Felipe Costa Camarão é professor e político brasileiro, filiado ao Partido dos Trabalhadores (PT). Foi secretário de Educação do Maranhão e de São Luís e é vice-governador do estado desde 2023, eleito na chapa de Carlos Brandão. Há movimentação ligada ao pleito ao governo em 2026, sem registro deferido no TSE na data de curadoria.",
    },
    historicoFix: {
      cargo: "Vice-Governador",
      periodo_inicio: 2023,
      periodo_fim: null,
      partido: "PT",
      estado: "MA",
      eleito_por: "voto direto",
      observacoes: "Mandato em curso (Governo do MA + curadoria 13.csv)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "felipe-camarao",
    source: "Governo do MA / imprensa",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Secretário de Estado",
      periodo_inicio: 2015,
      periodo_fim: 2022,
      partido: "PT",
      estado: "MA",
      eleito_por: "nomeacao",
      observacoes: "Secretário de Educação do Maranhão (curadoria 13.csv)",
    },
  },
  {
    slug: "felipe-camarao",
    source: "Prefeitura de São Luís / registros públicos",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Secretário Municipal",
      periodo_inicio: 2012,
      periodo_fim: 2014,
      partido: "PT",
      estado: "MA",
      eleito_por: "nomeacao",
      observacoes: "Secretário de Educação de São Luís (curadoria 13.csv)",
    },
  },
  {
    slug: "adriana-accorsi",
    source: "Camara dos Deputados oficial 2026-04-02 + curadoria 14.csv (Tribunal do Planalto / imprensa GO)",
    candidateUpdate: {
      cargo_atual: "Deputada Federal por Goias",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      biografia:
        "Adriana Accorsi de Queiroz e delegada de policia, advogada, sindicalista e politica brasileira, filiada ao Partido dos Trabalhadores (PT). E deputada federal por Goias (mandato 2023-2027). Na imprensa e em declaracoes publicas aparece tanto como nome ventilado ao governo de Goias em 2026 quanto em articulacoes internas do PT estadual; nao ha, na data de curadoria, confirmacao oficial de que sera a candidata ao governo nem registro deferido no TSE.",
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
    slug: "daniel-vilela",
    source: "Governo de Goias + R7/noticias GO 2026-03 a 2026-04 + curadoria 14.csv",
    candidateUpdate: {
      cargo_atual: "Governador de Goias",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      partido_atual: "Movimento Democratico Brasileiro",
      partido_sigla: "MDB",
      biografia:
        "Daniel Goulart Vilela e bacharel em Direito e politico brasileiro, filiado ao Movimento Democratico Brasileiro (MDB). Foi vice-governador de Goias e, em 31 de marco de 2026, assumiu o governo do estado apos a renuncia de Ronaldo Caiado. O quadro de candidatura ao governo em 2026 para quem ja e o titular do executivo depende de consolidacao em fontes oficiais (TSE) e foi tratado como incerto na curadoria desta rodada.",
    },
    historicoFix: {
      cargo: "Vice-Governador",
      periodo_inicio: 2023,
      periodo_fim: 2026,
      partido: "MDB",
      estado: "GO",
      eleito_por: "voto direto",
      observacoes: "Vice-governador ate a sucessao em mar/2026 (imprensa GO + curadoria 14.csv)",
    },
  },
  {
    slug: "daniel-vilela",
    source: "Governo de Goias + curadoria 14.csv",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Governador",
      periodo_inicio: 2026,
      periodo_fim: null,
      partido: "MDB",
      estado: "GO",
      eleito_por: "sucessao constitucional",
      observacoes: "Governador titular apos posse em 31/03/2026 (imprensa GO + curadoria 14.csv)",
    },
  },
  {
    slug: "jose-eliton",
    source: "PSB Goias + imprensa GO + curadoria 14.csv",
    candidateUpdate: {
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      partido_atual: "Partido Socialista Brasileiro",
      partido_sigla: "PSB",
      cargo_atual: null,
      biografia:
        "Jose Eliton de Figueredo Telles Junior e advogado e politico brasileiro, ex-vice-governador e ex-governador de Goias; filiou-se ao PSB em 2022 conforme registros publicos do partido. Nao exerce mandato eletivo atual. A imprensa tem tratado de convites e especulacoes sobre filiacao e pleitos em 2026; na curadoria desta rodada o encaminhamento de candidatura ao governo ficou como incerto ate confirmacao em fontes oficiais.",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "marconi-perillo",
    source: "CNN Brasil + imprensa GO + curadoria 14.csv",
    candidateUpdate: {
      situacao_candidatura: "pre-candidato",
      status: "pre-candidato",
      biografia:
        "Marconi Ferreira Perillo Junior e politico brasileiro, filiado ao Partido da Social Democracia Brasileira (PSDB). Foi governador de Goias por varios mandatos e senador; em 2026 figura como pre-candidato ao governo estadual pelo PSDB, sem deferimento pelo TSE na data de curadoria.",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "wilder-morais",
    source: "Senado Federal + SBT News + curadoria 14.csv",
    candidateUpdate: {
      situacao_candidatura: "pre-candidato",
      status: "pre-candidato",
      cargo_atual: "Senador por Goias",
      biografia:
        "Wilder Gomes de Morais e engenheiro, empresario e politico brasileiro, filiado ao Partido Liberal (PL). E senador por Goias (mandato em curso). O PL oficializou pre-candidatura ao governo de Goias em 2026; sem registro deferido no TSE na data de curadoria.",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "eduardo-riedel",
    source: "Governo de MS + Correio do Estado + curadoria 14.csv",
    candidateUpdate: {
      situacao_candidatura: "pre-candidato",
      status: "pre-candidato",
      partido_atual: "Progressistas",
      partido_sigla: "PP",
      cargo_atual: "Governador do Mato Grosso do Sul",
      biografia:
        "Eduardo Correa Riedel e politico, empresario e produtor rural brasileiro, filiado aos Progressistas (PP) apos filiacao em 2025; foi eleito governador de Mato Grosso do Sul em 2022 pelo PSDB e esta em exercicio desde 2023. E tratado como candidato a reeleicao em 2026 na imprensa estadual, sem deferimento pelo TSE na data de curadoria.",
    },
    deleteHistoricoRows: [{ cargo: "Vice-Presidente", periodo_inicio: 2023 }],
    historicoFix: {
      cargo: "Governador",
      periodo_inicio: 2023,
      periodo_fim: null,
      partido: "PP",
      estado: "MS",
      eleito_por: "voto direto",
      observacoes:
        "Governador do MS em exercicio; eleito em 2022 pelo PSDB, com filiacao ao PP desde 2025 (Correio do Estado + Governo de MS; curadoria 14.csv).",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "fabio-trad",
    source: "Campo Grande News + PT MS + curadoria 14.csv",
    candidateUpdate: {
      situacao_candidatura: "pre-candidato",
      status: "pre-candidato",
      biografia:
        "Fabio Trad e advogado e politico brasileiro, filiado ao Partido dos Trabalhadores (PT). Foi deputado federal por Mato Grosso do Sul; em 2026 consta como pre-candidato ao governo do estado pelo PT, com lancamento coberto pela imprensa local, sem deferimento pelo TSE na data de curadoria.",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "tadeu-de-souza",
    source: "TSE 2022 SQ 40001619527 + R7/CNN/Metrópoles 2026-04-05 + R7 2026-04-28",
    candidateUpdate: {
      partido_sigla: "PP",
      partido_atual: "Progressistas",
      cargo_atual: null,
      cargo_disputado: "Deputado Federal",
      situacao_candidatura: "pre-candidato",
      biografia:
        "Tadeu de Souza Silva é político brasileiro, foi vice-governador do Amazonas eleito em 2022 pelo Avante e deixou o Executivo estadual em 04/04/2026 no prazo de desincompatibilização eleitoral. Filiado ao Progressistas, aparece em 2026 como pré-candidato a deputado federal.",
    },
    ensureTimelineRows: [
      {
        partido_anterior: "Histórico anterior não determinado",
        partido_novo: "AVANTE",
        ano: 2022,
        data_mudanca: null,
        contexto:
          "Âncora partidária factual do histórico TSE 2022 para vice-governador pelo AVANTE.",
      },
      {
        partido_anterior: "AVANTE",
        partido_novo: "PP",
        ano: 2026,
        data_mudanca: null,
        contexto: "Filiação ao Progressistas observada em cobertura pública de 2026 após saída do Executivo estadual.",
      },
    ],
    historicoFix: {
      cargo: "Vice-Governador",
      periodo_inicio: 2023,
      periodo_fim: 2026,
      partido: "AVANTE",
      estado: "AM",
      eleito_por: "voto direto",
      observacoes:
        "Mandato de vice-governador do Amazonas após eleição de 2022; TSE SQ 40001619527. Mandato encerrado em 04/04/2026 dentro do prazo de desincompatibilização eleitoral.",
    },
  },
  {
    slug: "tadeu-de-souza",
    source: "R7/CNN/Metrópoles 2026-04-05 + deAmazônia entrevista posterior",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Deputado Federal",
      periodo_inicio: 2026,
      periodo_fim: 2026,
      partido: "PP",
      estado: "AM",
      eleito_por: "",
      observacoes:
        "Pré-candidatura a deputado federal em 2026 indicada em entrevistas após o fim do mandato de vice-governador; sem registro deferido no TSE na data de curadoria.",
      proveniencia: "manual",
    },
  },
  {
    slug: "andre-kamai",
    source: "SAPL Camara de Rio Branco 2026-04-11 + A Gazeta do Acre 2025-11 + Folha do Acre 2025-06",
    candidateUpdate: {
      nome_completo: "Andre Kamai da Silva Soares",
      naturalidade: "Rio Branco/AC",
      cargo_atual: "Vereador de Rio Branco (AC)",
      cargo_disputado: "Deputado Federal",
      data_nascimento: "1981-10-31",
      profissao_declarada: "Sociólogo",
      biografia:
        "Andre Kamai da Silva Soares e sociologo e politico brasileiro, filiado ao Partido dos Trabalhadores (PT). Nascido em Rio Branco em 31 de outubro de 1981, foi eleito vereador da capital acreana em 2024 para a legislatura iniciada em 2025. Atuou como assessor em gestoes dos prefeitos Raimundo Angelim e Marcus Alexandre, dos governadores Jorge Viana, Binho Marques e Tiao Viana, e assumiu a presidencia estadual do PT no Acre em julho de 2025. Fontes locais o apontam como pre-candidato a deputado federal em 2026.",
    },
    historicoFix: {
      cargo: "Vereador",
      periodo_inicio: 2025,
      periodo_fim: null,
      partido: "PT",
      estado: "AC",
      eleito_por: "voto direto",
      observacoes: "Eleito vereador de Rio Branco em 2024; mandato iniciado em 2025 (SAPL Camara de Rio Branco 2026-04-11)",
    },
  },
  {
    slug: "andre-kamai",
    source: "SAPL Camara de Rio Branco 2026-04-11",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Presidente estadual do PT-AC",
      periodo_inicio: 2025,
      periodo_fim: null,
      partido: "PT",
      estado: "AC",
      eleito_por: "eleicao partidaria",
      observacoes: "Biografia oficial da Camara informa eleicao para a presidencia estadual do PT no Acre em julho de 2025.",
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
    slug: "tiao-bocalom",
    source: "PSDB oficial 2026-03 + G1 Acre 2026-03-26",
    candidateUpdate: {
      partido_sigla: "PSDB",
      partido_atual: "Partido da Social Democracia Brasileira",
      cargo_atual: null,
      biografia:
        "Sebastiao Bocalom Rodrigues, conhecido como Tiao Bocalom, e politico brasileiro, filiado ao Partido da Social Democracia Brasileira (PSDB). Foi prefeito de Rio Branco entre 2021 e 2026 e deixou o cargo para disputar o governo do Acre nas eleicoes de 2026.",
    },
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 2021,
      periodo_fim: 2026,
      partido: "PP",
      estado: "AC",
      eleito_por: "voto direto",
      observacoes: "Renunciou a Prefeitura de Rio Branco em marco/2026 para disputar o governo do Acre (G1 Acre 2026-03-26)",
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
    slug: "jhc",
    source: "G1 AL 2026-04-04 + Metrópoles 2026-04-04 + Wikipedia PT",
    candidateUpdate: {
      partido_sigla: "PSDB",
      partido_atual: "Partido da Social Democracia Brasileira",
      cargo_atual: null,
      situacao_candidatura: "incerto",
      foto_url: "https://www.camara.leg.br/internet/deputado/bandep/178842.jpg",
      biografia:
        "João Henrique Caldas, conhecido como JHC, é advogado e político brasileiro, filiado ao Partido da Social Democracia Brasileira (PSDB), que hoje preside em Alagoas. Foi prefeito de Maceió de 1 de janeiro de 2021 até 4 de abril de 2026 (reeleito em 2024 pelo PL com 83,25% dos votos válidos); em 2026 deixou o PL e filiou-se ao PSDB. Deixou a Prefeitura para concorrer nas eleições de 2026; o cargo disputado ainda não consta com registro deferido no TSE até a data de curadoria.",
    },
    historicoFix: {
      cargo: "Deputado Estadual",
      periodo_inicio: 2011,
      periodo_fim: 2015,
      partido: "PSB",
      estado: "AL",
      eleito_por: "voto direto",
      observacoes:
        "Trajetória na ALE-AL com filiações PTN (eleito 2010) e Solidariedade até nov/2015; migração ao PSB para projeto federal (Wikipedia PT 2026)",
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
    slug: "jhc",
    source: "Wikipedia PT + TSE (DivulgaCandContas)",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Deputado Federal",
      periodo_inicio: 2015,
      periodo_fim: 2020,
      partido: "PSB",
      estado: "AL",
      eleito_por: "voto direto",
      observacoes: "Mandato até 31/12/2020; posse como prefeito em 01/01/2021 (Wikipedia PT + TSE)",
    },
  },
  {
    slug: "jhc",
    source: "G1 AL 2026-04-04",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 2021,
      periodo_fim: 2026,
      partido: "PL",
      estado: "AL",
      eleito_por: "voto direto",
      observacoes:
        "Prefeitura de Maceió; eleito em 2020 pelo PSB; reeleito em 2024 pelo PL com 83,25% dos votos válidos; renunciou em 04/04/2026 (G1 AL 2026-04-04)",
    },
  },
  {
    slug: "david-almeida",
    source:
      "TSE consulta_cand (ZIP CDN) 2004/2006/2010/2014/2018/2020/2024 AM + notícia TSE 2024-10-07 + G1 AM 2026-03-31 + Metrópoles 2026-03-31",
    candidateUpdate: {
      nome_completo: "David Antônio Abisai Pereira de Almeida",
      partido_sigla: "AVANTE",
      partido_atual: "Avante",
      cargo_atual: null,
      situacao_candidatura: "incerto",
      biografia:
        "David Antônio Abisai Pereira de Almeida é político brasileiro filiado ao Avante em março de 2026, segundo cobertura da imprensa (G1 AM, Metrópoles), para a disputa ao governo do Amazonas após renúncia à Prefeitura de Manaus. O TSE (consulta_cand, Amazonas) registra a legenda em cada pleito relevante: PSL em 2004 (vereador em Manaus); PAN em 2006 (deputado estadual); PMN em 2010; PSD em 2014; PSB em 2018 (candidato a governador); Avante em 2020 e 2024 (prefeito de Manaus). As mudanças de legenda entre um pleito e outro são inferidas entre datas de eleição, sem data certa de filiação quando só há prova eleitoral. Em 2020 e 2024 o partido de candidatura é Avante; coligações municipais podem incluir outras legendas (ex.: MDB em 2024) sem equivaler a filiação do candidato — descartar troca AVANTE→MDB derivada só de composição de coligação ou ruído de agregação. Articulações ou chapas citadas na imprensa em 2026 não substituem essa sequência por pleito nem comprovam filiação intermediária ao MDB. Foi prefeito de Manaus de 1 de janeiro de 2021 a 31 de março de 2026, quando renunciou para disputar o governo do estado; a situação de candidatura em 2026 permanece incerta quanto a registro deferido no TSE na data de curadoria.",
    },
    deleteTimelineRows: [{ partido_anterior: "AVANTE", partido_novo: "MDB", ano: 2020 }],
    ensureTimelineRows: [
      {
        partido_anterior: "Sem partido",
        partido_novo: "PSL",
        ano: 2004,
        data_mudanca: null,
        contexto:
          "Partido na candidatura a vereador em Manaus em 2004 (TSE consulta_cand 2004, AM; SQ_CANDIDATO 451; PSL isolado).",
      },
      {
        partido_anterior: "PSL",
        partido_novo: "PAN",
        ano: 2006,
        data_mudanca: null,
        contexto:
          "Mudança inferida entre pleitos: PSL em 2004 e PAN em 2006 na candidatura a deputado estadual (TSE consulta_cand 2006, AM; SQ_CANDIDATO 10457).",
      },
      {
        partido_anterior: "PAN",
        partido_novo: "PMN",
        ano: 2010,
        data_mudanca: null,
        contexto:
          "Mudança inferida entre pleitos: PAN em 2006 e PMN em 2010 na candidatura a deputado estadual (TSE consulta_cand 2010, AM; SQ_CANDIDATO 40000000404).",
      },
      {
        partido_anterior: "PMN",
        partido_novo: "PSD",
        ano: 2014,
        data_mudanca: null,
        contexto:
          "Mudança inferida entre pleitos: PMN em 2010 e PSD em 2014 na candidatura a deputado estadual (TSE consulta_cand 2014, AM; SQ_CANDIDATO 40000000498).",
      },
      {
        partido_anterior: "PSD",
        partido_novo: "PSB",
        ano: 2018,
        data_mudanca: null,
        contexto:
          "Mudança inferida entre pleitos: PSD em 2014 e PSB em 2018 na candidatura a governador (TSE consulta_cand 2018, AM; SQ_CANDIDATO 40000604136).",
      },
      {
        partido_anterior: "PSB",
        partido_novo: "AVANTE",
        ano: 2020,
        data_mudanca: null,
        contexto:
          "Mudança inferida entre pleitos: PSB em 2018 e Avante em 2020 na candidatura a prefeito de Manaus (TSE consulta_cand 2020, AM; SQ_CANDIDATO 40000868846).",
      },
    ],
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 2021,
      periodo_fim: 2026,
      partido: "AVANTE",
      estado: "AM",
      eleito_por: "voto direto",
      observacoes:
        "Renunciou à Prefeitura de Manaus em 31/03/2026 para disputar o governo do Amazonas (G1 AM + Metrópoles 2026-03-31). Partidos nas candidaturas majoritárias/proporcionais conforme TSE consulta_cand AM: PSL (2004), PAN (2006), PMN (2010), PSD (2014), PSB (2018), Avante (2020 e 2024).",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "omar-aziz",
    source:
      "Auditoria trajetória partidária 2026-04-12 (linha 17) + Senado Federal + DivulgaCandContas TSE + psd.org.br",
    candidateUpdate: {
      situacao_candidatura: "incerto",
      biografia:
        "Omar José Abdel Aziz é político brasileiro, filiado ao Partido Social Democrático (PSD) desde 2011, quando integrou a fundação da legenda no Amazonas. A trajetória partidária consolidada na auditoria de 2026-04-12 e nas fontes oficiais inclui o PPR na candidatura a vereador em Manaus em 1996; a reorganização progressista levou ao PPB em 1997; em 2000 filiou-se ao PFL na disputa de vice-prefeito de Manaus; migrou ao PMN em 2004 e ao PSD em 2011. É senador pelo Amazonas (mandato atual 2023–2031) e foi governador do estado entre 2011 e 2015. Na curadoria não há anúncio formal consolidado em fontes prioritárias de pré-candidatura ao governo do Amazonas em 2026 nem registro deferido no TSE para esse pleito na data de atualização.",
    },
    deleteHistoricoRows: [{ cargo: "Governador", periodo_inicio: 2018 }],
    deleteTimelineRows: [
      { partido_anterior: "Sem partido", partido_novo: "PFL", ano: 1996 },
      { partido_anterior: "PFL", partido_novo: "PMN", ano: 2006 },
      { partido_anterior: "PMN", partido_novo: "PSD", ano: 2014 },
    ],
    ensureTimelineRows: [
      {
        partido_anterior: "Sem partido",
        partido_novo: "PPR",
        ano: 1996,
        data_mudanca: null,
        contexto:
          "Filiação ao PPR para candidatura a vereador em Manaus (DivulgaCandContas TSE 1996; Senado Federal; auditoria 2026-04-12).",
      },
      {
        partido_anterior: "PPR",
        partido_novo: "PPB",
        ano: 1997,
        data_mudanca: null,
        contexto:
          "Quadro progressista após fusão PPR–PP e denominação PPB (auditoria trajetória 2026-04-12 + TSE).",
      },
      {
        partido_anterior: "PPB",
        partido_novo: "PFL",
        ano: 2000,
        data_mudanca: null,
        contexto: "Candidatura a vice-prefeito de Manaus pelo PFL (DivulgaCandContas TSE 2000).",
      },
      {
        partido_anterior: "PFL",
        partido_novo: "PMN",
        ano: 2004,
        data_mudanca: null,
        contexto: "Filiação ao PMN antes do pleito municipal de 2004 (DivulgaCandContas TSE 2004; auditoria 2026-04-12).",
      },
      {
        partido_anterior: "PMN",
        partido_novo: "PSD",
        ano: 2011,
        data_mudanca: null,
        contexto:
          "Filiação ao PSD na fundação da legenda no Amazonas (psd.org.br + Senado Federal; auditoria 2026-04-12).",
      },
    ],
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "omar-aziz",
    source: "Senado Federal + Wikipedia PT + auditoria trajetória 2026-04-12",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Governador",
      periodo_inicio: 2011,
      periodo_fim: 2015,
      partido: "PSD",
      estado: "AM",
      eleito_por: "voto direto",
      observacoes:
        "Mandato estadual 2011–2015 pelo PSD (filiação à legenda desde a fundação em 2011 no AM; Senado Federal + auditoria 2026-04-12; correção de intervalo espúrio 2018).",
    },
  },
  {
    slug: "omar-aziz",
    source: "Senado Federal perfil oficial 5525 + auditoria trajetória 2026-04-12",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Senador",
      periodo_inicio: 2015,
      periodo_fim: null,
      partido: "PSD",
      estado: "AM",
      eleito_por: "voto direto",
      observacoes:
        "Senador pelo Amazonas; mandatos 2015–2023 e 2023–2031; filiação ao PSD desde 2011 (Senado Federal perfil oficial + auditoria 2026-04-12).",
    },
  },
  {
    slug: "beto-faro",
    source: "Senado Federal oficial + Camara dos Deputados (mandatos anteriores)",
    candidateUpdate: {
      situacao_candidatura: "incerto",
      biografia:
        "Jose Beto Faro Pereira e agricultor familiar, sindicalista e politico brasileiro, filiado ao Partido dos Trabalhadores (PT). Foi deputado federal pelo Para em varios mandatos ate 2023 e e senador pelo estado desde 2023. Nao ha, na rodada de curadoria Lote 8, registro deferido no TSE nem anuncio robusto em fontes prioritarias de pre-candidatura ao governo do Para em 2026.",
    },
  },
  {
    slug: "delegado-eder-mauro",
    source: "Camara dos Deputados oficial + PL (pre-candidatura Senado PA 2026)",
    candidateUpdate: {
      cargo_disputado: "Senador",
      situacao_candidatura: "incerto",
      biografia:
        "Eder Braga Mauro, conhecido como Delegado Eder Mauro, e delegado de policia e politico brasileiro, filiado ao Partido Liberal (PL). E deputado federal pelo Para (mandato 2023-2027). O PL o lancou como pre-candidato ao Senado pelo Para nas eleicoes de 2026; a situacao de candidatura permanece incerta ate registro no TSE.",
    },
  },
  {
    slug: "hana-ghassan",
    source: "O Liberal 2026-04-02 + Governo do Para (posse)",
    candidateUpdate: {
      partido_atual: "Movimento Democrático Brasileiro",
      partido_sigla: "MDB",
      cargo_atual: "Governadora do Para",
      situacao_candidatura: "incerto",
      biografia:
        "Hana Ghassan Tuma e servidora publica, contabilista e politica brasileira, filiada ao Movimento Democratico Brasileiro (MDB). Foi secretaria de Planejamento e Administracao do Para (2019-2022), vice-governadora eleita em 2022 e e a governadora do Para desde 2 de abril de 2026, quando assumiu apos a renuncia de Helder Barbalho para disputar o Senado. A situacao de candidatura em 2026 permanece incerta quanto a registro no TSE na data de curadoria.",
    },
    historicoFix: {
      cargo: "Vice-Governador",
      periodo_inicio: 2023,
      periodo_fim: 2026,
      partido: "MDB",
      estado: "PA",
      eleito_por: "voto direto",
      observacoes: "Mandato como vice ate 02/04/2026; sucessao apos renuncia de Helder Barbalho (O Liberal 2026-04-02)",
    },
  },
  {
    slug: "hana-ghassan",
    source: "O Liberal 2026-04-02",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Governador",
      periodo_inicio: 2026,
      periodo_fim: null,
      partido: "MDB",
      estado: "PA",
      eleito_por: "sucessao constitucional",
      observacoes: "Assumiu em 02/04/2026 apos renuncia de Helder Barbalho (O Liberal + Governo do Para)",
    },
  },
  {
    slug: "hana-ghassan",
    source: "Governo do Para / imprensa (secretariado)",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Secretario de Estado",
      periodo_inicio: 2019,
      periodo_fim: 2022,
      partido: "MDB",
      estado: "PA",
      eleito_por: "nomeacao",
      observacoes: "Secretaria de Planejamento e Administracao (2019-2022) — O Liberal / curadoria",
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
      eleito_por: "eleição interna",
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
    source: "ALETO oficial 2023-02-13 + diario oficial ALETO 2026-03 + Conexao Tocantins 2026-05-16",
    candidateUpdate: {
      nome_completo: "Amélio Antunes Cayres",
      partido_sigla: "MDB",
      partido_atual: "Movimento Democrático Brasileiro",
      cargo_atual: "Presidente da Assembleia Legislativa do Tocantins",
      cargo_disputado: "Vice-Governador",
      situacao_candidatura: "pre-candidato",
      biografia:
        "Amélio Antunes Cayres é político brasileiro. É deputado estadual e presidente da Assembleia Legislativa do Tocantins; em maio de 2026 filiou-se ao MDB e teve a pré-candidatura a vice-governador lançada na chapa liderada por Vicentinho Júnior (PSDB).",
    },
    historicoFix: {
      cargo: "Presidente da Assembleia Legislativa do Tocantins",
      periodo_inicio: 2025,
      periodo_fim: null,
      partido: "REPUBLICANOS",
      estado: "TO",
      eleito_por: "eleição interna",
      observacoes:
        "cargo atual verificado manualmente (ALETO oficial 2023-02-13 + diário oficial ALETO 2026-03); filiação atual e pré-candidatura majoritária atualizadas em 2026-05-16 (Conexão Tocantins).",
    },
    deleteTimelineRows: [
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
    source: "Senado Federal (perfil oficial) + G1 AM 2026-04-07",
    candidateUpdate: {
      cargo_atual: "Senador(a)",
      cargo_disputado: "Senador",
      situacao_candidatura: "incerto",
      biografia:
        "Eduardo Braga Granata é empresário e engenheiro eletricista, político brasileiro filiado ao Movimento Democrático Brasileiro (MDB). Senador pelo Amazonas desde 2019, com mandato anterior no Senado (2011-2014), e exerceu os cargos de governador do estado (2003-2010), ministro de Minas e Energia (2015-2016), vice-prefeito de Manaus (1993-1994), deputado federal, deputado estadual e vereador na capital amazonense. Articula reeleição ao Senado em 2026.",
    },
    historicoFix: {
      cargo: "Vereador de Manaus",
      periodo_inicio: 1983,
      periodo_fim: 1988,
      partido: "PMDB",
      estado: "AM",
      eleito_por: "voto direto",
      observacoes:
        "Período aproximado na legislatura da década de 1980 (Wikipedia PT / acervo público; refinar com fonte legislativa primária)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "eduardo-braga",
    source: "Senado Federal (perfil oficial) + G1 AM 2026-04-07",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Deputado Estadual",
      periodo_inicio: 1989,
      periodo_fim: 1990,
      partido: "PMDB",
      estado: "AM",
      eleito_por: "voto direto",
      observacoes: null,
    },
  },
  {
    slug: "eduardo-braga",
    source: "Senado Federal (perfil oficial) + G1 AM 2026-04-07",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Deputado Federal",
      periodo_inicio: 1991,
      periodo_fim: 2002,
      partido: "PMDB",
      estado: "AM",
      eleito_por: "voto direto",
      observacoes: null,
    },
  },
  {
    slug: "eduardo-braga",
    source: "Senado Federal (perfil oficial) + G1 AM 2026-04-07",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Vice-Prefeito de Manaus",
      periodo_inicio: 1993,
      periodo_fim: 1994,
      partido: "PMDB",
      estado: "AM",
      eleito_por: "voto direto",
      observacoes: null,
    },
  },
  {
    slug: "eduardo-braga",
    source: "Senado Federal (perfil oficial) + G1 AM 2026-04-07",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Governador do Amazonas",
      periodo_inicio: 2003,
      periodo_fim: 2010,
      partido: "PMDB",
      estado: "AM",
      eleito_por: "voto direto",
      observacoes: null,
    },
  },
  {
    slug: "eduardo-braga",
    source: "Senado Federal (perfil oficial) + G1 AM 2026-04-07",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Senador",
      periodo_inicio: 2011,
      periodo_fim: 2014,
      partido: "PMDB",
      estado: "AM",
      eleito_por: "voto direto",
      observacoes: null,
    },
  },
  {
    slug: "eduardo-braga",
    source: "Senado Federal (perfil oficial) + G1 AM 2026-04-07",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Ministro de Minas e Energia",
      periodo_inicio: 2015,
      periodo_fim: 2016,
      partido: "PMDB",
      estado: "",
      eleito_por: "nomeacao",
      observacoes: "Governo Dilma Rousseff",
    },
  },
  {
    slug: "eduardo-braga",
    source: "Senado Federal (perfil oficial)",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Senador",
      periodo_inicio: 2019,
      periodo_fim: null,
      partido: "MDB",
      estado: "AM",
      eleito_por: "voto direto",
      observacoes: "Mandato em curso; cargo atual verificado manualmente (Senado Federal oficial)",
    },
  },
  {
    slug: "maria-do-carmo",
    source: "TSE DivulgaCand consulta_cand_2022 AM (SQ_CANDIDATO 40001650567; DS_SIT_TOT_TURNO NÃO ELEITO)",
    candidateUpdate: {},
    historicoFix: {
      cargo: "1o Suplente Senador",
      periodo_inicio: 2022,
      periodo_fim: 2022,
      partido: "PSDB",
      estado: "AM",
      observacoes: "Candidatura: NÃO ELEITO (TSE 2022)",
    },
  },
  {
    slug: "maria-do-carmo",
    source: "A Crítica + CNN Brasil + G1 AM",
    candidateUpdate: {
      partido_sigla: "PL",
      partido_atual: "Partido Liberal",
      cargo_atual: null,
      profissao_declarada: "Empresária",
      situacao_candidatura: "incerto",
      foto_url: null,
      biografia:
        "Maria do Carmo Seffair (PL) é empresária, educadora e pré-candidata ao governo do Amazonas em 2026. Reitora do Centro Universitário Fametro, entrou recentemente na política como pré-candidata à prefeitura de Manaus em 2024 e, em 2026, como pré-candidata ao governo do Amazonas pelo PL. Em 2022, candidatura registrada no TSE como 1ª suplente de senadora pelo PSDB no Amazonas (pleito geral; não eleita). Sem mandato eletivo anterior verificado nas fontes de curadoria além desse registro eleitoral; situação de candidatura em 2026 sem registro deferido no TSE na data de atualização.",
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
    slug: "clecio-luis",
    source: "G1 AP 2022-10-02 + G1 AP 2026-01-30 + Wikipedia PT (carreira)",
    candidateUpdate: {
      partido_sigla: "UNIAO",
      partido_atual: "União Brasil",
      cargo_atual: "Governador do Amapá",
      biografia:
        "Clécio Luís Vilhena Vieira é geógrafo, professor e político brasileiro, filiado ao União Brasil. Foi vereador e prefeito de Macapá; eleito governador do Amapá em 2022, exerce o cargo desde 2023 e articula a própria reeleição em 2026.",
    },
    deleteTimelineRows: [
      {
        partido_novo: "SOLIDARIEDADE",
        ano: 2026,
      },
    ],
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "clecio-luis",
    source:
      "Curadoria §15.3 (2026-04-15): GitHub #34 — remover **Governador** **2006** pleito PSOL (artefato TSE/histórico que criava transição **PSOL→Solidariedade** no mesmo `cargo_canonico` sem aresta na timeline) e **Senador** **2011–2019** com `partido` vazio (sem mandato federal verificado nas fontes curadas — Wikipedia PT + G1 AP + perfil público). Materializar pleito **Governador** **2026** **UNIAO** para alinhar `mudancas_partido` **Solidariedade→UNIAO/2026** (G1 AP 2026-01-30 + site União Brasil).",
    candidateUpdate: {},
    deleteHistoricoRows: [
      { cargo: "Governador", periodo_inicio: 2006, tipo_evento: "candidatura" },
      { cargo: "Senador", periodo_inicio: 2011, tipo_evento: "mandato" },
    ],
    historicoFix: {
      cargo: "Governador",
      periodo_inicio: 2026,
      periodo_fim: 2026,
      partido: "UNIAO",
      estado: "AP",
      eleito_por: "",
      observacoes:
        "candidatura: filiação ao União Brasil em 2026 (G1 AP 2026-01-30 + uniaobrasil.org.br; espelha Solidariedade→UNIAO na timeline).",
    },
  },
  {
    slug: "leandro-grass",
    source: "G1 + Metrópoles + Brasil 247 2026 + Wikipedia + curadoria 13.csv",
    candidateUpdate: {
      cargo_atual: null,
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      biografia:
        "Leandro Grass Peixoto é político e militante brasileiro, filiado ao Partido dos Trabalhadores (PT). Foi deputado distrital, presidente do IPHAN entre 2023 e 2026, quando deixou o cargo para se lançar como pré-candidato ao governo do Distrito Federal, sem registro deferido no TSE na data de curadoria.",
    },
    deleteHistoricoRows: [{ cargo: "Governador", periodo_inicio: 2022 }],
    historicoFix: {
      cargo: "Presidente do IPHAN",
      periodo_inicio: 2023,
      periodo_fim: 2026,
      partido: "PT",
      estado: "DF",
      eleito_por: "nomeacao",
      observacoes: "Desincompatibilização para pleito ao governo do DF em 2026 (G1 + Metrópoles + curadoria 13.csv)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "leandro-grass",
    source: "TSE (mandato distrital)",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Deputado Distrital",
      periodo_inicio: 2019,
      periodo_fim: 2023,
      partido: "REDE",
      estado: "DF",
      eleito_por: "voto direto",
      observacoes: "Mandato na CLDF; federação Brasil da Esperança no pleito de 2022 (TSE + curadoria 13.csv)",
    },
  },
  {
    slug: "leandro-grass",
    source: "TSE (pleito 2022)",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Governador",
      periodo_inicio: 2022,
      periodo_fim: 2022,
      partido: "PT",
      estado: "DF",
      eleito_por: "",
      observacoes: "candidatura: pleito ao governo do DF em 2022 (TSE; não exerceu mandato)",
    },
  },
  {
    slug: "orleans-brandao",
    source: "G1 + O Imparcial MA + Gilberto Leda + curadoria 13.csv",
    candidateUpdate: {
      nome_completo: "Carlos Orleans Brandão Junior",
      partido_sigla: "MDB",
      partido_atual: "Movimento Democrático Brasileiro",
      cargo_atual: "Governador do Maranhão",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      formacao: "Administração",
      profissao_declarada: "Administrador",
      biografia:
        "Carlos Orleans Brandão Junior é empresário e político brasileiro, filiado ao Movimento Democrático Brasileiro (MDB) e governador do Maranhão. Foi vice-governador e deputado federal; articula possível reeleição em 2026, sem registro deferido no TSE na data de curadoria.",
    },
    historicoFix: {
      cargo: "Governador",
      periodo_inicio: 2022,
      periodo_fim: null,
      partido: "MDB",
      estado: "MA",
      eleito_por: "voto direto",
      observacoes: "Mandato estadual atual (G1 + curadoria 13.csv)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "orleans-brandao",
    source: "TSE + curadoria 13.csv",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Vice-Governador",
      periodo_inicio: 2015,
      periodo_fim: 2022,
      partido: "MDB",
      estado: "MA",
      eleito_por: "voto direto",
      observacoes: "Vice na chapa de Flávio Dino; filiações PSDB/MDB conforme registros públicos (curadoria 13.csv)",
    },
  },
  {
    slug: "orleans-brandao",
    source: "Câmara dos Deputados / TSE",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Deputado Federal",
      periodo_inicio: 2007,
      periodo_fim: 2011,
      partido: "PSDB",
      estado: "MA",
      eleito_por: "voto direto",
      observacoes: "Mandato federal (TSE + curadoria 13.csv)",
    },
  },
  {
    slug: "joao-henrique-catan",
    source: "ALEMS 2025 + ALEMS 2026 + NOVO oficial 2026 + curadoria 14.csv — split S15.3 lote 4",
    candidateUpdate: {
      partido_sigla: "NOVO",
      partido_atual: "Partido Novo",
      cargo_atual: "Deputado Estadual em MS",
      situacao_candidatura: "pre-candidato",
      status: "pre-candidato",
      profissao_declarada: "Advogado",
      biografia:
        "Joao Henrique Catan e deputado estadual em Mato Grosso do Sul e, em 2026, pre-candidato ao governo do estado pelo Partido Novo, apos filiacao ao NOVO e saida do PL conforme imprensa e registros da Assembleia (ALEMS + NOVO; curadoria 14.csv).",
    },
    deleteHistoricoRows: [
      { cargo: "Deputado Federal", periodo_inicio: 2023 },
      { cargo: "Deputado Estadual", periodo_inicio: 2023 },
    ],
    historicoFix: {
      cargo: "Deputado Estadual",
      periodo_inicio: 2019,
      periodo_fim: 2026,
      partido: "PL",
      estado: "MS",
      eleito_por: "voto direto",
      observacoes:
        "Deputado estadual em MS antes da filiação ao NOVO em 2026; eleição de 2022 pelo PL e mandato em curso até a migração partidária (TSE + ALEMS + NOVO; curadoria S15.3 lote 4).",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "joao-henrique-catan",
    source: "NOVO oficial 2026 + ALEMS — curadoria S15.3 lote 4",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Deputado Estadual",
      periodo_inicio: 2026,
      periodo_fim: null,
      partido: "NOVO",
      estado: "MS",
      eleito_por: "voto direto",
      observacoes:
        "Mesmo mandato estadual após filiação ao Partido Novo e lançamento como pré-candidato ao governo de MS em março de 2026 (NOVO oficial + ALEMS; curadoria S15.3 lote 4).",
    },
  },
  {
    slug: "joao-henrique-catan",
    source:
      "Remediação P0 2026-04-15: eliminar par NOVO↔PL em 2026 (`same_year_reversal`) e fixar filiação única ao NOVO.",
    candidateUpdate: {},
    deleteTimelineRows: [
      { partido_anterior: "PL", partido_novo: "NOVO", ano: 2026 },
      { partido_anterior: "NOVO", partido_novo: "PL", ano: 2026 },
    ],
    ensureTimelineRows: [
      {
        partido_anterior: "PL",
        partido_novo: "NOVO",
        ano: 2026,
        data_mudanca: "2026-04-02",
        contexto:
          "Filiação ao NOVO consolidada conforme ALEMS e `partido_sigla` público (ALEMS + NOVO; remediação 2026-04-15).",
      },
    ],
  },
  {
    slug: "lucien-rezende",
    source: "Campo Grande News + MidiaMax + curadoria 14.csv",
    candidateUpdate: {
      profissao_declarada: "Empresário",
      situacao_candidatura: "pre-candidato",
      status: "pre-candidato",
      biografia:
        "Lucien Miranda de Rezende e pequeno produtor rural, ex-secretario de Desenvolvimento de Ribas do Rio Pardo (MS) e presidente estadual do Partido Socialismo e Liberdade (PSOL) em MS, lancado em 2026 como pre-candidato ao governo do estado (Campo Grande News + MidiaMax; curadoria 14.csv). A trajetoria publica descrita nas fontes desta rodada nao inclui mandatos como deputado federal, senador ou vereador.",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "janaina-riva",
    source: "ALMT (mandato em curso) + PlatoBR / O Livre 2025–2026",
    candidateUpdate: {
      nome_completo: "Janaina Riva",
      partido_atual: "Movimento Democrático Brasileiro",
      partido_sigla: "MDB",
      cargo_atual: "Deputada Estadual",
      cargo_disputado: "Senador",
      situacao_candidatura: "pre-candidato",
      biografia:
        "Janaina Riva é empresária e política brasileira, filiada ao Movimento Democrático Brasileiro (MDB). Exerce mandato de deputada estadual por Mato Grosso desde 2015 e figura como pré-candidata ao Senado em 2026 nas reportagens consultadas, sem registro deferido no TSE na data de curadoria.",
    },
    deleteHistoricoRows: [
      { cargo: "Deputada Estadual", periodo_inicio: 2019 },
      { cargo: "Deputado Estadual", periodo_inicio: 2019 },
    ],
    historicoFix: {
      cargo: "Deputada Estadual",
      periodo_inicio: 2015,
      periodo_fim: null,
      partido: "MDB",
      estado: "MT",
      eleito_por: "voto direto",
      observacoes: "Mandato na Assembleia Legislativa de MT desde 2015 (ALMT + imprensa MT 2026)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "hildon-chaves",
    source: "Portal364 2026-03 + News Rondonia 2026-03-20 + Eu Ideal 2026-03",
    candidateUpdate: {
      partido_atual: "União Brasil",
      partido_sigla: "UNIAO",
      cargo_atual: null,
      situacao_candidatura: "pre-candidato",
      biografia:
        "Hildon de Lima Chaves é advogado e empresário, filiado ao União Brasil. Foi prefeito de Porto Velho por dois mandatos (2017–2024), filiado ao PSDB nesse período, e em 2026 aparece como pré-candidato ao governo de Rondônia.",
    },
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 2017,
      periodo_fim: 2024,
      partido: "PSDB",
      estado: "RO",
      eleito_por: "voto direto",
      observacoes: "Prefeito de Porto Velho (Eu Ideal 2026-03 + Portal364 2026-03)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "expedito-netto",
    source: "G1/O Globo Eleicoes 2026-04-08 + filiacao PT jan/2026",
    candidateUpdate: {
      nome_completo: "Expedito Gonçalves Ferreira Netto",
      cargo_atual: null,
      situacao_candidatura: "pre-candidato",
      biografia:
        "Expedito Gonçalves Ferreira Netto é bacharel em Direito, empresário e político brasileiro, filiado ao Partido dos Trabalhadores (PT). Foi deputado federal por Rondônia em mandatos anteriores; em 2026 é secretário nacional de Pesca e Aquicultura no governo federal e figura como pré-candidato ao governo de Rondônia, sem deferimento pelo TSE na data de curadoria.",
    },
    historicoFix: {
      cargo: "Secretário Nacional de Pesca e Aquicultura",
      periodo_inicio: 2023,
      periodo_fim: null,
      partido: "PT",
      estado: "BR",
      eleito_por: "nomeacao",
      observacoes: "Cargo no governo federal (G1/O Globo Eleicoes 2026-04-08)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "marcos-rogerio",
    source: "CNN Brasil 2026-04-11 + Senado Federal oficial",
    candidateUpdate: {
      nome_completo: "Marcos Rogério da Silva Brito",
      situacao_candidatura: "pre-candidato",
      biografia:
        "Marcos Rogério da Silva Brito é jornalista e político brasileiro, filiado ao Partido Liberal (PL). É senador por Rondônia desde 2019 (mandato 2019–2027) e figura como pré-candidato ao governo do estado em 2026.",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "professora-dorinha",
    source: "Senado Federal oficial + Uniao Brasil 2026-03-26",
    candidateUpdate: {
      situacao_candidatura: "pre-candidato",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "vicentinho-junior",
    source: "Camara dos Deputados oficial + Jornal Opcao TO 2026-02-20 + G1/O Globo Eleicoes 2026-04-08",
    candidateUpdate: {
      nome_completo: "Vicente Alves de Oliveira Júnior",
      partido_sigla: "PSDB",
      partido_atual: "Partido da Social Democracia Brasileira",
      situacao_candidatura: "pre-candidato",
      biografia:
        "Vicente Alves de Oliveira Júnior é empresário e político brasileiro. Exerce mandato de deputado federal pelo Tocantins na legislatura 2023–2027 com registro de filiação pelo Progressistas (PP) na Câmara; em 2026 é tratado como pré-candidato ao governo do estado pelo PSDB, sem deferimento pelo TSE na data de curadoria.",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "gilberto-kassab",
    source: "Governo de SP oficial + CNN 2026-03-25 + curadoria 17.csv",
    candidateUpdate: {
      partido_sigla: "PSD",
      partido_atual: "Partido Social Democrático",
      cargo_atual: "Secretário de Governo e Relações Institucionais de São Paulo",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      biografia:
        "Gilberto Kassab é engenheiro civil, economista, empresário e político brasileiro, filiado ao Partido Social Democrático (PSD), legenda que preside nacionalmente. Foi vereador e deputado em mandatos anteriores, prefeito de São Paulo (2006–2012), ministro das Cidades (2015–2016) e ministro da Ciência, Tecnologia, Inovações e Comunicações (2016–2018); é secretário de Governo e Relações Institucionais do estado de São Paulo desde 2023. Citado em cenários para 2026, sem definição fechada de pleito na data de curadoria.",
    },
    historicoFix: {
      cargo: "Secretário de Governo e Relações Institucionais de São Paulo",
      periodo_inicio: 2023,
      periodo_fim: null,
      partido: "PSD",
      estado: "SP",
      eleito_por: "nomeacao",
      observacoes: "Mandato no executivo estadual (Governo de SP + curadoria 17.csv)",
    },
    ensureCurrentPartyTimeline: true,
  },
  // Fechamento editorial: filiação ao Republicanos referendada no site nacional do partido (ARCO, 17/12/2025),
  // identidade eleitoral TSE/TRE-SE (2022) e renúncia à prefeitura em abril/2026.
  {
    slug: "valmir-de-francisquinho",
    source:
      "Republicanos10 https://republicanos10.org.br/destaques-2/emilia-correa-assume-presidencia-do-republicanos-sergipe/ + https://republicanos10.org.br/arco/republicanos-sergipe-filia-os-deputados-federais-thiago-de-joaldo-e-icaro-de-valmir/ + TSE/TRE-SE 2022 + DivulgaCandContas + portal itabaiana.se.leg.br",
    candidateUpdate: {
      partido_atual: "Republicanos",
      partido_sigla: "REPUBLICANOS",
      cargo_atual: null,
      situacao_candidatura: "pre-candidato",
      biografia:
        "Valmir dos Santos Costa, conhecido como Valmir de Francisquinho, é empresário e político brasileiro, filiado ao Republicanos. A composição da diretoria estadual publicada no site oficial do partido em 17 de dezembro de 2025 já o apresenta como filiado ao Republicanos e 1ª vice-presidente estadual; isso comprova a legenda na data de publicação da nota, sem substituir certidão individual de filiação com dia exato no TSE/Filiaweb. Trajetória partidária anterior documentada em registros eleitorais: Progressistas (PP, após sucessão do PPB), PSB, PR, legenda que em 2019 passou a denominar-se PL, com filiação consolidada ao PL no pleito de 2022. Foi prefeito de Itabaiana (2013-2020), teve registro de candidatura ao governo de Sergipe indeferido pelo TSE em 2022 e renunciou à prefeitura em abril de 2026 para disputar novamente o governo estadual.",
    },
    deleteHistoricoRows: [{ cargo: "Prefeito", periodo_inicio: 2025 }],
    deleteTimelineRows: [
      { partido_anterior: "REPUBLICANOS", partido_novo: "PL", ano: 2026 },
      { partido_anterior: "PL", partido_novo: "REPUBLICANOS", ano: 2026 },
      // `uq_mudancas_partido_candidato_ano_partido` impede duas linhas no mesmo ano com o mesmo
      // partido_novo; o scraping TSE pode ter deixado outro partido_anterior para o mesmo destino.
      { partido_novo: "PP", ano: 2004 },
      { partido_novo: "PSB", ano: 2008 },
      { partido_novo: "PR", ano: 2012 },
      { partido_novo: "PL", ano: 2022 },
      { partido_novo: "REPUBLICANOS", ano: 2025 },
      { partido_novo: "REPUBLICANOS", ano: 2026 },
    ],
    ensureTimelineRows: [
      {
        partido_anterior: "Sem partido",
        partido_novo: "PP",
        ano: 2004,
        contexto:
          "Quadro progressista após sucessão PPB–PP; filiação alinhada a Itabaiana/SE (TSE; auditoria trajetória 2026-04-12).",
      },
      {
        partido_anterior: "PP",
        partido_novo: "PSB",
        ano: 2008,
        contexto: "Mudança observada entre pleitos (TSE; auditoria trajetória 2026-04-12).",
      },
      {
        partido_anterior: "PSB",
        partido_novo: "PR",
        ano: 2012,
        contexto: "Mudança observada entre pleitos (TSE; auditoria trajetória 2026-04-12).",
      },
      {
        partido_anterior: "PR",
        partido_novo: "PL",
        ano: 2022,
        contexto:
          "O PR passou a denominar-se PL em 2019; filiação consolidada ao PL no contexto eleitoral de 2022 (TSE DivulgaCandContas 2022; auditoria trajetória 2026-04-12).",
      },
      {
        partido_anterior: "PL",
        partido_novo: "REPUBLICANOS",
        ano: 2025,
        data_mudanca: null,
        contexto:
          "Transição PL→Republicanos no âmbito de 2025: nota oficial do Republicanos Sergipe publicada em 17/12/2025 no site republicanos10.org.br já lista o prefeito de Itabaiana Valmir de Francisquinho como filiado ao Republicanos e 1ª vice-presidente estadual (data de publicação da nota; não equivale a certidão de filiação com dia exato).",
      },
    ],
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 2013,
      periodo_fim: 2020,
      partido: "PR",
      estado: "SE",
      eleito_por: "voto direto",
      observacoes:
        "Prefeituras em Itabaiana; mandato iniciado após pleito de 2012 (PSB→PR na trajetória partidária); continuidade PR/PL até consolidação no PL em 2022; filiação ao Republicanos corroborada por nota oficial do partido com publicação em 17/12/2025 (Republicanos10; data da publicação, não certidão individual de filiação).",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "fabio-mitidieri",
    source: "CNN Brasil + Governo de Sergipe oficial 2026",
    candidateUpdate: {
      partido_sigla: "PSD",
      partido_atual: "Partido Social Democrático",
      situacao_candidatura: "pre-candidato",
      biografia:
        "Fábio Mitidieri de Amorim é empresário e político brasileiro, filiado ao Partido Social Democrático (PSD). É governador de Sergipe desde 2023 e foi deputado federal (2015–2023); em 2026 conduz pré-candidatura à reeleição ao governo do estado.",
    },
    historicoFix: {
      cargo: "Governador",
      periodo_inicio: 2023,
      periodo_fim: null,
      partido: "PSD",
      estado: "SE",
      eleito_por: "voto direto",
      observacoes: "Mandato estadual com PSD (Governo de Sergipe + CNN Brasil 2026)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "fabio-mitidieri",
    source: "CNN Brasil + Câmara dos Deputados / TSE (mandato federal anterior)",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Deputado Federal",
      periodo_inicio: 2015,
      periodo_fim: 2023,
      partido: "PSD",
      estado: "SE",
      eleito_por: "voto direto",
      observacoes: "Mandato federal anterior ao governo estadual (Câmara dos Deputados / TSE)",
    },
  },
  // lote 10
  {
    slug: "joel-rodrigues",
    source: "O Globo + YouTube (lançamento PP PI 2026) + Parlamento Piauí 2026",
    candidateUpdate: {
      nome_completo: "Joel Rodrigues de Castro",
      situacao_candidatura: null,
      status: "pre-candidato",
      biografia:
        "Joel Rodrigues de Castro é servidor público e político brasileiro, filiado ao Progressistas (PP). Foi vereador e prefeito de Floriano (2013–2020) e exerceu mandato no Senado Federal como suplente pelo Piauí após 2021; em 2026 foi lançado como pré-candidato ao governo do estado pelo PP, sem registro deferido no TSE na data de curadoria.",
    },
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 2013,
      periodo_fim: 2020,
      partido: "PP",
      estado: "PI",
      eleito_por: "voto direto",
      observacoes: "Prefeitura de Floriano (O Globo + Parlamento Piauí 2026)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "joel-rodrigues",
    source: "Senado Federal / imprensa (mandato de suplente)",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Senador",
      periodo_inicio: 2021,
      periodo_fim: null,
      partido: "PP",
      estado: "PI",
      eleito_por: "suplencia",
      observacoes: "Exercício de mandato como suplente no Senado após 2021 (Senado Federal + curadoria 11.csv)",
    },
  },
  {
    slug: "joel-rodrigues",
    source: "Imprensa local (mandato municipal anterior)",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Vereador",
      periodo_inicio: 2005,
      periodo_fim: 2012,
      partido: "PP",
      estado: "PI",
      eleito_por: "voto direto",
      observacoes: "Mandatos como vereador em Floriano nos anos 2000 (curadoria 11.csv; períodos aproximados)",
    },
  },
  {
    slug: "joel-rodrigues",
    source:
      "Remediação P0 2026-04-15: `incomplete_timeline` — duas linhas em 2016 (PTB→PV e PV→PP) fazem o último `partido_novo` por ano cair em PV; consolidar PTB→PP e suprimir o elo PV intermédio (TSE + curadoria 11.csv).",
    candidateUpdate: {},
    deleteTimelineRows: [
      { partido_anterior: "PTB", partido_novo: "PV", ano: 2016 },
      { partido_anterior: "PV", partido_novo: "PP", ano: 2016 },
    ],
    ensureTimelineRows: [
      {
        partido_anterior: "PTB",
        partido_novo: "PP",
        ano: 2016,
        data_mudanca: null,
        contexto:
          "Mandato municipal com filiação ao PP após sucessão partidária em 2016 (TSE; remediação `incomplete_timeline` 2026-04-15).",
      },
    ],
  },
  {
    slug: "requiao-filho",
    source: "Brasil de Fato + YouTube + Gazeta do Povo + curadoria 18.csv",
    candidateUpdate: {
      partido_sigla: "PDT",
      partido_atual: "Partido Democrático Trabalhista",
      cargo_atual: "Deputado Estadual",
      situacao_candidatura: "pre-candidato",
      status: "pre-candidato",
      biografia:
        "Maurício Thadeu de Mello e Silva, conhecido como Requião Filho, é advogado e político brasileiro, filiado ao Partido Democrático Trabalhista (PDT) desde 2025, quando lançou pré-candidatura ao governo do Paraná. É deputado estadual; é filho do ex-governador Roberto Requião.",
    },
    historicoFix: {
      cargo: "Deputado Estadual",
      periodo_inicio: 2015,
      periodo_fim: null,
      partido: "PDT",
      estado: "PR",
      eleito_por: "voto direto",
      observacoes:
        "Mandato na ALEP; filiação ao PDT desde 2025 para o pleito estadual (Brasil de Fato + curadoria 18.csv)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "douglas-ruas",
    source: "Jovem Pan News / YouTube + Agência Brasil 2026",
    candidateUpdate: {
      nome_completo: "Douglas Ruas dos Santos",
      cargo_atual: "Deputado Estadual",
      situacao_candidatura: "pre-candidato",
      biografia:
        "Douglas Ruas dos Santos é político brasileiro, filiado ao Partido Liberal (PL). É deputado estadual pelo Rio de Janeiro e foi lançado pelo partido como pré-candidato ao governo do estado em 2026, sem registro deferido no TSE na data de curadoria.",
    },
  },
  {
    slug: "otaviano-pivetta",
    source: "ALMT + Republicanos (mandato e interinidades) 2026 — curadoria 15.csv",
    candidateUpdate: {
      cargo_atual: "Vice-Governador de Mato Grosso",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      biografia:
        "Otaviano Pivetta é empresário do agronegócio e político brasileiro, filiado ao Republicanos. Foi prefeito de Lucas do Rio Verde (1997–2004 e 2009–2012) e é vice-governador de Mato Grosso desde 2019, com exercícios interinos da governadoria em 2025–2026 após a renúncia de Mauro Mendes. O desenho exato do pleito majoritário em 2026 permanece incerto nas fontes prioritárias desta rodada.",
    },
    deleteHistoricoRows: [{ cargo: "Governador de Mato Grosso", periodo_inicio: 2026 }],
  },
  {
    slug: "otaviano-pivetta",
    source: "ALMT + TSE + Republicanos oficial 2022 — curadoria S15.3 lote 4",
    candidateUpdate: {},
    deleteHistoricoRows: [
      {
        cargo: "Vice-Governador de Mato Grosso",
        periodo_inicio: 2019,
        tipo_evento: "mandato",
        observacoes_includes: "filiação atual Republicanos",
      },
    ],
  },
  {
    slug: "otaviano-pivetta",
    source: "ALMT (interinidade) + Republicanos 2026",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Governador em exercício de Mato Grosso",
      periodo_inicio: 2025,
      periodo_fim: 2026,
      partido: "REPUBLICANOS",
      estado: "MT",
      eleito_por: "sucessao",
      observacoes:
        "Períodos de substituição temporária na governadoria entre 2025 e 2026, sem confundir com mandato eletivo titular (ALMT + curadoria 15.csv)",
    },
  },
  {
    slug: "otaviano-pivetta",
    source: "TSE / prefeitura Lucas do Rio Verde (mandatos municipais) — curadoria S15.3 lote 4",
    candidateUpdate: {},
    ensureTimelineRows: [
      {
        partido_anterior: "PDT",
        partido_novo: "PPS",
        ano: 2000,
        data_mudanca: null,
        contexto:
          "Transição materializada entre a prefeitura iniciada pelo PDT e o registro TSE 2000 para Prefeito de Lucas do Rio Verde pelo PPS (TSE DivulgaCandContas 2000; curadoria S15.3 lote 4).",
      },
    ],
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 1997,
      periodo_fim: 2004,
      partido: "PDT",
      estado: "MT",
      eleito_por: "voto direto",
      observacoes: "Prefeitura de Lucas do Rio Verde — primeiro período (TSE e registros municipais)",
    },
  },
  {
    slug: "otaviano-pivetta",
    source: "TSE / prefeitura Lucas do Rio Verde (mandatos municipais)",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 2009,
      periodo_fim: 2012,
      partido: "PDT",
      estado: "MT",
      eleito_por: "voto direto",
      observacoes: "Prefeitura de Lucas do Rio Verde — segundo período (TSE e registros municipais)",
    },
  },
  {
    slug: "marcelo-brigadeiro",
    source: "Fesporte-SC 2020-08-07 + SCTodoDia 2026-01-09 + NSC Total + curadoria 19.csv",
    candidateUpdate: {
      partido_atual: "Partido Missao",
      partido_sigla: "MISSAO",
      cargo_atual: null,
      profissao_declarada: "Médico Veterinário",
      situacao_candidatura: null,
      status: "pre-candidato",
      biografia:
        "Marcelo Brigadeiro e empresario, ex-lutador de MMA e influenciador digital, filiado ao Partido Missao. Em janeiro de 2026 confirmou a pre-candidatura ao governo de Santa Catarina pela legenda; sem registro deferido no TSE na data de curadoria (NSC Total + curadoria 19.csv).",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "edegar-pretto",
    source: "Metropoles + YouTube + Facebook / PT RS + curadoria 19.csv",
    candidateUpdate: {
      cargo_atual: null,
      cargo_disputado: "Nenhum",
      status: "desistente",
      situacao_candidatura: null,
      biografia:
        "Edegar Pretto e dirigente gaucho do Partido dos Trabalhadores (PT), ex-deputado estadual pelo Rio Grande do Sul e ex-presidente da Conab (indicacao do governo federal), tendo deixado a autarquia em 2026. Foi pre-candidato ao governo do RS em 2026 ate abril, quando retirou a pre-candidatura apos decisao do PT de apoiar Juliana Brizola (PDT) (Metropoles + curadoria 19.csv).",
    },
    deleteHistoricoRows: [{ cargo: "Governador", periodo_inicio: 2022 }],
    historicoFix: {
      cargo: "Deputado Estadual",
      periodo_inicio: 2011,
      periodo_fim: 2019,
      partido: "PT",
      estado: "RS",
      eleito_por: "voto direto",
      observacoes: "Mandato na Assembleia Legislativa do RS (Metropoles + curadoria 19.csv)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "edegar-pretto",
    source: "Governo federal / imprensa economica + curadoria 19.csv",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Presidente da Conab",
      periodo_inicio: 2023,
      periodo_fim: 2026,
      partido: "PT",
      estado: "BR",
      eleito_por: "nomeacao",
      observacoes: "Presidencia da Conab; saida em 2026 conforme curadoria 19.csv (Metropoles)",
    },
  },
  {
    slug: "edegar-pretto",
    source: "Metropoles + curadoria 19.csv",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Governador",
      periodo_inicio: 2026,
      periodo_fim: 2026,
      partido: "PT",
      estado: "RS",
      eleito_por: "",
      observacoes:
        "candidatura: pre-candidatura ao governo do RS em 2026 ate abril, quando retirou apos apoio do PT a Juliana Brizola (PDT) (Metropoles)",
    },
  },
  {
    slug: "gabriel-souza",
    source: "Wikipedia + Gabinete do Vice-Governador RS + curadoria 19.csv",
    candidateUpdate: {
      situacao_candidatura: null,
      status: "pre-candidato",
      biografia:
        "Gabriel Souza e politico brasileiro, filiado ao Movimento Democratico Brasileiro (MDB). Foi deputado estadual pelo Rio Grande do Sul (2015-2023) e e vice-governador do RS desde 2023; o MDB o trata como nome posto no debate interno ao governo em 2026, sem registro deferido no TSE na data de curadoria (Wikipedia + curadoria 19.csv).",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "juliana-brizola",
    source: "Metropoles + PDT + curadoria 19.csv",
    candidateUpdate: {
      data_nascimento: "1975-08-03",
      formacao: "Direito",
      foto_url: "https://upload.wikimedia.org/wikipedia/commons/e/e7/JulianaFotoWiki.jpg",
      cargo_atual: null,
      situacao_candidatura: null,
      status: "pre-candidato",
      biografia:
        "Juliana Daudt Brizola e advogada e politica brasileira, filiada ao Partido Democratico Trabalhista (PDT). Foi vereadora de Porto Alegre e deputada estadual do Rio Grande do Sul; em 2026 e pre-candidata ao governo do RS pelo PDT com apoio do PT apos a retirada de Edegar Pretto (Metropoles + curadoria 19.csv).",
    },
    deleteHistoricoRows: [{ cargo: "Deputada Estadual", periodo_inicio: 2011 }],
    historicoFix: {
      cargo: "Vereador",
      periodo_inicio: 2013,
      periodo_fim: 2014,
      partido: "PDT",
      estado: "RS",
      eleito_por: "voto direto",
      observacoes: "Vereadora de Porto Alegre (Metropoles + curadoria 19.csv)",
    },
  },
  {
    slug: "juliana-brizola",
    source: "Metropoles + curadoria 19.csv",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Deputado Estadual",
      periodo_inicio: 2015,
      periodo_fim: 2018,
      partido: "PDT",
      estado: "RS",
      eleito_por: "voto direto",
      observacoes: "Primeiro periodo como deputada estadual (Metropoles + curadoria 19.csv)",
    },
  },
  {
    slug: "juliana-brizola",
    source: "Metropoles + curadoria 19.csv",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Deputado Estadual",
      periodo_inicio: 2019,
      periodo_fim: 2022,
      partido: "PDT",
      estado: "RS",
      eleito_por: "voto direto",
      observacoes: "Segundo periodo como deputada estadual (Metropoles + curadoria 19.csv)",
    },
  },
  {
    slug: "luciano-zucco",
    source: "Camara dos Deputados + O Globo + curadoria 19.csv",
    candidateUpdate: {
      partido_sigla: "PL",
      partido_atual: "Partido Liberal",
      cargo_atual: "Deputado Federal",
      situacao_candidatura: null,
      status: "pre-candidato",
      biografia:
        "Luciano Lorenzini Zucco e militar da reserva e politico brasileiro, filiado ao Partido Liberal (PL). Foi deputado estadual pelo RS pelo PSL (2019-2022) e e deputado federal pelo RS na legislatura iniciada em 2023 (eleito em 2022), apos passagem pelo PSL e Republicanos na legislatura anterior conforme registros da Camara; e citado como pre-candidato ao governo do RS em 2026 pelo PL (O Globo + curadoria 19.csv).",
    },
    deleteHistoricoRows: [{ cargo: "Deputado Federal", periodo_inicio: 2022 }],
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "luciano-zucco",
    source: "Camara dos Deputados + curadoria 19.csv",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Deputado Estadual",
      periodo_inicio: 2019,
      periodo_fim: 2022,
      partido: "PSL",
      estado: "RS",
      eleito_por: "voto direto",
      observacoes: "Mandato estadual pelo PSL (curadoria 19.csv)",
    },
  },
  {
    slug: "luciano-zucco",
    source: "Camara dos Deputados + curadoria 19.csv",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Deputado Federal",
      periodo_inicio: 2023,
      periodo_fim: null,
      partido: "PL",
      estado: "RS",
      eleito_por: "voto direto",
      observacoes: "Mandato federal atual; eleito em 2022 (Camara + curadoria 19.csv)",
    },
  },
  {
    slug: "marcelo-maranata",
    source: "Globo + Camara de Guaiba + curadoria 19.csv",
    candidateUpdate: {
      foto_url: "/candidates/marcelo-maranata.jpg",
      partido_sigla: "incerto",
      partido_atual: "incerto",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      cargo_atual: "Prefeito de Guaiba",
      biografia:
        "Marcelo Maranata e politico associado a Guaiba (RS). Na curadoria 19.csv nao foi possivel consolidar em fontes de alta confianca filiacao partidaria atual nem pre-candidatura robusta ao governo estadual em 2026; mantem-se como prefeito de Guaiba conforme noticiario local (Globo + curadoria 19.csv).",
    },
    ensureCurrentPartyTimeline: false,
  },
  {
    slug: "decio-lima",
    source: "NSC Total + Sebrae + curadoria 19.csv",
    candidateUpdate: {
      cargo_atual: "Presidente do Sebrae Nacional",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      biografia:
        "Decio Nery de Lima e advogado e politico brasileiro, filiado ao Partido dos Trabalhadores (PT). Foi vereador e prefeito de Blumenau, deputado federal por Santa Catarina e candidato ao governo de SC em 2018 e 2022; e presidente do Sebrae Nacional desde 2023. O pleito ao governo de SC em 2026 nao esta confirmado nas fontes desta rodada (NSC Total + curadoria 19.csv).",
    },
    deleteHistoricoRows: [
      { cargo: "Governador", periodo_inicio: 2018 },
      { cargo: "Governador", periodo_inicio: 2022 },
    ],
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 1993,
      periodo_fim: 1996,
      partido: "PT",
      estado: "SC",
      eleito_por: "voto direto",
      observacoes: "Prefeitura de Blumenau (NSC Total + curadoria 19.csv)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "decio-lima",
    source: "Camara dos Deputados / TSE + curadoria 19.csv",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Deputado Federal",
      periodo_inicio: 2003,
      periodo_fim: 2011,
      partido: "PT",
      estado: "SC",
      eleito_por: "voto direto",
      observacoes: "Mandatos federais (curadoria 19.csv)",
    },
  },
  {
    slug: "decio-lima",
    source: "TSE + curadoria 19.csv",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Governador",
      periodo_inicio: 2018,
      periodo_fim: 2018,
      partido: "PT",
      estado: "SC",
      eleito_por: "",
      observacoes: "candidatura: pleito ao governo de SC em 2018 (TSE; sem mandato)",
    },
  },
  {
    slug: "decio-lima",
    source: "TSE + curadoria 19.csv",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Governador",
      periodo_inicio: 2022,
      periodo_fim: 2022,
      partido: "PT",
      estado: "SC",
      eleito_por: "",
      observacoes: "candidatura: pleito ao governo de SC em 2022 (TSE; sem mandato)",
    },
  },
  {
    slug: "decio-lima",
    source: "Sebrae / imprensa + curadoria 19.csv",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Presidente do Sebrae",
      periodo_inicio: 2023,
      periodo_fim: null,
      partido: "PT",
      estado: "BR",
      eleito_por: "nomeacao",
      observacoes: "Presidencia do Sebrae Nacional (NSC Total + curadoria 19.csv)",
    },
  },
  // joao-rodrigues: caso modelo da trilha de remediação 2026-04-13.
  // A `mudancas_partido` automática do TSE estava contaminada por homônimos
  // (PTB/PDT/PR/PTC/PMN/PMDB/Solidariedade/PODE) e produzia reversões A→B
  // e B→A no mesmo ano (2010 PTC↔DEM, 2014 PSD↔PMN/PMDB, 2018 PMN↔PSD,
  // 2020 PDT↔Solidariedade). A trajetória canônica confirmada por Câmara
  // perfil 160571 + Gazeta do Povo SC + Wikipedia é:
  //   PFL (anos 1980/90) → DEM (2007, renomeação histórica do PFL) → PSD
  //   (2011, filiação na fundação do partido). Conta como 1 troca real.
  // Ver curadoria interna (Fluxo 2; armadilha de rows manuais amplas).
  {
    slug: "joao-rodrigues",
    source:
      "Auditoria trajetória partidária 2026-04-13 (Câmara dos Deputados perfil 160571, TSE DivulgaCandContas, G1 SC, Gazeta do Povo, Wikipedia) — distinto de homônimos com registros TSE em outros estados (ex.: RN). Trilha modelo da remediação global de trajetórias estruturadas.",
    candidateUpdate: {
      nome_completo: "João Rodrigues",
      partido_sigla: "PSD",
      partido_atual: "Partido Social Democrático",
      cargo_atual: null,
      situacao_candidatura: null,
      status: "pre-candidato",
      biografia:
        "João Rodrigues é empresário e político brasileiro, filiado ao Partido Social Democrático (PSD) desde a fundação do partido em 2011. Atuou em Santa Catarina pelo PFL e pelo DEM (renomeação histórica do PFL em 2007); foi vice-prefeito e prefeito de Pinhalzinho, prefeito de Chapecó, deputado estadual e deputado federal pelo oeste catarinense. Agregações automáticas de filiações a partir do TSE misturam homônimos de outros estados; a trajetória acima segue biografia oficial na Câmara dos Deputados (perfil 160571) e registros consolidados de Gazeta do Povo SC e Wikipedia (auditoria 2026-04-13). O pleito ao governo de SC em 2026 permanece a verificar nas fontes oficiais.",
    },
    deleteTimelineRows: [
      { partido_anterior: "PTB", partido_novo: "PDT", ano: 1998 },
      { partido_anterior: "PDT", partido_novo: "PTB", ano: 2000 },
      { partido_anterior: "PTB", partido_novo: "PFL", ano: 2000 },
      { partido_anterior: "PR", partido_novo: "PFL", ano: 2004 },
      { partido_anterior: "PFL", partido_novo: "PR", ano: 2004 },
      { partido_anterior: "PR", partido_novo: "PTC", ano: 2008 },
      { partido_anterior: "DEM", partido_novo: "PR", ano: 2008 },
      { partido_anterior: "PTC", partido_novo: "DEM", ano: 2010 },
      { partido_anterior: "DEM", partido_novo: "PTC", ano: 2010 },
      { partido_anterior: "PTC", partido_novo: "PMDB", ano: 2012 },
      { partido_anterior: "PSD", partido_novo: "PMN", ano: 2014 },
      { partido_anterior: "PMDB", partido_novo: "PSD", ano: 2014 },
      { partido_anterior: "PMN", partido_novo: "PSD", ano: 2016 },
      { partido_anterior: "PSD", partido_novo: "PMN", ano: 2016 },
      { partido_anterior: "PMN", partido_novo: "PSD", ano: 2018 },
      { partido_anterior: "PSD", partido_novo: "PDT", ano: 2018 },
      { partido_anterior: "PDT", partido_novo: "SOLIDARIEDADE", ano: 2020 },
      { partido_anterior: "SOLIDARIEDADE", partido_novo: "PSD", ano: 2020 },
      { partido_anterior: "PSD", partido_novo: "PODE", ano: 2022 },
      { partido_anterior: "PODE", partido_novo: "PSD", ano: 2026 },
      // Contaminação TSE adicional descoberta no apply de 2026-04-14:
      // as rows reais vinham como PL/PFL e não PR/DEM nesses anos.
      { partido_anterior: "PL", partido_novo: "PFL", ano: 2004 },
      { partido_anterior: "PFL", partido_novo: "PL", ano: 2004 },
      { partido_anterior: "PFL", partido_novo: "PR", ano: 2008 },
      // O rechainer corrompeu a row canônica DEM→PSD 2011 para PR→PSD
      // ao usar a contaminação de 2008 como precedente cronológico.
      { partido_anterior: "PR", partido_novo: "PSD", ano: 2011 },
    ],
    deleteHistoricoRows: [
      // Plano Fase 1.3: row sintética impossível (PFL não existia mais em 2020;
      // span de 16 anos para um cargo executivo é editorialmente implausível).
      { cargo_canonico: "Prefeito", periodo_inicio: 2004 },
      // Plano Fase 1.3: conflita com a row sintética 2004-2020 acima e exige
      // reperiodização. Mantemos só o mandato real de Chapecó (2020-2021).
      { cargo_canonico: "Prefeito", periodo_inicio: 2000 },
      // Plano Fase 1.3: candidatura derrotada misturada na cronologia de mandatos.
      { cargo_canonico: "Vereador", periodo_inicio: 2016, tipo_evento: "candidatura" },
      // Homônimo PDT-SC 1998 incompatível com a trajetória canônica PFL→DEM→PSD
      // confirmada na biografia curada (auditoria 2026-04-13).
      { cargo_canonico: "Deputado Estadual", periodo_inicio: 1998, tipo_evento: "candidatura" },
    ],
    ensureTimelineRows: [
      {
        partido_anterior: "PFL",
        partido_novo: "DEM",
        ano: 2007,
        data_mudanca: "2007-03-28",
        contexto:
          "Renomeação histórica do PFL como DEM em 28/03/2007 (não conta como troca real; auditoria 2026-04-13)",
      },
      {
        partido_anterior: "DEM",
        partido_novo: "PSD",
        ano: 2011,
        data_mudanca: "2011-09-29",
        contexto:
          "Filiação ao PSD na fundação do partido em 29/09/2011, vindo do DEM (Câmara perfil 160571 + Gazeta do Povo SC + Wikipedia; auditoria 2026-04-13)",
      },
    ],
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "jorginho-mello",
    source: "NSC Total + Governo de SC + curadoria 19.csv",
    candidateUpdate: {
      situacao_candidatura: null,
      status: "pre-candidato",
      biografia:
        "Jorginho dos Santos Mello e empresario e politico brasileiro, filiado ao Partido Liberal (PL). Foi deputado estadual e federal por Santa Catarina, senador pelo estado (2019-2022) e e governador de Santa Catarina desde 2023, com perspectiva publica de reeleicao em 2026 sem registro deferido no TSE na data de curadoria (NSC Total + curadoria 19.csv).",
    },
    deleteHistoricoRows: [{ cargo: "Senador", periodo_inicio: 2018 }],
    historicoFix: {
      cargo: "Senador",
      periodo_inicio: 2019,
      periodo_fim: 2022,
      partido: "PL",
      estado: "SC",
      eleito_por: "voto direto",
      observacoes: "Mandato encerrado com a posse no governo estadual em 2023 (NSC Total + curadoria 19.csv)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "jorginho-mello",
    source: "NSC Total + curadoria 19.csv",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Governador",
      periodo_inicio: 2023,
      periodo_fim: null,
      partido: "PL",
      estado: "SC",
      eleito_por: "voto direto",
      observacoes: "Governador de SC em exercicio desde 2023 (NSC Total + curadoria 19.csv)",
    },
  },
  // Auditoria 2026-04-12 (fechamento): slug amarra deputado estadual SC em `data/candidatos.json` (TSE 2018/2022).
  // Trajetória estável PSDB confirmada por Alesc + PSDB nacional (ver CSV `party-timeline-consolidada-18-casos-2026-04-12.csv`).
  {
    slug: "marcos-vieira",
    source:
      "PSDB nacional https://www.psdb.org.br/quem-e-quem/marcos-vieirar/ + Memória Política ALESC + ALESC + Agência ALESC + auditoria trajetória 2026-04-12",
    candidateUpdate: {
      cargo_atual: "Deputado Estadual de Santa Catarina",
      situacao_candidatura: null,
      status: "pre-candidato",
      biografia:
        "Marcos Vieira é advogado e político brasileiro, filiado ao Partido da Social Democracia Brasileira (PSDB) de forma ininterrupta desde 1989, conforme o perfil nacional do PSDB (quem é quem). É deputado estadual de Santa Catarina por vários mandatos. A cadeia de mudanças de legenda gerada a partir do TSE (PFL, PP, PMDB ou MDB após 1989, PRB, Patriota, Republicanos) não é sustentada por essa fonte partidária e é tratada como ruído de homônimos ou de agregação. Figura como nome interno de pré-candidatura ao governo de SC em 2026, sem registro deferido no TSE na data de curadoria.",
    },
    deleteTimelineRows: [
      { partido_anterior: "PFL", partido_novo: "PSDB", ano: 2002 },
      { partido_anterior: "PSDB", partido_novo: "PP", ano: 2004 },
      { partido_anterior: "PP", partido_novo: "PSDB", ano: 2006 },
      { partido_anterior: "PSDB", partido_novo: "PP", ano: 2008 },
      { partido_anterior: "PP", partido_novo: "PSDB", ano: 2010 },
      { partido_anterior: "PSDB", partido_novo: "PMDB", ano: 2012 },
      { partido_anterior: "PMDB", partido_novo: "PSDB", ano: 2014 },
      { partido_anterior: "PSDB", partido_novo: "MDB", ano: 2012 },
      { partido_anterior: "MDB", partido_novo: "PSDB", ano: 2014 },
      { partido_anterior: "PRB", partido_novo: "PATRIOTA", ano: 2016 },
      { partido_anterior: "PSDB", partido_novo: "PRB", ano: 2016 },
      { partido_anterior: "PATRIOTA", partido_novo: "PSDB", ano: 2018 },
      { partido_anterior: "PSDB", partido_novo: "REPUBLICANOS", ano: 2020 },
      { partido_anterior: "REPUBLICANOS", partido_novo: "PSDB", ano: 2022 },
    ],
    ensureTimelineRows: [
      {
        partido_anterior: "Sem partido",
        partido_novo: "PSDB",
        ano: 1989,
        contexto:
          "Âncora de filiação estável ao PSDB desde 1989; não representa troca efetiva de partido (PSDB nacional + Memória Política ALESC + auditoria trajetória 2026-04-12).",
      },
    ],
    historicoFix: {
      cargo: "Deputado Estadual",
      periodo_inicio: 2003,
      periodo_fim: null,
      partido: "PSDB",
      estado: "SC",
      eleito_por: "voto direto",
      observacoes:
        "Carreira na Alesc em mandatos sucessivos pelo PSDB; filiação partidária estável desde 1989 (auditoria 2026-04-12 + PSDB SC + Alesc)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "andre-do-prado",
    source: "Alesp oficial — forma completa do cargo para crosscheck",
    candidateUpdate: {
      cargo_atual: "Presidente da Assembleia Legislativa de Sao Paulo",
    },
  },
  {
    slug: "sergio-vidigal",
    source: "TSE filiacao PDT confirmada 2026-04-06",
    candidateUpdate: { partido_sigla: "PDT", partido_atual: "Partido Democratico Trabalhista" },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "simao-jatene",
    source: "TSE filiacao PSDB confirmada 2026-04-06",
    candidateUpdate: { partido_sigla: "PSDB", partido_atual: "Partido da Social Democracia Brasileira" },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "tarcisio-motta",
    source: "TSE filiacao PSOL confirmada 2026-04-06",
    candidateUpdate: { partido_sigla: "PSOL", partido_atual: "Partido Socialismo e Liberdade" },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "gilson-machado",
    source: "TSE filiacao PL confirmada 2026-04-06",
    candidateUpdate: { partido_sigla: "PL", partido_atual: "Partido Liberal" },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "evandro-augusto",
    source: "TSE filiacao MISSAO confirmada 2026-04-06",
    candidateUpdate: { partido_sigla: "MISSAO", partido_atual: "Partido Missao" },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "marcio-franca",
    source: "gov.br MEMP balanco abril/2026 + TSE filiacao PSB 2026-04-06",
    candidateUpdate: {
      partido_sigla: "PSB",
      partido_atual: "Partido Socialista Brasileiro",
      cargo_atual: null,
    },
    historicoFix: {
      cargo: "Ministro do Empreendedorismo",
      periodo_inicio: 2023,
      periodo_fim: 2026,
      partido: "PSB",
      estado: "SP",
      eleito_por: "nomeacao",
      observacoes: "Gestao encerrada em 2026 (gov.br MEMP balanco abril/2026)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "haddad-gov-sp",
    source:
      "DOU / imprensa federal + curadoria 17.csv (cargo atual revisado); cleanup curadoria interna 2026-04-17 (Haddad 2022 era Governo SP, não Presidência)",
    candidateUpdate: {
      cargo_atual: "Ministro da Fazenda",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      biografia:
        "Fernando Haddad é professor, economista e político brasileiro, filiado ao PT. Foi ministro da Educação (2005–2012), prefeito de São Paulo (2013–2016) e é ministro da Fazenda desde 2023. Foi candidato à Presidência em 2018 (após indeferimento de Lula) e disputou o governo de São Paulo em 2022, indo ao segundo turno; aparece em cenários para o governo de São Paulo em 2026, sem pré-candidatura consolidada nas fontes desta rodada.",
    },
    // curadoria interna 2026-04-17 (Fluxo 2): purgar linha manual falsa
    // "Presidente 2022 — Candidatura (TSE)". Haddad disputou o Governo de SP
    // em 2022 (TSE DivulgaCandContas 2022), não a Presidência; a row TSE
    // correspondente "Governador 2022 NÃO ELEITO" já existe no DB.
    deleteHistoricoRows: [
      { cargo_canonico: "Presidente", periodo_inicio: 2022, tipo_evento: "candidatura" },
    ],
    historicoFix: {
      cargo: "Ministro da Fazenda",
      periodo_inicio: 2023,
      periodo_fim: null,
      partido: "PT",
      estado: "",
      eleito_por: "nomeacao",
      observacoes: "Mandato no governo federal (curadoria 17.csv)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "hertz-dias",
    source: "G1/O Globo 2026-04-11 + TSE DivulgaCandContas",
    candidateUpdate: {
      nome_completo: "Hertz Dias",
      estado: "MA",
      cargo_atual: null,
      situacao_candidatura: "pre-candidato",
      biografia:
        "Hertz da Conceição Dias é professor da rede pública, militante, rapper e político brasileiro ligado ao movimento negro no Maranhão, filiado ao Partido Socialista dos Trabalhadores Unificado (PSTU). Foi candidato a vice-presidente da República em 2018, candidato a prefeito de São Luís em 2020 e candidato a governador do Maranhão em 2022; em 2026 consta como pré-candidato à Presidência, sem deferimento pelo TSE até a data de curadoria.",
    },
    deleteHistoricoRows: [
      {
        cargo: "Vice-Governador",
        periodo_inicio: 2010,
        tipo_evento: "candidatura",
      },
    ],
    historicoFix: {
      cargo: "Vice-Presidente",
      periodo_inicio: 2018,
      periodo_fim: 2018,
      partido: "PSTU",
      estado: "BR",
      eleito_por: null,
      observacoes:
        "candidatura: vice na chapa presidencial PSTU em 2018 (chapa não eleita); TSE DivulgaCandContas 2018",
    },
  },
  {
    slug: "hertz-dias",
    source: "G1/O Globo 2026-04-11 + TSE DivulgaCandContas",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 2020,
      periodo_fim: 2020,
      partido: "PSTU",
      estado: "MA",
      eleito_por: null,
      observacoes: "candidatura: pleito à Prefeitura de São Luís em 2020 (não eleito); TSE DivulgaCandContas 2020",
    },
  },
  {
    slug: "hertz-dias",
    source: "G1/O Globo 2026-04-11 + TSE DivulgaCandContas",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Governador",
      periodo_inicio: 2022,
      periodo_fim: 2022,
      partido: "PSTU",
      estado: "MA",
      eleito_por: null,
      observacoes: "candidatura: pleito ao governo do Maranhão em 2022 (não eleito); TSE DivulgaCandContas 2022",
    },
  },
  // Lote validação manual 6.csv (2026-04-11); cleanup 2026-04-17 (curadoria interna, Fluxo 2)
  {
    slug: "lula",
    source:
      "Gazeta do Povo 2026-04-11 + Presidência da República (gov.br) + TSE; cleanup curadoria interna 2026-04-17",
    candidateUpdate: {
      situacao_candidatura: "pre-candidato",
      cargo_atual: "Presidente da República",
      biografia:
        "Luiz Inácio Lula da Silva é Presidente da República (2023–atual e 2003–2010), sindicalista e fundador do PT. Pré-candidato à reeleição em 2026, sem deferimento no TSE até a data de curadoria.",
    },
    // curadoria interna 2026-04-17 (Fluxo 2): purgar linhas manuais falsas
    // "2018 - Não Eleito / Candidatura — Presidente" (registro indeferido pelo TSE, substituído por Fernando Haddad; não foi às urnas como candidato válido)
    // e "2022 - Não Eleito / Candidatura — Presidente" (eleito em 2022, posse em 2023; mandato 2023–atual já representa a eleição).
    // curadoria interna 2026-04-17 (Fluxo 2 hardening): purgar rows TSE presidenciais amplas/abertas que conflitam com mandatos tier-1
    // "Presidente da República 2002–2022" (ampla, cobre múltiplos mandatos segmentados 2003–2006, 2007–2010)
    // "Presidente da República 2022–null" (ano eleição vs posse, conflita com mandato 2023–atual)
    deleteHistoricoRows: [
      { cargo_canonico: "Presidente", periodo_inicio: 2018, tipo_evento: "candidatura" },
      { cargo_canonico: "Presidente", periodo_inicio: 2022, tipo_evento: "candidatura" },
      {
        cargo_canonico: "Presidente",
        periodo_inicio: 2002,
        periodo_fim: 2022,
        tipo_evento: "mandato",
        observacoes_includes: "TSE 2002",
      },
      {
        cargo_canonico: "Presidente",
        periodo_inicio: 2022,
        periodo_fim: null,
        tipo_evento: "mandato",
        observacoes_includes: "TSE 2022",
      },
    ],
  },
  {
    slug: "lula",
    source: "Gazeta do Povo 2026-04-11 + TSE DivulgaCandContas",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Presidente da República",
      periodo_inicio: 2023,
      periodo_fim: null,
      partido: "PT",
      estado: "",
      eleito_por: "voto direto",
      observacoes: "Mandato atual (Planalto + TSE 2026-04-11)",
    },
  },
  {
    slug: "lula",
    source: "Gazeta do Povo 2026-04-11 + TSE DivulgaCandContas",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Presidente da República",
      periodo_inicio: 2003,
      periodo_fim: 2006,
      partido: "PT",
      estado: "",
      eleito_por: "voto direto",
      observacoes: null,
    },
  },
  {
    slug: "lula",
    source: "Gazeta do Povo 2026-04-11 + TSE DivulgaCandContas",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Presidente da República",
      periodo_inicio: 2007,
      periodo_fim: 2010,
      partido: "PT",
      estado: "",
      eleito_por: "voto direto",
      observacoes: null,
    },
  },
  {
    slug: "flavio-bolsonaro",
    source:
      "Auditoria trajetória partidária 2026-04-12 (Senado Federal, TSE DivulgaCandContas, Gazeta do Povo)",
    candidateUpdate: {
      estado: "RJ",
      situacao_candidatura: "pre-candidato",
      biografia:
        "Flávio Bolsonaro é senador pelo Rio de Janeiro, filiado ao Partido Liberal (PL) desde 2021, após o PSL. Foi deputado estadual pelo RJ no Progressistas (PP), sucessão do PPB até 2016, quando se filiou ao PSC; em 2018 concorreu ao Senado pelo PSL. Linhas de trajetória que sugerem PFL ou DEM não batem com a cronologia consolidada no TSE e na biografia do Senado. Pré-candidato à Presidência em 2026, sem registro deferido no TSE até a data de curadoria.",
    },
    deleteHistoricoRows: [{ cargo: "Prefeito", periodo_inicio: 2016 }],
    deleteTimelineRows: [
      { partido_anterior: "Sem partido", partido_novo: "PP", ano: 2001 },
      { partido_anterior: "PP", partido_novo: "PFL", ano: 2005 },
      { partido_anterior: "PPB", partido_novo: "PSC", ano: 2005 },
      { partido_anterior: "DEM", partido_novo: "PSL", ano: 2018 },
    ],
    historicoFix: {
      cargo: "Deputado Estadual",
      periodo_inicio: 2003,
      periodo_fim: 2006,
      partido: "PP",
      estado: "RJ",
      eleito_por: "voto direto",
      observacoes:
        "Primeiro período na Alerj pelo PP (sucessão do PPB renomeado em 2003) até 2006, antes da sequência de mandatos já segmentados no TSE (2006–2016 em PP); troca para o PSC em 2016 (Senado + TSE + auditoria 2026-04-12).",
    },
  },
  {
    slug: "flavio-bolsonaro",
    source:
      "Auditoria trajetória partidária 2026-04-12 (Senado Federal, TSE DivulgaCandContas, Gazeta do Povo)",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Deputado Estadual",
      periodo_inicio: 2016,
      periodo_fim: 2019,
      partido: "PSC",
      estado: "RJ",
      eleito_por: "voto direto",
      observacoes: "Último período na Alerj antes da posse no Senado; filiação ao PSC em 2016 (auditoria 2026-04-12)",
    },
  },
  {
    slug: "flavio-bolsonaro",
    source: "Senado Federal + TSE 2026-04-11",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Senador",
      periodo_inicio: 2019,
      periodo_fim: null,
      partido: "PL",
      estado: "RJ",
      eleito_por: "voto direto",
      observacoes: "Mandato federal; filiação ao PL após PSL (Senado + TSE 2026-04-11)",
    },
  },
  {
    slug: "ciro-gomes",
    source:
      "PSDB oficial 2025-10-22 + scripts/lib/factual-assertions.ts (slug ciro-gomes); substitui marcação provisória «incerto» (Veja/Abril 2026-04-11) após confirmação de filiação",
    candidateUpdate: {
      partido_sigla: "PSDB",
      partido_atual: "Partido da Social Democracia Brasileira",
      situacao_candidatura: "pre-candidato",
      biografia:
        "Ciro Gomes é advogado e político cearense; foi prefeito de Fortaleza, governador do Ceará, ministro da Fazenda e da Integração Nacional e deputado federal. Quatro vezes candidato à Presidência; filiado ao PSDB (comunicado oficial do partido, 2025-10-22). Pré-candidato à Presidência em 2026 — acompanhar situação no TSE (DivulgaCandContas).",
    },
    ensureTimelineRows: [
      {
        partido_anterior: "PDT",
        partido_novo: "PSDB",
        ano: 2026,
        data_mudanca: null,
        contexto:
          "Filiação ao PSDB para o ciclo 2026 (PSDB oficial 2025-10-22; factual-assertions slug ciro-gomes; curadoria PuxaFicha 2026-04-15). Linha idempotente: ignorada se já existir o mesmo par ano/partidos.",
      },
    ],
  },
  {
    slug: "ciro-gomes",
    source: "TSE DivulgaCandContas",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Presidente",
      periodo_inicio: 2018,
      periodo_fim: 2018,
      partido: "PDT",
      estado: "",
      eleito_por: null,
      observacoes: "candidatura: pleito à Presidência em 2018 (TSE)",
    },
  },
  {
    slug: "ciro-gomes",
    source: "TSE DivulgaCandContas",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Presidente",
      periodo_inicio: 2022,
      periodo_fim: 2022,
      partido: "PDT",
      estado: "",
      eleito_por: null,
      observacoes: "candidatura: pleito à Presidência em 2022 (TSE)",
    },
  },
  {
    slug: "ciro-gomes",
    source:
      "Curadoria PuxaFicha (2026-04-15/2026-04-22): mesma disciplina que `#23` / `ciro-gomes-gov-ce` — `deleteTimelineRows` com `contexto_includes: \"Wikidata P102\"` para arestas não ancoradas em `historico_politico.partido` (§15.3 v1); remove também **PSDB→CIDADANIA/1996** e a duplicata **PSB→PARTIDO REPUBLICANO DA ORDEM SOCIAL/2013** com o mesmo marcador. Em 2026-04-22, o token manual **PROS/2013** deixa de viver em `historico_politico`: a timeline PSB→PROS já estava presente em `mudancas_partido` e a row `Deputado Federal 2013` era artefato de filiação, não mandato nem candidatura canônica.",
    candidateUpdate: {},
    deleteTimelineRows: [
      { partido_anterior: "SEMPARTIDO", partido_novo: "PDS", ano: 1980, contexto_includes: "Wikidata P102" },
      { partido_anterior: "PDS", partido_novo: "MDB", ano: 1983, contexto_includes: "Wikidata P102" },
      { partido_anterior: "MDB", partido_novo: "PSDB", ano: 1988, contexto_includes: "Wikidata P102" },
      { partido_anterior: "PSDB", partido_novo: "CIDADANIA", ano: 1996, contexto_includes: "Wikidata P102" },
      {
        partido_anterior: "PSB",
        partido_novo: "PARTIDO REPUBLICANO DA ORDEM SOCIAL",
        ano: 2013,
        contexto_includes: "Wikidata P102",
      },
    ],
    deleteHistoricoRows: [{ cargo: "Deputado Federal", periodo_inicio: 2013, tipo_evento: "candidatura" }],
  },
  {
    slug: "ciro-gomes",
    source:
      "Curadoria PuxaFicha (2026-04-15): espelha **`ciro-gomes-gov-ce`** — a aresta **PDT→SEMPARTIDO/2022** não se sustenta face aos pleitos **2018** e **2022** com **PDT** no TSE; a desfiliação do PDT foi coberta com **Agência Brasil** (**Poder360**, 17.out.2025). Remove-se **PDT→SEMPARTIDO/2022**, **SEMPARTIDO→PSDB/2025** e a linha duplicada **PDT→PSDB/2026** do bloco anterior (um único salto **PDT→PSDB** em **2025**).",
    candidateUpdate: {},
    deleteTimelineRows: [
      {
        partido_anterior: "PDT",
        partido_novo: "SEMPARTIDO",
        ano: 2022,
        contexto_includes: "Desfiliou-se após o segundo turno",
      },
      {
        partido_anterior: "SEMPARTIDO",
        partido_novo: "PSDB",
        ano: 2025,
        contexto_includes: "Retomou filiação partidaria",
      },
      {
        partido_anterior: "PDT",
        partido_novo: "PSDB",
        ano: 2026,
        contexto_includes: "Filiação ao PSDB para o ciclo 2026",
      },
    ],
    ensureTimelineRows: [
      {
        partido_anterior: "PDT",
        partido_novo: "PSDB",
        ano: 2025,
        data_mudanca: null,
        contexto:
          "Filiação ao PSDB após permanência no PDT nas candidaturas presidenciais 2018 e 2022 (TSE). Desfiliação do PDT documentada em imprensa com **Agência Brasil** (**Poder360**, 17.out.2025). Comunicado oficial do **PSDB** (22.out.2025). Linha idempotente se já existir o mesmo par ano/partidos.",
      },
    ],
  },
  {
    slug: "eduardo-leite",
    source: "G1/O Globo 2026-04-11 + TSE DivulgaCandContas",
    candidateUpdate: {
      estado: "RS",
      situacao_candidatura: "pre-candidato",
      partido_atual: "Partido Social Democrático",
      biografia:
        "Eduardo Leite é governador do Rio Grande do Sul (PSD), com mandato anterior pelo PSDB (2019–2022) e passagem pela Prefeitura de Pelotas (2013–2016). Pré-candidato à Presidência em 2026, sem deferimento no TSE até a data de curadoria.",
    },
    historicoFix: {
      cargo: "Governador do Rio Grande do Sul",
      periodo_inicio: 2023,
      periodo_fim: null,
      partido: "PSD",
      estado: "RS",
      eleito_por: "voto direto",
      observacoes: "Mandato atual com filiação ao PSD (G1/O Globo + TSE 2026-04-11)",
    },
  },
  {
    slug: "eduardo-leite",
    source: "G1/O Globo 2026-04-11 + TSE",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Governador do Rio Grande do Sul",
      periodo_inicio: 2019,
      periodo_fim: 2022,
      partido: "PSDB",
      estado: "RS",
      eleito_por: "voto direto",
      observacoes: null,
    },
  },
  {
    slug: "eduardo-leite",
    source: "TSE",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Prefeito de Pelotas",
      periodo_inicio: 2013,
      periodo_fim: 2016,
      partido: "PSDB",
      estado: "RS",
      eleito_por: "voto direto",
      observacoes: null,
    },
  },
  // Aldo Rebelo: subclasse `linha_ampla_manual_vs_mandatos_tse_segmentados`.
  // A row manual ampla `Deputado Federal 1991-2015` convivia com 5 mandatos
  // segmentados TSE (1994-1998, 1998-2002, 2002-2006, 2006-2010, 2010-2014)
  // do mesmo cargo canônico e mesmo partido (PCdoB). Mantemos apenas a sobra
  // factual confirmada anterior à cobertura TSE: o mandato 1991-1994 (eleição
  // 1990). O resumo "deputado federal entre 1991 e 2015" fica só na biografia,
  // não como row concorrente. Ver curadoria interna (Fluxo 2).
  {
    slug: "aldo-rebelo",
    source:
      "Gazeta do Povo 2026-04-11 + Câmara dos Deputados + TSE + auditoria 2026-04-13 (subclasse linha_ampla_manual_vs_mandatos_tse_segmentados)",
    candidateUpdate: {
      estado: "SP",
      cargo_atual: null,
      situacao_candidatura: "pre-candidato",
      partido_atual: "Democracia Cristã",
      biografia:
        "José Aldo Rebelo Figueiredo é político brasileiro filiado à Democracia Cristã (DC). Foi deputado federal por São Paulo pelo PCdoB entre 1991 e 2015 (mandatos sucessivos a partir da eleição de 1990), presidente da Câmara dos Deputados (2005–2007) e ministro (Ciência e Tecnologia; Esporte; Defesa) nos governos Lula e Dilma. Pré-candidato à Presidência em 2026, sem deferimento no TSE até a data de curadoria.",
    },
    historicoFix: {
      cargo: "Deputado Federal",
      periodo_inicio: 1991,
      periodo_fim: 1994,
      partido: "PCdoB",
      estado: "SP",
      eleito_por: "voto direto",
      observacoes:
        "Primeiro mandato (eleição 1990) anterior à cobertura TSE estruturada; mandatos posteriores 1994-2014 vêm das rows segmentadas TSE (curadoria 2026-04-13)",
    },
  },
  {
    slug: "aldo-rebelo",
    source: "Câmara dos Deputados + TSE",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Presidente da Câmara dos Deputados",
      periodo_inicio: 2005,
      periodo_fim: 2007,
      partido: "PCdoB",
      estado: "SP",
      eleito_por: "eleição interna",
      observacoes: "Mesa diretora; mandato parlamentar SP (Gazeta do Povo + TSE 2026-04-11)",
    },
  },
  {
    slug: "aldo-rebelo",
    source: "Governo federal (DOU) + TSE",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Ministro da Ciência e Tecnologia",
      periodo_inicio: 2004,
      periodo_fim: 2005,
      partido: "PCdoB",
      estado: "",
      eleito_por: "nomeacao",
      observacoes: "Governo Lula 1",
    },
  },
  {
    slug: "aldo-rebelo",
    source: "Governo federal + TSE",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Ministro do Esporte",
      periodo_inicio: 2011,
      periodo_fim: 2014,
      partido: "PCdoB",
      estado: "",
      eleito_por: "nomeacao",
      observacoes: "Encerrado em 2014 conforme linha do tempo pública (Gazeta do Povo 2026-04-11)",
    },
  },
  {
    slug: "aldo-rebelo",
    source: "Governo federal + TSE",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Ministro da Defesa",
      periodo_inicio: 2015,
      periodo_fim: 2016,
      partido: "PCdoB",
      estado: "",
      eleito_por: "nomeacao",
      observacoes: "Governo Dilma Rousseff",
    },
  },
  {
    slug: "aldo-rebelo",
    source: "UOL 2017-09-25 + nota pública PCdoB 2017-09-26",
    candidateUpdate: {},
    deleteHistoricoRows: [{ cargo: "Filiação partidária", periodo_inicio: 2017 }],
    historicoFix: {
      cargo: "Filiação ao PSB",
      periodo_inicio: 2017,
      periodo_fim: 2017,
      partido: "PSB",
      estado: "SP",
      eleito_por: null,
      observacoes:
        "Evento de filiação: após deixar o PCdoB, Aldo Rebelo foi anunciado pelo PSB em setembro de 2017 (UOL; nota pública PCdoB)",
    },
  },
  {
    slug: "aldo-rebelo",
    source: "Poder360 2018-04-16 + Gazeta do Povo 2018-04-12",
    candidateUpdate: {},
    deleteHistoricoRows: [{ cargo: "Filiação partidária", periodo_inicio: 2018 }],
    historicoFix: {
      cargo: "Filiação ao Solidariedade",
      periodo_inicio: 2018,
      periodo_fim: 2018,
      partido: "Solidariedade",
      estado: "SP",
      eleito_por: null,
      observacoes:
        "Evento de filiação/pre-candidatura presidencial: deixou o PSB e lançou pré-candidatura pelo Solidariedade em abril de 2018 (Poder360; Gazeta do Povo)",
    },
  },
  {
    slug: "aldo-rebelo",
    source: "TSE consulta_cand_2022_SP + Senado Notícias 2022-08-26",
    candidateUpdate: {},
    deleteHistoricoRows: [{ cargo: "Filiação partidária", periodo_inicio: 2022 }],
    historicoFix: {
      cargo: "Filiação ao PDT",
      periodo_inicio: 2022,
      periodo_fim: 2022,
      partido: "PDT",
      estado: "SP",
      eleito_por: null,
      observacoes:
        "Evento de filiação/candidatura: candidato ao Senado por São Paulo pelo PDT em 2022 (TSE SQ 250001639699; Senado Notícias)",
    },
  },
  {
    slug: "aldo-rebelo",
    source: "TSE consulta_cand_2022_SP",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Senador",
      periodo_inicio: 2022,
      periodo_fim: 2022,
      partido: "PDT",
      estado: "SP",
      eleito_por: null,
      observacoes: "Candidatura: NÃO ELEITO (TSE 2022, SQ 250001639699)",
    },
  },
  {
    slug: "aldo-rebelo",
    source: "CNN Brasil 2024-04-05 + UOL/Estadão 2024-04-05",
    candidateUpdate: {},
    deleteHistoricoRows: [{ cargo: "Filiação partidária", periodo_inicio: 2024 }],
    historicoFix: {
      cargo: "Filiação ao MDB",
      periodo_inicio: 2024,
      periodo_fim: 2024,
      partido: "MDB",
      estado: "SP",
      eleito_por: null,
      observacoes:
        "Evento de filiação: deixou o PDT e filiou-se ao MDB em abril de 2024 durante a passagem pela Secretaria de Relações Internacionais da Prefeitura de São Paulo (CNN Brasil; UOL/Estadão)",
    },
  },
  {
    slug: "aldo-rebelo",
    source: "Democracia Cristã oficial 2025-12-16 + DC oficial 2026-01-26",
    candidateUpdate: {},
    deleteHistoricoRows: [{ cargo: "Filiação partidária", periodo_inicio: 2025 }],
    historicoFix: {
      cargo: "Filiação ao DC",
      periodo_inicio: 2025,
      periodo_fim: 2025,
      partido: "DC",
      estado: "SP",
      eleito_por: null,
      observacoes:
        "Evento de filiação/pré-candidatura: Democracia Cristã passou a apostar na pré-candidatura de Aldo Rebelo em dezembro de 2025 e publicou lançamento presidencial pelo DC em janeiro de 2026",
    },
    deleteTimelineRows: [
      {
        partido_anterior: "PSB",
        partido_novo: "Solidariedade",
        ano: 2019,
      },
      {
        partido_anterior: "PDT",
        partido_novo: "DC",
        ano: 2025,
        contexto_includes: "Filiou-se ao DC",
      },
    ],
    ensureTimelineRows: [
      {
        partido_anterior: "PSB",
        partido_novo: "Solidariedade",
        ano: 2018,
        contexto:
          "Correção §15.3/#30: Aldo Rebelo deixou o PSB e lançou pré-candidatura presidencial pelo Solidariedade em abril de 2018 (Poder360; Gazeta do Povo).",
      },
      {
        partido_anterior: "PDT",
        partido_novo: "MDB",
        ano: 2024,
        contexto:
          "Correção §15.3/#30: deixou o PDT e filiou-se ao MDB em abril de 2024 (CNN Brasil; UOL/Estadão).",
      },
      {
        partido_anterior: "MDB",
        partido_novo: "DC",
        ano: 2025,
        contexto:
          "Correção §15.3/#30: após passagem pelo MDB, Democracia Cristã apresentou Aldo Rebelo como pré-candidato presidencial em dezembro de 2025/janeiro de 2026 (DC oficial).",
      },
    ],
  },
  // Lote validação manual 7.csv (2026-04-11)
  {
    slug: "tarcisio",
    source: "CNN Brasil 2026-04-11 + TSE",
    candidateUpdate: {
      situacao_candidatura: "incerto",
      biografia:
        "Tarcísio de Freitas é governador de São Paulo (Republicanos), eleito em 2022; ex-ministro da Infraestrutura e engenheiro. Em 2026 o cenário nacional é incerto: forte associação à reeleição estadual e ausência de confirmação consolidada de pré-candidatura ao Planalto (CNN Brasil 2026-04-11).",
    },
  },
  {
    slug: "tarcisio",
    source: "Launch readiness H1 2026-04-12 + sync-current-anchors",
    candidateUpdate: {},
    deleteHistoricoRows: [
      {
        cargo_canonico: "Governador",
        periodo_inicio: null,
        tipo_evento: "mandato",
        observacoes_includes: "início do mandato ainda não determinado",
      },
    ],
  },
  {
    slug: "tarcisio",
    source:
      "Auditoria trajetória partidária 2026-04-12 (linha 19) + TSE DivulgaCandContas + Governo de SP + republicanos10.org.br + G1",
    candidateUpdate: {
      situacao_candidatura: "incerto",
      biografia:
        "Tarcísio de Freitas é engenheiro, ex-ministro da Infraestrutura (2019–2022) e governador de São Paulo (Republicanos), eleito em 2022. Como técnico e servidor público de carreira, não há registro público de filiação partidária antes de março de 2022; filiou-se ao Republicanos em 22 de março de 2022 para disputar o governo paulista (TSE; saopaulo.sp.gov.br; republicanos10.org.br; G1; auditoria trajetória 2026-04-12). Em 2026 o cenário nacional é incerto: forte associação à reeleição estadual e ausência de confirmação consolidada de pré-candidatura ao Planalto (CNN Brasil 2026-04-11).",
    },
    deleteTimelineRows: [{ partido_novo: "REPUBLICANOS", ano: 2022 }],
    ensureTimelineRows: [
      {
        partido_anterior: "Sem partido",
        partido_novo: "REPUBLICANOS",
        ano: 2022,
        data_mudanca: "2022-03-22",
        contexto:
          "Primeira filiação partidária documentada em 22/03/2022; candidatura ao governo de São Paulo pelo Republicanos (TSE DivulgaCandContas 2022; Governo de SP; republicanos10.org.br; G1; auditoria trajetória 2026-04-12).",
      },
    ],
  },
  {
    slug: "romeu-zema",
    source:
      "Auditoria trajetória partidária 2026-04-12 (linha 18) + TSE DivulgaCandContas + governo de MG + novo.org.br + G1",
    candidateUpdate: {
      situacao_candidatura: null,
      biografia:
        "Romeu Zema é empresário e administrador, presidente do Grupo Zema; governador de Minas Gerais desde 2019, eleito em 2018 e reeleito em 2022. A primeira filiação partidária documentada nas fontes oficiais (TSE, governo de Minas Gerais, Partido Novo e veículos de imprensa) ocorreu em 2018, quando filiou-se ao NOVO para disputar o governo; não há registro público confiável de filiação ao PR ou a outro partido antes dessa data — entradas automáticas nesse sentido costumam ser erro ou confusão com homônimo. Pré-candidato à Presidência sem registro formal no TSE até a data de curadoria (mg.gov.br, DivulgaCandContas, novo.org.br, G1 + TSE; auditoria trajetória 2026-04-12).",
    },
    deleteTimelineRows: [
      { partido_novo: "PR", ano: 1999 },
      { partido_novo: "PL", ano: 1999 },
    ],
    ensureTimelineRows: [
      {
        partido_anterior: "Sem partido",
        partido_novo: "NOVO",
        ano: 2018,
        contexto:
          "Primeira filiação partidária documentada; candidatura ao governo de Minas Gerais pelo NOVO (TSE DivulgaCandContas 2018; governo de MG; novo.org.br; G1; auditoria trajetória 2026-04-12).",
      },
    ],
    historicoFix: {
      cargo: "Governador de Minas Gerais",
      periodo_inicio: 2019,
      periodo_fim: null,
      partido: "NOVO",
      estado: "MG",
      eleito_por: "voto direto",
      observacoes:
        "Mandato desde 2019; eleições 2018 e 2022 pelo NOVO; filiação ao NOVO em 2018 (TSE + governo de MG + auditoria trajetória 2026-04-12)",
    },
  },
  {
    slug: "ronaldo-caiado",
    source:
      "Auditoria trajetória partidária 2026-04-12 (linha 13) + TSE + site PSD + governo de Goiás + G1/O Globo",
    candidateUpdate: {
      situacao_candidatura: null,
      partido_sigla: "PSD",
      partido_atual: "Partido Social Democrático",
      biografia:
        "Ronaldo Caiado é médico e governador de Goiás desde 2019. Na trajetória partidária documentada na auditoria de 2026-04-12 e no TSE, seguiu o PFL — refundado como DEM em 2007 — até a criação do União Brasil pela fusão DEM+PSL homologada pelo TSE em fevereiro de 2022, sem desfiliação intermediária; filiou-se ao PSD em 2026 para a disputa presidencial. Foi senador (2015–2019) e deputado federal (1991–2015). Pré-candidato à Presidência sem registro formal no TSE até a data de curadoria (G1/O Globo + TSE + psd.org.br).",
    },
    deleteTimelineRows: [
      { partido_anterior: "DEM", partido_novo: "UNIAO", ano: 2021 },
      { partido_anterior: "Sem partido", partido_novo: "UNIAO", ano: 2022 },
    ],
    deleteHistoricoRows: [
      { cargo: "Deputado Federal", periodo_inicio: 1999 },
      { cargo: "Senador", periodo_inicio: 2003 },
    ],
    historicoFix: {
      cargo: "Deputado Federal",
      periodo_inicio: 1991,
      periodo_fim: 1998,
      partido: "PFL",
      estado: "GO",
      eleito_por: "voto direto",
      observacoes: "Mandato federal inicial por Goiás pelo PFL antes das rows TSE posteriores (TSE/Câmara; curadoria S15.3 lote 2).",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "ronaldo-caiado",
    source: "TSE",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Senador",
      periodo_inicio: 2015,
      periodo_fim: 2019,
      partido: "DEM",
      estado: "GO",
      eleito_por: "voto direto",
      observacoes: null,
    },
  },
  {
    slug: "ronaldo-caiado",
    source: "TSE",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Governador",
      periodo_inicio: 2026,
      periodo_fim: null,
      partido: "PSD",
      estado: "GO",
      eleito_por: "voto direto",
      observacoes:
        "Governador de Goiás com filiação ao PSD em 2026 durante o mandato e pré-candidatura presidencial (PSD + imprensa nacional; curadoria S15.3 lote 2).",
    },
  },
  {
    slug: "ratinho-junior",
    source: "TSE consulta_cand_2002_PR + ALEP perfil Ratinho Junior",
    candidateUpdate: {
      situacao_candidatura: null,
      partido_atual: "Partido Social Democrático",
      biografia:
        "Carlos Massa Júnior (Ratinho Júnior) é governador do Paraná desde 2019, reeleito em 2022 pelo PSD; foi deputado estadual (2003–2007), deputado federal (2011–2014) e secretário de Estado do Desenvolvimento Urbano (2013–2014). Pré-campanha nacional sem registro formal no TSE até a data de curadoria (CNN Brasil + TSE 2026-04-11).",
    },
    historicoFix: {
      cargo: "Deputado Estadual",
      periodo_inicio: 2003,
      periodo_fim: 2003,
      partido: "PSB",
      estado: "PR",
      eleito_por: "voto direto",
      observacoes:
        "Eleito deputado estadual em 2002 pelo PSB (TSE consulta_cand_2002_PR, SQ 492; ALEP perfil Ratinho Junior)",
    },
  },
  {
    slug: "ratinho-junior",
    source: "ALEP notícia oficial 2005-04-14 + TSE consulta_cand_2006_PR",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Deputado Estadual",
      periodo_inicio: 2004,
      periodo_fim: 2007,
      partido: "PPS",
      estado: "PR",
      eleito_por: "voto direto",
      observacoes:
        "Mandato estadual após migração do PSB para o PPS; ALEP registrou a migração e o TSE confirma candidatura federal de 2006 pelo PPS (SQ 10020)",
    },
  },
  {
    slug: "ratinho-junior",
    source: "CNN Brasil + TSE",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Deputado Federal",
      periodo_inicio: 2011,
      periodo_fim: 2014,
      partido: "PSC",
      estado: "PR",
      eleito_por: "voto direto",
      observacoes: null,
    },
  },
  {
    slug: "ratinho-junior",
    source: "Governo do Paraná + CNN Brasil",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Secretário de Estado",
      periodo_inicio: 2013,
      periodo_fim: 2014,
      partido: "PR",
      estado: "PR",
      eleito_por: "nomeacao",
      observacoes: "Secretário de Estado do Desenvolvimento Urbano do Paraná (CNN Brasil 2026-04-11)",
    },
  },
  {
    slug: "ratinho-junior",
    source: "TSE",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Governador do Parana",
      periodo_inicio: 2019,
      periodo_fim: null,
      partido: "PSD",
      estado: "PR",
      eleito_por: "voto direto",
      observacoes: "Eleito em 2018 e reeleito em 2022 pelo PSD (CNN Brasil + TSE 2026-04-11)",
    },
  },
  {
    slug: "ratinho-junior",
    source:
      "Curadoria PuxaFicha (2026-04-15): §15.3 / GitHub #32 — remover ingest `Deputado Estadual` 2002–2014 PSB (sobreposição à curadoria 7.csv 2003–2007 «Diversos»); podar arestas `mudancas_partido` com `Wikidata P102` (CIDADANIA) e ruído PSD↔PP 2020–2022 (apoio eleitoral do PP sem filiação do titular ao PP — PSD-PR e cobertura estadual da reeleição 2022); duplicata TSE 2018 PSC→PSD face à aresta curada 2016.",
    candidateUpdate: {},
    deleteHistoricoRows: [{ cargo: "Deputado Estadual", periodo_inicio: 2002 }],
    deleteTimelineRows: [
      { partido_anterior: "PSB", partido_novo: "CIDADANIA", ano: 2003, contexto_includes: "Wikidata P102" },
      { partido_anterior: "CIDADANIA", partido_novo: "PSC", ano: 2007, contexto_includes: "Wikidata P102" },
      {
        partido_anterior: "PSD",
        partido_novo: "PP",
        ano: 2020,
        contexto_includes: "Mudança observada entre eleições TSE (2020)",
      },
      {
        partido_anterior: "PP",
        partido_novo: "PSD",
        ano: 2022,
        contexto_includes: "Mudança observada entre eleições TSE (2022)",
      },
      {
        partido_anterior: "PSC",
        partido_novo: "PSD",
        ano: 2018,
        contexto_includes: "Mudança observada entre eleições TSE (2018)",
      },
    ],
  },
  {
    slug: "ratinho-junior",
    source:
      "Curadoria PuxaFicha (2026-04-15/2026-04-26): §15.3 / GitHub #32 — remover âncora `SEMPARTIDO→PSB/2001` (Wikidata P102); substituir aresta TSE `PSB→PPS/2006` e a antiga aresta curada `Diversos→PPS/2006` por `PSB→PPS/2003`, coerente com TSE 2002 (eleito deputado estadual pelo PSB), ALEP 2005 (migração PSB→PPS) e TSE 2006 (deputado federal pelo PPS).",
    candidateUpdate: {},
    deleteTimelineRows: [
      {
        partido_anterior: "SEMPARTIDO",
        partido_novo: "PSB",
        ano: 2001,
        contexto_includes: "Wikidata P102",
      },
      {
        partido_anterior: "PSB",
        partido_novo: "PPS",
        ano: 2006,
        contexto_includes: "Mudança observada entre eleições TSE (2006)",
      },
      {
        partido_anterior: "DIVERSOS",
        partido_novo: "PPS",
        ano: 2006,
        contexto_includes: "Ponta curatorial §15.3",
      },
    ],
    ensureTimelineRows: [
      {
        partido_anterior: "PSB",
        partido_novo: "PPS",
        ano: 2003,
        contexto:
          "Ponta curatorial §15.3: eleito deputado estadual pelo PSB em 2002 (TSE consulta_cand_2002_PR, SQ 492) e migrou para o PPS durante o mandato (ALEP notícia oficial 2005-04-14); candidatura federal seguinte pelo PPS (TSE consulta_cand_2006_PR, SQ 10020).",
      },
    ],
  },
  {
    slug: "renan-santos",
    source: "Wikipedia PT + YouTube + Gazeta do Povo 2026-04-11 + TSE",
    candidateUpdate: {
      situacao_candidatura: null,
      partido_atual: "Missão",
      biografia:
        "Renan Santos é empresário, músico e fundador do MBL; primeiro presidente nacional do Partido Missão desde 2023. Sem mandato eletivo registrado; pré-candidato à Presidência sem deferimento no TSE até a data de curadoria (Wikipedia PT + Gazeta do Povo + TSE 2026-04-11).",
    },
  },
  {
    slug: "rui-costa-pimenta",
    source: "Wikipedia PT + YouTube + O Tempo 2026-04-11 + TSE",
    candidateUpdate: {
      situacao_candidatura: null,
      partido_atual: "Partido da Causa Operária",
      biografia:
        "Rui Costa Pimenta é jornalista e presidente nacional do PCO desde 1995; candidato à Presidência pelo PCO em 2002, 2010 e 2014, e lançado novamente para 2026. Sem registro formal no TSE até a data de curadoria (Wikipedia PT + O Tempo + TSE 2026-04-11).",
    },
    historicoFix: {
      cargo: "Presidente",
      periodo_inicio: 2002,
      periodo_fim: 2002,
      partido: "PCO",
      estado: "",
      eleito_por: "",
      observacoes: "candidatura: pleito à Presidência em 2002 (TSE)",
    },
  },
  {
    slug: "rui-costa-pimenta",
    source: "TSE",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Presidente",
      periodo_inicio: 2010,
      periodo_fim: 2010,
      partido: "PCO",
      estado: "",
      eleito_por: "",
      observacoes: "candidatura: pleito à Presidência em 2010 (TSE)",
    },
  },
  {
    slug: "rui-costa-pimenta",
    source: "TSE",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Presidente",
      periodo_inicio: 2014,
      periodo_fim: 2014,
      partido: "PCO",
      estado: "",
      eleito_por: "",
      observacoes: "candidatura: pleito à Presidência em 2014 (TSE)",
    },
  },
  {
    slug: "samara-martins",
    source: "Gazeta do Povo 2026-04-11 + TSE",
    candidateUpdate: {
      partido_sigla: "UP",
      partido_atual: "Unidade Popular",
      cargo_atual: null,
      situacao_candidatura: null,
      status: "pre-candidato",
      biografia:
        "Samara Martins é dentista do SUS, dirigente da UP e vice na chapa presidencial de Leonardo Péricles em 2022; pré-candidata à Presidência em 2026 sem registro formal no TSE até a data de curadoria (Gazeta do Povo + TSE 2026-04-11).",
    },
    deleteTimelineRows: [
      {
        partido_anterior: "UP",
        partido_novo: "UP",
        ano: 2026,
        contexto_includes: "filiação atual curada",
      },
    ],
    ensureCurrentPartyTimeline: true,
    historicoFix: {
      cargo: "Vice-Presidente",
      periodo_inicio: 2022,
      periodo_fim: 2022,
      partido: "UP",
      estado: "",
      eleito_por: "",
      observacoes: "candidatura: vice na chapa presidencial UP em 2022 (TSE)",
    },
  },
  {
    slug: "samara-martins",
    source: "Gazeta do Povo 2026-04-11 + TSE",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Presidente",
      periodo_inicio: 2026,
      periodo_fim: 2026,
      partido: "UP",
      estado: "",
      eleito_por: "",
      observacoes:
        "candidatura: pré-candidatura à Presidência em 2026 (Gazeta do Povo; sem registro deferido no TSE na data de curadoria)",
    },
  },
  {
    slug: "augusto-cury",
    source: "Avante oficial 2026-04-05 + Band 2026-05-06 + Wikipedia PT",
    candidateUpdate: {
      partido_sigla: "AVANTE",
      partido_atual: "Avante",
      cargo_atual: null,
      cargo_disputado: "Presidente",
      situacao_candidatura: "pre-candidato",
      status: "pre-candidato",
      data_nascimento: "1958-10-02",
      naturalidade: "Colina (SP)",
      formacao: "Medicina pela Faculdade de Medicina de São José do Rio Preto",
      profissao_declarada: "Psiquiatra, professor e escritor",
      foto_url:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/Augusto_Cury%2C_escritor_%2828339139296%29.jpg/250px-Augusto_Cury%2C_escritor_%2828339139296%29.jpg",
      biografia:
        "Augusto Jorge Cury é médico psiquiatra, professor e escritor brasileiro, filiado ao Avante. O partido apresentou Cury como pré-candidato à Presidência em abril de 2026, e a pré-candidatura foi lançada em Belo Horizonte em maio de 2026. Não há registro deferido no TSE para 2026 na data de curadoria.",
    },
    ensureCurrentPartyTimeline: true,
    historicoFix: {
      cargo: "Presidente",
      periodo_inicio: 2026,
      periodo_fim: 2026,
      partido: "AVANTE",
      estado: "BR",
      eleito_por: null,
      observacoes:
        "candidatura: pré-candidatura à Presidência em 2026 (Avante oficial + Band; sem registro deferido no TSE na data de curadoria)",
    },
  },
  {
    slug: "cabo-daciolo",
    source: "Band 2026-04 + Wikimedia Commons/Câmara dos Deputados + TSE 2018",
    candidateUpdate: {
      partido_sigla: "MOBILIZA",
      partido_atual: "Mobiliza",
      cargo_atual: null,
      cargo_disputado: "Presidente",
      situacao_candidatura: "pre-candidato",
      status: "pre-candidato",
      data_nascimento: "1976-03-30",
      naturalidade: "Florianópolis (SC)",
      formacao: "Ensino superior",
      profissao_declarada: "Bombeiro militar",
      foto_url:
        "https://upload.wikimedia.org/wikipedia/commons/1/1f/Cabo_Daciolo_em_maio_de_2017.jpg",
      biografia:
        "Benevenuto Daciolo Fonseca dos Santos, conhecido como Cabo Daciolo, é bombeiro militar e político brasileiro. Foi deputado federal pelo Rio de Janeiro entre 2015 e 2019, candidato à Presidência em 2018 e candidato ao Senado em 2022. Em abril de 2026 filiou-se ao Mobiliza e confirmou pré-candidatura à Presidência, sem registro deferido no TSE na data de curadoria.",
    },
    ensureCurrentPartyTimeline: true,
    historicoFix: {
      cargo: "Presidente",
      periodo_inicio: 2026,
      periodo_fim: 2026,
      partido: "MOBILIZA",
      estado: "BR",
      eleito_por: null,
      observacoes:
        "candidatura: pré-candidatura à Presidência em 2026 (Band + Gazeta do Povo; sem registro deferido no TSE na data de curadoria)",
    },
  },
  {
    slug: "edmilson-costa",
    source: "PCB oficial 2026-02 + FAPESP + Wikipedia PT",
    candidateUpdate: {
      partido_sigla: "PCB",
      partido_atual: "Partido Comunista Brasileiro",
      cargo_atual: null,
      cargo_disputado: "Presidente",
      situacao_candidatura: "pre-candidato",
      status: "pre-candidato",
      data_nascimento: "1950-04-08",
      naturalidade: "Pedreiras (MA)",
      formacao: "Doutorado em Economia pela Unicamp",
      profissao_declarada: "Economista, professor e dirigente partidário",
      foto_url: "https://i0.wp.com/pcb.org.br/portal2/wp-content/uploads/2026/02/MG_7543.jpg?resize=747%2C691&ssl=1",
      biografia:
        "Edmilson Silva Costa é economista, professor e dirigente do Partido Comunista Brasileiro (PCB). Militante do PCB desde a década de 1970, tem doutorado em Economia pela Unicamp e exerceu a secretaria-geral do partido. O Comitê Central do PCB o lançou como pré-candidato à Presidência em 2026, sem registro deferido no TSE na data de curadoria.",
    },
    ensureCurrentPartyTimeline: true,
    historicoFix: {
      cargo: "Presidente",
      periodo_inicio: 2026,
      periodo_fim: 2026,
      partido: "PCB",
      estado: "BR",
      eleito_por: null,
      observacoes:
        "candidatura: pré-candidatura à Presidência em 2026 (PCB oficial; sem registro deferido no TSE na data de curadoria)",
    },
  },
  // lote 11 (11.csv — PE / PI / RN)
  {
    slug: "joao-campos",
    source:
      "Auditoria trajetória partidária 2026-04-12 + Câmara dos Deputados (204429) + PSB / Prefeitura do Recife",
    candidateUpdate: {
      situacao_candidatura: null,
      status: "pre-candidato",
      partido_sigla: "PSB",
      partido_atual: "Partido Socialista Brasileiro",
      cargo_atual: "Prefeito do Recife",
      biografia:
        "João Henrique de Andrade Lima Campos é engenheiro civil e político brasileiro, filiado ao Partido Socialista Brasileiro (PSB). A biografia oficial na Câmara dos Deputados registra o mandato federal (2019–2021) e atividades partidárias como PSB; foi secretário de organização estadual do PSB (2014), chefe de gabinete do governo de Pernambuco (2016–2018) e é prefeito do Recife desde 2021, reeleito em 2024. Agregações automáticas de mudanças de legenda entre pleitos (PSDB, PRB, PP, Republicanos em 2018–2022) não batem com essa linha consolidada e devem ser tratadas como ruído até nova prova documental. É cotado como pré-candidato ao governo de Pernambuco em 2026, sem registro deferido no TSE na data de curadoria.",
    },
    deleteTimelineRows: [
      { partido_anterior: "PSDB", partido_novo: "PRB", ano: 2018 },
      { partido_anterior: "PRB", partido_novo: "PSB", ano: 2020 },
      { partido_anterior: "PSB", partido_novo: "PP", ano: 2020 },
      { partido_anterior: "REPUBLICANOS", partido_novo: "PSB", ano: 2020 },
      { partido_anterior: "PP", partido_novo: "REPUBLICANOS", ano: 2022 },
      { partido_anterior: "REPUBLICANOS", partido_novo: "PSB", ano: 2026 },
    ],
    deleteHistoricoRows: [
      {
        cargo: "Vereador",
        periodo_inicio: 2020,
        tipo_evento: "candidatura",
        observacoes_includes: "SUPLENTE",
      },
    ],
    historicoFix: {
      cargo: "Chefe de Gabinete do Governo de Pernambuco",
      periodo_inicio: 2016,
      periodo_fim: 2018,
      partido: "PSB",
      estado: "PE",
      eleito_por: "nomeacao",
      observacoes: "Função no executivo estadual (TSE + imprensa / curadoria 11.csv)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "joao-campos",
    source: "Câmara dos Deputados / TSE",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Deputado Federal",
      periodo_inicio: 2019,
      periodo_fim: 2020,
      partido: "PSB",
      estado: "PE",
      eleito_por: "voto direto",
      observacoes: "Mandato federal anterior à prefeitura (Câmara dos Deputados / TSE)",
    },
  },
  {
    slug: "joao-campos",
    source: "Prefeitura do Recife / TSE",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 2021,
      periodo_fim: null,
      partido: "PSB",
      estado: "PE",
      eleito_por: "voto direto",
      observacoes: "Mandato em curso na Prefeitura do Recife; reeleição em 2024 (Prefeitura do Recife + TSE)",
    },
  },
  {
    slug: "raquel-lyra",
    source: "CNN Brasil + YouTube (governo PE) + TSE",
    candidateUpdate: {
      partido_sigla: "PSD",
      partido_atual: "Partido Social Democrático",
      situacao_candidatura: null,
      status: "pre-candidato",
      cargo_atual: "Governadora de Pernambuco",
      biografia:
        "Raquel Teixeira Lyra Lucena é advogada e política brasileira, filiada ao Partido Social Democrático (PSD). Foi delegada da Polícia Federal, deputada estadual, prefeita de Caruaru e governadora de Pernambuco eleita em 2022 pelo PSDB, filiando-se ao PSD em 2025; figura como nome natural da reeleição em 2026, sem registro deferido no TSE na data de curadoria.",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "raquel-lyra",
    source: "Assembleia Legislativa de PE / TSE (mandato estadual)",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Deputado Estadual",
      periodo_inicio: 2011,
      periodo_fim: 2014,
      partido: "PSB",
      estado: "PE",
      eleito_por: "voto direto",
      observacoes: "Mandato na ALEPE como deputada estadual (TSE + curadoria 11.csv)",
    },
  },
  {
    slug: "raquel-lyra",
    source: "TSE (prefeitura Caruaru)",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Prefeita",
      periodo_inicio: 2017,
      periodo_fim: 2020,
      partido: "PSDB",
      estado: "PE",
      eleito_por: "voto direto",
      observacoes: "Primeiro mandato como prefeita de Caruaru (TSE)",
    },
  },
  {
    slug: "raquel-lyra",
    source: "TSE (prefeitura Caruaru)",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Prefeita",
      periodo_inicio: 2021,
      periodo_fim: 2022,
      partido: "PSDB",
      estado: "PE",
      eleito_por: "voto direto",
      observacoes: "Segundo mandato como prefeita de Caruaru até renúncia para disputar o governo (TSE)",
    },
  },
  {
    slug: "raquel-lyra",
    source: "Governo de Pernambuco / imprensa (mudança de legenda)",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Governador",
      periodo_inicio: 2023,
      periodo_fim: 2025,
      partido: "PSDB",
      estado: "PE",
      eleito_por: "voto direto",
      observacoes: "Governador(a) de PE eleita em 2022; filiação ao PSDB até migração ao PSD em 2025 (CNN Brasil + curadoria 11.csv)",
    },
  },
  {
    slug: "raquel-lyra",
    source: "Governo de Pernambuco / PSD oficial 2025",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Governador",
      periodo_inicio: 2025,
      periodo_fim: null,
      partido: "PSD",
      estado: "PE",
      eleito_por: "voto direto",
      observacoes: "Mesmo mandato estadual após filiação ao PSD em 2025 (CNN Brasil + curadoria 11.csv)",
    },
  },
  {
    slug: "ivan-moraes",
    source: "Blog da Ellas + CBN Recife + PSOL (federação PSOL-Rede)",
    candidateUpdate: {
      situacao_candidatura: null,
      status: "pre-candidato",
      cargo_atual: null,
      partido_sigla: "PSOL",
      partido_atual: "Partido Socialismo e Liberdade",
      biografia:
        "Ivan Moraes Filho é jornalista, escritor e político brasileiro, filiado ao Partido Socialismo e Liberdade (PSOL), integrante da federação PSOL-Rede em Pernambuco. Foi vereador do Recife por dois mandatos (2017–2024), com atuação em direitos humanos, comunicação e meio ambiente; figura como pré-candidato ao governo de Pernambuco em 2026, sem registro deferido no TSE na data de curadoria.",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "ivan-moraes",
    source: "Câmara Municipal do Recife / TSE",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Vereador",
      periodo_inicio: 2017,
      periodo_fim: 2020,
      partido: "PSOL",
      estado: "PE",
      eleito_por: "voto direto",
      observacoes: "Primeiro mandato na Câmara do Recife (TSE + curadoria 11.csv)",
    },
  },
  {
    slug: "ivan-moraes",
    source: "Câmara Municipal do Recife / TSE",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Vereador",
      periodo_inicio: 2021,
      periodo_fim: 2024,
      partido: "PSOL",
      estado: "PE",
      eleito_por: "voto direto",
      observacoes: "Segundo mandato na Câmara do Recife (TSE + curadoria 11.csv)",
    },
  },
  {
    slug: "margarete-coelho",
    source: "Veja (Abril) + O Globo (PI) 2026",
    candidateUpdate: {
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      partido_sigla: "PP",
      partido_atual: "Progressistas",
      cargo_atual: null,
      biografia:
        "Margarete de Castro Coelho é advogada e política brasileira, filiada ao Progressistas (PP). Foi vice-governadora do Piauí (2015–2018) e deputada federal pelo estado (2019–2023); atua como dirigente do PP no Piauí. O partido indicou Joel Rodrigues como pré-candidato ao governo em 2026 nas fontes consultadas; o próprio pleito majoritário dela em 2026 permanece incerto na mesma data.",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "margarete-coelho",
    source: "Assembleia Legislativa do PI / TSE",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Vice-Governador",
      periodo_inicio: 2015,
      periodo_fim: 2018,
      partido: "PP",
      estado: "PI",
      eleito_por: "voto direto",
      observacoes: "Vice-governadora do Piauí (Veja + curadoria 11.csv)",
    },
  },
  {
    slug: "margarete-coelho",
    source: "Câmara dos Deputados / TSE",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Deputado Federal",
      periodo_inicio: 2019,
      periodo_fim: 2023,
      partido: "PP",
      estado: "PI",
      eleito_por: "voto direto",
      observacoes: "Mandato federal (Câmara dos Deputados / TSE)",
    },
  },
  {
    slug: "rafael-fonteles",
    source: "TSE (governador 2022) + Governo do Piauí oficial",
    candidateUpdate: {
      situacao_candidatura: null,
      cargo_atual: "Governador do Piauí",
      partido_sigla: "PT",
      partido_atual: "Partido dos Trabalhadores",
      biografia:
        "Rafael Tajra Fonteles é matemático, empresário e político brasileiro, filiado ao Partido dos Trabalhadores (PT). Foi secretário da Fazenda do Piauí e coordenador do programa PRO Piauí; é governador do estado desde 2023. Há expectativa de disputa pela reeleição em 2026, sem anúncio formal robusto nas fontes desta rodada.",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "rafael-fonteles",
    source: "Governo do Piauí / imprensa",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Secretário da Fazenda do Piauí",
      periodo_inicio: 2015,
      periodo_fim: 2022,
      partido: "PT",
      estado: "PI",
      eleito_por: "nomeacao",
      observacoes: "Passagem pelo secretariado estadual antes da campanha de 2022 (TSE + curadoria 11.csv)",
    },
  },
  {
    slug: "rafael-fonteles",
    source: "Governo do Piauí / TSE",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Governador",
      periodo_inicio: 2023,
      periodo_fim: null,
      partido: "PT",
      estado: "PI",
      eleito_por: "voto direto",
      observacoes: "Mandato como governador eleito em 2022 (TSE + Governo do Piauí)",
    },
  },
  {
    slug: "alysson-bezerra",
    source: "TSE (mandatos Mossoró) + Agora RN 2026-03",
    candidateUpdate: {
      nome_completo: "Alysson Leandro Barbate Bezerra",
      profissao_declarada: "Servidor Público Federal",
      cargo_atual: "Prefeito de Mossoró",
      situacao_candidatura: null,
      status: "pre-candidato",
      partido_sigla: "UNIAO",
      partido_atual: "União Brasil",
      biografia:
        "Alysson Leandro Barbate Bezerra é servidor público e político brasileiro, filiado ao União Brasil. Foi deputado estadual pelo Rio Grande do Norte e é prefeito de Mossoró desde 2021, reeleito para mandato até 2028; aparece em notas partidárias como pré-candidato ao governo do RN em 2026, sem registro deferido no TSE na data de curadoria.",
    },
    historicoFix: {
      cargo: "Deputado Estadual",
      periodo_inicio: 2019,
      periodo_fim: 2020,
      partido: "Solidariedade",
      estado: "RN",
      eleito_por: "voto direto",
      observacoes: "Mandato na ALRN pelo Solidariedade (TSE + curadoria 11.csv)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "alysson-bezerra",
    source: "Prefeitura de Mossoró / TSE",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 2021,
      periodo_fim: 2024,
      partido: "Solidariedade",
      estado: "RN",
      eleito_por: "voto direto",
      observacoes: "Primeiro mandato como prefeito de Mossoró (TSE)",
    },
  },
  {
    slug: "alysson-bezerra",
    source: "Prefeitura de Mossoró / TSE",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 2025,
      periodo_fim: null,
      partido: "UNIAO",
      estado: "RN",
      eleito_por: "voto direto",
      observacoes: "Segundo mandato (2025–) com registro de filiação ao União Brasil no executivo municipal (TSE + curadoria 11.csv)",
    },
  },
  {
    slug: "alvaro-dias-rn",
    source: "ALERN memorial legislativo RN + auditoria trajetória partidária 2026-04-12",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Deputado Estadual",
      periodo_inicio: 1991,
      periodo_fim: 2002,
      partido: "PMDB",
      estado: "RN",
      eleito_por: "voto direto",
      observacoes:
        "Deputado estadual no PMDB até a filiação ao PDT em 2003 (ALERN + auditoria homônimo 2026-04-12)",
    },
  },
  {
    slug: "alvaro-dias-rn",
    source:
      "Wikipedia pt (Álvaro Costa Dias) citando Câmara dos Deputados — ÁLVARO DIAS - Biografia (2019) + Meu Congresso Nacional + FGV verbete — curadoria Novas Curadorias lote 1 2026-04-23",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Deputado Federal",
      periodo_inicio: 2003,
      periodo_fim: 2007,
      partido: "PDT",
      estado: "RN",
      eleito_por: "voto direto",
      observacoes:
        "Único mandato federal pelo RN (52ª legislatura 2003-02-01 a 2007-01-31); eleito em 2002 com 138.241 votos (segunda maior votação do estado) e mudança de filiação do PMDB para o PDT ao tomar posse em 2003",
    },
  },
  {
    slug: "alvaro-dias-rn",
    source:
      "Wikipedia pt (Álvaro Costa Dias) citando ALERN + TSE — curadoria Novas Curadorias lote 1 2026-04-23 (substitui row 2003–2010 PDT que confundia mandato federal com estadual)",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Deputado Estadual",
      periodo_inicio: 2007,
      periodo_fim: 2011,
      partido: "PDT",
      estado: "RN",
      eleito_por: "voto direto",
      observacoes:
        "Quarto mandato estadual (16ª legislatura ALERN), eleito em 2006 com 40.040 votos pelo PDT, após ciclo federal 2003-2007",
    },
  },
  {
    slug: "alvaro-dias-rn",
    source: "TSE / Prefeitura de Natal",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Vice-Prefeito",
      periodo_inicio: 2017,
      periodo_fim: 2018,
      partido: "MDB",
      estado: "RN",
      eleito_por: "voto direto",
      observacoes: "Vice-prefeito de Natal (O Globo + curadoria 11.csv)",
    },
  },
  {
    slug: "alvaro-dias-rn",
    source: "TSE / Prefeitura de Natal",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 2018,
      periodo_fim: 2020,
      partido: "MDB",
      estado: "RN",
      eleito_por: "voto direto",
      observacoes: "Primeiro mandato como prefeito de Natal (O Globo + TSE)",
    },
  },
  {
    slug: "alvaro-dias-rn",
    source: "TSE / Prefeitura de Natal",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 2021,
      periodo_fim: 2024,
      partido: "PSDB",
      estado: "RN",
      eleito_por: "voto direto",
      observacoes: "Segundo mandato como prefeito de Natal; filiação ao PSDB (O Globo + TSE)",
    },
  },
  // Lote 12 (12.csv — coorte governadores BA / CE)
  {
    slug: "acm-neto",
    source: "TSE (mandatos) + O Globo / PSNotícias + curadoria 12.csv",
    candidateUpdate: {
      nome_completo: "Antônio Carlos Peixoto de Magalhães Neto",
      partido_sigla: "UNIAO",
      partido_atual: "União Brasil",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      biografia:
        "Antônio Carlos Peixoto de Magalhães Neto é advogado e político brasileiro, filiado ao União Brasil. Foi deputado federal pela Bahia (2003–2013) pelo PFL/DEM, prefeito de Salvador (2013–2020) pelo DEM e dirigente nacional do União Brasil; sem mandato eletivo atualmente. Aparece como pré-candidato ao governo da Bahia em 2026, sem registro deferido no TSE na data de curadoria.",
    },
    historicoFix: {
      cargo: "Deputado Federal",
      periodo_inicio: 2003,
      periodo_fim: 2013,
      partido: "PFL/DEM",
      estado: "BA",
      eleito_por: "voto direto",
      observacoes: "Mandatos consecutivos na Câmara (TSE + curadoria 12.csv)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "acm-neto",
    source: "TSE + curadoria 12.csv",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 2013,
      periodo_fim: 2020,
      partido: "DEM",
      estado: "BA",
      eleito_por: "voto direto",
      observacoes: "Dois mandatos à frente da Prefeitura de Salvador (TSE)",
    },
  },
  {
    slug: "jeronimo",
    source: "Governo da Bahia + curadoria 12.csv",
    candidateUpdate: {
      nome_completo: "Jerônimo Rodrigues Souza",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      biografia:
        "Jerônimo Rodrigues Souza é engenheiro agrônomo, professor e político brasileiro, filiado ao PT. Foi secretário de Desenvolvimento Rural (2015–2018) e de Educação (2019–2022) da Bahia e é governador do estado desde 2023; figura na disputa à reeleição em 2026, sem registro deferido no TSE na data de curadoria.",
    },
    historicoFix: {
      cargo: "Secretário de Estado",
      periodo_inicio: 2015,
      periodo_fim: 2018,
      partido: "PT",
      estado: "BA",
      eleito_por: "nomeacao",
      observacoes: "Secretário de Desenvolvimento Rural da Bahia (Governo da Bahia + curadoria 12.csv)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "jeronimo",
    source: "Governo da Bahia + curadoria 12.csv",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Secretário de Estado",
      periodo_inicio: 2019,
      periodo_fim: 2022,
      partido: "PT",
      estado: "BA",
      eleito_por: "nomeacao",
      observacoes: "Secretário de Educação da Bahia (Governo da Bahia + curadoria 12.csv)",
    },
  },
  {
    slug: "jeronimo",
    source: "TSE + curadoria 12.csv",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Governador",
      periodo_inicio: 2023,
      periodo_fim: null,
      partido: "PT",
      estado: "BA",
      eleito_por: "voto direto",
      observacoes: "Eleito em 2022; mandato desde 1º de janeiro de 2023 (TSE)",
    },
  },
  {
    slug: "joao-roma",
    source:
      "Auditoria trajetória partidária 2026-04-12 (linha 11) + Câmara dos Deputados + TSE DivulgaCandContas + G1 BA",
    candidateUpdate: {
      nome_completo: "João Inácio Ribeiro Roma Neto",
      partido_sigla: "PL",
      partido_atual: "Partido Liberal",
      cargo_atual: "Deputado(a) Federal",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      biografia:
        "João Inácio Ribeiro Roma Neto é político brasileiro, filiado ao Partido Liberal (PL) desde março de 2022, após filiação ao PRB em 2018 — legenda renomeada para Republicanos em 2019 — e troca para o PL em 2022 (TSE, Câmara dos Deputados, G1 BA). A auditoria editorial de 2026-04-12 afasta linhas de timeline que citam PMDB, PFL, PTN, PODE ou PV em datas espúrias, por mistura com homônimos ou trajetórias alheias. Foi deputado federal pela Bahia (2019–2021) e ex-ministro da Cidadania (2021–2022); é presidente do PL na Bahia. Para 2026 há cotações públicas para governador, Senado ou reeleição à Câmara, sem definição formal na data de curadoria.",
    },
    deleteTimelineRows: [
      { partido_anterior: "PMDB", partido_novo: "PFL", ano: 1998 },
      { partido_anterior: "PFL", partido_novo: "PTN", ano: 2004 },
      { partido_anterior: "PODE", partido_novo: "PRB", ano: 2018 },
      { partido_anterior: "REPUBLICANOS", partido_novo: "PODE", ano: 2020 },
      { partido_anterior: "PRB", partido_novo: "PODE", ano: 2020 },
      { partido_anterior: "PODE", partido_novo: "PV", ano: 2022 },
      { partido_anterior: "PV", partido_novo: "PL", ano: 2022 },
      { partido_anterior: "PV", partido_novo: "PL", ano: 2026 },
      { partido_anterior: "PODE", partido_novo: "PL", ano: 2026 },
    ],
    ensureTimelineRows: [
      {
        partido_anterior: "REPUBLICANOS",
        partido_novo: "PL",
        ano: 2022,
        data_mudanca: null,
        contexto:
          "Filiação ao PL em 2022 após Republicanos (PRB em 2018; renomeação 2019). Dia e mês não constam na linha por falta de data precisa nas fontes citadas no bloco (Câmara dos Deputados + TSE DivulgaCandContas + G1 BA + auditoria 2026-04-12).",
      },
    ],
    historicoFix: {
      cargo: "Deputado Federal",
      periodo_inicio: 2019,
      periodo_fim: 2021,
      partido: "REPUBLICANOS",
      estado: "BA",
      eleito_por: "voto direto",
      observacoes:
        "Eleição 2018 pelo PRB; legenda como Republicanos a partir de 2019; exercício até a nomeação ao Ministério da Cidadania em fevereiro de 2021 (Câmara dos Deputados + TSE + G1 BA + plano trajetória 2026-04-14). Filiação ao PL em março de 2022 após o mandato parlamentar.",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "joao-roma",
    source: "Imprensa / curadoria 12.csv",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Ministro da Cidadania",
      periodo_inicio: 2021,
      periodo_fim: 2022,
      partido: "PL",
      estado: "",
      eleito_por: "nomeacao",
      observacoes: "Governo Bolsonaro (curadoria 12.csv)",
    },
  },
  {
    slug: "joao-roma",
    source: "curadoria 12.csv",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Chefe de Gabinete",
      periodo_inicio: 2013,
      periodo_fim: 2018,
      partido: "DEM",
      estado: "BA",
      eleito_por: "nomeacao",
      observacoes: "Chefe de Gabinete da Prefeitura de Salvador (curadoria 12.csv)",
    },
  },
  {
    slug: "jose-carlos-aleluia",
    source: "Câmara dos Deputados + NOVO/MundoBA/Plenna News 2025-2026 + curadoria S15.3 lote 4",
    candidateUpdate: {
      nome_completo: "José Carlos Aleluia Costa",
      partido_sigla: "NOVO",
      partido_atual: "Partido Novo",
      cargo_disputado: "Nenhum",
      situacao_candidatura: null,
      status: "desistente",
      biografia:
        "José Carlos Aleluia Costa é engenheiro eletricista e político baiano, filiado ao Partido Novo. Teve longa trajetória como deputado federal pelo PFL/DEM desde a década de 1990. Em 2025 chegou a confirmar pré-candidatura ao governo da Bahia pelo NOVO, mas em abril de 2026 desistiu da disputa e declarou apoio a ACM Neto; sem registro deferido no TSE na data de curadoria.",
    },
    historicoFix: {
      cargo: "Deputado Federal",
      periodo_inicio: 1991,
      periodo_fim: null,
      partido: "PFL/DEM",
      estado: "BA",
      eleito_por: "voto direto",
      observacoes:
        "Sucessivos mandatos na Câmara pelo PFL/DEM; filiação atual ao NOVO e desistência da pré-candidatura estadual em 2026 ficam registradas em candidato/timeline, sem criar mandato fictício (Câmara dos Deputados + MundoBA/Plenna News; curadoria S15.3 lote 4).",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "ronaldo-mansur",
    source: "curadoria 12.csv",
    candidateUpdate: {
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      biografia:
        "Ronaldo Mansur é filiado ao PSOL na Bahia. Trajetória política detalhada e pleito majoritário em 2026 não foram consolidados com fontes robustas na curadoria desta rodada.",
    },
  },
  {
    slug: "capitao-wagner",
    source: "Câmara dos Deputados + TSE + curadoria 12.csv",
    candidateUpdate: {
      partido_sigla: "UNIAO",
      partido_atual: "União Brasil",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      biografia:
        "Wagner Sousa Gomes, conhecido como Capitão Wagner, é capitão da reserva da PM do Ceará e político filiado ao União Brasil. Foi vereador de Fortaleza, deputado estadual e deputado federal; sem mandato eletivo desde 2023. Figura central da oposição no Ceará; pleito majoritário em 2026 permanece sem confirmação formal na data de curadoria.",
    },
    historicoFix: {
      cargo: "Vereador",
      periodo_inicio: 2013,
      periodo_fim: 2019,
      partido: "PR",
      estado: "CE",
      eleito_por: "voto direto",
      observacoes: "Mandato na Câmara Municipal de Fortaleza (TSE + curadoria 12.csv)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "capitao-wagner",
    source: "TSE + curadoria 12.csv",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Deputado Estadual",
      periodo_inicio: 2019,
      periodo_fim: 2021,
      partido: "PR",
      estado: "CE",
      eleito_por: "voto direto",
      observacoes: "Mandato na Assembleia Legislativa do Ceará (TSE + curadoria 12.csv)",
    },
  },
  {
    slug: "capitao-wagner",
    source: "TSE + curadoria 12.csv",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Deputado Federal",
      periodo_inicio: 2019,
      periodo_fim: 2023,
      partido: "PR",
      estado: "CE",
      eleito_por: "voto direto",
      observacoes: "Mandato federal (Câmara + curadoria 12.csv)",
    },
  },
  {
    slug: "ciro-gomes-gov-ce",
    source: "TSE + PSDB + curadoria 12.csv",
    candidateUpdate: {
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      biografia:
        "Ciro Ferreira Gomes é advogado e político cearense, filiado ao PSDB. Foi prefeito de Fortaleza, governador do Ceará, ministro da Fazenda no governo Itamar Franco, ministro da Integração Nacional no governo Lula e deputado federal; concorreu à Presidência em 1998, 2002, 2018 e 2022. Sem mandato eletivo atualmente; figura como pré-candidato ao governo do Ceará em 2026, sem registro deferido no TSE na data de curadoria.",
    },
    historicoFix: {
      cargo: "Prefeito de Fortaleza",
      periodo_inicio: 1989,
      periodo_fim: 1990,
      partido: "PMDB",
      estado: "CE",
      eleito_por: "voto direto",
      observacoes: "Renúncia para disputar o governo do estado (TSE + curadoria 12.csv)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "ciro-gomes-gov-ce",
    source: "TSE + curadoria 12.csv",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Governador do Ceara",
      periodo_inicio: 1991,
      periodo_fim: 1994,
      partido: "PSDB",
      estado: "CE",
      eleito_por: "voto direto",
      observacoes: null,
    },
  },
  {
    slug: "ciro-gomes-gov-ce",
    source: "curadoria 12.csv",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Ministro da Fazenda",
      periodo_inicio: 1994,
      periodo_fim: 1995,
      partido: "PSDB",
      estado: "",
      eleito_por: "nomeacao",
      observacoes: "Governo Itamar Franco",
    },
  },
  {
    slug: "ciro-gomes-gov-ce",
    source: "curadoria 12.csv",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Ministro da Integração Nacional",
      periodo_inicio: 2003,
      periodo_fim: 2006,
      partido: "PSB",
      estado: "",
      eleito_por: "nomeacao",
      observacoes: "Governo Lula 1 (curadoria 12.csv — legenda PSB)",
    },
  },
  {
    slug: "ciro-gomes-gov-ce",
    source: "TSE + curadoria 12.csv",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Deputado Federal",
      periodo_inicio: 2007,
      periodo_fim: 2011,
      partido: "PSB",
      estado: "CE",
      eleito_por: "voto direto",
      observacoes: null,
    },
  },
  {
    slug: "ciro-gomes-gov-ce",
    source: "TSE",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Presidente",
      periodo_inicio: 1998,
      periodo_fim: 1998,
      partido: "PPS",
      estado: "",
      eleito_por: "",
      observacoes: "candidatura: pleito à Presidência em 1998 (TSE)",
    },
  },
  {
    slug: "ciro-gomes-gov-ce",
    source: "TSE",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Presidente",
      periodo_inicio: 2002,
      periodo_fim: 2002,
      partido: "PPS",
      estado: "",
      eleito_por: "",
      observacoes: "candidatura: pleito à Presidência em 2002 (TSE)",
    },
  },
  {
    slug: "ciro-gomes-gov-ce",
    source: "TSE",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Presidente",
      periodo_inicio: 2018,
      periodo_fim: 2018,
      partido: "PDT",
      estado: "",
      eleito_por: "",
      observacoes: "candidatura: pleito à Presidência em 2018 (TSE)",
    },
  },
  {
    slug: "ciro-gomes-gov-ce",
    source: "TSE",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Presidente",
      periodo_inicio: 2022,
      periodo_fim: 2022,
      partido: "PDT",
      estado: "",
      eleito_por: "",
      observacoes: "candidatura: pleito à Presidência em 2022 (TSE)",
    },
  },
  {
    slug: "ciro-gomes-gov-ce",
    source:
      "TSE + curadoria 12.csv + curadoria PuxaFicha §15.3 (2026-04-15): remove PSDB→CIDADANIA (1996) incoerente com a sucessão PPS/Cidadania; garante aresta canónica PSB→PROS (2013).",
    candidateUpdate: {},
    deleteTimelineRows: [{ partido_anterior: "PSDB", partido_novo: "CIDADANIA", ano: 1996 }],
    ensureTimelineRows: [
      {
        partido_anterior: "PSB",
        partido_novo: "PROS",
        ano: 2013,
        data_mudanca: null,
        contexto:
          "Filiação ao PROS após o PSB (TSE + curadoria 12.csv; Câmara dos Deputados — mandato federal 2007–2011 pelo PSB). Linha idempotente: ignorada se já existir o mesmo par ano/partidos.",
      },
    ],
  },
  {
    slug: "ciro-gomes-gov-ce",
    source:
      "TSE + curadoria 12.csv; Câmara dos Deputados — mesma base textual já usada no `ensureTimelineRows` PSB→PROS/2013 (bloco anterior). Em 2026-04-22, o token manual **PROS/2013** é removido de `historico_politico`: a aresta partidária já está canonizada na timeline e a row `Deputado Federal 2013` era apenas materialização de filiação, não cargo nem candidatura factual.",
    candidateUpdate: {},
    deleteHistoricoRows: [{ cargo: "Deputado Federal", periodo_inicio: 2013, tipo_evento: "candidatura" }],
  },
  {
    slug: "ciro-gomes-gov-ce",
    source:
      "Curadoria PuxaFicha (2026-04-15): três linhas de `mudancas_partido` com `contexto` **«Wikidata P102»** não têm par em `historico_politico.partido` nem cadeia de fontes institucional (TSE, Filiaweb, casas legislativas) neste repositório; removem-se até nova comprovação documentada. Alinha §15.3 v1 («partido no histórico») e a política de não tratar Wikidata como prova canónica isolada.",
    candidateUpdate: {},
    deleteTimelineRows: [
      { partido_anterior: "SEMPARTIDO", partido_novo: "PDS", ano: 1980, contexto_includes: "Wikidata P102" },
      { partido_anterior: "PDS", partido_novo: "MDB", ano: 1983, contexto_includes: "Wikidata P102" },
      { partido_anterior: "MDB", partido_novo: "PSDB", ano: 1988, contexto_includes: "Wikidata P102" },
    ],
  },
  {
    slug: "ciro-gomes-gov-ce",
    source:
      "Curadoria PuxaFicha (2026-04-15): aresta **PDT→SEMPARTIDO/2022** com nota «Desfiliou-se após o segundo turno» **não** tem registro partidário formal em 2022 em fontes primárias verificadas nesta sessão (TSE/Filiaweb); contradiz os pleitos **2018** e **2022** em `historico_politico.partido` = **PDT** (TSE). A desfiliação do PDT foi noticiada com crédito **Marcelo Camargo / Agência Brasil** em **Poder360** (Brasília, **17.out.2025**). Remove-se a aresta de 2022 e o salto **SEMPARTIDO→PSDB/2025** que a encadeava; materializa-se **PDT→PSDB** em **2025**, coerente com o comunicado **PSDB oficial 2025-10-22** já usado na curadoria.",
    candidateUpdate: {},
    deleteTimelineRows: [
      {
        partido_anterior: "PDT",
        partido_novo: "SEMPARTIDO",
        ano: 2022,
        contexto_includes: "Desfiliou-se após o segundo turno",
      },
      {
        partido_anterior: "SEMPARTIDO",
        partido_novo: "PSDB",
        ano: 2025,
        contexto_includes: "Retomou filiação partidaria",
      },
    ],
    ensureTimelineRows: [
      {
        partido_anterior: "PDT",
        partido_novo: "PSDB",
        ano: 2025,
        data_mudanca: null,
        contexto:
          "Filiação ao PSDB após permanência no PDT nas candidaturas presidenciais 2018 e 2022 (TSE). Desfiliação do PDT documentada em imprensa com **Agência Brasil** (**Poder360**, 17.out.2025). Comunicado oficial do **PSDB** (22.out.2025). Linha idempotente se já existir o mesmo par ano/partidos.",
      },
    ],
  },
  {
    slug: "eduardo-girao",
    source: "Senado Federal + O Povo 2019/2023 + curadoria S15.3 lote 4",
    candidateUpdate: {
      nome_completo: "Luís Eduardo Grangeiro Girão",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      biografia:
        "Luís Eduardo Grangeiro Girão é político cearense, filiado ao Novo. Foi eleito senador pelo Ceará em 2018 pelo PROS, filiou-se ao Podemos em 2019 e ao Novo em 2023; mandato de senador em curso. Figura como pré-candidato ao governo do Ceará em 2026, sem registro deferido no TSE na data de curadoria.",
    },
    deleteHistoricoRows: [
      {
        cargo: "Senador",
        periodo_inicio: 2019,
        tipo_evento: "mandato",
        observacoes_includes: "filiação ao Novo posterior",
      },
    ],
    ensureTimelineRows: [
      {
        partido_anterior: "PROS",
        partido_novo: "PODE",
        ano: 2019,
        data_mudanca: "2019-02-02",
        contexto:
          "Comunicação de filiação ao Podemos logo após a posse no Senado (Senado Federal/RAP 2019 + O Povo 2019-02-03; curadoria S15.3 lote 4).",
      },
      {
        partido_anterior: "PODE",
        partido_novo: "NOVO",
        ano: 2023,
        data_mudanca: "2023-02-07",
        contexto:
          "Saída do Podemos e filiação ao Partido Novo em fevereiro de 2023 (O Povo 2023-02-07 + pronunciamento Senado 2023-02-08; curadoria S15.3 lote 4).",
      },
    ],
    historicoFix: {
      cargo: "Senador",
      periodo_inicio: 2019,
      periodo_fim: 2023,
      partido: "PODE",
      estado: "CE",
      eleito_por: "voto direto",
      observacoes:
        "Mesmo mandato no Senado após deixar o PROS e filiar-se ao Podemos no início de 2019 (Senado Federal/RAP 2019 + O Povo 2019-02-03; curadoria S15.3 lote 4).",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "eduardo-girao",
    source: "Senado Federal + O Povo 2023 — curadoria S15.3 lote 4",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Senador",
      periodo_inicio: 2023,
      periodo_fim: null,
      partido: "NOVO",
      estado: "CE",
      eleito_por: "voto direto",
      observacoes:
        "Mesmo mandato no Senado após filiação ao Partido Novo em fevereiro de 2023 (O Povo 2023-02-07 + pronunciamento Senado 2023-02-08; curadoria S15.3 lote 4).",
    },
  },
  {
    slug: "elmano-de-freitas",
    source: "Governo do Ceará + PT + curadoria 12.csv",
    candidateUpdate: {
      cargo_atual: "Governador do Ceará",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      biografia:
        "Elmano de Freitas da Costa é advogado e político brasileiro, filiado ao PT. Foi deputado estadual (2019–2022), chefe de gabinete na gestão Camilo Santana e é governador do Ceará desde 1º de janeiro de 2023; figura na disputa à reeleição em 2026, sem registro deferido no TSE na data de curadoria. A foto pública no perfil merece revisão manual de mídia.",
    },
    historicoFix: {
      cargo: "Deputado Estadual",
      periodo_inicio: 2019,
      periodo_fim: 2022,
      partido: "PT",
      estado: "CE",
      eleito_por: "voto direto",
      observacoes: "Mandato na Assembleia Legislativa do Ceará (TSE + curadoria 12.csv)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "elmano-de-freitas",
    source: "TSE + curadoria 12.csv",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Governador",
      periodo_inicio: 2023,
      periodo_fim: null,
      partido: "PT",
      estado: "CE",
      eleito_por: "voto direto",
      observacoes: "Eleito em 2022; mandato desde 1º de janeiro de 2023 (TSE)",
    },
  },
  {
    slug: "roberto-claudio",
    source: "TSE + CN7 / O Povo + curadoria 12.csv",
    candidateUpdate: {
      nome_completo: "Roberto Cláudio Rodrigues Bezerra",
      partido_sigla: "UNIAO",
      partido_atual: "União Brasil",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      biografia:
        "Roberto Cláudio Rodrigues Bezerra é médico e político cearense, filiado ao União Brasil. Foi deputado estadual, presidente da Assembleia Legislativa do Ceará e prefeito de Fortaleza por dois mandatos; sem mandato eletivo desde 2021. Cotado para chapa majoritária em 2026, sem definição formal na data de curadoria.",
    },
    historicoFix: {
      cargo: "Deputado Estadual",
      periodo_inicio: 2007,
      periodo_fim: 2012,
      partido: "PDT",
      estado: "CE",
      eleito_por: "voto direto",
      observacoes: "Mandatos na ALCE (TSE + curadoria 12.csv)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "roberto-claudio",
    source: "curadoria 12.csv",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Presidente da Assembleia Legislativa do Ceará",
      periodo_inicio: 2011,
      periodo_fim: 2012,
      partido: "PDT",
      estado: "CE",
      eleito_por: "mesa diretora",
      observacoes: "Presidência da ALCE (curadoria 12.csv)",
    },
  },
  {
    slug: "roberto-claudio",
    source: "TSE + curadoria 12.csv",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 2013,
      periodo_fim: 2020,
      partido: "PDT",
      estado: "CE",
      eleito_por: "voto direto",
      observacoes: "Dois mandatos à frente da Prefeitura de Fortaleza (TSE)",
    },
  },
  {
    slug: "roberto-claudio",
    source: "curadoria 12.csv",
    candidateUpdate: {},
    deleteHistoricoRows: [{ cargo: "Governador", periodo_inicio: 2022 }],
  },
  {
    slug: "roberto-claudio",
    source:
      "Curadoria PuxaFicha (2026-04-15): §15.3 / GitHub #33 — alinhar `mudancas_partido` ao quadro **12.csv** (ALCE + Fortaleza): remover ingest **PHS→PSB/2010** (omitia o mandato **PDT** 2007–2012); **`ensureTimelineRows`** **PHS→PDT/2007** e **PDT→PSB/2010**; limpar `historico_politico` sobreposto (**Deputado Estadual** 2010–2012 PSB; **Prefeito** 2012–2016 PSB e **Prefeito** 2016–2020 PDT duplicado face ao mandato **2013–2020** PDT); pleito **Governador** **2026** **UNIAO** para token §15.3 v1.",
    candidateUpdate: {},
    deleteHistoricoRows: [
      { cargo: "Deputado Estadual", periodo_inicio: 2010 },
      { cargo: "Prefeito", periodo_inicio: 2012 },
      { cargo: "Prefeito", periodo_inicio: 2016 },
    ],
    deleteTimelineRows: [
      {
        partido_anterior: "PHS",
        partido_novo: "PSB",
        ano: 2010,
        contexto_includes: "Mudança observada entre eleições TSE (2010)",
      },
    ],
    ensureTimelineRows: [
      {
        partido_anterior: "PHS",
        partido_novo: "PDT",
        ano: 2007,
        contexto: "Mandatos na ALCE pelo PDT a partir de 2007 (TSE + curadoria 12.csv).",
      },
      {
        partido_anterior: "PDT",
        partido_novo: "PSB",
        ano: 2010,
        contexto: "Migração para o PSB no quadro TSE de 2010 (curadoria 12.csv).",
      },
    ],
    historicoFix: {
      cargo: "Governador",
      periodo_inicio: 2026,
      periodo_fim: null,
      partido: "UNIAO",
      estado: "CE",
      eleito_por: "",
      observacoes:
        "candidatura: pré-candidato ao governo do Ceará em 2026 em União Brasil (curadoria 12.csv + TSE na data).",
    },
  },
  {
    slug: "roberto-claudio",
    source: "TSE + curadoria 12.csv (§15.3 — token PSB na Prefeitura)",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 2013,
      periodo_fim: 2016,
      partido: "PSB",
      estado: "CE",
      eleito_por: "voto direto",
      observacoes: "Primeiro mandato à frente da Prefeitura de Fortaleza pelo PSB (TSE + curadoria 12.csv).",
    },
  },
  {
    slug: "roberto-claudio",
    source: "TSE + curadoria 12.csv (§15.3 — segundo mandato PDT)",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 2017,
      periodo_fim: 2020,
      partido: "PDT",
      estado: "CE",
      eleito_por: "voto direto",
      observacoes: "Segundo mandato à frente da Prefeitura de Fortaleza pelo PDT (TSE + curadoria 12.csv).",
    },
  },
  // Lote 13 (13.csv — DF + MA)
  {
    slug: "celina-leao",
    source: "CLDF + imprensa DF (posse 30/03/2026) + curadoria 13.csv",
    candidateUpdate: {
      partido_sigla: "PP",
      partido_atual: "Progressistas",
      cargo_atual: "Governadora do Distrito Federal",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      biografia:
        "Celina Leão Rocha de Siqueira Campos é política brasileira, filiada ao Progressistas (PP). Foi deputada distrital, deputada federal, vice-governadora do Distrito Federal e assumiu a governadoria em 30 de março de 2026 após a renúncia de Ibaneis Rocha, cumprindo o mandato até janeiro de 2027. O pleito majoritário de 2026 permanece incerto na data de curadoria.",
    },
    historicoFix: {
      cargo: "Governador",
      periodo_inicio: 2026,
      periodo_fim: null,
      partido: "PP",
      estado: "DF",
      eleito_por: "sucessão",
      observacoes: "Governadora em exercício após sucessão em março de 2026 (CLDF + imprensa DF + curadoria 13.csv)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "celina-leao",
    source: "TSE (vice-governadoria)",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Vice-Governador",
      periodo_inicio: 2023,
      periodo_fim: 2026,
      partido: "PP",
      estado: "DF",
      eleito_por: "voto direto",
      observacoes: "Vice-governadora até a sucessão em 2026 (TSE + curadoria 13.csv)",
    },
  },
  {
    slug: "celina-leao",
    source: "Câmara dos Deputados / TSE",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Deputado Federal",
      periodo_inicio: 2019,
      periodo_fim: 2023,
      partido: "PP",
      estado: "DF",
      eleito_por: "voto direto",
      observacoes: "Mandato federal (TSE + curadoria 13.csv)",
    },
  },
  {
    slug: "celina-leao",
    source: "TSE (mandato distrital)",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Deputado Distrital",
      periodo_inicio: 2011,
      periodo_fim: 2019,
      partido: "PDT",
      estado: "DF",
      eleito_por: "voto direto",
      observacoes: "Mandatos na CLDF; períodos com PDT/SD conforme registros públicos (TSE + curadoria 13.csv)",
    },
  },
  {
    slug: "ricardo-cappelli",
    source: "Metrópoles + Correio Braziliense + curadoria 13.csv",
    candidateUpdate: {
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      cargo_atual: null,
      biografia:
        "Ricardo Ribeiro Cappelli é jornalista e político brasileiro, filiado ao Partido Socialista Brasileiro (PSB). Foi presidente da Agência Brasileira de Desenvolvimento Industrial (ABDI), secretário-executivo do Ministério da Justiça e Segurança Pública e interventor na segurança pública do Distrito Federal em 2023. Não há registro robusto de pré-candidatura ao governo do DF em 2026 nas fontes prioritárias desta rodada.",
    },
    historicoFix: {
      cargo: "Presidente da ABDI",
      periodo_inicio: 2019,
      periodo_fim: 2023,
      partido: "PSB",
      estado: "DF",
      eleito_por: "nomeacao",
      observacoes: "Presidência da ABDI até 2023 (Metrópoles + curadoria 13.csv)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "ricardo-cappelli",
    source: "Governo federal / imprensa",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Secretário-Executivo do MJSP",
      periodo_inicio: 2023,
      periodo_fim: 2024,
      partido: "PSB",
      estado: "BR",
      eleito_por: "nomeacao",
      observacoes: "Ministério da Justiça e Segurança Pública (curadoria 13.csv)",
    },
  },
  {
    slug: "ricardo-cappelli",
    source: "GDF / imprensa 2023",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Interventor na Segurança Pública do Distrito Federal",
      periodo_inicio: 2023,
      periodo_fim: 2023,
      partido: "PSB",
      estado: "DF",
      eleito_por: "nomeacao",
      observacoes: "Intervenção federal na segurança do DF em 2023 (curadoria 13.csv)",
    },
  },
  {
    slug: "enilton-rodrigues",
    source: "Curadoria 13.csv — bloqueio: sem mandatos eletivos comprovados em TSE/ALEMA",
    candidateUpdate: {
      cargo_atual: null,
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      partido_sigla: "PSOL",
      partido_atual: "Partido Socialismo e Liberdade",
      biografia:
        "Enilton Rodrigues é militante e dirigente associado ao Partido Socialismo e Liberdade (PSOL) no Maranhão. Nesta rodada não foi possível consolidar em fontes oficiais prioritárias (TSE, Assembleia Legislativa) mandatos eletivos como governador, vereador ou deputado estadual; o núcleo político da ficha permanece incerto até nova verificação documentada.",
    },
  },
  // lote 15.csv (ES / MT / RJ)
  {
    slug: "helder-salomao",
    source: "Câmara dos Deputados + TSE (mandatos) + curadoria 15.csv",
    candidateUpdate: {
      situacao_candidatura: "pre-candidato",
      biografia:
        "Helder Ignácio Salomão é professor, historiador e político brasileiro, filiado ao Partido dos Trabalhadores (PT). Nasceu no Espírito Santo em 1964, foi vereador e prefeito de Cariaçica, deputado federal em dois períodos e figura como pré-candidato ao governo do estado em 2026, com mandato federal em curso na data de curadoria.",
    },
    historicoFix: {
      cargo: "Deputado Federal",
      periodo_inicio: 2019,
      periodo_fim: null,
      partido: "PT",
      estado: "ES",
      eleito_por: "voto direto",
      observacoes: "Mandato federal em curso (Câmara dos Deputados / TSE 2026)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "helder-salomao",
    source: "TSE (mandatos anteriores)",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Deputado Federal",
      periodo_inicio: 2011,
      periodo_fim: 2015,
      partido: "PT",
      estado: "ES",
      eleito_por: "voto direto",
      observacoes: "Mandato federal anterior (TSE)",
    },
  },
  {
    slug: "helder-salomao",
    source: "TSE / prefeitura Cariaçica",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 2009,
      periodo_fim: 2012,
      partido: "PT",
      estado: "ES",
      eleito_por: "voto direto",
      observacoes: "Prefeitura de Cariaçica (TSE e registros municipais; curadoria 15.csv)",
    },
  },
  {
    slug: "helder-salomao",
    source: "Câmara Municipal de Cariaçica / TSE",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Vereador",
      periodo_inicio: 1993,
      periodo_fim: 1996,
      partido: "PT",
      estado: "ES",
      eleito_por: "voto direto",
      observacoes: "Mandato municipal em Cariaçica (curadoria 15.csv)",
    },
  },
  {
    slug: "ricardo-ferraco",
    source: "G1 / O Globo ES + TSE — curadoria 15.csv",
    candidateUpdate: {
      partido_atual: "Movimento Democrático Brasileiro",
      partido_sigla: "MDB",
      cargo_atual: "Vice-Governador do Espírito Santo",
      situacao_candidatura: "pre-candidato",
      biografia:
        "Ricardo de Rezende Ferraço é político brasileiro, filiado ao Movimento Democrático Brasileiro (MDB). Foi deputado federal e senador pelo Espírito Santo e, na data de curadoria, exercia o cargo de vice-governador do estado; figura como pré-candidato ao governo em 2026.",
    },
    historicoFix: {
      cargo: "Vice-Governador",
      periodo_inicio: 2026,
      periodo_fim: null,
      partido: "MDB",
      estado: "ES",
      eleito_por: "voto direto",
      observacoes: "Vice-governador do Espírito Santo com filiação atual ao MDB em 2026; mandato eleito originalmente pelo PSDB (Governo ES + imprensa capixaba).",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "ricardo-ferraco",
    source: "Câmara dos Deputados / TSE",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Deputado Federal",
      periodo_inicio: 1999,
      periodo_fim: 2011,
      partido: "PSDB",
      estado: "ES",
      eleito_por: "voto direto",
      observacoes: "Mandatos consecutivos na Câmara dos Deputados (TSE)",
    },
  },
  {
    slug: "ricardo-ferraco",
    source: "Curadoria S15.3 lote 2: TSE consulta_cand 2006 ES / historical-sq-coverage.",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Vice-Governador",
      periodo_inicio: 2006,
      periodo_fim: 2010,
      partido: "PSDB",
      estado: "ES",
      eleito_por: "voto direto",
      observacoes:
        "Vice-governador do Espírito Santo eleito em 2006 pelo PSDB; SQ 10248 no coverage TSE local (consulta_cand 2006 ES).",
    },
  },
  {
    slug: "wellington-fagundes",
    source: "Senado Federal + TSE — curadoria 15.csv",
    candidateUpdate: {
      situacao_candidatura: "pre-candidato",
    },
    deleteHistoricoRows: [{ cargo: "Governador", periodo_inicio: 2018 }],
    historicoFix: {
      cargo: "Senador",
      periodo_inicio: 2015,
      periodo_fim: null,
      partido: "PL",
      estado: "MT",
      eleito_por: "voto direto",
      observacoes: "Mandato federal em curso; filiação PL (Senado Federal + TSE 2026)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "wellington-fagundes",
    source:
      "Câmara dos Deputados (dadosabertos.camara.leg.br id=73653 histórico) + TSE — curadoria Novas Curadorias lote 1 2026-04-23",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Deputado Federal",
      periodo_inicio: 1991,
      periodo_fim: 2015,
      partido: "PR/PL",
      estado: "MT",
      eleito_por: "voto direto",
      observacoes:
        "Seis legislaturas consecutivas (49ª a 54ª, 1991-02-01 a 2015-01-31) por MT; migração formal de PL para PR registrada em 2007-01-25 (fusão PL+PRONA) e retorno a PL em 2019 após a renomeação do PR (Câmara dos Deputados — histórico oficial id=73653)",
    },
  },
  {
    slug: "eduardo-paes",
    source: "Prefeitura do Rio de Janeiro + O Globo / G1 — curadoria 15.csv",
    candidateUpdate: {
      partido_atual: "Partido Social Democrático",
      partido_sigla: "PSD",
      situacao_candidatura: "pre-candidato",
      biografia:
        "Eduardo da Costa Paes é advogado e político brasileiro, filiado ao Partido Social Democrático (PSD). Foi deputado federal pelo Rio de Janeiro (1999–2007), ministro do Turismo (2007–2008) e prefeito da capital fluminense em mais de um período; reeleito em 2024, exerce mandato até 2028 e articula pré-candidatura ao governo do estado em 2026.",
    },
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 2021,
      periodo_fim: null,
      partido: "PSD",
      estado: "RJ",
      eleito_por: "voto direto",
      observacoes: "Mandato atual na Prefeitura do Rio de Janeiro após reeleição em 2024 (Prefeitura + G1 2026)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "eduardo-paes",
    source: "TSE / imprensa (mandatos municipais anteriores)",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 2009,
      periodo_fim: 2016,
      partido: "PMDB",
      estado: "RJ",
      eleito_por: "voto direto",
      observacoes: "Prefeitura do Rio de Janeiro — período 2009–2016 (TSE + O Globo)",
    },
  },
  {
    slug: "eduardo-paes",
    source: "Imprensa federal / registros de governo",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Ministro do Turismo",
      periodo_inicio: 2007,
      periodo_fim: 2008,
      partido: "DEM/PMDB",
      estado: "BR",
      eleito_por: "nomeacao",
      observacoes: "Ministério do Turismo no governo federal (registros oficiais; curadoria 15.csv)",
    },
  },
  {
    slug: "eduardo-paes",
    source: "Câmara dos Deputados / TSE",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Deputado Federal",
      periodo_inicio: 1999,
      periodo_fim: 2007,
      partido: "PSDB/DEM",
      estado: "RJ",
      eleito_por: "voto direto",
      observacoes: "Mandatos federais consecutivos (Câmara dos Deputados / TSE)",
    },
  },
  // Lote 17 (17.csv — coorte governadores SP)
  {
    slug: "erika-hilton",
    source: "Câmara dos Deputados + TSE + curadoria 17.csv",
    candidateUpdate: {
      cargo_atual: "Deputada Federal",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      biografia:
        "Erika Hilton é política brasileira, filiada ao PSOL, primeira mulher trans eleita vereadora em São Paulo (2020) e deputada federal por São Paulo desde 2023. Há movimentação interna e na imprensa citando cenários para governo do estado ou Senado em 2026, sem definição fechada na data de curadoria.",
    },
    historicoFix: {
      cargo: "Vereador",
      periodo_inicio: 2021,
      periodo_fim: 2022,
      partido: "PSOL",
      estado: "SP",
      eleito_por: "voto direto",
      observacoes: "Mandato na Câmara Municipal de São Paulo (TSE + curadoria 17.csv)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "erika-hilton",
    source: "TSE + curadoria 17.csv",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Deputada Federal",
      periodo_inicio: 2023,
      periodo_fim: null,
      partido: "PSOL",
      estado: "SP",
      eleito_por: "voto direto",
      observacoes: "Mandato federal em curso (Câmara + curadoria 17.csv)",
    },
  },
  {
    slug: "felicio-ramuth",
    source: "Governo de SP + TSE + curadoria 17.csv",
    candidateUpdate: {
      nome_completo: "Felício Ramuth",
      partido_atual: "Movimento Democrático Brasileiro",
      cargo_atual: "Vice-Governador de São Paulo",
      cargo_disputado: "Vice-Governador",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      biografia:
        "Felício Ramuth é empresário e político brasileiro, filiado ao MDB. Foi prefeito de São José dos Campos pelo PSDB (2017–2022) e é vice-governador de São Paulo desde 2023, eleito em 2022 pelo PSD e posteriormente filiado ao MDB. O pleito majoritário de 2026 permanece incerto na data de curadoria.",
    },
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 2017,
      periodo_fim: 2020,
      partido: "PSDB",
      estado: "SP",
      eleito_por: "voto direto",
      observacoes: "Primeiro mandato em São José dos Campos (TSE + curadoria 17.csv)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "felicio-ramuth",
    source: "TSE + curadoria 17.csv",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 2021,
      periodo_fim: 2022,
      partido: "PSDB",
      estado: "SP",
      eleito_por: "voto direto",
      observacoes: "Segundo mandato em São José dos Campos (TSE)",
    },
  },
  {
    slug: "felicio-ramuth",
    source: "TSE + curadoria 17.csv",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Vice-Governador",
      periodo_inicio: 2023,
      periodo_fim: null,
      partido: "MDB",
      estado: "SP",
      eleito_por: "voto direto",
      observacoes: "Eleito em 2022 pelo PSD; filiação ao MDB em 2026 (curadoria 17.csv)",
    },
  },
  {
    slug: "haddad-gov-sp",
    source: "curadoria 17.csv",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Ministro da Educação",
      periodo_inicio: 2005,
      periodo_fim: 2012,
      partido: "PT",
      estado: "",
      eleito_por: "nomeacao",
      observacoes: "Governo Lula (curadoria 17.csv)",
    },
  },
  {
    slug: "haddad-gov-sp",
    source: "TSE + curadoria 17.csv",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 2013,
      periodo_fim: 2016,
      partido: "PT",
      estado: "SP",
      eleito_por: "voto direto",
      observacoes: "Prefeitura de São Paulo (TSE)",
    },
  },
  {
    slug: "haddad-gov-sp",
    source: "TSE",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Presidente",
      periodo_inicio: 2018,
      periodo_fim: 2018,
      partido: "PT",
      estado: "",
      eleito_por: "",
      observacoes: "candidatura: pleito à Presidência em 2018 (TSE)",
    },
  },
  // Bloco "Presidente 2022" removido em 2026-04-17 (curadoria interna Fluxo 2):
  // Haddad disputou o governo de São Paulo em 2022, não a Presidência. A
  // `deleteHistoricoRows` do primeiro bloco de `haddad-gov-sp` purga a row
  // legada do DB; a candidatura correta "Governador 2022 NÃO ELEITO" já
  // existe via ingest TSE.
  {
    slug: "geraldo-alckmin",
    source: "Vice-Presidência + PSB + curadoria 17.csv",
    candidateUpdate: {
      nome_completo: "Geraldo José Rodrigues Alckmin Filho",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      cargo_atual: "Vice-Presidente da República",
      biografia:
        "Geraldo Alckmin é médico e político brasileiro, filiado ao PSB. Foi governador de São Paulo em vários mandatos (2001–2006 e 2011–2018) pelo PSDB; é vice-presidente da República e ministro no governo federal desde 2023. Citado em pesquisas para o governo de São Paulo em 2026, permanece no exercício do mandato federal; o pleito estadual permanece incerto na data de curadoria.",
    },
    historicoFix: {
      cargo: "Governador de Sao Paulo",
      periodo_inicio: 2001,
      periodo_fim: 2018,
      partido: "PSDB",
      estado: "SP",
      eleito_por: "voto direto",
      observacoes: "Sucessivos mandatos estaduais consolidados no TSE (curadoria 17.csv)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "geraldo-alckmin",
    source: "TSE + curadoria 17.csv",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Vice-Presidente da República",
      periodo_inicio: 2023,
      periodo_fim: null,
      partido: "PSB",
      estado: "",
      eleito_por: "voto direto",
      observacoes: "Eleito em 2022 na chapa Lula-Alckmin (TSE)",
    },
  },
  {
    slug: "geraldo-alckmin",
    source: "TSE",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Presidente",
      periodo_inicio: 2018,
      periodo_fim: 2018,
      partido: "PSDB",
      estado: "",
      eleito_por: "",
      observacoes: "candidatura: pleito à Presidência em 2018 (TSE) — não confundir com mandato",
    },
  },
  {
    slug: "geraldo-alckmin",
    source: "Câmara dos Deputados biografia 65480 — curadoria S15.3 lote 4",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Vereador",
      periodo_inicio: 1972,
      periodo_fim: 1976,
      partido: "MDB",
      estado: "SP",
      eleito_por: "voto direto",
      observacoes:
        "Mandato em Pindamonhangaba pelo MDB (Câmara dos Deputados, biografia 65480; curadoria S15.3 lote 4).",
    },
  },
  {
    slug: "geraldo-alckmin",
    source: "Câmara dos Deputados biografia 65480 — curadoria S15.3 lote 4",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 1976,
      periodo_fim: 1982,
      partido: "MDB",
      estado: "SP",
      eleito_por: "voto direto",
      observacoes:
        "Prefeito de Pindamonhangaba pelo MDB (Câmara dos Deputados, biografia 65480; curadoria S15.3 lote 4).",
    },
  },
  {
    slug: "geraldo-alckmin",
    source: "Câmara dos Deputados biografia 65480 — curadoria S15.3 lote 4",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Deputado Estadual",
      periodo_inicio: 1983,
      periodo_fim: 1987,
      partido: "PMDB",
      estado: "SP",
      eleito_por: "voto direto",
      observacoes:
        "Mandato estadual em São Paulo pelo PMDB (Câmara dos Deputados, biografia 65480; curadoria S15.3 lote 4).",
    },
  },
  {
    slug: "gilberto-kassab",
    source: "TSE / imprensa + curadoria 17.csv",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 2006,
      periodo_fim: 2012,
      partido: "DEM",
      estado: "SP",
      eleito_por: "voto direto",
      observacoes: "Prefeitura de São Paulo (curadoria 17.csv)",
    },
  },
  {
    slug: "gilberto-kassab",
    source: "curadoria 17.csv",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Ministro das Cidades",
      periodo_inicio: 2015,
      periodo_fim: 2016,
      partido: "PSD",
      estado: "",
      eleito_por: "nomeacao",
      observacoes: "Governo Dilma (curadoria 17.csv)",
    },
  },
  {
    slug: "gilberto-kassab",
    source: "curadoria 17.csv",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Ministro da Ciência, Tecnologia, Inovações e Comunicações",
      periodo_inicio: 2016,
      periodo_fim: 2018,
      partido: "PSD",
      estado: "",
      eleito_por: "nomeacao",
      observacoes: "Governo Temer (curadoria 17.csv)",
    },
  },
  {
    slug: "ricardo-nunes",
    source: "Prefeitura de São Paulo + TSE + curadoria 17.csv",
    candidateUpdate: {
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      cargo_atual: "Prefeito de São Paulo",
      biografia:
        "Ricardo Nunes é empresário e político brasileiro, filiado ao MDB. Foi vereador, vice-prefeito na chapa de Bruno Covas, assumiu a Prefeitura de São Paulo em 2021 e foi reeleito em 2024. Há especulação sobre o governo do estado em 2026, sem definição formal na data de curadoria.",
    },
    historicoFix: {
      cargo: "Vereador",
      periodo_inicio: 2013,
      periodo_fim: 2020,
      partido: "MDB",
      estado: "SP",
      eleito_por: "voto direto",
      observacoes: "Mandatos na Câmara Municipal (TSE + curadoria 17.csv)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "ricardo-nunes",
    source: "TSE + curadoria 17.csv",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Vice-Prefeito",
      periodo_inicio: 2021,
      periodo_fim: 2021,
      partido: "MDB",
      estado: "SP",
      eleito_por: "voto direto",
      observacoes: "Vice na chapa eleita em 2020; sucessão em 2021 (Prefeitura de São Paulo + curadoria 17.csv)",
    },
  },
  {
    slug: "ricardo-nunes",
    source: "TSE + curadoria 17.csv",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 2021,
      periodo_fim: null,
      partido: "MDB",
      estado: "SP",
      eleito_por: "voto direto",
      observacoes: "Prefeito em exercício; reeleito em 2024 (TSE + curadoria 17.csv)",
    },
  },
  {
    slug: "tarcisio-gov-sp",
    source: "Governo de SP + Republicanos + curadoria 17.csv",
    candidateUpdate: {
      nome_completo: "Tarcísio Gomes de Freitas",
      cargo_atual: "Governador de São Paulo",
      cargo_disputado: "Governador",
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      biografia:
        "Tarcísio de Freitas é engenheiro e político brasileiro (Republicanos). Como técnico e servidor público de carreira, não há registro público de filiação partidária antes de março de 2022; filiou-se ao Republicanos em 22 de março de 2022 para disputar o governo paulista. Foi diretor-geral do DNIT, ministro da Infraestrutura (2019–2022) e é governador de São Paulo desde 1º de janeiro de 2023, eleito em 2022; figura na disputa à reeleição em 2026, sem registro deferido no TSE na data de curadoria (TSE; saopaulo.sp.gov.br; republicanos10.org.br; G1; auditoria trajetória 2026-04-12).",
    },
    historicoFix: {
      cargo: "Diretor-Geral do DNIT",
      periodo_inicio: 2014,
      periodo_fim: 2015,
      partido: "sem partido",
      estado: "",
      eleito_por: "nomeacao",
      observacoes: "Função federal (curadoria 17.csv)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "tarcisio-gov-sp",
    source: "curadoria 17.csv",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Ministro da Infraestrutura",
      periodo_inicio: 2019,
      periodo_fim: 2022,
      partido: "sem partido",
      estado: "",
      eleito_por: "nomeacao",
      observacoes:
        "Governo Bolsonaro; sem filiação partidária registrada antes da filiação ao Republicanos em 22/03/2022 (curadoria 17.csv + auditoria trajetória 2026-04-12)",
    },
  },
  {
    slug: "tarcisio-gov-sp",
    source: "TSE + curadoria 17.csv",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Governador de Sao Paulo",
      periodo_inicio: 2023,
      periodo_fim: null,
      partido: "REPUBLICANOS",
      estado: "SP",
      eleito_por: "voto direto",
      observacoes: "Eleito em 2022; mandato desde 1º de janeiro de 2023 (TSE + curadoria 17.csv)",
    },
  },
  {
    slug: "tarcisio-gov-sp",
    source:
      "Auditoria trajetória partidária 2026-04-12 (linha 19, perfil governo) + TSE + Governo de SP + republicanos10.org.br + G1",
    candidateUpdate: {},
    deleteTimelineRows: [{ partido_novo: "REPUBLICANOS", ano: 2022 }],
    ensureTimelineRows: [
      {
        partido_anterior: "Sem partido",
        partido_novo: "REPUBLICANOS",
        ano: 2022,
        data_mudanca: "2022-03-22",
        contexto:
          "Primeira filiação partidária documentada em 22/03/2022; candidatura ao governo de São Paulo pelo Republicanos (TSE DivulgaCandContas 2022; Governo de SP; republicanos10.org.br; G1; auditoria trajetória 2026-04-12).",
      },
    ],
  },
  // Lote 18 (18.csv — PR governadores / coorte)
  {
    slug: "alexandre-curi",
    source: "Gazeta do Povo + ALEP + curadoria 18.csv",
    candidateUpdate: {
      partido_sigla: "REPUBLICANOS",
      partido_atual: "Republicanos",
      cargo_atual: "Presidente da Assembleia Legislativa do Paraná",
      situacao_candidatura: "pre-candidato",
      status: "pre-candidato",
      biografia:
        "Alexandre Curi é político paranaense, presidente da Assembleia Legislativa do Paraná e deputado estadual. Em 2026 filiou-se ao Republicanos para disputar o governo do estado, deixando o PSD; figura como pré-candidato, sem registro deferido no TSE na data de curadoria.",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "guto-silva",
    source: "Folha do Litoral PR + curadoria 18.csv",
    candidateUpdate: {
      cargo_disputado: "Nenhum",
      cargo_atual: null,
      situacao_candidatura: "incerto",
      status: "pre-candidato",
      partido_sigla: "PSD",
      partido_atual: "Partido Social Democrático",
      biografia:
        "Luiz Augusto Silva, conhecido como Guto Silva, é empresário e político brasileiro, filiado ao Partido Social Democrático (PSD). Foi secretário das Cidades do Paraná até o desligamento previsto para abril de 2026 para compor chapas, sem figurar como cabeça de chapa ao governo do estado na data de curadoria. O pleito majoritário de 2026 para este perfil permanece indefinido.",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "rafael-greca",
    source:
      "Auditoria trajetória partidária 2026-04-12 + TSE DivulgaCandContas + Gazeta do Povo + Bem Paraná + curadoria S15.3 lote 4",
    candidateUpdate: {
      partido_sigla: "MDB",
      partido_atual: "Movimento Democrático Brasileiro",
      cargo_atual: "Secretário de Desenvolvimento Sustentável do Paraná",
      situacao_candidatura: "pre-candidato",
      status: "pre-candidato",
      biografia:
        "Rafael Valdomiro Greca de Macedo é economista, engenheiro civil, escritor e político brasileiro, filiado ao Movimento Democrático Brasileiro (MDB) em 2026. A trajetória partidária documentada na auditoria editorial e no TSE segue a sequência PFL (mandatos legislativos até 2006), PMDB/MDB, PMN, DEM, PSD e MDB, considerando que PMDB e MDB são a mesma legenda partidária com mudança institucional de sigla em 2017. Foi prefeito de Curitiba por três mandatos. Após deixar a prefeitura, assumiu a Secretaria de Desenvolvimento Sustentável do Paraná; figura como pré-candidato ao governo do estado em 2026, sem registro deferido no TSE na data de curadoria.",
    },
    deleteTimelineRows: [
      { partido_anterior: "PSD", partido_novo: "DEM", ano: 2020 },
      { partido_anterior: "PMN", partido_novo: "PSD", ano: 2020 },
    ],
    ensureTimelineRows: [
      {
        partido_anterior: "PFL",
        partido_novo: "PMDB",
        ano: 2006,
        data_mudanca: null,
        contexto:
          "Transição entre mandato legislativo pelo PFL e candidaturas legislativas seguintes pelo PMDB (TSE DivulgaCandContas 2002/2006/2010/2014; curadoria S15.3 lote 4).",
      },
    ],
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "rafael-greca",
    source: "Governo do Paraná + auditoria trajetória partidária 2026-04-12",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Secretário de Desenvolvimento Sustentável",
      periodo_inicio: 2025,
      periodo_fim: null,
      partido: "MDB",
      estado: "PR",
      eleito_por: "nomeacao",
      observacoes: "Secretário de Desenvolvimento Sustentável do Paraná (governo estadual + curadoria 18.csv + corrigido 2026-04-12)",
    },
  },
  {
    slug: "sergio-moro-gov-pr",
    source: "Senado Federal + Globo + CNN Brasil + curadoria 18.csv",
    candidateUpdate: {
      partido_sigla: "PL",
      partido_atual: "Partido Liberal",
      situacao_candidatura: "pre-candidato",
      status: "pre-candidato",
      biografia:
        "Sergio Fernando Moro é jurista e político brasileiro, filiado ao Partido Liberal (PL). Foi juiz federal na Operação Lava Jato, ministro da Justiça no governo Bolsonaro e é senador pelo Paraná desde 2019, eleito pelo Podemos com trajetória partidária posterior até o PL em 2026; figura como pré-candidato ao governo do Paraná, sem registro deferido no TSE na data de curadoria.",
    },
    historicoFix: {
      cargo: "Senador",
      periodo_inicio: 2026,
      periodo_fim: null,
      partido: "PL",
      estado: "PR",
      eleito_por: "voto direto",
      observacoes:
        "Senador pelo Paraná com filiação ao PL em 2026 para pré-candidatura ao governo do Paraná; mandato eleito originalmente pelo União Brasil em 2022 (Senado Federal + BandNews 2026).",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "thiago-de-joaldo",
    source: "Câmara dos Deputados oficial 2026-04-02 + ITNet 2025-11-12",
    candidateUpdate: {},
    deleteHistoricoRows: [
      {
        cargo: "Deputado(a) Federal",
        periodo_inicio: 2023,
        tipo_evento: "mandato",
      },
    ],
  },
  {
    slug: "jose-eliton",
    source: "Governo de Goiás + TSE DivulgaCandContas 2010",
    candidateUpdate: {},
    deleteHistoricoRows: [
      {
        cargo: "Vice-Governador",
        periodo_inicio: 2010,
        tipo_evento: "candidatura",
        observacoes_includes: "#NULO",
      },
    ],
  },
  {
    slug: "garotinho",
    source: "TSE DivulgaCandContas 2022",
    candidateUpdate: {},
    deleteHistoricoRows: [
      {
        cargo: "Deputado Federal",
        periodo_inicio: 2022,
        tipo_evento: "candidatura",
        observacoes_includes: "#NULO",
      },
    ],
  },
  {
    slug: "washington-reis",
    source: "TSE DivulgaCandContas 2022",
    candidateUpdate: {},
    deleteHistoricoRows: [
      {
        cargo: "Vice-Governador",
        periodo_inicio: 2022,
        tipo_evento: "candidatura",
        observacoes_includes: "#NULO",
      },
    ],
  },
  {
    slug: "alvaro-dias-rn",
    source: "TSE DivulgaCandContas 2010",
    candidateUpdate: {},
    deleteHistoricoRows: [
      {
        cargo: "Vice-Governador",
        periodo_inicio: 2010,
        tipo_evento: "candidatura",
        observacoes_includes: "#NULO",
      },
    ],
  },
  {
    slug: "alvaro-dias-rn",
    source:
      "Remediação P0 2026-04-15: remover reversão PSDB↔PDT em 2006 (`same_year_reversal`), mantendo a filiação ao PDT como evento único a partir do PSDB (ALERN + auditoria 2026-04-12).",
    candidateUpdate: {},
    deleteTimelineRows: [{ partido_anterior: "PDT", partido_novo: "PSDB", ano: 2006 }],
  },
  {
    slug: "alvaro-dias-rn",
    source:
      "Curadoria residual 2026-04-15: `party_timeline_continuity` — substituir arestas agregadas TSE e o trecho PODE/Republicanos/PL por cadeia única PMDB→PDT→MDB→PSDB→Republicanos→PL (ALERN + mandatos TSE/Prefeitura Natal + biografia PL mar/2026), sem reabrir `same_year_reversal`.",
    candidateUpdate: {},
    deleteTimelineRows: [
      {
        partido_anterior: "PMDB",
        partido_novo: "PSDB",
        ano: 1998,
        contexto_includes: "Mudança observada entre eleições TSE",
      },
      {
        partido_anterior: "PSDB",
        partido_novo: "PMDB",
        ano: 2002,
        contexto_includes: "Mudança observada entre eleições TSE",
      },
      {
        partido_anterior: "PMDB",
        partido_novo: "PDT",
        ano: 2002,
        contexto_includes: "Mudança observada entre eleições TSE",
      },
      {
        partido_anterior: "PSDB",
        partido_novo: "PDT",
        ano: 2006,
        contexto_includes: "Mudança observada entre eleições TSE",
      },
      {
        partido_anterior: "PDT",
        partido_novo: "PSDB",
        ano: 2014,
        contexto_includes: "Mudança observada entre eleições TSE",
      },
      {
        partido_anterior: "PSDB",
        partido_novo: "PMDB",
        ano: 2014,
        contexto_includes: "Mudança observada entre eleições TSE",
      },
      {
        partido_anterior: "PMDB",
        partido_novo: "PODE",
        ano: 2018,
        contexto_includes: "Mudança observada entre eleições TSE",
      },
      {
        partido_anterior: "PODE",
        partido_novo: "PSDB",
        ano: 2020,
        contexto_includes: "Mudança observada entre eleições TSE",
      },
      {
        partido_anterior: "PSDB",
        partido_novo: "PODE",
        ano: 2022,
        contexto_includes: "Mudança observada entre eleições TSE",
      },
      { partido_anterior: "PODE", partido_novo: "REPUBLICANOS", ano: 2026 },
      { partido_anterior: "REPUBLICANOS", partido_novo: "PL", ano: 2026 },
    ],
    ensureTimelineRows: [
      {
        partido_anterior: "PMDB",
        partido_novo: "PDT",
        ano: 2003,
        data_mudanca: "2003-03-15",
        contexto:
          "Filiação ao PDT em 2003 após mandatos pelo PMDB na ALERN (ALERN memorial legislativo RN + auditoria trajetória 2026-04-12).",
      },
      {
        partido_anterior: "PDT",
        partido_novo: "MDB",
        ano: 2017,
        data_mudanca: "2017-01-02",
        contexto:
          "Transição para o MDB (ex-PMDB) antes do mandato de vice-prefeito de Natal 2017–2018 (TSE + curadoria 2026-04-12).",
      },
      {
        partido_anterior: "MDB",
        partido_novo: "PSDB",
        ano: 2021,
        data_mudanca: "2021-01-15",
        contexto:
          "Filiação ao PSDB para o segundo mandato de prefeito de Natal 2021–2024 (TSE + O Globo + curadoria 2026-04-12).",
      },
      {
        partido_anterior: "PSDB",
        partido_novo: "REPUBLICANOS",
        ano: 2025,
        data_mudanca: "2025-11-01",
        contexto:
          "Passagem ao Republicanos antes do ciclo eleitoral de 2026 (Republicanos10 + Agora RN + auditoria 2026-04-12; distinto do homônimo paranaense).",
      },
      {
        partido_anterior: "REPUBLICANOS",
        partido_novo: "PL",
        ano: 2026,
        data_mudanca: "2026-03-15",
        contexto:
          "Filiação ao PL em março de 2026 (biografia curada + auditoria trajetória 2026-04-12).",
      },
    ],
  },
  {
    slug: "alvaro-dias-rn",
    source:
      "Curadoria §15.3 (2026-04-15): alinhar `mudancas_partido` à sequência de mandatos em `historico_politico` — transição PDT→PMDB entre mandatos estaduais 2006 e 2014 (ALERN + TSE + auditoria trajetória 2026-04-12).",
    candidateUpdate: {},
    ensureTimelineRows: [
      {
        partido_anterior: "PDT",
        partido_novo: "PMDB",
        ano: 2014,
        data_mudanca: null,
        contexto:
          "Retorno ao PMDB para o mandato estadual 2014–2020 após o período pelo PDT (ALERN + TSE; remediação §15.3 `mandato_transicao_sem_mudanca`).",
      },
    ],
  },
  {
    slug: "alvaro-dias-rn",
    source:
      "Curadoria §15.3 (2026-04-22): remover os tokens `Governador 2025/2026` de `historico_politico`, preservando apenas a timeline PSDB→Republicanos→PL. As duas rows eram artefatos de materialização partidária, não mandato nem candidatura canônica comprovada.",
    candidateUpdate: {},
    deleteHistoricoRows: [
      { cargo: "Governador", periodo_inicio: 2025, tipo_evento: "candidatura" },
      { cargo: "Governador", periodo_inicio: 2026, tipo_evento: "candidatura" },
    ],
  },
  {
    slug: "clecio-luis",
    source: "TSE DivulgaCandContas 2010",
    candidateUpdate: {},
    deleteHistoricoRows: [
      {
        cargo: "Deputado Federal",
        periodo_inicio: 2010,
        tipo_evento: "candidatura",
        observacoes_includes: "#NULO",
      },
      {
        cargo: "1º Suplente Senador",
        periodo_inicio: 2010,
        tipo_evento: "candidatura",
        observacoes_includes: "#NULO",
      },
    ],
  },
  {
    slug: "dr-furlan",
    source: "TSE DivulgaCandContas 2010",
    candidateUpdate: {},
    deleteHistoricoRows: [
      {
        cargo: "Deputado Estadual",
        periodo_inicio: 2010,
        tipo_evento: "candidatura",
        observacoes_includes: "#NULO",
      },
    ],
  },
  {
    slug: "maria-do-carmo",
    source: "A Crítica + CNN Brasil + G1 AM + ALEAM/Flickr 2022",
    candidateUpdate: {
      foto_url: "https://live.staticflickr.com/65535/52112921786_50ee8f3dae.jpg",
    },
    deleteHistoricoRows: [
      {
        cargo: "Vereador",
        periodo_inicio: 2020,
        tipo_evento: "candidatura",
        observacoes_includes: "#NULO",
      },
    ],
  },
  {
    slug: "wilder-morais",
    source: "TSE DivulgaCandContas 2010",
    candidateUpdate: {},
    deleteHistoricoRows: [
      {
        cargo: "1º Suplente Senador",
        periodo_inicio: 2010,
        tipo_evento: "candidatura",
        observacoes_includes: "#NULO",
      },
    ],
  },
  {
    slug: "otaviano-pivetta",
    source: "TSE DivulgaCandContas 2010",
    candidateUpdate: {},
    deleteHistoricoRows: [
      {
        cargo: "Vice-Governador",
        periodo_inicio: 2010,
        tipo_evento: "candidatura",
        observacoes_includes: "#NULO",
      },
    ],
  },
  {
    slug: "fabio-mitidieri",
    source: "TSE DivulgaCandContas 2010",
    candidateUpdate: {},
    deleteHistoricoRows: [
      {
        cargo: "Deputado Estadual",
        periodo_inicio: 2010,
        tipo_evento: "candidatura",
        observacoes_includes: "#NULO",
      },
    ],
  },
  {
    slug: "gilberto-kassab",
    source: "Curadoria 17.csv + histórico público consolidado",
    candidateUpdate: {},
    deleteHistoricoRows: [
      {
        cargo: "Prefeito de São Paulo",
        periodo_inicio: 2006,
        tipo_evento: "mandato",
      },
    ],
  },
  {
    slug: "ricardo-nunes",
    source: "Curadoria 17.csv + histórico público consolidado",
    candidateUpdate: {},
    deleteHistoricoRows: [
      {
        cargo: "Prefeito de São Paulo",
        periodo_inicio: 2021,
        tipo_evento: "mandato",
      },
      {
        cargo: "Vice-Prefeito",
        periodo_inicio: 2021,
        tipo_evento: "candidatura",
      },
    ],
  },
  {
    slug: "hana-ghassan",
    source: "O Liberal 2026-04-02 + Governo do Pará + limpeza de importação automática",
    candidateUpdate: {},
    deleteHistoricoRows: [
      {
        cargo: "Secretário",
        periodo_inicio: 2019,
        tipo_evento: "mandato",
        observacoes_includes: "Wikidata",
      },
    ],
  },
  {
    slug: "eduardo-paes",
    source: "Prefeitura do Rio de Janeiro + O Globo / G1 + limpeza de importação automática",
    candidateUpdate: {},
    deleteHistoricoRows: [
      {
        cargo: "Presidente",
        periodo_inicio: 2013,
        tipo_evento: "mandato",
        observacoes_includes: "Wikidata",
      },
    ],
  },
  {
    slug: "eduardo-paes",
    source:
      "Curadoria S15.3 lote 2: TSE coverage 2002/2006/2008/2012/2024 + PSD oficial 2021; remover linha manual mista e cargo atual nulo redundante.",
    candidateUpdate: {},
    deleteTimelineRows: [
      { partido_anterior: "DEM", partido_novo: "PSD", ano: 2026 },
    ],
    ensureTimelineRows: [
      {
        partido_anterior: "DEM",
        partido_novo: "PSD",
        ano: 2021,
        data_mudanca: "2021-05-26",
        contexto: "Filiação de Eduardo Paes ao PSD em 26/05/2021 durante o mandato de prefeito (PSD oficial; curadoria S15.3 lote 2).",
      },
    ],
    deleteHistoricoRows: [
      {
        cargo: "Deputado Federal",
        periodo_inicio: 1999,
        periodo_fim: 2007,
        observacoes_includes: "Mandatos federais consecutivos",
      },
      {
        cargo: "Prefeito do Rio de Janeiro",
        periodo_inicio: null,
        periodo_fim: null,
        observacoes_includes: "Cargo atual confirmado",
      },
    ],
  },
  {
    slug: "lahesio-bonfim",
    source:
      "Curadoria S15.3 lote 2: TSE 2016/2020/2022 MA + NOVO 2026 + Imirante 2026-06-11; separar mandatos municipais reais e remover aresta PDT sem rastro no historico.",
    candidateUpdate: {
      partido_sigla: "NOVO",
      partido_atual: "Partido Novo",
      situacao_candidatura: "pre-candidato",
      status: "pre-candidato",
      biografia:
        "Lahesio Rodrigues Bonfim, conhecido como Dr. Lahesio, é médico e político brasileiro, filiado ao Partido Novo (NOVO). Foi prefeito de São Pedro dos Crentes em dois períodos, eleito pelo PSDB em 2016 e reeleito pelo PSL em 2020, renunciando em 2022 para disputar o governo do Maranhão pelo PSC. Em junho de 2026, a candidatura ao governo deixou de ser o enquadramento seguro; o Imirante registrou movimento ligado à disputa ao Senado.",
    },
    deleteTimelineRows: [
      { partido_anterior: "PDT", partido_novo: "PTB", ano: 2012 },
    ],
    deleteHistoricoRows: [
      {
        cargo: "Prefeito",
        periodo_inicio: 2017,
        periodo_fim: 2022,
        observacoes_includes: "Mandato municipal",
      },
    ],
  },
  {
    slug: "lahesio-bonfim",
    source: "Curadoria S15.3 lote 2: TSE consulta_cand 2016 MA.",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 2017,
      periodo_fim: 2020,
      partido: "PSDB",
      estado: "MA",
      eleito_por: "voto direto",
      observacoes: "Mandato de prefeito de São Pedro dos Crentes após eleição de 2016 pelo PSDB (TSE consulta_cand 2016 MA).",
    },
  },
  {
    slug: "lahesio-bonfim",
    source: "Curadoria S15.3 lote 2: TSE consulta_cand 2020 MA + renuncia em 2022.",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 2021,
      periodo_fim: 2022,
      partido: "PSL",
      estado: "MA",
      eleito_por: "voto direto",
      observacoes: "Segundo mandato de prefeito de São Pedro dos Crentes, reeleito em 2020 pelo PSL e encerrado em 2022 para disputar o governo do Maranhão (TSE consulta_cand 2020 MA).",
    },
  },
  {
    slug: "lahesio-bonfim",
    source:
      "Curadoria S15.3 lote 2 atualizada por Imirante 2026-06-11: movimento de Lahesio Bonfim ligado ao Senado, nao ao governo do Maranhao.",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Senador",
      periodo_inicio: 2026,
      periodo_fim: 2026,
      partido: "NOVO",
      estado: "MA",
      eleito_por: "",
      observacoes:
        "candidatura: em junho de 2026, Lahesio Bonfim aparece em movimento ligado à disputa ao Senado; nao tratar como pré-candidato ao governo do Maranhão sem nova fonte posterior.",
    },
  },
  {
    slug: "omar-aziz",
    source:
      "Curadoria S15.3 lote 2: Senado Federal / Senado Noticias / perfil parlamentar historico; materializar mandatos que explicam PPB, PFL e PMN.",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Vice-Prefeito",
      periodo_inicio: 1997,
      periodo_fim: 2000,
      partido: "PPB",
      estado: "AM",
      eleito_por: "voto direto",
      observacoes:
        "Vice-prefeito de Manaus no mandato 1997-2000; histórico partidário PPB/PFL/PMN/PSD confirmado por perfil parlamentar e Senado Notícias.",
    },
  },
  {
    slug: "omar-aziz",
    source:
      "Curadoria S15.3 lote 2: Senado Federal / Senado Noticias / perfil parlamentar historico; segundo mandato municipal pelo PFL.",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Vice-Prefeito",
      periodo_inicio: 2001,
      periodo_fim: 2002,
      partido: "PFL",
      estado: "AM",
      eleito_por: "voto direto",
      observacoes:
        "Vice-prefeito de Manaus no início do segundo mandato, até deixar o cargo em 2002 para disputar a vice-governadoria (Senado Notícias + perfil parlamentar).",
    },
  },
  {
    slug: "omar-aziz",
    source: "Curadoria S15.3 lote 2: Senado Federal perfil 5525 + Senado Noticias.",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Vice-Governador",
      periodo_inicio: 2003,
      periodo_fim: 2006,
      partido: "PFL",
      estado: "AM",
      eleito_por: "voto direto",
      observacoes: "Vice-governador do Amazonas no mandato 2003-2006; filiação PFL antes da migração ao PMN (Senado Federal).",
    },
  },
  {
    slug: "omar-aziz",
    source: "Curadoria S15.3 lote 2: Senado Federal perfil 5525 + Senado Noticias.",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Vice-Governador",
      periodo_inicio: 2007,
      periodo_fim: 2010,
      partido: "PMN",
      estado: "AM",
      eleito_por: "voto direto",
      observacoes: "Vice-governador do Amazonas no mandato 2007-2010 pelo PMN, antes de assumir o governo em 2010 (Senado Federal).",
    },
  },
  {
    slug: "adailton-furia",
    source:
      "Curadoria S15.3 lote 2: TSE 2012/2018 RO; remover P102 Wikidata REPUBLICANOS que duplica PRB e garantir PRB->PSD.",
    candidateUpdate: {},
    deleteTimelineRows: [
      { partido_anterior: "PSDB", partido_novo: "REPUBLICANOS", ano: 2012, contexto_includes: "Wikidata" },
      { partido_anterior: "REPUBLICANOS", partido_novo: "PSD", ano: 2018, contexto_includes: "Wikidata" },
    ],
    ensureTimelineRows: [
      {
        partido_anterior: "PRB",
        partido_novo: "PSD",
        ano: 2018,
        data_mudanca: null,
        contexto: "Mudança observada entre registros TSE: PRB em 2016 e PSD em 2018 (curadoria S15.3 lote 2).",
      },
    ],
  },
  {
    slug: "anderson-ferreira",
    source:
      "Curadoria S15.3 lote 2: Camara/TSE indicam mandato federal por PR; remover PV/Republicanos de homonimos/rows sem aderencia ao titular.",
    candidateUpdate: {},
    deleteTimelineRows: [
      { partido_anterior: "PR", partido_novo: "PV", ano: 2018 },
      { partido_anterior: "PV", partido_novo: "PL", ano: 2020 },
      { partido_anterior: "PL", partido_novo: "REPUBLICANOS", ano: 2020 },
      { partido_anterior: "REPUBLICANOS", partido_novo: "PL", ano: 2022 },
      { partido_novo: "PL", ano: 2026, contexto_includes: "partido atual verificado manualmente" },
    ],
    deleteHistoricoRows: [
      {
        cargo: "Vereador",
        periodo_inicio: 2020,
        periodo_fim: 2020,
        observacoes_includes: "TSE 2020",
      },
    ],
    ensureTimelineRows: [
      {
        partido_anterior: "PR",
        partido_novo: "PL",
        ano: 2019,
        data_mudanca: null,
        contexto: "PR retomou o nome Partido Liberal em 2019; Anderson Ferreira disputou o governo de Pernambuco em 2022 pelo PL (TSE; curadoria S15.3 lote 2).",
      },
    ],
  },
  {
    slug: "cleitinho",
    source:
      "Curadoria S15.3 lote 2: TSE 2016/2018/2020/2022 + Senado/Republicanos; trocar P102 CIDADANIA por cadeia eleitoral e materializar filiação Republicanos no mandato.",
    candidateUpdate: {},
    deleteTimelineRows: [
      { partido_anterior: "SEMPARTIDO", partido_novo: "CIDADANIA", ano: 2016, contexto_includes: "Wikidata" },
      { partido_anterior: "CIDADANIA", partido_novo: "PARTIDO SOCIAL CRISTÃO", ano: 2022, contexto_includes: "Wikidata" },
    ],
    deleteHistoricoRows: [
      {
        cargo: "Senador",
        periodo_inicio: null,
        periodo_fim: null,
        observacoes_includes: "Cargo atual confirmado",
      },
    ],
    ensureTimelineRows: [
      {
        partido_anterior: "PP",
        partido_novo: "PT DO B",
        ano: 2016,
        data_mudanca: null,
        contexto: "Mudança observada entre candidaturas TSE 2012 (PP) e 2016 (PT do B).",
      },
      {
        partido_anterior: "PSC",
        partido_novo: "REPUBLICANOS",
        ano: 2023,
        data_mudanca: null,
        contexto: "Filiação ao Republicanos durante o mandato no Senado (Senado/Republicanos; curadoria S15.3 lote 2).",
      },
    ],
  },
  {
    slug: "cleitinho",
    source: "Curadoria S15.3 lote 2: Senado Federal + Republicanos.",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Senador",
      periodo_inicio: 2023,
      periodo_fim: null,
      partido: "REPUBLICANOS",
      estado: "MG",
      eleito_por: "voto direto",
      observacoes: "Mandato de senador iniciado em 2023; filiação ao Republicanos consolidada durante o mandato (Senado Federal + Republicanos).",
    },
  },
  {
    slug: "ricardo-ferraco",
    source:
      "Curadoria S15.3 lote 2: TSE/Senado/Governo ES; remover mandatos manuais mistos sobrepostos e corrigir vice-governadoria atual para MDB em 2026.",
    candidateUpdate: {},
    deleteHistoricoRows: [
      {
        cargo: "Senador",
        periodo_inicio: 2011,
        periodo_fim: 2018,
        observacoes_includes: "Mandato federal no Senado",
      },
      {
        cargo: "Vice-Governador",
        periodo_inicio: 2019,
        periodo_fim: null,
        observacoes_includes: "Mandato de vice-governador",
      },
    ],
  },
  {
    slug: "rodrigo-pacheco",
    source:
      "Curadoria S15.3 lote 2: Senado Federal + PSD oficial 2021; remover PATRIOTA/homonimo e P102 redundante, materializar PSD no mandato de senador.",
    candidateUpdate: {},
    deleteTimelineRows: [
      { partido_anterior: "Sem partido", partido_novo: "MDB", ano: 2009, contexto_includes: "Wikidata" },
      { partido_anterior: "MDB", partido_novo: "DEMOCRATAS", ano: 2018, contexto_includes: "Wikidata" },
      { partido_anterior: "DEM", partido_novo: "PATRIOTA", ano: 2020 },
      { partido_anterior: "PATRIOTA", partido_novo: "PSD", ano: 2021, contexto_includes: "Wikidata" },
    ],
    ensureTimelineRows: [
      {
        partido_anterior: "DEM",
        partido_novo: "PSD",
        ano: 2021,
        data_mudanca: "2021-10-27",
        contexto: "Filiação ao PSD oficializada em 2021 durante o mandato no Senado (PSD oficial + Senado Federal; curadoria S15.3 lote 2).",
      },
    ],
    deleteHistoricoRows: [
      {
        cargo: "Vereador",
        periodo_inicio: 2020,
        periodo_fim: 2020,
        observacoes_includes: "TSE 2020",
      },
      {
        cargo: "Senador",
        periodo_inicio: null,
        periodo_fim: null,
        observacoes_includes: "Cargo atual confirmado",
      },
    ],
  },
  {
    slug: "rodrigo-pacheco",
    source: "Curadoria S15.3 lote 2: PSD oficial 2021 + Senado Federal perfil 5732.",
    candidateUpdate: {},
    ensureTimelineRows: [
      {
        partido_anterior: "DEM",
        partido_novo: "PSD",
        ano: 2021,
        data_mudanca: "2021-10-27",
        contexto: "Filiação ao PSD oficializada em 2021 durante o mandato no Senado (PSD oficial + Senado Federal; curadoria S15.3 lote 2).",
      },
    ],
    historicoFix: {
      cargo: "Senador",
      periodo_inicio: 2021,
      periodo_fim: null,
      partido: "PSD",
      estado: "MG",
      eleito_por: "voto direto",
      observacoes: "Mandato de senador por Minas Gerais; filiação ao PSD oficializada em 2021 durante o mandato (PSD oficial + Senado Federal).",
    },
  },
  {
    slug: "ronaldo-caiado",
    source:
      "Curadoria S15.3 lote 2: TSE/Governo GO/PSD; remover row manual ampla PFL-DEM e rows consolidadas que invertiam a ordem cronologica.",
    candidateUpdate: {},
    deleteHistoricoRows: [
      {
        cargo: "Deputado Federal",
        periodo_inicio: 1991,
        periodo_fim: 2015,
        observacoes_includes: "Sucessivos mandatos",
      },
      {
        cargo: "Governador de GO",
        periodo_inicio: 2019,
        periodo_fim: null,
        observacoes_includes: "DEM até a fusão",
      },
      {
        cargo: "Governador de Goiás",
        periodo_inicio: null,
        periodo_fim: null,
        observacoes_includes: "Cargo atual confirmado",
      },
    ],
  },
  {
    slug: "sergio-moro-gov-pr",
    source:
      "Curadoria S15.3 lote 2: Senado Federal/TSE 2022 + filiação PL 2026; remover P102 Podemos sem row canonica e homonimo municipal.",
    candidateUpdate: {},
    deleteTimelineRows: [
      { partido_anterior: "Sem partido", partido_novo: "PODEMOS", ano: 2021, contexto_includes: "Wikidata" },
      { partido_anterior: "SEMPARTIDO", partido_novo: "PODE", ano: 2021, contexto_includes: "Wikidata" },
      { partido_anterior: "PODE", partido_novo: "UNIAO", ano: 2022, contexto_includes: "Wikidata" },
    ],
    deleteHistoricoRows: [
      {
        cargo: "Vereador",
        periodo_inicio: 2016,
        periodo_fim: 2016,
        observacoes_includes: "TSE 2016",
      },
      {
        cargo: "Senador",
        periodo_inicio: 2019,
        periodo_fim: null,
        observacoes_includes: "Eleito em 2018 pelo Podemos",
      },
      {
        cargo: "Senador",
        periodo_inicio: null,
        periodo_fim: null,
        observacoes_includes: "Cargo atual confirmado",
      },
    ],
  },
  {
    slug: "dr-daniel",
    source:
      "Curadoria S15.3 lote 3: TSE 2018/2020/2024 + auditoria trajetória 2026-04-12 + G1/O Liberal/DO Municipal Ananindeua; separar mandato de prefeito MDB->PSB sem criar candidatura 2026 artificial.",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 2021,
      periodo_fim: 2024,
      partido: "MDB",
      estado: "PA",
      eleito_por: "voto direto",
      observacoes:
        "Prefeitura de Ananindeua no início do mandato 2021-2024 pelo MDB; migração ao PSB materializada separadamente em 2024 (TSE + auditoria trajetória 2026-04-12).",
    },
    ensureTimelineRows: [
      {
        partido_anterior: "PSDB",
        partido_novo: "MDB",
        ano: 2018,
        data_mudanca: null,
        contexto:
          "Filiação ao MDB ainda em 2018 durante o mandato de deputado estadual, após eleição pelo PSDB (TSE 2018 + auditoria trajetória 2026-04-12).",
      },
      {
        partido_anterior: "MDB",
        partido_novo: "PSB",
        ano: 2024,
        data_mudanca: null,
        contexto:
          "Filiação ao PSB no ciclo municipal de 2024 antes da reeleição/continuidade na Prefeitura de Ananindeua (TSE + auditoria trajetória 2026-04-12).",
      },
    ],
  },
  {
    slug: "dr-daniel",
    source:
      "Curadoria S15.3 lote 3: TSE 2024 + auditoria trajetória 2026-04-12; materializar trecho PSB do mandato municipal sem projetar Podemos como cargo.",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 2024,
      periodo_fim: 2026,
      partido: "PSB",
      estado: "PA",
      eleito_por: "voto direto",
      observacoes:
        "Trecho final do mandato municipal após filiação ao PSB em 2024; deixou o cargo em 02/04/2026 para desincompatibilização no ciclo estadual (TSE + G1 Pará + DO Municipal Ananindeua).",
    },
  },
  {
    slug: "eduardo-braga",
    source:
      "Curadoria S15.3 lote 3: Senado Federal perfil oficial + TSE; alinhar transição PPS->PMDB no começo do governo e remover PTB 2012/2014 sem rastro no histórico.",
    candidateUpdate: {},
    deleteTimelineRows: [
      { partido_anterior: "PMDB", partido_novo: "PTB", ano: 2012, contexto_includes: "Mudança observada entre eleições TSE" },
      { partido_anterior: "PTB", partido_novo: "PMDB", ano: 2014, contexto_includes: "Mudança observada entre eleições TSE" },
    ],
    ensureTimelineRows: [
      {
        partido_anterior: "PPS",
        partido_novo: "PMDB",
        ano: 2003,
        data_mudanca: null,
        contexto:
          "Transição materializada no início do governo do Amazonas: eleito em 2002 pelo PPS e histórico de mandato a partir de 2003 pelo PMDB (TSE + Senado Federal).",
      },
    ],
  },
  {
    slug: "jeronimo",
    source:
      "Curadoria S15.3 lote 3: TSE 2016/2020 + Governo da Bahia; materializar candidatura municipal PMN para fechar a cadeia PTN->PT->PMN->MDB sem linha artificial.",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Vereador",
      periodo_inicio: 2016,
      periodo_fim: 2016,
      partido: "PMN",
      estado: "BA",
      eleito_por: "",
      observacoes: "Candidatura municipal de 2016 pelo PMN (TSE; curadoria S15.3 lote 3).",
    },
  },
  {
    slug: "jhc",
    source:
      "Curadoria S15.3 lote 3: TSE 2010/2020/2024 + G1 AL/Metrópoles 2026; corrigir partido do mandato estadual inicial e separar Prefeitura PSB->PL por reeleição de 2024.",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Deputado Estadual",
      periodo_inicio: 2011,
      periodo_fim: 2015,
      partido: "PTN",
      estado: "AL",
      eleito_por: "voto direto",
      observacoes:
        "Mandato estadual iniciado após eleição de 2010 pelo PTN; migrações posteriores para Solidariedade/PSB ficam na timeline e nos mandatos federais subsequentes (TSE + curadoria S15.3 lote 3).",
    },
    deleteTimelineRows: [
      {
        partido_anterior: "PSB",
        partido_novo: "PL",
        ano: 2026,
        contexto_includes: "Filiação atual observada",
      },
    ],
    ensureTimelineRows: [
      {
        partido_anterior: "PSB",
        partido_novo: "PL",
        ano: 2024,
        data_mudanca: null,
        contexto:
          "Reeleição à Prefeitura de Maceió em 2024 pelo PL, após mandato municipal iniciado pelo PSB (TSE 2024 + G1 AL/Metrópoles 2026).",
      },
    ],
  },
  {
    slug: "jhc",
    source:
      "Curadoria S15.3 lote 3: TSE 2020/2024 + G1 AL/Metrópoles 2026; separar mandato municipal antes/depois da reeleição pelo PL.",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 2021,
      periodo_fim: 2024,
      partido: "PSB",
      estado: "AL",
      eleito_por: "voto direto",
      observacoes:
        "Primeiro trecho do mandato na Prefeitura de Maceió iniciado em 2021 pelo PSB; reeleição de 2024 ocorreu pelo PL (TSE + G1 AL/Metrópoles 2026).",
    },
  },
  {
    slug: "jhc",
    source: "Curadoria S15.3 lote 3: TSE 2024 + G1 AL/Metrópoles 2026.",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 2025,
      periodo_fim: 2026,
      partido: "PL",
      estado: "AL",
      eleito_por: "voto direto",
      observacoes:
        "Segundo mandato na Prefeitura de Maceió iniciado em 2025 após reeleição pelo PL; deixou o cargo em abril de 2026 para desincompatibilização no ciclo estadual (TSE + G1 AL/Metrópoles 2026).",
    },
  },
  {
    slug: "joel-rodrigues",
    source:
      "Curadoria S15.3 lote 3: TSE 2004/2008/2016 + Senado Federal/imprensa local; remover vereador manual sobreposto ao período de prefeito e candidatura PV homônima/conflitante em 2016.",
    candidateUpdate: {},
    deleteHistoricoRows: [
      {
        cargo: "Vereador",
        periodo_inicio: 2005,
        periodo_fim: 2012,
        observacoes_includes: "Mandatos como vereador em Floriano nos anos 2000",
      },
      {
        cargo: "Vereador",
        periodo_inicio: 2016,
        tipo_evento: "candidatura",
        observacoes_includes: "TSE 2016",
      },
    ],
  },
  {
    slug: "joel-rodrigues",
    source:
      "Curadoria S15.3 lote 3: TSE 2008/2016 + Parlamento Piauí/O Globo; separar Prefeitura de Floriano PTB->PP sem projetar PP retroativo a 2013.",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 2013,
      periodo_fim: 2016,
      partido: "PTB",
      estado: "PI",
      eleito_por: "voto direto",
      observacoes:
        "Primeiro trecho do mandato municipal 2013-2016 após eleição pelo PTB; a filiação ao PP fica materializada no trecho 2016-2020 (TSE + curadoria S15.3 lote 3).",
    },
  },
  {
    slug: "orleans-brandao",
    source:
      "Curadoria S15.3 lote 3: Governo do Maranhão/Câmara dos Deputados + MDB MA; remover PSB stale de partido atual e materializar transição PSDB->MDB.",
    candidateUpdate: {},
    deleteTimelineRows: [
      { partido_novo: "PSB", ano: 2026, contexto_includes: "Filiação atual observada" },
      { partido_anterior: "PSB", partido_novo: "MDB", ano: 2026 },
    ],
    ensureTimelineRows: [
      {
        partido_anterior: "PSDB",
        partido_novo: "MDB",
        ano: 2015,
        data_mudanca: null,
        contexto:
          "Transição entre mandato federal pelo PSDB e vice-governadoria/governo pelo MDB no Maranhão (Governo do Maranhão + Câmara dos Deputados; curadoria S15.3 lote 3).",
      },
    ],
  },
  {
    slug: "requiao-filho",
    source:
      "Curadoria S15.3 lote 3: TSE 2014/2018/2022 + Plural 2025-05-13 + Brasil de Fato; corrigir linha PDT aberta desde 2015 para filiação real em 2025.",
    candidateUpdate: {},
    deleteTimelineRows: [{ partido_anterior: "PT", partido_novo: "PDT", ano: 2026 }],
    ensureTimelineRows: [
      {
        partido_anterior: "PT",
        partido_novo: "PDT",
        ano: 2025,
        data_mudanca: "2025-05-13",
        contexto:
          "Filiação ao PDT confirmada em maio de 2025 para o ciclo estadual de 2026 (Plural 2025-05-13 + Brasil de Fato; curadoria S15.3 lote 3).",
      },
    ],
    deleteHistoricoRows: [
      {
        cargo: "Deputado Estadual",
        periodo_inicio: 2015,
        observacoes_includes: "filiação ao PDT desde 2025",
      },
      {
        cargo: "Deputado Estadual",
        periodo_inicio: null,
        periodo_fim: null,
        observacoes_includes: "Cargo atual confirmado",
      },
    ],
    historicoFix: {
      cargo: "Deputado Estadual",
      periodo_inicio: 2025,
      periodo_fim: null,
      partido: "PDT",
      estado: "PR",
      eleito_por: "voto direto",
      observacoes:
        "Mandato estadual em curso após filiação ao PDT em 2025, no mesmo mandato eleito em 2022 pelo PT (Plural 2025-05-13 + Brasil de Fato; curadoria S15.3 lote 3).",
    },
  },
  {
    slug: "capitao-wagner",
    source:
      "Curadoria S15.3 lote 5: TSE 2018 + ALCE 2018 + O Povo 2018; corrigir mandato federal 2019-2023 de PR para PROS/UNIAO, coerente com eleição pelo PROS e migração posterior ao União Brasil.",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Deputado Federal",
      periodo_inicio: 2019,
      periodo_fim: 2023,
      partido: "PROS/UNIAO",
      estado: "CE",
      eleito_por: "voto direto",
      observacoes:
        "Mandato federal 2019-2023: eleito em 2018 pelo PROS e posteriormente filiado ao União Brasil no ciclo 2022 (TSE 2018 + ALCE + O Povo; curadoria S15.3 lote 5).",
    },
  },
  {
    slug: "celina-leao",
    source:
      "Curadoria S15.3 lote 5: TSE 2010/2014 + Correio Braziliense 2011-09-28 + CLDF 2015; materializar PMN->PSD->PDT sem projetar PDT retroativo a 2011.",
    candidateUpdate: {},
    deleteTimelineRows: [
      {
        partido_anterior: "PMN",
        partido_novo: "PDT",
        ano: 2014,
      },
    ],
    ensureTimelineRows: [
      {
        partido_anterior: "PMN",
        partido_novo: "PSD",
        ano: 2011,
        data_mudanca: "2011-09-28",
        contexto:
          "Deixou o PMN e confirmou ida para o PSD durante o primeiro mandato distrital (Correio Braziliense 2011-09-28; curadoria S15.3 lote 5).",
      },
      {
        partido_anterior: "PSD",
        partido_novo: "PDT",
        ano: 2014,
        data_mudanca: null,
        contexto:
          "Reeleição de 2014 e posse na presidência da CLDF pelo PDT no biênio 2015-2016 (TSE 2014 + CLDF; curadoria S15.3 lote 5).",
      },
    ],
    historicoFix: {
      cargo: "Deputado Distrital",
      periodo_inicio: 2011,
      periodo_fim: 2014,
      partido: "PMN/PSD",
      estado: "DF",
      eleito_por: "voto direto",
      observacoes:
        "Primeiro mandato distrital iniciado após eleição pelo PMN em 2010, com migração para o PSD em 28/09/2011; o mandato seguinte fica ancorado no PDT pela eleição de 2014 (TSE + Correio Braziliense + CLDF; curadoria S15.3 lote 5).",
    },
  },
  {
    slug: "david-almeida",
    source:
      "Curadoria S15.3 lote 5: TSE 2020 + Prefeitura de Manaus/A Critica; remover aresta MDB->AVANTE stale porque a cadeia factual ja materializa PSB->AVANTE em 2020.",
    candidateUpdate: {},
    deleteTimelineRows: [
      {
        partido_anterior: "MDB",
        partido_novo: "AVANTE",
        ano: 2026,
        contexto_includes: "Filiação atual observada",
      },
    ],
  },
  {
    slug: "guto-silva",
    source:
      "Curadoria S15.3 lote 5: TSE 2010/2014/2018 + SECID-PR/Bem Parana; remover PSB->DEM de 2010 sem rastro historico, preservando DEM->PSC->PSD.",
    candidateUpdate: {},
    deleteTimelineRows: [
      {
        partido_anterior: "PSB",
        partido_novo: "DEM",
        ano: 2010,
      },
    ],
  },
  {
    slug: "janaina-riva",
    source:
      "Curadoria S15.3 lote 5: TSE 2014/2018/2022 + ALMT 2016/2026; corrigir troca PSD->MDB para 2016 e nao 2018.",
    candidateUpdate: {},
    deleteTimelineRows: [
      {
        partido_anterior: "PSD",
        partido_novo: "MDB",
        ano: 2018,
      },
    ],
    ensureTimelineRows: [
      {
        partido_anterior: "PSD",
        partido_novo: "MDB",
        ano: 2016,
        data_mudanca: null,
        contexto:
          "Transição ao MDB materializada durante o primeiro mandato estadual: em 2016 a ALMT ja registrava Janaina Riva como liderança do PMDB; reeleições posteriores ocorreram pelo MDB (ALMT + TSE; curadoria S15.3 lote 5).",
      },
    ],
    historicoFix: {
      cargo: "Deputada Estadual",
      periodo_inicio: 2015,
      periodo_fim: 2016,
      partido: "PSD",
      estado: "MT",
      eleito_por: "voto direto",
      observacoes:
        "Trecho inicial do primeiro mandato estadual após eleição de 2014 pelo PSD; a filiação ao MDB/PMDB fica materializada a partir de 2016 (TSE 2014 + ALMT; curadoria S15.3 lote 5).",
    },
  },
  {
    slug: "jose-eliton",
    source:
      "Curadoria S15.3 lote 5: ALEGO posse 2011 + Mais Goias/PSDB-GO 2015 + PSDB perfil; trocar aresta DEM->PSDB por PP->PSDB e materializar vice-governadoria.",
    candidateUpdate: {},
    deleteTimelineRows: [
      {
        partido_anterior: "DEM",
        partido_novo: "PSDB",
        ano: 2018,
      },
    ],
    ensureTimelineRows: [
      {
        partido_anterior: "PP",
        partido_novo: "PSDB",
        ano: 2015,
        data_mudanca: "2015-09-24",
        contexto:
          "Filiação ao PSDB em 2015 após passagem pelo PP, antes da candidatura ao governo em 2018 (Mais Goias + PSDB-GO; curadoria S15.3 lote 5).",
      },
    ],
    historicoFix: {
      cargo: "Vice-Governador",
      periodo_inicio: 2011,
      periodo_fim: 2018,
      partido: "PP",
      estado: "GO",
      eleito_por: "voto direto",
      observacoes:
        "Vice-governador de Goias empossado em 01/01/2011 na chapa de Marconi Perillo; antes da filiação ao PSDB em 2015, a trajetória pública registrava José Eliton no PP (ALEGO + Mais Goias/PSDB-GO; curadoria S15.3 lote 5).",
    },
  },
  {
    slug: "jose-eliton",
    source:
      "Curadoria S15.3 lote 5: PSDB perfil oficial; materializar governo de Goias por sucessao em 2018 sem confundir com candidatura derrotada no mesmo ano.",
    candidateUpdate: {},
    historicoFix: {
      cargo: "Governador",
      periodo_inicio: 2018,
      periodo_fim: 2019,
      partido: "PSDB",
      estado: "GO",
      eleito_por: "sucessao constitucional",
      observacoes:
        "Assumiu o governo de Goias em abril de 2018 com a saída de Marconi Perillo e concluiu o mandato em janeiro de 2019 (PSDB perfil oficial; curadoria S15.3 lote 5).",
    },
  },
  {
    slug: "renan-filho",
    source:
      "Curadoria S15.3 lote 5: Senado Federal/TSE 2022; remover aresta PRB->MDB sem rastro historico, mantendo continuidade PMDB/MDB.",
    candidateUpdate: {},
    deleteTimelineRows: [
      {
        partido_anterior: "PRB",
        partido_novo: "MDB",
        ano: 2022,
      },
    ],
  },

  // --- Saidas da corrida presidencial durante a janela de convencoes de 2026 ---
  //
  // Contexto: a janela de convencoes partidarias de 2026 vai de 20/07 a 05/08, e
  // o registro de candidatura no TSE ocorre ate meados de agosto. Ou seja, ate o
  // registro NINGUEM e candidato oficial, e "deixou de ser pre-candidato" e um
  // fato jornalistico, nao um dado do DivulgaCandContas. Por isso os dois casos
  // abaixo entram como curadoria com fonte nomeada, e nao por ingest.
  //
  // O padrao segue o precedente ja no banco para quem desistiu
  // (jose-carlos-aleluia, pedro-cunha-lima, wanderlei-barbosa):
  // status 'desistente' + publicavel false + cargo_disputado 'Nenhum'. A CHECK
  // constraint candidatos_publicavel_requires_disputa exige essa combinacao.
  //
  // Nada e deletado: as duas fichas saem do ar e o historico permanece, entao a
  // operacao e reversivel se o quadro mudar antes do registro.
  {
    slug: "aecio-neves",
    source:
      "CNN Brasil, 2026-07-09, 'Aécio descarta candidatura ao Planalto pelo PSDB' (https://www.cnnbrasil.com.br/eleicoes/aecio-descarta-candidatura-ao-planalto-pelo-psdb/): 'desistiu da hipótese de concorrer à Presidência da República na eleição deste ano'. Verificado por leitura direta da página (HTTP 200) em 2026-07-30. O PSDB confirmou que não lançará candidato próprio ao Planalto. Uma eventual disputa ao Senado por MG seguia indefinida em 2026-07-24 (O Tempo, 'Indefinição em Minas trava decisão de Aécio em concorrer ao Senado'), por isso cargo_disputado fica 'Nenhum' e não 'Senador'.",
    candidateUpdate: {
      status: "desistente",
      publicavel: false,
      cargo_disputado: "Nenhum",
      situacao_candidatura: null,
    },
  },
  {
    slug: "joaquim-barbosa",
    source:
      "Poder360, 2026-07-24, 'Com saída de Barbosa, DC lança Clariana ao Planalto' (https://www.poder360.com.br/poder-eleicoes-2026/com-saida-de-barbosa-dc-lanca-clariana-ao-planalto/): a decisão foi anunciada em 24/07/2026 'depois de o ministro aposentado do STF desistir de concorrer ao Palácio do Planalto'. Verificado por leitura direta da página (HTTP 200) em 2026-07-30. Ressalva registrada: ele nunca se manifestou publicamente nem para aceitar nem para desistir da pré-candidatura que a direção do DC anunciou, e o nome final do partido só se resolve na convenção de 02/08/2026, com Aldo Rebelo contestando judicialmente.",
    candidateUpdate: {
      status: "desistente",
      publicavel: false,
      cargo_disputado: "Nenhum",
      situacao_candidatura: null,
    },
  },
]

/** Identidade deste programa na trilha de `coleta_log`. */
const SCRIPT = "apply-current-factual-fixes"

/**
 * Contexto da trilha para um fix curado.
 *
 * Todo sitio de escrita deste arquivo passa por aqui, e por isso toda linha de
 * `coleta_log` carrega o slug e a FONTE do fix. E o que transforma a trilha em
 * algo utilizavel: seis meses depois, a pergunta nunca e "o que mudou", e sim
 * "com base em que este dado mudou".
 */
function escritaDoFix(
  tabela: string,
  motivo: string,
  fix: CandidateFix,
  recorteExtra?: string,
): { script: string; tabela: string; motivo: string; recorte: string } {
  return {
    script: SCRIPT,
    tabela,
    motivo: `${motivo} (fix curado de ${fix.slug})`,
    recorte: [`candidato ${fix.slug}`, `fonte: ${fix.source}`, recorteExtra]
      .filter(Boolean)
      .join(" | "),
  }
}

function mergeFonteDados(existing: string[] | null | undefined): string[] {
  return [...new Set([...(existing ?? []), "curadoria"])]
}

function canonicalParty(value: string | null | undefined): string | null {
  if (!value) return null
  return resolveCanonicalParty(value)?.sigla ?? value.trim().toUpperCase()
}

async function ensureHistorico(candidatoId: string, fix: CandidateFix) {
  if (!fix.historicoFix) return

  // Alias local porque o estreitamento de `fix.historicoFix` nao sobrevive ao
  // fechamento passado para escreverAuditado(): dentro do callback, o
  // compilador volta a ver `HistoricoFix | undefined`.
  const historicoFix = fix.historicoFix
  const cargoCanonico = canonicalCargo(historicoFix.cargo)

  const { data: historico, error } = await supabase
    .from("historico_politico")
    .select(
      "id, cargo, cargo_canonico, periodo_inicio, periodo_fim, partido, estado, eleito_por, observacoes, tipo_evento, proveniencia"
    )
    .eq("candidato_id", candidatoId)

  if (error) {
    throw new Error(`Erro ao buscar historico: ${error.message}`)
  }

  const existing = findHistoricoRowForFix(historico ?? [], {
    cargo: historicoFix.cargo,
    periodo_inicio: historicoFix.periodo_inicio,
    periodo_fim: historicoFix.periodo_fim ?? null,
  })

  if (existing) {
    const provenienciaCol = historicoFix.proveniencia ?? "manual"
    const updatePayload = {
      cargo: historicoFix.cargo,
      cargo_canonico: cargoCanonico,
      periodo_fim: historicoFix.periodo_fim,
      partido: historicoFix.partido ?? null,
      estado: historicoFix.estado ?? null,
      eleito_por: historicoFix.eleito_por ?? null,
      observacoes: sanitizeTemplateText(historicoFix.observacoes ?? ""),
      proveniencia: provenienciaCol,
      tipo_evento: inferHistoricoTipoEventoFromRow({
        tipo_evento: (existing as { tipo_evento?: string | null }).tipo_evento,
        observacoes: historicoFix.observacoes ?? existing.observacoes,
        periodo_inicio: historicoFix.periodo_inicio ?? existing.periodo_inicio,
        periodo_fim: historicoFix.periodo_fim ?? existing.periodo_fim,
      }),
    }

    const existingCanon = (existing as { cargo_canonico?: string | null }).cargo_canonico ?? null
    const existingProv = (existing as { proveniencia?: string | null }).proveniencia ?? null
    const needsUpdate =
      existing.cargo !== updatePayload.cargo ||
      existingCanon !== updatePayload.cargo_canonico ||
      (existing.periodo_fim ?? null) !== updatePayload.periodo_fim ||
      (existing.partido ?? null) !== updatePayload.partido ||
      (existing.estado ?? null) !== updatePayload.estado ||
      (existing.eleito_por ?? null) !== updatePayload.eleito_por ||
      (existing.observacoes ?? null) !== updatePayload.observacoes ||
      existingProv !== updatePayload.proveniencia ||
      ((existing as { tipo_evento?: string | null }).tipo_evento ?? null) !== updatePayload.tipo_evento

    if (!needsUpdate) {
      return
    }

    await escreverAuditado(
      escritaDoFix(
        "historico_politico",
        "alinha mandato ja registrado ao que o fix curado afirma",
        fix,
        `linha ${existing.id}, cargo ${historicoFix.cargo}`,
      ),
      () =>
        supabase
          .from("historico_politico")
          .update(updatePayload)
          .eq("id", existing.id)
          .select("id"),
    )

    return
  }

  await escreverAuditado(
    escritaDoFix(
      "historico_politico",
      "cria mandato ausente que o fix curado afirma existir",
      fix,
      `cargo ${historicoFix.cargo}, inicio ${historicoFix.periodo_inicio}`,
    ),
    () =>
      supabase.from("historico_politico").insert({
    candidato_id: candidatoId,
    cargo: historicoFix.cargo,
    cargo_canonico: cargoCanonico,
    periodo_inicio: historicoFix.periodo_inicio,
    periodo_fim: historicoFix.periodo_fim,
    partido: historicoFix.partido ?? null,
    estado: historicoFix.estado ?? null,
    eleito_por: historicoFix.eleito_por ?? null,
    observacoes: sanitizeTemplateText(historicoFix.observacoes ?? ""),
    proveniencia: historicoFix.proveniencia ?? "manual",
    tipo_evento: inferHistoricoTipoEventoFromRow({
      observacoes: historicoFix.observacoes ?? null,
      periodo_inicio: historicoFix.periodo_inicio,
      periodo_fim: historicoFix.periodo_fim,
    }),
      }).select("id"),
  )
}

async function deleteTimelineRows(
  candidatoId: string,
  rules: PartyTimelineDeleteRule[] | undefined,
  fix: CandidateFix,
) {
  if (!rules || rules.length === 0) return

  const { data: rows, error } = await supabase
    .from("mudancas_partido")
    .select("id, partido_anterior, partido_novo, ano, contexto")
    .eq("candidato_id", candidatoId)

  if (error) {
    throw new Error(`Erro ao buscar timeline: ${error.message}`)
  }

  const alvos = (rows ?? []).filter((row) =>
    rules.some((rule) => {
      if (rule.partido_anterior && !canonicalPartiesEquivalent(rule.partido_anterior, row.partido_anterior)) return false
      if (!canonicalPartiesEquivalent(rule.partido_novo, row.partido_novo)) return false
      if (rule.ano != null && row.ano !== rule.ano) return false
      if (rule.contexto_includes && !(row.contexto ?? "").includes(rule.contexto_includes)) return false
      return true
    }),
  )
  if (alvos.length === 0) return

  // Um DELETE por id, como antes, so que o laco inteiro conta como UM ato na
  // trilha: apagar N linhas de timeline obsoleta do mesmo candidato e uma
  // decisao editorial, nao N decisoes.
  await escreverAuditado(
    escritaDoFix(
      "mudancas_partido",
      "remove troca de partido obsoleta que o fix curado desmente",
      fix,
      `${alvos.length} linha(s) de timeline`,
    ),
    async () => {
      const removidas: Array<{ id: string }> = []
      for (const row of alvos) {
        const { data, error: deleteError } = await supabase
          .from("mudancas_partido")
          .delete()
          .eq("id", row.id)
          .select("id")
        if (deleteError) {
          return { data: removidas, error: { message: `ao remover timeline stale: ${deleteError.message}` } }
        }
        removidas.push(...((data ?? []) as Array<{ id: string }>))
      }
      return { data: removidas, error: null }
    },
  )
}

async function ensureTimelineRows(
  candidatoId: string,
  rows: PartyTimelineEnsureRow[] | undefined,
  fix: CandidateFix,
) {
  if (!rows || rows.length === 0) return

  for (const spec of rows) {
    const { data: mudancas, error } = await supabase
      .from("mudancas_partido")
      .select("id, partido_anterior, partido_novo, ano")
      .eq("candidato_id", candidatoId)

    if (error) {
      throw new Error(`Erro ao buscar timeline para ensure: ${error.message}`)
    }

    const already = (mudancas ?? []).some(
      (row) =>
        row.ano === spec.ano &&
        canonicalPartiesEquivalent(row.partido_anterior, spec.partido_anterior) &&
        canonicalPartiesEquivalent(row.partido_novo, spec.partido_novo)
    )
    if (already) continue

    const partidoAnterior = canonicalParty(spec.partido_anterior) ?? spec.partido_anterior.trim()
    const partidoNovo = canonicalParty(spec.partido_novo) ?? spec.partido_novo.trim()
    const dataMudanca = spec.data_mudanca === undefined ? null : spec.data_mudanca
    const sameYearAndTarget = (mudancas ?? []).find(
      (row) => row.ano === spec.ano && canonicalPartiesEquivalent(row.partido_novo, spec.partido_novo)
    )

    if (sameYearAndTarget) {
      await escreverAuditado(
        escritaDoFix(
          "mudancas_partido",
          "reescreve troca de partido do mesmo ano com os valores do fix curado",
          fix,
          `linha ${sameYearAndTarget.id}, ${partidoAnterior} -> ${partidoNovo} em ${spec.ano}`,
        ),
        () =>
          supabase
            .from("mudancas_partido")
            .update({
              partido_anterior: partidoAnterior,
              partido_novo: partidoNovo,
              ano: spec.ano,
              data_mudanca: dataMudanca,
              contexto: sanitizeTemplateText(spec.contexto),
            })
            .eq("id", sameYearAndTarget.id)
            .select("id"),
      )
      continue
    }

    await escreverAuditado(
      escritaDoFix(
        "mudancas_partido",
        "cria troca de partido que o fix curado afirma e a timeline nao tinha",
        fix,
        `${partidoAnterior} -> ${partidoNovo} em ${spec.ano}`,
      ),
      () =>
        supabase.from("mudancas_partido").insert({
          candidato_id: candidatoId,
          partido_anterior: partidoAnterior,
          partido_novo: partidoNovo,
          ano: spec.ano,
          data_mudanca: dataMudanca,
          contexto: sanitizeTemplateText(spec.contexto),
        }).select("id"),
    )
  }
}

function matchesHistoricoDeleteRule(
  row: {
    cargo: string
    periodo_inicio: number | null
    periodo_fim: number | null
    observacoes: string | null
    tipo_evento?: string | null
  },
  rule: HistoricoDeleteRule
): boolean {
  if (rule.cargo && row.cargo !== rule.cargo) return false
  if (rule.cargo_canonico && canonicalCargo(row.cargo) !== rule.cargo_canonico) return false
  if (Object.prototype.hasOwnProperty.call(rule, "periodo_inicio")) {
    if (row.periodo_inicio !== (rule.periodo_inicio ?? null)) return false
  }
  if (Object.prototype.hasOwnProperty.call(rule, "periodo_fim")) {
    if (row.periodo_fim !== (rule.periodo_fim ?? null)) return false
  }
  if (
    rule.tipo_evento &&
    inferHistoricoTipoEventoFromRow(row) !== rule.tipo_evento
  ) {
    return false
  }
  if (
    rule.observacoes_includes &&
    !(row.observacoes ?? "").includes(rule.observacoes_includes)
  ) {
    return false
  }
  return true
}

async function deleteHistoricoRows(
  candidatoId: string,
  rules: HistoricoDeleteRule[] | undefined,
  fix: CandidateFix,
) {
  if (!rules || rules.length === 0) return
  const { data: rows, error: fetchError } = await supabase
    .from("historico_politico")
    .select("id, cargo, periodo_inicio, periodo_fim, observacoes, tipo_evento")
    .eq("candidato_id", candidatoId)

  if (fetchError) {
    throw new Error(`Erro ao buscar historico para limpeza: ${fetchError.message}`)
  }

  const alvos = (rows ?? []).filter((row) => rules.some((rule) => matchesHistoricoDeleteRule(row, rule)))
  if (alvos.length === 0) return

  await escreverAuditado(
    escritaDoFix(
      "historico_politico",
      "remove mandato incorreto que o fix curado desmente",
      fix,
      `${alvos.length} linha(s): ${alvos.map((r) => `${r.cargo} ${r.periodo_inicio ?? "?"}`).join(", ")}`,
    ),
    async () => {
      const removidas: Array<{ id: string }> = []
      for (const row of alvos) {
        const { data, error } = await supabase
          .from("historico_politico")
          .delete()
          .eq("id", row.id)
          .select("id")
        if (error) {
          return { data: removidas, error: { message: `ao remover historico incorreto: ${error.message}` } }
        }
        removidas.push(...((data ?? []) as Array<{ id: string }>))
      }
      return { data: removidas, error: null }
    },
  )
}

async function deleteTseRows(
  candidatoId: string,
  table: "patrimonio" | "financiamento",
  years: number[] | undefined,
  fix: CandidateFix,
) {
  if (!years || years.length === 0) return

  await escreverAuditado(
    escritaDoFix(
      table,
      `remove declaracao de ${table} de pleito que o fix curado nao reconhece`,
      fix,
      `anos ${years.join(", ")}`,
    ),
    () =>
      supabase
        .from(table)
        .delete()
        .eq("candidato_id", candidatoId)
        .in("ano_eleicao", years)
        .select("id"),
  )
}

async function resolvePartidoAnteriorForFix(candidatoId: string): Promise<string> {
  const { data } = await supabase
    .from("historico_politico")
    .select("partido, periodo_inicio")
    .eq("candidato_id", candidatoId)
    .not("partido", "is", null)
    .order("periodo_inicio", { ascending: false })
    .limit(1)

  if (data && data.length > 0 && data[0].partido) {
    const canonical = canonicalParty(data[0].partido)
    if (canonical) return canonical
  }

  return "Historico anterior nao determinado"
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

  const ordered = [...(rows ?? [])].sort(
    (a, b) => rankPartyTimelineConsistencyRow(a) - rankPartyTimelineConsistencyRow(b)
  )
  const latest = ordered.at(-1) ?? null
  if (latest && canonicalPartiesEquivalent(latest.partido_novo, expectedParty)) {
    return
  }

  const { data: existingCurrent } = await supabase
    .from("mudancas_partido")
    .select("id, partido_novo")
    .eq("candidato_id", candidatoId)
    .eq("ano", THIS_YEAR)
    .eq("data_mudanca", TODAY)

  const matchingCurrent = (existingCurrent ?? []).find((row) =>
    canonicalPartiesEquivalent(row.partido_novo, expectedParty)
  )
  if (matchingCurrent) {
    return
  }

  const partidoAnterior = latest?.partido_novo ?? await resolvePartidoAnteriorForFix(candidatoId)
  if (latest && canonicalPartiesEquivalent(partidoAnterior, expectedParty)) {
    return
  }

  // A origem que a trilha declara tem de ser a MESMA que a linha grava. Sem
  // `latest`, o valor persistido é "Histórico anterior não determinado", e o
  // recorte que anunciasse `partidoAnterior` nomearia um partido que a linha não
  // contém. Trilha que descreve outra escrita é pior que trilha ausente.
  const origemRegistrada = latest ? partidoAnterior : "Histórico anterior não determinado"

  await escreverAuditado(
    escritaDoFix(
      "mudancas_partido",
      "fecha a timeline no partido atual verificado manualmente",
      fix,
      `${origemRegistrada} -> ${expectedParty} em ${TODAY}`,
    ),
    () =>
      supabase.from("mudancas_partido").insert({
        candidato_id: candidatoId,
        partido_anterior: origemRegistrada,
        partido_novo: expectedParty,
        data_mudanca: TODAY,
        ano: THIS_YEAR,
        contexto: sanitizeTemplateText(`partido atual verificado manualmente (${fix.source})`),
      }).select("id"),
  )
}

async function ensureVotacaoChaveForManualVote(
  vote: NonNullable<CandidateFix["manualVotes"]>[number],
  fix: CandidateFix,
) {
  const { data: existing, error: existingError } = await supabase
    .from("votacoes_chave")
    .select("id, proposicao_id, descricao, tema, impacto_popular")
    .eq("titulo", vote.titulo)
    .eq("casa", vote.casa)
    .eq("data_votacao", vote.data_votacao)
    .maybeSingle()

  if (existingError) {
    throw new Error(`Erro ao buscar votação-chave manual: ${existingError.message}`)
  }

  if (existing?.id) {
    const updatePayload: Record<string, string> = {}
    if (vote.proposicao_id && !existing.proposicao_id) updatePayload.proposicao_id = vote.proposicao_id
    if (vote.descricao && !existing.descricao) updatePayload.descricao = vote.descricao
    if (vote.tema && !existing.tema) updatePayload.tema = vote.tema
    if (vote.impacto_popular && !existing.impacto_popular) {
      updatePayload.impacto_popular = vote.impacto_popular
    }

    if (Object.keys(updatePayload).length > 0) {
      await escreverAuditado(
        escritaDoFix(
          "votacoes_chave",
          "completa campos vazios de votacao-chave ja existente, a partir do voto manual curado",
          fix,
          `votacao ${existing.id}: ${Object.keys(updatePayload).join(", ")}`,
        ),
        () =>
          supabase
            .from("votacoes_chave")
            .update(updatePayload)
            .eq("id", existing.id)
            .select("id"),
      )
    }

    return existing.id
  }

  // Sem `.single()`: o helper conta o volume por `data.length`, e `.single()`
  // devolveria um objeto, nao uma lista. A conferencia de "veio id?" continua
  // logo abaixo, so que explicita.
  const inseridas = await escreverAuditado(
    escritaDoFix(
      "votacoes_chave",
      "cria votacao-chave que so existe pelo voto manual curado",
      fix,
      `${vote.casa} ${vote.data_votacao}: ${vote.titulo}`,
    ),
    () =>
      supabase
        .from("votacoes_chave")
        .insert({
          titulo: vote.titulo,
          descricao: vote.descricao,
          data_votacao: vote.data_votacao,
          casa: vote.casa,
          proposicao_id: vote.proposicao_id ?? null,
          tema: vote.tema,
          impacto_popular: vote.impacto_popular,
        })
        .select("id"),
  )

  const novoId = (inseridas as Array<{ id?: string }>)[0]?.id
  if (!novoId) {
    throw new Error("Erro ao inserir votação-chave manual: sem id")
  }

  return novoId
}

async function ensureManualVotes(candidatoId: string, slug: string, fix: CandidateFix) {
  let count = 0
  for (const vote of fix.manualVotes ?? []) {
    const votacaoId = await ensureVotacaoChaveForManualVote(vote, fix)
    await escreverAuditado(
      escritaDoFix(
        "votos_candidato",
        "registra voto declarado em votacao-chave, curado a mao",
        fix,
        `votacao ${votacaoId}, voto ${vote.voto}`,
      ),
      () =>
        supabase.from("votos_candidato").upsert(
          {
            candidato_id: candidatoId,
            votacao_id: votacaoId,
            voto: vote.voto,
          },
          { onConflict: "candidato_id,votacao_id" }
        ).select("candidato_id"),
    )
    count++
  }

  if (count > 0) {
    log("apply-current-factual-fixes", `Votos manuais garantidos para ${slug}: ${count}`)
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
      Object.entries(sanitizeCandidateUpdate(fix.candidateUpdate)).filter(([, value]) => value !== undefined)
    ),
    fonte_dados: mergeFonteDados(candidato.fonte_dados),
    ultima_atualizacao: new Date().toISOString(),
  }

  await escreverAuditado(
    escritaDoFix(
      "candidatos",
      "aplica o fix factual curado sobre a ficha do candidato",
      fix,
      `campos: ${Object.keys(updatePayload).join(", ")}`,
    ),
    () =>
      supabase
        .from("candidatos")
        .update(updatePayload)
        .eq("id", candidato.id)
        .select("id"),
  )

  await deleteTseRows(candidato.id, "patrimonio", fix.deletePatrimonioYears, fix)
  await deleteTseRows(candidato.id, "financiamento", fix.deleteFinanciamentoYears, fix)
  await deleteTimelineRows(candidato.id, fix.deleteTimelineRows, fix)
  await ensureTimelineRows(candidato.id, fix.ensureTimelineRows, fix)
  await deleteHistoricoRows(candidato.id, fix.deleteHistoricoRows, fix)
  await ensureCurrentPartyTimeline(candidato.id, fix)
  const { skipRechain, repairedTimeline } = await runAfterCuratedPartyTimelineWrites(candidato.id, fix)
  if (skipRechain) {
    log(
      "apply-current-factual-fixes",
      `${fix.slug}: rechainer de timeline omitido no mesmo passo (§15.6 — writes curados ensureTimelineRows/ensureCurrentPartyTimeline).`,
    )
  }
  await ensureHistorico(candidato.id, fix)
  await ensureManualVotes(candidato.id, fix.slug, fix)

  log(
    "apply-current-factual-fixes",
    `Atualizado ${fix.slug}${assertion ? ` via assertion ${assertion.source}` : ""}${repairedTimeline.length > 0 ? `; timeline reencadeada (${repairedTimeline.length})` : ""}`
  )
}

function parseCliArgs() {
  const argv = process.argv.slice(2)
  const dryRun = argv.includes("--dry-run")
  const slugEq = argv.find((a) => a.startsWith("--slug="))
  const slugFilter = slugEq?.split("=", 2)[1]?.trim() || null
  return { dryRun, slugFilter }
}

function summarizeFixDryRun(fix: CandidateFix): Record<string, unknown> {
  return {
    slug: fix.slug,
    source: fix.source,
    candidateUpdate: fix.candidateUpdate,
    historicoFix: fix.historicoFix ?? null,
    deleteTimelineRows: fix.deleteTimelineRows?.length ?? 0,
    ensureTimelineRows: fix.ensureTimelineRows?.length ?? 0,
    deletePatrimonioYears: fix.deletePatrimonioYears ?? null,
    deleteFinanciamentoYears: fix.deleteFinanciamentoYears ?? null,
    deleteHistoricoRows: fix.deleteHistoricoRows?.length ?? 0,
    manualVotes: fix.manualVotes?.length ?? 0,
    ensureCurrentPartyTimeline: fix.ensureCurrentPartyTimeline ?? false,
  }
}

async function main() {
  const { dryRun, slugFilter } = parseCliArgs()
  const list = selectCurrentFactualFixes(FIXES, slugFilter)

  if (slugFilter && list.length === 0) {
    console.error(`apply-current-factual-fixes: nenhum fix para slug "${slugFilter}"`)
    process.exit(1)
  }

  // Política de falha (6.2): processa todos os slugs, mas não mascara erro individual.
  if (dryRun) {
    for (const fix of list) {
      console.log(JSON.stringify(summarizeFixDryRun(fix), null, 2))
    }
    console.error(
      `apply-current-factual-fixes: --dry-run concluído (${list.length} fix(es); sem escrita no Supabase).`
    )
    return
  }

  let failures = 0
  for (const fix of list) {
    try {
      await applyFix(fix)
    } catch (error) {
      failures++
      warn(
        "apply-current-factual-fixes",
        `${fix.slug}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  if (failures > 0) {
    console.error(
      `apply-current-factual-fixes: apply falhou em ${failures}/${list.length} fix(es)${
        slugFilter ? ` para slug "${slugFilter}"` : ""
      }.`
    )
    process.exit(1)
  }

  console.error(
    `apply-current-factual-fixes: apply concluído (${list.length} fix(es) processados${slugFilter ? ` para slug "${slugFilter}"` : ""}).`
  )
}

function isDirectInvocation(): boolean {
  const entry = process.argv[1]
  if (!entry) return false
  return entry.endsWith("apply-current-factual-fixes.ts") || entry.endsWith("apply-current-factual-fixes.js")
}

if (isDirectInvocation()) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}

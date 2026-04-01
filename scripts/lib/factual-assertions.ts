import type { CandidatePublicSnapshot } from "./audit-types"

export type AssertionCohort =
  | "presidenciaveis"
  | "governadores-prioritarios"
  // "alto-trafego" e mantido por compatibilidade de CLI e artefatos.
  // Conceitualmente esta coorte representa trafego editorial estimado,
  // nao analytics reais do site.
  | "alto-trafego"
  | "alto-trafego-editorial"

export interface CandidateAssertion {
  slug: string
  source: string
  cohorts: AssertionCohort[]
  expected: Partial<CandidatePublicSnapshot>
}

export const CANDIDATE_ASSERTIONS: CandidateAssertion[] = [
  {
    slug: "lula",
    source: "curadoria presidenciaveis",
    cohorts: ["presidenciaveis", "alto-trafego"],
    expected: {
      nome_completo: "Luiz Inacio Lula da Silva",
      nome_urna: "Lula",
      partido_atual: "Partido dos Trabalhadores",
      partido_sigla: "PT",
      cargo_disputado: "Presidente",
      estado: null,
    },
  },
  {
    slug: "flavio-bolsonaro",
    source: "curadoria presidenciaveis",
    cohorts: ["presidenciaveis", "alto-trafego"],
    expected: {
      nome_completo: "Flavio Nantes Bolsonaro",
      nome_urna: "Flavio Bolsonaro",
      partido_atual: "Partido Liberal",
      partido_sigla: "PL",
      cargo_disputado: "Presidente",
      estado: null,
    },
  },
  {
    slug: "tarcisio",
    source: "curadoria presidenciaveis",
    cohorts: ["presidenciaveis", "alto-trafego"],
    expected: {
      nome_completo: "Tarcisio Gomes de Freitas",
      nome_urna: "Tarcisio de Freitas",
      partido_atual: "Republicanos",
      partido_sigla: "REPUBLICANOS",
      cargo_disputado: "Presidente",
      estado: null,
    },
  },
  {
    slug: "romeu-zema",
    source: "curadoria presidenciaveis",
    cohorts: ["presidenciaveis", "alto-trafego"],
    expected: {
      nome_completo: "Romeu Zema Neto",
      nome_urna: "Romeu Zema",
      partido_atual: "Partido Novo",
      partido_sigla: "NOVO",
      cargo_disputado: "Presidente",
      estado: null,
    },
  },
  {
    slug: "ronaldo-caiado",
    source: "PSD oficial 2026-01-28",
    cohorts: ["presidenciaveis", "alto-trafego"],
    expected: {
      nome_completo: "Ronaldo Ramos Caiado",
      nome_urna: "Ronaldo Caiado",
      partido_atual: "Partido Social Democratico",
      partido_sigla: "PSD",
      cargo_disputado: "Presidente",
      estado: null,
    },
  },
  {
    slug: "ratinho-junior",
    source: "PSD oficial 2026-03-12",
    cohorts: ["presidenciaveis", "alto-trafego"],
    expected: {
      nome_completo: "Carlos Roberto Massa Junior",
      nome_urna: "Ratinho Junior",
      partido_atual: "Partido Social Democratico",
      partido_sigla: "PSD",
      cargo_disputado: "Presidente",
      estado: null,
    },
  },
  {
    slug: "aldo-rebelo",
    source: "DC oficial 2026-02-02",
    cohorts: ["presidenciaveis", "alto-trafego"],
    expected: {
      nome_completo: "Jose Aldo Rebelo Figueiredo",
      nome_urna: "Aldo Rebelo",
      partido_atual: "Democracia Crista",
      partido_sigla: "DC",
      cargo_disputado: "Presidente",
      estado: null,
    },
  },
  {
    slug: "renan-santos",
    source: "curadoria presidenciaveis",
    cohorts: ["presidenciaveis", "alto-trafego"],
    expected: {
      nome_completo: "Renan Santos",
      nome_urna: "Renan Santos",
      partido_atual: "Missao",
      partido_sigla: "MISSAO",
      cargo_disputado: "Presidente",
      estado: null,
    },
  },
  {
    slug: "ciro-gomes",
    source: "PSDB oficial 2025-10-22",
    cohorts: ["presidenciaveis", "alto-trafego"],
    expected: {
      nome_completo: "Ciro Ferreira Gomes",
      nome_urna: "Ciro Gomes",
      partido_atual: "Partido da Social Democracia Brasileira",
      partido_sigla: "PSDB",
      cargo_disputado: "Presidente",
      estado: null,
    },
  },
  {
    slug: "hertz-dias",
    source: "curadoria presidenciaveis",
    cohorts: ["presidenciaveis", "alto-trafego"],
    expected: {
      nome_completo: "Hertz da Conceicao Dias",
      nome_urna: "Hertz Dias",
      partido_atual: "Partido Socialista dos Trabalhadores Unificado",
      partido_sigla: "PSTU",
      cargo_disputado: "Presidente",
      estado: null,
    },
  },
  {
    slug: "eduardo-leite",
    source: "curadoria presidenciaveis",
    cohorts: ["presidenciaveis", "alto-trafego"],
    expected: {
      nome_completo: "Eduardo Figueiredo Cavalheiro Leite",
      nome_urna: "Eduardo Leite",
      partido_atual: "Partido Social Democratico",
      partido_sigla: "PSD",
      cargo_disputado: "Presidente",
      estado: null,
    },
  },
  {
    slug: "rui-costa-pimenta",
    source: "curadoria presidenciaveis",
    cohorts: ["presidenciaveis", "alto-trafego"],
    expected: {
      nome_completo: "Rui Costa Pimenta",
      nome_urna: "Rui Costa Pimenta",
      partido_atual: "Partido da Causa Operaria",
      partido_sigla: "PCO",
      cargo_disputado: "Presidente",
      estado: null,
    },
  },
  {
    slug: "samara-martins",
    source: "curadoria presidenciaveis",
    cohorts: ["presidenciaveis", "alto-trafego"],
    expected: {
      nome_completo: "Samara Martins",
      nome_urna: "Samara Martins",
      partido_atual: "Unidade Popular",
      partido_sigla: "UP",
      cargo_disputado: "Presidente",
      estado: null,
    },
  },
  {
    slug: "tarcisio-gov-sp",
    source: "Governo de SP + Republicanos oficial 2026-03",
    cohorts: ["governadores-prioritarios", "alto-trafego"],
    expected: {
      nome_completo: "Tarcisio Gomes de Freitas",
      nome_urna: "Tarcisio de Freitas",
      partido_atual: "Republicanos",
      partido_sigla: "REPUBLICANOS",
      cargo_atual: "Governador de Sao Paulo",
      cargo_disputado: "Governador",
      estado: "SP",
    },
  },
  {
    slug: "nikolas-ferreira",
    source: "Camara dos Deputados 2026-03-31",
    cohorts: ["governadores-prioritarios", "alto-trafego"],
    expected: {
      nome_completo: "Nikolas Ferreira Oliveira",
      nome_urna: "Nikolas Ferreira",
      partido_atual: "Partido Liberal",
      partido_sigla: "PL",
      cargo_atual: "Deputado(a) Federal",
      cargo_disputado: "Governador",
      estado: "MG",
    },
  },
  {
    slug: "rodrigo-pacheco",
    source: "Senado Federal 2026-03-31",
    cohorts: ["governadores-prioritarios", "alto-trafego"],
    expected: {
      nome_completo: "Rodrigo Pacheco Amaral",
      nome_urna: "Rodrigo Pacheco",
      partido_atual: "Partido Social Democratico",
      partido_sigla: "PSD",
      cargo_atual: "Senador(a)",
      cargo_disputado: "Governador",
      estado: "MG",
    },
  },
  {
    slug: "eduardo-paes",
    source: "Prefeitura do Rio + PSD oficial 2026-03",
    cohorts: ["governadores-prioritarios", "alto-trafego"],
    expected: {
      nome_completo: "Eduardo da Costa Paes",
      nome_urna: "Eduardo Paes",
      partido_atual: "Partido Social Democratico",
      partido_sigla: "PSD",
      cargo_atual: "Prefeito do Rio de Janeiro",
      cargo_disputado: "Governador",
      estado: "RJ",
    },
  },
  {
    slug: "jeronimo",
    source: "Governo da Bahia + PT Bahia 2026-03",
    cohorts: ["governadores-prioritarios", "alto-trafego"],
    expected: {
      nome_completo: "Jeronimo Rodrigues de Jesus",
      nome_urna: "Jeronimo",
      partido_atual: "Partido dos Trabalhadores",
      partido_sigla: "PT",
      cargo_atual: "Governador da Bahia",
      cargo_disputado: "Governador",
      estado: "BA",
    },
  },
  {
    slug: "elmano-de-freitas",
    source: "Governo do Ceara + PT Ceara 2026-03",
    cohorts: ["governadores-prioritarios", "alto-trafego"],
    expected: {
      nome_completo: "Elmano de Freitas da Costa",
      nome_urna: "Elmano de Freitas",
      partido_atual: "Partido dos Trabalhadores",
      partido_sigla: "PT",
      cargo_atual: "Governador do Ceara",
      cargo_disputado: "Governador",
      estado: "CE",
    },
  },
  {
    slug: "joao-campos",
    source: "Prefeitura do Recife + PSB oficial 2026-03",
    cohorts: ["governadores-prioritarios", "alto-trafego"],
    expected: {
      nome_completo: "Joao Henrique de Andrade Lima Campos",
      nome_urna: "Joao Campos",
      partido_atual: "Partido Socialista Brasileiro",
      partido_sigla: "PSB",
      cargo_atual: "Prefeito do Recife",
      cargo_disputado: "Governador",
      estado: "PE",
    },
  },
  {
    slug: "raquel-lyra",
    source: "Governo de Pernambuco + PSD oficial 2026-03",
    cohorts: ["governadores-prioritarios", "alto-trafego"],
    expected: {
      nome_completo: "Raquel Teixeira Lyra Lucena",
      nome_urna: "Raquel Lyra",
      partido_atual: "Partido Social Democratico",
      partido_sigla: "PSD",
      cargo_atual: "Governadora de Pernambuco",
      cargo_disputado: "Governador",
      estado: "PE",
    },
  },
  {
    slug: "cleitinho",
    source: "Senado Federal 2026-03-31",
    cohorts: ["governadores-prioritarios", "alto-trafego"],
    expected: {
      nome_completo: "Cleiton Gontijo de Azevedo",
      nome_urna: "Cleitinho",
      partido_atual: "Republicanos",
      partido_sigla: "REPUBLICANOS",
      cargo_atual: "Senador(a)",
      cargo_disputado: "Governador",
      estado: "MG",
    },
  },
  {
    slug: "sergio-moro-gov-pr",
    source: "Senado Federal 2026-03-31",
    cohorts: ["governadores-prioritarios", "alto-trafego"],
    expected: {
      nome_completo: "Sergio Fernando Moro",
      nome_urna: "Sergio Moro",
      partido_atual: "Uniao Brasil",
      partido_sigla: "UNIAO",
      cargo_atual: "Senador(a)",
      cargo_disputado: "Governador",
      estado: "PR",
    },
  },
  {
    slug: "jorginho-mello",
    source: "Governo de Santa Catarina + ALESC oficial 2026-03",
    cohorts: ["governadores-prioritarios", "alto-trafego"],
    expected: {
      nome_completo: "Jorginho dos Santos Mello",
      nome_urna: "Jorginho Mello",
      partido_atual: "Partido Liberal",
      partido_sigla: "PL",
      cargo_atual: "Governador de Santa Catarina",
      cargo_disputado: "Governador",
      estado: "SC",
    },
  },
  {
    slug: "ricardo-nunes",
    source: "Prefeitura de Sao Paulo 2026-03-31",
    cohorts: ["governadores-prioritarios", "alto-trafego"],
    expected: {
      nome_completo: "Ricardo Luis Reis Nunes",
      nome_urna: "Ricardo Nunes",
      partido_atual: "Movimento Democratico Brasileiro",
      partido_sigla: "MDB",
      cargo_atual: "Prefeito de Sao Paulo",
      cargo_disputado: "Governador",
      estado: "SP",
    },
  },
  {
    slug: "haddad-gov-sp",
    source: "gov.br Fazenda + PT oficial 2026-03",
    cohorts: ["governadores-prioritarios", "alto-trafego"],
    expected: {
      nome_completo: "Fernando Haddad",
      nome_urna: "Fernando Haddad",
      partido_atual: "Partido dos Trabalhadores",
      partido_sigla: "PT",
      cargo_atual: "Ministro da Fazenda",
      cargo_disputado: "Governador",
      estado: "SP",
    },
  },
  {
    slug: "erika-hilton",
    source: "Camara dos Deputados 2026-03-31",
    cohorts: ["governadores-prioritarios", "alto-trafego"],
    expected: {
      nome_completo: "Erika Santos Silva",
      nome_urna: "Erika Hilton",
      partido_atual: "Partido Socialismo e Liberdade",
      partido_sigla: "PSOL",
      cargo_atual: "Deputado(a) Federal",
      cargo_disputado: "Governador",
      estado: "SP",
    },
  },
  {
    slug: "geraldo-alckmin",
    source: "Vice-Presidencia + PSB oficial 2026-03",
    cohorts: ["governadores-prioritarios", "alto-trafego"],
    expected: {
      nome_completo: "Geraldo Jose Rodrigues Alckmin Filho",
      nome_urna: "Geraldo Alckmin",
      partido_atual: "Partido Socialista Brasileiro",
      partido_sigla: "PSB",
      cargo_atual: "Vice-Presidente da Republica",
      cargo_disputado: "Governador",
      estado: "SP",
    },
  },
  {
    slug: "ciro-gomes-gov-ce",
    source: "PSDB oficial 2025-10-22",
    cohorts: ["governadores-prioritarios", "alto-trafego"],
    expected: {
      nome_completo: "Ciro Ferreira Gomes",
      nome_urna: "Ciro Gomes",
      partido_atual: "Partido da Social Democracia Brasileira",
      partido_sigla: "PSDB",
      cargo_atual: null,
      cargo_disputado: "Governador",
      estado: "CE",
    },
  },
]

export const ASSERTIONS_MAP = new Map(
  CANDIDATE_ASSERTIONS.map((item) => [item.slug, item])
)

export function getAssertionSlugsForCohort(cohort: AssertionCohort): string[] {
  const normalizedCohort =
    cohort === "alto-trafego-editorial" ? "alto-trafego" : cohort

  return CANDIDATE_ASSERTIONS.filter((item) => item.cohorts.includes(normalizedCohort)).map(
    (item) => item.slug
  )
}

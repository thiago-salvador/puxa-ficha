export type QuizEixo =
  | "economia"
  | "trabalho"
  | "seguranca"
  | "meio_ambiente"
  | "direitos_sociais"
  | "politica_fiscal"
  | "corrupcao"
  | "costumes"

export type RespostaLikert =
  | "concordo_total"
  | "concordo_parcial"
  | "neutro"
  | "discordo_parcial"
  | "discordo_total"

export type DirecaoVoto = "concordo=sim" | "concordo=nao"

export type DirecaoEconomico = "concordo=mercado" | "concordo=estado"

export type DirecaoSocial = "concordo=progressista" | "concordo=conservador"

export interface QuizPergunta {
  id: string
  eixo: QuizEixo
  texto: string
  ordem: number
  /** Contexto curto opcional (fase 2), exibido como "Entenda melhor". */
  contexto?: string
  /** Titulos que batem com `votacoes_chave.titulo` no Supabase (UUID varia por ambiente). */
  votacao_titulos?: string[]
  direcao_voto: DirecaoVoto
  eixo_economico_dir?: DirecaoEconomico
  eixo_social_dir?: DirecaoSocial
  /** Slugs de tema alinhados a `posicoes_declaradas.tema` (fase 2). */
  temas_pl?: string[]
}

export const LIKERT_VALUES: Record<RespostaLikert, number> = {
  concordo_total: 1,
  concordo_parcial: 0.75,
  neutro: 0.5,
  discordo_parcial: 0.25,
  discordo_total: 0,
}

/** Versão do payload de respostas na URL (?v=). v1 = 10; v2 = Likert 3 bits; v3 = +1 bit importancia por pergunta. */
export const QUIZ_VERSION = 3

/**
 * Quantidade de perguntas no encoding v1 (primeiras por `ordem`).
 * Usada em src/lib/quiz-encoding.ts e em tests/quiz-encoding.test.ts.
 */
export const QUIZ_V1_QUESTION_COUNT = 10

/** Curadoria: ampliar mapeamentos de votacao conforme `votacoes_chave` no banco. */
export const QUIZ_PERGUNTAS: QuizPergunta[] = [
  {
    id: "q01",
    eixo: "trabalho",
    ordem: 1,
    texto: "A reforma trabalhista de 2017 beneficiou os trabalhadores brasileiros.",
    contexto:
      "A reforma de Temer mudou regras da CLT: terceirização, jornada, negociado sobre o legislado em vários pontos. A votação nominal no Congresso é pública.",
    votacao_titulos: ["Reforma Trabalhista"],
    direcao_voto: "concordo=sim",
    eixo_economico_dir: "concordo=mercado",
    temas_pl: ["reforma_trabalhista"],
  },
  {
    id: "q02",
    eixo: "politica_fiscal",
    ordem: 2,
    texto: "O teto de gastos públicos foi necessário para proteger a economia brasileira.",
    contexto:
      "A EC 95 (2016) limitou crescimento de despesas por 20 anos. Foi revogada em parte depois, mas a votação original é referência histórica.",
    votacao_titulos: ["Teto de Gastos (EC 95)"],
    direcao_voto: "concordo=sim",
    eixo_economico_dir: "concordo=mercado",
    temas_pl: ["teto_gastos"],
  },
  {
    id: "q03",
    eixo: "direitos_sociais",
    ordem: 3,
    texto: "A reforma da Previdência de 2019 foi necessária e justa.",
    contexto:
      "A PEC aprovada no governo Bolsonaro elevou idade mínima e tempo de contribuição.",
    votacao_titulos: ["Reforma da Previdência"],
    direcao_voto: "concordo=sim",
    eixo_economico_dir: "concordo=mercado",
    temas_pl: ["previdencia"],
  },
  {
    id: "q04",
    eixo: "economia",
    ordem: 4,
    texto: "A privatização da Eletrobras foi boa para o país.",
    contexto: "Lei que abriu capital e mudou controle da empresa em 2022; houve voto nominal no Congresso.",
    votacao_titulos: ["Privatização da Eletrobras"],
    direcao_voto: "concordo=sim",
    eixo_economico_dir: "concordo=mercado",
    temas_pl: ["privatizacao_eletrobras"],
  },
  {
    id: "q05",
    eixo: "corrupcao",
    ordem: 5,
    texto: "O chamado orçamento secreto (emendas de relator) foi aceitável.",
    contexto: "Emendas RP9 sem identificação do parlamentar beneficiado; escândalo de 2021.",
    votacao_titulos: ["Orçamento Secreto (Emendas de Relator)"],
    direcao_voto: "concordo=sim",
    eixo_economico_dir: "concordo=mercado",
    temas_pl: ["orcamento_secreto"],
  },
  {
    id: "q06",
    eixo: "economia",
    ordem: 6,
    texto: "O Banco Central deve ter autonomia formal em relação ao governo.",
    contexto: "MP e lei que fixaram mandato e autonomia do BC; voto no Congresso é público.",
    votacao_titulos: ["Autonomia do Banco Central"],
    direcao_voto: "concordo=sim",
    eixo_economico_dir: "concordo=mercado",
    temas_pl: ["autonomia_bc"],
  },
  {
    id: "q07",
    eixo: "economia",
    ordem: 7,
    texto: "O governo deveria controlar preços de alimentos e combustíveis.",
    direcao_voto: "concordo=nao",
    eixo_economico_dir: "concordo=estado",
  },
  {
    id: "q08",
    eixo: "meio_ambiente",
    ordem: 8,
    texto:
      "O Brasil deveria priorizar preservação ambiental mesmo que desacelere parte do agronegócio.",
    direcao_voto: "concordo=nao",
    eixo_economico_dir: "concordo=estado",
  },
  {
    id: "q09",
    eixo: "direitos_sociais",
    ordem: 9,
    texto: "Programas de transferência de renda como o Bolsa Família são um investimento social necessário.",
    contexto:
      "MP 1.087/2021 instituiu o Auxílio Brasil no lugar do Bolsa Família; voto no Congresso é público.",
    votacao_titulos: ["Auxílio Brasil (MP 1.087/2021)"],
    direcao_voto: "concordo=sim",
    eixo_economico_dir: "concordo=estado",
    temas_pl: ["transferencia_renda"],
  },
  {
    id: "q10",
    eixo: "costumes",
    ordem: 10,
    texto:
      "O Estado deveria interferir menos em questões como aborto e casamento homoafetivo.",
    direcao_voto: "concordo=sim",
    eixo_social_dir: "concordo=progressista",
  },
  {
    id: "q11",
    eixo: "costumes",
    ordem: 11,
    texto: "A posse de armas de fogo deveria ser um direito garantido a todo cidadão.",
    direcao_voto: "concordo=sim",
    eixo_social_dir: "concordo=conservador",
  },
  {
    id: "q12",
    eixo: "costumes",
    ordem: 12,
    texto: "O ensino religioso deveria ter espaço nas escolas públicas.",
    direcao_voto: "concordo=sim",
    eixo_social_dir: "concordo=conservador",
  },
  {
    id: "q13",
    eixo: "direitos_sociais",
    ordem: 13,
    texto:
      "O Estado deveria garantir moradia e saúde como direitos universais, mesmo que isso aumente impostos.",
    direcao_voto: "concordo=sim",
    eixo_economico_dir: "concordo=estado",
    eixo_social_dir: "concordo=progressista",
  },
  {
    id: "q14",
    eixo: "seguranca",
    ordem: 14,
    texto: "As Forças Armadas deveriam ter um papel mais ativo na segurança pública.",
    direcao_voto: "concordo=sim",
    eixo_social_dir: "concordo=conservador",
  },
  {
    id: "q15",
    eixo: "economia",
    ordem: 15,
    texto: "Empresas estratégicas como Petrobras e Vale deveriam ser 100% estatais.",
    direcao_voto: "concordo=sim",
    eixo_economico_dir: "concordo=estado",
  },
]

export function quizPerguntasOrdenadas(): QuizPergunta[] {
  return [...QUIZ_PERGUNTAS].sort((a, b) => a.ordem - b.ordem)
}

/** Primeiras N perguntas por ordem (para decode de URLs v1). */
export function quizPerguntasPrimeiras(n: number): QuizPergunta[] {
  const o = quizPerguntasOrdenadas()
  return o.slice(0, n)
}

export function collectQuizVotacaoTitulos(perguntas: QuizPergunta[]): string[] {
  const out = new Set<string>()
  for (const p of perguntas) {
    for (const t of p.votacao_titulos ?? []) {
      out.add(t)
    }
  }
  return [...out]
}

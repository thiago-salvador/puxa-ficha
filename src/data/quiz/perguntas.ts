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
  | "sem_opiniao"

type DirecaoVoto = "concordo=sim" | "concordo=nao"

type DirecaoEconomico = "concordo=mercado" | "concordo=estado"

type DirecaoSocial = "concordo=progressista" | "concordo=conservador"

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

export const LIKERT_VALUES: Record<Exclude<RespostaLikert, "sem_opiniao">, number> = {
  concordo_total: 1,
  concordo_parcial: 0.75,
  neutro: 0.5,
  discordo_parcial: 0.25,
  discordo_total: 0,
}

/** v4 separa sem opinião e revisa o texto das perguntas. Links anteriores não são reinterpretados. */
export const QUIZ_VERSION = 4

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
    texto: "Sou a favor das mudanças trabalhistas da Lei 13.467/2017.",
    contexto:
      "Esta pergunta trata da reforma federal de 2017, não de propostas posteriores sobre jornada de trabalho. A comparação nominal considera a aprovação da matéria.",
    votacao_titulos: ["Reforma Trabalhista"],
    direcao_voto: "concordo=sim",
    eixo_economico_dir: "concordo=mercado",
    temas_pl: ["reforma_trabalhista"],
  },
  {
    id: "q02",
    eixo: "politica_fiscal",
    ordem: 2,
    texto: "Sou a favor do limite de despesas estabelecido pelo teto de gastos da EC 95/2016.",
    contexto:
      "A comparação é histórica, sobre o teto aprovado em 2016. Votos no arcabouço fiscal de 2023 não representam automaticamente uma posição sobre essa regra anterior.",
    votacao_titulos: ["Teto de Gastos (EC 95)"],
    direcao_voto: "concordo=sim",
    eixo_economico_dir: "concordo=mercado",
    temas_pl: ["teto_gastos"],
  },
  {
    id: "q03",
    eixo: "direitos_sociais",
    ordem: 3,
    texto: "Sou a favor da reforma federal da Previdência de 2019.",
    contexto:
      "A pergunta trata da reforma federal de 2019. Reformas municipais e estaduais têm regras próprias e não são usadas como equivalentes.",
    votacao_titulos: ["Reforma da Previdência"],
    direcao_voto: "concordo=sim",
    eixo_economico_dir: "concordo=mercado",
    temas_pl: ["previdencia"],
  },
  {
    id: "q04",
    eixo: "economia",
    ordem: 4,
    texto: "Sou a favor da privatização da Eletrobras autorizada pela Lei 14.182/2021.",
    contexto: "A pergunta é específica sobre a Eletrobras. Posições sobre outras empresas públicas não são usadas como equivalentes.",
    votacao_titulos: ["Privatização da Eletrobras"],
    direcao_voto: "concordo=sim",
    eixo_economico_dir: "concordo=mercado",
    temas_pl: ["privatizacao_eletrobras"],
  },
  {
    id: "q05",
    eixo: "corrupcao",
    ordem: 5,
    texto: "Sou a favor do mecanismo de emendas de relator (RP9) adotado em 2021.",
    contexto: "São as emendas conhecidas como orçamento secreto. A comparação considera a regulamentação desse mecanismo, sem tratar a resposta como posição econômica de mercado ou de Estado.",
    votacao_titulos: ["Orçamento Secreto (Emendas de Relator)"],
    direcao_voto: "concordo=sim",
    temas_pl: ["orcamento_secreto"],
  },
  {
    id: "q06",
    eixo: "economia",
    ordem: 6,
    texto: "Sou a favor da autonomia formal do Banco Central prevista na Lei Complementar 179/2021.",
    contexto: "A comparação considera a matéria que definiu a autonomia formal e os mandatos da direção do Banco Central.",
    votacao_titulos: ["Autonomia do Banco Central"],
    direcao_voto: "concordo=sim",
    eixo_economico_dir: "concordo=mercado",
    temas_pl: ["autonomia_bc"],
  },
  {
    id: "q07",
    eixo: "economia",
    ordem: 7,
    texto: "O governo deveria controlar os preços dos combustíveis.",
    direcao_voto: "concordo=nao",
    eixo_economico_dir: "concordo=estado",
  },
  {
    id: "q08",
    eixo: "meio_ambiente",
    ordem: 8,
    texto:
      "O Brasil deveria priorizar preservação ambiental mesmo que desacelere parte do agronegócio.",
    contexto: "Esta opinião geral não é comparada a votos sobre o marco temporal de terras indígenas, que trata de uma política específica.",
    direcao_voto: "concordo=nao",
  },
  {
    id: "q09",
    eixo: "direitos_sociais",
    ordem: 9,
    texto: "Programas de transferência de renda como o Bolsa Família são um investimento social necessário.",
    contexto:
      "A comparação usa posições documentadas sobre o princípio da transferência de renda. Um voto em um pacote legislativo específico não equivale automaticamente a essa opinião geral.",
    direcao_voto: "concordo=sim",
    eixo_economico_dir: "concordo=estado",
    temas_pl: ["transferencia_renda"],
  },
  {
    id: "q10",
    eixo: "costumes",
    ordem: 10,
    texto:
      "O casamento civil entre pessoas do mesmo sexo deve ser garantido por lei.",
    direcao_voto: "concordo=sim",
    eixo_social_dir: "concordo=progressista",
  },
  {
    id: "q11",
    eixo: "costumes",
    ordem: 11,
    texto: "A posse de armas de fogo deveria ser ampliada para a população civil.",
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
      "O Estado deveria garantir acesso universal à moradia.",
    direcao_voto: "concordo=sim",
    eixo_economico_dir: "concordo=estado",
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
    texto: "A Petrobras deveria ser uma empresa totalmente estatal.",
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

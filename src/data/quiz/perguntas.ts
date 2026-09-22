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
  /** Contexto curto opcional (fase 2), exibido como "Como a comparação funciona". */
  contexto?: string
  /**
   * Explicação factual do assunto, exibida aberta acima das opções. "O que é" para
   * perguntas sobre uma lei; "Como é hoje" para perguntas de opinião. Números que
   * mudam com o tempo (valores, percentuais, tramitação) precisam de revisão.
   */
  o_que_e?: {
    rotulo: "O que é" | "Como é hoje"
    texto: string
    fonte: { titulo: string; url: string }
  }
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
    o_que_e: {
      rotulo: "O que é",
      texto:
        "Alterou a CLT em vários pontos. Acordos e convenções coletivas passaram a valer mais que a lei em temas como jornada e banco de horas. A contribuição sindical deixou de ser obrigatória e passou a depender de autorização do trabalhador. A lei criou o trabalho intermitente, regulamentou o teletrabalho e passou a permitir que quem perde uma ação trabalhista pague os honorários do advogado da outra parte.",
      fonte: { titulo: "Lei 13.467/2017 (Planalto)", url: "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2017/lei/l13467.htm" },
    },
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
    o_que_e: {
      rotulo: "O que é",
      texto:
        "Limitou por 20 anos o crescimento das despesas primárias do governo federal à inflação do ano anterior, medida pelo IPCA. Os pisos de saúde e educação passaram a seguir a mesma correção a partir de 2018. A regra foi substituída em 2023 pelo arcabouço fiscal (Lei Complementar 200/2023).",
      fonte: { titulo: "Emenda Constitucional 95/2016 (Planalto)", url: "https://www.planalto.gov.br/ccivil_03/constituicao/emendas/emc/emc95.htm" },
    },
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
    o_que_e: {
      rotulo: "O que é",
      texto:
        "Criou idade mínima para se aposentar pelo INSS: 65 anos para homens e 62 para mulheres, com regras de transição para quem já contribuía. Acabou com a aposentadoria só por tempo de contribuição e mudou o cálculo do benefício, que parte de 60% da média de todas as contribuições e sobe 2 pontos por ano trabalhado além de 20 anos (homens) ou 15 anos (mulheres). As alíquotas de contribuição passaram a ser progressivas por faixa de salário. Vale para o setor privado e para servidores federais; estados e municípios precisam de regras próprias.",
      fonte: { titulo: "Emenda Constitucional 103/2019 (Planalto)", url: "https://www.planalto.gov.br/ccivil_03/constituicao/emendas/emc/emc103.htm" },
    },
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
    o_que_e: {
      rotulo: "O que é",
      texto:
        "Autorizou a privatização da Eletrobras por meio da emissão de novas ações, o que reduziu a participação da União para menos da metade das ações com direito a voto. Nenhum acionista pode votar com mais de 10% do capital votante, e a União ficou com uma ação especial que dá poder de veto em alguns temas. A lei também obrigou a contratação de 8 GW de usinas termelétricas a gás natural em regiões definidas (leis de 2025 mudaram parte desses montantes). A operação foi concluída em junho de 2022.",
      fonte: { titulo: "Lei 14.182/2021 (Planalto)", url: "https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/L14182.htm" },
    },
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
    texto: "Sou a favor do mecanismo de emendas de relator (RP9), usado no Orçamento federal de 2020 a 2022.",
    o_que_e: {
      rotulo: "O que é",
      texto:
        "Parte do Orçamento federal passou a ser distribuída por indicação do relator-geral do Orçamento, identificada pelo código RP9, usado a partir do orçamento de 2020. Não havia registro público de qual parlamentar pedia cada recurso, o que deu origem ao apelido \"orçamento secreto\". Em 2021 o Congresso aprovou uma resolução para dar mais transparência ao mecanismo. Em dezembro de 2022 o STF declarou as emendas de relator inconstitucionais, por 6 votos a 5.",
      fonte: { titulo: "STF, julgamento de dezembro de 2022", url: "https://noticias.stf.jus.br/postsnoticias/stf-julga-orcamento-secreto-inconstitucional/" },
    },
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
    o_que_e: {
      rotulo: "O que é",
      texto:
        "Desvinculou o Banco Central de qualquer ministério e deu mandatos fixos de quatro anos ao presidente e aos diretores, que não coincidem com o mandato do presidente da República. Eles só podem ser demitidos nas situações previstas na lei, como condenação ou desempenho insuficiente. O objetivo principal do BC é a estabilidade de preços; os complementares são zelar pela estabilidade do sistema financeiro, suavizar as oscilações da economia e fomentar o pleno emprego.",
      fonte: { titulo: "Lei Complementar 179/2021 (Planalto)", url: "https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp179.htm" },
    },
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
    o_que_e: {
      rotulo: "Como é hoje",
      texto:
        "O governo não fixa o preço na bomba: os preços de combustíveis são livres no Brasil desde 2002. A Petrobras, controlada pela União, define o preço de venda nas suas refinarias. De 2016 a 2023 ela seguiu a paridade de importação, que acompanha o mercado internacional, e em maio de 2023 trocou essa política por uma nova estratégia comercial. O governo também influencia o preço por meio dos impostos.",
      fonte: { titulo: "ANP, histórico da liberação dos preços", url: "https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/historico-da-liberacao-dos-precos-de-combustiveis-no-mercado-brasileiro" },
    },
    direcao_voto: "concordo=nao",
    eixo_economico_dir: "concordo=estado",
  },
  {
    id: "q08",
    eixo: "meio_ambiente",
    ordem: 8,
    texto:
      "O Brasil deveria priorizar preservação ambiental mesmo que desacelere parte do agronegócio.",
    o_que_e: {
      rotulo: "Como é hoje",
      texto:
        "A principal regra é o Código Florestal (Lei 12.651/2012). Ele obriga imóveis rurais a manter parte da vegetação nativa como Reserva Legal: 80% em áreas de floresta na Amazônia Legal, 35% em áreas de cerrado na Amazônia Legal e 20% nas demais regiões. Também protege margens de rios, nascentes e encostas, chamadas de Áreas de Preservação Permanente.",
      fonte: { titulo: "Lei 12.651/2012 (Planalto)", url: "https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2012/lei/l12651.htm" },
    },
    contexto: "Esta opinião geral não é comparada a votos sobre o marco temporal de terras indígenas, que trata de uma política específica.",
    direcao_voto: "concordo=nao",
  },
  {
    id: "q09",
    eixo: "direitos_sociais",
    ordem: 9,
    texto: "Programas de transferência de renda como o Bolsa Família são um investimento social necessário.",
    o_que_e: {
      rotulo: "Como é hoje",
      texto:
        "Programa federal de transferência de renda criado em 2003, substituído pelo Auxílio Brasil em 2021 e 2022 e recriado em 2023 (Lei 14.601/2023). Atende famílias com renda de até R$ 218 por pessoa. O valor mínimo por família é de R$ 600 e sobe para R$ 691 a partir de outubro de 2026, com adicionais por criança, gestante e adolescente. As famílias precisam cumprir exigências como frequência escolar, vacinação e pré-natal.",
      fonte: { titulo: "Ministério do Desenvolvimento e Assistência Social", url: "https://www.gov.br/mds/pt-br/noticias/bolsa-familia-tera-valor-minimo-de-r-691-a-partir-de-outubro" },
    },
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
    o_que_e: {
      rotulo: "Como é hoje",
      texto:
        "Não existe lei federal sobre o tema. Em 2011 o STF reconheceu a união estável entre pessoas do mesmo sexo e, em 2013, o Conselho Nacional de Justiça proibiu os cartórios de recusar o casamento civil desses casais (Resolução 175). Na Câmara tramitam juntos um projeto que reconhece essa união (PL 580/2007) e outro que proíbe o casamento (PL 5167/2009), aprovado em uma comissão em outubro de 2023. Os dois aguardam a Comissão de Constituição e Justiça.",
      fonte: { titulo: "Câmara dos Deputados, tramitação do PL 5167/2009", url: "https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=432967" },
    },
    direcao_voto: "concordo=sim",
    eixo_social_dir: "concordo=progressista",
  },
  {
    id: "q11",
    eixo: "costumes",
    ordem: 11,
    texto: "A posse de armas de fogo deveria ser ampliada para a população civil.",
    o_que_e: {
      rotulo: "Como é hoje",
      texto:
        "O Estatuto do Desarmamento (Lei 10.826/2003) separa posse, que é manter a arma em casa ou no trabalho, de porte, que é andar com ela. A posse é permitida a maiores de 25 anos que comprovem ocupação lícita e residência, não tenham antecedentes criminais e passem por testes de aptidão técnica e psicológica. Decretos de 2019 a 2022 ampliaram o acesso, e o Decreto 11.615/2023 voltou a restringi-lo.",
      fonte: { titulo: "Lei 10.826/2003 (Planalto)", url: "https://www.planalto.gov.br/ccivil_03/leis/2003/l10.826.htm" },
    },
    direcao_voto: "concordo=sim",
    eixo_social_dir: "concordo=conservador",
  },
  {
    id: "q12",
    eixo: "costumes",
    ordem: 12,
    texto: "O ensino religioso deveria ter espaço nas escolas públicas.",
    o_que_e: {
      rotulo: "Como é hoje",
      texto:
        "A Constituição já prevê o ensino religioso nas escolas públicas de ensino fundamental, como disciplina de matrícula facultativa (art. 210). Em 2017 o STF decidiu, por 6 votos a 5, que essa disciplina pode ser confessional, ou seja, ligada a uma religião específica, desde que a matrícula continue opcional.",
      fonte: { titulo: "STF, julgamento da ADI 4439", url: "https://noticias.stf.jus.br/postsnoticias/stf-conclui-julgamento-sobre-ensino-religioso-nas-escolas-publicas/" },
    },
    direcao_voto: "concordo=sim",
    eixo_social_dir: "concordo=conservador",
  },
  {
    id: "q13",
    eixo: "direitos_sociais",
    ordem: 13,
    texto:
      "O Estado deveria garantir acesso universal à moradia.",
    o_que_e: {
      rotulo: "Como é hoje",
      texto:
        "A moradia é um direito social previsto na Constituição desde 2000 (art. 6º). O principal programa federal é o Minha Casa, Minha Vida, criado em 2009, trocado pelo Casa Verde e Amarela em 2021 e 2022 e retomado em 2023 (Lei 14.620/2023). Segundo a Fundação João Pinheiro, faltavam cerca de 5,8 milhões de moradias no país em 2024, o menor número da série.",
      fonte: { titulo: "Fundação João Pinheiro, déficit habitacional", url: "https://fjp.mg.gov.br/deficit-habitacional/" },
    },
    direcao_voto: "concordo=sim",
    eixo_economico_dir: "concordo=estado",
  },
  {
    id: "q14",
    eixo: "seguranca",
    ordem: 14,
    texto: "As Forças Armadas deveriam ter um papel mais ativo na segurança pública.",
    o_que_e: {
      rotulo: "Como é hoje",
      texto:
        "Pela Constituição, a segurança pública cabe às polícias (art. 144). As Forças Armadas cuidam da defesa do país e só atuam na segurança pública em operações temporárias de Garantia da Lei e da Ordem (GLO). Essas operações dependem de decisão do presidente da República e só podem ocorrer depois que o governo reconhece formalmente que as forças de segurança disponíveis são insuficientes (art. 142 e Lei Complementar 97/1999).",
      fonte: { titulo: "Lei Complementar 97/1999 (Planalto)", url: "https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp97.htm" },
    },
    direcao_voto: "concordo=sim",
    eixo_social_dir: "concordo=conservador",
  },
  {
    id: "q15",
    eixo: "economia",
    ordem: 15,
    texto: "A Petrobras deveria ser uma empresa totalmente estatal.",
    o_que_e: {
      rotulo: "Como é hoje",
      texto:
        "A Petrobras é uma sociedade de economia mista. A União controla a empresa porque detém 50,26% das ações com direito a voto, mas, somando BNDES e BNDESPar, o setor público tem 35,45% do capital total. O restante pertence a investidores privados, no Brasil e no exterior, e é negociado na B3 e na bolsa de Nova York. Torná-la totalmente estatal exigiria comprar as ações desses acionistas.",
      fonte: { titulo: "Petrobras, composição acionária (agosto de 2026)", url: "https://www.investidorpetrobras.com.br/visao-geral/composicao-acionaria/" },
    },
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

import { formatImprensaCargoList, type ImprensaFacts } from "@/lib/imprensa-facts"

// cspell:words homonimos homonimo Zaaz

/**
 * Textos do Kit de imprensa. Todo número vem de `computeImprensaFacts` sobre o
 * dataset público, calculado na hora da página. Sem dataset, os textos saem
 * sem números, nunca com zero no lugar do dado.
 */

export interface KitNumbers {
  total: number
  patrimonios: number
  comProcesso: number
  homonimos: number
  /** Cargos presentes no dataset, em texto corrido ("presidente, governador e Senado"). */
  cargos: string
  /** Data do dataset em dd/mm/aaaa, horário de Brasília. */
  data: string | null
}

const NUMBER = new Intl.NumberFormat("pt-BR")

function count(value: number, one: string, many: string): string {
  return `${NUMBER.format(value)} ${value === 1 ? one : many}`
}

function formatKitDate(generatedAt: string | null | undefined): string | null {
  if (!generatedAt) return null
  const date = new Date(generatedAt)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" }).format(date)
}

export function kitNumbers(facts: ImprensaFacts | null, generatedAt: string | null | undefined): KitNumbers | null {
  if (!facts || facts.total === 0) return null
  return {
    total: facts.total,
    patrimonios: facts.patrimonio.publicado,
    comProcesso: facts.processos.candidatosComProcesso,
    homonimos: facts.processos.indeterminado,
    cargos: formatImprensaCargoList(facts.porCargo.map((item) => item.cargo)),
    data: formatKitDate(generatedAt),
  }
}

/**
 * "os 1.234 candidatos a presidente e governador": total e cargos saem do
 * dataset. Sem dataset, a frase não afirma número nem cargo.
 */
function candidatos(n: KitNumbers | null): string {
  if (!n) return "os candidatos"
  const alvo = n.cargos ? ` a ${n.cargos}` : ""
  return n.total === 1 ? `1 candidato${alvo}` : `os ${NUMBER.format(n.total)} candidatos${alvo}`
}

function nosDados(n: KitNumbers): string {
  return n.data ? `Nos dados de ${n.data}` : "Nos dados atuais"
}

/** Citação do projeto, fixa. */
export const projectCitation = "Puxa Ficha (puxaficha.com.br), consulta pública de dados oficiais sobre candidaturas de 2026"

/** Frase citável sobre o projeto, com o total de candidatos calculado. */
export function kitOneLine(n: KitNumbers | null): string {
  return `O Puxa Ficha (puxaficha.com.br) reúne o que TSE, tribunais, CGU, Câmara e Senado registram sobre ${candidatos(n)} em 2026, com link para a fonte oficial e a data de coleta em cada dado.`
}

export interface KitText {
  id: "50" | "100" | "250"
  label: string
  paragraphs: string[]
}

export function kitPressTexts(n: KitNumbers | null): KitText[] {
  const patrimonio = n
    ? `A ficha traz a declaração de patrimônio ao TSE de ${count(n.patrimonios, "candidato", "candidatos")} e processos publicados na ficha de ${NUMBER.format(n.comProcesso)}.`
    : "A ficha traz a declaração de patrimônio ao TSE e processos publicados com número e fonte."
  const patrimonioLongo = n
    ? `${nosDados(n)}, a ficha traz a declaração de patrimônio ao TSE de ${count(n.patrimonios, "candidato", "candidatos")}, com a variação entre eleições quando há duas declarações comparáveis. ${count(n.comProcesso, "candidato tem", "candidatos têm")} processo publicado na ficha, com número e fonte; quando o link oficial ainda está em confirmação, a ficha avisa.`
    : "A ficha traz a declaração de patrimônio ao TSE, com a variação entre eleições quando há duas declarações comparáveis, e processos publicados com número e fonte; quando o link oficial ainda está em confirmação, a ficha avisa."
  const homonimos = n
    ? `Quando a busca de processo acha um nome igual sem um segundo dado oficial que confirme a pessoa, o processo não é publicado. ${nosDados(n)}, ${count(n.homonimos, "busca está", "buscas estão")} nessa situação.`
    : "Quando a busca de processo acha um nome igual sem um segundo dado oficial que confirme a pessoa, o processo não é publicado."

  return [
    {
      id: "50",
      label: "50 palavras",
      paragraphs: [
        `O Puxa Ficha (puxaficha.com.br) mostra dados oficiais sobre ${candidatos(n)} em 2026: patrimônio, processos com número e fonte, sanções federais, cota parlamentar e chapas. Cada dado tem fonte e data de coleta. O site não recomenda voto. Processo não é condenação. Ausência de dado não é zero.`,
      ],
    },
    {
      id: "100",
      label: "100 palavras",
      paragraphs: [
        `O Puxa Ficha (puxaficha.com.br) reúne dados oficiais sobre ${candidatos(n)} em 2026. Cada dado tem link para a fonte e a data de coleta. ${patrimonio} O site também mostra registros em cadastros federais de sanções da CGU, gastos da cota parlamentar na Câmara e no Senado e a composição das chapas. O site não recomenda voto. Processo não é condenação. Ausência de dado não é zero. Confira a fonte original antes de publicar.`,
      ],
    },
    {
      id: "250",
      label: "250 palavras",
      paragraphs: [
        `O Puxa Ficha (puxaficha.com.br) é uma consulta pública de dados oficiais sobre ${candidatos(n)} nas eleições de 2026. Cada ficha reúne o que TSE, tribunais, CGU, Câmara e Senado registram sobre a pessoa, com link para o documento de origem e a data em que o dado foi coletado.`,
        `${patrimonioLongo} O site também mostra registros nos cadastros federais de sanções da CGU (CEIS, CNEP e CEAF), os gastos da cota parlamentar de quem teve mandato na Câmara ou no Senado e a composição das chapas, com vice e suplentes conforme o arquivo do TSE.`,
        homonimos,
        "O site não recomenda voto. Processo não é condenação: a situação de cada caso está no documento do tribunal. Quando um dado não foi encontrado ou não foi consultado, a ficha diz isso, e ausência de dado não é zero. O código é aberto e as correções são públicas. Antes de publicar, confira o dado na fonte original e registre a data da consulta.",
      ],
    },
  ]
}

/** Formatos de citação em três níveis. Trechos entre < > são o formato, não dado. */
export const citationFormats = [
  {
    label: "Projeto",
    citation: `${projectCitation}. Acesso em <data da consulta>.`,
  },
  {
    label: "Pacote do estado",
    citation: "Puxa Ficha, pacote de <nome do estado> (puxaficha.com.br/imprensa/uf/<sigla da UF>), dados de <data dos dados>. Fonte original: <órgão oficial>.",
  },
  {
    label: "Candidato ou dado",
    citation: "Puxa Ficha, ficha de <nome do candidato> (puxaficha.com.br/candidato/<endereço da ficha>): <dado citado>, segundo <órgão oficial>, coletado em <data de coleta>.",
  },
] as const

/** Texto aprovado pelo fundador; o kit não publica foto. Mesmo texto de public/imprensa/bio.txt. */
export const founderBio = "Thiago Salvador é diretor de Operações e IA na Zaaz, empresa de creator economy com sede em Seattle, e vive em São Paulo. Criou o Puxa Ficha para reunir em um só lugar o que as fontes oficiais dizem sobre cada candidato."

export interface KitQuestion { question: string; answer: string; sourceHref?: string; sourceLabel?: string }

const baseQuestions: readonly KitQuestion[] = [
  {
    question: "O que é o Puxa Ficha?",
    answer: "Uma plataforma de consulta de informações públicas sobre candidaturas. A Sala reúne fichas, fontes, recortes e estados de cobertura para apoiar a apuração.",
  },
  {
    question: "O que a plataforma não faz?",
    answer: "Não recomenda voto, não substitui a leitura das fontes originais e não transforma ausência de dado em zero. Um processo listado não equivale a condenação.",
  },
  {
    question: "Onde encontro o recorte e a data dos dados?",
    answer: "Na Mesa, confira os filtros e os estados de cada linha. O JSON e o CSV da Mesa permitem baixar o recorte. Consulte também a data de geração e a fonte indicada para o dado que pretende usar.",
  },
  {
    question: "Quem financia o projeto?",
    answer: "O Puxa Ficha se financia por apoio coletivo, numa campanha aberta no APOIA.se, onde qualquer pessoa vê quanto foi arrecadado, quantas pessoas apoiam e para que serve cada faixa de valor.",
    sourceHref: "/sobre",
    sourceLabel: "Sobre",
  },
  {
    question: "Existe uma perspectiva editorial?",
    answer: "A página Sobre descreve a perspectiva editorial do projeto. Para avaliar uma informação específica, examine a fonte, o método e o estado da cobertura apresentados junto do dado.",
  },
  {
    question: "Há uso de inteligência artificial?",
    answer: "Pontos gerados por IA como alerta só entram na página pública após checagem editorial registrada.",
    sourceHref: "/sobre",
    sourceLabel: "Sobre",
  },
  {
    question: "Como comunicar um erro?",
    answer: "Envie o link da ficha, o trecho contestado e a fonte que permite conferir a correção para contato@puxaficha.com.br. Não publique um dado em disputa sem checar o documento original.",
  },
  {
    question: "Como são tratados dados pessoais?",
    answer: "As fichas e os arquivos baixados devem ser usados dentro do recorte publicado. Não acrescente identificadores pessoais nem deduza dados ausentes. Consulte a política de privacidade do site para informações sobre o tratamento de dados.",
  },
  {
    question: "O que significa cobertura incompleta?",
    answer: "Significa que o material disponível não sustenta uma conclusão para todo o recorte. Estados como sem dado, fonte indisponível e cobertura parcial não equivalem a uma busca que não encontrou registro.",
  },
  {
    question: "Um processo significa condenação?",
    answer: "Não. O registro de um processo indica uma ocorrência dentro do escopo informado. Leia a fonte oficial, a situação e as limitações antes de descrevê-lo em uma matéria.",
  },
]

/** FAQ existente mais duas perguntas; a de homônimos usa a contagem calculada. */
export function kitQuestions(n: KitNumbers | null): KitQuestion[] {
  const homonimoCount = n
    ? ` ${nosDados(n)}, ${count(n.homonimos, "busca de processo está", "buscas de processo estão")} nessa situação.`
    : ""
  return [
    ...baseQuestions,
    {
      question: "Como o site trata homônimos?",
      answer: `Quando a busca de processo acha um nome igual ao do candidato sem um segundo dado oficial que confirme a pessoa, o processo não é publicado.${homonimoCount} Esses casos aparecem como sem confirmação, não como nada consta.`,
    },
    {
      question: "O que significa cada estado do dado?",
      answer: "Cada dado aparece em um de quatro estados: publicado; buscado, nada consta; parcial ou em revisão; sem confirmação ou sem dado. Sem dado não equivale a zero. A explicação de cada estado, com fonte, data e método, está em",
      sourceHref: "/imprensa/frescor",
      sourceLabel: "Como coletamos",
    },
  ]
}

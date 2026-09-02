import { normalizePartySigla, resolveCanonicalPartySigla } from "@/lib/party-utils"

/**
 * Procedencia por EIXO, nao por partido.
 *
 * Ate 18/08/2026 as 28 entradas diziam apenas `fonte: "curadoria"`, julgamento
 * editorial sem documento que o leitor pudesse conferir, e o cabecalho admitia
 * revisao pendente. Era o dado mais fragil que o site publicava.
 *
 * Duas rodadas foram feitas. A primeira mirou o TSE e falhou por motivo
 * estrutural: o TSE publica estatuto, nao programa, e estatuto e carta de
 * organizacao interna. O PP tem 165 artigos e nenhuma mencao a mercado,
 * privatizacao, familia ou religiao.
 *
 * A segunda foi ao programa publicado pelo proprio partido, e funcionou. Cada
 * eixo com `tipo` diferente de "curadoria" tem trecho literal, URL clicavel e
 * data, e passou por dois portoes:
 *
 *   1. o trecho citado foi procurado dentro do documento baixado, e 30 de 31
 *      bateram palavra por palavra;
 *   2. a URL precisa ser documento programatico. Home de site, pagina de
 *      noticia e pagina de historia foram rejeitadas, porque mudam sem aviso e
 *      citar a home fingindo documento e pior do que assumir curadoria.
 *
 * O eixo economico do PSDB reprovou por motivo proprio: a URL devolve HTTP 403,
 * entao nem eu nem o leitor conseguimos abrir.
 *
 * Eixo que segue "curadoria" nao tem documento ainda, e deve ser tratado assim
 * em qualquer comunicacao publica.
 *
 * IMPORTANTE: isto e posicao do PARTIDO. Nunca deve ser escrito como declaracao
 * do candidato nem preencher `posicoes_declaradas`.
 *
 * Gerado por scripts/gerar-espectro-partidario.py. Nao editar a mao.
 */
interface FonteEixo {
  tipo: "programa" | "carta_de_principios" | "manifesto" | "curadoria"
  url?: string
  data?: string
  trecho?: string
}

export interface EspectroPartidario {
  partido_sigla: string
  eixo_economico: number
  eixo_social: number
  fonte_economico: FonteEixo
  fonte_social: FonteEixo
  notas?: string
}

const ESPECTRO_PARTIDARIO: EspectroPartidario[] = [
  {
    partido_sigla: "PSTU",
    eixo_economico: 1,
    eixo_social: 2,
    fonte_economico: {
      tipo: "programa",
      url: "https://www.pstu.org.br/16-pontos-de-um-programa-socialista-para-o-brasil-contra-a-crise-capitalista/",
      data: "2018-08-24",
      trecho: "Diante disso, o PSTU se vê na obrigação de apresentar à classe trabalhadora e o povo pobre do Brasil, uma alternativa socialista e revolucionária. Um ",
    },
    fonte_social: {
      tipo: "programa",
      url: "https://www.pstu.org.br/16-pontos-de-um-programa-socialista-para-o-brasil-contra-a-crise-capitalista/",
      data: "2018-08-24",
      trecho: "Em defesa da mulher trabalhadora, combatemos todo tipo de violência à mulher; por igualdade de direitos e salários; aborto livre, público e gratuito. ",
    },
  },
  {
    partido_sigla: "PCO",
    eixo_economico: 1,
    eixo_social: 2,
    fonte_economico: { tipo: "curadoria" },
    fonte_social: { tipo: "curadoria" },
  },
  {
    partido_sigla: "PCB",
    eixo_economico: 1,
    eixo_social: 2,
    fonte_economico: { tipo: "curadoria" },
    fonte_social: { tipo: "curadoria" },
    notas: "DADOS 2023 (survey 2018, sigla PCB) + espectro-partidos.json onda-p 14/08",
  },
  {
    partido_sigla: "UP",
    eixo_economico: 1,
    eixo_social: 1,
    fonte_economico: {
      tipo: "programa",
      url: "https://unidadepopular.org.br/programa",
      data: "2021-10-01",
      trecho: "Controle social de todos os monopólios e consórcios capitalistas e dos meios de produção nos setores estratégicos da economia; planificação da economi",
    },
    fonte_social: {
      tipo: "programa",
      url: "https://unidadepopular.org.br/programa",
      data: "2021-10-01",
      trecho: "Fim da discriminação das mulheres; direitos iguais; fim do racismo e da discriminação dos negros; firme combate à exploração sexual de mulheres e cria",
    },
  },
  {
    partido_sigla: "PSOL",
    eixo_economico: 2,
    eixo_social: 2,
    fonte_economico: {
      tipo: "programa",
      url: "https://psol50.org.br/partido/programa/",
      data: "2025-11-07",
      trecho: "Por isso, no marco dos 20 anos de legalização do PSOL, nos propusemos a um amplo processo de debates, estimulando a reflexão sobre nosso programa e es",
    },
    fonte_social: {
      tipo: "programa",
      url: "https://psol50.org.br/partido/programa/",
      data: "2025-11-07",
      trecho: "o acesso a métodos contraceptivos, educação sexual e campanhas públicas de conscientização, a humanização do atendimento pré-natal e do parto, para pô",
    },
  },
  {
    partido_sigla: "PT",
    eixo_economico: 3,
    eixo_social: 3,
    fonte_economico: {
      tipo: "carta_de_principios",
      url: "https://pt.org.br/carta-de-principios-do-partido-dos-trabalhadores/",
      data: "1979-05-01",
      trecho: "O PT afirma seu compromisso com a democracia plena, exercida diretamente pelas massas, pois não há socialismo sem democracia nem democracia sem social",
    },
    fonte_social: { tipo: "curadoria" },
  },
  {
    partido_sigla: "PCdoB",
    eixo_economico: 2,
    eixo_social: 3,
    fonte_economico: {
      tipo: "programa",
      url: "https://pcdob.org.br/programa/",
      data: "2022-08-19",
      trecho: "O objetivo essencial deste Programa é a transição do capitalismo ao socialismo nas condições do Brasil e do mundo contemporâneo. O socialismo tem como",
    },
    fonte_social: {
      tipo: "programa",
      url: "https://pcdob.org.br/programa/",
      data: "2022-08-19",
      trecho: "Luta prioritária contra o racismo e por políticas de promoção da igualdade social para os negros; proteção, harmonização, efetivação e garantia dos di",
    },
  },
  {
    partido_sigla: "PDT",
    eixo_economico: 3,
    eixo_social: 4,
    fonte_economico: { tipo: "curadoria" },
    fonte_social: { tipo: "curadoria" },
  },
  {
    partido_sigla: "PSB",
    eixo_economico: 5,
    eixo_social: 3,
    fonte_economico: {
      tipo: "programa",
      url: "https://www.autorreformapsb.com.br/wp-content/uploads/2022/07/Manifesto_e_Programa_do_PSB.pdf",
      data: "2022-07-01",
      trecho: "Nele, compreende-se que Estado e mercado não são entes opostos, mas complementares, como já assim se configuram em países predominantemente socialista",
    },
    fonte_social: {
      tipo: "programa",
      url: "https://www.autorreformapsb.com.br/wp-content/uploads/2022/07/Manifesto_e_Programa_do_PSB.pdf",
      data: "2022-07-01",
      trecho: "O PSB defende a igualdade de gênero nas relações sociais e paridade na representação política, bem como o efetivo enfrentamento a todas as formas de v",
    },
  },
  {
    partido_sigla: "PV",
    eixo_economico: 5,
    eixo_social: 3,
    fonte_economico: {
      tipo: "programa",
      url: "https://pv.org.br/wp-content/uploads/2016/06/programa_web.pdf",
      data: "2016-06-01",
      trecho: "O PV defende o papel do poder público no combate à miséria absoluta e na proteção dos mais desfavorecidos que não podem ser abandonados ao espontaneís",
    },
    fonte_social: {
      tipo: "programa",
      url: "https://pv.org.br/wp-content/uploads/2016/06/programa_web.pdf",
      data: "2016-06-01",
      trecho: "Uma política de reprodução humana deve levar em conta a necessidade de estabelecer um sistema efetivo e democrático de acesso às práticas e técnicas d",
    },
  },
  {
    partido_sigla: "CIDADANIA",
    eixo_economico: 5,
    eixo_social: 4,
    fonte_economico: { tipo: "curadoria" },
    fonte_social: { tipo: "curadoria" },
  },
  {
    partido_sigla: "PSD",
    eixo_economico: 6,
    eixo_social: 5,
    fonte_economico: {
      tipo: "carta_de_principios",
      url: "https://psd.org.br/principios-e-valores/",
      data: "2011-09-28",
      trecho: "Defendemos a iniciativa e a propriedade privadas, a economia de mercado como o regime capaz de gerar riqueza e desenvolvimento, sem os quais não se er",
    },
    fonte_social: { tipo: "curadoria" },
  },
  {
    partido_sigla: "MDB",
    eixo_economico: 5,
    eixo_social: 5,
    fonte_economico: { tipo: "curadoria" },
    fonte_social: { tipo: "curadoria" },
  },
  {
    partido_sigla: "PSDB",
    eixo_economico: 6,
    eixo_social: 4,
    fonte_economico: { tipo: "curadoria" },
    fonte_social: { tipo: "curadoria" },
  },
  {
    partido_sigla: "PODE",
    eixo_economico: 6,
    eixo_social: 5,
    fonte_economico: { tipo: "curadoria" },
    fonte_social: { tipo: "curadoria" },
  },
  {
    partido_sigla: "UNIÃO",
    eixo_economico: 7,
    eixo_social: 5,
    fonte_economico: {
      tipo: "manifesto",
      url: "https://uniaobrasil.org.br/wp-content/uploads/2024/08/BOOK-148x210mm-Manifesto_Uniao_BRASIL.pdf",
      data: "2024-08-01",
      trecho: "O Estado gasta muito e gasta mal. Somos a favor de privatizações, da eficiência do gasto e da diminuição da carga de impostos. O Estado não é capaz de",
    },
    fonte_social: {
      tipo: "manifesto",
      url: "https://uniaobrasil.org.br/wp-content/uploads/2024/08/BOOK-148x210mm-Manifesto_Uniao_BRASIL.pdf",
      data: "2024-08-01",
      trecho: "Apoio à família brasileira, considerando que a família é a base da sociedade e o primeiro elo de conexão social do indivíduo.",
    },
  },
  {
    partido_sigla: "MOBILIZA",
    eixo_economico: 6,
    eixo_social: 6,
    fonte_economico: { tipo: "curadoria" },
    fonte_social: { tipo: "curadoria" },
    notas: "DADOS 2023 (survey 2018, predecessor PMN) + espectro-partidos.json onda-p 14/08",
  },
  {
    partido_sigla: "DEMOCRATA",
    eixo_economico: 6,
    eixo_social: 6,
    fonte_economico: { tipo: "curadoria" },
    fonte_social: { tipo: "curadoria" },
    notas: "DADOS 2023 (survey 2018, predecessor PMB) + espectro-partidos.json onda-p 14/08",
  },
  {
    partido_sigla: "PP",
    eixo_economico: 7,
    eixo_social: 6,
    fonte_economico: {
      tipo: "programa",
      url: "https://progressistas.org.br/programa-partidario/",
      data: "2020-12-24",
      trecho: "IV - consecução de um sistema econômico livre, que favoreça a prática das regras de mercado, mas que tenha como objetivo maior o bem-estar dos brasile",
    },
    fonte_social: { tipo: "curadoria" },
  },
  {
    partido_sigla: "AVANTE",
    eixo_economico: 6,
    eixo_social: 6,
    fonte_economico: { tipo: "curadoria" },
    fonte_social: { tipo: "curadoria" },
  },
  {
    partido_sigla: "REPUBLICANOS",
    eixo_economico: 8,
    eixo_social: 8,
    fonte_economico: {
      tipo: "programa",
      url: "https://republicanos10.org.br/wp-content/uploads/2021/05/manifesto-politico-e-programa-do-republicanos-versao-final-2019.pdf",
      data: "2019-01-01",
      trecho: "Acreditamos no domínio da propriedade privada como forma de estabilidade social, pelo senso de responsabilidade, e incentivo ao crescimento produtivo.",
    },
    fonte_social: {
      tipo: "programa",
      url: "https://republicanos10.org.br/wp-content/uploads/2021/05/manifesto-politico-e-programa-do-republicanos-versao-final-2019.pdf",
      data: "2019-01-01",
      trecho: "Nós, os Republicanos, somos um movimento político conservador, fundamentado nos valores cristãos, tendo a família como alicerce da sociedade, preserva",
    },
  },
  {
    partido_sigla: "PL",
    eixo_economico: 8,
    eixo_social: 8,
    fonte_economico: {
      tipo: "programa",
      url: "https://partidoliberal.org.br/wp-content/uploads/2023/02/programa_do_pl.pdf",
      data: "2023-02-01",
      trecho: "O Partido Liberal entende que é essencial retirar o peso do Estado dos ombros da população. Permitir que o cidadão possa desenvolver sua capacidade em",
    },
    fonte_social: {
      tipo: "programa",
      url: "https://partidoliberal.org.br/wp-content/uploads/2023/02/programa_do_pl.pdf",
      data: "2023-02-01",
      trecho: "Família - O Partido Liberal entende a família como célula ou base da sociedade, defendendo o seu direito e o fortalecimento dos vínculos familiares e ",
    },
  },
  {
    partido_sigla: "NOVO",
    eixo_economico: 9,
    eixo_social: 5,
    fonte_economico: { tipo: "curadoria" },
    fonte_social: { tipo: "curadoria" },
  },
  {
    partido_sigla: "DC",
    eixo_economico: 6,
    eixo_social: 8,
    fonte_economico: {
      tipo: "programa",
      url: "https://www.democraciacrista.org.br/sobre-nos/programa/",
      data: "2018-05-17",
      trecho: "Repudia assim, o capitalismo selvagem que não realiza a Justiça e o marxismo que esmaga a Liberdade e proclama como sua doutrina, a Democracia Cristã,",
    },
    fonte_social: {
      tipo: "programa",
      url: "https://www.democraciacrista.org.br/sobre-nos/programa/",
      data: "2018-05-17",
      trecho: "Garantir à família, mecanismos eficazes de proteção contra a pornografia e a violência nos meios de comunicação. Assegurar à família o direito à liber",
    },
  },
  {
    partido_sigla: "AGIR",
    eixo_economico: 7,
    eixo_social: 8,
    fonte_economico: { tipo: "curadoria" },
    fonte_social: { tipo: "curadoria" },
    notas: "DADOS 2023 (survey 2018, predecessor PTC) + espectro-partidos.json onda-p 14/08",
  },
  {
    partido_sigla: "PRD",
    eixo_economico: 7,
    eixo_social: 8,
    fonte_economico: { tipo: "curadoria" },
    fonte_social: { tipo: "curadoria" },
    notas: "DADOS 2023 (survey 2018, predecessors PTB/Patriota) + espectro-partidos.json onda-p 14/08",
  },
  {
    partido_sigla: "PRTB",
    eixo_economico: 7,
    eixo_social: 8,
    fonte_economico: { tipo: "curadoria" },
    fonte_social: { tipo: "curadoria" },
  },
  {
    partido_sigla: "MISSÃO",
    eixo_economico: 5,
    eixo_social: 8,
    fonte_economico: { tipo: "curadoria" },
    fonte_social: { tipo: "curadoria" },
  },
  {
    partido_sigla: "SOLIDARIEDADE",
    eixo_economico: 5,
    eixo_social: 2,
    fonte_economico: {
      tipo: "programa",
      url: "https://solidariedade.org.br/media/2021/06/programa-partidario_paginas-duplas_web.pdf",
      data: "2021-06-01",
      trecho: "Defende a parceria público-privada em setores de interesse público que demandam grandes investimentos. Defende e reconhece o papel do agronegócio na e",
    },
    fonte_social: {
      tipo: "programa",
      url: "https://solidariedade.org.br/media/2021/06/programa-partidario_paginas-duplas_web.pdf",
      data: "2021-06-01",
      trecho: "Gênero e orientação sexual foram historicamente motivos de perseguição e marginalização em muitas sociedades do mundo. Com a humanidade caminhando rum",
    },
  },
]

const MAP = new Map<string, EspectroPartidario>()
for (const row of ESPECTRO_PARTIDARIO) {
  MAP.set(normalizePartySigla(row.partido_sigla), row)
}

export function getEspectroPartidario(sigla: string | null | undefined): EspectroPartidario | null {
  const key = normalizePartySigla(resolveCanonicalPartySigla(sigla) ?? sigla)
  return MAP.get(key) ?? null
}

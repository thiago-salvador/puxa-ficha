export const serviceLine = "Dados de candidaturas, fontes e limites de cobertura em um lugar para começar a apuração."

export const pressTexts = [
  {
    label: "50 palavras",
    text: "O Puxa Ficha reúne informações sobre candidaturas em uma interface de consulta. A Sala de imprensa oferece filtros, fichas, fontes e arquivos para download. Cada dado traz seu estado de cobertura. A plataforma não recomenda voto. Antes de publicar, confira os dados na fonte original e considere as lacunas indicadas.",
  },
  {
    label: "100 palavras",
    text: "O Puxa Ficha organiza informações sobre candidaturas para a consulta e a conferência das fontes. A Sala de imprensa oferece fichas, filtros, arquivos para download e estados de cobertura para cada grupo de dados. Há registros publicados, casos sem dado, fontes indisponíveis e buscas com resultado vazio confirmado; essas situações têm significados diferentes. Um processo listado não equivale a condenação, e a ausência de informação não deve ser apresentada como zero. A plataforma não recomenda voto. Os recortes podem ajudar a formular perguntas e localizar documentos, mas não substituem a apuração. Confira os dados na fonte original antes de publicar.",
  },
  {
    label: "250 palavras",
    text: "O Puxa Ficha reúne informações sobre candidaturas. A Sala de imprensa concentra caminhos para encontrar fichas, aplicar filtros, baixar recortes e localizar as fontes associadas aos dados. O material foi pensado como ponto de partida para apuração: cada número depende de um recorte, de uma data e do estado da cobertura. A plataforma não recomenda voto nem transforma um registro isolado em conclusão sobre uma pessoa.\n\nA Mesa de apuração permite consultar candidaturas por cargo e unidade da federação. Os arquivos para download preservam estados distintos para informação publicada, resultado vazio após busca, dado ausente, fonte indisponível e cobertura parcial. Esses estados não devem ser somados como se fossem equivalentes. Quando um vínculo de chapa estiver em revisão, o nome do vice não é publicado. Com o Senado habilitado, suplentes aparecem em campo separado.\n\nOs registros de processos exigem cuidado adicional. A presença de um processo não equivale a condenação, e os detalhes precisam ser conferidos no documento oficial. O mesmo vale para alterações observadas em dados de candidatura: o recorte mostra o que foi registrado e a fonte, sem explicar por si só o motivo da mudança.\n\nA Sala indica caminhos para correção e para consultar a metodologia e as informações sobre o projeto. Se um dado não estiver disponível, o material deve dizer isso de forma explícita. Use as fichas, os estados e os arquivos para formular perguntas verificáveis. Antes de publicar qualquer informação, confira o dado na fonte original e registre o recorte e a data consultados.",
  },
] as const

export const questions = [
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
    answer: "Na Mesa, confira os filtros e os estados de cada linha. O JSON e o CSV da Sala permitem baixar o recorte. Consulte também a data de geração e a fonte indicada para o dado que pretende usar.",
  },
  {
    question: "Quem financia o projeto?",
    answer: "As informações publicadas pelo projeto sobre financiamento e apoiadores estão na página Sobre. Confira ali a descrição e a data de conferência antes de citar valores ou nomes.",
  },
  {
    question: "Existe uma perspectiva editorial?",
    answer: "A página Sobre descreve a perspectiva editorial do projeto. Para avaliar uma informação específica, examine a fonte, o método e o estado da cobertura apresentados junto do dado.",
  },
  {
    question: "Há uso de inteligência artificial?",
    answer: "Este kit não afirma como cada etapa da coleta foi executada. Para uma alegação sobre o método, consulte a documentação e peça esclarecimento pelo canal de contato. A conferência na fonte original continua necessária.",
  },
  {
    question: "Como comunicar um erro?",
    answer: "Envie o link da ficha, o trecho contestado e a fonte que permite conferir a correção para contato@puxaficha.com.br. Não publique um dado em disputa sem checar o documento original.",
  },
  {
    question: "Como são tratados dados pessoais?",
    answer: "As fichas e os exports devem ser usados dentro do recorte publicado. Não acrescente identificadores pessoais nem deduza dados ausentes. Consulte a política de privacidade do site para informações sobre o tratamento de dados.",
  },
  {
    question: "O que significa cobertura incompleta?",
    answer: "Significa que o material disponível não sustenta uma conclusão para todo o recorte. Estados como sem dado, fonte indisponível e cobertura parcial não equivalem a uma busca com vazio confirmado.",
  },
  {
    question: "Um processo significa condenação?",
    answer: "Não. O registro de um processo indica uma ocorrência dentro do escopo informado. Leia a fonte oficial, a situação e as limitações antes de descrevê-lo em uma matéria.",
  },
] as const

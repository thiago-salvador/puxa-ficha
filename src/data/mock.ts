import type {
  Candidato,
  Patrimonio,
  Processo,
  HistoricoPolitico,
  MudancaPartido,
  Financiamento,
  VotoCandidato,
  PontoAtencao,
  ProjetoLei,
  GastoParlamentar,
} from "@/lib/types"

export const MOCK_CANDIDATOS: Candidato[] = [
  {
    id: "1",
    nome_completo: "Luiz Inacio Lula da Silva",
    nome_urna: "Lula",
    slug: "lula",
    data_nascimento: "1945-10-27",
    idade: 80,
    naturalidade: "Garanhuns/PE",
    formacao: "Ensino fundamental incompleto",
    profissao_declarada: "Metalurgico",
    partido_atual: "Partido dos Trabalhadores",
    partido_sigla: "PT",
    cargo_atual: "Presidente da Republica",
    cargo_disputado: "Presidente",
    estado: null,
    status: "pre-candidato",
    biografia: "Presidente do Brasil em tres mandatos (2003-2010 e 2023-presente). Lider sindical, fundador do PT. Condenado e preso na Lava Jato, teve as condenacoes anuladas pelo STF em 2021 por incompetencia da vara de Curitiba.",
    foto_url: null,
    site_campanha: "https://lula.com.br",
    redes_sociais: { instagram: "lulaoficial", twitter: "LulaOficial", youtube: "CanalLula", facebook: "Lula" },
    fonte_dados: ["TSE", "curadoria"],
    ultima_atualizacao: "2026-03-29",
  },
  {
    id: "2",
    nome_completo: "Flavio Nantes Bolsonaro",
    nome_urna: "Flavio Bolsonaro",
    slug: "flavio-bolsonaro",
    data_nascimento: "1981-04-27",
    idade: 44,
    naturalidade: "Rio de Janeiro/RJ",
    formacao: "Direito",
    profissao_declarada: "Advogado",
    partido_atual: "Partido Liberal",
    partido_sigla: "PL",
    cargo_atual: "Senador",
    cargo_disputado: "Presidente",
    estado: null,
    status: "pre-candidato",
    biografia: "Senador pelo Rio de Janeiro, filho mais velho de Jair Bolsonaro. Foi deputado estadual no RJ por 4 mandatos. Investigado no caso das rachadinhas.",
    foto_url: null,
    site_campanha: null,
    redes_sociais: { instagram: "flaviobolsonaro", twitter: "FlavioBolsonaro" },
    fonte_dados: ["TSE", "Senado"],
    ultima_atualizacao: "2026-03-29",
  },
  {
    id: "3",
    nome_completo: "Tarcisio Gomes de Freitas",
    nome_urna: "Tarcisio de Freitas",
    slug: "tarcisio",
    data_nascimento: "1975-01-07",
    idade: 51,
    naturalidade: "Rio de Janeiro/RJ",
    formacao: "Engenharia",
    profissao_declarada: "Engenheiro",
    partido_atual: "Republicanos",
    partido_sigla: "REPUBLICANOS",
    cargo_atual: "Governador de SP",
    cargo_disputado: "Presidente",
    estado: null,
    status: "pre-candidato",
    biografia: "Governador de Sao Paulo desde 2023. Ex-ministro da Infraestrutura no governo Bolsonaro. Engenheiro militar de formacao.",
    foto_url: null,
    site_campanha: null,
    redes_sociais: { instagram: "tabordefreitas" },
    fonte_dados: ["TSE"],
    ultima_atualizacao: "2026-03-29",
  },
  {
    id: "4",
    nome_completo: "Ciro Ferreira Gomes",
    nome_urna: "Ciro Gomes",
    slug: "ciro-gomes",
    data_nascimento: "1957-11-06",
    idade: 68,
    naturalidade: "Pindamonhangaba/SP",
    formacao: "Direito",
    profissao_declarada: "Advogado",
    partido_atual: "Partido Democratico Trabalhista",
    partido_sigla: "PDT",
    cargo_atual: null,
    cargo_disputado: "Presidente",
    estado: null,
    status: "pre-candidato",
    biografia: "Quatro vezes candidato a presidente. Foi governador do Ceara, ministro da Fazenda e da Integracao Nacional. Defensor do projeto nacional-desenvolvimentista.",
    foto_url: null,
    site_campanha: null,
    redes_sociais: { instagram: "ciaborges", twitter: "ciaborges" },
    fonte_dados: ["TSE", "Camara"],
    ultima_atualizacao: "2026-03-29",
  },
  {
    id: "5",
    nome_completo: "Ronaldo Ramos Caiado",
    nome_urna: "Ronaldo Caiado",
    slug: "ronaldo-caiado",
    data_nascimento: "1949-12-25",
    idade: 76,
    naturalidade: "Goiania/GO",
    formacao: "Medicina",
    profissao_declarada: "Medico",
    partido_atual: "Uniao Brasil",
    partido_sigla: "UNIAO",
    cargo_atual: "Governador de GO",
    cargo_disputado: "Presidente",
    estado: null,
    status: "pre-candidato",
    biografia: "Governador de Goias desde 2019. Medico, foi senador por tres mandatos e deputado federal. Lider historico da bancada ruralista.",
    foto_url: null,
    site_campanha: null,
    redes_sociais: { instagram: "ronaldocaiado" },
    fonte_dados: ["TSE", "Camara", "Senado"],
    ultima_atualizacao: "2026-03-29",
  },
  {
    id: "6",
    nome_completo: "Carlos Lupi",
    nome_urna: "Ratinho Junior",
    slug: "ratinho-junior",
    data_nascimento: "1981-02-12",
    idade: 45,
    naturalidade: "Jandaia do Sul/PR",
    formacao: "Jornalismo",
    profissao_declarada: "Jornalista",
    partido_atual: "Partido Social Democratico",
    partido_sigla: "PSD",
    cargo_atual: "Governador do PR",
    cargo_disputado: "Presidente",
    estado: null,
    status: "pre-candidato",
    foto_url: null,
    site_campanha: null,
    redes_sociais: {},
    fonte_dados: ["TSE"],
    ultima_atualizacao: "2026-03-29",
  },
  {
    id: "7",
    nome_completo: "Romeu Zema Neto",
    nome_urna: "Romeu Zema",
    slug: "romeu-zema",
    data_nascimento: "1964-10-15",
    idade: 61,
    naturalidade: "Araguari/MG",
    formacao: "Administracao",
    profissao_declarada: "Empresario",
    partido_atual: "Partido Novo",
    partido_sigla: "NOVO",
    cargo_atual: "Governador de MG",
    cargo_disputado: "Presidente",
    estado: null,
    status: "pre-candidato",
    foto_url: null,
    site_campanha: null,
    redes_sociais: { instagram: "romeuzema" },
    fonte_dados: ["TSE"],
    ultima_atualizacao: "2026-03-29",
  },
]

// --- PATRIMONIO ---
export const MOCK_PATRIMONIO: Record<string, Patrimonio[]> = {
  lula: [
    {
      id: "p1", candidato_id: "1", ano_eleicao: 2022, valor_total: 7436049,
      bens: [
        { tipo: "Imovel", descricao: "Apartamento em Sao Bernardo do Campo", valor: 1200000 },
        { tipo: "Veiculo", descricao: "Toyota Corolla 2020", valor: 150000 },
        { tipo: "Aplicacao financeira", descricao: "Previdencia privada", valor: 3500000 },
        { tipo: "Aplicacao financeira", descricao: "CDB e fundos", valor: 2586049 },
      ],
    },
    { id: "p2", candidato_id: "1", ano_eleicao: 2018, valor_total: 7986422, bens: [] },
    { id: "p2b", candidato_id: "1", ano_eleicao: 2006, valor_total: 952032, bens: [] },
    { id: "p2c", candidato_id: "1", ano_eleicao: 2002, valor_total: 422973, bens: [] },
  ],
  "flavio-bolsonaro": [
    {
      id: "p3", candidato_id: "2", ano_eleicao: 2022, valor_total: 4316507,
      bens: [
        { tipo: "Imovel", descricao: "Mansao em Brasilia", valor: 3200000 },
        { tipo: "Imovel", descricao: "Apartamento Copacabana", valor: 850000 },
        { tipo: "Veiculo", descricao: "Range Rover 2021", valor: 266507 },
      ],
    },
    { id: "p4", candidato_id: "2", ano_eleicao: 2018, valor_total: 1686779, bens: [] },
  ],
  tarcisio: [
    { id: "p5", candidato_id: "3", ano_eleicao: 2022, valor_total: 1892340, bens: [] },
  ],
  "ciro-gomes": [
    { id: "p6", candidato_id: "4", ano_eleicao: 2022, valor_total: 2450000, bens: [] },
    { id: "p7", candidato_id: "4", ano_eleicao: 2018, valor_total: 1800000, bens: [] },
  ],
}

// --- PROCESSOS ---
export const MOCK_PROCESSOS: Record<string, Processo[]> = {
  "flavio-bolsonaro": [
    {
      id: "proc1", candidato_id: "2", tipo: "criminal", tribunal: "TJ-RJ",
      numero_processo: "0217985-47.2020.8.19.0001",
      descricao: "Organizacao criminosa e lavagem de dinheiro no caso das rachadinhas na ALERJ",
      status: "em_andamento", data_inicio: "2020-11-04", data_decisao: null, gravidade: "alta",
    },
    {
      id: "proc2", candidato_id: "2", tipo: "civil", tribunal: "TJ-RJ",
      numero_processo: null,
      descricao: "Acao de improbidade administrativa por enriquecimento ilicito",
      status: "em_andamento", data_inicio: "2021-03-15", data_decisao: null, gravidade: "media",
    },
  ],
  lula: [
    {
      id: "proc3", candidato_id: "1", tipo: "criminal", tribunal: "STF",
      numero_processo: null,
      descricao: "Condenacoes da Lava Jato anuladas pelo STF em 2021 por incompetencia territorial",
      status: "absolvido", data_inicio: "2017-07-12", data_decisao: "2021-03-08", gravidade: "alta",
    },
  ],
  "ciro-gomes": [
    {
      id: "proc4", candidato_id: "4", tipo: "eleitoral", tribunal: "TRE-CE",
      numero_processo: null,
      descricao: "Representacao por propaganda eleitoral antecipada em 2022",
      status: "absolvido", data_inicio: "2022-06-10", data_decisao: "2022-08-15", gravidade: "baixa",
    },
  ],
}

// --- HISTORICO POLITICO ---
export const MOCK_HISTORICO: Record<string, HistoricoPolitico[]> = {
  lula: [
    { id: "h1", candidato_id: "1", cargo: "Presidente da Republica", periodo_inicio: 2023, periodo_fim: null, partido: "PT", estado: "", eleito_por: "Voto popular", observacoes: "3o mandato" },
    { id: "h2", candidato_id: "1", cargo: "Presidente da Republica", periodo_inicio: 2007, periodo_fim: 2010, partido: "PT", estado: "", eleito_por: "Reeleicao", observacoes: null },
    { id: "h3", candidato_id: "1", cargo: "Presidente da Republica", periodo_inicio: 2003, periodo_fim: 2006, partido: "PT", estado: "", eleito_por: "Voto popular", observacoes: null },
  ],
  "flavio-bolsonaro": [
    { id: "h4", candidato_id: "2", cargo: "Senador", periodo_inicio: 2019, periodo_fim: null, partido: "PL", estado: "RJ", eleito_por: "Voto popular", observacoes: null },
    { id: "h5", candidato_id: "2", cargo: "Deputado Estadual", periodo_inicio: 2003, periodo_fim: 2018, partido: "PSC/PL", estado: "RJ", eleito_por: "Voto popular", observacoes: "4 mandatos consecutivos" },
  ],
  tarcisio: [
    { id: "h6", candidato_id: "3", cargo: "Governador de SP", periodo_inicio: 2023, periodo_fim: null, partido: "Republicanos", estado: "SP", eleito_por: "Voto popular", observacoes: null },
    { id: "h7", candidato_id: "3", cargo: "Ministro da Infraestrutura", periodo_inicio: 2019, periodo_fim: 2022, partido: "sem partido", estado: "", eleito_por: "Nomeacao", observacoes: "Governo Bolsonaro" },
  ],
  "ciro-gomes": [
    { id: "h8", candidato_id: "4", cargo: "Governador do Ceara", periodo_inicio: 1991, periodo_fim: 1994, partido: "PSDB", estado: "CE", eleito_por: "Voto popular", observacoes: null },
    { id: "h9", candidato_id: "4", cargo: "Ministro da Fazenda", periodo_inicio: 1994, periodo_fim: 1994, partido: "PSDB", estado: "", eleito_por: "Nomeacao", observacoes: "Governo Itamar" },
    { id: "h10", candidato_id: "4", cargo: "Ministro da Integracao Nacional", periodo_inicio: 2003, periodo_fim: 2006, partido: "PPS", estado: "", eleito_por: "Nomeacao", observacoes: "Governo Lula 1" },
  ],
  "ronaldo-caiado": [
    { id: "h11", candidato_id: "5", cargo: "Governador de GO", periodo_inicio: 2019, periodo_fim: null, partido: "Uniao Brasil", estado: "GO", eleito_por: "Voto popular", observacoes: "Reeleito em 2022" },
    { id: "h12", candidato_id: "5", cargo: "Senador", periodo_inicio: 2003, periodo_fim: 2018, partido: "DEM", estado: "GO", eleito_por: "Voto popular", observacoes: "2 mandatos" },
    { id: "h13", candidato_id: "5", cargo: "Deputado Federal", periodo_inicio: 1999, periodo_fim: 2002, partido: "PFL", estado: "GO", eleito_por: "Voto popular", observacoes: null },
  ],
}

// --- MUDANCAS DE PARTIDO ---
export const MOCK_MUDANCAS: Record<string, MudancaPartido[]> = {
  "ciro-gomes": [
    { id: "m1", candidato_id: "4", partido_anterior: "PMDB", partido_novo: "PSDB", data_mudanca: null, ano: 1990, contexto: "Saiu do PMDB para disputar o governo do Ceara" },
    { id: "m2", candidato_id: "4", partido_anterior: "PSDB", partido_novo: "PPS", data_mudanca: null, ano: 2001, contexto: "Rompeu com FHC" },
    { id: "m3", candidato_id: "4", partido_anterior: "PPS", partido_novo: "PROS", data_mudanca: null, ano: 2013, contexto: null },
    { id: "m4", candidato_id: "4", partido_anterior: "PROS", partido_novo: "PDT", data_mudanca: null, ano: 2015, contexto: "Alianca com Brizola para projeto nacional" },
  ],
  "flavio-bolsonaro": [
    { id: "m5", candidato_id: "2", partido_anterior: "PPB", partido_novo: "PSC", data_mudanca: null, ano: 2005, contexto: null },
    { id: "m6", candidato_id: "2", partido_anterior: "PSC", partido_novo: "PSL", data_mudanca: null, ano: 2018, contexto: "Migrou com a familia Bolsonaro para campanha presidencial" },
    { id: "m7", candidato_id: "2", partido_anterior: "PSL", partido_novo: "PL", data_mudanca: null, ano: 2021, contexto: "PSL se fundiu com DEM formando o Uniao Brasil; Bolsonaros migraram para PL" },
  ],
  "ronaldo-caiado": [
    { id: "m8", candidato_id: "5", partido_anterior: "PFL", partido_novo: "DEM", data_mudanca: null, ano: 2007, contexto: "Refundacao do PFL como DEM" },
    { id: "m9", candidato_id: "5", partido_anterior: "DEM", partido_novo: "Uniao Brasil", data_mudanca: null, ano: 2022, contexto: "Fusao DEM + PSL" },
  ],
}

// --- FINANCIAMENTO ---
export const MOCK_FINANCIAMENTO: Record<string, Financiamento[]> = {
  lula: [
    {
      id: "f1", candidato_id: "1", ano_eleicao: 2022, total_arrecadado: 109742510,
      total_fundo_partidario: 15000000, total_fundo_eleitoral: 84742510,
      total_pessoa_fisica: 10000000, total_recursos_proprios: 0,
      maiores_doadores: [
        { nome: "Fundo Eleitoral PT", valor: 84742510, tipo: "fundo_eleitoral" },
        { nome: "Fundo Partidario PT", valor: 15000000, tipo: "fundo_partidario" },
      ],
    },
  ],
  "flavio-bolsonaro": [
    {
      id: "f2", candidato_id: "2", ano_eleicao: 2018, total_arrecadado: 3200000,
      total_fundo_partidario: 800000, total_fundo_eleitoral: 1600000,
      total_pessoa_fisica: 800000, total_recursos_proprios: 0,
      maiores_doadores: [
        { nome: "Fundo Eleitoral PSL", valor: 1600000, tipo: "fundo_eleitoral" },
      ],
    },
  ],
}

// --- VOTACOES ---
export const MOCK_VOTOS: Record<string, VotoCandidato[]> = {
  "flavio-bolsonaro": [
    {
      id: "v1", candidato_id: "2", votacao_id: "vt1", voto: "não",
      contradicao: true, contradicao_descricao: "Votou contra mesmo tendo defendido publicamente a medida",
      votacao: {
        id: "vt1", titulo: "Reforma Tributaria (PEC 45/2019)",
        descricao: "Reforma do sistema tributario nacional",
        data_votacao: "2023-11-08", casa: "Senado", tema: "Economia",
        impacto_popular: "Alto impacto na carga tributaria de consumo",
      },
    },
    {
      id: "v2", candidato_id: "2", votacao_id: "vt2", voto: "sim",
      contradicao: false, contradicao_descricao: null,
      votacao: {
        id: "vt2", titulo: "Marco Temporal Terras Indigenas",
        descricao: "Tese que limita demarcacao de terras indigenas",
        data_votacao: "2023-09-27", casa: "Senado", tema: "Meio Ambiente",
        impacto_popular: "Afeta diretamente comunidades indigenas e politica ambiental",
      },
    },
    {
      id: "v3", candidato_id: "2", votacao_id: "vt3", voto: "sim",
      contradicao: false, contradicao_descricao: null,
      votacao: {
        id: "vt3", titulo: "Autonomia do Banco Central",
        descricao: "Mandato fixo para presidente do BC",
        data_votacao: "2021-02-04", casa: "Senado", tema: "Economia",
        impacto_popular: "Define independencia da politica monetaria do governo",
      },
    },
  ],
  "ronaldo-caiado": [
    {
      id: "v4", candidato_id: "5", votacao_id: "vt4", voto: "sim",
      contradicao: true, contradicao_descricao: "Lider ruralista votou a favor de restricao ambiental por pressao da base",
      votacao: {
        id: "vt4", titulo: "Codigo Florestal (2012)",
        descricao: "Novo codigo florestal brasileiro",
        data_votacao: "2012-05-25", casa: "Senado", tema: "Meio Ambiente",
        impacto_popular: "Define regras de preservacao em propriedades rurais",
      },
    },
  ],
}

// --- PONTOS DE ATENCAO ---
export const MOCK_PONTOS: Record<string, PontoAtencao[]> = {
  "flavio-bolsonaro": [
    {
      id: "pa1", candidato_id: "2", categoria: "corrupção",
      titulo: "Caso das rachadinhas na ALERJ",
      descricao: "Investigado por organizacao criminosa e lavagem de dinheiro envolvendo desvio de salarios de assessores parlamentares durante seu mandato como deputado estadual.",
      fontes: [{ titulo: "MP-RJ denuncia Flavio", url: "https://example.com", data: "2020-11-04" }],
      gravidade: "critica", verificado: true, gerado_por: "curadoria",
    },
    {
      id: "pa2", candidato_id: "2", categoria: "patrimonio_incompativel",
      titulo: "Crescimento patrimonial de 156% em 4 anos",
      descricao: "Patrimonio declarado saltou de R$ 1,6M em 2018 para R$ 4,3M em 2022, aumento incompativel com rendimentos declarados de senador.",
      fontes: [{ titulo: "TSE - declaracao de bens", url: "https://example.com", data: "2022-08-15" }],
      gravidade: "alta", verificado: true, gerado_por: "curadoria",
    },
  ],
  lula: [
    {
      id: "pa3", candidato_id: "1", categoria: "processo_grave",
      titulo: "Historico de condenacoes anuladas",
      descricao: "Condenado na Lava Jato em 3 instancias. Condenacoes anuladas pelo STF em 2021 por incompetencia territorial da vara de Curitiba, nao por inocencia.",
      fontes: [{ titulo: "STF anula condenacoes", url: "https://example.com", data: "2021-03-08" }],
      gravidade: "alta", verificado: true, gerado_por: "curadoria",
    },
    {
      id: "pa4", candidato_id: "1", categoria: "feito_positivo",
      titulo: "Bolsa Familia tirou 28 milhoes da pobreza extrema",
      descricao: "Programa de transferencia de renda criado em 2003, consolidando programas anteriores. Reconhecido internacionalmente como referencia em politica social.",
      fontes: [{ titulo: "Banco Mundial", url: "https://example.com", data: "2013-11-01" }],
      gravidade: "baixa", verificado: true, gerado_por: "curadoria",
    },
  ],
}

// --- PROJETOS DE LEI ---
export const MOCK_PROJETOS: Record<string, ProjetoLei[]> = {
  "flavio-bolsonaro": [
    {
      id: "pl1", candidato_id: "2", tipo: "PL", numero: "879", ano: 2022,
      ementa: "Institui o programa de incentivo a adocao de criancas e adolescentes com deficiencia",
      tema: "Social", situacao: "tramitando", url_inteiro_teor: null,
      destaque: false, destaque_motivo: null, fonte: "Senado",
    },
    {
      id: "pl2", candidato_id: "2", tipo: "PL", numero: "1291", ano: 2021,
      ementa: "Altera o Codigo Penal para aumentar pena de crime contra a honra praticado pela internet",
      tema: "Justica", situacao: "arquivado", url_inteiro_teor: null,
      destaque: false, destaque_motivo: null, fonte: "Senado",
    },
    {
      id: "pl3", candidato_id: "2", tipo: "PEC", numero: "32", ano: 2023,
      ementa: "Propoe reducao do numero de ministerios de 38 para 20",
      tema: "Administracao Publica", situacao: "tramitando", url_inteiro_teor: null,
      destaque: true, destaque_motivo: "Proposta de alto impacto na estrutura do governo federal", fonte: "Senado",
    },
  ],
  "ronaldo-caiado": [
    {
      id: "pl4", candidato_id: "5", tipo: "PL", numero: "4444", ano: 2015,
      ementa: "Regulamenta o uso de agrotoxicos e altera a lei de defensivos agricolas",
      tema: "Agronegocio", situacao: "tramitando", url_inteiro_teor: null,
      destaque: true, destaque_motivo: "Conhecido como 'PL do Veneno', amplia permissao de agrotoxicos", fonte: "Senado",
    },
  ],
}

// --- GASTOS PARLAMENTARES ---
export const MOCK_GASTOS: Record<string, GastoParlamentar[]> = {
  "flavio-bolsonaro": [
    {
      id: "g1", candidato_id: "2", ano: 2024, total_gasto: 892450,
      detalhamento: [
        { categoria: "Passagens aereas", valor: 312000 },
        { categoria: "Divulgacao de atividade", valor: 245000 },
        { categoria: "Alimentacao", valor: 89000 },
        { categoria: "Combustivel", valor: 67000 },
        { categoria: "Servicos postais", valor: 45000 },
        { categoria: "Outros", valor: 134450 },
      ],
      gastos_destaque: [
        { descricao: "18 viagens aereas Rio-Brasilia em janeiro", valor: 54000, categoria: "Passagens aereas" },
      ],
    },
    {
      id: "g2", candidato_id: "2", ano: 2023, total_gasto: 945200,
      detalhamento: [
        { categoria: "Passagens aereas", valor: 340000 },
        { categoria: "Divulgacao de atividade", valor: 280000 },
        { categoria: "Alimentacao", valor: 95000 },
        { categoria: "Combustivel", valor: 72000 },
        { categoria: "Outros", valor: 158200 },
      ],
      gastos_destaque: [],
    },
  ],
  "ronaldo-caiado": [
    {
      id: "g3", candidato_id: "5", ano: 2017, total_gasto: 1120000,
      detalhamento: [
        { categoria: "Passagens aereas", valor: 480000 },
        { categoria: "Divulgacao de atividade", valor: 320000 },
        { categoria: "Alimentacao", valor: 120000 },
        { categoria: "Outros", valor: 200000 },
      ],
      gastos_destaque: [
        { descricao: "Gasto com divulgacao 3x acima da media do Senado", valor: 320000, categoria: "Divulgacao de atividade" },
      ],
    },
  ],
}

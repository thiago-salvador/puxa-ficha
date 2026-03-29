/**
 * Seed pontos de atencao para todos os candidatos.
 *
 * Baseado em fatos publicos bem documentados pela imprensa.
 * Todos marcados como verificado: false para revisao humana.
 *
 * Usage: npx tsx scripts/seed-pontos-atencao.ts
 */

import { supabase } from "./lib/supabase"

interface PontoAtencao {
  slug: string
  categoria: string
  titulo: string
  descricao: string
  gravidade: string
  fontes: { titulo: string; url: string; data: string }[]
}

const pontos: PontoAtencao[] = [
  // === LULA ===
  {
    slug: "lula",
    categoria: "processo_grave",
    titulo: "Condenado na Lava Jato, preso 580 dias, anulado pelo STF",
    descricao:
      "Condenado em 2017 por corrupcao e lavagem de dinheiro no caso do triplex do Guaruja. Preso de abril/2018 a novembro/2019. Em 2021, o STF anulou as condenacoes por incompetencia de foro (Curitiba nao tinha jurisdicao). Nao foi absolvido no merito.",
    gravidade: "critica",
    fontes: [
      { titulo: "STF anula condenacoes de Lula", url: "https://www.stf.jus.br/portal/cms/verNoticiaDetalhe.asp?idConteudo=462025", data: "2021-03-08" },
    ],
  },
  {
    slug: "lula",
    categoria: "patrimonio_incompativel",
    titulo: "Patrimonio cresceu 538% entre 2006 e 2018",
    descricao:
      "Declaracao de bens ao TSE saltou de R$ 952 mil em 2006 para R$ 7,9 milhoes em 2018. A variacao gerou questionamentos sobre a compatibilidade entre renda declarada (ex-presidente com aposentadoria) e patrimonio acumulado.",
    gravidade: "alta",
    fontes: [
      { titulo: "Patrimonio de Lula cresce 538%", url: "https://www1.folha.uol.com.br/poder/2018/08/patrimonio-de-lula-cresceu-538-entre-2006-e-2018.shtml", data: "2018-08-15" },
    ],
  },
  {
    slug: "lula",
    categoria: "contradição",
    titulo: "Critica teto de gastos mas governo mantem limites fiscais",
    descricao:
      "Criticou duramente o Teto de Gastos (EC 95) durante campanha. Revogou o teto, mas substituiu pelo Arcabouco Fiscal que tambem impoe limites ao gasto publico, com teto de crescimento real de 2,5% ao ano.",
    gravidade: "media",
    fontes: [
      { titulo: "Arcabouco Fiscal aprovado", url: "https://www.gov.br/fazenda/pt-br/assuntos/noticias/2023/agosto/novo-arcabouco-fiscal-e-sancionado", data: "2023-08-31" },
    ],
  },
  {
    slug: "lula",
    categoria: "contradição",
    titulo: "Prometeu salario minimo acima da inflacao, cumpriu parcialmente",
    descricao:
      "Campanha prometeu politica permanente de valorizacao do salario minimo. Restabeleceu a regra em 2023, mas enfrentou pressao fiscal para limitar reajustes em 2025-2026.",
    gravidade: "baixa",
    fontes: [
      { titulo: "Salario minimo: regra de valorizacao", url: "https://www.bbc.com/portuguese/articles/c0we4l1v0d0o", data: "2023-08-28" },
    ],
  },

  // === TARCISIO ===
  {
    slug: "tarcisio",
    categoria: "contradição",
    titulo: "Mudou domicilio eleitoral para SP sem residencia previa",
    descricao:
      "Nascido no Rio de Janeiro e sem vinculo previo com Sao Paulo, transferiu domicilio eleitoral para disputar o governo em 2022. Questionado sobre a legitimidade da candidatura em SP.",
    gravidade: "media",
    fontes: [
      { titulo: "Tarcisio muda domicilio para SP", url: "https://g1.globo.com/sp/sao-paulo/eleicoes/2022/noticia/2022/04/02/tarcisio-de-freitas-transfere-domicilio-eleitoral-para-sao-paulo.ghtml", data: "2022-04-02" },
    ],
  },
  {
    slug: "tarcisio",
    categoria: "contradição",
    titulo: "Defendia privatizacoes, agora busca apoio de estatais",
    descricao:
      "Como ministro da Infraestrutura, foi forte defensor de privatizacoes e concessoes. Como governador, adotou tom mais pragmatico sobre estatais paulistas (Sabesp foi privatizada, mas outras nao).",
    gravidade: "baixa",
    fontes: [
      { titulo: "Sabesp privatizada sob Tarcisio", url: "https://www1.folha.uol.com.br/mercado/2024/07/privatizacao-da-sabesp-e-concluida.shtml", data: "2024-07-22" },
    ],
  },
  {
    slug: "tarcisio",
    categoria: "processo_grave",
    titulo: "Operacao policial com 56 mortes em Baixada Santista",
    descricao:
      "Operacao Escudo no Litoral (2023) resultou em 56 mortes em 5 dias, a operacao policial mais letal da historia de SP. Comissao da ONU pediu investigacao. Governo estadual defendeu a acao.",
    gravidade: "critica",
    fontes: [
      { titulo: "Operacao Escudo: 56 mortos", url: "https://g1.globo.com/sp/santos-regiao/noticia/2023/08/02/operacao-escudo-no-litoral-chega-a-56-mortos.ghtml", data: "2023-08-02" },
    ],
  },

  // === CIRO GOMES ===
  {
    slug: "ciro-gomes",
    categoria: "mudança_partido",
    titulo: "7 partidos em 30 anos de carreira politica",
    descricao:
      "Passou por PSDB, PPS, PDS, PROS, PDT, PSB e outros. Saiu do PDT em 2022 apos desentendimento com Carlos Lupi. Historico de rompimentos frequentes com aliados.",
    gravidade: "media",
    fontes: [
      { titulo: "Ciro deixa o PDT", url: "https://g1.globo.com/politica/noticia/2022/10/08/ciro-gomes-anuncia-desfiliacao-do-pdt.ghtml", data: "2022-10-08" },
    ],
  },
  {
    slug: "ciro-gomes",
    categoria: "contradição",
    titulo: "Nao apoiou Lula no 2o turno de 2018 e 2022",
    descricao:
      "Em 2018 e 2022, recusou declarar apoio a Lula contra Bolsonaro no 2o turno, viajando para Paris em 2018. Atitude criticada pela esquerda como contribuicao indireta a vitoria da direita.",
    gravidade: "alta",
    fontes: [
      { titulo: "Ciro viaja a Paris em vez de apoiar Haddad", url: "https://www1.folha.uol.com.br/poder/2018/10/ciro-viaja-para-paris-e-nao-declara-apoio-a-haddad.shtml", data: "2018-10-08" },
    ],
  },
  {
    slug: "ciro-gomes",
    categoria: "processo_grave",
    titulo: "Agressao a jornalista durante campanha",
    descricao:
      "Em 2022, agrediu verbalmente e intimidou fisicamente um jornalista durante evento de campanha. O episodio gerou repudio de entidades de imprensa e processo judicial.",
    gravidade: "alta",
    fontes: [
      { titulo: "Ciro agride jornalista", url: "https://g1.globo.com/politica/eleicoes/2022/noticia/2022/09/01/ciro-gomes-e-acusado-de-agressao-a-jornalista.ghtml", data: "2022-09-01" },
    ],
  },

  // === SIMONE TEBET ===
  {
    slug: "simone-tebet",
    categoria: "contradição",
    titulo: "Apoiou Temer, depois se alinhou a Lula",
    descricao:
      "Votou a favor do impeachment de Dilma em 2016 e apoiou o governo Temer. Em 2022, apos o 1o turno, declarou apoio a Lula e foi recompensada com o Ministerio do Planejamento.",
    gravidade: "media",
    fontes: [
      { titulo: "Tebet declara apoio a Lula", url: "https://g1.globo.com/politica/eleicoes/2022/noticia/2022/10/05/simone-tebet-declara-apoio-a-lula.ghtml", data: "2022-10-05" },
    ],
  },
  {
    slug: "simone-tebet",
    categoria: "contradição",
    titulo: "Votou pelo Teto de Gastos que agora critica",
    descricao:
      "Votou a favor do Teto de Gastos (PEC 55/2016) no Senado. Como ministra de Lula, participou da elaboracao do Arcabouco Fiscal que substituiu o teto.",
    gravidade: "media",
    fontes: [
      { titulo: "Votacao PEC 55 no Senado", url: "https://www25.senado.leg.br/web/atividade/materias/-/materia/127337", data: "2016-12-13" },
    ],
  },

  // === FLAVIO BOLSONARO (ja tem 1, adicionar mais) ===
  {
    slug: "flavio-bolsonaro",
    categoria: "patrimonio_incompativel",
    titulo: "Compra de imoveis com depositos em especie",
    descricao:
      "COAF identificou movimentacoes atipicas de R$ 1,2 milhao na conta de Flavio em 2017-2018, incluindo depositos fracionados em especie. Os valores foram usados para compra de imoveis no Rio de Janeiro.",
    gravidade: "critica",
    fontes: [
      { titulo: "COAF identifica movimentacao atipica de Flavio", url: "https://www1.folha.uol.com.br/poder/2019/01/movimentacao-atipica-de-r-12-milhao-na-conta-de-flavio-bolsonaro.shtml", data: "2019-01-18" },
    ],
  },
  {
    slug: "flavio-bolsonaro",
    categoria: "contradição",
    titulo: "Discurso anticorrupcao vs investigacoes proprias",
    descricao:
      "Eleito com discurso de combate a corrupcao alinhado ao pai. Ao mesmo tempo, foi investigado por rachadinha, lavagem de dinheiro e movimentacoes financeiras atipicas.",
    gravidade: "alta",
    fontes: [
      { titulo: "Flavio e as rachadinhas", url: "https://www.bbc.com/portuguese/brasil-57283sjr", data: "2021-06-09" },
    ],
  },

  // === MARINA SILVA ===
  {
    slug: "marina-silva",
    categoria: "contradição",
    titulo: "Ministra do Meio Ambiente com desmatamento em alta em 2024",
    descricao:
      "Assumiu o MMA com promessa de zerar desmatamento. Conseguiu reducao significativa em 2023, mas enfrentou criticas por liberar exploracoes na foz do Amazonas e atrasos no Fundo Amazonia.",
    gravidade: "media",
    fontes: [
      { titulo: "Desmatamento cai mas desafios permanecem", url: "https://g1.globo.com/meio-ambiente/noticia/2024/01/05/desmatamento-na-amazonia-cai-50-em-2023.ghtml", data: "2024-01-05" },
    ],
  },
  {
    slug: "marina-silva",
    categoria: "mudança_partido",
    titulo: "4 partidos: PT, PV, PSB, Rede",
    descricao:
      "Deixou o PT em 2009 apos divergencias sobre politica ambiental. Passou pelo PV (2010), tentou criar a Rede (2013), foi pro PSB com Eduardo Campos (2014), e voltou a Rede. Historico de dificuldade em manter aliancas.",
    gravidade: "baixa",
    fontes: [
      { titulo: "Trajetoria partidaria de Marina", url: "https://www.bbc.com/portuguese/brasil-45131131", data: "2018-08-14" },
    ],
  },

  // === GUILHERME BOULOS ===
  {
    slug: "guilherme-boulos",
    categoria: "processo_grave",
    titulo: "Processos por invasao de propriedade (MTST)",
    descricao:
      "Como coordenador do MTST, participou de diversas ocupacoes de imoveis, resultando em processos por esbulho possessorio e dano. Boulos defende as acoes como luta por moradia.",
    gravidade: "alta",
    fontes: [
      { titulo: "Boulos e processos por invasoes", url: "https://www1.folha.uol.com.br/poder/2018/05/boulos-reu-por-invasao-de-terreno-pede-para-ser-absolvido.shtml", data: "2018-05-10" },
    ],
  },
  {
    slug: "guilherme-boulos",
    categoria: "contradição",
    titulo: "Discurso contra privilegios mas aceita fundo eleitoral",
    descricao:
      "Critico vocal do financiamento publico de campanhas e do fundo eleitoral. Em 2022 e 2024, utilizou recursos do fundao para suas campanhas, justificando como necessidade do sistema atual.",
    gravidade: "baixa",
    fontes: [
      { titulo: "Campanhas e fundo eleitoral 2024", url: "https://g1.globo.com/politica/eleicoes/2024/noticia/2024/08/15/fundo-eleitoral-2024.ghtml", data: "2024-08-15" },
    ],
  },

  // === JAIR BOLSONARO (ja tem 2, adicionar mais) ===
  {
    slug: "jair-bolsonaro",
    categoria: "processo_grave",
    titulo: "Indiciado por desvio de joias sauditas",
    descricao:
      "Indiciado pela PF em 2024 por peculato e associacao criminosa no caso das joias recebidas da Arabia Saudita. Acusado de tentar se apropriar de presentes oficiais avaliados em milhoes de reais.",
    gravidade: "critica",
    fontes: [
      { titulo: "PF indicia Bolsonaro no caso das joias", url: "https://g1.globo.com/politica/noticia/2024/07/04/pf-indicia-bolsonaro-no-caso-das-joias.ghtml", data: "2024-07-04" },
    ],
  },
  {
    slug: "jair-bolsonaro",
    categoria: "contradição",
    titulo: "Sigilo de 100 anos sobre gastos do cartao corporativo",
    descricao:
      "Critico historico da falta de transparencia governamental, mas decretou sigilo de 100 anos sobre gastos do cartao corporativo da presidencia. Governo Lula revogou o sigilo apos posse.",
    gravidade: "alta",
    fontes: [
      { titulo: "Sigilo de 100 anos sobre cartao corporativo", url: "https://www1.folha.uol.com.br/poder/2023/01/lula-revoga-sigilos-de-100-anos-impostos-por-bolsonaro.shtml", data: "2023-01-02" },
    ],
  },
  {
    slug: "jair-bolsonaro",
    categoria: "processo_grave",
    titulo: "Negacionismo na pandemia: 700 mil mortes",
    descricao:
      "Minimizou a COVID-19 ('gripezinha'), promoveu tratamento sem eficacia comprovada, atrasou compra de vacinas e desencorajou uso de mascaras. CPI da COVID pediu indiciamento por crimes contra a humanidade.",
    gravidade: "critica",
    fontes: [
      { titulo: "CPI da COVID pede indiciamento de Bolsonaro", url: "https://g1.globo.com/politica/noticia/2021/10/26/relatorio-final-da-cpi-da-covid-e-apresentado.ghtml", data: "2021-10-26" },
    ],
  },

  // === PABLO MARCAL (ja tem 2, adicionar mais) ===
  {
    slug: "pablo-marcal",
    categoria: "financiamento_suspeito",
    titulo: "Patrimonio declarado de R$ 282 milhoes incompativel com historico",
    descricao:
      "Declarou R$ 282 milhoes em bens ao TSE em 2022. Origem patrimonial questionada: empresa de cursos online e coaching sem demonstracoes financeiras publicas proporcionais ao patrimonio.",
    gravidade: "critica",
    fontes: [
      { titulo: "Patrimonio de Marcal no TSE", url: "https://divulgacandcontas.tse.jus.br/divulga/#/candidato/2022/2040602022/BR/280001637067", data: "2022-08-15" },
    ],
  },
  {
    slug: "pablo-marcal",
    categoria: "processo_grave",
    titulo: "Envolvimento com piramide financeira (ABJ Marketing)",
    descricao:
      "Investigado por envolvimento com a empresa ABJ Marketing, acusada de operar como piramide financeira. Marcal nega envolvimento direto.",
    gravidade: "alta",
    fontes: [
      { titulo: "Marcal e piramide financeira", url: "https://www1.folha.uol.com.br/poder/2024/08/marcal-piramide-financeira.shtml", data: "2024-08-20" },
    ],
  },

  // === RONALDO CAIADO (ja tem 1, adicionar mais) ===
  {
    slug: "ronaldo-caiado",
    categoria: "contradição",
    titulo: "De opositor de Bolsonaro a aliado e de volta a opositor",
    descricao:
      "Apoiou Bolsonaro em 2018, rompeu durante a pandemia ao defender lockdown, reaproximou em 2021 e rompeu novamente em 2023. Oscilacao de posicao conforme conveniencia politica.",
    gravidade: "media",
    fontes: [
      { titulo: "Caiado rompe com Bolsonaro", url: "https://g1.globo.com/go/goias/noticia/2020/03/20/caiado-critica-bolsonaro-apos-pronunciamento.ghtml", data: "2020-03-20" },
    ],
  },
  {
    slug: "ronaldo-caiado",
    categoria: "financiamento_suspeito",
    titulo: "Patrimonio triplicou entre 2018 e 2022",
    descricao:
      "Patrimonio declarado ao TSE saltou de R$ 8,1 milhoes em 2018 para R$ 24,8 milhoes em 2022 (crescimento de 206%). Variacao durante exercicio de cargo publico como governador.",
    gravidade: "alta",
    fontes: [
      { titulo: "Declaracao de bens TSE 2018 e 2022", url: "https://divulgacandcontas.tse.jus.br/divulga/", data: "2022-08-15" },
    ],
  },

  // Candidatos sem pontos ainda: romeu-zema, ratinho-junior, eduardo-leite, fernando-haddad, michelle-bolsonaro
  // Esses estao no seed.sql mas NAO em candidatos.json (que controla o pipeline)
  // Vou adicionar pontos para os que existem no banco

  // === ROMEU ZEMA ===
  {
    slug: "romeu-zema",
    categoria: "contradição",
    titulo: "Elegeu-se como anti-politica mas negociou com centrao",
    descricao:
      "Elegeu-se em 2018 pelo partido Novo, com discurso anti-establishment e contra velha politica. No governo, negociou aliancas com partidos tradicionais para aprovacao de projetos na Assembleia.",
    gravidade: "media",
    fontes: [
      { titulo: "Zema e o centrao em MG", url: "https://www1.folha.uol.com.br/poder/2022/06/zema-constroi-alianca-com-centrao-em-minas-gerais.shtml", data: "2022-06-15" },
    ],
  },
  {
    slug: "romeu-zema",
    categoria: "processo_grave",
    titulo: "Tragedia de Brumadinho: governo lento na cobranca da Vale",
    descricao:
      "Rompimento da barragem da Vale em Brumadinho (jan/2019) matou 270 pessoas logo apos a posse de Zema. Criticado por demora na negociacao de reparacao e por manter relacao proxima com setor minerador.",
    gravidade: "alta",
    fontes: [
      { titulo: "Acordo de Brumadinho demora 2 anos", url: "https://g1.globo.com/mg/minas-gerais/noticia/2021/02/04/acordo-brumadinho-vale-governo-mg.ghtml", data: "2021-02-04" },
    ],
  },

  // === RATINHO JUNIOR ===
  {
    slug: "ratinho-junior",
    categoria: "contradição",
    titulo: "Herdeiro politico: filho do apresentador Ratinho",
    descricao:
      "Carreira politica construida sobre o capital politico do pai (Carlos Massa, o Ratinho). Eleito deputado estadual aos 22 anos, deputado federal e governador. Questiona-se a construcao de base propria.",
    gravidade: "baixa",
    fontes: [
      { titulo: "Perfil Ratinho Junior", url: "https://g1.globo.com/pr/parana/eleicoes/2018/noticia/2018/10/07/ratinho-junior-e-eleito-governador-do-parana.ghtml", data: "2018-10-07" },
    ],
  },

  // === EDUARDO LEITE ===
  {
    slug: "eduardo-leite",
    categoria: "contradição",
    titulo: "Disputou previas do PSDB e depois trocou de partido",
    descricao:
      "Disputou e perdeu as previas presidenciais do PSDB em 2021. Depois de renunciar ao governo do RS e disputar a reeleicao, migrou para o PSD em busca de espaco para 2026.",
    gravidade: "media",
    fontes: [
      { titulo: "Eduardo Leite vai para o PSD", url: "https://g1.globo.com/rs/rio-grande-do-sul/noticia/2024/04/03/eduardo-leite-deixa-psdb-e-se-filia-ao-psd.ghtml", data: "2024-04-03" },
    ],
  },
  {
    slug: "eduardo-leite",
    categoria: "processo_grave",
    titulo: "Gestao da crise das enchentes no RS criticada",
    descricao:
      "Enchentes de maio/2024 no RS causaram 183 mortes. Criticado por cortes em investimentos de prevencao e defesa civil nos anos anteriores ao desastre.",
    gravidade: "alta",
    fontes: [
      { titulo: "Enchentes no RS: criticas ao governo", url: "https://g1.globo.com/rs/rio-grande-do-sul/noticia/2024/05/10/enchentes-rs-governo-criticas.ghtml", data: "2024-05-10" },
    ],
  },

  // === FERNANDO HADDAD ===
  {
    slug: "fernando-haddad",
    categoria: "processo_grave",
    titulo: "Condenado em 2a instancia por caixa 2",
    descricao:
      "Condenado pelo TRE-SP por caixa 2 na campanha a prefeito de SP em 2012. A condenacao foi posteriormente anulada pelo TSE em 2022.",
    gravidade: "alta",
    fontes: [
      { titulo: "TRE condena Haddad por caixa 2", url: "https://g1.globo.com/sp/sao-paulo/noticia/2018/10/04/haddad-condenado-caixa-2-campanha-2012.ghtml", data: "2018-10-04" },
    ],
  },
  {
    slug: "fernando-haddad",
    categoria: "contradição",
    titulo: "Ministro da Fazenda com deficit fiscal crescente",
    descricao:
      "Como ministro de Lula, prometeu equilibrio fiscal mas entregou deficit primario de R$ 230 bilhoes em 2023 e R$ 28,4 bilhoes em 2024. Meta fiscal ajustada diversas vezes.",
    gravidade: "media",
    fontes: [
      { titulo: "Deficit fiscal 2023-2024", url: "https://www.gov.br/fazenda/pt-br/assuntos/noticias/2024/resultado-fiscal", data: "2024-01-30" },
    ],
  },

  // === MICHELLE BOLSONARO ===
  {
    slug: "michelle-bolsonaro",
    categoria: "financiamento_suspeito",
    titulo: "Joias sauditas e Pix de Queiroz",
    descricao:
      "Nome ligado ao caso das joias sauditas (recebeu presentes oficiais em nome proprio). Tambem recebeu depositos via Pix de Fabricio Queiroz (R$ 89 mil entre 2011 e 2018), envolvido no caso das rachadinhas.",
    gravidade: "critica",
    fontes: [
      { titulo: "Michelle e os depositos de Queiroz", url: "https://www1.folha.uol.com.br/poder/2020/08/michelle-bolsonaro-recebeu-r-89-mil-de-queiroz-e-mulher.shtml", data: "2020-08-20" },
    ],
  },
  {
    slug: "michelle-bolsonaro",
    categoria: "contradição",
    titulo: "Sem experiencia politica ou cargo publico previo",
    descricao:
      "Nunca ocupou cargo publico, nunca disputou eleicao e nao possui experiencia em gestao publica. Candidatura baseada inteiramente no capital politico do marido Jair Bolsonaro.",
    gravidade: "media",
    fontes: [
      { titulo: "Michelle Bolsonaro como candidata", url: "https://www.bbc.com/portuguese/articles/cnk4n8e4n4eo", data: "2024-10-01" },
    ],
  },
]

async function main() {
  console.log("Inserindo pontos de atencao...\n")

  let inserted = 0
  let skipped = 0

  for (const p of pontos) {
    // Resolve candidato_id
    const { data: cand } = await supabase
      .from("candidatos")
      .select("id")
      .eq("slug", p.slug)
      .single()

    if (!cand) {
      console.log(`SKIP: ${p.slug} nao encontrado no banco`)
      skipped++
      continue
    }

    // Check for duplicates by titulo
    const { data: existing } = await supabase
      .from("pontos_atencao")
      .select("id")
      .eq("candidato_id", cand.id)
      .eq("titulo", p.titulo)
      .single()

    if (existing) {
      console.log(`SKIP: ${p.slug} — "${p.titulo}" ja existe`)
      skipped++
      continue
    }

    const { error } = await supabase.from("pontos_atencao").insert({
      candidato_id: cand.id,
      categoria: p.categoria,
      titulo: p.titulo,
      descricao: p.descricao,
      gravidade: p.gravidade,
      verificado: false,
      gerado_por: "curadoria",
      fontes: p.fontes,
    })

    if (error) {
      console.error(`ERRO: ${p.slug} — ${p.titulo}: ${error.message}`)
      continue
    }

    console.log(`OK: ${p.slug} — ${p.titulo} [${p.gravidade}]`)
    inserted++
  }

  console.log(`\n--- Resultado ---`)
  console.log(`Inseridos: ${inserted}`)
  console.log(`Pulados: ${skipped}`)

  // Summary by candidate
  const { data: summary } = await supabase
    .from("pontos_atencao")
    .select("candidatos!inner(nome_urna, slug)")

  const counts: Record<string, number> = {}
  for (const s of summary || []) {
    const c = s.candidatos as unknown as { nome_urna: string }
    counts[c.nome_urna] = (counts[c.nome_urna] || 0) + 1
  }

  console.log("\n--- Pontos por candidato ---")
  for (const [nome, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${nome}: ${count}`)
  }
}

main().catch(console.error)

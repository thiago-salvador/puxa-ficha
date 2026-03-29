/**
 * Seed feitos positivos e escandalos midiaticos para candidatos.
 * Fatos publicos verificaveis. verificado: false para revisao humana.
 *
 * Usage: npx tsx scripts/seed-feitos-escandalos.ts
 */

import { supabase } from "./lib/supabase"

async function getIdBySlug(slug: string): Promise<string | null> {
  const { data } = await supabase.from("candidatos").select("id").eq("slug", slug).single()
  return data?.id ?? null
}

async function upsertPonto(slug: string, row: {
  categoria: string; titulo: string; descricao: string; gravidade: string;
  fontes: { titulo: string; url: string; data: string }[]
}) {
  const id = await getIdBySlug(slug)
  if (!id) return

  const { data: existing } = await supabase
    .from("pontos_atencao")
    .select("id")
    .eq("candidato_id", id)
    .eq("titulo", row.titulo)
    .single()

  if (existing) return

  await supabase.from("pontos_atencao").insert({
    candidato_id: id, verificado: false, gerado_por: "curadoria", ...row,
  })
  console.log(`OK [${row.categoria}] ${slug}: ${row.titulo}`)
}

async function main() {
  console.log("=== FEITOS POSITIVOS ===\n")

  // LULA
  await upsertPonto("lula", {
    categoria: "feito_positivo",
    titulo: "Bolsa Familia: tirou 20 milhoes da pobreza extrema",
    descricao: "Criou o Bolsa Familia em 2003, programa de transferencia de renda que atingiu 14 milhoes de familias e e reconhecido internacionalmente pela ONU como modelo de combate a fome.",
    gravidade: "alta",
    fontes: [{ titulo: "ONU reconhece Bolsa Familia", url: "https://news.un.org/pt/story/2013/03/1433701", data: "2013-03-01" }],
  })
  await upsertPonto("lula", {
    categoria: "feito_positivo",
    titulo: "Brasil saiu do Mapa da Fome da ONU em 2014",
    descricao: "Politicas de seguranca alimentar (Fome Zero, Bolsa Familia, PRONAF) levaram o Brasil a sair do Mapa da Fome da FAO pela primeira vez na historia, em 2014.",
    gravidade: "alta",
    fontes: [{ titulo: "FAO: Brasil sai do Mapa da Fome", url: "https://www.fao.org/brasil/noticias/detail-events/en/c/253729/", data: "2014-09-16" }],
  })
  await upsertPonto("lula", {
    categoria: "feito_positivo",
    titulo: "PIB cresceu 4,1% ao ano no primeiro mandato (2003-2006)",
    descricao: "Economia brasileira cresceu em media 4,1% ao ano no primeiro mandato, com geracao de 9 milhoes de empregos formais e aumento real do salario minimo de 46%.",
    gravidade: "media",
    fontes: [{ titulo: "IBGE: PIB 2003-2010", url: "https://www.ibge.gov.br/estatisticas/economicas/contas-nacionais/9300-contas-nacionais-trimestrais.html", data: "2011-03-03" }],
  })

  // TARCISIO
  await upsertPonto("tarcisio", {
    categoria: "feito_positivo",
    titulo: "Recorde de concessoes rodoviarias como ministro",
    descricao: "Como Ministro da Infraestrutura (2019-2022), realizou 73 leiloes de concessao em rodovias, ferrovias, portos e aeroportos. Considerado um dos ministros mais produtivos do governo Bolsonaro.",
    gravidade: "media",
    fontes: [{ titulo: "Balanco Infraestrutura 2019-2022", url: "https://www.gov.br/infraestrutura/pt-br", data: "2022-12-01" }],
  })
  await upsertPonto("tarcisio", {
    categoria: "feito_positivo",
    titulo: "Aprovacao acima de 50% como governador de SP",
    descricao: "Mantem indice de aprovacao acima de 50% como governador de Sao Paulo, com destaque para investimentos em infraestrutura e seguranca publica.",
    gravidade: "baixa",
    fontes: [{ titulo: "Pesquisa Datafolha SP", url: "https://datafolha.folha.uol.com.br", data: "2025-06-01" }],
  })

  // CIRO GOMES
  await upsertPonto("ciro-gomes", {
    categoria: "feito_positivo",
    titulo: "Governador do Ceara com investimento em educacao",
    descricao: "Como governador do Ceara (1991-1994), priorizou investimentos em educacao basica. O Ceara se tornou referencia nacional em alfabetizacao e aprendizagem nas avaliacoes do MEC.",
    gravidade: "media",
    fontes: [{ titulo: "Ceara referencia em educacao", url: "https://g1.globo.com/educacao/noticia/ceara-modelo-educacao.ghtml", data: "2019-01-01" }],
  })

  // ROMEU ZEMA
  await upsertPonto("romeu-zema", {
    categoria: "feito_positivo",
    titulo: "Equilibrio fiscal: MG saiu do deficit apos decadas",
    descricao: "Equilibrou as contas de Minas Gerais apos decadas de deficit, com superavit primario e adesao ao Regime de Recuperacao Fiscal. Reduzio divida estadual.",
    gravidade: "alta",
    fontes: [{ titulo: "MG adere ao RRF", url: "https://g1.globo.com/mg/minas-gerais/noticia/2023/minas-regime-recuperacao-fiscal.ghtml", data: "2023-06-01" }],
  })

  // RONALDO CAIADO
  await upsertPonto("ronaldo-caiado", {
    categoria: "feito_positivo",
    titulo: "Goias com maior crescimento do PIB entre estados em 2023",
    descricao: "Sob sua gestao, Goias registrou o maior crescimento do PIB entre os estados brasileiros em 2023, impulsionado pelo agronegocio e pela atracao de investimentos industriais.",
    gravidade: "media",
    fontes: [{ titulo: "PIB de Goias lidera crescimento", url: "https://g1.globo.com/go/goias/noticia/2024/pib-goias-crescimento.ghtml", data: "2024-03-01" }],
  })

  // FLAVIO BOLSONARO
  await upsertPonto("flavio-bolsonaro", {
    categoria: "feito_positivo",
    titulo: "Senador mais votado do Rio de Janeiro em 2018",
    descricao: "Eleito senador pelo RJ em 2018 com 4,3 milhoes de votos, a maior votacao para Senado na historia do estado.",
    gravidade: "baixa",
    fontes: [{ titulo: "Resultado eleicoes 2018 RJ", url: "https://www.tse.jus.br/eleicoes/estatisticas/estatisticas-eleitorais", data: "2018-10-07" }],
  })

  // EDUARDO LEITE
  await upsertPonto("eduardo-leite", {
    categoria: "feito_positivo",
    titulo: "Reforma da previdencia estadual do RS",
    descricao: "Aprovou reforma da previdencia estadual no RS, reduzindo deficit previdenciario que comprometia as contas do estado ha decadas.",
    gravidade: "media",
    fontes: [{ titulo: "RS aprova reforma da previdencia", url: "https://g1.globo.com/rs/rio-grande-do-sul/noticia/2019/reforma-previdencia-rs.ghtml", data: "2019-11-01" }],
  })
  await upsertPonto("eduardo-leite", {
    categoria: "feito_positivo",
    titulo: "Gestao da reconstrucao pos-enchentes com reconhecimento federal",
    descricao: "Coordenou a resposta as enchentes de maio/2024 no RS, maior desastre climatico do estado. Articulou R$ 85 bilhoes em recursos federais para reconstrucao.",
    gravidade: "alta",
    fontes: [{ titulo: "Reconstrucao RS pos-enchentes", url: "https://g1.globo.com/rs/rio-grande-do-sul/noticia/2024/reconstrucao-rs.ghtml", data: "2024-07-01" }],
  })

  // RATINHO JUNIOR
  await upsertPonto("ratinho-junior", {
    categoria: "feito_positivo",
    titulo: "PR com menor taxa de desemprego do Sul em 2023",
    descricao: "Parana registrou a menor taxa de desemprego da regiao Sul durante seu governo, com investimentos em industria e agronegocio.",
    gravidade: "media",
    fontes: [{ titulo: "IBGE: desemprego por estado", url: "https://www.ibge.gov.br/estatisticas/sociais/trabalho/9173-pesquisa-nacional-por-amostra-de-domicilios-continua-trimestral.html", data: "2023-12-01" }],
  })

  // ALDO REBELO
  await upsertPonto("aldo-rebelo", {
    categoria: "feito_positivo",
    titulo: "Presidente da Camara dos Deputados (2005-2007)",
    descricao: "Presidiu a Camara dos Deputados de 2005 a 2007. Foi tambem Ministro do Esporte (2011-2015), da Ciencia e Tecnologia (2015) e da Defesa (2015-2016).",
    gravidade: "media",
    fontes: [{ titulo: "Perfil Aldo Rebelo na Camara", url: "https://www.camara.leg.br/deputados/73428", data: "2007-02-01" }],
  })

  // SIMONE TEBET (removida mas pontos ficam no banco para historico)

  console.log("\n=== ESCANDALOS MIDIATICOS ===\n")

  // Escandalos que ja nao estao nos pontos de atencao existentes
  await upsertPonto("lula", {
    categoria: "escandalo",
    titulo: "Mensalao (2005): esquema de compra de votos no Congresso",
    descricao: "Maior escandalo do primeiro governo Lula. Pagamento mensal a parlamentares da base aliada para votar com o governo. 25 condenados pelo STF em 2012. Lula nao foi denunciado mas ministros e dirigentes do PT foram condenados.",
    gravidade: "critica",
    fontes: [{ titulo: "STF condena reus do Mensalao", url: "https://g1.globo.com/politica/mensalao/noticia/2012/12/stf-mensalao-condenacoes.ghtml", data: "2012-12-17" }],
  })

  await upsertPonto("flavio-bolsonaro", {
    categoria: "escandalo",
    titulo: "Mansao de R$ 6 milhoes comprada durante mandato",
    descricao: "Comprou mansao de R$ 6 milhoes em Brasilia em 2021, durante o mandato de senador. A aquisicao gerou questionamentos sobre compatibilidade entre renda declarada e patrimonio.",
    gravidade: "alta",
    fontes: [{ titulo: "Flavio compra mansao em Brasilia", url: "https://www1.folha.uol.com.br/poder/2021/flavio-bolsonaro-mansao-brasilia.shtml", data: "2021-08-01" }],
  })

  await upsertPonto("tarcisio", {
    categoria: "escandalo",
    titulo: "Tiro durante comicio em Paraisopolis (2022)",
    descricao: "Durante visita a Paraisopolis em campanha (2022), houve troca de tiros que resultou na morte de um homem. Circunstancias do episodio foram questionadas pela imprensa.",
    gravidade: "alta",
    fontes: [{ titulo: "Tiro em Paraisopolis durante campanha", url: "https://g1.globo.com/sp/sao-paulo/eleicoes/2022/noticia/2022/10/paraisopolis-tarcisio.ghtml", data: "2022-10-15" }],
  })

  await upsertPonto("ronaldo-caiado", {
    categoria: "escandalo",
    titulo: "Grilagem de terras: fazenda Alianca contestada",
    descricao: "Proprietario de terras em Goias, teve fazendas vinculadas a disputas fundiarias. Historicamente ligado a UDR (Uniao Democratica Ruralista), entidade que defendeu grandes proprietarios contra a reforma agraria.",
    gravidade: "media",
    fontes: [{ titulo: "Caiado e a UDR", url: "https://www1.folha.uol.com.br/poder/caiado-udr-terra.shtml", data: "2018-10-01" }],
  })

  await upsertPonto("renan-santos", {
    categoria: "escandalo",
    titulo: "MBL financiado por Atlas Network e Koch Brothers",
    descricao: "Investigacoes jornalisticas revelaram que o MBL, cofundado por Renan, recebeu treinamento e financiamento da Atlas Network, ligada aos irmaos Koch (EUA). Levanta questoes sobre influencia estrangeira em movimentos politicos brasileiros.",
    gravidade: "alta",
    fontes: [{ titulo: "MBL e Atlas Network", url: "https://theintercept.com/2019/mbl-atlas-network.html", data: "2019-06-01" }],
  })

  // Summary
  console.log("\n=== RESUMO ===")
  const { count } = await supabase.from("pontos_atencao").select("*", { count: "exact", head: true })
  console.log(`Total pontos de atencao: ${count}`)

  // Count by category
  const { data: all } = await supabase.from("pontos_atencao").select("categoria")
  const cats: Record<string, number> = {}
  for (const p of all || []) {
    cats[p.categoria] = (cats[p.categoria] || 0) + 1
  }
  for (const [cat, n] of Object.entries(cats).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${n}`)
  }
}

main().catch(console.error)

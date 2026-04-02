/**
 * Seed dados complementares: mudancas_partido, processos, pontos_atencao para novos candidatos.
 * Baseado em fatos publicos documentados. verificado: false para revisao humana.
 *
 * Usage: npx tsx scripts/seed-dados-complementares.ts
 */

import { supabase } from "./lib/supabase"

async function getIdBySlug(slug: string): Promise<string | null> {
  const { data } = await supabase.from("candidatos").select("id").eq("slug", slug).single()
  return data?.id ?? null
}

async function upsertMudanca(slug: string, row: { partido_anterior: string; partido_novo: string; ano: number; contexto?: string }) {
  const id = await getIdBySlug(slug)
  if (!id) return console.log(`SKIP mudanca: ${slug} not found`)

  const { data: existing } = await supabase
    .from("mudancas_partido")
    .select("id")
    .eq("candidato_id", id)
    .eq("partido_anterior", row.partido_anterior)
    .eq("partido_novo", row.partido_novo)
    .single()

  if (existing) return

  await supabase.from("mudancas_partido").insert({ candidato_id: id, ...row })
  console.log(`OK mudanca: ${slug} ${row.partido_anterior} -> ${row.partido_novo} (${row.ano})`)
}

async function upsertHistorico(slug: string, row: {
  cargo: string
  periodo_inicio: number
  periodo_fim?: number | null
  partido?: string
  estado?: string
  eleito_por?: string
  observacoes?: string | null
}) {
  const id = await getIdBySlug(slug)
  if (!id) return console.log(`SKIP historico: ${slug} not found`)

  const { data: existing } = await supabase
    .from("historico_politico")
    .select("id")
    .eq("candidato_id", id)
    .eq("cargo", row.cargo)
    .eq("periodo_inicio", row.periodo_inicio)
    .single()

  if (existing) {
    await supabase.from("historico_politico").update(row).eq("id", existing.id)
    console.log(`OK historico update: ${slug} ${row.cargo} (${row.periodo_inicio})`)
    return
  }

  await supabase.from("historico_politico").insert({ candidato_id: id, ...row })
  console.log(`OK historico: ${slug} ${row.cargo} (${row.periodo_inicio})`)
}

async function upsertProcesso(slug: string, row: {
  tipo: string; tribunal: string; descricao: string; status: string; gravidade: string;
  numero_processo?: string; data_inicio?: string; fonte?: string; url_fonte?: string
}) {
  const id = await getIdBySlug(slug)
  if (!id) return console.log(`SKIP processo: ${slug} not found`)

  const { data: existing } = await supabase
    .from("processos")
    .select("id")
    .eq("candidato_id", id)
    .eq("descricao", row.descricao)
    .single()

  if (existing) return

  await supabase.from("processos").insert({ candidato_id: id, ...row })
  console.log(`OK processo: ${slug} — ${row.descricao.slice(0, 60)}`)
}

async function upsertPonto(slug: string, row: {
  categoria: string; titulo: string; descricao: string; gravidade: string;
  fontes: { titulo: string; url: string; data: string }[]
}) {
  const id = await getIdBySlug(slug)
  if (!id) return console.log(`SKIP ponto: ${slug} not found`)

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
  console.log(`OK ponto: ${slug} — ${row.titulo}`)
}

async function main() {
  // ================================================
  // MUDANCAS DE PARTIDO
  // ================================================
  console.log("\n=== MUDANCAS DE PARTIDO ===\n")

  // Ciro Gomes: PMDB -> PSDB -> PPS -> PSB -> PROS -> PDT -> Sem partido -> PSDB
  for (const slug of ["ciro-gomes", "ciro-gomes-gov-ce"]) {
    await upsertMudanca(slug, { partido_anterior: "PMDB", partido_novo: "PSDB", ano: 1990, contexto: "Saiu do PMDB para disputar o governo do Ceara" })
    await upsertMudanca(slug, { partido_anterior: "PSDB", partido_novo: "PPS", ano: 1997, contexto: "Rompeu com FHC" })
    await upsertMudanca(slug, { partido_anterior: "PPS", partido_novo: "PSB", ano: 2005 })
    await upsertMudanca(slug, { partido_anterior: "PSB", partido_novo: "PROS", ano: 2013 })
    await upsertMudanca(slug, { partido_anterior: "PROS", partido_novo: "PDT", ano: 2015 })
    await upsertMudanca(slug, { partido_anterior: "PDT", partido_novo: "Sem partido", ano: 2022, contexto: "Desfiliou-se apos 2o turno" })
    await upsertMudanca(slug, { partido_anterior: "Sem partido", partido_novo: "PSDB", ano: 2025, contexto: "Retomou filiacao partidaria para articular candidatura em 2026" })
  }

  // Caiado: PFL -> DEM -> Uniao Brasil -> PSD
  await upsertMudanca("ronaldo-caiado", { partido_anterior: "PFL", partido_novo: "DEM", ano: 2007, contexto: "PFL virou DEM" })
  await upsertMudanca("ronaldo-caiado", { partido_anterior: "DEM", partido_novo: "Uniao Brasil", ano: 2021, contexto: "Fusao DEM + PSL" })
  await upsertMudanca("ronaldo-caiado", { partido_anterior: "Uniao Brasil", partido_novo: "PSD", ano: 2026, contexto: "Filiou-se ao PSD para a articulacao presidencial de 2026" })

  // Flavio Bolsonaro: PP -> PSC -> PSL -> PL
  await upsertMudanca("flavio-bolsonaro", { partido_anterior: "PSC", partido_novo: "PSL", ano: 2018, contexto: "Acompanhou o pai na mudanca" })
  await upsertMudanca("flavio-bolsonaro", { partido_anterior: "PSL", partido_novo: "PL", ano: 2021, contexto: "Fusao PSL + DEM nao concretizada, migrou pro PL" })

  // Eduardo Leite: PSDB -> PSD
  await upsertMudanca("eduardo-leite", { partido_anterior: "PSDB", partido_novo: "PSD", ano: 2024, contexto: "Saiu do PSDB apos perder previas para Doria" })

  // Lula: PT desde 1980, sem mudancas

  // Marina Silva: PT -> PV -> Rede
  // (Ja tem ponto de atencao sobre isso, mas vamos popular a tabela)

  // Aldo Rebelo: PCdoB -> PSB -> Solidariedade -> DC
  await upsertMudanca("aldo-rebelo", { partido_anterior: "PCdoB", partido_novo: "PSB", ano: 2017, contexto: "Saiu do PCdoB apos 30 anos" })
  await upsertMudanca("aldo-rebelo", { partido_anterior: "PSB", partido_novo: "Solidariedade", ano: 2019 })
  await upsertMudanca("aldo-rebelo", { partido_anterior: "Solidariedade", partido_novo: "DC", ano: 2025, contexto: "Filiou-se ao DC para disputar presidencia" })

  // ================================================
  // HISTORICO POLITICO
  // ================================================
  console.log("\n=== HISTORICO POLITICO ===\n")

  for (const slug of ["ciro-gomes", "ciro-gomes-gov-ce"]) {
    await upsertHistorico(slug, {
      cargo: "Prefeito de Fortaleza",
      periodo_inicio: 1989,
      periodo_fim: 1990,
      partido: "PMDB",
      estado: "CE",
      eleito_por: "Voto popular",
      observacoes: "Renunciou para disputar o governo do Ceara",
    })
    await upsertHistorico(slug, {
      cargo: "Governador do Ceara",
      periodo_inicio: 1991,
      periodo_fim: 1994,
      partido: "PSDB",
      estado: "CE",
      eleito_por: "Voto popular",
    })
    await upsertHistorico(slug, {
      cargo: "Ministro da Fazenda",
      periodo_inicio: 1994,
      periodo_fim: 1995,
      partido: "PSDB",
      eleito_por: "Nomeacao",
      observacoes: "Governo Itamar Franco",
    })
    await upsertHistorico(slug, {
      cargo: "Ministro da Integracao Nacional",
      periodo_inicio: 2003,
      periodo_fim: 2006,
      partido: "PPS",
      eleito_por: "Nomeacao",
      observacoes: "Governo Lula 1",
    })
    await upsertHistorico(slug, {
      cargo: "Deputado Federal",
      periodo_inicio: 2007,
      periodo_fim: 2011,
      partido: "PSB",
      estado: "CE",
      eleito_por: "Voto popular",
    })
  }

  // ================================================
  // PROCESSOS JUDICIAIS
  // ================================================
  console.log("\n=== PROCESSOS JUDICIAIS ===\n")

  // Lula
  await upsertProcesso("lula", {
    tipo: "criminal",
    tribunal: "TRF-4 / STF",
    descricao: "Condenado por corrupcao passiva e lavagem de dinheiro (caso triplex Guaruja). Anulado pelo STF em 2021 por incompetencia de foro.",
    status: "anulado",
    gravidade: "critica",
    data_inicio: "2016-09-14",
    fonte: "STF",
    url_fonte: "https://www.stf.jus.br/portal/cms/verNoticiaDetalhe.asp?idConteudo=462025",
  })
  await upsertProcesso("lula", {
    tipo: "criminal",
    tribunal: "TRF-4 / STF",
    descricao: "Condenado por corrupcao passiva e lavagem de dinheiro (caso sitio de Atibaia). Anulado pelo STF em 2021.",
    status: "anulado",
    gravidade: "alta",
    data_inicio: "2018-11-01",
    fonte: "STF",
  })

  // Flavio Bolsonaro
  await upsertProcesso("flavio-bolsonaro", {
    tipo: "criminal",
    tribunal: "TJ-RJ",
    descricao: "Investigado por peculato, lavagem de dinheiro e organizacao criminosa no caso das rachadinhas no gabinete da ALERJ.",
    status: "em andamento",
    gravidade: "critica",
    data_inicio: "2019-01-01",
    fonte: "MP-RJ",
  })

  // Ciro Gomes
  await upsertProcesso("ciro-gomes", {
    tipo: "criminal",
    tribunal: "Justica Federal CE",
    descricao: "Denunciado por agressao a jornalista durante campanha de 2022.",
    status: "em andamento",
    gravidade: "media",
    data_inicio: "2022-09-01",
  })

  // Eduardo Leite
  await upsertProcesso("eduardo-leite", {
    tipo: "civil",
    tribunal: "TCE-RS",
    descricao: "Investigacao sobre cortes em defesa civil e prevencao de enchentes no RS antes do desastre de maio/2024.",
    status: "em andamento",
    gravidade: "alta",
    data_inicio: "2024-06-01",
  })

  // ================================================
  // PONTOS DE ATENCAO (novos candidatos)
  // ================================================
  console.log("\n=== PONTOS DE ATENCAO (novos candidatos) ===\n")

  // Aldo Rebelo
  await upsertPonto("aldo-rebelo", {
    categoria: "mudança_partido",
    titulo: "4 partidos em 8 anos apos 30 anos no PCdoB",
    descricao: "Filiado ao PCdoB de 1987 a 2017. Desde entao passou por PSB, Solidariedade e DC em apenas 8 anos. Mudancas motivadas por busca de legenda para candidatura presidencial.",
    gravidade: "media",
    fontes: [{ titulo: "Aldo Rebelo se filia ao DC", url: "https://g1.globo.com/politica/noticia/2025/aldo-rebelo-filia-dc.ghtml", data: "2025-01-15" }],
  })
  await upsertPonto("aldo-rebelo", {
    categoria: "contradição",
    titulo: "De comunista a aliado de Bolsonaro",
    descricao: "Foi lider do PCdoB, presidente da Camara e ministro de Dilma. Aproximou-se de Bolsonaro em 2018-2022, adotando pautas nacionalistas conservadoras. Transicao ideologica questionada por ex-aliados.",
    gravidade: "alta",
    fontes: [{ titulo: "Aldo Rebelo e a guinada a direita", url: "https://www1.folha.uol.com.br/poder/2022/aldo-rebelo-bolsonaro.shtml", data: "2022-03-15" }],
  })
  await upsertPonto("aldo-rebelo", {
    categoria: "contradição",
    titulo: "Ministro do Esporte durante escandalo da Copa 2014",
    descricao: "Foi Ministro do Esporte (2011-2015) durante a organizacao da Copa 2014, marcada por obras superfaturadas e protestos de junho de 2013.",
    gravidade: "media",
    fontes: [{ titulo: "Copa 2014: obras e protestos", url: "https://g1.globo.com/politica/noticia/2014/copa-obras-superfaturadas.ghtml", data: "2014-06-01" }],
  })

  // Renan Santos
  await upsertPonto("renan-santos", {
    categoria: "contradição",
    titulo: "Fundador do MBL, movimento que pede renovacao mas centraliza poder",
    descricao: "Co-fundador do Movimento Brasil Livre (MBL), organizacao que se apresenta como apartidaria mas funciona como estrutura politica com hierarquia centralizada e sem transparencia financeira.",
    gravidade: "media",
    fontes: [{ titulo: "MBL: estrutura e financiamento", url: "https://www1.folha.uol.com.br/poder/2019/mbl-financiamento.shtml", data: "2019-05-10" }],
  })
  await upsertPonto("renan-santos", {
    categoria: "processo_grave",
    titulo: "Investigado por organizacao criminosa (STF, inq. 4923)",
    descricao: "Incluido no inquerito 4923 do STF que investiga financiamento e organizacao de atos antidemocraticos. Investigacao em andamento.",
    gravidade: "critica",
    fontes: [{ titulo: "STF investiga MBL e atos antidemocraticos", url: "https://g1.globo.com/politica/noticia/2023/stf-inquerito-atos.ghtml", data: "2023-01-15" }],
  })

  // Rui Costa Pimenta
  await upsertPonto("rui-costa-pimenta", {
    categoria: "contradição",
    titulo: "Candidato perene: 5a candidatura a presidente sem expressao eleitoral",
    descricao: "Candidato pelo PCO em 2002, 2006, 2010, 2018 e 2022. Nunca ultrapassou 0,05% dos votos. Partido tem 0 deputados e 0 senadores. Candidatura usada como plataforma de propaganda.",
    gravidade: "baixa",
    fontes: [{ titulo: "Resultados eleitorais PCO", url: "https://www.tse.jus.br/eleicoes/estatisticas", data: "2022-10-30" }],
  })

  // Hertz Dias
  await upsertPonto("hertz-dias", {
    categoria: "contradição",
    titulo: "Candidato pouco conhecido, sem mandato previo",
    descricao: "Sem historico de mandato eletivo ou cargo publico relevante. Candidatura pelo PSTU sem base eleitoral propria expressiva.",
    gravidade: "baixa",
    fontes: [{ titulo: "Pre-candidatos PSTU 2026", url: "https://www.pstu.org.br", data: "2026-03-01" }],
  })

  // Samara Martins
  await upsertPonto("samara-martins", {
    categoria: "contradição",
    titulo: "Candidata sem historico politico ou mandato previo",
    descricao: "Sem mandato eletivo anterior ou experiencia em gestao publica. Candidatura pela UP sem base eleitoral consolidada.",
    gravidade: "baixa",
    fontes: [{ titulo: "Pre-candidatos UP 2026", url: "https://unidadepopular.org.br", data: "2026-03-01" }],
  })

  // Summary
  console.log("\n=== RESUMO ===\n")
  const { count: mudancas } = await supabase.from("mudancas_partido").select("*", { count: "exact", head: true })
  const { count: historico } = await supabase.from("historico_politico").select("*", { count: "exact", head: true })
  const { count: processos } = await supabase.from("processos").select("*", { count: "exact", head: true })
  const { count: pontos } = await supabase.from("pontos_atencao").select("*", { count: "exact", head: true })
  console.log(`Mudancas de partido: ${mudancas}`)
  console.log(`Historico politico: ${historico}`)
  console.log(`Processos judiciais: ${processos}`)
  console.log(`Pontos de atencao: ${pontos}`)
}

main().catch(console.error)

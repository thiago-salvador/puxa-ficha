import { createServerSupabaseClient } from "./supabase"
import type { Candidato, FichaCandidato, CandidatoComparavel, SancaoAdministrativa, IndicadorEstadual, NoticiaCandidato } from "./types"
import {
  MOCK_CANDIDATOS,
  MOCK_PATRIMONIO,
  MOCK_PROCESSOS,
  MOCK_HISTORICO,
  MOCK_MUDANCAS,
  MOCK_FINANCIAMENTO,
  MOCK_VOTOS,
  MOCK_PONTOS,
  MOCK_PROJETOS,
  MOCK_GASTOS,
  MOCK_SANCOES,
  MOCK_NOTICIAS,
} from "@/data/mock"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const USE_MOCK = !supabaseUrl || supabaseUrl.includes("placeholder")
const IS_DEV = process.env.NODE_ENV === "development"

// Public columns only: excludes cpf, email_campanha, cpf_hash, tcu flags, wikidata_id
const CANDIDATO_COLUMNS = "id, nome_completo, nome_urna, slug, data_nascimento, idade, naturalidade, formacao, profissao_declarada, genero, estado_civil, cor_raca, partido_atual, partido_sigla, cargo_atual, cargo_disputado, estado, status, situacao_candidatura, biografia, foto_url, site_campanha, redes_sociais, fonte_dados, ultima_atualizacao"

export async function getCandidatos(cargo?: string): Promise<Candidato[]> {
  if (USE_MOCK) return cargo ? MOCK_CANDIDATOS.filter(c => c.cargo_disputado === cargo) : MOCK_CANDIDATOS

  const supabase = createServerSupabaseClient()
  let query = supabase
    .from("candidatos")
    .select(CANDIDATO_COLUMNS)
    .neq("status", "removido")

  if (cargo) {
    query = query.eq("cargo_disputado", cargo)
  }

  const { data, error } = await query.order("nome_urna")

  if (error || !data) {
    if (IS_DEV) return cargo ? MOCK_CANDIDATOS.filter(c => c.cargo_disputado === cargo) : MOCK_CANDIDATOS
    console.error("getCandidatos failed:", error?.message)
    return []
  }
  return data
}

export async function getCandidatoBySlug(slug: string): Promise<FichaCandidato | null> {
  if (USE_MOCK) {
    const candidato = MOCK_CANDIDATOS.find((c) => c.slug === slug)
    if (!candidato) return null
    return {
      ...candidato,
      historico: MOCK_HISTORICO[slug] ?? [],
      mudancas_partido: MOCK_MUDANCAS[slug] ?? [],
      patrimonio: MOCK_PATRIMONIO[slug] ?? [],
      financiamento: MOCK_FINANCIAMENTO[slug] ?? [],
      votos: MOCK_VOTOS[slug] ?? [],
      processos: MOCK_PROCESSOS[slug] ?? [],
      pontos_atencao: MOCK_PONTOS[slug] ?? [],
      projetos_lei: MOCK_PROJETOS[slug] ?? [],
      gastos_parlamentares: MOCK_GASTOS[slug] ?? [],
      sancoes_administrativas: MOCK_SANCOES[slug] ?? [],
      noticias: MOCK_NOTICIAS[slug] ?? [],
      indicadores_estaduais: [],
      total_processos: (MOCK_PROCESSOS[slug] ?? []).length,
      processos_criminais: (MOCK_PROCESSOS[slug] ?? []).filter(p => p.tipo === "criminal").length,
      total_mudancas_partido: (MOCK_MUDANCAS[slug] ?? []).length,
      total_pontos_atencao: (MOCK_PONTOS[slug] ?? []).length,
      pontos_criticos: (MOCK_PONTOS[slug] ?? []).filter(p => p.gravidade === "critica").length,
      total_sancoes: (MOCK_SANCOES[slug] ?? []).length,
    }
  }

  const supabase = createServerSupabaseClient()

  const { data: candidato } = await supabase
    .from("candidatos")
    .select(CANDIDATO_COLUMNS)
    .eq("slug", slug)
    .single()

  if (!candidato) return null

  const id = candidato.id

  const [historico, mudancas, patrimonio, financiamento, votos, processos, pontos, projetos, gastos, sancoes, noticias, indicadores] =
    await Promise.all([
      supabase.from("historico_politico").select("*").eq("candidato_id", id).order("periodo_inicio", { ascending: false }),
      supabase.from("mudancas_partido").select("*").eq("candidato_id", id).order("ano", { ascending: false }),
      supabase.from("patrimonio").select("*").eq("candidato_id", id).order("ano_eleicao", { ascending: false }),
      supabase.from("financiamento").select("*").eq("candidato_id", id).order("ano_eleicao", { ascending: false }),
      supabase.from("votos_candidato").select("*, votacao:votacoes_chave(*)").eq("candidato_id", id),
      supabase.from("processos").select("*").eq("candidato_id", id),
      supabase.from("pontos_atencao").select("*").eq("candidato_id", id).eq("visivel", true),
      supabase.from("projetos_lei").select("*").eq("candidato_id", id).order("ano", { ascending: false }),
      supabase.from("gastos_parlamentares").select("*").eq("candidato_id", id).order("ano", { ascending: false }),
      supabase.from("sancoes_administrativas").select("*").eq("candidato_id", id).order("data_inicio", { ascending: false }),
      supabase.from("noticias_candidato").select("*").eq("candidato_id", id).order("data_publicacao", { ascending: false }).limit(20),
      candidato.cargo_disputado === "Governador" && candidato.estado
        ? supabase.from("indicadores_estaduais").select("*").ilike("estado", candidato.estado).order("ano", { ascending: false })
        : Promise.resolve({ data: [] as IndicadorEstadual[] }),
    ])

  return {
    ...candidato,
    historico: historico.data ?? [],
    mudancas_partido: mudancas.data ?? [],
    patrimonio: patrimonio.data ?? [],
    financiamento: financiamento.data ?? [],
    votos: votos.data ?? [],
    processos: processos.data ?? [],
    pontos_atencao: pontos.data ?? [],
    projetos_lei: projetos.data ?? [],
    gastos_parlamentares: gastos.data ?? [],
    sancoes_administrativas: sancoes.data ?? [],
    noticias: noticias.data ?? [],
    indicadores_estaduais: indicadores.data ?? [],
    total_processos: (processos.data ?? []).length,
    processos_criminais: (processos.data ?? []).filter((p) => p.tipo === "criminal").length,
    total_mudancas_partido: (mudancas.data ?? []).length,
    total_pontos_atencao: (pontos.data ?? []).length,
    pontos_criticos: (pontos.data ?? []).filter((p) => p.gravidade === "critica").length,
    total_sancoes: (sancoes.data ?? []).length,
  }
}

export interface CandidatoResumo {
  candidato: Candidato
  patrimonio: number | null
  processos: number
  pontos_atencao: number
}

export async function getCandidatosComResumo(cargo?: string): Promise<CandidatoResumo[]> {
  const candidatos = await getCandidatos(cargo)
  if (USE_MOCK) {
    return candidatos.map((c) => ({
      candidato: c,
      patrimonio: null,
      processos: 0,
      pontos_atencao: 0,
    }))
  }

  const supabase = createServerSupabaseClient()
  const ids = candidatos.map((c) => c.id)

  const [patRes, procRes, pontosRes] = await Promise.all([
    supabase.from("patrimonio").select("candidato_id, valor_total, ano_eleicao").in("candidato_id", ids).order("ano_eleicao", { ascending: false }),
    supabase.from("processos").select("candidato_id").in("candidato_id", ids),
    supabase.from("pontos_atencao").select("candidato_id").in("candidato_id", ids).eq("visivel", true),
  ])

  // Build lookup maps
  const patMap = new Map<string, number>()
  for (const p of patRes.data ?? []) {
    if (!patMap.has(p.candidato_id)) patMap.set(p.candidato_id, p.valor_total)
  }
  const procMap = new Map<string, number>()
  for (const p of procRes.data ?? []) {
    procMap.set(p.candidato_id, (procMap.get(p.candidato_id) ?? 0) + 1)
  }
  const pontosMap = new Map<string, number>()
  for (const p of pontosRes.data ?? []) {
    pontosMap.set(p.candidato_id, (pontosMap.get(p.candidato_id) ?? 0) + 1)
  }

  return candidatos.map((c) => ({
    candidato: c,
    patrimonio: patMap.get(c.id) ?? null,
    processos: procMap.get(c.id) ?? 0,
    pontos_atencao: pontosMap.get(c.id) ?? 0,
  }))
}

export async function getCandidatosComparaveis(cargo?: string, estado?: string): Promise<CandidatoComparavel[]> {
  const cargoFilter = cargo ?? "Presidente"
  if (USE_MOCK) {
    return MOCK_CANDIDATOS.filter(c => c.cargo_disputado === cargoFilter && (!estado || c.estado?.toLowerCase() === estado.toLowerCase())).map((c) => ({
      id: c.id,
      nome_urna: c.nome_urna,
      slug: c.slug,
      partido_sigla: c.partido_sigla,
      cargo_disputado: c.cargo_disputado,
      estado: c.estado,
      foto_url: c.foto_url,
      idade: c.idade,
      formacao: c.formacao,
      total_processos: (MOCK_PROCESSOS[c.slug] ?? []).length,
      mudancas_partido: 0,
      alertas_graves: 0,
      patrimonio_declarado: MOCK_PATRIMONIO[c.slug]?.[0]?.valor_total ?? null,
      pontos_atencao: [],
    }))
  }

  const supabase = createServerSupabaseClient()
  let query = supabase
    .from("candidatos")
    .select("id")
    .neq("status", "removido")
    .eq("cargo_disputado", cargoFilter)

  if (estado) {
    query = query.ilike("estado", estado)
  }

  const { data: active } = await query

  const activeIds = new Set((active ?? []).map((c) => c.id))

  const { data } = await supabase.from("v_comparador").select("*").order("nome_urna")
  return (data ?? []).filter((c) => activeIds.has(c.id))
}

const UF_NAMES: Record<string, string> = {
  ac: "Acre", al: "Alagoas", am: "Amazonas", ap: "Amapá", ba: "Bahia",
  ce: "Ceará", df: "Distrito Federal", es: "Espírito Santo", go: "Goiás",
  ma: "Maranhão", mg: "Minas Gerais", ms: "Mato Grosso do Sul", mt: "Mato Grosso",
  pa: "Pará", pb: "Paraíba", pe: "Pernambuco", pi: "Piauí", pr: "Paraná",
  rj: "Rio de Janeiro", rn: "Rio Grande do Norte", ro: "Rondônia", rr: "Roraima",
  rs: "Rio Grande do Sul", sc: "Santa Catarina", se: "Sergipe", sp: "São Paulo",
  to: "Tocantins",
}

export async function getNoticiasCandidato(candidatoId: string): Promise<NoticiaCandidato[]> {
  if (USE_MOCK) return []

  const supabase = createServerSupabaseClient()
  const { data } = await supabase
    .from("noticias_candidato")
    .select("*")
    .eq("candidato_id", candidatoId)
    .order("data_publicacao", { ascending: false })
    .limit(20)

  return data ?? []
}

export async function getSancoesAdministrativas(candidatoId: string): Promise<SancaoAdministrativa[]> {
  if (USE_MOCK) return []

  const supabase = createServerSupabaseClient()
  const { data } = await supabase
    .from("sancoes_administrativas")
    .select("*")
    .eq("candidato_id", candidatoId)
    .order("data_inicio", { ascending: false })

  return data ?? []
}

export async function getIndicadoresEstaduais(estado: string): Promise<IndicadorEstadual[]> {
  if (USE_MOCK) return []

  const supabase = createServerSupabaseClient()
  const { data } = await supabase
    .from("indicadores_estaduais")
    .select("*")
    .ilike("estado", estado)
    .order("ano", { ascending: false })

  return data ?? []
}

export function getEstadoNome(uf: string): string | null {
  return UF_NAMES[uf.toLowerCase()] ?? null
}

export function getEstadoUFs(): string[] {
  return Object.keys(UF_NAMES)
}

export async function getCandidatosPorEstado(uf: string): Promise<Candidato[]> {
  if (USE_MOCK) {
    return MOCK_CANDIDATOS.filter(
      (c) => c.estado?.toLowerCase() === uf.toLowerCase()
    )
  }

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from("candidatos")
    .select(CANDIDATO_COLUMNS)
    .neq("status", "removido")
    .eq("cargo_disputado", "Governador")
    .ilike("estado", uf)
    .order("nome_urna")

  if (error || !data) return []
  return data
}

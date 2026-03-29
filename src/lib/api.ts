import { createServerSupabaseClient } from "./supabase"
import type { Candidato, FichaCandidato, CandidatoComparavel } from "./types"
import { MOCK_CANDIDATOS, MOCK_PATRIMONIO, MOCK_PROCESSOS } from "@/data/mock"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const USE_MOCK = !supabaseUrl || supabaseUrl.includes("placeholder")

export async function getCandidatos(): Promise<Candidato[]> {
  if (USE_MOCK) return MOCK_CANDIDATOS

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from("candidatos")
    .select("*")
    .neq("status", "removido")
    .order("nome_urna")

  if (error || !data) return MOCK_CANDIDATOS
  return data
}

export async function getCandidatoBySlug(slug: string): Promise<FichaCandidato | null> {
  if (USE_MOCK) {
    const candidato = MOCK_CANDIDATOS.find((c) => c.slug === slug)
    if (!candidato) return null
    return {
      ...candidato,
      historico: [],
      mudancas_partido: [],
      patrimonio: MOCK_PATRIMONIO[slug] ?? [],
      financiamento: [],
      votos: [],
      processos: MOCK_PROCESSOS[slug] ?? [],
      pontos_atencao: [],
      total_processos: (MOCK_PROCESSOS[slug] ?? []).length,
      processos_criminais: 0,
      total_mudancas_partido: 0,
      total_pontos_atencao: 0,
      pontos_criticos: 0,
    }
  }

  const supabase = createServerSupabaseClient()

  const { data: candidato } = await supabase
    .from("candidatos")
    .select("*")
    .eq("slug", slug)
    .single()

  if (!candidato) return null

  const id = candidato.id

  const [historico, mudancas, patrimonio, financiamento, votos, processos, pontos] =
    await Promise.all([
      supabase.from("historico_politico").select("*").eq("candidato_id", id).order("periodo_inicio", { ascending: false }),
      supabase.from("mudancas_partido").select("*").eq("candidato_id", id).order("ano", { ascending: false }),
      supabase.from("patrimonio").select("*").eq("candidato_id", id).order("ano_eleicao", { ascending: false }),
      supabase.from("financiamento").select("*").eq("candidato_id", id).order("ano_eleicao", { ascending: false }),
      supabase.from("votos_candidato").select("*, votacao:votacoes_chave(*)").eq("candidato_id", id),
      supabase.from("processos").select("*").eq("candidato_id", id),
      supabase.from("pontos_atencao").select("*").eq("candidato_id", id).eq("visivel", true),
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
    total_processos: (processos.data ?? []).length,
    processos_criminais: (processos.data ?? []).filter((p) => p.tipo === "criminal").length,
    total_mudancas_partido: (mudancas.data ?? []).length,
    total_pontos_atencao: (pontos.data ?? []).length,
    pontos_criticos: (pontos.data ?? []).filter((p) => p.gravidade === "critica").length,
  }
}

export interface CandidatoResumo {
  candidato: Candidato
  patrimonio: number | null
  processos: number
  pontos_atencao: number
}

export async function getCandidatosComResumo(): Promise<CandidatoResumo[]> {
  const candidatos = await getCandidatos()
  if (USE_MOCK) {
    return candidatos.map((c) => ({
      candidato: c,
      patrimonio: null,
      processos: 0,
      pontos_atencao: 0,
    }))
  }

  const supabase = createServerSupabaseClient()
  const results: CandidatoResumo[] = []

  for (const c of candidatos) {
    const [pat, proc, pontos] = await Promise.all([
      supabase.from("patrimonio").select("valor_total").eq("candidato_id", c.id).order("ano_eleicao", { ascending: false }).limit(1),
      supabase.from("processos").select("id", { count: "exact", head: true }).eq("candidato_id", c.id),
      supabase.from("pontos_atencao").select("id", { count: "exact", head: true }).eq("candidato_id", c.id).eq("visivel", true),
    ])

    results.push({
      candidato: c,
      patrimonio: pat.data?.[0]?.valor_total ?? null,
      processos: proc.count ?? 0,
      pontos_atencao: pontos.count ?? 0,
    })
  }

  return results
}

export async function getCandidatosComparaveis(): Promise<CandidatoComparavel[]> {
  if (USE_MOCK) {
    return MOCK_CANDIDATOS.map((c) => ({
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
  // Get active candidate IDs first
  const { data: active } = await supabase
    .from("candidatos")
    .select("id")
    .neq("status", "removido")

  const activeIds = new Set((active ?? []).map((c) => c.id))

  const { data } = await supabase.from("v_comparador").select("*")
  return (data ?? []).filter((c) => activeIds.has(c.id))
}

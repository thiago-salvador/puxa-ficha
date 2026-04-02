import { createServerSupabaseClient } from "./supabase"
import type {
  Candidato,
  FichaCandidato,
  CandidatoComparavel,
  SancaoAdministrativa,
  IndicadorEstadual,
  NoticiaCandidato,
  DataResource,
  DataSourceStatus,
  Financiamento,
  GastoParlamentar,
  HistoricoPolitico,
  MudancaPartido,
  Patrimonio,
  ProjetoLei,
  SectionFreshnessInfo,
  SectionFreshnessKey,
  VotoCandidato,
} from "./types"
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
import {
  hasIncompletePartyTimeline,
} from "@/lib/candidate-integrity"
import { formatDate } from "@/lib/utils"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const USE_MOCK = !supabaseUrl || supabaseUrl.includes("placeholder")
const IS_DEV = process.env.NODE_ENV === "development"
const IS_PRODUCTION_DEPLOY = process.env.VERCEL_ENV === "production"
const IS_LAUNCH_PHASE = process.env.PF_CURATION_PHASE === "launched"
const CANDIDATO_PUBLIC_RELATION = "candidatos_publico"
const PROFILE_FRESHNESS_WINDOW_DAYS = 30

if (USE_MOCK && IS_PRODUCTION_DEPLOY) {
  throw new Error(
    "Producao nao pode usar fallback mock. Configure NEXT_PUBLIC_SUPABASE_URL e as credenciais públicas antes do deploy."
  )
}

// Public columns only: excludes cpf, email_campanha, cpf_hash, tcu flags, wikidata_id
const CANDIDATO_COLUMNS = "id, nome_completo, nome_urna, slug, data_nascimento, idade, naturalidade, formacao, profissao_declarada, genero, estado_civil, cor_raca, partido_atual, partido_sigla, cargo_atual, cargo_disputado, estado, status, situacao_candidatura, biografia, foto_url, site_campanha, redes_sociais, fonte_dados, ultima_atualizacao"

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function ageInDays(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24))
}

function buildFreshnessInfo(
  key: SectionFreshnessKey,
  label: string,
  status: SectionFreshnessInfo["status"],
  message: string,
  referenceDate: string | null = null,
  referenceYear: number | null = null,
  verifiedAt: string | null = null,
  sourceLabel: string | null = null
): SectionFreshnessInfo {
  return {
    key,
    label,
    status,
    verifiedAt,
    referenceDate,
    referenceYear,
    sourceLabel,
    message,
  }
}

function rankMudancaPartido(item: Pick<MudancaPartido, "data_mudanca" | "ano">): number {
  if (item.data_mudanca) {
    const parsed = Date.parse(item.data_mudanca)
    if (Number.isFinite(parsed)) return parsed
  }
  if (item.ano != null) {
    return Date.UTC(item.ano, 11, 31)
  }
  return 0
}

function buildSectionFreshness(
  candidato: Candidato,
  data: {
    historico: HistoricoPolitico[]
    mudancas: MudancaPartido[]
    patrimonio: Patrimonio[]
    financiamento: Financiamento[]
    votos: VotoCandidato[]
    projetos: ProjetoLei[]
    gastos: GastoParlamentar[]
    historicoEmRevisao?: boolean
    timelinePartidariaIncompleta?: boolean
  }
): Partial<Record<SectionFreshnessKey, SectionFreshnessInfo>> {
  const updatedAt = parseDate(candidato.ultima_atualizacao)
  const latestHistoricoYear =
    data.historico.length > 0
      ? Math.max(
          ...data.historico.map((item) =>
            item.periodo_fim ?? item.periodo_inicio ?? 0
          )
        )
      : null
  const latestMudancaYear =
    data.mudancas.length > 0
      ? Math.max(...data.mudancas.map((item) => item.ano ?? 0))
      : null
  const latestPatrimonioYear =
    data.patrimonio.length > 0
      ? Math.max(...data.patrimonio.map((item) => item.ano_eleicao ?? 0))
      : null
  const latestFinanciamentoYear =
    data.financiamento.length > 0
      ? Math.max(...data.financiamento.map((item) => item.ano_eleicao ?? 0))
      : null
  const latestProjetoYear =
    data.projetos.length > 0
      ? Math.max(...data.projetos.map((item) => item.ano ?? 0))
      : null
  const latestGastoYear =
    data.gastos.length > 0
      ? Math.max(...data.gastos.map((item) => item.ano ?? 0))
      : null
  const latestVoteDateString = [...data.votos]
    .map((item) => item.votacao?.data_votacao ?? null)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null
  const latestVoteDate = parseDate(latestVoteDateString)

  return {
    perfil_atual: updatedAt
      ? buildFreshnessInfo(
          "perfil_atual",
          "Perfil atual",
          !IS_LAUNCH_PHASE || ageInDays(updatedAt) <= PROFILE_FRESHNESS_WINDOW_DAYS ? "current" : "stale",
          !IS_LAUNCH_PHASE || ageInDays(updatedAt) <= PROFILE_FRESHNESS_WINDOW_DAYS
            ? `Perfil atual consolidado em ${formatDate(updatedAt)}.`
            : `Perfil atual consolidado em ${formatDate(updatedAt)}. Revalide este bloco antes de tratá-lo como atual.`,
          updatedAt.toISOString(),
          updatedAt.getFullYear(),
          updatedAt.toISOString(),
          "Perfil factual curado"
        )
      : buildFreshnessInfo(
          "perfil_atual",
          "Perfil atual",
          "missing",
          "Sem data confiável de atualização do perfil atual."
        ),
    historico_politico:
      latestHistoricoYear != null
        ? buildFreshnessInfo(
            "historico_politico",
            "Trajetória política",
            data.historicoEmRevisao ? "stale" : "historical",
            data.historicoEmRevisao
              ? `Último cargo estruturado até ${latestHistoricoYear}. A trajetória ainda está em revisão factual.`
              : `Último cargo estruturado até ${latestHistoricoYear}.`,
            null,
            latestHistoricoYear,
            null,
            "Histórico político"
          )
        : buildFreshnessInfo(
            "historico_politico",
            "Trajetória política",
            "missing",
            "Sem trajetória política estruturada."
          ),
    mudancas_partido:
      latestMudancaYear != null
        ? buildFreshnessInfo(
            "mudancas_partido",
            "Histórico partidário",
            data.timelinePartidariaIncompleta ? "stale" : "historical",
            data.timelinePartidariaIncompleta
              ? `Última mudança de partido registrada em ${latestMudancaYear}. A linha do tempo ainda não chegou à filiação atual publicada.`
              : `Última mudança de partido registrada em ${latestMudancaYear}.`,
            null,
            latestMudancaYear,
            null,
            "Histórico partidário"
          )
        : buildFreshnessInfo(
            "mudancas_partido",
            "Histórico partidário",
            "missing",
            "Sem linha do tempo partidária estruturada."
          ),
    patrimonio:
      latestPatrimonioYear != null
        ? buildFreshnessInfo(
            "patrimonio",
            "Patrimônio",
            "historical",
            `Dado mais recente disponível: eleição de ${latestPatrimonioYear}.`,
            null,
            latestPatrimonioYear,
            null,
            "TSE"
          )
        : buildFreshnessInfo(
            "patrimonio",
            "Patrimônio",
            "missing",
            "Sem patrimônio estruturado."
          ),
    financiamento:
      latestFinanciamentoYear != null
        ? buildFreshnessInfo(
            "financiamento",
            "Financiamento",
            "historical",
            `Dado mais recente disponível: eleição de ${latestFinanciamentoYear}.`,
            null,
            latestFinanciamentoYear,
            null,
            "TSE"
          )
        : buildFreshnessInfo(
            "financiamento",
            "Financiamento",
            "missing",
            "Sem financiamento estruturado."
          ),
    projetos_lei:
      latestProjetoYear != null
        ? buildFreshnessInfo(
            "projetos_lei",
            "Projetos de lei",
            "historical",
            `Projeto mais recente disponível: ${latestProjetoYear}.`,
            null,
            latestProjetoYear,
            null,
            "API legislativa"
          )
        : buildFreshnessInfo(
            "projetos_lei",
            "Projetos de lei",
            "missing",
            "Sem projetos de lei estruturados."
          ),
    votos_candidato:
      latestVoteDate
        ? buildFreshnessInfo(
            "votos_candidato",
            "Votações",
            "historical",
            `Votação mais recente registrada em ${formatDate(latestVoteDate)}.`,
            latestVoteDate.toISOString(),
            latestVoteDate.getFullYear(),
            null,
            "API legislativa"
          )
        : buildFreshnessInfo(
            "votos_candidato",
            "Votações",
            "missing",
            "Sem histórico estruturado de votações."
          ),
    gastos_parlamentares:
      latestGastoYear != null
        ? buildFreshnessInfo(
            "gastos_parlamentares",
            "Gastos parlamentares",
            "historical",
            `Dados disponíveis até ${latestGastoYear}.`,
            null,
            latestGastoYear,
            null,
            "Gastos parlamentares"
          )
        : buildFreshnessInfo(
            "gastos_parlamentares",
            "Gastos parlamentares",
            "missing",
            "Sem gastos parlamentares estruturados."
          ),
  }
}

function getMockCandidatos(cargo?: string): Candidato[] {
  return cargo ? MOCK_CANDIDATOS.filter((c) => c.cargo_disputado === cargo) : MOCK_CANDIDATOS
}

function getMockFicha(slug: string): FichaCandidato | null {
  const candidato = MOCK_CANDIDATOS.find((c) => c.slug === slug)
  if (!candidato) return null

  const historico = MOCK_HISTORICO[slug] ?? []
  const mudancas = MOCK_MUDANCAS[slug] ?? []
  const patrimonio = MOCK_PATRIMONIO[slug] ?? []
  const financiamento = MOCK_FINANCIAMENTO[slug] ?? []
  const votos = MOCK_VOTOS[slug] ?? []
  const processos = MOCK_PROCESSOS[slug] ?? []
  const pontos = MOCK_PONTOS[slug] ?? []
  const projetos = MOCK_PROJETOS[slug] ?? []
  const gastos = MOCK_GASTOS[slug] ?? []
  const sancoes = MOCK_SANCOES[slug] ?? []
  const noticias = MOCK_NOTICIAS[slug] ?? []

  return {
    ...candidato,
    historico,
    mudancas_partido: mudancas,
    patrimonio,
    financiamento,
    votos,
    processos,
    pontos_atencao: pontos,
    projetos_lei: projetos,
    gastos_parlamentares: gastos,
    sancoes_administrativas: sancoes,
    noticias,
    indicadores_estaduais: [],
    total_processos: processos.length,
    processos_criminais: processos.filter((p) => p.tipo === "criminal").length,
    total_mudancas_partido: mudancas.length,
    total_pontos_atencao: pontos.length,
    pontos_criticos: pontos.filter((p) => p.gravidade === "critica").length,
    total_sancoes: sancoes.length,
    historico_descartado: 0,
    historico_em_revisao: false,
    timeline_partidaria_incompleta: false,
    section_freshness: buildSectionFreshness(candidato, {
      historico,
      mudancas,
      patrimonio,
      financiamento,
      votos,
      projetos,
      gastos,
      historicoEmRevisao: false,
      timelinePartidariaIncompleta: false,
    }),
  }
}

function getMockComparaveis(cargoFilter: string, estado?: string): CandidatoComparavel[] {
  return MOCK_CANDIDATOS
    .filter((c) => c.cargo_disputado === cargoFilter && (!estado || c.estado?.toLowerCase() === estado.toLowerCase()))
    .map((c) => ({
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

function warnDevMockFallback(functionName: string, error?: { message?: string } | null) {
  if (!IS_DEV) return
  const message = error?.message ?? "erro desconhecido"
  console.warn(`[api:${functionName}] usando mock por erro de Supabase: ${message}`)
}

function liveResource<T>(data: T, sourceMessage?: string | null): DataResource<T> {
  return {
    data,
    sourceStatus: "live",
    sourceMessage,
  }
}

function mockResource<T>(data: T, sourceMessage?: string | null): DataResource<T> {
  return {
    data,
    sourceStatus: "mock",
    sourceMessage:
      sourceMessage ??
      "Modo demonstracao ativo. Os dados exibidos estao vindo do fallback local.",
  }
}

function degradedResource<T>(data: T, sourceMessage?: string | null): DataResource<T> {
  return {
    data,
    sourceStatus: "degraded",
    sourceMessage:
      sourceMessage ??
      "Algumas fontes publicas nao responderam. O conteudo abaixo pode estar incompleto.",
  }
}

export function mergeSourceStatuses(
  ...statuses: Array<DataSourceStatus | undefined>
): DataSourceStatus {
  if (statuses.some((status) => status === "degraded")) return "degraded"
  if (statuses.some((status) => status === "mock")) return "mock"
  return "live"
}

export function mergeSourceMessages(
  ...messages: Array<string | null | undefined>
): string | null {
  return messages.find(Boolean) ?? null
}

export async function getCandidatosResource(
  cargo?: string
): Promise<DataResource<Candidato[]>> {
  if (USE_MOCK) {
    return mockResource(getMockCandidatos(cargo))
  }

  const supabase = createServerSupabaseClient()
  let query = supabase
    .from(CANDIDATO_PUBLIC_RELATION)
    .select(CANDIDATO_COLUMNS)
    .neq("status", "removido")

  if (cargo) {
    query = query.eq("cargo_disputado", cargo)
  }

  const { data, error } = await query.order("nome_urna")

  if (error || !data) {
    if (IS_DEV) {
      warnDevMockFallback("getCandidatos", error)
      return degradedResource(
        getMockCandidatos(cargo),
        "A fonte principal falhou. Exibindo fallback local para continuar a navegacao."
      )
    }
    console.error("getCandidatos failed:", error?.message)
    return degradedResource(
      [],
      "Nao foi possivel carregar a lista de candidatos nesta tentativa."
    )
  }
  return liveResource(data)
}

export async function getCandidatos(cargo?: string): Promise<Candidato[]> {
  return (await getCandidatosResource(cargo)).data
}

export async function getCandidatoBySlugResource(
  slug: string
): Promise<DataResource<FichaCandidato | null>> {
  if (USE_MOCK) {
    return mockResource(getMockFicha(slug))
  }

  const supabase = createServerSupabaseClient()

  const { data: candidato, error: candidatoError } = await supabase
    .from(CANDIDATO_PUBLIC_RELATION)
    .select(CANDIDATO_COLUMNS)
    .eq("slug", slug)
    .single()

  if (candidatoError) {
    if (IS_DEV) {
      warnDevMockFallback("getCandidatoBySlug", candidatoError)
      return degradedResource(
        getMockFicha(slug),
        "A ficha nao respondeu da fonte principal. Exibindo fallback local quando disponivel."
      )
    }
    console.error("getCandidatoBySlug failed:", candidatoError.message)
    return degradedResource(
      null,
      "Nao foi possivel carregar esta ficha agora. Tente novamente em instantes."
    )
  }

  if (!candidato) return liveResource(null)

  const id = candidato.id

  const [historico, mudancas, patrimonio, financiamento, votos, processos, pontos, projetos, gastos, sancoes, noticias, indicadores] =
    await Promise.all([
      supabase.from("historico_politico").select("*").eq("candidato_id", id).order("periodo_inicio", { ascending: false }),
      supabase
        .from("mudancas_partido")
        .select("*")
        .eq("candidato_id", id)
        .order("data_mudanca", { ascending: false, nullsFirst: false })
        .order("ano", { ascending: false }),
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

  const relatedErrors = [
    historico.error,
    mudancas.error,
    patrimonio.error,
    financiamento.error,
    votos.error,
    processos.error,
    pontos.error,
    projetos.error,
    gastos.error,
    sancoes.error,
    noticias.error,
    "error" in indicadores ? indicadores.error : null,
  ].filter(Boolean)

  const historicoConfiavel = historico.data ?? []
  const mudancasRaw = [...(mudancas.data ?? [])].sort(
    (a, b) => rankMudancaPartido(b) - rankMudancaPartido(a)
  )
  const timelinePartidariaIncompleta = hasIncompletePartyTimeline(
    mudancasRaw,
    candidato.partido_sigla,
    candidato.partido_atual
  )

  const ficha: FichaCandidato = {
    ...candidato,
    historico: historicoConfiavel,
    mudancas_partido: mudancasRaw,
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
    total_mudancas_partido: mudancasRaw.length,
    total_pontos_atencao: (pontos.data ?? []).length,
    pontos_criticos: (pontos.data ?? []).filter((p) => p.gravidade === "critica").length,
    total_sancoes: (sancoes.data ?? []).length,
    historico_descartado: 0,
    historico_em_revisao: false,
    timeline_partidaria_incompleta: timelinePartidariaIncompleta,
    section_freshness: buildSectionFreshness(candidato, {
      historico: historicoConfiavel,
      mudancas: mudancasRaw,
      patrimonio: patrimonio.data ?? [],
      financiamento: financiamento.data ?? [],
      votos: votos.data ?? [],
      projetos: projetos.data ?? [],
      gastos: gastos.data ?? [],
      historicoEmRevisao: false,
      timelinePartidariaIncompleta: timelinePartidariaIncompleta,
    }),
  }

  const integrityMessages: string[] = []
  if (timelinePartidariaIncompleta) {
    integrityMessages.push(
      "O historico partidario desta ficha ainda nao incorpora a filiacao atual publicada."
    )
  }

  if (relatedErrors.length > 0 || integrityMessages.length > 0) {
    return degradedResource(
      ficha,
      [
        relatedErrors.length > 0
          ? "Nem todas as fontes desta ficha responderam. Algumas secoes podem estar incompletas."
          : null,
        ...integrityMessages,
      ]
        .filter(Boolean)
        .join(" ")
    )
  }

  return liveResource(ficha)
}

export async function getCandidatoBySlug(slug: string): Promise<FichaCandidato | null> {
  return (await getCandidatoBySlugResource(slug)).data
}

export interface CandidatoResumo {
  candidato: Candidato
  patrimonio: number | null
  processos: number
  pontos_atencao: number
}

export async function getCandidatosComResumoResource(
  cargo?: string
): Promise<DataResource<CandidatoResumo[]>> {
  const candidatosResource = await getCandidatosResource(cargo)
  const candidatos = candidatosResource.data

  if (candidatosResource.sourceStatus !== "live") {
    return {
      ...candidatosResource,
      data: candidatos.map((c) => ({
        candidato: c,
        patrimonio: MOCK_PATRIMONIO[c.slug]?.[0]?.valor_total ?? null,
        processos: (MOCK_PROCESSOS[c.slug] ?? []).length,
        pontos_atencao: (MOCK_PONTOS[c.slug] ?? []).length,
      })),
    }
  }

  if (candidatos.length === 0) {
    return liveResource([])
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

  const data = candidatos.map((c) => ({
    candidato: c,
    patrimonio: patMap.get(c.id) ?? null,
    processos: procMap.get(c.id) ?? 0,
    pontos_atencao: pontosMap.get(c.id) ?? 0,
  }))

  if (patRes.error || procRes.error || pontosRes.error) {
    return degradedResource(
      data,
      "Nem todos os resumos puderam ser enriquecidos. Alguns totais podem estar zerados temporariamente."
    )
  }

  return liveResource(data)
}

export async function getCandidatosComResumo(cargo?: string): Promise<CandidatoResumo[]> {
  return (await getCandidatosComResumoResource(cargo)).data
}

export async function getCandidatosComparaveisResource(
  cargo?: string,
  estado?: string
): Promise<DataResource<CandidatoComparavel[]>> {
  const cargoFilter = cargo ?? "Presidente"
  if (USE_MOCK) {
    return mockResource(getMockComparaveis(cargoFilter, estado))
  }

  const supabase = createServerSupabaseClient()
  let query = supabase
    .from(CANDIDATO_PUBLIC_RELATION)
    .select("id")
    .neq("status", "removido")
    .eq("cargo_disputado", cargoFilter)

  if (estado) {
    query = query.ilike("estado", estado)
  }

  const { data: active, error: activeError } = await query
  if (activeError) {
    if (IS_DEV) {
      warnDevMockFallback("getCandidatosComparaveis", activeError)
      return degradedResource(
        getMockComparaveis(cargoFilter, estado),
        "A comparacao nao respondeu da fonte principal. Exibindo fallback local quando possivel."
      )
    }
    console.error("getCandidatosComparaveis failed:", activeError.message)
    return degradedResource(
      [],
      "Nao foi possivel carregar os candidatos comparaveis agora."
    )
  }

  const activeIds = new Set((active ?? []).map((c) => c.id))

  const { data, error: compareError } = await supabase.from("v_comparador").select("*").order("nome_urna")
  if (compareError) {
    if (IS_DEV) {
      warnDevMockFallback("getCandidatosComparaveis", compareError)
      return degradedResource(
        getMockComparaveis(cargoFilter, estado),
        "A view de comparacao falhou. Exibindo fallback local quando possivel."
      )
    }
    console.error("getCandidatosComparaveis failed:", compareError.message)
    return degradedResource(
      [],
      "Nao foi possivel montar a comparacao nesta tentativa."
    )
  }

  return liveResource((data ?? []).filter((c) => activeIds.has(c.id)))
}

export async function getCandidatosComparaveis(
  cargo?: string,
  estado?: string
): Promise<CandidatoComparavel[]> {
  return (await getCandidatosComparaveisResource(cargo, estado)).data
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
    .from(CANDIDATO_PUBLIC_RELATION)
    .select(CANDIDATO_COLUMNS)
    .neq("status", "removido")
    .eq("cargo_disputado", "Governador")
    .ilike("estado", uf)
    .order("nome_urna")

  if (error || !data) {
    if (IS_DEV) {
      warnDevMockFallback("getCandidatosPorEstado", error)
      return MOCK_CANDIDATOS.filter((c) => c.estado?.toLowerCase() === uf.toLowerCase())
    }
    return []
  }
  return data
}

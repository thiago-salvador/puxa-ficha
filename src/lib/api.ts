import "server-only"
import { unstable_cache } from "next/cache"
import {
  createServerSupabaseClient,
  createServiceRoleSupabaseClient,
  getAppSupabaseUrl,
} from "./supabase"
import type {
  Candidato,
  FichaCandidato,
  CandidatoComparavel,
  IndicadorEstadual,
  DataResource,
  DataSourceStatus,
  Financiamento,
  GastoParlamentar,
  HistoricoPolitico,
  MudancaPartido,
  Patrimonio,
  PontoAtencao,
  ProjetoLei,
  SectionFreshnessInfo,
  SectionFreshnessKey,
  VotoCandidato,
} from "./types"
import {
  hasIncompletePartyTimeline,
} from "@/lib/candidate-integrity"
import {
  classifyAttentionPoints,
  isNegativeCriticalAttentionPoint,
  isNegativeHighestSeverityAttentionPoint,
} from "@/lib/attention-points"
import { sleep } from "@/lib/async-utils"
import { getCanonicalPerson } from "@/lib/canonical-person-map"
import { formatDate } from "@/lib/utils"

const supabaseUrl = getAppSupabaseUrl()
const USE_MOCK = !supabaseUrl || supabaseUrl.includes("placeholder")
const IS_DEV = process.env.NODE_ENV === "development"
const IS_PRODUCTION_DEPLOY = process.env.VERCEL_ENV === "production"
const IS_LAUNCH_PHASE = process.env.PF_CURATION_PHASE === "launched"
const CANDIDATO_PUBLIC_RELATION = "candidatos_publico"
const APP_DATA_REVALIDATE_SECONDS = 3600
const PROFILE_FRESHNESS_WINDOW_DAYS = 30
const SUPABASE_RETRY_ATTEMPTS = 3
type MockModule = typeof import("@/data/mock")

let mockModulePromise: Promise<MockModule> | null = null

if (USE_MOCK && IS_PRODUCTION_DEPLOY) {
  throw new Error(
    "Producao nao pode usar fallback mock. Configure SUPABASE_URL/SUPABASE_ANON_KEY para o app e SUPABASE_SERVICE_ROLE_KEY para preview/scripts."
  )
}

// Public columns only: excludes cpf, email_campanha, cpf_hash, tcu flags, wikidata_id
const CANDIDATO_COLUMNS = "id, nome_completo, nome_urna, slug, data_nascimento, idade, naturalidade, formacao, profissao_declarada, genero, estado_civil, cor_raca, partido_atual, partido_sigla, cargo_atual, cargo_disputado, estado, status, situacao_candidatura, biografia, foto_url, site_campanha, redes_sociais, fonte_dados, ultima_atualizacao"

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function loadMockModule() {
  if (!mockModulePromise) {
    mockModulePromise = import("@/data/mock")
  }

  return mockModulePromise
}

async function withSupabaseRetry<T>(
  label: string,
  run: () => Promise<{ data: T | null; error: { message?: string } | null }>
): Promise<{ data: T | null; error: { message?: string } | null }> {
  let lastResult: { data: T | null; error: { message?: string } | null } | null = null
  let lastThrown: unknown = null

  for (let attempt = 1; attempt <= SUPABASE_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const result = await run()
      if (!result.error) {
        return result
      }
      lastResult = result
    } catch (error) {
      lastThrown = error
    }

    if (attempt < SUPABASE_RETRY_ATTEMPTS) {
      await sleep(attempt * 250)
    }
  }

  if (lastResult) {
    console.error(`${label} failed after retries:`, lastResult.error?.message)
    return lastResult
  }

  throw lastThrown instanceof Error ? lastThrown : new Error(`${label} failed after retries`)
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

function isVisibleAttentionPoint(visivel: boolean | null | undefined): boolean {
  return visivel === true
}

function isPublicAttentionPoint(ponto: Pick<PontoAtencao, "visivel" | "gerado_por" | "verificado">): boolean {
  return isVisibleAttentionPoint(ponto.visivel) && (ponto.gerado_por !== "ia" || ponto.verificado)
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

async function getMockCandidatos(cargo?: string, estado?: string): Promise<Candidato[]> {
  const { MOCK_CANDIDATOS } = await loadMockModule()

  return MOCK_CANDIDATOS.filter((candidato) => {
    if (cargo && candidato.cargo_disputado !== cargo) return false
    if (estado && candidato.estado?.toLowerCase() !== estado.toLowerCase()) return false
    return true
  })
}

async function getMockFicha(slug: string): Promise<FichaCandidato | null> {
  const {
    MOCK_CANDIDATOS,
    MOCK_FINANCIAMENTO,
    MOCK_GASTOS,
    MOCK_HISTORICO,
    MOCK_MUDANCAS,
    MOCK_NOTICIAS,
    MOCK_PATRIMONIO,
    MOCK_PONTOS,
    MOCK_PROCESSOS,
    MOCK_PROJETOS,
    MOCK_SANCOES,
    MOCK_VOTOS,
  } = await loadMockModule()
  const candidato = MOCK_CANDIDATOS.find((c) => c.slug === slug)
  if (!candidato) return null

  const canonical = getCanonicalPerson(slug)
  const relatedSlugs = canonical.slugs
  const ownPatrimonio = MOCK_PATRIMONIO[slug] ?? []
  const ownFinanciamento = MOCK_FINANCIAMENTO[slug] ?? []
  const historico = MOCK_HISTORICO[slug] ?? []
  const mudancas = MOCK_MUDANCAS[slug] ?? []
  const patrimonio =
    ownPatrimonio.length > 0
      ? ownPatrimonio
      : relatedSlugs.flatMap((relatedSlug) => MOCK_PATRIMONIO[relatedSlug] ?? [])
  const financiamento =
    ownFinanciamento.length > 0
      ? ownFinanciamento
      : relatedSlugs.flatMap((relatedSlug) => MOCK_FINANCIAMENTO[relatedSlug] ?? [])
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
    pontos_criticos: pontos.filter((p) => isNegativeHighestSeverityAttentionPoint(p)).length,
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

async function getMockComparaveis(
  cargoFilter: string,
  estado?: string
): Promise<CandidatoComparavel[]> {
  const { MOCK_CANDIDATOS, MOCK_PATRIMONIO, MOCK_PONTOS, MOCK_PROCESSOS } = await loadMockModule()

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
      alertas_graves: (MOCK_PONTOS[c.slug] ?? []).filter((p) => isNegativeCriticalAttentionPoint(p)).length,
      patrimonio_declarado: MOCK_PATRIMONIO[c.slug]?.[0]?.valor_total ?? null,
      pontos_atencao: MOCK_PONTOS[c.slug] ?? [],
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

async function getCandidatosResourceUncached(
  cargo?: string,
  estado?: string
): Promise<DataResource<Candidato[]>> {
  if (USE_MOCK) {
    return mockResource(await getMockCandidatos(cargo, estado))
  }

  const supabase = createServerSupabaseClient()
  const { data, error } = await withSupabaseRetry("getCandidatos", async () => {
    let query = supabase
      .from(CANDIDATO_PUBLIC_RELATION)
      .select(CANDIDATO_COLUMNS)
      .neq("status", "removido")

    if (cargo) {
      query = query.eq("cargo_disputado", cargo)
    }

    if (estado) {
      query = query.ilike("estado", estado)
    }

    return query.order("nome_urna")
  })

  if (error || !data) {
    if (IS_DEV) {
      warnDevMockFallback("getCandidatos", error)
      return degradedResource(
        await getMockCandidatos(cargo, estado),
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

const getCachedCandidatosResource = unstable_cache(
  async (cargo?: string, estado?: string) => getCandidatosResourceUncached(cargo, estado),
  ["public-candidatos-resource"],
  {
    revalidate: APP_DATA_REVALIDATE_SECONDS,
    tags: ["public-candidatos"],
  }
)

export async function getCandidatosResource(
  cargo?: string,
  estado?: string
): Promise<DataResource<Candidato[]>> {
  return getCachedCandidatosResource(cargo, estado)
}

export async function getCandidatos(cargo?: string, estado?: string): Promise<Candidato[]> {
  return (await getCandidatosResource(cargo, estado)).data
}

async function getCandidatoMetadataResourceUncached(
  slug: string
): Promise<DataResource<Candidato | null>> {
  if (USE_MOCK) {
    return mockResource((await getMockCandidatos()).find((candidato) => candidato.slug === slug) ?? null)
  }

  const supabase = createServerSupabaseClient()
  const { data, error } = await withSupabaseRetry<Candidato>(
    `getCandidatoMetadata(${slug})`,
    async () =>
      supabase
        .from(CANDIDATO_PUBLIC_RELATION)
        .select(CANDIDATO_COLUMNS)
        .eq("slug", slug)
        .single()
  )

  if (error) {
    if (IS_DEV) {
      warnDevMockFallback("getCandidatoMetadata", error)
      return degradedResource(
        (await getMockCandidatos()).find((candidato) => candidato.slug === slug) ?? null,
        "A ficha nao respondeu da fonte principal. Metadata reduzida pode ficar indisponivel."
      )
    }

    console.error("getCandidatoMetadata failed:", error.message)
    return degradedResource(
      null,
      "Nao foi possivel carregar os metadados desta ficha agora."
    )
  }

  return liveResource(data ?? null)
}

const getCachedCandidatoMetadataResource = unstable_cache(
  async (slug: string) => getCandidatoMetadataResourceUncached(slug),
  ["public-candidato-metadata-resource"],
  {
    revalidate: APP_DATA_REVALIDATE_SECONDS,
    tags: ["public-candidato-metadata"],
  }
)

export async function getCandidatoMetadataResource(
  slug: string
): Promise<DataResource<Candidato | null>> {
  return getCachedCandidatoMetadataResource(slug)
}

async function getCandidatoBySlugFromRelationResource(
  slug: string,
  relation: string,
  useServiceRole = false
): Promise<DataResource<FichaCandidato | null>> {
  if (USE_MOCK) {
    return mockResource(await getMockFicha(slug))
  }

  const shouldUseServiceRole = useServiceRole

  const supabase = shouldUseServiceRole
    ? createServiceRoleSupabaseClient({ cacheMode: "no-store" })
    : createServerSupabaseClient()

  const { data: candidato, error: candidatoError } = await withSupabaseRetry<Candidato>(
    `getCandidatoBySlug(${slug})`,
    async () =>
      supabase
        .from(relation)
        .select(CANDIDATO_COLUMNS)
        .eq("slug", slug)
        .single()
  )

  if (candidatoError) {
    if (IS_DEV) {
      warnDevMockFallback("getCandidatoBySlug", candidatoError)
      return degradedResource(
        await getMockFicha(slug),
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
  const canonical = getCanonicalPerson(slug)
  let personLevelIds = [id]

  if (canonical.slugs.length > 1) {
    const canonicalLookupRelation = shouldUseServiceRole ? "candidatos" : relation
    const { data: relatedCandidates, error: relatedError } = await withSupabaseRetry(
      `getCanonicalCandidates(${slug})`,
      async () =>
        supabase
          .from(canonicalLookupRelation)
          .select("id, slug")
          .in("slug", canonical.slugs)
    )

    if (!relatedError && relatedCandidates) {
      const relatedIds = relatedCandidates
        .map((item) => item.id)
        .filter((value): value is string => Boolean(value))

      if (relatedIds.length > 0) {
        personLevelIds = relatedIds
      }
    }
  }

  const [historico, mudancas, patrimonio, financiamento, votos, processos, pontos, projetos, gastos, sancoes, noticias, indicadores] =
    await Promise.all([
      withSupabaseRetry(`historico_politico(${slug})`, async () =>
        supabase.from("historico_politico").select("*").eq("candidato_id", id).order("periodo_inicio", { ascending: false })
      ),
      withSupabaseRetry(`mudancas_partido(${slug})`, async () =>
        supabase
          .from("mudancas_partido")
          .select("*")
          .eq("candidato_id", id)
          .order("data_mudanca", { ascending: false, nullsFirst: false })
          .order("ano", { ascending: false })
      ),
      withSupabaseRetry(`patrimonio(${slug})`, async () =>
        supabase.from("patrimonio").select("*").in("candidato_id", personLevelIds).order("ano_eleicao", { ascending: false })
      ),
      withSupabaseRetry(`financiamento(${slug})`, async () =>
        supabase.from("financiamento").select("*").in("candidato_id", personLevelIds).order("ano_eleicao", { ascending: false })
      ),
      withSupabaseRetry(`votos_candidato(${slug})`, async () =>
        supabase.from("votos_candidato").select("*, votacao:votacoes_chave(*)").eq("candidato_id", id)
      ),
      withSupabaseRetry(`processos(${slug})`, async () =>
        supabase.from("processos").select("*").eq("candidato_id", id)
      ),
      withSupabaseRetry(`pontos_atencao(${slug})`, async () =>
        supabase.from("pontos_atencao").select("*").eq("candidato_id", id).eq("visivel", true)
      ),
      withSupabaseRetry(`projetos_lei(${slug})`, async () =>
        supabase.from("projetos_lei").select("*").eq("candidato_id", id).order("ano", { ascending: false })
      ),
      withSupabaseRetry(`gastos_parlamentares(${slug})`, async () =>
        supabase.from("gastos_parlamentares").select("*").eq("candidato_id", id).order("ano", { ascending: false })
      ),
      withSupabaseRetry(`sancoes_administrativas(${slug})`, async () =>
        supabase.from("sancoes_administrativas").select("*").eq("candidato_id", id).order("data_inicio", { ascending: false })
      ),
      withSupabaseRetry(`noticias_candidato(${slug})`, async () =>
        supabase.from("noticias_candidato").select("*").eq("candidato_id", id).order("data_publicacao", { ascending: false }).limit(20)
      ),
      candidato.cargo_disputado === "Governador" && candidato.estado
        ? withSupabaseRetry(`indicadores_estaduais(${slug})`, async () =>
            supabase.from("indicadores_estaduais").select("*").ilike("estado", candidato.estado!).order("ano", { ascending: false })
          )
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

  const pontosPublicos = shouldUseServiceRole
    ? (pontos.data ?? [])
    : (pontos.data ?? []).filter((p) => isPublicAttentionPoint(p))

  const ficha: FichaCandidato = {
    ...candidato,
    historico: historicoConfiavel,
    mudancas_partido: mudancasRaw,
    patrimonio: patrimonio.data ?? [],
    financiamento: financiamento.data ?? [],
    votos: votos.data ?? [],
    processos: processos.data ?? [],
    pontos_atencao: pontosPublicos,
    projetos_lei: projetos.data ?? [],
    gastos_parlamentares: gastos.data ?? [],
    sancoes_administrativas: sancoes.data ?? [],
    noticias: noticias.data ?? [],
    indicadores_estaduais: indicadores.data ?? [],
    total_processos: (processos.data ?? []).length,
    processos_criminais: (processos.data ?? []).filter((p) => p.tipo === "criminal").length,
    total_mudancas_partido: mudancasRaw.length,
    total_pontos_atencao: pontosPublicos.length,
    pontos_criticos: pontosPublicos.filter((p) => isNegativeHighestSeverityAttentionPoint(p)).length,
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

export async function getCandidatoBySlugResource(
  slug: string
): Promise<DataResource<FichaCandidato | null>> {
  return getCachedCandidatoBySlugResource(slug)
}

export async function getCandidatoBySlugPreviewResource(
  slug: string
): Promise<DataResource<FichaCandidato | null>> {
  return getCandidatoBySlugFromRelationResource(slug, "candidatos", true)
}

async function getCandidatoBySlugResourceUncached(
  slug: string
): Promise<DataResource<FichaCandidato | null>> {
  return getCandidatoBySlugFromRelationResource(slug, CANDIDATO_PUBLIC_RELATION)
}

const getCachedCandidatoBySlugResource = unstable_cache(
  async (slug: string) => getCandidatoBySlugResourceUncached(slug),
  ["public-candidato-ficha-resource"],
  {
    revalidate: APP_DATA_REVALIDATE_SECONDS,
    tags: ["public-candidato-ficha"],
  }
)

export async function getCandidatoBySlug(slug: string): Promise<FichaCandidato | null> {
  return (await getCandidatoBySlugResource(slug)).data
}

export interface CandidatoResumo {
  candidato: Candidato
  patrimonio: number | null
  processos: number
  pontos_atencao: number
}

async function getCandidatosComResumoResourceUncached(
  cargo?: string,
  estado?: string
): Promise<DataResource<CandidatoResumo[]>> {
  const candidatosResource = await getCandidatosResource(cargo, estado)
  const candidatos = candidatosResource.data

  if (candidatosResource.sourceStatus !== "live") {
    const { MOCK_PATRIMONIO, MOCK_PONTOS, MOCK_PROCESSOS } = await loadMockModule()

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
  const { data: compareRows, error: compareError } = await withSupabaseRetry(
    "v_comparador(resumo)",
    async () => {
      let query = supabase
        .from("v_comparador")
        .select("id, cargo_disputado, estado, total_processos, patrimonio_declarado, pontos_atencao")

      if (cargo) {
        query = query.eq("cargo_disputado", cargo)
      }

      if (estado) {
        query = query.ilike("estado", estado)
      }

      return query
    }
  )

  const compareMap = new Map<
    string,
    { patrimonio: number | null; processos: number; pontosAtencao: number }
  >()
  for (const row of compareRows ?? []) {
    compareMap.set(row.id, {
      patrimonio: row.patrimonio_declarado ?? null,
      processos: row.total_processos ?? 0,
      pontosAtencao: Array.isArray(row.pontos_atencao) ? row.pontos_atencao.length : 0,
    })
  }

  const data = candidatos.map((c) => ({
    candidato: c,
    patrimonio: compareMap.get(c.id)?.patrimonio ?? null,
    processos: compareMap.get(c.id)?.processos ?? 0,
    pontos_atencao: compareMap.get(c.id)?.pontosAtencao ?? 0,
  }))

  if (compareError) {
    return degradedResource(
      data,
      "Nem todos os resumos puderam ser enriquecidos. Alguns totais podem estar zerados temporariamente."
    )
  }

  return liveResource(data)
}

const getCachedCandidatosComResumoResource = unstable_cache(
  async (cargo?: string, estado?: string) =>
    getCandidatosComResumoResourceUncached(cargo, estado),
  ["public-candidatos-resumo-resource"],
  {
    revalidate: APP_DATA_REVALIDATE_SECONDS,
    tags: ["public-candidatos-resumo"],
  }
)

export async function getCandidatosComResumoResource(
  cargo?: string,
  estado?: string
): Promise<DataResource<CandidatoResumo[]>> {
  return getCachedCandidatosComResumoResource(cargo, estado)
}

export async function getCandidatosComResumo(
  cargo?: string,
  estado?: string
): Promise<CandidatoResumo[]> {
  return (await getCandidatosComResumoResource(cargo, estado)).data
}

async function getCandidatosComparaveisResourceUncached(
  cargo?: string,
  estado?: string
): Promise<DataResource<CandidatoComparavel[]>> {
  const cargoFilter = cargo ?? "Presidente"
  if (USE_MOCK) {
    return mockResource(await getMockComparaveis(cargoFilter, estado))
  }

  const supabase = createServerSupabaseClient()
  const { data, error: compareError } = await withSupabaseRetry(
    `v_comparador(${cargoFilter}${estado ? `:${estado}` : ""})`,
    async () => {
      let query = supabase
        .from("v_comparador")
        .select("*")
        .eq("cargo_disputado", cargoFilter)

      if (estado) {
        query = query.ilike("estado", estado)
      }

      return query.order("nome_urna")
    }
  )
  if (compareError) {
    if (IS_DEV) {
      warnDevMockFallback("getCandidatosComparaveis", compareError)
      return degradedResource(
        await getMockComparaveis(cargoFilter, estado),
        "A view de comparacao falhou. Exibindo fallback local quando possivel."
      )
    }
    console.error("getCandidatosComparaveis failed:", compareError.message)
    return degradedResource(
      [],
      "Nao foi possivel montar a comparacao nesta tentativa."
    )
  }

  const normalizedRows = (data ?? []).map((row) => {
    const pontos = Array.isArray(row.pontos_atencao) ? row.pontos_atencao : []
    const { alertasGraves } = classifyAttentionPoints(pontos)

    return {
      ...row,
      alertas_graves: alertasGraves.length,
    }
  })

  return liveResource(normalizedRows)
}

const getCachedCandidatosComparaveisResource = unstable_cache(
  async (cargo?: string, estado?: string) =>
    getCandidatosComparaveisResourceUncached(cargo, estado),
  ["public-candidatos-comparaveis-resource"],
  {
    revalidate: APP_DATA_REVALIDATE_SECONDS,
    tags: ["public-candidatos-comparaveis"],
  }
)

export async function getCandidatosComparaveisResource(
  cargo?: string,
  estado?: string
): Promise<DataResource<CandidatoComparavel[]>> {
  return getCachedCandidatosComparaveisResource(cargo, estado)
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

export function getEstadoNome(uf: string): string | null {
  return UF_NAMES[uf.toLowerCase()] ?? null
}

export function getEstadoUFs(): string[] {
  return Object.keys(UF_NAMES)
}

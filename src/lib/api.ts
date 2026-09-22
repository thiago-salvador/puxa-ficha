import "server-only"
import { cache } from "react"
import { unstable_noStore as noStore } from "next/cache"
import { headers } from "next/headers"
import { buildFinanciamentoContexto } from "@/lib/quiz-financiamento"
import { createServerSupabaseClient, createServiceRoleSupabaseClient, getAppSupabaseUrl } from "./supabase"
import { isSupabaseNoRowError } from "./supabase-errors"
import { selectWithPreMigrationColumns } from "./supabase-pre-migration-select"
import { resolveReleaseVerifyCacheBypassToken } from "./production-env"
import { unstableCacheWithSingleFlight } from "./cache-single-flight"
import { normalizeVotoFromApi } from "@/lib/quiz-scoring"
import { SIGLAS_PROJETO_LEI } from "@/lib/proposicao-natureza"
import type { QuizAlignmentDataset, QuizCandidatoData, QuizContradicaoVoto, QuizPosicaoDeclarada } from "@/lib/quiz-types"
import type { Candidato, Chapa2026, FichaCandidato, CandidatoComparavel, IndicadorEstadual, IndicadorEstadualRanking, DataResource, LegislacaoMandatoExecutivo, MudancaPartido, PatrimonioAusenciaOficial, ProjetoLei, SancoesVerificacao, TCUVerificacao, TransparenciaFamiliaPublica, TransparenciaFamiliaVerificacao } from "./types"
import { buildGlobalSearchIndexItems, GLOBAL_SEARCH_CANDIDATE_COLUMNS, mergeVotacaoTagsByCandidatoId, type GlobalSearchCandidateRow, type GlobalSearchIndexItem, type VotacaoSearchRow } from "@/lib/global-search"
import {
  countPartySwitches,
  normalizePartyTimelineForDisplay,
  withCurrentRegistryPartyRow,
} from "@/lib/party-switches"
import { newsTitleMentionsCandidate } from "@/lib/news/name-match"
import { splitNewsByDenylist } from "@/lib/news/denylist"
import { newsRetentionCutoffIso } from "@/lib/operational-retention"
import { fetchGastoTotalsByCandidatoIds, fetchCargoAtualByCandidatoIds, fetchLegislacaoMandatoExecutivoRowsPaged, fetchLegislativeHistoryFlagsByCandidatoIds, fetchMudancasPartidoRowsPaged, fetchPatrimonioSeriesByCandidatoIds, LEGISLACAO_MANDATO_EXECUTIVO_PROFILE_PREVIEW_LIMIT, LEGISLACAO_MANDATO_EXECUTIVO_PUBLIC_SELECT } from "@/lib/fetch-gastos-votos-in-batch"
import { applyLegislacaoMandatoExecutivoCachePolicy } from "@/lib/legislacao-mandato-executivo-cache"
import { sortVotosForPublicDisplay } from "@/lib/votos-candidato-aggregate"
import { hasIncompletePartyTimeline } from "@/lib/candidate-integrity"
import { buildPatrimonioEleicoes, publicTransparencia } from "@/lib/public-profile-dto"
import { buildFinanciamentoEleicoes, type FinanciamentoVerificacaoPublica } from "@/lib/financiamento-eleicoes"
import { ensureCurrentCandidacyInHistory, normalizeHistoricoPoliticoForDisplay } from "@/lib/historico-dedupe"
import { processoPodeContarComoCriminal } from "@/lib/processos-display"
import { normalizeFinanciamentoForDisplay, normalizePatrimonioForDisplay } from "@/lib/person-level-dedupe"
import { sanitizeFinanciamentoForPublic, sanitizeMaioresDoadoresForPublic } from "@/lib/financiamento-public"
import {
  DOADOR_RECORRENTE_PUBLICO_COLUMNS,
  agruparDoadoresRecorrentes,
  type DoadorRecorrentePublico,
  type DoadorRecorrenteViewRow,
} from "@/lib/doador-recorrente-publico"
import { isPublicAttentionPoint } from "@/lib/public-attention-point"
import { sanitizePublicPartyFields, sanitizePublicPartyFieldsList } from "@/lib/public-candidate-sanitize"
import { classifyAttentionPoints, isNegativeHighestSeverityAttentionPoint } from "@/lib/attention-points"
import { SUPABASE_FIRST_FOLD_ATTEMPT_TIMEOUT_MS, withSupabaseRetry, type SupabaseRunResult } from "@/lib/supabase-retry"
import { getCanonicalPerson } from "@/lib/canonical-person-map"
import { evolucaoPatrimonialVs2026, type PatrimonioAnoValor } from "@/lib/evolucao-patrimonial"
import { patrimonioDeclaradoAtipico } from "@/lib/patrimonio-atipico"
import { buildVotacaoPublicUrl } from "@/lib/quiz-votacao-url"
import {
  resolveQuizVotacaoCatalog,
  QUIZ_VOTACAO_REFERENCIAS,
  type QuizVotacaoCatalogRow,
} from "@/lib/quiz-votacao-references"
import { getRankingDefinitionBySlug } from "@/data/ranking-definitions"
import { buildAggregateRankingEntries, buildFieldRankingEntries, normalizeRankingFilters, sortRankingEntries, type RankingCandidateSummary, type RankingDataset, type RankingDefinition, type RankingEntry, type RankingFieldCandidate } from "@/lib/rankings"
import { degradedResource, liveResource, mergeSourceMessages, mergeSourceStatuses } from "@/lib/data-resource"
import {
  buildSectionFreshness,
  FEDERAL_ACERVO_SOURCES,
  resolveFederalVotacoesNotApplicable,
  sanitizeFiliacaoDetail,
  type FederalAcervoReceipts,
  type FederalAcervoSource,
  type ExecutiveScopeReceipt,
} from "@/lib/candidate-section-freshness"
import { isSenadoEnabled, shouldExposeCargo } from "@/lib/senado-feature"
import { projectProcessosVerificacaoRow } from "@/lib/processos-verificacao-public"
import { normalizeFotoCredito } from "@/lib/foto-credito"
import { parseFederalAcervoReceiptDetail, projectFederalAcervoReceipts } from "@/lib/federal-acervo-receipts"
export { mergeSourceMessages, mergeSourceStatuses } from "@/lib/data-resource"
export { parseFederalAcervoReceiptDetail, projectFederalAcervoReceipts } from "@/lib/federal-acervo-receipts"

/** Único ponto de bump para invalidar todas as superfícies públicas em cache. */
export const CURRENT_DATA_WAVE = "ceaps-utf8-20260821"

const supabaseUrl = getAppSupabaseUrl()
const USE_MOCK = !supabaseUrl || supabaseUrl.includes("placeholder")
const IS_DEV = process.env.NODE_ENV === "development"
/** Mensagem quando não há Supabase: não servimos números ou datas sintéticos na API pública. */
const SUPABASE_REQUIRED_MESSAGE =
  "Configure SUPABASE_URL (sem placeholder) e SUPABASE_ANON_KEY em .env.local. O site não exibe dados mock."
const CANDIDATO_PUBLIC_RELATION = "candidatos_publico"
const APP_DATA_REVALIDATE_SECONDS = 3600
// The cohort flag is part of every public cache identity. This prevents a
// Senate-enabled local cache from surviving a closed-flag render.
const SENADO_CACHE_VARIANT = isSenadoEnabled() ? "senado-on" : "senado-off"
// 2026-08-03: `select("*")` em projetos_lei trazia `metadata` (jsonb), que sozinho
// responde por 60% do peso da tabela (8,9 MB de 14 MB, media de 651 bytes por linha)
// e nao e lido em lugar nenhum do app: a única leitura de `.metadata` no codigo e de
// LegislacaoMandatoExecutivo, entidade diferente. `coverage_scope` (81 bytes por
// linha) e `created_at` tambem nao sao consumidos. Como esta query e 14,4% do tempo
// total do banco e sua cauda encostava no teto de `statement_timeout = 3s` do role
// `anon` (max_exec_time medido em 2994ms), cortar as colunas mortas reduz o payload
// sem mudar nada do que a ficha renderiza.
const PROJETOS_LEI_COLUNAS =
  "id, candidato_id, tipo, numero, ano, ementa, tema, situacao, url_inteiro_teor, destaque, destaque_motivo, fonte, proposicao_id_api, coverage_id"
if (USE_MOCK && process.env.VERCEL) {
  throw new Error(
    "Na Vercel é obrigatório Supabase real (SUPABASE_URL sem placeholder e SUPABASE_ANON_KEY). Previews e produção não servem dados mock."
  )
}

// Public columns only: excludes cpf, email_campanha, cpf_hash, tcu flags, wikidata_id
const CANDIDATO_COLUMNS = "id, nome_completo, nome_urna, slug, data_nascimento, idade, naturalidade, formacao, profissao_declarada, genero, estado_civil, cor_raca, partido_atual, partido_sigla, cargo_atual, cargo_disputado, estado, status, situacao_candidatura, biografia, foto_url, site_campanha, redes_sociais, fonte_dados, ultima_atualizacao, verificacao_campos, foto_credito, formacao_instituicao"
const CANDIDATO_COLUMNS_WITHOUT_FORMACAO_INSTITUICAO = CANDIDATO_COLUMNS.replace(/, formacao_instituicao$/, "")
const CANDIDATO_COLUMNS_WITHOUT_PHOTO_CREDIT = CANDIDATO_COLUMNS_WITHOUT_FORMACAO_INSTITUICAO.replace(/, foto_credito$/, "")
const CANDIDATO_COLUMNS_LEGACY = CANDIDATO_COLUMNS_WITHOUT_PHOTO_CREDIT.replace(/, verificacao_campos$/, "")

const PATRIMONIO_AUSENCIA_OFICIAL_COLUMNS =
  "ano_eleicao, ano_arquivo, sq_candidato, uf_candidatura, cargo_candidatura, data_eleicao, tipo_eleicao, fonte_url, verificado_em, detalhe"
/** Conjunto lido em origin/main (93455ebc), antes de 20260915220000. */
const PATRIMONIO_AUSENCIA_OFICIAL_COLUMNS_PRE_MIGRATION = "ano_eleicao, fonte_url, verificado_em"
const FINANCIAMENTO_VERIFICACOES_PUBLICO_COLUMNS =
  "ano_eleicao, sq_candidato, uf_candidatura, cargo_candidatura, resultado, fonte_url, verificado_em, detalhe"
/** Conjunto lido em origin/main (93455ebc), antes de 20260915210000. */
const FINANCIAMENTO_VERIFICACOES_PUBLICO_COLUMNS_PRE_MIGRATION =
  "ano_eleicao, resultado, fonte_url, verificado_em, detalhe"

function isMissingOptionalCandidateColumnError(error: { message?: string } | null | undefined): boolean {
  return /foto_credito|verificacao_campos|column .* does not exist/i.test(error?.message ?? "")
}

function resolveCampaignSite(candidato: Candidato): string | null {
  if (candidato.site_campanha?.trim()) return candidato.site_campanha.trim()
  const official = candidato.redes_sociais?.site_oficial
  return typeof official === "string" && /^https?:\/\//i.test(official.trim())
    ? official.trim()
    : null
}

/** Rejeições do loader não podem virar um 503 persistente no Data Cache. */
function requireLiveResourceForCache<T>(resource: DataResource<T>): DataResource<T> {
  if (resource.sourceStatus !== "live") {
    throw new Error("degraded resource must not enter the public data cache")
  }
  return resource
}

/**
 * Falha transiente que NÃO pode entrar no Data Cache (incidente 2026-08-02):
 * um `degradedResource` retornado DENTRO de `unstable_cache` era congelado por
 * APP_DATA_REVALIDATE_SECONDS (1h) e servido instantaneamente para todo mundo,
 * então 45s de instabilidade viravam 1h de home vazia. A função em cache lança
 * este erro (rejeição não é cacheada), e o wrapper exportado converte de volta
 * no MESMO degradedResource fora do cache via `degradedFromError`, preservando
 * o contrato dos callers. Ficha e metadata já usavam a variante
 * `requireLiveResourceForCache` (suffix no-cache-degraded-v1); esta cobre os
 * recursos restantes carregando a mensagem original.
 *
 * Degradação PARCIAL com dados reais (busca sem temas de votação, resumo sem
 * enriquecimento, quiz sem mapa de votações) continua retornando resource e
 * sendo cacheável de propósito: há conteúdo verdadeiro para servir.
 */
class DegradedDataError extends Error {
  readonly sourceMessage: string | null

  constructor(sourceMessage: string | null | undefined) {
    super(sourceMessage ?? "recurso degradado por falha transiente")
    this.name = "DegradedDataError"
    this.sourceMessage = sourceMessage ?? null
  }
}

/**
 * Degradação PARCIAL: há dado verdadeiro para servir (os nomes da lista), mas
 * parte dos números veio zerada. Diferente da falha total, o payload precisa
 * chegar ao usuário; o que não pode é entrar no Data Cache, porque congela os
 * zeros por APP_DATA_REVALIDATE_SECONDS. Incidente 2026-08-04, véspera do
 * lançamento: um timeout de segundos em `v_comparador` deixou a home uma hora
 * inteira com processos, patrimônio e pontos de atenção zerados, que é
 * justamente o conteúdo que dá sentido ao site.
 */
class PartialDegradedDataError<T> extends Error {
  readonly sourceMessage: string | null
  readonly partialData: T

  constructor(partialData: T, sourceMessage: string | null | undefined) {
    super(sourceMessage ?? "recurso parcialmente degradado")
    this.name = "PartialDegradedDataError"
    this.sourceMessage = sourceMessage ?? null
    this.partialData = partialData
  }
}

/**
 * Executa o recurso fora do cache e, se ele voltar degradado, rejeita com o
 * payload em mãos. Rejeição não entra no `unstable_cache`, então a próxima
 * requisição tenta de novo em vez de servir o estado ruim congelado.
 */
async function rejectPartialForCache<T>(
  resource: Promise<DataResource<T>>
): Promise<DataResource<T>> {
  const resolved = await resource
  if (resolved.sourceStatus !== "live") {
    throw new PartialDegradedDataError(resolved.data, resolved.sourceMessage)
  }
  return resolved
}

type ResumoEnriquecimento = {
  patrimonio: number | null
  processos: number
  pontosAtencao: number
}

/**
 * Último enriquecimento bem-sucedido por candidato, na memória da instância.
 * Serve de rede quando `v_comparador` não responde: em vez de publicar "0
 * processos" para quem tem processo, o card repete o número que já era
 * verdadeiro. Some quando a instância morre, e isso é aceitável: o pior caso
 * volta a ser o zero de hoje, nunca um número inventado.
 */
const ULTIMO_ENRIQUECIMENTO = new Map<string, ResumoEnriquecimento>()

function lembrarEnriquecimento(mapa: Map<string, ResumoEnriquecimento>): void {
  for (const [id, valores] of mapa) {
    ULTIMO_ENRIQUECIMENTO.set(id, valores)
  }
}

function ultimoEnriquecimento(id: string): ResumoEnriquecimento | undefined {
  return ULTIMO_ENRIQUECIMENTO.get(id)
}

/** Converte o throw da camada de cache no degradedResource de sempre; o resto sobe. */
function degradedFromError<T>(error: unknown, fallbackData: T): DataResource<T> {
  if (error instanceof PartialDegradedDataError) {
    return degradedResource(error.partialData as T, error.sourceMessage)
  }
  if (error instanceof DegradedDataError) {
    return degradedResource(fallbackData, error.sourceMessage)
  }
  throw error
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

// Mapper publico do payload LME serializado em unstable_cache.
//
// Reduzido em 2026-05-01 para manter o payload de unstable_cache abaixo do
// limite de 2 MB do Vercel Data Cache. Build warning observado em 25202862956
// (Auditoria factual @ 55a40c5):
//   "Failed to set Next.js data cache for unstable_cache /candidato/[slug]
//    ..., items over 2MB can not be cached (2971512 bytes)"
// Slug de pior caso conhecido: romeu-zema (2548 LME rows, 3.21 MB cru).
//
// Campos zerados/anulados aqui (sem regressão de UI/UX porque NAO sao lidos
// por src/components/CandidatoProfileSections.tsx nem por outros consumidores
// do payload publico):
//   - candidato_id, historico_politico_id, created_at: identificadores
//     internos / timestamp de servidor; UI usa apenas `lei.id` para timeline-ref.
//   - fonte_primaria_titulo, fonte_tramitacao_url, identificador_fonte: a UI
//     renderiza apenas `fonte_primaria_url` como link "Fonte oficial".
//   - metadata.{coverage_label,case_id,source,data_real,fluxo}: a UI consome
//     apenas `metadata.coverage_id` em legislacao-profile-groups
//     (whitelist COMPLETE_EXECUTIVE_LEGISLATION_COVERAGE).
// Mantidos: id (timeline-ref), tipo_relacao/esfera/uf_norma/tipo_norma/numero/ano/
// data_norma/ementa/signatario/autoridade_papel/fonte_primaria_url, e
// metadata.coverage_id.
//
// O contrato de tipo (LegislacaoMandatoExecutivo) e' preservado: campos string
// nao-nullable recebem "" e campos nullable recebem null. Consumidores UI nao
// usam essas propriedades; consumidores de DB ingest leem direto do banco
// (nao deste mapper publico).
function toPublicLegislacaoMandatoExecutivoRow(
  row: LegislacaoMandatoExecutivo
): LegislacaoMandatoExecutivo {
  const metadata = row.metadata ?? {}
  const publicMetadata: Record<string, unknown> = {}
  if (metadata["coverage_id"] !== undefined) {
    publicMetadata["coverage_id"] = metadata["coverage_id"]
  }

  return {
    id: row.id,
    candidato_id: "",
    historico_politico_id: null,
    tipo_relacao: row.tipo_relacao,
    esfera: row.esfera,
    uf_norma: row.uf_norma,
    municipio_norma: row.municipio_norma,
    tipo_norma: row.tipo_norma,
    numero: row.numero,
    ano: row.ano,
    data_norma: row.data_norma,
    ementa: row.ementa,
    signatario: row.signatario,
    autoridade_papel: row.autoridade_papel,
    fonte_primaria_url: row.fonte_primaria_url,
    fonte_primaria_titulo: null,
    fonte_tramitacao_url: null,
    identificador_fonte: null,
    metadata: publicMetadata,
    created_at: "",
  }
}

function warnDevSupabaseFailure(functionName: string, error?: { message?: string } | null) {
  if (!IS_DEV) return
  const message = error?.message ?? "erro desconhecido"
  console.warn(`[api:${functionName}] Supabase indisponível — resposta vazia (sem dados sintéticos): ${message}`)
}

async function getCandidatosResourceUncached(
  cargo?: string,
  estado?: string
): Promise<DataResource<Candidato[]>> {
  if (!shouldExposeCargo(cargo)) {
    return degradedResource([], "A cobertura do Senado está desativada nesta consulta.")
  }
  if (USE_MOCK) {
    return degradedResource([], SUPABASE_REQUIRED_MESSAGE)
  }

  const supabase = createServerSupabaseClient()
  const load = (columns: string) => withSupabaseRetry<Candidato[]>("getCandidatos", async (signal) => {
    let query = supabase
      .from(CANDIDATO_PUBLIC_RELATION)
      .select(columns)
      .neq("status", "removido")

    if (cargo) query = query.eq("cargo_disputado", cargo)
    else if (!isSenadoEnabled()) query = query.neq("cargo_disputado", "Senador")
    if (estado) query = query.ilike("estado", estado)

    return query.order("nome_urna").abortSignal(signal) as unknown as SupabaseRunResult<Candidato[]>
  }, { attemptTimeoutMs: SUPABASE_FIRST_FOLD_ATTEMPT_TIMEOUT_MS })
  let result = await load(CANDIDATO_COLUMNS)
  if (isMissingOptionalCandidateColumnError(result.error)) {
    result = await load(CANDIDATO_COLUMNS_WITHOUT_FORMACAO_INSTITUICAO)
  }
  if (isMissingOptionalCandidateColumnError(result.error)) {
    result = await load(CANDIDATO_COLUMNS_WITHOUT_PHOTO_CREDIT)
  }
  if (isMissingOptionalCandidateColumnError(result.error)) {
    result = await load(CANDIDATO_COLUMNS_LEGACY)
  }
  const { data, error } = result

  if (error || !data) {
    if (IS_DEV) {
      warnDevSupabaseFailure("getCandidatos", error)
    } else {
      console.error("getCandidatos failed:", error?.message)
    }
    // Lançar (não retornar degraded): rejeição não entra no unstable_cache.
    throw new DegradedDataError(
      "Não foi possível carregar a lista de candidatos nesta tentativa."
    )
  }
  // Sanitizacao publica de partido_sigla/partido_atual centralizada aqui
  // (substitui as 4 fronteiras do Bloco 1: CandidatoFichaView, embed/page.tsx,
  // uf/[uf]/page.tsx, preview/candidato/[slug]/page.tsx). Ver
  // src/lib/public-candidate-sanitize.ts.
  return liveResource(sanitizePublicPartyFieldsList(data as Candidato[]))
}

const getCachedCandidatosResource = unstableCacheWithSingleFlight(
  async (cargo?: string, estado?: string) => getCandidatosResourceUncached(cargo, estado),
  // Bumped 2026-04-26: payload publico agora carrega partido_sigla/partido_atual
  // ja sanitizados (incerto -> null, aliases canonicalizados via formatPartyPublicLabel).
  // Suffix bumpado para "central-party-sanitize" para invalidar cache antigo do Bloco 1.
  // Bumped 2026-05-15: swap da coorte presidencial remove tarcisio/eduardo-leite
  // da superficie publica e adiciona augusto-cury/cabo-daciolo/edmilson-costa.
  // Bumped 2026-05-22: publicacao da lista editorial de pre-candidatos dos lotes 1 e 2.
  ["public-candidatos-resource", "central-party-sanitize", "presidential-cohort-20260515", "public-profile-density-20260517", "pre-candidates-lote12-20260522", "photos-names-20260610", "andre-portugues-lote8-20260630", "escopo-executivo-20260726", "cache-poison-fix-20260802", "chapas-tse-20260815", "onda-p-20260814", "party-siglas-lote2-20260815", "candidate-roster-cas-20260915", SENADO_CACHE_VARIANT, CURRENT_DATA_WAVE],
  {
    revalidate: APP_DATA_REVALIDATE_SECONDS,
    tags: ["public-candidatos"],
  }
)

export async function getCandidatosResource(
  cargo?: string,
  estado?: string
): Promise<DataResource<Candidato[]>> {
  if (!shouldExposeCargo(cargo)) {
    return degradedResource([], "A cobertura do Senado está desativada nesta consulta.")
  }
  try {
    const resource = await getCachedCandidatosResource(cargo, estado)
    if (!isSenadoEnabled() && !cargo) {
      return { ...resource, data: resource.data.filter((candidate) => candidate.cargo_disputado !== "Senador") }
    }
    return resource
  } catch (error) {
    return degradedFromError(error, [] as Candidato[])
  }
}

/**
 * Lista enxuta para navegação prev/next entre fichas do mesmo cargo. A ficha só
 * lê `slug` e `nome_urna` para montar os links anterior/próximo, então projetar
 * apenas essas duas colunas (em vez das 25 de CANDIDATO_COLUMNS via
 * getCandidatosResource) corta tempo de serialize e o tamanho do payload em
 * cache na rota mais quente do site.
 */
export interface CandidatoNavItem {
  slug: string
  nome_urna: string
}

async function getCandidatoNavResourceUncached(
  cargo?: string,
  estado?: string
): Promise<DataResource<CandidatoNavItem[]>> {
  if (!shouldExposeCargo(cargo)) {
    return degradedResource([], "A cobertura do Senado está desativada nesta consulta.")
  }
  if (USE_MOCK) {
    return degradedResource([], SUPABASE_REQUIRED_MESSAGE)
  }

  const supabase = createServerSupabaseClient()
  const { data, error } = await withSupabaseRetry("getCandidatoNav", async (signal) => {
    let query = supabase
      .from(CANDIDATO_PUBLIC_RELATION)
      .select("slug, nome_urna")
      .neq("status", "removido")

    if (cargo) {
      query = query.eq("cargo_disputado", cargo)
    } else if (!isSenadoEnabled()) {
      query = query.neq("cargo_disputado", "Senador")
    }

    // Disputa estadual navega dentro da própria UF; sem o filtro, o anel era
    // "Governador" nacional em ordem alfabética e o Próximo saltava de estado
    // (Alan Rick/AC → Alexandre Kalil/MG, reportado em 15/08).
    if (estado) {
      query = query.eq("estado", estado)
    }

    return query.order("nome_urna").abortSignal(signal)
  })

  if (error || !data) {
    if (IS_DEV) {
      warnDevSupabaseFailure("getCandidatoNav", error)
    } else {
      console.error("getCandidatoNav failed:", error?.message)
    }
    throw new DegradedDataError(
      "Não foi possível carregar a navegação entre candidatos nesta tentativa."
    )
  }

  return liveResource(data as CandidatoNavItem[])
}

const getCachedCandidatoNavResource = unstableCacheWithSingleFlight(
  async (cargo?: string, estado?: string) => getCandidatoNavResourceUncached(cargo, estado),
  ["public-candidato-nav-resource", "slug-nome-urna-20260603", "escopo-executivo-20260726", "cache-poison-fix-20260802", "chapas-tse-20260815", "onda-p-20260814", "nav-por-disputa-20260815", "candidate-roster-cas-20260915", SENADO_CACHE_VARIANT, CURRENT_DATA_WAVE],
  {
    revalidate: APP_DATA_REVALIDATE_SECONDS,
    tags: ["public-candidatos"],
  }
)

export async function getCandidatoNavResource(
  cargo?: string,
  estado?: string
): Promise<DataResource<CandidatoNavItem[]>> {
  if (!shouldExposeCargo(cargo)) {
    return degradedResource([], "A cobertura do Senado está desativada nesta consulta.")
  }
  try {
    return await getCachedCandidatoNavResource(cargo, estado)
  } catch (error) {
    return degradedFromError(error, [] as CandidatoNavItem[])
  }
}

/**
 * Contagem de candidatos por UF para os mapas de /parlamentares e /governadores.
 *
 * Os dois hubs chamavam `getCandidatosResource(cargo)` com as 28 colunas públicas
 * só para contar linhas por estado. Com a coorte do Senado, o payload medido de
 * `getCandidatosResource("Senador")` foi 2.610.993 bytes, acima do limite de 2 MB
 * por item do Data Cache do Next ("items over 2MB can not be cached"): a entrada
 * nunca era gravada e cada render voltava ao banco. Aqui a query projeta só
 * `estado` e o cache guarda o mapa UF -> contagem, que tem poucos bytes.
 */
async function getCandidatoCountByEstadoResourceUncached(
  cargo: string
): Promise<DataResource<Record<string, number>>> {
  if (!shouldExposeCargo(cargo)) {
    return degradedResource({}, "A cobertura do Senado está desativada nesta consulta.")
  }
  if (USE_MOCK) {
    return degradedResource({}, SUPABASE_REQUIRED_MESSAGE)
  }

  const supabase = createServerSupabaseClient()
  const { data, error } = await withSupabaseRetry<{ estado: string | null }[]>(
    "getCandidatoCountByEstado",
    async (signal) =>
      supabase
        .from(CANDIDATO_PUBLIC_RELATION)
        .select("estado")
        .neq("status", "removido")
        .eq("cargo_disputado", cargo)
        .abortSignal(signal) as unknown as SupabaseRunResult<{ estado: string | null }[]>,
    { attemptTimeoutMs: SUPABASE_FIRST_FOLD_ATTEMPT_TIMEOUT_MS }
  )

  if (error || !data) {
    if (IS_DEV) {
      warnDevSupabaseFailure("getCandidatoCountByEstado", error)
    } else {
      console.error("getCandidatoCountByEstado failed:", error?.message)
    }
    // Lançar (não retornar degraded): rejeição não entra no unstable_cache.
    throw new DegradedDataError(
      "Não foi possível carregar a lista de candidatos nesta tentativa."
    )
  }

  const counts: Record<string, number> = {}
  for (const row of data) {
    const uf = row.estado?.trim().toUpperCase()
    if (!uf) continue
    counts[uf] = (counts[uf] ?? 0) + 1
  }
  return liveResource(counts)
}

const getCachedCandidatoCountByEstadoResource = unstableCacheWithSingleFlight(
  async (cargo: string) => getCandidatoCountByEstadoResourceUncached(cargo),
  ["public-candidato-count-by-estado", "estado-only-20260916", SENADO_CACHE_VARIANT, CURRENT_DATA_WAVE],
  {
    revalidate: APP_DATA_REVALIDATE_SECONDS,
    tags: ["public-candidatos"],
  }
)

export async function getCandidatoCountByEstadoResource(
  cargo: string
): Promise<DataResource<Record<string, number>>> {
  if (!shouldExposeCargo(cargo)) {
    return degradedResource({}, "A cobertura do Senado está desativada nesta consulta.")
  }
  try {
    return await getCachedCandidatoCountByEstadoResource(cargo)
  } catch (error) {
    return degradedFromError(error, {} as Record<string, number>)
  }
}

/**
 * Candidatos do índice de busca global, só com as colunas que o índice lê.
 *
 * Antes o índice passava por `getCandidatosResource()`, que carrega todas as
 * colunas públicas de todos os cargos. Com os 309 candidatos ao Senado essa
 * lista passa de 2 MB (só `verificacao_campos` responde por ~2 MB dos
 * senadores) e a entrada `public-candidatos-resource` sem filtro deixava de
 * caber no Data Cache. Chamado só dentro do `unstable_cache` do índice, que já
 * é a camada persistente; não precisa de cache próprio.
 */
async function getGlobalSearchCandidatesUncached(): Promise<DataResource<GlobalSearchCandidateRow[]>> {
  const supabase = createServerSupabaseClient()
  const { data, error } = await withSupabaseRetry<GlobalSearchCandidateRow[]>(
    "getGlobalSearchCandidates",
    async (signal) => {
      let query = supabase
        .from(CANDIDATO_PUBLIC_RELATION)
        .select(GLOBAL_SEARCH_CANDIDATE_COLUMNS.join(","))
        .neq("status", "removido")
      if (!isSenadoEnabled()) query = query.neq("cargo_disputado", "Senador")
      return query.order("nome_urna").abortSignal(signal) as unknown as SupabaseRunResult<GlobalSearchCandidateRow[]>
    },
    { attemptTimeoutMs: SUPABASE_FIRST_FOLD_ATTEMPT_TIMEOUT_MS }
  )

  if (error || !data) {
    if (IS_DEV) {
      warnDevSupabaseFailure("getGlobalSearchCandidates", error)
    } else {
      console.error("getGlobalSearchCandidates failed:", error?.message)
    }
    // Mesma mensagem da lista completa: o contrato visível da busca não muda.
    throw new DegradedDataError(
      "Não foi possível carregar a lista de candidatos nesta tentativa."
    )
  }

  return liveResource(sanitizePublicPartyFieldsList(data))
}

const VOTACAO_SEARCH_PAGE_SIZE = 1000

function normalizeVotacaoSearchRow(raw: unknown): VotacaoSearchRow {
  const r = raw as { candidato_id: string; votacao: unknown }
  let votacao: { tema: string | null; titulo: string | null } | null = null
  if (Array.isArray(r.votacao)) {
    const v = r.votacao[0] as { tema?: string | null; titulo?: string | null } | undefined
    if (v && typeof v === "object") {
      votacao = { tema: v.tema ?? null, titulo: v.titulo ?? null }
    }
  } else if (r.votacao && typeof r.votacao === "object") {
    const v = r.votacao as { tema?: string | null; titulo?: string | null }
    votacao = { tema: v.tema ?? null, titulo: v.titulo ?? null }
  }
  return { candidato_id: r.candidato_id, votacao }
}

async function fetchAllVotacaoSearchRows(
  supabase: ReturnType<typeof createServerSupabaseClient>
): Promise<{ rows: VotacaoSearchRow[]; error: { message: string } | null }> {
  const rows: VotacaoSearchRow[] = []
  let offset = 0
  for (;;) {
    const { data, error } = await withSupabaseRetry(
      `votos_candidato-global-search-${offset}`,
      async (signal) =>
        supabase
          .from("votos_candidato")
          .select("candidato_id, votacao:votacoes_chave(tema, titulo)")
          .range(offset, offset + VOTACAO_SEARCH_PAGE_SIZE - 1)
          .abortSignal(signal)
    )
    if (error) {
      return { rows, error: { message: error.message ?? "unknown error" } }
    }
    const batch = (data ?? []).map(normalizeVotacaoSearchRow)
    rows.push(...batch)
    if (batch.length < VOTACAO_SEARCH_PAGE_SIZE) break
    offset += VOTACAO_SEARCH_PAGE_SIZE
  }
  return { rows, error: null }
}

async function getGlobalSearchIndexResourceUncached(): Promise<
  DataResource<GlobalSearchIndexItem[]>
> {
  if (USE_MOCK) {
    return degradedResource([], SUPABASE_REQUIRED_MESSAGE)
  }

  // Cascata: falha transiente na lista (USE_MOCK já retornou acima) lança
  // DegradedDataError e não pode virar índice vazio cacheado por mais 1h.
  const candidatosRes = await getGlobalSearchCandidatesUncached()
  const candidatos = candidatosRes.data

  if (candidatos.length === 0) {
    return {
      data: [],
      sourceStatus: candidatosRes.sourceStatus,
      sourceMessage: candidatosRes.sourceMessage,
    }
  }

  const supabase = createServerSupabaseClient()
  const { rows, error } = await fetchAllVotacaoSearchRows(supabase)

  let tagsById = new Map<string, { temas: string[]; titulos: string[] }>()
  let votosMessage: string | null = null

  if (error) {
    votosMessage =
      "Temas de votação não puderam ser carregados; a busca usa só nome, partido e estado."
    warnDevSupabaseFailure("global-search-votos", error)
    if (!IS_DEV) {
      console.error("global search votos_candidato failed:", error.message)
    }
  } else {
    tagsById = mergeVotacaoTagsByCandidatoId(rows)
  }

  const data = buildGlobalSearchIndexItems(candidatos, tagsById)

  const sourceStatus = mergeSourceStatuses(
    candidatosRes.sourceStatus,
    votosMessage ? "degraded" : "live"
  )
  const sourceMessage = mergeSourceMessages(candidatosRes.sourceMessage, votosMessage)

  return {
    data,
    sourceStatus,
    sourceMessage,
  }
}

const getCachedGlobalSearchIndexResource = unstableCacheWithSingleFlight(
  async () => rejectPartialForCache(getGlobalSearchIndexResourceUncached()),
  // Bumped 2026-04-26 (Bloco 1 review 2026-04-24): force one-time bust of Vercel
  // Data Cache so the new subtitle/searchText (without raw 'incerto') is exercised.
  //
  // Bumped 2026-07-26 (`escopo-executivo-20260726`): a despublicacao de Senado e
  // Camara (migration 20260726120000) mudou a coorte no banco, mas o indice de
  // busca continuou servindo os 195 antigos. Efeito visivel: buscar "Eduardo
  // Braga" achava o candidato e levava a uma ficha 404. O Data Cache da Vercel
  // sobrevive a deploy, e a rota de revalidacao por tag depende de
  // PF_REVALIDATE_SECRET, entao o bump da chave e o caminho que funciona sem
  // segredo. Mesma chave aplicada a todos os resources que listam candidatos.
  ["global-search-index", "bloco1-incerto-suppress", "presidential-cohort-20260515", "public-profile-density-20260517", "pre-candidates-lote12-20260522", "photos-names-20260610", "escopo-executivo-20260726", "cache-poison-fix-20260802", "no-cache-resumo-parcial-20260804", "chapas-tse-20260815", "onda-p-20260814", "party-siglas-lote2-20260815", "busca-candidatura-colunas-enxutas-20260916", SENADO_CACHE_VARIANT, CURRENT_DATA_WAVE],
  {
    revalidate: APP_DATA_REVALIDATE_SECONDS,
    tags: ["public-candidatos"],
  }
)

export async function getGlobalSearchIndexResource(): Promise<
  DataResource<GlobalSearchIndexItem[]>
> {
  try {
    const resource = await getCachedGlobalSearchIndexResource()
    if (isSenadoEnabled()) return resource
    const publicSlugs = new Set((await getCandidatoSlugStaticParams()).map((row) => row.slug))
    return {
      ...resource,
      data: resource.data.filter((item) => {
        const match = item.href.match(/^\/candidato\/([^/?#]+)/)
        return !match || publicSlugs.has(match[1])
      }),
    }
  } catch (error) {
    return degradedFromError(error, [] as GlobalSearchIndexItem[])
  }
}

/**
 * Uma linha de `candidatos_publico` por pedido — partilhada entre `generateMetadata` e a ficha
 * (evita dois SELECT completos ao mesmo slug no mesmo request).
 */
const getCandidatoPublicRowForRequest = cache(async function loadCandidatoPublicRowForRequest(
  slug: string,
  cacheMode: "no-store" | undefined = undefined
): Promise<DataResource<Candidato | null>> {
  if (USE_MOCK) {
    return degradedResource(null, SUPABASE_REQUIRED_MESSAGE)
  }

  const supabase = createServerSupabaseClient(cacheMode ? { cacheMode } : undefined)
  const load = (columns: string) => withSupabaseRetry<Candidato>(
    `getCandidatoPublicRow(${slug})`,
    async (signal) =>
      supabase
        .from(CANDIDATO_PUBLIC_RELATION)
        .select(columns)
        .eq("slug", slug)
        // `.abortSignal()` vem antes de `.single()`: o `.single()` estreita o tipo
        // para PostgrestBuilder, que nao expoe `abortSignal`. A ordem nao muda o
        // comportamento, o metodo so grava o signal no builder.
        .abortSignal(signal)
        .single()
  )
  let result = await load(CANDIDATO_COLUMNS)
  if (isMissingOptionalCandidateColumnError(result.error)) {
    result = await load(CANDIDATO_COLUMNS_WITHOUT_FORMACAO_INSTITUICAO)
  }
  if (isMissingOptionalCandidateColumnError(result.error)) {
    result = await load(CANDIDATO_COLUMNS_WITHOUT_PHOTO_CREDIT)
  }
  if (isMissingOptionalCandidateColumnError(result.error)) {
    result = await load(CANDIDATO_COLUMNS_LEGACY)
  }
  const { data, error } = result

  if (isSupabaseNoRowError(error)) {
    // Slug inexistente: precisa virar HTTP 404 na rota, nao uma ficha degradada com 200.
    return liveResource(null)
  }

  if (error) {
    if (IS_DEV) {
      warnDevSupabaseFailure("getCandidatoPublicRow", error)
    } else {
      console.error("getCandidatoPublicRow failed:", error.message)
    }
    return degradedResource(
      null,
      "Não foi possível carregar os metadados desta ficha agora."
    )
  }

  if (!isSenadoEnabled() && data?.cargo_disputado === "Senador") {
    return liveResource(null)
  }

  return liveResource(data ?? null)
})

async function getCandidatoSlugParamsUncached(): Promise<{ slug: string }[]> {
  if (USE_MOCK) {
    return []
  }

  const supabase = createServerSupabaseClient()
  const { data, error } = await withSupabaseRetry("getCandidatoSlugParams", async (signal) => {
    let query = supabase
      .from(CANDIDATO_PUBLIC_RELATION)
      .select("slug")
      .neq("status", "removido")
    if (!isSenadoEnabled()) query = query.neq("cargo_disputado", "Senador")
    return query.order("slug").abortSignal(signal)
  })

  if (error || !data) {
    if (IS_DEV) {
      warnDevSupabaseFailure("getCandidatoSlugParams", error)
    } else {
      console.error("getCandidatoSlugParams failed:", error?.message)
    }
    // NUNCA retornar [] numa FALHA: o unstable_cache guardaria a lista vazia por
    // APP_DATA_REVALIDATE_SECONDS (1h) e o middleware passaria a 404 toda ficha,
    // anulando o proprio fail-open. Lancar impede o cache de uma falha transiente;
    // o /api/candidato-slugs trata o throw como 503 e o middleware entra em
    // fail-open (review 2026-06-09). USE_MOCK acima ja cobre o vazio legitimo.
    throw new Error(
      `getCandidatoSlugParams: leitura de slugs falhou${error?.message ? `: ${error.message}` : ""}`,
    )
  }

  return data.map((row) => ({ slug: String(row.slug) }))
}

const getCachedCandidatoSlugParams = unstableCacheWithSingleFlight(
  async () => getCandidatoSlugParamsUncached(),
  ["public-candidato-slugs-static", "presidential-cohort-20260515", "public-profile-density-20260517", "pre-candidates-lote12-20260522", "photos-names-20260610", "escopo-executivo-20260726", "chapas-tse-20260815", "onda-p-20260814", "candidate-roster-cas-20260915", SENADO_CACHE_VARIANT, CURRENT_DATA_WAVE],
  {
    revalidate: APP_DATA_REVALIDATE_SECONDS,
    tags: ["public-candidatos"],
  }
)

/** Só `slug` — para `generateStaticParams` (evita carregar todas as colunas de todos os candidatos). */
export async function getCandidatoSlugStaticParams(): Promise<{ slug: string }[]> {
  return getCachedCandidatoSlugParams()
}

async function getCandidatoMetadataResourceUncached(
  slug: string
): Promise<DataResource<Candidato | null>> {
  const res = await getCandidatoPublicRowForRequest(slug, "no-store")
  if (!res.data) return res
  // Sanitiza partido_sigla/partido_atual ANTES do payload sair em metadata publica
  // (substitui mapping pontual em src/app/(site)/candidato/[slug]/page.tsx).
  return { ...res, data: sanitizePublicPartyFields(res.data) }
}

const getCachedCandidatoMetadataResource = unstableCacheWithSingleFlight(
  async (slug: string) =>
    requireLiveResourceForCache(await getCandidatoMetadataResourceUncached(slug)),
  // Bumped 2026-04-26: payload publico agora carrega partido_sigla/partido_atual
  // ja sanitizados via sanitizePublicPartyFields. Suffix invalida cache antigo.
  ["public-candidato-metadata-resource", "central-party-sanitize", "no-cache-degraded-v1", "presidential-cohort-20260515", "public-profile-density-20260517", "editorial-full-closure-20260518", "pre-candidates-lote12-20260522", "photos-names-20260610", "andre-portugues-lote8-20260630", "escopo-executivo-20260726", "reescrita-claims-homonimo-20260726", "consolidacao-mapa-fome-20260726", "chapas-tse-20260815", "chapas-bio-card-20260813", "onda-p-20260814", "party-siglas-lote2-20260815", SENADO_CACHE_VARIANT, CURRENT_DATA_WAVE],
  {
    revalidate: APP_DATA_REVALIDATE_SECONDS,
    tags: ["public-candidato-metadata"],
  }
)

export async function getCandidatoMetadataResource(
  slug: string
): Promise<DataResource<Candidato | null>> {
  try {
    const resource = await getCachedCandidatoMetadataResource(slug)
    return !isSenadoEnabled() && resource.data?.cargo_disputado === "Senador"
      ? liveResource(null)
      : resource
  } catch {
    return getCandidatoMetadataResourceUncached(slug)
  }
}

/**
 * O vocabulário fechado de `coleta_log`. `sem_achado_no_escopo` faltava aqui e
 * o efeito era o oposto do pretendido: uma curadoria REGISTRADA com escopo
 * limitado era descartada, virava `null`, e a ficha passava a dizer que nunca
 * houve tentativa de busca. Desfecho registrado nunca pode ler como trabalho
 * não feito.
 */
const COLETA_RESULTADOS_VALIDOS = new Set<SancoesVerificacao["resultado"]>([
  "encontrado",
  "vazio_confirmado",
  "nao_aplicavel",
  "sem_achado_no_escopo",
  "erro",
  "indeterminado",
])

const CHAPA_2026_PUBLIC_SELECT =
  "chave,eleicao_codigo,eleicao_data,uf,cargo_titular,identidade_status," +
  "vinculo_titular_status,tse_situacao_codigo,titular_candidato_id,titular_slug," +
  "titular_nome_completo,titular_nome_urna,titular_partido_sigla,vice_candidato_id," +
  "vice_slug,vice_nome_completo,vice_nome_urna,vice_partido_sigla,fonte_url," +
  "fonte_sha256,snapshot_em,titular_sq_candidato,vice_sq_candidato,vice_situacao_divulgacand"

export function isMissingChapa2026ViewError(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false
  if (error.code === "42P01" || error.code === "PGRST205") return true
  const message = error.message?.toLowerCase() ?? ""
  return message.includes("chapas_2026_publico") && message.includes("does not exist")
}

/**
 * Compatibilidade de ordem de deploy: somente a ausência inequívoca da view
 * degrada para `null`. Falha de rede, permissão ou schema inesperado propaga e
 * rejeita o resource em cache; rejeições não envenenam o Data Cache por 1h.
 */
async function fetchChapa2026(
  candidatoId: string,
  cacheMode: "no-store" | undefined,
): Promise<Chapa2026 | null> {
  const client = createServerSupabaseClient(cacheMode ? { cacheMode } : undefined)
  const { data, error } = await withSupabaseRetry(
      `chapas_2026_publico(${candidatoId})`,
      async (signal) =>
        client
          .from("chapas_2026_publico")
          .select(CHAPA_2026_PUBLIC_SELECT)
          .or(`titular_candidato_id.eq.${candidatoId},vice_candidato_id.eq.${candidatoId}`)
          .order("chave")
          .limit(1)
          .abortSignal(signal)
          .maybeSingle(),
  )
  if (isMissingChapa2026ViewError(error)) return null
  if (error) throw new Error(`chapas_2026_publico: ${error.message ?? error.code ?? "erro"}`)
  if (!data) return null
  return data as unknown as Chapa2026
}

/**
 * Lê em `coleta_log_ultima` a última tentativa de coleta de sanções para o
 * slug. É o que permite à ficha separar o zero provado ("consultamos CEIS,
 * CNEP e CEAF e veio vazio") do zero presumido ("nunca fomos lá").
 *
 * Caminho de acesso, decidido em 2026-08-05: a view não tem grant para `anon`
 * nem `authenticated` de propósito (migration 20260804160000), então a leitura
 * usa o client de service role, que só existe neste módulo server-only e roda
 * no build/ISR junto com as demais consultas da ficha. A alternativa (grant de
 * SELECT para `anon` na view) mudaria a postura de segurança do log inteiro
 * por causa de um campo de exibição, e foi descartada.
 *
 * Falha aqui NUNCA degrada a ficha: sem credencial ou com erro de rede o campo
 * vira `null`, que a UI renderiza como estado neutro (sem afirmação de
 * limpeza). O único estado que esta função pode "perder" com isso é um selo de
 * verificação, nunca um dado do candidato.
 */
async function fetchColetaVerificacao(
  slug: string,
  fonte: string,
): Promise<SancoesVerificacao | null> {
  try {
    const admin = createServiceRoleSupabaseClient({ cacheMode: "no-store" })
    const { data, error } = await withSupabaseRetry(
      `coleta_log_ultima(${slug})`,
      async (signal) =>
        admin
          .from("coleta_log_ultima")
        .select("fonte, resultado, executado_em, detalhe, url, escopo")
          .eq("fonte", fonte)
          .eq("escopo", "candidato")
          .eq("alvo", slug)
          .abortSignal(signal)
          .maybeSingle()
    )

    if (error || !data) return null
    // O client não tem schema tipado para a view; validamos o shape em runtime.
    const row = data as {
      fonte?: unknown
      resultado?: unknown
      executado_em?: unknown
      detalhe?: unknown
      url?: unknown
      escopo?: unknown
    }
    const resultado = row.resultado as SancoesVerificacao["resultado"]
    if (!COLETA_RESULTADOS_VALIDOS.has(resultado)) return null
    if (typeof row.executado_em !== "string" || row.executado_em.length === 0) return null
    if (fonte === "processos-curadoria") return projectProcessosVerificacaoRow(row)
    // `detalhe` de coleta pode conter diagnóstico operacional (CPF ausente,
    // endpoint, erro). Só as auditorias de Destaques e a fonte de sanções
    // escrevem copy pública deliberada; processos tem projeção própria acima.
    const detalhePublicavel = fonte.startsWith("destaques-") || fonte === "transparencia-sanctions" || fonte === "filiacao" || fonte === "gastos-executivo"
    const isGoogleNewsSearchUrl = (value: unknown): value is string => {
      if (typeof value !== "string" || !value) return false
      try {
        const parsed = new URL(value)
        return parsed.protocol === "https:" &&
          parsed.hostname === "news.google.com" &&
          parsed.pathname === "/rss/search" &&
          Boolean(parsed.searchParams.get("q")?.trim()) &&
          !parsed.hash
      } catch {
        return false
      }
    }
    // Google News only becomes a public provenance URL after checking its
    // nominal query against the verified identity for this slug. TSE URLs
    // keep their existing allowlist and do not depend on this extra lookup.
    let googleNewsIdentity: { nome_completo?: string | null; nome_urna?: string | null } | null = null
    if (fonte === "filiacao" && isGoogleNewsSearchUrl(row.url)) {
      const identity = await admin
        .from(CANDIDATO_PUBLIC_RELATION)
        .select("slug, nome_completo, nome_urna")
        .eq("slug", slug)
        .maybeSingle()
      if (!identity.error && identity.data?.slug === slug) {
        googleNewsIdentity = identity.data
      }
    }
    const safeSourceUrl = (value: unknown): string | null => {
      if (typeof value !== "string" || !value) return null
      try {
        const parsed = new URL(value)
        if (parsed.protocol !== "https:" || parsed.hash) return null
        const filiationHost = fonte === "filiacao" &&
          ["cdn.tse.jus.br", "dadosabertos.tse.jus.br", "www.tse.jus.br", "filia2-consulta.tse.jus.br"].includes(parsed.hostname)
        const googleNewsFiliation = fonte === "filiacao" &&
          parsed.hostname === "news.google.com" &&
          parsed.pathname === "/rss/search" &&
          Boolean(parsed.searchParams.get("q")?.trim()) &&
          googleNewsIdentity !== null &&
          newsTitleMentionsCandidate(parsed.searchParams.get("q"), googleNewsIdentity)
        return parsed.hostname === "api.portaldatransparencia.gov.br" && !parsed.search
          ? parsed.toString()
          : fonte.startsWith("destaques-") || filiationHost || googleNewsFiliation
            ? parsed.toString()
            : null
      } catch {
        return null
      }
    }
    const sourceUrls = fonte === "transparencia-sanctions" && typeof row.detalhe === "string"
      ? [...new Set([...row.detalhe.matchAll(/(?:CEIS|CNEP|CEAF)=(https:\/\/api\.portaldatransparencia\.gov\.br\/[^,;\s]+)/g)].map((match) => safeSourceUrl(match[1])).filter((url): url is string => Boolean(url)))]
      : []
    const evidenceSources = fonte === "transparencia-sanctions" && typeof row.detalhe === "string"
      ? [...new Set([...row.detalhe.matchAll(/\b(CEIS|CNEP|CEAF)=https:\/\/api\.portaldatransparencia\.gov\.br\//g)].map((match) => match[1]))]
      : []
    return {
      fonte: typeof row.fonte === "string" ? row.fonte : fonte,
      resultado,
      executado_em: row.executado_em,
      detalhe: detalhePublicavel && typeof row.detalhe === "string" ? row.detalhe : null,
      url: detalhePublicavel
        ? safeSourceUrl(typeof row.url === "string" ? row.url.split(" | ")[0] : null) ?? sourceUrls[0] ?? null
        : null,
      escopo: typeof row.escopo === "string" ? row.escopo : null,
      evidence_sources: evidenceSources,
      source_urls: sourceUrls,
    }
  } catch {
    // Sem SUPABASE_SERVICE_ROLE_KEY (dev local, fork) ou view ausente: estado
    // neutro. Não entra em relatedErrors porque é metadado de proveniência, não
    // seção da ficha.
    return null
  }
}

/** Recibo público por família do Portal, sem transportar o filtro pessoal. */
async function fetchTransparenciaVerificacao(slug: string): Promise<TransparenciaFamiliaVerificacao[]> {
  try {
    const admin = createServiceRoleSupabaseClient({ cacheMode: "no-store" })
    const { data, error } = await withSupabaseRetry(
      `coleta_log_ultima(transparencia:${slug})`,
      async (signal) => admin
        .from("coleta_log_ultima")
        .select("resultado,executado_em,detalhe")
        .eq("fonte", "transparencia")
        .eq("escopo", "candidato")
        .eq("alvo", slug)
        .abortSignal(signal)
        .maybeSingle(),
    )
    const row = data as { resultado?: unknown; executado_em?: unknown; detalhe?: unknown } | null
    if (error || !row || typeof row.detalhe !== "string") return []
    const executed = typeof row.executado_em === "string" ? row.executado_em : null
    const output: TransparenciaFamiliaVerificacao[] = []
    for (const part of row.detalhe.split(/;\s*/)) {
      const match = part.match(/^(cartoes|viagens|contratos)=(encontrado|vazio_confirmado|erro|indeterminado|sem_achado_no_escopo|nao_aplicavel):(\d+) registro\(s\), páginas=(\d+), fonte=(https?:\/\/\S+)$/)
      if (!match) continue
      output.push({
        familia: match[1] as TransparenciaFamiliaPublica,
        resultado: match[2] as SancoesVerificacao["resultado"],
        volume: Number(match[3]),
        paginas: Number(match[4]),
        endpoint: match[5],
        fonte: "Portal da Transparência",
        executado_em: executed,
      })
    }
    return output
  } catch {
    return []
  }
}

/** Metadado da mesma fonte da ficha, em lotes para evitar uma consulta por card. */
async function fetchProcessosVerificacoesBatch(
  slugs: string[],
): Promise<Map<string, SancoesVerificacao>> {
  const verificacoes = new Map<string, SancoesVerificacao>()
  const alvos = [...new Set(slugs.filter(Boolean))]
  if (alvos.length === 0) return verificacoes
  try {
    const admin = createServiceRoleSupabaseClient({ cacheMode: "no-store" })
    for (let offset = 0; offset < alvos.length; offset += 100) {
      const lote = alvos.slice(offset, offset + 100)
      const { data, error } = await withSupabaseRetry(
        `coleta_log_ultima(comparador:${offset})`,
        async (signal) => admin
          .from("coleta_log_ultima")
          .select("alvo, resultado, executado_em")
          .eq("fonte", "processos-curadoria")
          .eq("escopo", "candidato")
          .in("alvo", lote)
          .abortSignal(signal),
      )
      if (error) continue
      for (const row of data ?? []) {
        const resultado = row.resultado as SancoesVerificacao["resultado"]
        if (typeof row.alvo !== "string" || !lote.includes(row.alvo)) continue
        if (!COLETA_RESULTADOS_VALIDOS.has(resultado)) continue
        if (typeof row.executado_em !== "string" || !row.executado_em) continue
        verificacoes.set(row.alvo, {
          fonte: "processos-curadoria",
          resultado,
          executado_em: row.executado_em,
          detalhe: null,
          url: null,
        })
      }
    }
  } catch {
    // Credencial/view ausente mantém estado desconhecido, nunca zero afirmado.
  }
  return verificacoes
}

async function fetchSancoesVerificacao(slug: string): Promise<SancoesVerificacao | null> {
  return fetchColetaVerificacao(slug, "transparencia-sanctions")
}

/** Recibo do recorte executivo canônico, sem inferir atividade executiva geral. */
async function fetchGastosExecutivoVerificacao(slug: string): Promise<ExecutiveScopeReceipt | null> {
  const receipt = await fetchColetaVerificacao(slug, "gastos-executivo")
  if (!receipt) return null
  const detail = receipt.detalhe
  const sourceIds = [
    "executive-collector-binding-lula-20101",
    "executive-cohort-identity-check",
  ]
  // Os IDs só podem atravessar a fronteira pública quando foram realmente
  // persistidos no detalhe do recibo. O escopo técnico `candidato` da tabela
  // não descreve a série executiva consultada, então reconstruí-lo sem esses
  // marcadores promoveria qualquer linha antiga a N/A.
  if (
    typeof detail !== "string" ||
    !detail.includes("Presidência da República") ||
    !detail.includes("período oficial da série: 01/2023 até 09/2026") ||
    !detail.includes(`fontes=${sourceIds.join(",")}`)
  ) return null
  return {
    ...receipt,
    fonte: "gastos-executivo",
    escopo: "coorte nominal; Presidência da República / órgão 20101; período 01/2023 até 09/2026",
    evidence_sources: sourceIds,
    source_urls: receipt.url ? [receipt.url] : [],
  }
}

/**
 * Recibo público da consulta TCU. A curadoria judicial tem fonte própria e
 * nunca é usada para preencher este campo. O detalhe operacional do coletor
 * também não atravessa a fronteira pública: o estado é derivado apenas do
 * resultado terminal, volume e data registrados no recibo.
 */
async function fetchTCUVerificacao(slug: string): Promise<TCUVerificacao | null> {
  try {
    const admin = createServiceRoleSupabaseClient({ cacheMode: "no-store" })
    const { data, error } = await withSupabaseRetry(
      `coleta_log_ultima(tcu:${slug})`,
      async (signal) => admin
        .from("coleta_log_ultima")
        .select("fonte,resultado,executado_em,volume,url,detalhe,escopo")
        .eq("fonte", "tcu")
        .eq("escopo", "candidato")
        .eq("alvo", slug)
        .abortSignal(signal)
        .maybeSingle(),
    )
    if (error || !data) return null
    const row = data as {
      fonte?: unknown
      resultado?: unknown
      executado_em?: unknown
      volume?: unknown
      url?: unknown
      detalhe?: unknown
      escopo?: unknown
    }
    const resultado = row.resultado as TCUVerificacao["resultado"]
    if (!COLETA_RESULTADOS_VALIDOS.has(resultado)) return null
    if (typeof row.executado_em !== "string" || !row.executado_em) return null
    const volume = typeof row.volume === "number" && Number.isFinite(row.volume) && row.volume >= 0
      ? Math.trunc(row.volume)
      : null
    const estado: TCUVerificacao["estado"] =
      resultado === "encontrado" && volume !== null && volume > 0
        ? "encontrado_em_revisao"
        : resultado === "vazio_confirmado"
          ? "vazio_verificado"
          : "pendente"
    const safeTcuUrl = (value: unknown) => {
      if (typeof value !== "string" || !value) return null
      try {
        const parsed = new URL(value as string)
        return parsed.protocol === "https:" && parsed.hostname === "certidoes.apps.tcu.gov.br" && !parsed.search && !parsed.hash
          ? parsed.toString()
          : null
      } catch {
        return null
      }
    }
    const consultaUrls = [
      ["responsaveis_inabilitados", "https://certidoes.apps.tcu.gov.br/api/publico/responsaveis-inabilitados", "inabilitados_itens"] as const,
      ["responsaveis_contas_irregulares", "https://certidoes.apps.tcu.gov.br/api/publico/responsaveis-contas-irregulares", "cadirreg_itens"] as const,
    ]
    const detalheFonte = typeof row.detalhe === "string" ? row.detalhe : ""
    const fontes = consultaUrls.flatMap(([cadastro, consultaUrl, volumeKey]) => {
      if (!detalheFonte.includes(consultaUrl)) return []
      const volumeMatch = detalheFonte.match(new RegExp(`${volumeKey}=(\\d+)`))
      const fonteVolume = volumeMatch ? Number(volumeMatch[1]) : null
      return [{
        cadastro,
        url: consultaUrl,
        resultado: fonteVolume === null ? "pendente" as const : fonteVolume > 0 ? "encontrado" as const : "vazio_confirmado" as const,
        volume: fonteVolume,
      }]
    })
    const url = estado === "encontrado_em_revisao"
      ? fontes.find((fonte) => fonte.resultado === "encontrado")?.url ?? null
      : fontes[0]?.url ?? safeTcuUrl(row.url)
    const detalhe = estado === "encontrado_em_revisao"
      ? `Consulta TCU encontrou ${volume} registro${volume === 1 ? "" : "s"}; revisão editorial pendente.`
      : estado === "vazio_verificado"
        ? "Consultas oficiais TCU retornaram zero registros no escopo verificado."
        : "Consulta TCU inconclusiva; o resultado não deve ser interpretado como ausência."
    return {
      fonte: "tcu",
      resultado,
      estado,
      executado_em: row.executado_em,
      volume,
      detalhe,
      url,
      escopo: typeof row.escopo === "string" ? row.escopo : null,
      fontes,
    }
  } catch {
    return null
  }
}

async function fetchProcessosVerificacao(slug: string): Promise<SancoesVerificacao | null> {
  return fetchColetaVerificacao(slug, "processos-curadoria")
}

async function fetchFiliacaoVerificacao(slug: string): Promise<SancoesVerificacao | null> {
  const receipt = await fetchColetaVerificacao(slug, "filiacao")
  return receipt ? { ...receipt, detalhe: sanitizeFiliacaoDetail(receipt.detalhe) } : null
}

async function fetchTrajetoriaDestaquesVerificacao(
  slug: string,
): Promise<SancoesVerificacao | null> {
  return fetchColetaVerificacao(slug, "destaques-trajetoria")
}

async function fetchPatrimonioDestaquesVerificacao(
  slug: string,
): Promise<SancoesVerificacao | null> {
  const receipt = await fetchColetaVerificacao(slug, "destaques-patrimonio")
  if (!receipt) return null
  const detail = receipt.detalhe ?? ""
  const years = detail.match(/anos_consultados=([^;]+)/)?.[1] ?? null
  const missing = detail.match(/anos_sem_cache=([^;]+)/)?.[1] ?? null
  const date = receipt.executado_em.slice(0, 10).split("-").reverse().join("/")
  return {
    ...receipt,
    detalhe: receipt.resultado === "encontrado"
      ? `Declarações de bens do TSE encontradas no recorte consultado${years ? ` (${years})` : ""}. Cobertura por pleito permanece limitada${missing && missing !== "nenhum" ? `; pacote sem cache: ${missing}` : ""}. Consulta em ${date}.`
      : `Recorte de declarações de bens do TSE consultado${years ? ` (${years})` : ""}, sem linha vinculada nos anos disponíveis. Isso não confirma ausência de patrimônio${missing && missing !== "nenhum" ? `; pacote sem cache: ${missing}` : ""}. Consulta em ${date}.`,
  }
}

async function fetchVotacoesDestaquesVerificacao(
  slug: string,
): Promise<SancoesVerificacao | null> {
  return fetchColetaVerificacao(slug, "destaques-votacoes")
}

async function fetchProjetosDestaquesVerificacao(
  slug: string,
): Promise<SancoesVerificacao | null> {
  return fetchColetaVerificacao(slug, "destaques-projetos")
}

async function fetchGastosParlamentaresDestaquesVerificacao(
  slug: string,
): Promise<SancoesVerificacao | null> {
  return fetchColetaVerificacao(slug, "destaques-gastos-parlamentares")
}

/**
 * Lê os recibos federais que comprovam a não aplicabilidade do acervo
 * parlamentar a um perfil sem mandato federal. A view é privada por desenho,
 * portanto esta leitura usa apenas a service role no servidor e falha fechada:
 * qualquer erro, fonte ausente ou recibo incompleto deixa as seções como
 * "missing". O resultado não carrega o detalhe operacional para o DTO.
 */
async function fetchFederalAcervoReceipts(
  slug: string,
  persistedValue: unknown,
): Promise<FederalAcervoReceipts | null> {
  const persisted = projectFederalAcervoReceipts(persistedValue)
  if (FEDERAL_ACERVO_SOURCES.every((source) => persisted?.[source])) return persisted
  try {
    const admin = createServiceRoleSupabaseClient({ cacheMode: "no-store" })
    const { data, error } = await withSupabaseRetry(
      `coleta_log_ultima(federal:${slug})`,
      async (signal) => admin
        .from("coleta_log_ultima")
        .select("fonte,resultado,executado_em,detalhe,escopo,url,alvo")
        .eq("escopo", "candidato")
        .eq("alvo", slug)
        .in("fonte", [...FEDERAL_ACERVO_SOURCES])
        .abortSignal(signal),
    )
    if (error) return null

    const receipts: FederalAcervoReceipts = { ...(persisted ?? {}) }
    for (const row of data ?? []) {
      const source = typeof row.fonte === "string" &&
        (FEDERAL_ACERVO_SOURCES as readonly string[]).includes(row.fonte)
        ? row.fonte as FederalAcervoSource
        : null
      if (!source || receipts[source]) continue
      const detail = typeof row.detalhe === "string" ? row.detalhe : null
      const parsed = parseFederalAcervoReceiptDetail(detail, row.executado_em)
      if (!parsed) continue
      receipts[source] = {
        fonte: source,
        resultado: row.resultado as SancoesVerificacao["resultado"],
        executado_em: typeof row.executado_em === "string" ? row.executado_em : "",
        verificado_em: parsed.verificado_em,
        detalhe: parsed.detalhe,
        escopo: parsed.escopo,
        source_ids: parsed.source_ids,
        source_urls: parsed.source_urls,
      }
    }
    return receipts
  } catch {
    return null
  }
}

async function getCandidatoBySlugFromRelationResource(
  slug: string,
  relation: string,
  useServiceRole = false,
  cacheMode: "no-store" | undefined = undefined
): Promise<DataResource<FichaCandidato | null>> {
  if (USE_MOCK) {
    return degradedResource(null, SUPABASE_REQUIRED_MESSAGE)
  }

  const shouldUseServiceRole = useServiceRole

  const supabase = shouldUseServiceRole
    ? createServiceRoleSupabaseClient({ cacheMode: "no-store" })
    : createServerSupabaseClient(cacheMode ? { cacheMode } : undefined)

  let candidato: Candidato | null

  if (!shouldUseServiceRole && relation === CANDIDATO_PUBLIC_RELATION) {
    const rowRes = await getCandidatoPublicRowForRequest(slug, cacheMode)
    if (rowRes.sourceStatus === "degraded") {
      if (IS_DEV) {
        warnDevSupabaseFailure("getCandidatoBySlug", { message: rowRes.sourceMessage ?? undefined })
      } else {
        console.error("getCandidatoBySlug failed:", rowRes.sourceMessage)
      }
      return degradedResource(
        null,
        rowRes.sourceMessage ?? "Não foi possível carregar esta ficha agora. Tente novamente em instantes."
      )
    }
    candidato = rowRes.data
    if (!candidato) return liveResource(null)
  } else {
    const load = (columns: string) => withSupabaseRetry<Candidato>(
      `getCandidatoBySlug(${slug})`,
      async (signal) =>
        supabase
          .from(relation)
          .select(columns)
          .eq("slug", slug)
          // Mesma ordem de getCandidatoPublicRow: `.abortSignal()` antes de
          // `.single()`, que estreita o tipo e esconde o metodo.
          .abortSignal(signal)
          .single()
    )
    let result = await load(CANDIDATO_COLUMNS)
    if (isMissingOptionalCandidateColumnError(result.error)) {
      result = await load(CANDIDATO_COLUMNS_WITHOUT_FORMACAO_INSTITUICAO)
    }
    if (isMissingOptionalCandidateColumnError(result.error)) {
      result = await load(CANDIDATO_COLUMNS_WITHOUT_PHOTO_CREDIT)
    }
    if (isMissingOptionalCandidateColumnError(result.error)) {
      result = await load(CANDIDATO_COLUMNS_LEGACY)
    }
    const { data, error: candidatoError } = result

    if (isSupabaseNoRowError(candidatoError)) {
      // Slug inexistente: precisa virar HTTP 404 na rota, nao uma ficha degradada com 200.
      return liveResource(null)
    }

    if (candidatoError) {
      if (IS_DEV) {
        warnDevSupabaseFailure("getCandidatoBySlug", candidatoError)
      } else {
        console.error("getCandidatoBySlug failed:", candidatoError.message)
      }
      return degradedResource(
        null,
        "Não foi possível carregar esta ficha agora. Tente novamente em instantes."
      )
    }

    candidato = data ?? null
    if (!candidato) return liveResource(null)
  }

  if (!shouldExposeCargo(candidato.cargo_disputado)) {
    return liveResource(null)
  }

  const id = candidato.id
  const canonical = getCanonicalPerson(slug)
  let personLevelIds = [id]

  if (canonical.slugs.length > 1) {
    const canonicalLookupRelation = shouldUseServiceRole ? "candidatos" : relation
    const { data: relatedCandidates, error: relatedError } = await withSupabaseRetry(
      `getCanonicalCandidates(${slug})`,
      async (signal) =>
        supabase
          .from(canonicalLookupRelation)
          .select("id, slug")
          .in("slug", canonical.slugs)
          .abortSignal(signal)
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

  const [historico, mudancas, patrimonio, financiamento, votos, processos, pontos, projetos, projetosLeiNaturezaCount, projetosLeiDestaquesCount, projetosLeiCamaraCount, legislacaoExecutivo, gastos, gastosExecutivo, sancoes, noticias, indicadores, sancoesVerificacao, processosVerificacao, filiacaoVerificacao, tcuVerificacao, trajetoriaVerificacao, patrimonioVerificacao, votacoesVerificacao, projetosVerificacao, gastosParlamentaresVerificacao, federalAcervoReceipts, transparenciaVerificacao, gastosExecutivoVerificacao] =
    await Promise.all([
      // `despublicado_em` filtra candidatura atribuida por homonimo (migration
      // 20260726160000). O CPF divergente no cadastro desliga o casamento por
      // CPF no tse-resolver e a linha vem do casamento por nome, trazendo
      // candidatura de outra pessoa para a ficha. A linha continua no banco
      // com o motivo gravado, entao a correcao e reversivel.
      withSupabaseRetry(`historico_politico(${slug})`, async (signal) =>
        supabase
          .from("historico_politico")
          .select("*")
          .eq("candidato_id", id)
          .is("despublicado_em", null)
          .order("periodo_inicio", { ascending: false })
          .abortSignal(signal)
      ),
      withSupabaseRetry(`mudancas_partido(${slug})`, async (signal) =>
        supabase
          .from("mudancas_partido")
          .select("*")
          .eq("candidato_id", id)
          .is("despublicado_em", null)
          .order("data_mudanca", { ascending: false, nullsFirst: false })
          .order("ano", { ascending: false })
          .abortSignal(signal)
      ),
      withSupabaseRetry(`patrimonio(${slug})`, async (signal) =>
        supabase
          .from("patrimonio")
          .select("*")
          .in("candidato_id", personLevelIds)
          .is("despublicado_em", null)
          .order("ano_eleicao", { ascending: false })
          .abortSignal(signal)
      ),
      withSupabaseRetry(`financiamento_publico(${slug})`, async (signal) =>
        supabase
          .from("financiamento_publico")
          .select("*")
          .in("candidato_id", personLevelIds)
          .order("ano_eleicao", { ascending: false })
          .abortSignal(signal)
      ),
      withSupabaseRetry(`votos_candidato(${slug})`, async (signal) =>
        supabase
          .from("votos_candidato")
          .select("*, votacao:votacoes_chave(*)")
          .eq("candidato_id", id)
          .abortSignal(signal)
      ),
      withSupabaseRetry(`processos(${slug})`, async (signal) =>
        supabase.from("processos").select("*").eq("candidato_id", id).abortSignal(signal)
      ),
      withSupabaseRetry(`pontos_atencao(${slug})`, async (signal) =>
        supabase
          .from("pontos_atencao")
          .select("*")
          .eq("candidato_id", id)
          .is("despublicado_em", null)
          .eq("visivel", true)
          .abortSignal(signal)
      ),
      withSupabaseRetry(`projetos_lei(${slug})`, async (signal) =>
        supabase
          .from("projetos_lei")
          .select(PROJETOS_LEI_COLUNAS, { count: "exact" })
          .eq("candidato_id", id)
          .order("ano", { ascending: false })
          .order("numero", { ascending: false })
          .limit(25)
          .abortSignal(signal)
      ),
      // Composição do acervo INTEIRO por natureza (vistoria dos PRs #141/#142):
      // a prévia acima tem 25 linhas, e derivar o rótulo dela publica a prévia
      // como se fosse o acervo. 25 PLs seguidos de um REQ viravam "25 Projetos
      // de lei" numa ficha com acervo misto maior. Um head-count filtrado por
      // sigla dá o numerador exato do total sem baixar linha nenhuma.
      withSupabaseRetry(`projetos_lei_natureza(${slug})`, async (signal) =>
        supabase
          .from("projetos_lei")
          .select("id", { count: "exact", head: true })
          .eq("candidato_id", id)
          .in("tipo", [...SIGLAS_PROJETO_LEI])
          .abortSignal(signal)
      ),
      // Destaques do acervo INTEIRO (rodada 3 da vistoria): o `sub` do card
      // contava destaque só nas 25 da prévia, e um destaque na 26ª linha virava
      // "0 em destaque" ao lado do total completo.
      withSupabaseRetry(`projetos_lei_destaques(${slug})`, async (signal) =>
        supabase
          .from("projetos_lei")
          .select("id", { count: "exact", head: true })
          .eq("candidato_id", id)
          .eq("destaque", true)
          .abortSignal(signal)
      ),
      // Linhas de fonte Câmara (rodada 4 da vistoria): a assinatura do corte da
      // issue #138 é "100 linhas com fonte='Camara'", e o readback comparava o
      // total GLOBAL com 100, repetindo na outra camada o erro que a régua já
      // tinha corrigido. É a mesma dimensão `projetosCamara` do snapshot de
      // cobertura, agora exposta na API pública.
      withSupabaseRetry(`projetos_lei_camara(${slug})`, async (signal) =>
        supabase
          .from("projetos_lei")
          .select("id", { count: "exact", head: true })
          .eq("candidato_id", id)
          .eq("fonte", "Camara")
          .abortSignal(signal)
      ),
      // Previa do inventario do Executivo. O inventario completo saiu do caminho
      // de render em 2026-08-03 e vive em /api/candidato-profile/[slug]/legislacao-executivo,
      // buscado pelo cliente quando a aba Legislacao abre (mesmo padrao de projetos_lei).
      //
      // Medido em producao em 03/08 na ficha mais pesada (ronaldo-caiado, 3.600 atos,
      // presidenciavel e portanto trafego alto): 151 KB comprimidos no caminho quente e
      // 1,5 MB / 7,5s no frio, com 15 faixas paralelas dividindo o orcamento de 15s do
      // withSupabaseRetry com as outras 12 consultas da ficha. Uma unica consulta com
      // `count: "exact"` devolve a previa E o total exato num round-trip so.
      withSupabaseRetry(`legislacao_mandato_executivo(${slug})`, async (signal) =>
        supabase
          .from("legislacao_mandato_executivo")
          .select(LEGISLACAO_MANDATO_EXECUTIVO_PUBLIC_SELECT, { count: "exact" })
          .eq("candidato_id", id)
          .order("data_norma", { ascending: false, nullsFirst: false })
          .order("ano", { ascending: false, nullsFirst: false })
          .order("id", { ascending: true })
          .limit(LEGISLACAO_MANDATO_EXECUTIVO_PROFILE_PREVIEW_LIMIT)
          .abortSignal(signal)
      ),
      withSupabaseRetry(`gastos_parlamentares(${slug})`, async (signal) =>
        supabase
          .from("gastos_parlamentares")
          .select("*")
          .eq("candidato_id", id)
          .order("ano", { ascending: false })
          .abortSignal(signal)
      ),
      withSupabaseRetry(`gastos_executivo(${slug})`, async (signal) =>
        supabase
          .from("gastos_executivo")
          .select("id, candidato_id, orgao_codigo, orgao_nome, ug_codigo, ug_nome, mes_extrato, valor_total, qtd_transacoes, qtd_portador_sigiloso, qtd_portador_nominado, qtd_portador_ausente, qtd_estabelecimento_sigiloso, qtd_estabelecimento_nominado, qtd_estabelecimento_ausente, fonte, coletado_em")
          .eq("candidato_id", id)
          .order("mes_extrato", { ascending: false })
          .abortSignal(signal)
      ),
      withSupabaseRetry(`sancoes_administrativas(${slug})`, async (signal) =>
        supabase
          .from("sancoes_administrativas")
          .select("*")
          .eq("candidato_id", id)
          .order("data_inicio", { ascending: false })
          .abortSignal(signal)
      ),
      withSupabaseRetry(`noticias_candidato(${slug})`, async (signal) =>
        supabase
          .from("noticias_candidato")
          .select("*")
          .eq("candidato_id", id)
          .not("data_publicacao", "is", null)
          .gte("data_publicacao", newsRetentionCutoffIso())
          .order("data_publicacao", { ascending: false })
          // Busca margem para que a denylist editorial possa retirar itens sem
          // reduzir artificialmente a previa publica de 20 noticias.
          .limit(40)
          .abortSignal(signal)
      ),
      candidato.cargo_disputado === "Governador" && candidato.estado
        ? withSupabaseRetry(`indicadores_estaduais(${slug})`, async (signal) =>
            supabase
              .from("indicadores_estaduais")
              .select("*")
              .ilike("estado", candidato.estado!)
              .order("ano", { ascending: false })
              .abortSignal(signal)
          )
        : Promise.resolve({ data: [] as IndicadorEstadual[] }),
      // Proveniência do zero de sanções (coleta_log_ultima, service role).
      // Nunca rejeita: degrada para null, que a UI lê como "não verificado".
      fetchSancoesVerificacao(slug),
      // Mesma proveniência para o vazio judicial. Encontrado sem linha pública
      // significa item em revisão, não ficha limpa.
      fetchProcessosVerificacao(slug),
      fetchFiliacaoVerificacao(slug),
      // Recibo TCU é uma fonte independente da curadoria judicial. Achados
      // permanecem em revisão editorial até haver ponto de atenção verificado.
      fetchTCUVerificacao(slug),
      // Auditorias dedicadas ao recorte publicável da aba Destaques. Sem a
      // migration correspondente, ambas degradam para null e a UI mantém
      // "ainda não verificado".
      fetchTrajetoriaDestaquesVerificacao(slug),
      fetchPatrimonioDestaquesVerificacao(slug),
      fetchVotacoesDestaquesVerificacao(slug),
      fetchProjetosDestaquesVerificacao(slug),
      fetchGastosParlamentaresDestaquesVerificacao(slug),
      fetchFederalAcervoReceipts(slug, candidato.verificacao_campos?.federal_acervo),
      fetchTransparenciaVerificacao(slug),
      fetchGastosExecutivoVerificacao(slug),
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
    legislacaoExecutivo.error,
    gastos.error,
    gastosExecutivo.error,
    sancoes.error,
    noticias.error,
    "error" in indicadores ? indicadores.error : null,
  ].filter(Boolean)

  // Ausências oficiais de patrimônio por eleição. Falha de leitura não pode
  // virar lista vazia: isso publicaria uma série incompleta como se fosse fato.
  // Antes da migration 20260915220000 as colunas de contexto não existem (42703);
  // o retry usa exatamente o conjunto de colunas já publicado em origin/main.
  const { data: patrimonioAusenciasData, error: patrimonioAusenciasError } =
    await selectWithPreMigrationColumns<Record<string, unknown>>(
      "patrimonio_ausencia_oficial",
      PATRIMONIO_AUSENCIA_OFICIAL_COLUMNS,
      PATRIMONIO_AUSENCIA_OFICIAL_COLUMNS_PRE_MIGRATION,
      (columns) =>
        supabase
          .from("patrimonio_ausencia_oficial")
          .select(columns)
          .in("candidato_id", personLevelIds)
          .order("ano_eleicao", { ascending: false })
          .overrideTypes<Record<string, unknown>[], { merge: false }>(),
    )
  if (patrimonioAusenciasError) throw patrimonioAusenciasError
  const patrimonioAusenciasOficiais = (patrimonioAusenciasData ??
    []) as unknown as PatrimonioAusenciaOficial[]

  // A leitura pública da ficha NÃO pode depender da service role. Onde ela
  // faltar, esta fatia degrada sozinha, em vez de derrubar a ficha inteira: o
  // leitor perde os selos de verificação de financiamento por pleito, e não a
  // página. Vale a mesma regra de `fetchColetaVerificacao`, cujo contrato já
  // dizia que falha de credencial nunca degrada a ficha.
  let financiamentoVerificacoes: FinanciamentoVerificacaoPublica[] = []
  try {
    const financiamentoVerificacoesClient = shouldUseServiceRole
      ? supabase
      : createServiceRoleSupabaseClient({ cacheMode: "no-store" })
    // Antes da migration 20260915210000 a view não expõe o contexto TSE (42703).
    const { data: financiamentoVerificacoesData, error: financiamentoVerificacoesError } =
      await selectWithPreMigrationColumns<Record<string, unknown>>(
        "financiamento_verificacoes_publico",
        FINANCIAMENTO_VERIFICACOES_PUBLICO_COLUMNS,
        FINANCIAMENTO_VERIFICACOES_PUBLICO_COLUMNS_PRE_MIGRATION,
        (columns) =>
          financiamentoVerificacoesClient
            .from("financiamento_verificacoes_publico")
            .select(columns)
            .in("candidato_id", personLevelIds)
            .order("ano_eleicao", { ascending: false })
            .overrideTypes<Record<string, unknown>[], { merge: false }>(),
      )
    if (financiamentoVerificacoesError) throw financiamentoVerificacoesError
    financiamentoVerificacoes = (financiamentoVerificacoesData ??
      []) as unknown as FinanciamentoVerificacaoPublica[]
  } catch (erro) {
    // Lista vazia aqui não vira afirmação: os estados por pleito que dependem
    // dela caem para "não coletado", que é o estado honesto de ausência de
    // leitura, nunca "sem financiamento declarado".
    console.error(
      `financiamento_verificacoes_publico(${slug}) indisponível, selos por pleito omitidos:`,
      erro instanceof Error ? erro.message : erro
    )
  }

  // Mesma regra de degradação: falha de leitura (inclusive view ainda não
  // aplicada) vira `null` e a seção some; nunca vira "nenhum doador em comum".
  let doadoresRecorrentes: DoadorRecorrentePublico[] | null = null
  try {
    const { data: doadoresRecorrentesData, error: doadoresRecorrentesError } = await withSupabaseRetry(
      `financiamento_doador_recorrente_publico(${slug})`,
      async (signal) =>
        supabase
          .from("financiamento_doador_recorrente_publico")
          .select(DOADOR_RECORRENTE_PUBLICO_COLUMNS)
          .in("candidato_id", personLevelIds)
          .abortSignal(signal)
    )
    if (doadoresRecorrentesError) throw doadoresRecorrentesError
    doadoresRecorrentes = agruparDoadoresRecorrentes(
      (doadoresRecorrentesData ?? []) as unknown as DoadorRecorrenteViewRow[]
    )
  } catch (erro) {
    console.error(
      `financiamento_doador_recorrente_publico(${slug}) indisponível, seção omitida:`,
      erro instanceof Error ? erro.message : erro
    )
  }

  const historicoConfiavel = normalizeHistoricoPoliticoForDisplay(
    ensureCurrentCandidacyInHistory(candidato, historico.data ?? []),
  )
  const patrimonioConfiavel = normalizePatrimonioForDisplay(patrimonio.data ?? [])
  const financiamentoConfiavel = normalizeFinanciamentoForDisplay(financiamento.data ?? [])
  // Último partido conhecido na trajetória: é o que permite fechar a linha do
  // tempo (e acusar a lacuna) de quem não tem nenhuma row em `mudancas_partido`.
  const ultimoRegistroPartidario =
    [...historicoConfiavel]
      .filter((item) => item.partido?.trim() && item.periodo_inicio != null)
      .sort((a, b) => (a.periodo_inicio ?? 0) - (b.periodo_inicio ?? 0))
      .at(-1) ?? null
  const ultimoPartidoHistorico = ultimoRegistroPartidario?.partido ?? null
  // A lacuna é medida ANTES da linha derivada do registro: o que a derivação faz
  // é publicar o partido de registro, não descobrir a data da troca.
  const timelinePartidariaIncompleta = hasIncompletePartyTimeline(
    normalizePartyTimelineForDisplay(mudancas.data ?? []),
    candidato.partido_sigla,
    candidato.partido_atual,
    ultimoPartidoHistorico,
    ultimoRegistroPartidario?.periodo_inicio ?? null,
  )
  const mudancasRaw = normalizePartyTimelineForDisplay(
    withCurrentRegistryPartyRow(mudancas.data ?? [], {
      candidatoId: candidato.id,
      partidoAtual: candidato.partido_sigla ?? candidato.partido_atual,
      ultimoPartidoHistorico,
    }),
  ).sort((a, b) => rankMudancaPartido(b) - rankMudancaPartido(a))
  const chapa2026 = await fetchChapa2026(id, cacheMode)

  const pontosPublicos = shouldUseServiceRole
    ? (pontos.data ?? [])
    : (pontos.data ?? []).filter((p) => isPublicAttentionPoint(p))

  // 2026-05-01: payload publico de LME passa por dedup pos-mapper para manter
  // o cached payload abaixo de 2 MB do Vercel Data Cache. A politica
  // (dedup de metadata.coverage_id duplicado, remocao de campos DB-only nao
  // renderizados, cap em ementa e ordenacao deterministica por data_norma desc
  // -> ano desc -> tipo_norma -> numero) vive em
  // src/lib/legislacao-mandato-executivo-cache.ts.
  // O cast espelha fetchLegislacaoMandatoExecutivoRowsPaged: a consulta usa
  // LEGISLACAO_MANDATO_EXECUTIVO_PUBLIC_SELECT, entao as colunas DB-only nao vem,
  // e sao justamente as que a politica de cache descarta em seguida.
  const legislacaoExecutivoPreviewRows = (legislacaoExecutivo.data ??
    []) as unknown as LegislacaoMandatoExecutivo[]
  const legislacaoExecutivoOrdenado: LegislacaoMandatoExecutivo[] =
    applyLegislacaoMandatoExecutivoCachePolicy(
      legislacaoExecutivoPreviewRows.map(toPublicLegislacaoMandatoExecutivoRow)
    )

  // A ausência de um mandato federal confirmado é uma conclusão de recibos,
  // não um efeito colateral de arrays vazios. Só deriva a verificação da aba
  // de destaques quando ela ainda não tem uma auditoria própria; dados ou
  // estados já persistidos nessa fonte mantêm precedência.
  const votacoesVerificacaoPublica =
    votacoesVerificacao ?? resolveFederalVotacoesNotApplicable(federalAcervoReceipts)

  const patrimonioEleicoes = buildPatrimonioEleicoes(
    patrimonioConfiavel,
    patrimonioAusenciasOficiais,
    historicoConfiavel,
  )
  const financiamentoEleicoes = buildFinanciamentoEleicoes(
    financiamentoConfiavel,
    historicoConfiavel,
    financiamentoVerificacoes,
  )

  // Sanitizacao publica de partido_sigla/partido_atual no ponto onde o payload
  // da ficha e construido. Substitui o mapping pontual `fichaForPublicDisplay` que
  // ate o Bloco 1 vivia em src/app/(site)/candidato/[slug]/CandidatoFichaView.tsx.
  // hasIncompletePartyTimeline (linha acima) ja foi calculado com a versao crua.
  const ficha: FichaCandidato = {
    ...sanitizePublicPartyFields(candidato),
    // jsonb bruto: parte das fichas guarda o crédito como string escalar.
    foto_credito: normalizeFotoCredito(candidato.foto_credito),
    chapa_2026: chapa2026,
    site_campanha: resolveCampaignSite(candidato),
    historico: historicoConfiavel,
    mudancas_partido: mudancasRaw,
    patrimonio: patrimonioConfiavel,
    patrimonio_ausencias_oficiais: patrimonioAusenciasOficiais,
    // Composição ÚNICA da série por eleição, feita aqui porque este é o único
    // lugar que enxerga os três insumos ao mesmo tempo. O DTO público publica
    // esta série e não os insumos, então recompor rio abaixo (na ficha, na
    // visão geral, no embed) perdia as ausências confirmadas e as rebaixava
    // para "ainda não coletado".
    patrimonio_eleicoes: patrimonioEleicoes,
    financiamento: shouldUseServiceRole
      ? financiamentoConfiavel
      : sanitizeFinanciamentoForPublic(financiamentoConfiavel),
    financiamento_eleicoes: financiamentoEleicoes,
    doadores_recorrentes: doadoresRecorrentes,
    votos: sortVotosForPublicDisplay(votos.data ?? []),
    processos: processos.data ?? [],
    pontos_atencao: pontosPublicos,
    projetos_lei: projetos.data ?? [],
    projetos_lei_total: projetos.count ?? (projetos.data ?? []).length,
    projetos_lei_truncados: (projetos.count ?? 0) > (projetos.data ?? []).length,
    // Numerador do acervo INTEIRO que é projeto de lei (head-count por sigla).
    // `null` quando a consulta falhou: o consumidor degrada para o rótulo
    // neutro, nunca para o rótulo derivado da prévia de 25.
    projetos_lei_natureza_projetos_total: projetosLeiNaturezaCount.error
      ? null
      : (projetosLeiNaturezaCount.count ?? null),
    projetos_lei_destaques_total: projetosLeiDestaquesCount.error
      ? null
      : (projetosLeiDestaquesCount.count ?? null),
    projetos_lei_camara_total: projetosLeiCamaraCount.error
      ? null
      : (projetosLeiCamaraCount.count ?? null),
    legislacao_mandato_executivo: legislacaoExecutivoOrdenado,
    legislacao_mandato_executivo_total:
      legislacaoExecutivo.count ?? legislacaoExecutivoOrdenado.length,
    legislacao_mandato_executivo_truncados:
      (legislacaoExecutivo.count ?? 0) > legislacaoExecutivoOrdenado.length,
    gastos_parlamentares: gastos.data ?? [],
    transparencia: publicTransparencia(gastos.data ?? [], transparenciaVerificacao),
    gastos_executivo: gastosExecutivo.data ?? [],
    sancoes_administrativas: sancoes.data ?? [],
    sancoes_verificacao: sancoesVerificacao,
    processos_verificacao: processosVerificacao,
    filiacao_verificacao: filiacaoVerificacao,
    tcu_verificacao: tcuVerificacao,
    trajetoria_verificacao: trajetoriaVerificacao,
    patrimonio_verificacao: patrimonioVerificacao,
    votacoes_verificacao: votacoesVerificacaoPublica,
    // Rotulo de relevancia em tempo de leitura (auditoria 2026-07-24, etapa
    // 1C). A ingestao passou a descartar item cujo titulo nao cita o candidato,
    // mas as linhas ja gravadas continuam no banco: 3.984 de 17.498 (22,77%)
    // sem nenhum token do nome no titulo. Em vez de apagar dado, marcamos o que
    // e cobertura do pleito para a UI dizer isso ao leitor.
    noticias: splitNewsByDenylist(noticias.data ?? [], candidato.slug).permitidos
      .slice(0, 20)
      .map((noticia) => ({
        ...noticia,
        contexto_do_pleito: !newsTitleMentionsCandidate(noticia.titulo, candidato),
      })),
    indicadores_estaduais: indicadores.data ?? [],
    total_processos: (processos.data ?? []).length,
    processos_criminais: (processos.data ?? []).filter(processoPodeContarComoCriminal).length,
    total_mudancas_partido: countPartySwitches(mudancasRaw),
    total_pontos_atencao: pontosPublicos.length,
    pontos_criticos: pontosPublicos.filter((p) => isNegativeHighestSeverityAttentionPoint(p)).length,
    total_sancoes: (sancoes.data ?? []).length,
    historico_descartado: 0,
    historico_em_revisao: false,
    timeline_partidaria_incompleta: timelinePartidariaIncompleta,
    section_freshness: buildSectionFreshness(candidato, {
      historico: historicoConfiavel,
      mudancas: mudancasRaw,
      patrimonio: patrimonioConfiavel,
      financiamento: financiamentoConfiavel,
      patrimonioEleicoes,
      financiamentoEleicoes,
      votos: votos.data ?? [],
      projetos: projetos.data ?? [],
      projetosTotal: projetos.count ?? (projetos.data ?? []).length,
      projetosNaturezaProjetosTotal: projetosLeiNaturezaCount.error
        ? null
        : (projetosLeiNaturezaCount.count ?? null),
      gastos: gastos.data ?? [],
      gastosExecutivo: gastosExecutivo.data ?? [],
      historicoEmRevisao: false,
      timelinePartidariaIncompleta: timelinePartidariaIncompleta,
      sancoesVerificacao,
      processosVerificacao,
      filiacaoVerificacao,
      projetosVerificacao,
      votacoesVerificacao,
      gastosParlamentaresVerificacao,
      federalAcervoReceipts,
      gastosParlamentaresAplicabilidade:
        (candidato.verificacao_campos?.federal_acervo as Record<string, unknown> | undefined)?.gastos_parlamentares_aplicabilidade,
      gastosExecutivoVerificacao,
    }),
  }

  if (relatedErrors.length > 0) {
    return degradedResource(
      ficha,
      "Nem todas as fontes desta ficha responderam. Algumas seções podem estar incompletas."
    )
  }

  return liveResource(ficha)
}

// Esvaziado em 2026-08-04: os 6 slugs da migração de densidade de 17/05 já foram
// absorvidos por keyParts posteriores, e o noStore() por request custava ~15
// round-trips ao Supabase em cada pageview de presidenciável. Mecanismo mantido
// para emergência editorial (adicionar slug aqui + keyPart novo no cache abaixo).
const PUBLIC_PROFILE_DENSITY_BYPASS_SLUGS = new Set<string>([])

export async function getCandidatoBySlugResource(
  slug: string
): Promise<DataResource<FichaCandidato | null>> {
  if (PUBLIC_PROFILE_DENSITY_BYPASS_SLUGS.has(slug)) {
    noStore()
    return getCandidatoBySlugResourceUncached(slug)
  }

  // Ler `headers()` aqui torna a ficha dinâmica em runtime. Em produção isso
  // dispara `app-static-to-dynamic-error` e devolve HTTP 500: foi a queda de
  // 2026-08-03, com as duas variáveis do bypass ligadas no painel havia 106
  // dias. O gate agora mora em `resolveReleaseVerifyCacheBypassToken`, que
  // devolve `null` em `VERCEL_ENV=production` sem consultar opt-in nenhum.
  const cacheBypass = resolveReleaseVerifyCacheBypassToken()
  if (cacheBypass) {
    try {
      const h = await headers()
      const bypassHeader = h.get("x-pf-release-verify-cache-bypass")
      if (bypassHeader === cacheBypass) {
        noStore()
        return getCandidatoBySlugResourceUncached(slug)
      }
    } catch {
      // Fora de request Next (ou contexto estatico): segue o caminho em cache.
    }
  }
  try {
    const resource = await getCachedCandidatoBySlugResource(slug)
    return !isSenadoEnabled() && resource.data?.cargo_disputado === "Senador"
      ? liveResource(null)
      : resource
  } catch {
    return getCandidatoBySlugResourceUncached(slug)
  }
}

export async function getCandidatoBySlugPreviewResource(
  slug: string
): Promise<DataResource<FichaCandidato | null>> {
  return getCandidatoBySlugFromRelationResource(slug, "candidatos", true)
}

export interface ProjetosLeiPage {
  rows: ProjetoLei[]
  total: number
  offset: number
  limit: number
}

/** Inventário legislativo paginado para a aba carregada sob demanda. */
export async function getProjetosLeiBySlugResource(
  slug: string,
  offset: number,
  limit: number
): Promise<DataResource<ProjetosLeiPage | null>> {
  if (USE_MOCK) return degradedResource(null, SUPABASE_REQUIRED_MESSAGE)

  const safeOffset = Math.max(0, Math.trunc(offset))
  const safeLimit = Math.min(100, Math.max(1, Math.trunc(limit)))
  const candidate = await getCandidatoPublicRowForRequest(slug, "no-store")
  if (candidate.sourceStatus === "degraded") {
    return degradedResource(null, candidate.sourceMessage)
  }
  if (!candidate.data) return liveResource(null)

  const supabase = createServerSupabaseClient({ cacheMode: "no-store" })
  const { data, error, count } = await withSupabaseRetry(`projetos_lei_page(${slug})`, async (signal) =>
    supabase
      .from("projetos_lei")
      .select(PROJETOS_LEI_COLUNAS, { count: "exact" })
      .eq("candidato_id", candidate.data!.id)
      .order("ano", { ascending: false })
      .order("numero", { ascending: false })
      .order("id", { ascending: true })
      .range(safeOffset, safeOffset + safeLimit - 1)
      .abortSignal(signal)
  )

  if (error) {
    return degradedResource(null, "Não foi possível carregar o inventário legislativo completo.")
  }
  return liveResource({
    rows: data ?? [],
    total: count ?? (data ?? []).length,
    offset: safeOffset,
    limit: safeLimit,
  })
}

export interface LegislacaoExecutivoInventario {
  rows: LegislacaoMandatoExecutivo[]
  total: number
}

/**
 * Inventario completo de atos do Executivo, servido fora do caminho de render da
 * ficha (a ficha carrega apenas os primeiros
 * LEGISLACAO_MANDATO_EXECUTIVO_PROFILE_PREVIEW_LIMIT atos).
 *
 * Devolve o inventario inteiro numa resposta so, e nao em paginas: a paginacao
 * paralela de fetchLegislacaoMandatoExecutivoRowsPaged (#65) ja resolve as 3.600
 * linhas do pior caso em faixas simultaneas com `order("id")` explicito, entao
 * fatiar de novo aqui trocaria 15 requests paralelos no servidor por 15 requests
 * seriais no browser.
 */
export async function getLegislacaoExecutivoBySlugResource(
  slug: string
): Promise<DataResource<LegislacaoExecutivoInventario | null>> {
  if (USE_MOCK) return degradedResource(null, SUPABASE_REQUIRED_MESSAGE)

  const candidate = await getCandidatoPublicRowForRequest(slug, "no-store")
  if (candidate.sourceStatus === "degraded") {
    return degradedResource(null, candidate.sourceMessage)
  }
  if (!candidate.data) return liveResource(null)

  const supabase = createServerSupabaseClient({ cacheMode: "no-store" })
  const candidatoId = candidate.data.id

  const inventario = await withSupabaseRetry(
    `legislacao_mandato_executivo_full(${slug})`,
    async (signal) =>
      fetchLegislacaoMandatoExecutivoRowsPaged(supabase, candidatoId, signal)
        .then((data) => ({ data, error: null }))
        .catch((error: unknown) => ({
          data: null,
          error: { message: error instanceof Error ? error.message : String(error) },
        }))
  )

  if (inventario.error || !inventario.data) {
    return degradedResource(null, "Não foi possível carregar o inventário completo do Executivo.")
  }

  // Mesma politica de payload publico da ficha, para que o inventario completo e a
  // previa sejam intercambiaveis no cliente (mesmos campos, mesma ordem, mesmo
  // dedup de coverage_id).
  const publicRows = applyLegislacaoMandatoExecutivoCachePolicy(
    inventario.data.map(toPublicLegislacaoMandatoExecutivoRow)
  )
  return liveResource({ rows: publicRows, total: publicRows.length })
}

async function getCandidatoBySlugResourceUncached(
  slug: string
): Promise<DataResource<FichaCandidato | null>> {
  return getCandidatoBySlugFromRelationResource(slug, CANDIDATO_PUBLIC_RELATION, false, "no-store")
}

/**
 * Caminho sem cache usado exclusivamente pelo readback final da release.
 * Reconstrói a mesma ficha da API pública diretamente do projeto canônico.
 */
export async function getCandidatoBySlugAuditResource(
  slug: string,
): Promise<DataResource<FichaCandidato | null>> {
  return getCandidatoBySlugFromRelationResource(
    slug,
    CANDIDATO_PUBLIC_RELATION,
    false,
    "no-store",
  )
}

const getCachedCandidatoBySlugResource = unstableCacheWithSingleFlight(
  async (slug: string) =>
    requireLiveResourceForCache(await getCandidatoBySlugResourceUncached(slug)),
  // Bumped 2026-05-01: payload publico de legislacao_mandato_executivo passou a
  // dropar campos internos (candidato_id/historico_politico_id/created_at/
  // identificador_fonte/fonte_primaria_titulo/fonte_tramitacao_url) e a podar
  // metadata para apenas coverage_id, mantendo o cached payload abaixo de 2 MB
  // do Vercel Data Cache (Build warning 25202862956 em /candidato/[slug] e
  // /embed/[slug] com slugs de inventario completo). Suffix invalida cache antigo
  // com o payload pre-trim.
  //
  // Bumped 2026-08-09 de novo (`ultima-verificacao-qualquer-dado-20260809`): o
  // `message` do bloco `perfil_atual` mudou de texto E de regra (passou a
  // considerar sancoes e processos), entao ficha ja aquecida serviria a frase
  // antiga por ate uma hora.
  //
  // Bumped 2026-08-09 (`frescor-data-calendario-20260809`): `section_freshness`
  // e serializado DENTRO deste payload, e o TTL e de 3600s. Sem o bump, as fichas
  // ja aquecidas continuariam servindo o `message` antigo, com a data de
  // calendario recuada um dia, por ate uma hora depois do deploy.
  //
  // Bumped 2026-09-06 (`trajetoria-candidatura-atual-20260906`): a candidatura
  // vigente passou a ser projetada na trajetória quando a linha denormalizada
  // de `historico_politico` estiver ausente. Sem o bump, perfis já aquecidos
  // continuariam omitindo 2026 durante o TTL.
  ["public-candidato-ficha-resource", "central-party-sanitize", "no-cache-degraded-v1", "legislacao-paged-v4", "lme-trim-2mb-20260501", "pl-lazy-preview-20260711", "presidential-cohort-20260515", "editorial-full-closure-20260518", "pre-candidates-lote12-20260522", "photos-names-20260610", "raw-empty-core-lote2-20260630", "raw-empty-core-lote3-20260630", "raw-empty-core-lote4-20260630", "raw-empty-core-news-lote5-20260630", "raw-empty-core-lote6-20260630", "raw-empty-core-lote7-20260630", "raw-empty-core-lote8-20260630", "raw-empty-core-lote9-20260630", "raw-empty-core-lote10-20260630", "raw-empty-core-lote11-20260630", "pe-state-html-gaps-20260708", "rr-state-completion-20260710-v2", "reescrita-claims-homonimo-20260726", "consolidacao-mapa-fome-20260726", "lme-preview-lazy-20260803", "density-bypass-clear-20260804", "sancoes-proveniencia-20260805", "verificacao-campos-tse-min-20260809", "frescor-data-calendario-20260809", "ultima-verificacao-qualquer-dado-20260809", "chapas-tse-20260815", "chapas-bio-card-20260813", "onda-p-20260814", "party-siglas-lote2-20260815", "gastos-executivo-cpgf-20260816", "gastos-executivo-ug-20260820", "trajetoria-candidatura-atual-20260906", "historico-cas-20260915", "candidate-roster-cas-20260915", "candidate-history-cas-20260915", "historico-dedupe-type-cas-20260915", "candidate-beny-sources-cas-20260915", "candidate-beny-sanctions-receipt-cas-20260915", "filiacao-google-public-copy-v2-20260916", "timeline-partidaria-registro-20260918", SENADO_CACHE_VARIANT, CURRENT_DATA_WAVE],
  {
    revalidate: APP_DATA_REVALIDATE_SECONDS,
    tags: ["public-candidato-ficha"],
  }
)

export interface CandidatoResumo {
  /** Nullable source count for sorting; missing enrichment must not compete as zero. */
  processos_ordenacao?: number | null
  candidato: Candidato
  patrimonio: number | null
  /**
   * Total declarado em 2026 >= 100x o último total anterior positivo
   * (`patrimonioDeclaradoAtipico`). Só o booleano vai para a grade; a série
   * fica no servidor para o payload público continuar pequeno.
   */
  patrimonio_atipico: boolean
  processos: number
  pontos_atencao: number
}

async function getCandidatosComResumoResourceUncached(
  cargo?: string,
  estado?: string
): Promise<DataResource<CandidatoResumo[]>> {
  if (!shouldExposeCargo(cargo)) {
    return degradedResource([], "A cobertura do Senado está desativada nesta consulta.")
  }
  const candidatosResource = await getCandidatosResource(cargo, estado)
  const candidatos = candidatosResource.data

  if (candidatosResource.sourceStatus !== "live") {
    // Sem USE_MOCK, degraded aqui é sempre falha transiente da lista: cascata
    // que não pode virar resumo vazio cacheado por 1h.
    if (!USE_MOCK) {
      throw new DegradedDataError(candidatosResource.sourceMessage)
    }
    return {
      ...candidatosResource,
      data: candidatos.map((c) => ({
        candidato: c,
        patrimonio: null,
        patrimonio_atipico: false,
        processos: 0,
        pontos_atencao: 0,
      })),
    }
  }

  if (candidatos.length === 0) {
    return liveResource([])
  }

  const supabase = createServerSupabaseClient()
  const { data: compareRows, error: compareError } = await withSupabaseRetry(
    "v_comparador(resumo)",
    async (signal) => {
      let query = supabase
        .from("v_comparador")
        .select("id, cargo_disputado, estado, total_processos, patrimonio_declarado, pontos_atencao")

      if (cargo) {
        query = query.eq("cargo_disputado", cargo)
      }

      if (estado) {
        query = query.ilike("estado", estado)
      }

      return query.abortSignal(signal)
    },
    { attemptTimeoutMs: SUPABASE_FIRST_FOLD_ATTEMPT_TIMEOUT_MS }
  )

  const sortCounts = new Map((compareError ? [] : compareRows ?? []).map((row) => [row.id, row.total_processos]))
  const compareMap = new Map<string, ResumoEnriquecimento>()
  for (const row of compareRows ?? []) {
    compareMap.set(row.id, {
      patrimonio: row.patrimonio_declarado ?? null,
      processos: row.total_processos ?? 0,
      pontosAtencao: Array.isArray(row.pontos_atencao) ? row.pontos_atencao.length : 0,
    })
  }

  if (!compareError) {
    lembrarEnriquecimento(compareMap)
  }

  const data: CandidatoResumo[] = candidatos.map((c) => {
    // Sem enriquecimento vivo, o último valor conhecido vale mais do que zero:
    // "0 processos" é uma afirmação falsa sobre um candidato, "sem dado" não.
    const enriquecimento = compareMap.get(c.id) ?? ultimoEnriquecimento(c.id)
    return {
      candidato: c,
      processos_ordenacao: sortCounts.get(c.id) ?? null,
      patrimonio: enriquecimento?.patrimonio ?? null,
      patrimonio_atipico: false,
      processos: enriquecimento?.processos ?? 0,
      pontos_atencao: enriquecimento?.pontosAtencao ?? 0,
    }
  })

  // F3 na grade: o aviso só aparece ao lado de um patrimônio exibido, então a
  // série (3 colunas) só é lida para quem tem total positivo no resumo.
  const idsComPatrimonio = data
    .filter((row) => row.patrimonio != null && row.patrimonio > 0)
    .map((row) => row.candidato.id)
  let patrimonioAtipicoError = false
  if (idsComPatrimonio.length > 0) {
    try {
      const series = await fetchPatrimonioSeriesByCandidatoIds(supabase, idsComPatrimonio)
      for (const row of data) {
        const serie = series.get(row.candidato.id)
        row.patrimonio_atipico = serie ? patrimonioDeclaradoAtipico(serie) != null : false
      }
    } catch {
      patrimonioAtipicoError = true
    }
  }

  if (compareError) {
    return degradedResource(
      data,
      "Nem todos os resumos puderam ser enriquecidos. Alguns totais podem estar zerados temporariamente."
    )
  }

  if (patrimonioAtipicoError) {
    // Sem a série, "não atípico" seria afirmação sem base; degradado não entra
    // no cache e a próxima requisição tenta de novo.
    return degradedResource(
      data,
      "Não foi possível verificar variações atípicas de patrimônio nesta tentativa."
    )
  }

  return liveResource(data)
}

const getCachedCandidatosComResumoResource = unstableCacheWithSingleFlight(
  async (cargo?: string, estado?: string) =>
    rejectPartialForCache(getCandidatosComResumoResourceUncached(cargo, estado)),
  // Bumped 2026-04-26: dados de candidato vem ja sanitizados via getCandidatosResource;
  // o suffix forca bust de cache antigo do Bloco 1.
  ["public-candidatos-resumo-resource", "central-party-sanitize", "sort-count-nullability-20260908", "presidential-cohort-20260515", "public-profile-density-20260517", "pre-candidates-lote12-20260522", "photos-names-20260610", "andre-portugues-lote8-20260630", "escopo-executivo-20260726", "cache-poison-fix-20260802", "no-cache-resumo-parcial-20260804", "chapas-tse-20260815", "onda-p-20260814", "party-siglas-lote2-20260815", "patrimonio-atipico-grade-20260916", SENADO_CACHE_VARIANT, CURRENT_DATA_WAVE],
  {
    revalidate: APP_DATA_REVALIDATE_SECONDS,
    tags: ["public-candidatos-resumo"],
  }
)

export async function getCandidatosComResumoResource(
  cargo?: string,
  estado?: string
): Promise<DataResource<CandidatoResumo[]>> {
  if (!shouldExposeCargo(cargo)) {
    return degradedResource([], "A cobertura do Senado está desativada nesta consulta.")
  }
  try {
    const resource = await getCachedCandidatosComResumoResource(cargo, estado)
    return !isSenadoEnabled() && !cargo
      ? { ...resource, data: resource.data.filter((row) => row.candidato.cargo_disputado !== "Senador") }
      : resource
  } catch (error) {
    return degradedFromError(error, [] as CandidatoResumo[])
  }
}

async function getCandidatosComparaveisResourceUncached(
  cargo?: string,
  estado?: string
): Promise<DataResource<CandidatoComparavel[]>> {
  const cargoFilter = cargo ?? "Presidente"
  if (!shouldExposeCargo(cargoFilter)) {
    return degradedResource([], "A cobertura do Senado está desativada nesta consulta.")
  }
  if (USE_MOCK) {
    return degradedResource([], SUPABASE_REQUIRED_MESSAGE)
  }

  const supabase = createServerSupabaseClient()
  const { data, error: compareError } = await withSupabaseRetry(
    `v_comparador(${cargoFilter}${estado ? `:${estado}` : ""})`,
    async (signal) => {
      let query = supabase
        .from("v_comparador")
        .select("*")
        .eq("cargo_disputado", cargoFilter)

      if (estado) {
        query = query.ilike("estado", estado)
      }

      return query.order("nome_urna").abortSignal(signal)
    },
    { attemptTimeoutMs: SUPABASE_FIRST_FOLD_ATTEMPT_TIMEOUT_MS }
  )
  if (compareError) {
    if (IS_DEV) {
      warnDevSupabaseFailure("getCandidatosComparaveis", compareError)
    } else {
      console.error("getCandidatosComparaveis failed:", compareError.message)
    }
    throw new DegradedDataError("Não foi possível montar a comparação nesta tentativa.")
  }

  const baseRows = data ?? []
  const comparadorIds = baseRows.map((r) => r.id).filter((id): id is string => Boolean(id))

  const switchCountById = new Map<string, number>()
  const gastoTotalsById = new Map<string, number>()
  const cargoAtualById = new Map<string, string | null>()
  const legislativoById = new Map<string, boolean>()
  let patrimonioPorId = new Map<string, PatrimonioAnoValor[]>()
  let processosVerificacoes = new Map<string, SancoesVerificacao>()
  if (comparadorIds.length > 0) {
    const [mudRows, gastoMap, patrimonioMap, cargoMap, legislativoMap, processosMap] =
      await Promise.all([
        fetchMudancasPartidoRowsPaged(supabase, comparadorIds),
        fetchGastoTotalsByCandidatoIds(supabase, comparadorIds),
        fetchPatrimonioSeriesByCandidatoIds(supabase, comparadorIds),
        fetchCargoAtualByCandidatoIds(supabase, comparadorIds),
        fetchLegislativeHistoryFlagsByCandidatoIds(supabase, comparadorIds),
        fetchProcessosVerificacoesBatch(baseRows.map((row) => row.slug)),
      ])
    patrimonioPorId = patrimonioMap
    processosVerificacoes = processosMap

    const byCandidato = new Map<string, MudancaPartido[]>()
    for (const row of mudRows) {
      const cid = row.candidato_id as string
      const list = byCandidato.get(cid) ?? []
      list.push(row as MudancaPartido)
      byCandidato.set(cid, list)
    }
    // Mesma linha derivada do registro usada na ficha: sem ela o comparador
    // mostra como mais fiel partidariamente quem trocou de partido depois da
    // última eleição, porque a troca só existe no registro de 2026.
    const partidoAtualById = new Map(
      baseRows.map((row) => [row.id as string, (row.partido_sigla as string | null) ?? null]),
    )
    for (const cid of comparadorIds) {
      const list = byCandidato.get(cid) ?? []
      switchCountById.set(
        cid,
        countPartySwitches(
          withCurrentRegistryPartyRow(list, {
            candidatoId: cid,
            partidoAtual: partidoAtualById.get(cid) ?? null,
          }),
        ),
      )
    }

    gastoMap.forEach((v, k) => gastoTotalsById.set(k, v))
    cargoMap.forEach((v, k) => cargoAtualById.set(k, v))
    legislativoMap.forEach((v, k) => legislativoById.set(k, v))
  }

  const normalizedRows = baseRows.map((row) => {
    const pontos = Array.isArray(row.pontos_atencao) ? row.pontos_atencao : []
    const { alertasGraves } = classifyAttentionPoints(pontos)

    const normalized = {
      ...row,
      processos_verificacao: processosVerificacoes.get(row.slug) ?? null,
      cargo_atual: cargoAtualById.has(row.id) ? (cargoAtualById.get(row.id) ?? null) : null,
      alertas_graves: alertasGraves.length,
      mudancas_partido: switchCountById.has(row.id)
        ? (switchCountById.get(row.id) ?? 0)
        : row.mudancas_partido,
      total_gasto_parlamentar: gastoTotalsById.has(row.id)
        ? (gastoTotalsById.get(row.id) ?? null)
        : null,
      tem_historico_legislativo: legislativoById.get(row.id) ?? false,
      evolucao_patrimonial_pct: evolucaoPatrimonialVs2026(
        patrimonioPorId.get(row.id) ?? [],
      ),
    }
    // pontos_atencao só serve para derivar alertas_graves no servidor; o
    // ComparadorPanel nunca lê o array no cliente. Remove do payload público
    // (e do cache de comparáveis) em vez de serializar sem uso.
    delete (normalized as { pontos_atencao?: unknown }).pontos_atencao
    return normalized
  })

  // Sanitiza partido_sigla/partido_atual antes do payload publico sair
  // (substitui mapping pontual em ComparadorPanel/RankingTable defensivos).
  return liveResource(sanitizePublicPartyFieldsList(normalizedRows as CandidatoComparavel[]))
}

const getCachedCandidatosComparaveisResource = unstableCacheWithSingleFlight(
  async (cargo?: string, estado?: string) =>
    getCandidatosComparaveisResourceUncached(cargo, estado),
  // Bumped 2026-04-26: payload publico carrega partido sanitizado.
  // Bumped 2026-06-03: pontos_atencao removido do payload de comparaveis (so
  // alimentava alertas_graves no servidor, nunca lido no cliente).
  // Bumped 2026-08-20: comparador B v1 (cargo_atual, bloco CEAP, sem votos).
  // Bumped 2026-08-20: sem flag de gastos_executivo no payload do comparador.
  ["public-candidatos-comparaveis-resource", "central-party-sanitize", "presidential-cohort-20260515", "public-profile-density-20260517", "comparaveis-strip-pontos-20260603", "photos-names-20260610", "escopo-executivo-20260726", "cache-poison-fix-20260802", "chapas-tse-20260815", "onda-p-20260814", "party-siglas-lote2-20260815", "evolucao-patrimonial-lista-20260819", "comparador-b-v1-20260820", "comparador-ceap-federal-20260820", "comparador-sem-executivo-20260820", "timeline-partidaria-registro-20260918", SENADO_CACHE_VARIANT, CURRENT_DATA_WAVE],
  {
    revalidate: APP_DATA_REVALIDATE_SECONDS,
    tags: ["public-candidatos-comparaveis"],
  }
)

export async function getCandidatosComparaveisResource(
  cargo?: string,
  estado?: string
): Promise<DataResource<CandidatoComparavel[]>> {
  if (!shouldExposeCargo(cargo ?? "Presidente")) {
    return degradedResource([], "A cobertura do Senado está desativada nesta consulta.")
  }
  try {
    return await getCachedCandidatosComparaveisResource(cargo, estado)
  } catch (error) {
    return degradedFromError(error, [] as CandidatoComparavel[])
  }
}

function toRankingCandidateSummary(candidate: Pick<Candidato, 'id' | 'nome_urna' | 'slug' | 'partido_sigla' | 'cargo_disputado' | 'estado' | 'foto_url'>): RankingCandidateSummary {
  return {
    id: candidate.id,
    nome_urna: candidate.nome_urna,
    slug: candidate.slug,
    partido_sigla: candidate.partido_sigla,
    cargo_disputado: candidate.cargo_disputado,
    estado: candidate.estado,
    foto_url: candidate.foto_url,
  }
}

function toRankingFieldCandidate(candidate: CandidatoComparavel): RankingFieldCandidate {
  return {
    id: candidate.id,
    nome_urna: candidate.nome_urna,
    slug: candidate.slug,
    partido_sigla: candidate.partido_sigla,
    cargo_disputado: candidate.cargo_disputado,
    estado: candidate.estado,
    foto_url: candidate.foto_url,
    mudancas_partido: candidate.mudancas_partido,
    patrimonio_declarado: candidate.patrimonio_declarado,
  }
}

async function getFieldRankingEntriesResource(
  definition: RankingDefinition,
  cargo: string,
  estado?: string
): Promise<DataResource<RankingEntry[]>> {
  if (!definition.sourceField) {
    return liveResource([])
  }

  const comparaveisResource = await getCandidatosComparaveisResource(cargo, estado)
  // Default desc sort: OG images and index cards read entries[0] as leader
  const entries = sortRankingEntries(
    buildFieldRankingEntries({
      candidatos: comparaveisResource.data.map(toRankingFieldCandidate),
      sourceField: definition.sourceField,
    })
  )

  return {
    ...comparaveisResource,
    data: entries,
  }
}

async function getAggregateRankingEntriesResource(
  definition: RankingDefinition,
  cargo: string,
  estado?: string
): Promise<DataResource<RankingEntry[]>> {
  const candidatosResource = await getCandidatosResource(cargo, estado)
  const candidatos = candidatosResource.data.map((candidate) =>
    toRankingCandidateSummary(candidate)
  )
  // Default desc sort: OG images and index cards read entries[0] as leader
  const buildEntries = (rows: Array<{ candidato_id: string; metricValue: number | null }>) =>
    sortRankingEntries(buildAggregateRankingEntries({ candidatos, rows }))

  if (candidatosResource.sourceStatus !== "live") {
    return {
      ...candidatosResource,
      data: buildEntries([]),
    }
  }

  if (candidatos.length === 0) {
    return liveResource([])
  }

  const supabase = createServerSupabaseClient()
  const candidateIds = candidatos.map((candidato) => candidato.id)

  switch (definition.tableName) {
    case "gastos_parlamentares": {
      let totalsMap: Map<string, number>
      try {
        totalsMap = await fetchGastoTotalsByCandidatoIds(supabase, candidateIds)
      } catch (fetchError) {
        const err =
          fetchError instanceof Error ? fetchError : new Error(String(fetchError))
        if (IS_DEV) {
          warnDevSupabaseFailure("getRankingData", err)
        } else {
          console.error("getRankingData gastos aggregate failed:", err.message)
        }
        return degradedResource(
          buildEntries([]),
          "Não foi possível calcular esta métrica nesta tentativa."
        )
      }

      const rows = candidatos.map((candidato) => ({
        candidato_id: candidato.id,
        metricValue: totalsMap.has(candidato.id) ? (totalsMap.get(candidato.id) ?? null) : null,
      }))

      return liveResource(buildEntries(rows))
    }

    default:
      return liveResource(buildEntries([]))
  }
}

async function getRankingDataResourceUncached(
  slug: string,
  cargo?: string,
  estado?: string
): Promise<DataResource<RankingDataset>> {
  const definition = getRankingDefinitionBySlug(slug)
  if (!definition) {
    throw new Error(`Unknown ranking slug: ${slug}`)
  }

  const normalized = normalizeRankingFilters({ cargo, uf: estado })
  const estadoFilter = definition.supportsUf ? normalized.estado : undefined

  const entriesResource =
    definition.queryType === "comparador-field"
      ? await getFieldRankingEntriesResource(definition, normalized.cargo, estadoFilter)
      : await getAggregateRankingEntriesResource(definition, normalized.cargo, estadoFilter)

  // Sem USE_MOCK, entries degradadas são sempre falha transiente (cascata dos
  // comparáveis/lista ou métrica agregada que falhou): ranking vazio ou com
  // métricas todas nulas não pode ser cacheado por 1h.
  if (!USE_MOCK && entriesResource.sourceStatus !== "live") {
    throw new DegradedDataError(entriesResource.sourceMessage)
  }

  return {
    ...entriesResource,
    data: {
      definition,
      cargo: normalized.cargo,
      estado: estadoFilter,
      entries: entriesResource.data,
    },
  }
}

const getCachedRankingDataResource = unstableCacheWithSingleFlight(
  async (slug: string, cargo: string, estado: string) =>
    getRankingDataResourceUncached(slug, cargo || undefined, estado || undefined),
  // Bumped 2026-05-21: copy pública de rankings virou "listas temáticas";
  // invalida definition.title/contextExplanation serializados no Data Cache.
  ["ranking-data-resource-public-copy-20260521", "escopo-executivo-20260726", "cache-poison-fix-20260802", "chapas-tse-20260815", "onda-p-20260814", "party-siglas-lote2-20260815", SENADO_CACHE_VARIANT, CURRENT_DATA_WAVE],
  {
    revalidate: APP_DATA_REVALIDATE_SECONDS,
    tags: ["ranking-data"],
  }
)

export async function getRankingDataResource(
  slug: string,
  cargo?: string,
  estado?: string
): Promise<DataResource<RankingDataset>> {
  try {
    return await getCachedRankingDataResource(slug, cargo ?? "", estado ?? "")
  } catch (error) {
    // "Unknown ranking slug" e afins continuam subindo; só falha transiente degrada.
    if (!(error instanceof DegradedDataError)) throw error
    const definition = getRankingDefinitionBySlug(slug)
    if (!definition) throw error
    const normalized = normalizeRankingFilters({ cargo, uf: estado })
    return degradedResource(
      {
        definition,
        cargo: normalized.cargo,
        estado: definition.supportsUf ? normalized.estado : undefined,
        entries: [] as RankingEntry[],
      },
      error.sourceMessage
    )
  }
}

const QUIZ_PAGE_SIZE = 500
type QuizPageResponse<T> = SupabaseRunResult<T[]> & { count?: number | null }

/** Paginação estável para os enriquecimentos do quiz, sem o limite default 1000. */
async function fetchQuizRowsPaged<T>(
  countQuery: (signal: AbortSignal) => PromiseLike<QuizPageResponse<unknown>>,
  pageQuery: (from: number, to: number, signal: AbortSignal) => PromiseLike<QuizPageResponse<T>>,
  signal: AbortSignal,
): Promise<QuizPageResponse<T>> {
  const countResult = await countQuery(signal)
  if (countResult.error) return { data: null, error: countResult.error, count: countResult.count }

  const total = countResult.count ?? 0
  const starts = Array.from({ length: Math.ceil(total / QUIZ_PAGE_SIZE) }, (_, i) => i * QUIZ_PAGE_SIZE)
  const pages = await Promise.all(starts.map((from) => pageQuery(from, from + QUIZ_PAGE_SIZE - 1, signal)))
  const failed = pages.find((page) => page.error)
  if (failed?.error) return { data: null, error: failed.error, count: total }
  const rows = pages.flatMap((page) => page.data ?? [])
  if (rows.length !== total) {
    return {
      data: null,
      error: { code: "QUIZ_PAGINATION_INCOMPLETE", message: `${rows.length} linhas recebidas de ${total} contadas` },
      count: total,
    }
  }
  return { data: rows, error: null, count: total }
}

async function getQuizAlignmentDatasetResourceUncached(
  cargo = "Presidente",
  estado?: string
): Promise<DataResource<QuizAlignmentDataset>> {
  const estadoNorm = estado?.trim() || undefined

  if (USE_MOCK) {
    return degradedResource(
      {
        candidatos: [],
        votacoes_mapeadas: [],
        votacao_titulo_to_id: {},
        votacao_fonte_por_titulo: {},
        votacao_fonte_por_id: {},
      },
      SUPABASE_REQUIRED_MESSAGE
    )
  }

  const candidatosRes = await getCandidatosResourceUncached(cargo, estadoNorm)
  const candidatos = candidatosRes.data

  if (candidatos.length === 0) {
    return {
      data: {
        candidatos: [],
        votacoes_mapeadas: [],
        votacao_titulo_to_id: {},
        votacao_fonte_por_titulo: {},
        votacao_fonte_por_id: {},
      },
      sourceStatus: candidatosRes.sourceStatus,
      sourceMessage: candidatosRes.sourceMessage,
    }
  }

  const supabase = createServerSupabaseClient()

  const { data: rowsVotacoes, error: errVotacoes } = await withSupabaseRetry(
    "quiz-votacoes-chave",
    async (signal) =>
      fetchQuizRowsPaged(
        (pageSignal) => supabase
          .from("votacoes_chave")
          .select("id", { count: "exact", head: true })
          .abortSignal(pageSignal),
        (from, to, pageSignal) => supabase
          .from("votacoes_chave")
          .select("id,titulo,casa,fonte,votacao_id_api,proposicao_id")
          .order("id", { ascending: true })
          .range(from, to)
          .abortSignal(pageSignal),
        signal,
      )
  )

  if (errVotacoes || !rowsVotacoes) {
    if (IS_DEV) {
      warnDevSupabaseFailure("getQuizAlignmentDatasetResource", errVotacoes)
    } else {
      console.error("quiz votacoes_chave failed:", errVotacoes?.message)
    }
    const fallbackCandidatos: QuizCandidatoData[] = candidatos.map((c) => ({
      id: c.id,
      slug: c.slug,
      nome_urna: c.nome_urna,
      partido_sigla: c.partido_sigla,
      foto_url: c.foto_url,
      cargo_disputado: c.cargo_disputado,
      estado: c.estado ?? null,
      votos: {},
    }))
    return degradedResource(
      {
        candidatos: fallbackCandidatos,
        votacoes_mapeadas: [],
        votacao_titulo_to_id: {},
        votacao_fonte_por_titulo: {},
        votacao_fonte_por_id: {},
      },
      mergeSourceMessages(
        candidatosRes.sourceMessage,
        "Catálogo de votações nominais do quiz indisponível nesta tentativa; posições declaradas podem ter cobertura parcial."
      )
    )
  }

  const catalogRows = (rowsVotacoes ?? []) as QuizVotacaoCatalogRow[]
  const votacaoResolution = resolveQuizVotacaoCatalog(catalogRows)
  const tituloToId: Record<string, string> = { ...votacaoResolution.votacaoTituloToId }
  const votacaoFontePorTitulo: Record<string, string | null> = {}
  const votacaoFontePorId: Record<string, string | null> = {}
  for (const ref of QUIZ_VOTACAO_REFERENCIAS) {
    const rows = votacaoResolution.matchedRowsByQuestionId.get(ref.questionId) ?? []
    for (const row of rows) {
      const url = buildVotacaoPublicUrl(row.casa, row.proposicao_id)
      votacaoFontePorId[row.id] = url
      if (!votacaoFontePorTitulo[row.titulo]) votacaoFontePorTitulo[row.titulo] = url
    }
    const selected = rows[0]
    if (selected && !votacaoFontePorTitulo[ref.titulo]) {
      votacaoFontePorTitulo[ref.titulo] = buildVotacaoPublicUrl(selected.casa, selected.proposicao_id)
    }
  }
  const votacaoIds = [
    ...new Set(
      [...votacaoResolution.matchedRowsByQuestionId.values()]
        .flatMap((rows) => rows.map((row) => row.id)),
    ),
  ]
  const candidatoIds = candidatos.map((c) => c.id)

  let votosRows: {
    candidato_id: string
    votacao_id: string
    voto: string
    contradicao: boolean | null
    contradicao_descricao: string | null
  }[] = []
  let votosFailed = false
  if (votacaoIds.length > 0 && candidatoIds.length > 0) {
    const { data, error: errVotos } = await withSupabaseRetry("quiz-votos-candidato", async (signal) =>
      fetchQuizRowsPaged(
        (pageSignal) => supabase
          .from("votos_candidato")
          .select("id", { count: "exact", head: true })
          .in("candidato_id", candidatoIds)
          .in("votacao_id", votacaoIds)
          .abortSignal(pageSignal),
        (from, to, pageSignal) => supabase
          .from("votos_candidato")
          .select("id,candidato_id,votacao_id,voto,contradicao,contradicao_descricao")
          .in("candidato_id", candidatoIds)
          .in("votacao_id", votacaoIds)
          .order("id", { ascending: true })
          .range(from, to)
          .abortSignal(pageSignal),
        signal,
      )
    )
    if (errVotos) {
      votosFailed = true
      if (IS_DEV) {
        warnDevSupabaseFailure("getQuizAlignmentDatasetResource-votos", errVotos)
      } else {
        console.error("quiz votos_candidato failed:", errVotos.message)
      }
    } else {
      votosRows = data ?? []
    }
  }

  const votosPorCandidato = new Map<string, QuizCandidatoData["votos"]>()
  const contradicoesPorCandidato = new Map<string, QuizContradicaoVoto[]>()
  for (const c of candidatos) {
    votosPorCandidato.set(c.id, {})
    contradicoesPorCandidato.set(c.id, [])
  }
  for (const row of votosRows) {
    const n = normalizeVotoFromApi(row.voto)
    if (!n) continue
    const bag = votosPorCandidato.get(row.candidato_id)
    if (bag) {
      bag[row.votacao_id] = n
    }
    if (
      row.contradicao &&
      row.contradicao_descricao?.trim() &&
      votacaoIds.includes(row.votacao_id)
    ) {
      let titulo = ""
      for (const [t, vid] of Object.entries(tituloToId)) {
        if (vid === row.votacao_id) {
          titulo = t
          break
        }
      }
      if (!titulo) continue
      contradicoesPorCandidato.get(row.candidato_id)?.push({
        votacao_titulo: titulo,
        descricao: row.contradicao_descricao.trim(),
      })
    }
  }

  const plPorCandidato = new Map<string, Record<string, number>>()
  const plUrlPorCandidato = new Map<string, Record<string, string>>()
  const mudancasPorCandidato = new Map<string, number>()
  const posPorCandidato = new Map<string, QuizPosicaoDeclarada[]>()
  const financiamentoPorCandidato = new Map<string, string | null>()
  let projetosFailed = false
  let mudancasFailed = false
  let posicoesFailed = false
  let financiamentoFailed = false
  for (const c of candidatos) {
    plPorCandidato.set(c.id, {})
    plUrlPorCandidato.set(c.id, {})
    mudancasPorCandidato.set(c.id, 0)
    posPorCandidato.set(c.id, [])
    financiamentoPorCandidato.set(c.id, null)
  }

  if (candidatoIds.length > 0) {
    const { data: plData, error: plErr } = await withSupabaseRetry("quiz-projetos-lei", async (signal) =>
      fetchQuizRowsPaged(
        (pageSignal) => supabase
          .from("projetos_lei")
          .select("id", { count: "exact", head: true })
          .in("candidato_id", candidatoIds)
          .not("tema", "is", null)
          .abortSignal(pageSignal),
        (from, to, pageSignal) => supabase
          .from("projetos_lei")
          .select("candidato_id,tema,url_inteiro_teor")
          .in("candidato_id", candidatoIds)
          .not("tema", "is", null)
          .order("id", { ascending: true })
          .range(from, to)
          .abortSignal(pageSignal),
        signal,
      )
    )
    projetosFailed = Boolean(plErr)
    for (const row of plData ?? []) {
      const tema = typeof row.tema === "string" ? row.tema.trim() : ""
      if (!tema) continue
      const bag = plPorCandidato.get(row.candidato_id) ?? {}
      bag[tema] = (bag[tema] ?? 0) + 1
      plPorCandidato.set(row.candidato_id, bag)
      const urlRaw = typeof row.url_inteiro_teor === "string" ? row.url_inteiro_teor.trim() : ""
      if (urlRaw) {
        const urlBag = plUrlPorCandidato.get(row.candidato_id as string) ?? {}
        if (!urlBag[tema]) {
          urlBag[tema] = urlRaw
          plUrlPorCandidato.set(row.candidato_id as string, urlBag)
        }
      }
    }

    const { data: mudData, error: mudErr } = await withSupabaseRetry("quiz-mudancas-partido", async (signal) =>
      fetchQuizRowsPaged(
        (pageSignal) => supabase
          .from("mudancas_partido")
          .select("id", { count: "exact", head: true })
          .in("candidato_id", candidatoIds)
          .is("despublicado_em", null)
          .abortSignal(pageSignal),
        (from, to, pageSignal) => supabase
          .from("mudancas_partido")
          .select("candidato_id,id,ano,partido_anterior,partido_novo,data_mudanca,contexto")
          .in("candidato_id", candidatoIds)
          .is("despublicado_em", null)
          .order("id", { ascending: true })
          .range(from, to)
          .abortSignal(pageSignal),
        signal,
      )
    )
    mudancasFailed = Boolean(mudErr)
    if (mudErr && IS_DEV) console.warn("quiz mudancas_partido:", mudErr.message)
    const mudancasRowsByCandidato = new Map<string, MudancaPartido[]>()
    for (const c of candidatos) {
      mudancasRowsByCandidato.set(c.id, [])
    }
    for (const row of mudData ?? []) {
      const id = row.candidato_id as string
      const list = mudancasRowsByCandidato.get(id) ?? []
      list.push(row as MudancaPartido)
      mudancasRowsByCandidato.set(id, list)
    }
    for (const c of candidatos) {
      mudancasPorCandidato.set(
        c.id,
        countPartySwitches(
          withCurrentRegistryPartyRow(mudancasRowsByCandidato.get(c.id) ?? [], {
            candidatoId: c.id,
            partidoAtual: c.partido_sigla ?? c.partido_atual,
          }),
        )
      )
    }

    const { data: posData, error: posErr } = await withSupabaseRetry("quiz-posicoes-declaradas", async (signal) =>
      fetchQuizRowsPaged(
        (pageSignal) => supabase
          .from("posicoes_declaradas")
          .select("id", { count: "exact", head: true })
          .in("candidato_id", candidatoIds)
          .eq("verificado", true)
          .abortSignal(pageSignal),
        (from, to, pageSignal) => supabase
          .from("posicoes_declaradas")
          .select("candidato_id,tema,posicao,descricao,fonte,url_fonte")
          .in("candidato_id", candidatoIds)
          .eq("verificado", true)
          .order("id", { ascending: true })
          .range(from, to)
          .abortSignal(pageSignal),
        signal,
      )
    )
    posicoesFailed = Boolean(posErr)
    if (!posErr && posData) {
      for (const row of posData) {
        const po = row.posicao as string
        if (po !== "a_favor" && po !== "contra" && po !== "ambiguo") continue
        posPorCandidato.get(row.candidato_id as string)?.push({
          tema: row.tema as string,
          posicao: po as QuizPosicaoDeclarada["posicao"],
          descricao: row.descricao as string | null,
          fonte: row.fonte as string | null,
          url_fonte: row.url_fonte as string | null,
        })
      }
    } else if (posErr && IS_DEV) {
      console.warn("quiz posicoes_declaradas:", posErr.message)
    }

    const { data: finRows, error: finErr } = await withSupabaseRetry("quiz-financiamento", async (signal) =>
      fetchQuizRowsPaged(
        (pageSignal) => supabase
          .from("financiamento_publico")
          .select("id", { count: "exact", head: true })
          .in("candidato_id", candidatoIds)
          .abortSignal(pageSignal),
        (from, to, pageSignal) => supabase
          .from("financiamento_publico")
          .select("candidato_id,ano_eleicao,total_arrecadado,maiores_doadores")
          .in("candidato_id", candidatoIds)
          .order("id", { ascending: true })
          .range(from, to)
          .abortSignal(pageSignal),
        signal,
      )
    )
    financiamentoFailed = Boolean(finErr)
    if (!finErr && finRows?.length) {
      const latestByCandidato = new Map<
        string,
        { ano: number; total: number | null; maiores: unknown }
      >()
      for (const row of finRows) {
        const cid = row.candidato_id as string
        const ano = Number(row.ano_eleicao)
        if (!Number.isFinite(ano)) continue
        const prev = latestByCandidato.get(cid)
        if (!prev || ano > prev.ano) {
          latestByCandidato.set(cid, {
            ano,
            total: row.total_arrecadado != null ? Number(row.total_arrecadado) : null,
            maiores: sanitizeMaioresDoadoresForPublic(row.maiores_doadores),
          })
        }
      }
      for (const [cid, pack] of latestByCandidato) {
        const ctx = buildFinanciamentoContexto(pack.ano, pack.total, pack.maiores)
        financiamentoPorCandidato.set(cid, ctx)
      }
    } else if (finErr && IS_DEV) {
      console.warn("quiz financiamento:", finErr.message)
    }
  }

  const out: QuizCandidatoData[] = candidatos.map((c) => {
    const pls = plPorCandidato.get(c.id) ?? {}
    const plUrls = plUrlPorCandidato.get(c.id) ?? {}
    const pos = posPorCandidato.get(c.id) ?? []
    const ctr = contradicoesPorCandidato.get(c.id) ?? []
    const finCtx = financiamentoPorCandidato.get(c.id) ?? null
    // O contexto do quiz é factual, vindo da prestação de contas do TSE.
    // O centroide editorial de doadores não é carregado nesta superfície.
    return {
      id: c.id,
      slug: c.slug,
      nome_urna: c.nome_urna,
      partido_sigla: c.partido_sigla,
      foto_url: c.foto_url,
      cargo_disputado: c.cargo_disputado,
      estado: c.estado ?? null,
      votos: votosPorCandidato.get(c.id) ?? {},
      pls_por_tema: Object.keys(pls).length > 0 ? pls : undefined,
      pl_url_exemplo_por_tema: Object.keys(plUrls).length > 0 ? plUrls : undefined,
      posicoes_declaradas: pos.length > 0 ? pos : undefined,
      contradicoes_voto: ctr.length > 0 ? ctr : undefined,
      mudancas_partido_count: mudancasPorCandidato.get(c.id) ?? 0,
      ...(finCtx ? { financiamento_contexto: finCtx } : {}),
    }
  })

  const dataset = {
    candidatos: out,
    votacoes_mapeadas: votacaoIds,
    votacao_titulo_to_id: tituloToId,
    // Campo novo para perguntas que têm votação nominal equivalente nas duas
    // casas. O mapa singular acima fica preservado para o scoring legado.
    votacao_titulo_to_ids: votacaoResolution.votacaoTituloToIds,
    votacao_status_por_pergunta: votacaoResolution.statusByQuestionId,
    votacao_fonte_por_titulo: votacaoFontePorTitulo,
    votacao_fonte_por_id: votacaoFontePorId,
  } as QuizAlignmentDataset

  const knownUnmapped = new Set(votacaoResolution.knownUnmappedQuestionIds)
  const unexpectedMissing = votacaoResolution.missingQuestionIds.filter((id) => !knownUnmapped.has(id))
  const unexpectedOrphan = votacaoResolution.orphanQuestionIds.filter((id) => !knownUnmapped.has(id))
  const titleForQuestion = (questionId: string) =>
    QUIZ_VOTACAO_REFERENCIAS.find((ref) => ref.questionId === questionId)?.titulo ?? questionId

  const sourceStatus = mergeSourceStatuses(
    candidatosRes.sourceStatus,
    votosFailed || projetosFailed || mudancasFailed || posicoesFailed || financiamentoFailed ||
      unexpectedMissing.length > 0 || unexpectedOrphan.length > 0
      ? "degraded"
      : "live"
  )
  const sourceMessage = mergeSourceMessages(
    candidatosRes.sourceMessage,
    votosFailed ? "Votos nominais do Congresso para o quiz indisponíveis nesta tentativa; posições declaradas podem ter cobertura parcial." : null,
    projetosFailed ? "Projetos de lei do quiz não responderam; a cobertura legislativa está incompleta." : null,
    mudancasFailed ? "Mudanças de partido do quiz não responderam; a contagem de trocas está incompleta." : null,
    posicoesFailed ? "Posições declaradas do quiz não responderam; a cobertura de posições está incompleta." : null,
    financiamentoFailed ? "Financiamento público do quiz não respondeu; o contexto financeiro está incompleto." : null,
    unexpectedMissing.length > 0
      ? `Referências nominais ausentes no catálogo: ${unexpectedMissing.map(titleForQuestion).join(", ")}.`
      : null,
    unexpectedOrphan.length > 0
      ? `Referências nominais órfãs no catálogo: ${unexpectedOrphan.map(titleForQuestion).join(", ")}.`
      : null,
  )

  return {
    data: dataset,
    sourceStatus,
    sourceMessage,
  }
}

const getCachedQuizAlignmentDatasetResource = unstableCacheWithSingleFlight(
  async (cargo: string, estado: string) =>
    rejectPartialForCache(getQuizAlignmentDatasetResourceUncached(cargo, estado || undefined)),
  ["quiz-alignment-dataset-resource", "quiz-votacao-reference-v1", "quiz-paged-enrichment-v1", "fase2", "escopo-executivo-20260726", "cache-poison-fix-20260802", "no-cache-resumo-parcial-20260804", "chapas-tse-20260815", "onda-p-20260814", "party-siglas-lote2-20260815", "quiz-mudancas-despublicado-v1", "timeline-partidaria-registro-20260918", SENADO_CACHE_VARIANT, CURRENT_DATA_WAVE],
  {
    revalidate: APP_DATA_REVALIDATE_SECONDS,
    tags: ["quiz-dataset"],
  }
)

export async function getQuizAlignmentDatasetResource(
  cargo = "Presidente",
  estado?: string
): Promise<DataResource<QuizAlignmentDataset>> {
  try {
    return await getCachedQuizAlignmentDatasetResource(cargo, estado ?? "")
  } catch (error) {
    // Cascata: getCandidatosResourceUncached lança na falha transiente e o
    // throw atravessa o dataset do quiz até aqui.
    return degradedFromError(error, {
      candidatos: [],
      votacoes_mapeadas: [],
      votacao_titulo_to_id: {},
      votacao_fonte_por_titulo: {},
    } as QuizAlignmentDataset)
  }
}

const INDICADORES_ESTADO_COLUMNS =
  "id, estado, ano, fonte, indicador, valor, valor_texto, unidade, metadata" as const
const INDICADORES_RANKING_COLUMNS = "id, estado, ano, indicador, valor, fonte, unidade, metadata" as const

function mapIndicadorEstadualRow(row: {
  id: string
  estado: string
  ano: number
  fonte: string
  indicador: string
  valor: number | null
  valor_texto: string | null
  unidade: string | null
  metadata: Record<string, unknown> | null
}): IndicadorEstadual {
  return {
    ...row,
    unidade: row.unidade ?? null,
    metadata: row.metadata ?? null,
  }
}

async function getIndicadoresEstadoResourceUncached(
  uf: string
): Promise<DataResource<IndicadorEstadual[]>> {
  if (USE_MOCK) {
    return degradedResource([], SUPABASE_REQUIRED_MESSAGE)
  }
  const supabase = createServerSupabaseClient()
  const { data, error } = await withSupabaseRetry(
    `indicadores_estaduais(${uf})`,
    async (signal) =>
      supabase
        .from("indicadores_estaduais")
        .select(INDICADORES_ESTADO_COLUMNS)
        .ilike("estado", uf)
        .order("ano", { ascending: false })
        .abortSignal(signal)
  )

  if (error || !data) {
    if (IS_DEV) {
      warnDevSupabaseFailure("getIndicadoresEstadoResource", error)
      throw new DegradedDataError(
        "Indicadores estaduais indisponíveis. Seção do território pode ficar vazia."
      )
    }
    console.error("getIndicadoresEstadoResource failed:", error?.message)
    throw new DegradedDataError(
      "Não foi possível carregar indicadores estaduais nesta tentativa."
    )
  }

  return liveResource(data.map(mapIndicadorEstadualRow))
}

const getCachedIndicadoresEstadoResource = unstableCacheWithSingleFlight(
  async (uf: string) => getIndicadoresEstadoResourceUncached(uf),
  ["public-indicadores-estado-resource", "reference-contract-20260908", CURRENT_DATA_WAVE],
  {
    revalidate: APP_DATA_REVALIDATE_SECONDS,
    tags: ["public-indicadores-estado"],
  }
)

export async function getIndicadoresEstadoResource(
  uf: string
): Promise<DataResource<IndicadorEstadual[]>> {
  try {
    return await getCachedIndicadoresEstadoResource(uf)
  } catch (error) {
    return degradedFromError(error, [] as IndicadorEstadual[])
  }
}

async function getIndicadoresAllEstadosResourceUncached(): Promise<
  DataResource<IndicadorEstadualRanking[]>
> {
  if (USE_MOCK) {
    return degradedResource([], SUPABASE_REQUIRED_MESSAGE)
  }
  const supabase = createServerSupabaseClient()
  const { data, error } = await withSupabaseRetry("indicadores_estaduais_all", async (signal) =>
    supabase
      .from("indicadores_estaduais")
      .select(INDICADORES_RANKING_COLUMNS)
      .order("ano", { ascending: false })
      .abortSignal(signal)
  )

  if (error || !data) {
    if (IS_DEV) {
      warnDevSupabaseFailure("getIndicadoresAllEstadosResource", error)
      throw new DegradedDataError(
        "Ranking nacional de indicadores indisponível nesta tentativa."
      )
    }
    console.error("getIndicadoresAllEstadosResource failed:", error?.message)
    throw new DegradedDataError(
      "Não foi possível carregar indicadores para ranking nesta tentativa."
    )
  }

  return liveResource(
    data.map((row): IndicadorEstadualRanking => ({
      id: row.id,
      estado: row.estado,
      ano: row.ano,
      indicador: row.indicador,
      valor: row.valor ?? null,
      fonte: row.fonte ?? null,
      unidade: row.unidade ?? null,
      metadata: row.metadata ?? null,
    }))
  )
}

const getCachedIndicadoresAllEstadosResource = unstableCacheWithSingleFlight(
  async () => getIndicadoresAllEstadosResourceUncached(),
  ["public-indicadores-all-estados-resource", "reference-contract-20260908", CURRENT_DATA_WAVE],
  {
    revalidate: APP_DATA_REVALIDATE_SECONDS,
    tags: ["public-indicadores-all"],
  }
)

export async function getIndicadoresAllEstadosResource(): Promise<
  DataResource<IndicadorEstadualRanking[]>
> {
  try {
    return await getCachedIndicadoresAllEstadosResource()
  } catch (error) {
    return degradedFromError(error, [] as IndicadorEstadualRanking[])
  }
}

export { getEstadoNome, getEstadoUFs } from "@/lib/br-uf"

const api = {
  mergeSourceStatuses,
  mergeSourceMessages,
  getCandidatosResource,
  getGlobalSearchIndexResource,
  getCandidatoSlugStaticParams,
  getCandidatoMetadataResource,
  getCandidatoBySlugResource,
  getCandidatoBySlugPreviewResource,
  getCandidatosComResumoResource,
  getCandidatosComparaveisResource,
  getRankingDataResource,
  getQuizAlignmentDatasetResource,
  getIndicadoresEstadoResource,
  getIndicadoresAllEstadosResource,
}

export default api

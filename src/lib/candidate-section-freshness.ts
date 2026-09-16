import { rotuloDoAcervo } from "@/lib/proposicao-natureza"
import type { Candidato, Financiamento, GastoExecutivo, GastoParlamentar, HistoricoPolitico, MudancaPartido, Patrimonio, PatrimonioEleicaoPublico, ProjetoLei, SancoesVerificacao, SectionFreshnessInfo, SectionFreshnessKey, VotoCandidato } from "./types"
import { FINANCIAMENTO_ANO_INICIAL_DA_SERIE_TSE, type FinanciamentoEleicaoPublico } from "./financiamento-eleicoes"
import { isHistoricoCandidaturaRow } from "@/lib/historico-tipo-evento"
import { CHAVE_AGREGADO_CURADO, ROTULO_FONTE_TSE, candidataDeColeta, resolverFrescorTsePerfil, resolverUltimaVerificacaoDoPerfil } from "@/lib/verificacao-campos"
import { formatDate } from "@/lib/utils"

/** Fontes que precisam confirmar a ausência de mandato federal parlamentar. */
export const FEDERAL_ACERVO_SOURCES = ["camara", "senado", "ceaps-senado", "jarbas"] as const
export type FederalAcervoSource = (typeof FEDERAL_ACERVO_SOURCES)[number]

export interface FederalAcervoReceipt {
  fonte: FederalAcervoSource
  resultado: SancoesVerificacao["resultado"]
  executado_em: string
  /** Data em que a fonte oficial foi consultada, distinta da persistência do recibo. */
  verificado_em?: string | null
  detalhe?: string | null
  escopo?: string | null
  source_ids?: string[]
  source_urls?: string[]
  url?: string | null
}

export type FederalAcervoReceipts = Partial<Record<FederalAcervoSource, FederalAcervoReceipt | null>>

/** Remove referências internas de aplicação antes de formar a copy pública. */
export function sanitizeFiliacaoDetail(value: string | null | undefined): string | null {
  if (typeof value !== "string" || !value.trim()) return null
  const sanitized = value
    .replace(/\s+artifact=\S+/gi, "")
    .replace(/\s+xml_sha256=[a-f0-9]{64}/gi, "")
    .replace(/\bem (\d{4})-(\d{2})-(\d{2})(?:T[^.\s]+(?:\.\d+)?Z)?/i, (_match, year, month, day) => `em ${day}/${month}/${year}`)
    .replace(/\s+Resultado indeterminado\.(?=\s*Resultado inconclusivo)/i, "")
    .trim()
  return sanitized || null
}

/** Recibo temporal da série Jarbas, aplicável somente a gastos parlamentares. */
export interface FederalExpenseTemporalApplicability {
  status: "not_applicable"
  source: "jarbas"
  verifiedAt: string
  referenceYear: number
  sourceLabel: string
  scope: string
  evidence_sources: string[]
  source_urls: string[]
  message: string
}

const FEDERAL_EXPENSE_TEMPORAL_SOURCE_IDS = [
  "camara-parliamentarian-registry-all-legislatures",
  "camara-parliamentarian-registry-scope-control",
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

/** Só aceita o recibo nominal com prova explícita da série anual 2009-2026. */
function resolveFederalExpenseTemporalNotApplicable(
  value: unknown,
): SectionFreshnessInfo | null {
  if (!isRecord(value) || value.status !== "not_applicable" || value.source !== "jarbas") return null
  const verifiedAt = typeof value.verifiedAt === "string" && parseDate(value.verifiedAt) ? value.verifiedAt : null
  const scope = typeof value.scope === "string" ? value.scope.trim() : ""
  const sourceLabel = typeof value.sourceLabel === "string" ? value.sourceLabel.trim() : ""
  const message = typeof value.message === "string" ? value.message.trim() : ""
  const referenceYear = value.referenceYear
  const evidenceSources = Array.isArray(value.evidence_sources) ? value.evidence_sources : []
  const sourceUrls = Array.isArray(value.source_urls) ? value.source_urls : []
  const validUrls = sourceUrls.every((item) => {
    if (typeof item !== "string") return false
    try {
      const url = new URL(item)
      return url.protocol === "https:" && (url.hostname === "camara.leg.br" || url.hostname.endsWith(".camara.leg.br"))
    } catch {
      return false
    }
  })
  if (!verifiedAt || referenceYear !== 2026 || !/despesas Jarbas/i.test(scope) || !/série anual 2009-2026/i.test(scope) || !/identidade nominal/i.test(scope) || !sourceLabel || !message || !/não altera camara/i.test(message) || evidenceSources.length !== FEDERAL_EXPENSE_TEMPORAL_SOURCE_IDS.length || !FEDERAL_EXPENSE_TEMPORAL_SOURCE_IDS.every((source) => evidenceSources.includes(source)) || sourceUrls.length !== evidenceSources.length || !validUrls) return null
  return {
    key: "gastos_parlamentares",
    label: "Gastos parlamentares",
    status: "not_applicable",
    verifiedAt,
    referenceDate: verifiedAt,
    referenceYear,
    sourceLabel,
    scope,
    evidence_sources: [...evidenceSources] as string[],
    source_urls: [...sourceUrls] as string[],
    message: "Despesas da Câmara: recorte consultado de 2009 a 2026; este candidato está fora desse período.",
  }
}

/** Recibo do único recorte executivo atualmente implementado no produto. */
export interface ExecutiveScopeReceipt {
  fonte: "gastos-executivo"
  resultado: SancoesVerificacao["resultado"]
  executado_em: string
  detalhe?: string | null
  escopo?: string | null
  evidence_sources?: string[]
  source_urls?: string[]
  url?: string | null
}

const EXECUTIVE_SCOPE_SOURCE_IDS = [
  "executive-collector-binding-lula-20101",
  "executive-cohort-identity-check",
] as const

function validExecutiveScopeReceipt(receipt: ExecutiveScopeReceipt | null | undefined): receipt is ExecutiveScopeReceipt {
  const sourceUrls = receipt?.source_urls ?? (receipt?.url ? [receipt.url] : [])
  return Boolean(
    receipt &&
      receipt.fonte === "gastos-executivo" &&
      receipt.resultado === "nao_aplicavel" &&
      typeof receipt.executado_em === "string" &&
      parseDate(receipt.executado_em) &&
      typeof receipt.detalhe === "string" &&
      receipt.detalhe.includes("Presidência da República") &&
      typeof receipt.escopo === "string" &&
      receipt.escopo.includes("01/2023") &&
      receipt.escopo.includes("coorte nominal") &&
      (receipt.evidence_sources ?? []).includes(EXECUTIVE_SCOPE_SOURCE_IDS[0]) &&
      (receipt.evidence_sources ?? []).includes(EXECUTIVE_SCOPE_SOURCE_IDS[1]) &&
      sourceUrls.length > 0 &&
      sourceUrls.every((rawUrl) => {
        try {
          const parsed = new URL(rawUrl)
          return parsed.protocol === "https:" &&
            !parsed.search &&
            (parsed.hostname === "api.portaldatransparencia.gov.br" || parsed.hostname === "portaldatransparencia.gov.br")
        } catch {
          return false
        }
      }),
  )
}

function resolveExecutiveSectionNotApplicable(
  receipt: ExecutiveScopeReceipt | null | undefined,
): SectionFreshnessInfo | null {
  if (!validExecutiveScopeReceipt(receipt)) return null
  const verifiedAt = receipt.executado_em
  const sourceUrls = [...new Set(receipt.source_urls ?? (receipt.url ? [receipt.url] : []))]
  return {
    key: "gastos_executivo",
    label: "Gastos da estrutura de governo",
    status: "not_applicable",
    verifiedAt,
    referenceDate: verifiedAt,
    referenceYear: new Date(verifiedAt).getUTCFullYear(),
    sourceLabel: "Portal da Transparência, CPGF Presidência da República",
    scope: receipt.escopo ?? null,
    evidence_sources: [...(receipt.evidence_sources ?? [])],
    source_urls: sourceUrls,
    message: "Esta seção cobre despesas com cartões de pagamento da Presidência da República desde janeiro de 2023. Este candidato está fora desse recorte.",
  }
}

const FEDERAL_SECTION_REQUIREMENTS: Readonly<Record<
  "projetos_lei" | "votos_candidato" | "gastos_parlamentares",
  readonly FederalAcervoSource[]
>> = Object.freeze({
  projetos_lei: ["camara", "senado"],
  votos_candidato: ["camara", "senado"],
  gastos_parlamentares: FEDERAL_ACERVO_SOURCES,
})

const FEDERAL_SOURCE_LABELS: Readonly<Record<FederalAcervoSource, string>> = Object.freeze({
  camara: "Câmara dos Deputados",
  senado: "Senado Federal",
  "ceaps-senado": "CEAPS",
  jarbas: "Jarbas",
})

function validFederalReceipt(
  source: FederalAcervoSource,
  receipt: FederalAcervoReceipt | null | undefined,
): receipt is FederalAcervoReceipt {
  const sourceIds = receipt?.source_ids ?? []
  const sourceUrls = receipt?.source_urls ?? []
  const registrySource = source === "camara" || source === "jarbas"
    ? "camara-parliamentarian-registry-all-legislatures"
    : "senado-parliamentarian-registry-all-legislatures"
  const scopeSource = source === "camara" || source === "jarbas"
    ? "camara-parliamentarian-registry-scope-control"
    : "senado-parliamentarian-registry-scope-control"
  return Boolean(
    receipt &&
      receipt.fonte === source &&
      receipt.resultado === "nao_aplicavel" &&
      typeof receipt.executado_em === "string" &&
      receipt.executado_em.trim() &&
      parseDate(receipt.executado_em) &&
      (!receipt.verificado_em || parseDate(receipt.verificado_em)) &&
      typeof receipt.detalhe === "string" &&
      receipt.detalhe.trim() &&
      typeof receipt.escopo === "string" &&
      receipt.escopo.trim() &&
      sourceIds.length > 0 &&
      new Set(sourceIds).size === sourceIds.length &&
      sourceIds.includes(registrySource) &&
      sourceIds.includes(scopeSource) &&
      sourceUrls.length === sourceIds.length &&
      sourceUrls.every((rawUrl) => {
        try {
          const parsed = new URL(rawUrl)
          const allowedHost = source === "camara" || source === "jarbas"
            ? parsed.hostname === "camara.leg.br" || parsed.hostname.endsWith(".camara.leg.br")
            : parsed.hostname === "senado.leg.br" || parsed.hostname.endsWith(".senado.leg.br")
          return parsed.protocol === "https:" && allowedHost
        } catch {
          return false
        }
      }),
  )
}

function receiptVerifiedAt(receipt: FederalAcervoReceipt): string {
  return receipt.verificado_em ?? receipt.executado_em
}

/**
 * Converte recibos completos em uma conclusão de seção. A função é deliberadamente
 * fechada: qualquer fonte ausente, estado diferente ou recibo sem escopo mantém
 * a seção como pendente. Dados positivos são tratados pelo chamador antes desta
 * conclusão e sempre têm precedência.
 */
function resolveFederalSectionNotApplicable(
  section: "projetos_lei" | "votos_candidato" | "gastos_parlamentares",
  receipts: FederalAcervoReceipts | null | undefined,
): SectionFreshnessInfo | null {
  const required = FEDERAL_SECTION_REQUIREMENTS[section]
  if (!required.every((source) => validFederalReceipt(source, receipts?.[source]))) return null

  const verified = required
    .map((source) => receipts![source]!)
    .sort((a, b) => Date.parse(receiptVerifiedAt(a)) - Date.parse(receiptVerifiedAt(b)))
  const verifiedAt = receiptVerifiedAt(verified[0])
  const scope = [...new Set(required.map((source) => receipts![source]!.escopo!.trim()))].join(" | ")
  const evidenceSources = required.map((source) => source)
  const sourceUrls = [...new Set(required.flatMap((source) => receipts![source]!.source_urls ?? []))]
  return {
    key: section,
    label:
      section === "projetos_lei"
        ? "Projetos de lei"
        : section === "votos_candidato"
          ? "Votações"
          : "Gastos parlamentares",
    status: "not_applicable",
    verifiedAt,
    referenceDate: verifiedAt,
    referenceYear: new Date(verifiedAt).getUTCFullYear(),
    sourceLabel: required.map((source) => FEDERAL_SOURCE_LABELS[source]).join("; "),
    scope,
    evidence_sources: evidenceSources,
    source_urls: sourceUrls,
    message: "Não se aplica: não há mandato federal parlamentar no recorte verificado.",
  }
}

/** Recibo agregado usado pela aba de destaques, sem criar registros de votos. */
export function resolveFederalVotacoesNotApplicable(
  receipts: FederalAcervoReceipts | null | undefined,
): SancoesVerificacao | null {
  const freshness = resolveFederalSectionNotApplicable("votos_candidato", receipts)
  if (!freshness || !freshness.verifiedAt) return null
  return {
    resultado: "nao_aplicavel",
    executado_em: freshness.verifiedAt,
    fonte: freshness.sourceLabel ?? "Câmara dos Deputados; Senado Federal",
    detalhe: freshness.message,
    escopo: freshness.scope,
    evidence_sources: freshness.evidence_sources,
    source_urls: freshness.source_urls,
    url: null,
  }
}
/**
 * Fase de curadoria. O DEFAULT E SEGURO: qualquer coisa que nao seja
 * explicitamente `hardening` conta como fase de lançamento, ou seja, o selo de
 * frescor diz a verdade sobre a idade do dado.
 *
 * Era o contrario ate 2026-08-03, e a variável nunca chegou a ser definida em
 * Production (conferido com `vercel env ls production`). Efeito: a negação em
 * `buildSectionFreshness` curto-circuitava e TODA ficha carimbava "Dado atual",
 * inclusive uma parada desde 14/04. Numa plataforma cívica cuja proposta e fonte
 * visivel, o default nunca pode ser o que mente.
 *
 * Para voltar ao modo de curadoria (selo sempre "current", sem checagem de
 * idade), defina PF_CURATION_PHASE=hardening de forma explicita.
 */
const IS_LAUNCH_PHASE = process.env.PF_CURATION_PHASE?.trim() !== "hardening"
/**
 * Janela de frescor do bloco `perfil_atual`, em dias.
 *
 * 75 e escolha medida, nao arbitraria (03/08/2026). Distribuição real das 194
 * fichas publicadas naquela data: 66 passariam de 30 dias, 61 de 45, e apenas 1
 * de 60. Os 65 do meio sao um lote único curado em 09/06, entao qualquer corte
 * entre 45 e 60 marcaria um terço do site de uma vez, e um corte de 60 os
 * marcaria todos cinco dias depois do lançamento.
 *
 * 75 dias marca so quem esta genuinamente velho hoje (`felicio-ramuth`, parado
 * desde 14/04) e da folga ate ~23/08 para recurar o lote de 09/06 sem pressa.
 * Quando a recuragem virar rotina, este valor deve BAIXAR de novo.
 *
 * Espelhado em scripts/lib/freshness-annotator.ts (CURATION_STALE_WINDOW_DAYS).
 * tests/freshness-window.test.ts falha se os dois divergirem.
 */
const PROFILE_FRESHNESS_WINDOW_DAYS = 75

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

function validSourceUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === "https:" ? value : null
  } catch {
    return null
  }
}

function uniqueSourceUrls(values: ReadonlyArray<string | null | undefined>): string[] {
  return [...new Set(values.map(validSourceUrl).filter((value): value is string => Boolean(value)))]
}

function seriesReferenceDate(values: ReadonlyArray<string | null | undefined>): string | null {
  const dated = values
    .map((value) => ({ raw: value, date: parseDate(value) }))
    .filter((item): item is { raw: string; date: Date } => Boolean(item.raw && item.date))
    .sort((a, b) => a.date.getTime() - b.date.getTime())
  return dated.at(-1)?.raw ?? null
}

function seriesScope(label: string, years: ReadonlyArray<number>): string {
  const uniqueYears = [...new Set(years)].sort((a, b) => b - a)
  return uniqueYears.length > 0
    ? `${label}; eleições representadas: ${uniqueYears.join(", ")}`
    : label
}

function buildPatrimonioSeriesFreshness(
  series: ReadonlyArray<PatrimonioEleicaoPublico> | null | undefined,
): SectionFreshnessInfo | null {
  if (!series || series.length === 0) return null

  const rowsWithAllContextsProven = series.filter((row) => {
    if (row.estado !== "vazio_confirmado") return false
    const contexts = row.contextos ?? []
    if (contexts.length > 0) {
      return contexts.every((context) =>
        context.estado === "vazio_confirmado" &&
        context.ano_eleicao === row.ano &&
        Boolean(validSourceUrl(context.fonte_url)) &&
        Boolean(parseDate(context.verificado_em)),
      )
    }
    return Boolean(validSourceUrl(row.fonte_url)) && Boolean(parseDate(row.verificado_em))
  })
  const evidence = rowsWithAllContextsProven.flatMap((row) => {
    const contexts = row.contextos ?? []
    return contexts.length > 0
      ? contexts.map((context) => ({
          ano: context.ano_eleicao,
          fonte_url: context.fonte_url,
          verificado_em: context.verificado_em,
        }))
      : [{ ano: row.ano, fonte_url: row.fonte_url, verificado_em: row.verificado_em }]
  })
  const hasUncollected = series.some((row) => row.estado === "nao_coletado")
  const hasUnprovenEmpty = series.some((row) =>
    row.estado === "vazio_confirmado" && !rowsWithAllContextsProven.includes(row),
  )
  if (evidence.length === 0) return null

  const verifiedAt = seriesReferenceDate(evidence.map((row) => row.verificado_em))
  const sourceUrls = uniqueSourceUrls(evidence.map((row) => row.fonte_url))
  if (!verifiedAt || sourceUrls.length === 0) return null
  const years = [...new Set(evidence.map((row) => row.ano))]
  const uncollectedYears = series.filter((row) => row.estado === "nao_coletado").map((row) => row.ano)
  const suffix = uncollectedYears.length > 0
    ? ` Há ${uncollectedYears.length} eleição(ões) da série ainda não coletada(s): ${uncollectedYears.sort((a, b) => b - a).join(", ")}.`
    : ""
  return {
    key: "patrimonio",
    label: "Patrimônio",
    status: hasUncollected || hasUnprovenEmpty ? "stale" : "historical",
    verifiedAt,
    referenceDate: verifiedAt,
    referenceYear: Math.max(...years),
    sourceLabel: "TSE",
    scope: seriesScope("Série de patrimônio por eleição no arquivo oficial consultado", years),
    source_urls: sourceUrls,
    message: `Nenhum registro de bens nos arquivos consultados para ${years.sort((a, b) => b - a).join(", ")}.${suffix}${hasUnprovenEmpty ? " Há contexto patrimonial vazio sem prova completa." : ""}`,
  }
}

function buildFinanciamentoSeriesFreshness(
  series: ReadonlyArray<FinanciamentoEleicaoPublico> | null | undefined,
): SectionFreshnessInfo | null {
  if (!series || series.length === 0) return null
  const verifiable = series.filter((row) =>
    row.estado !== "nao_coletado" &&
    row.estado !== "pleito_futuro" &&
    Boolean(validSourceUrl(row.fonte_url)) &&
    Boolean(parseDate(row.verificado_em)),
  )
  if (verifiable.length === 0) return null
  const hasError = verifiable.some((row) => row.estado === "erro")
  const verifiedAt = seriesReferenceDate(verifiable.map((row) => row.verificado_em))
  const sourceUrls = uniqueSourceUrls(verifiable.map((row) => row.fonte_url))
  if (!verifiedAt || sourceUrls.length === 0) return null
  const years = [...new Set(verifiable.map((row) => row.ano))]
  const consultedYears = [...new Set(verifiable
    .filter((row) => row.estado !== "fora_da_serie_oficial")
    .map((row) => row.ano))]
  const outsideSeriesYears = [...new Set(verifiable
    .filter((row) => row.estado === "fora_da_serie_oficial")
    .map((row) => row.ano))]
  const absenceYears = verifiable
    .filter((row) => row.estado === "ausencia_oficial")
    .map((row) => row.ano)
  const zeroYears = verifiable
    .filter((row) => row.estado === "zero_declarado")
    .map((row) => row.ano)
  const uncollectedYears = series.filter((row) => row.estado === "nao_coletado").map((row) => row.ano)
  const suffix = uncollectedYears.length > 0
    ? ` Há ${uncollectedYears.length} eleição(ões) da série ainda não coletada(s): ${uncollectedYears.sort((a, b) => b - a).join(", ")}.`
    : ""
  const absenceMessage = absenceYears.length > 0
    ? ` Ausência de receita confirmada no arquivo para: ${[...new Set(absenceYears)].sort((a, b) => b - a).join(", ")}.`
    : ""
  const zeroMessage = zeroYears.length > 0
    ? ` Zero declarado na prestação consultada para: ${[...new Set(zeroYears)].sort((a, b) => b - a).join(", ")}.`
    : ""
  const consultedMessage = consultedYears.length > 0
    ? `Série de financiamento consultada no arquivo oficial para ${consultedYears.sort((a, b) => b - a).join(", ")}.`
    : `A série digital de prestação de contas do TSE consultada começa em ${FINANCIAMENTO_ANO_INICIAL_DA_SERIE_TSE}.`
  const outsideSeriesMessage = outsideSeriesYears.length > 0
    ? ` Anos eleitorais anteriores ao início dessa série digital: ${outsideSeriesYears.sort((a, b) => b - a).join(", ")}. Isso não comprova inexistência de documentos em outros acervos oficiais.`
    : ""
  const scope = consultedYears.length > 0
    ? seriesScope("Série de financiamento por eleição no arquivo oficial consultado", consultedYears)
    : `Série digital de financiamento do TSE; início do recorte consultado: ${FINANCIAMENTO_ANO_INICIAL_DA_SERIE_TSE}`
  const outsideSeriesScope = outsideSeriesYears.length > 0
    ? `; eleições anteriores ao recorte da série digital: ${outsideSeriesYears.sort((a, b) => b - a).join(", ")}; sem conclusão sobre outros acervos oficiais`
    : ""
  return {
    key: "financiamento",
    label: "Financiamento",
    status: hasError ? "stale" : "historical",
    verifiedAt,
    referenceDate: verifiedAt,
    referenceYear: Math.max(...years),
    sourceLabel: "TSE",
    scope: `${scope}${outsideSeriesScope}`,
    source_urls: sourceUrls,
    message: `${consultedMessage}${outsideSeriesMessage}${absenceMessage}${zeroMessage}${suffix}${hasError ? " Há tentativa com erro que exige revisão." : ""}`,
  }
}

function filiacaoAttemptFreshness(
  key: "filiacao" | "mudancas_partido",
  verification: SancoesVerificacao | null | undefined,
): SectionFreshnessInfo | null {
  if (!verification) return null
  const rawDate = typeof verification.executado_em === "string" ? verification.executado_em : null
  const verifiedAt = parseDate(rawDate) ? rawDate : null
  const sourceUrls = uniqueSourceUrls([...(verification.source_urls ?? []), verification.url])
  const detailBase = sanitizeFiliacaoDetail(verification.detalhe) || "Consulta FILIA registrada, mas o resultado permanece indeterminado."
  const scope = verification.escopo?.trim() || null
  const individualNotCompleted = /consulta individual\s+(?:não|nao)\s+(?:conclu[ií]da|executada|executável|executavel)|individual_query_executed\s*[:=]\s*false/i.test(`${detailBase} ${scope ?? ""}`)
  const detail = verification.resultado === "indeterminado" && !individualNotCompleted && !/inconclusiv/i.test(detailBase)
    ? /Resultado indeterminado\.\s*$/i.test(detailBase)
      ? `${detailBase.replace(/\s*Resultado indeterminado\.\s*$/i, "").trim()} Resultado indeterminado e inconclusivo no escopo consultado.`
      : `${detailBase} Resultado inconclusivo no escopo consultado.`
    : detailBase
  const unresolved = individualNotCompleted || verification.resultado === "indeterminado" || verification.resultado === "erro"
  const hasGoogleNewsSource = sourceUrls.some((sourceUrl) => {
    try {
      const parsed = new URL(sourceUrl)
      return parsed.protocol === "https:" && (parsed.hostname === "news.google.com" || parsed.hostname.endsWith(".news.google.com"))
    } catch {
      return false
    }
  })
  return {
    key,
    label: key === "filiacao" ? "Filiação partidária" : "Histórico partidário",
    status: individualNotCompleted || !verifiedAt || sourceUrls.length === 0
      ? "missing"
      : unresolved
        ? "stale"
        : "historical",
    verifiedAt,
    referenceDate: verifiedAt,
    referenceYear: verifiedAt ? new Date(verifiedAt).getUTCFullYear() : null,
    sourceLabel: hasGoogleNewsSource ? "Google Notícias" : "TSE / FILIA",
    scope,
    source_urls: sourceUrls,
    message: detail,
  }
}

function federalSectionAttemptFreshness(
  key: "projetos_lei" | "votos_candidato" | "gastos_parlamentares",
  verification: SancoesVerificacao | null | undefined,
): SectionFreshnessInfo | null {
  if (!verification || verification.resultado === "nao_aplicavel") return null
  const verifiedAt = typeof verification.executado_em === "string" && parseDate(verification.executado_em)
    ? verification.executado_em
    : null
  const detail = verification.detalhe?.trim() ?? ""
  const sourceUrls = uniqueSourceUrls([...(verification.source_urls ?? []), verification.url])
  if (!verifiedAt || !detail || sourceUrls.length === 0) return null
  const labels = {
    projetos_lei: "Projetos de lei",
    votos_candidato: "Votações",
    gastos_parlamentares: "Gastos parlamentares",
  } as const
  const unresolved = verification.resultado === "indeterminado" ||
    verification.resultado === "erro" ||
    verification.resultado === "sem_achado_no_escopo"
  return {
    key,
    label: labels[key],
    status: unresolved ? "stale" : "historical",
    verifiedAt,
    referenceDate: verifiedAt,
    referenceYear: new Date(verifiedAt).getUTCFullYear(),
    sourceLabel: verification.fonte ?? "Acervo legislativo oficial",
    scope: verification.escopo ?? null,
    evidence_sources: verification.evidence_sources,
    source_urls: sourceUrls,
    message: detail,
  }
}

function rotuloFreshnessProjetos(data: {
  projetos: ProjetoLei[]
  projetosTotal?: number
  projetosNaturezaProjetosTotal?: number | null
}): string {
  const total = data.projetosTotal ?? data.projetos.length
  if (typeof data.projetosNaturezaProjetosTotal === "number") {
    return data.projetosNaturezaProjetosTotal >= total
      ? "Projetos de lei"
      : "Proposições de autoria"
  }
  return data.projetos.length >= total
    ? rotuloDoAcervo(data.projetos.map((item) => item.tipo))
    : "Proposições de autoria"
}

export function buildSectionFreshness(
  candidato: Candidato,
  data: {
    historico: HistoricoPolitico[]
    mudancas: MudancaPartido[]
    patrimonio: Patrimonio[]
    financiamento: Financiamento[]
    /** Série pública por eleição, já composta com estado e prova do TSE. */
    patrimonioEleicoes?: ReadonlyArray<PatrimonioEleicaoPublico> | null
    financiamentoEleicoes?: ReadonlyArray<FinanciamentoEleicaoPublico> | null
    votos: VotoCandidato[]
    projetos: ProjetoLei[]
    /** Total real do acervo; `projetos` pode ser só a prévia de 25. */
    projetosTotal?: number
    /** Quantas do acervo INTEIRO são projeto de lei (head-count por sigla). */
    projetosNaturezaProjetosTotal?: number | null
    gastos: GastoParlamentar[]
    gastosExecutivo: GastoExecutivo[]
    historicoEmRevisao?: boolean
    timelinePartidariaIncompleta?: boolean
    /**
     * Ultima consulta aos cadastros de sancoes e a curadoria de processos.
     * Entram aqui porque o bloco "Perfil atual" passou a responder "quando
     * qualquer dado deste perfil foi verificado pela ultima vez", e estas sao
     * verificações reais que a ficha ja exibe em outras seções. Antes de
     * 09/08/2026 elas eram ignoradas pelo selo, que por isso anunciava junho em
     * ficha com verificacao de agosto na mesma pagina.
     */
    sancoesVerificacao?: SancoesVerificacao | null
    filiacaoVerificacao?: SancoesVerificacao | null
    processosVerificacao?: SancoesVerificacao | null
    projetosVerificacao?: SancoesVerificacao | null
    votacoesVerificacao?: SancoesVerificacao | null
    gastosParlamentaresVerificacao?: SancoesVerificacao | null
    federalAcervoReceipts?: FederalAcervoReceipts | null
    gastosParlamentaresAplicabilidade?: unknown
    gastosExecutivoVerificacao?: ExecutiveScopeReceipt | null
  }
): Partial<Record<SectionFreshnessKey, SectionFreshnessInfo>> {
  const fieldVerification = candidato.verificacao_campos ?? {}
  /**
   * Contrato em `@/lib/verificacao-campos`. O agregado so avança com as TRES
   * frentes TSE resolvidas, e avança pela data MAIS ANTIGA entre elas.
   *
   * Antes de 09/08/2026 isto ordenava quatro chaves por data e pegava a mais
   * recente, entao verificacao PARCIAL promovia o perfil inteiro, e o agregado
   * curado competia com as frentes em vez de ser o fallback. Resolução parcial
   * agora nao produz data TSE nenhuma: cai para o curado, que e a ultima
   * verificacao que de fato cobre a ficha toda.
   */
  const tseVerification = resolverFrescorTsePerfil(fieldVerification)
  const curatedValue = fieldVerification[CHAVE_AGREGADO_CURADO]
  const curatedRaw =
    typeof curatedValue === "string" ? curatedValue : candidato.ultima_atualizacao ?? null
  const curatedDate = parseDate(curatedRaw)

  /**
   * A pergunta que o bloco responde: quando qualquer dado deste perfil foi
   * verificado pela ultima vez? Vence a candidata mais recente, e a fonte e
   * nomeada, para que o selo nunca prometa mais do que foi verificado. A ordem
   * declarada abaixo so desempata datas iguais, e privilegia a fonte que cobre
   * mais campos do perfil.
   *
   * `exibicao` carrega o valor BRUTO, e `instante` a comparacao. A exibição nao
   * pode passar por `Date` quando o gravado e data pura: "2026-08-09" ancora em
   * meia-noite UTC e o formatador `America/Sao_Paulo` recuaria para
   * "08/08/2026", medido em produção em 09/08/2026. `formatDate` ja trata
   * string data-pura como data de calendário e timestamp com fuso como
   * instante, que e a semântica de cada forma gravada.
   */
  const ultimaVerificacao = resolverUltimaVerificacaoDoPerfil([
    tseVerification.tipo === "completa"
      ? {
          instante: tseVerification.verificadoEm.instante,
          exibicao: tseVerification.verificadoEm.bruto,
          fonte: ROTULO_FONTE_TSE[tseVerification.chaveMaisAntiga],
          ordem: 0,
        }
      : null,
    curatedRaw && curatedDate
      ? {
          instante: curatedDate.getTime(),
          exibicao: curatedRaw,
          fonte: "Perfil factual curado",
          ordem: 1,
        }
      : null,
    candidataDeColeta(data.sancoesVerificacao, "Sanções: CEIS, CNEP e CEAF", 2),
    candidataDeColeta(data.processosVerificacao, "Curadoria de processos", 3),
  ])
  const profileVerification = ultimaVerificacao
    ? {
        raw: ultimaVerificacao.exibicao,
        date: new Date(ultimaVerificacao.instante),
        source: ultimaVerificacao.fonte,
      }
    : null
  const latestHistoricoYear =
    data.historico.length > 0
      ? Math.max(
          ...data.historico.map((item) =>
            item.periodo_fim ?? item.periodo_inicio ?? 0
          )
        )
      : null
  const latestHistoricoRows =
    latestHistoricoYear != null
      ? data.historico.filter(
          (item) =>
            (item.periodo_fim ?? item.periodo_inicio ?? 0) ===
            latestHistoricoYear
        )
      : []
  const latestHistoricoOnlyCandidaturas =
    latestHistoricoRows.length > 0 &&
    latestHistoricoRows.every((item) => isHistoricoCandidaturaRow(item))
  const historicoFreshnessMessage =
    latestHistoricoYear != null
      ? latestHistoricoOnlyCandidaturas
        ? `Última candidatura estruturada em ${latestHistoricoYear}.`
        : `Último cargo estruturado até ${latestHistoricoYear}.`
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
  const latestGastoExecutivo = [...data.gastosExecutivo]
    .sort((a, b) => b.mes_extrato.localeCompare(a.mes_extrato))[0] ?? null
  const latestGastoExecutivoColeta = [...data.gastosExecutivo]
    .filter((item) => parseDate(item.coletado_em))
    .sort((a, b) => b.coletado_em.localeCompare(a.coletado_em))[0] ?? null
  const latestGastoExecutivoColetaDate = parseDate(latestGastoExecutivoColeta?.coletado_em)
  const latestVoteDateString = [...data.votos]
    .map((item) => item.votacao?.data_votacao ?? null)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null
  const latestVoteDate = parseDate(latestVoteDateString)
  const federalProjectsNotApplicable = resolveFederalSectionNotApplicable(
    "projetos_lei",
    data.federalAcervoReceipts,
  )
  const federalVotesNotApplicable = resolveFederalSectionNotApplicable(
    "votos_candidato",
    data.federalAcervoReceipts,
  )
  const federalExpensesNotApplicable = resolveFederalSectionNotApplicable(
    "gastos_parlamentares",
    data.federalAcervoReceipts,
  )
  const federalExpensesTemporalNotApplicable = resolveFederalExpenseTemporalNotApplicable(
    data.gastosParlamentaresAplicabilidade,
  )
  const patrimonioSeriesFreshness = buildPatrimonioSeriesFreshness(data.patrimonioEleicoes)
  const financiamentoSeriesFreshness = buildFinanciamentoSeriesFreshness(data.financiamentoEleicoes)
  const filiacaoVerificationFreshness = filiacaoAttemptFreshness("filiacao", data.filiacaoVerificacao)
  const mudancasFromFiliacaoFreshness = filiacaoAttemptFreshness("mudancas_partido", data.filiacaoVerificacao)
  const projetosAttemptFreshness = federalSectionAttemptFreshness("projetos_lei", data.projetosVerificacao)
  const votacoesAttemptFreshness = federalSectionAttemptFreshness("votos_candidato", data.votacoesVerificacao)
  const gastosParlamentaresAttemptFreshness = federalSectionAttemptFreshness("gastos_parlamentares", data.gastosParlamentaresVerificacao)

  return {
    perfil_atual: profileVerification
      ? buildFreshnessInfo(
          "perfil_atual",
          "Perfil atual",
          !IS_LAUNCH_PHASE || ageInDays(profileVerification.date) <= PROFILE_FRESHNESS_WINDOW_DAYS ? "current" : "stale",
          !IS_LAUNCH_PHASE || ageInDays(profileVerification.date) <= PROFILE_FRESHNESS_WINDOW_DAYS
            ? `Dados do perfil verificados pela última vez em ${formatDate(profileVerification.raw)} (${profileVerification.source}).`
            : `Dados do perfil verificados pela última vez em ${formatDate(profileVerification.raw)} (${profileVerification.source}). Pode não refletir mudanças recentes.`,
          profileVerification.date.toISOString(),
          profileVerification.date.getUTCFullYear(),
          profileVerification.date.toISOString(),
          profileVerification.source
        )
      : buildFreshnessInfo(
          "perfil_atual",
          "Perfil atual",
          "missing",
          "Sem data confiável de atualização do perfil atual."
        ),
    filiacao: filiacaoVerificationFreshness ?? buildFreshnessInfo(
        "filiacao",
        "Filiação partidária",
        "missing",
        "Filiação partidária ainda não consultada.",
      ),
    historico_politico:
      latestHistoricoYear != null
        ? buildFreshnessInfo(
            "historico_politico",
            "Trajetória política",
            data.historicoEmRevisao ? "stale" : "historical",
            data.historicoEmRevisao
              ? `${historicoFreshnessMessage} A trajetória ainda está em revisão factual.`
              : (historicoFreshnessMessage ?? "Trajetória política estruturada."),
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
        : mudancasFromFiliacaoFreshness ?? buildFreshnessInfo(
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
        : patrimonioSeriesFreshness ?? buildFreshnessInfo(
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
        : financiamentoSeriesFreshness ?? buildFreshnessInfo(
            "financiamento",
            "Financiamento",
            "missing",
            "Sem financiamento estruturado."
          ),
    projetos_lei:
      data.projetos.length > 0
        ? buildFreshnessInfo(
            "projetos_lei",
            // Acervo misto não pode se anunciar como projeto de lei (issue
            // #138), e o rótulo tem que vir do acervo INTEIRO, nunca da prévia
            // de 25 (rodada 2 da vistoria). Sem o head-count, só confiamos na
            // prévia quando ela é o acervo todo; senão, rótulo neutro.
            rotuloFreshnessProjetos(data),
            "historical",
            latestProjetoYear != null
              ? `Proposição mais recente disponível: ${latestProjetoYear}.`
              : "Há proposições estruturadas no acervo.",
            null,
            latestProjetoYear,
            null,
            "API legislativa"
          )
        : federalProjectsNotApplicable ?? projetosAttemptFreshness ?? buildFreshnessInfo(
            "projetos_lei",
            "Projetos de lei",
            "missing",
            "Sem projetos de lei estruturados."
          ),
    votos_candidato:
      data.votos.length > 0
        ? buildFreshnessInfo(
            "votos_candidato",
            "Votações",
            "historical",
            // `votacoes_chave.data_votacao` é coluna DATE. Exibir a string crua
            // mantém este selo igual ao que a lista de votos já renderiza; passar
            // pelo Date recuaria o dia em America/Sao_Paulo.
            latestVoteDate && latestVoteDateString
              ? `Votação mais recente registrada em ${formatDate(latestVoteDateString)}.`
              : "Há votações estruturadas no acervo.",
            latestVoteDate?.toISOString() ?? null,
            latestVoteDate?.getUTCFullYear() ?? null,
            null,
            "API legislativa"
          )
        : federalVotesNotApplicable ?? votacoesAttemptFreshness ?? buildFreshnessInfo(
            "votos_candidato",
            "Votações",
            "missing",
            "Sem histórico estruturado de votações."
          ),
    gastos_parlamentares:
      data.gastos.length > 0
        ? buildFreshnessInfo(
            "gastos_parlamentares",
            "Gastos parlamentares",
            "historical",
            latestGastoYear != null
              ? `Dados disponíveis até ${latestGastoYear}.`
              : "Há gastos parlamentares estruturados no acervo.",
            null,
            latestGastoYear,
            null,
            "Gastos parlamentares"
          )
        : federalExpensesTemporalNotApplicable ?? federalExpensesNotApplicable ?? gastosParlamentaresAttemptFreshness ?? buildFreshnessInfo(
          "gastos_parlamentares",
          "Gastos parlamentares",
          "missing",
          "Sem gastos parlamentares estruturados."
        ),
    gastos_executivo:
      latestGastoExecutivo && latestGastoExecutivoColeta && latestGastoExecutivoColetaDate
        ? buildFreshnessInfo(
            "gastos_executivo",
            "Gastos da estrutura de governo",
            ageInDays(latestGastoExecutivoColetaDate) <= PROFILE_FRESHNESS_WINDOW_DAYS
              ? "current"
              : "stale",
            `Totais mensais coletados no Portal da Transparência em ${formatDate(latestGastoExecutivoColeta.coletado_em)}.`,
            latestGastoExecutivo.mes_extrato,
            Number(latestGastoExecutivo.mes_extrato.slice(0, 4)),
            latestGastoExecutivoColeta.coletado_em,
            "Portal da Transparência",
          )
        : resolveExecutiveSectionNotApplicable(data.gastosExecutivoVerificacao) ?? buildFreshnessInfo(
          "gastos_executivo",
          "Gastos da estrutura de governo",
          "missing",
          "Sem totais institucionais estruturados.",
        ),
  }
}

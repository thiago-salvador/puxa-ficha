// cspell:words variacao partidario camara ceap ceaps filiacao
import type { CandidatoComparavel, FichaCandidato } from "@/lib/types"
import { COMPARADOR_NAO_SE_APLICA, maiorEntreValoresReais } from "@/lib/comparador-display"
import { type ComparadorEixo } from "@/lib/comparador-axis"
import { mergeComparadorQueryString } from "@/lib/comparador-query"
import { formatFinanciamentoPleitoPublicLabelForRow } from "@/lib/financiamento-pleito-public-label"
import { formatCargoDisputadoPublicLabel, formatFinancingLabel, formatPublicLabel, formatVoteBadgeLabel, formatVoteNote } from "@/lib/ui-labels"
import { formatVotoCasaQuando } from "@/lib/vote-badge"
import { prepareHistoricoPoliticoPublicDisplayList } from "@/lib/trajetoria-public-display"
import { countPartySwitches, formatPartyTransitionLabel, hasSameYearPartyReversal, partySwitchCountVerified } from "@/lib/party-switches"
import * as historicoDisplay from "@/lib/historico-display"
import {
  estadoValorPatrimonio,
  patrimonioMaisRecenteSemEscolhaArbitraria,
  patrimonioPorAnoSemAmbiguidade,
  patrimonioTemValorComparavel,
  patrimonioValorEstadoLabel,
  variacaoPatrimonialDaFicha,
} from "@/lib/patrimonio-contexto"
import { formatBRL, formatCompact, formatDate } from "@/lib/utils"
import { FINANCIAMENTO_SERIE_TSE_FONTE_URL } from "@/lib/financiamento-eleicoes"
import { buildFinancingComposition } from "@/lib/financiamento-display"
import { formatPartyPublicLabel, isUncertainParty } from "@/lib/party-utils"
import { patrimonioWithoutValueLabel, PUBLIC_DATA_VOCABULARY } from "@/lib/public-data-vocabulary"
import { alertaEvolucaoPatrimonialVs2026, fonteDadosAbertosPatrimonioTse, type PatrimonioAnoValor } from "@/lib/evolucao-patrimonial"
import { patrimonioDeclaradoAtipico, PATRIMONIO_ATIPICO_ROTULO } from "@/lib/patrimonio-atipico"
import { buildVotacaoNominalUrl } from "@/lib/quiz-votacao-url"
import { IMPRENSA_METHOD_SOURCES } from "@/lib/imprensa-frescor"

export const BOX_CARD_KINDS = [
  "patrimonio-resumo",
  "evolucao-patrimonial-resumo",
  "financiamento-resumo",
  "despesas-campanha",
  "cota-resumo",
  "votacoes-resumo",
  "cargos-mandatos",
  "historico-partidario",
  "comparador",
] as const

export type BoxCardKind = (typeof BOX_CARD_KINDS)[number]

export interface BoxCardSubject {
  name: string
  /** Partido, cargo e UF, na ordem em que aparecem na ficha. */
  meta: string
  /** Foto como a ficha a entrega (caminho de public/ ou URL remota); o card a lê no servidor. */
  photoUrl: string | null
}

/**
 * Versão do desenho do card. Entra no hash da revisão, que vai na URL do card:
 * mudar o layout muda a URL e o CDN não serve a versão antiga por 24 h.
 */
const BOX_CARD_LAYOUT_VERSION = 2

export interface BoxCardModel {
  kind: BoxCardKind
  title: string
  key: string
  identity: string
  /** Quem é o assunto do card: um candidato, ou os candidatos do comparador. Fica fora da revisão. */
  subjects?: BoxCardSubject[]
  /** Avisos informativos de atualização da seção (não são alerta). Já contados na revisão via `warnings`. */
  notes?: string[]
  rows: Array<{ label: string; value: string; detail?: string }>
  warnings: string[]
  sources: Array<{ label: string; url: string; collectedAt: string | null }>
  deepLink: string
  revision: string
}

export interface ComparatorBoxCardContext {
  uf?: string
  cargo?: string
  axis?: "patrimonio" | "gastos"
  slugs?: readonly string[]
}

const TITLES: Record<BoxCardKind, string> = {
  "patrimonio-resumo": "Patrimônio",
  "evolucao-patrimonial-resumo": "Evolução patrimonial",
  "financiamento-resumo": "Financiamento de campanha",
  "despesas-campanha": "Gastos declarados pela campanha",
  "cota-resumo": "Gastos CEAP",
  "votacoes-resumo": "Votações-chave",
  "cargos-mandatos": "Cargos e mandatos",
  "historico-partidario": "Histórico partidário",
  comparador: "Comparador",
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

function model(
  kind: BoxCardKind,
  key: string,
  identity: string,
  deepLink: string,
  rows: BoxCardModel["rows"],
  warnings: string[] = [],
  sources: BoxCardModel["sources"] = [],
  title = TITLES[kind],
  subjects: BoxCardSubject[] = [],
): BoxCardModel {
  const projected = { kind, title, key, identity, rows, warnings, sources, deepLink }
  return { ...projected, subjects, revision: fnv1a(JSON.stringify({ layout: BOX_CARD_LAYOUT_VERSION, ...projected })) }
}

function candidateSource(label: string, url: string | null | undefined, collectedAt: string | null = null) {
  return url ? [{ label, url, collectedAt }] : []
}

function freshnessSources(ficha: FichaCandidato, ...keys: Array<keyof NonNullable<FichaCandidato["section_freshness"]>>) {
  const sources: BoxCardModel["sources"] = []
  for (const key of keys) {
    const info = ficha.section_freshness?.[key]
    for (const url of info?.source_urls ?? []) {
      if (typeof url === "string" && url.trim()) sources.push({ label: info?.sourceLabel || info?.label || String(key), url, collectedAt: null })
    }
  }
  return [...new Map(sources.map((source) => [source.url, source])).values()]
}

function freshnessWarning(ficha: FichaCandidato, ...keys: Array<keyof NonNullable<FichaCandidato["section_freshness"]>>) {
  return [...new Set(keys.map((key) => ficha.section_freshness?.[key]?.message).filter((message): message is string => Boolean(message)))]
}

function candidateIdentity(ficha: FichaCandidato): string {
  const party = formatPartyPublicLabel(ficha.partido_sigla)
  const cargo = formatCargoDisputadoPublicLabel(ficha.cargo_disputado)
  return [ficha.nome_urna, party, cargo, ficha.estado].filter((value): value is string => typeof value === "string" && value.trim().length > 0).join(" · ")
}

function subjectMeta(partido: string | null | undefined, cargo: string | null | undefined, estado: string | null | undefined): string {
  return [formatPartyPublicLabel(partido ?? ""), formatCargoDisputadoPublicLabel(cargo ?? ""), estado]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" · ")
}

function candidateSubject(ficha: FichaCandidato): BoxCardSubject {
  return {
    name: ficha.nome_urna,
    meta: subjectMeta(ficha.partido_sigla, ficha.cargo_disputado, ficha.estado),
    photoUrl: typeof ficha.foto_url === "string" && ficha.foto_url.trim() ? ficha.foto_url : null,
  }
}

/** Fonte do patrimônio: URL da própria declaração, ou o conjunto de dados abertos do TSE do ano mais recente. */
function patrimonySources(ficha: FichaCandidato): BoxCardModel["sources"] {
  const source = ficha.patrimonio_eleicoes?.find((item) => item.fonte_url)
  if (source?.fonte_url) return candidateSource("Dados abertos de candidaturas do TSE", source.fonte_url, null)
  const years = safeArray(ficha.patrimonio).map((item) => item.ano_eleicao).filter((year) => Number.isFinite(year))
  return years.length ? [{ label: "Dados abertos de candidaturas do TSE", url: fonteDadosAbertosPatrimonioTse(Math.max(...years)), collectedAt: null }] : []
}

function candidateDeepLink(kind: BoxCardKind, ficha: FichaCandidato): string {
  const base = `/candidato/${encodeURIComponent(ficha.slug)}`
  if (kind === "despesas-campanha") return `${base}?tab=dinheiro#box-despesas-campanha`
  if (kind === "cargos-mandatos" || kind === "historico-partidario") return `${base}?tab=trajetoria#box-${kind}`
  return `${base}?tab=geral#box-${kind}`
}

function safeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : []
}

function patrimonyRows(ficha: FichaCandidato) {
  if (safeArray(ficha.patrimonio).length === 0 && safeArray(ficha.patrimonio_eleicoes).length === 0) return null
  const context = patrimonioMaisRecenteSemEscolhaArbitraria(safeArray(ficha.patrimonio))
  const latest = context.patrimonio
  if (latest && !Number.isFinite(latest.valor_total)) return null
  if (latest) {
    const estado = estadoValorPatrimonio(latest)
    const value = estado === "valor_nao_informado" ? patrimonioValorEstadoLabel(estado) ?? "Valor não informado" : formatCompact(latest.valor_total)
    const status = patrimonioValorEstadoLabel(estado)
    const variation = variacaoPatrimonialDaFicha(safeArray(ficha.patrimonio))
    return [{
      label: `Declarado em ${latest.ano_eleicao}`,
      value,
      detail: status ?? (variation ? `${variation.pct > 0 ? "↑ " : variation.pct < 0 ? "↓ " : ""}${Math.abs(variation.pct)}% entre ${variation.anterior.ano_eleicao} e ${variation.atual.ano_eleicao}` : undefined),
    }]
  }
  if (context.quantidade > 1) return [{ label: "Patrimônio", value: `${context.quantidade} declarações` }]
  const emptyLabel = safeArray(ficha.patrimonio_eleicoes).length ? patrimonioWithoutValueLabel(safeArray(ficha.patrimonio_eleicoes)) : null
  return emptyLabel ? [{ label: "Patrimônio", value: emptyLabel }] : null
}

function evolutionRows(ficha: FichaCandidato) {
  const rows = patrimonioPorAnoSemAmbiguidade(safeArray(ficha.patrimonio))
  const comparable = rows.filter((row) => patrimonioTemValorComparavel(row))
  if (comparable.length < 2) return null
  const variation = variacaoPatrimonialDaFicha(rows)
  if (!variation) return null
  // Mais recente primeiro: se o card não couber tudo, o que fica de fora são os anos antigos.
  const projected: BoxCardModel["rows"] = [...comparable]
    .sort((a, b) => b.ano_eleicao - a.ano_eleicao)
    .map((row) => ({
      label: String(row.ano_eleicao),
      value: formatCompact(row.valor_total),
    }))
  projected[0].detail = `${variation.pct > 0 ? "↑ " : variation.pct < 0 ? "↓ " : ""}${Math.abs(variation.pct)}% entre ${variation.anterior.ano_eleicao} e ${variation.atual.ano_eleicao}`
  const series: PatrimonioAnoValor[] = comparable.map((row) => ({
    ano_eleicao: row.ano_eleicao,
    valor_total: row.valor_total,
    bens: row.bens,
  }))
  const atypical = patrimonioDeclaradoAtipico(series)
  const alert = atypical ? null : alertaEvolucaoPatrimonialVs2026(series)
  const warnings = atypical
    ? [`${PATRIMONIO_ATIPICO_ROTULO.charAt(0).toUpperCase()}${PATRIMONIO_ATIPICO_ROTULO.slice(1)}. O total oficial segue exibido como publicado; o aviso não indica erro nem causa.`]
    : alert
      ? [`Aumento patrimonial expressivo: o patrimônio declarado aumentou ${formatBRL(alert.aumento)} entre ${alert.anoAnterior} e ${alert.anoAlvo}. O sinal mostra apenas a variação dos valores declarados ao TSE e não determina sua causa.`]
      : []
  return { rows: projected, warnings }
}

function financingRows(ficha: FichaCandidato) {
  const sorted = [...safeArray(ficha.financiamento)]
    .filter((item) => Number.isFinite(item.ano_eleicao))
    .sort((a, b) => b.ano_eleicao - a.ano_eleicao)
  const latest = sorted[0]
  if (!latest) return null
  const zero = latest.total_arrecadado === 0 && safeArray(latest.maiores_doadores).length === 0
  const composition = buildFinancingComposition(latest)
  const warnings = composition.chartIsSafe
    ? []
    : ["As categorias disponíveis somam mais que o total registrado. O gráfico fica oculto até a reconciliação com a prestação oficial."]
  return {
    rows: [{
      label: formatFinanciamentoPleitoPublicLabelForRow(latest, safeArray(ficha.historico)),
      value: formatCompact(latest.total_arrecadado),
      detail: zero ? `Sem receitas declaradas na prestação de contas (TSE ${latest.ano_eleicao})` : composition.chartIsSafe
        ? composition.segments.filter((item) => item.value > 0).map((item) => `${formatFinancingLabel(item.key)}: ${formatCompact(item.value)}`).join(" · ")
        : undefined,
    }],
    warnings,
  }
}

function expenseRows(ficha: FichaCandidato): { rows: BoxCardModel["rows"]; warnings: string[]; sources: BoxCardModel["sources"] } | null {
  const rows = ficha.financiamento_despesas_status === "ok" && Array.isArray(ficha.financiamento_despesas)
    ? ficha.financiamento_despesas
      .filter((row) => row.estado_coleta !== "falha_coleta" && row.ano_eleicao >= 2018)
      .sort((a, b) => b.ano_eleicao - a.ano_eleicao || (a.cargo_candidatura ?? "").localeCompare(b.cargo_candidatura ?? ""))
    : []
  if (rows.length === 0) return null
  const warnings: string[] = []
  const sources: BoxCardModel["sources"] = []
  const projected = rows.flatMap((row) => {
    const titleParts = [row.cargo_candidatura, row.uf].filter(Boolean)
    const suffix = titleParts.length ? ` (${titleParts.join(", ")})` : ""
    const date = formatDate(row.data_entrega ?? row.coletado_em)
    if (row.prestacao_parcial) warnings.push(`Prestação parcial. Os valores abaixo vêm da prestação de contas entregue até ${date} e podem mudar nas próximas entregas.`)
    if (row.fonte_url) sources.push({ label: `Prestação de contas do TSE ${row.ano_eleicao}`, url: row.fonte_url, collectedAt: row.coletado_em || null })
    const empty = row.estado_coleta === "sem_prestacao" || (row.estado_coleta === "declarado" && row.total_despesas_contratadas === 0 && row.concentracao_despesas.length === 0 && row.doacoes_a_terceiros.length === 0)
    const value = empty ? "Sem despesas declaradas" : row.total_despesas_contratadas == null ? "Não informado pela fonte" : formatBRL(row.total_despesas_contratadas)
    const categories = safeArray(row.concentracao_despesas).map((item) => ({
      label: `${item.tipo} · ${item.quantidade}`,
      value: formatBRL(item.valor),
    }))
    return [{ label: `Despesas de campanha em ${row.ano_eleicao}${suffix}`, value }, ...categories]
  })
  return { rows: projected, warnings: [...new Set(warnings)], sources }
}

function cotaRows(ficha: FichaCandidato) {
  const latest = [...safeArray(ficha.gastos_parlamentares)].sort((a, b) => b.ano - a.ano)[0]
  if (!latest || !Number.isFinite(latest.total_gasto)) return null
  const categories = safeArray(latest.detalhamento)
    .filter((item) => Number.isFinite(item.valor))
    .sort((a, b) => b.valor - a.valor)
  return {
    latest,
    rows: [
      { label: `Total em ${latest.ano}`, value: formatCompact(latest.total_gasto) },
      ...categories.map((item) => ({ label: formatPublicLabel(item.categoria), value: formatCompact(item.valor) })),
    ],
  }
}

function cotaSources(inputRows: FichaCandidato["gastos_parlamentares"]): BoxCardModel["sources"] {
  const rows = safeArray(inputRows)
  const houseForRow = (row: (typeof rows)[number]) => {
    const casaPublica = (row as typeof row & { casa?: string | null }).casa?.trim().toLocaleUpperCase("pt-BR")
    if (["CAMARA", "CÂMARA", "CEAP"].includes(casaPublica ?? "")) return "camara"
    if (["SENADO", "CEAPS"].includes(casaPublica ?? "")) return "senado"
    const source = row.fonte?.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase() ?? ""
    return /\b(senado|ceaps)\b/.test(source) ? "senado" : /\b(camara|ceap)\b/.test(source) ? "camara" : null
  }
  const houses = new Set(rows.map(houseForRow).filter((house): house is "camara" | "senado" => house !== null))
  const sources: BoxCardModel["sources"] = []
  if (houses.has("camara")) {
    const source = IMPRENSA_METHOD_SOURCES.find((item) => item.id === "camara-cotas")
    if (source) {
      const years = [...new Set(rows.filter((row) => {
        return houseForRow(row) === "camara"
      }).map((row) => row.ano))].sort((a, b) => a - b)
      for (const year of years) {
        const collectedAt = rows
          .filter((row) => {
            if (row.ano !== year) return false
            return houseForRow(row) === "camara"
          })
          .map((row) => row.coletado_em)
          .filter((date): date is string => Boolean(date) && Number.isFinite(Date.parse(date!)))
          .sort()
          .at(-1) ?? null
        sources.push({
          label: `${source.label} (${year})`,
          url: source.authorityUrl.replace(/Ano-\d{4}\.csv\.zip$/, `Ano-${year}.csv.zip`),
          collectedAt,
        })
      }
    }
  }
  if (houses.has("senado")) {
    const source = IMPRENSA_METHOD_SOURCES.find((item) => item.id === "ceaps-senado")
    if (source) {
      const matchingRows = rows.filter((row) => {
        return houseForRow(row) === "senado"
      })
      const collectedAt = matchingRows.map((row) => row.coletado_em).filter((date): date is string => Boolean(date) && Number.isFinite(Date.parse(date!))).sort().at(-1) ?? null
      sources.push({ label: source.label, url: source.authorityUrl, collectedAt })
    }
  }
  return sources
}

function voteRows(ficha: FichaCandidato) {
  const votes = safeArray(ficha.votos)
    .filter((vote) => vote.votacao && typeof vote.votacao.titulo === "string")
  if (votes.length === 0) return null
  return votes.map((vote) => ({
    label: vote.votacao!.titulo,
    value: formatVoteBadgeLabel(vote.voto),
    detail: [formatVotoCasaQuando(vote.votacao), formatVoteNote(vote.voto)].filter(Boolean).join(" · ") || undefined,
  }))
}

function voteSources(ficha: FichaCandidato): BoxCardModel["sources"] {
  return safeArray(ficha.votos).flatMap((vote) => {
    const votacao = vote.votacao
    if (!votacao) return []
    const url = buildVotacaoNominalUrl(votacao.casa, votacao.proposicao_id, votacao.votacao_id_api)
    return url ? [{ label: `${votacao.casa} · votação nominal: ${votacao.titulo}`, url, collectedAt: null }] : []
  }).filter((source, index, all) => all.findIndex((candidate) => candidate.url === source.url) === index)
}

function careerRows(ficha: FichaCandidato) {
  const history = prepareHistoricoPoliticoPublicDisplayList(safeArray(ficha.historico))
  if (history.length === 0) return null
  return history.map((item) => ({
    label: historicoDisplay.formatHistoricoPeriodoDisplay(item, history),
    value: historicoDisplay.formatHistoricoCargoTituloPublico(item),
    detail: [historicoDisplay.formatHistoricoPartidoEstadoLine(item), historicoDisplay.formatHistoricoObservacaoPublica(item.observacoes)].filter(Boolean).join(" · ") || undefined,
  }))
}

function partyRows(ficha: FichaCandidato) {
  const changes = safeArray(ficha.mudancas_partido)
  const currentParty = [ficha.partido_sigla, ficha.partido_atual]
    .filter((value): value is string => Boolean(value) && !isUncertainParty(value))
  const currentPartyLabel = currentParty.length === 2 && currentParty[0] === currentParty[1]
    ? currentParty[0]
    : currentParty.join(" · ")
  if (changes.length === 0 && !currentPartyLabel) return null
  const verified = partySwitchCountVerified(changes, ficha.filiacao_verificacao?.resultado)
  const warnings: string[] = []
  if (!verified) warnings.push("Histórico de filiações ainda não confirmado na fonte; a contagem de trocas fica em aberto.")
  const blocked = hasSameYearPartyReversal(changes)
  if (blocked) warnings.push("A linha do tempo partidária contém uma reversão A→B e B→A no mesmo ano, padrão estruturalmente impossível que indica mistura de homônimos ou ordem incorreta na ingestão. Ocultamos a lista até que as fontes permitam reconstruir a sequência.")
  const ordered = [...changes].sort((a, b) => b.ano - a.ano)
  const rows = verified && !blocked
    ? ordered.map((item) => ({ label: String(item.ano), value: formatPartyTransitionLabel(item), detail: item.contexto ?? undefined }))
    : []
  if (blocked) return null
  if (rows.length === 0 && currentPartyLabel) rows.push({ label: "Atual", value: `${verified ? "Filiação atual" : "Partido declarado na candidatura"}: ${currentPartyLabel}`, detail: verified ? "Sem trocas de partido registradas na base." : "Histórico de filiações ainda não confirmado na fonte; a contagem de trocas fica em aberto." })
  const freshness = ficha.section_freshness?.mudancas_partido
  const inconclusive = freshness?.status === "stale" && freshness.sourceLabel === "Google Notícias" && /inconclusiv/i.test(freshness.message)
  const title = !verified ? "Trocas de partido não verificadas"
    : countPartySwitches(changes) === 0 ? inconclusive ? "Partido declarado na candidatura" : "Partidos confirmados"
      : countPartySwitches(changes) === 1 ? "1 troca de partido" : `${countPartySwitches(changes)} trocas de partido`
  warnings.push(...freshnessWarning(ficha, "mudancas_partido"))
  return rows.length ? { rows, warnings: [...new Set(warnings)], title } : null
}

export function buildCandidateBoxCard(kind: BoxCardKind, ficha: FichaCandidato): BoxCardModel | null {
  if (!ficha || typeof ficha.slug !== "string" || !ficha.slug.trim()) return null
  const built = buildCandidateBoxCardBody(kind, ficha)
  if (!built) return null
  // Mensagem de atualização da seção é informação, não alerta: o card a mostra em tom neutro.
  const freshness = new Set(
    Object.values(ficha.section_freshness ?? {})
      .map((info) => info?.message)
      .filter((message): message is string => typeof message === "string" && message.length > 0),
  )
  return {
    ...built,
    warnings: built.warnings.filter((warning) => !freshness.has(warning)),
    notes: built.warnings.filter((warning) => freshness.has(warning)),
    subjects: [candidateSubject(ficha)],
  }
}

function buildCandidateBoxCardBody(kind: BoxCardKind, ficha: FichaCandidato): BoxCardModel | null {
  const link = candidateDeepLink(kind, ficha)
  switch (kind) {
    case "patrimonio-resumo": {
      const rows = patrimonyRows(ficha)
      if (!rows) return null
      return model(kind, ficha.slug, candidateIdentity(ficha), link, rows, freshnessWarning(ficha, "patrimonio"), [...patrimonySources(ficha), ...freshnessSources(ficha, "patrimonio")])
    }
    case "evolucao-patrimonial-resumo": {
      const projection = evolutionRows(ficha)
      if (!projection) return null
      return model(kind, ficha.slug, candidateIdentity(ficha), link, projection.rows, [...projection.warnings, ...freshnessWarning(ficha, "patrimonio")], [...patrimonySources(ficha), ...freshnessSources(ficha, "patrimonio")])
    }
    case "financiamento-resumo": {
      const projection = financingRows(ficha)
      if (!projection) return null
      return model(kind, ficha.slug, candidateIdentity(ficha), link, projection.rows, [...projection.warnings, ...freshnessWarning(ficha, "financiamento")], [{ label: "Prestação de contas eleitorais do TSE", url: FINANCIAMENTO_SERIE_TSE_FONTE_URL, collectedAt: null }, ...freshnessSources(ficha, "financiamento")])
    }
    case "despesas-campanha": {
      const projection = expenseRows(ficha)
      return projection ? model(kind, ficha.slug, candidateIdentity(ficha), link, projection.rows, [...projection.warnings, ...freshnessWarning(ficha, "financiamento")], [...projection.sources, ...freshnessSources(ficha, "financiamento")]) : null
    }
    case "cota-resumo": {
      const projection = cotaRows(ficha)
      return projection ? model(kind, ficha.slug, candidateIdentity(ficha), link, projection.rows, freshnessWarning(ficha, "gastos_parlamentares"), [...cotaSources([projection.latest]), ...freshnessSources(ficha, "gastos_parlamentares")]) : null
    }
    case "votacoes-resumo": {
      const rows = voteRows(ficha)
      return rows ? model(kind, ficha.slug, candidateIdentity(ficha), link, rows, freshnessWarning(ficha, "votos_candidato"), [...voteSources(ficha), ...freshnessSources(ficha, "votos_candidato")]) : null
    }
    case "cargos-mandatos": {
      const rows = careerRows(ficha)
      return rows ? model(kind, ficha.slug, candidateIdentity(ficha), link, rows, freshnessWarning(ficha, "historico_politico"), freshnessSources(ficha, "historico_politico")) : null
    }
    case "historico-partidario": {
      const projection = partyRows(ficha)
      return projection ? model(kind, ficha.slug, candidateIdentity(ficha), link, projection.rows, projection.warnings, freshnessSources(ficha, "mudancas_partido", "filiacao"), projection.title) : null
    }
    default:
      return null
  }
}

function selectedCandidates(candidates: CandidatoComparavel[], context: ComparatorBoxCardContext) {
  const supplied = context.slugs
  if (!supplied || supplied.length < 2 || supplied.length > 4 || supplied.some((slug) => !slug) || new Set(supplied).size !== supplied.length) return null
  const wanted = [...supplied]
  const bySlug = new Map(candidates.map((candidate) => [candidate.slug, candidate]))
  const selected = wanted.map((slug) => bySlug.get(slug)).filter((item): item is CandidatoComparavel => Boolean(item))
  if (selected.length < 2 || selected.length !== wanted.length) return null
  if (context.uf && selected.some((candidate) => candidate.estado?.toUpperCase() !== context.uf?.toUpperCase())) return null
  if (context.cargo && selected.some((candidate) => candidate.cargo_disputado.toLocaleLowerCase("pt-BR") !== context.cargo?.toLocaleLowerCase("pt-BR"))) return null
  return selected
}

export function buildComparatorBoxCard(
  candidates: CandidatoComparavel[],
  context: ComparatorBoxCardContext = {},
): BoxCardModel | null {
  const selected = selectedCandidates(candidates, context)
  if (!selected) return null
  const slugs = selected.map((candidate) => candidate.slug)
  const axis: ComparadorEixo = context.axis ?? "patrimonio"
  const values = selected.map((candidate) => axis === "patrimonio" ? candidate.patrimonio_declarado : candidate.total_gasto_parlamentar)
  if (!values.some((value) => value != null && Number.isFinite(value))) return null
  const rows: BoxCardModel["rows"] = selected.map((candidate) => ({
    label: candidate.nome_urna,
    value: axis === "patrimonio"
      ? candidate.patrimonio_declarado == null ? PUBLIC_DATA_VOCABULARY.unverified.label : formatCompact(candidate.patrimonio_declarado)
      : candidate.total_gasto_parlamentar == null ? COMPARADOR_NAO_SE_APLICA : formatCompact(candidate.total_gasto_parlamentar),
  }))
  const params = new URLSearchParams(mergeComparadorQueryString("", slugs, axis, context.uf && context.cargo ? { uf: context.uf, cargo: context.cargo } : null))
  params.set("eixo", axis)
  if (context.uf && !context.cargo) params.set("uf", context.uf)
  if (context.cargo && !context.uf) params.set("cargo", context.cargo)
  const link = context.uf
    ? `/uf/${encodeURIComponent(context.uf.toLowerCase())}${context.cargo?.toLowerCase() === "senador" ? "/senado" : ""}?${params.toString()}#box-comparador`
    : `/comparar?${params.toString()}#box-comparador`
  const warnings: string[] = []
  const leaders = values.filter((value): value is number => value != null && Number.isFinite(value))
  if (leaders.length >= 2) {
    const max = Math.max(...leaders)
    if (leaders.every((value) => value === max)) warnings.push("Não há maior valor único neste recorte.")
    else selected.forEach((candidate, index) => { if (maiorEntreValoresReais(values[index], values)) rows[index].detail = "Maior" })
  }
  const identity = selected.map((candidate) => candidate.nome_urna).join(" × ")
  const sources = axis === "patrimonio"
    ? [{ label: "TSE: bens declarados", url: fonteDadosAbertosPatrimonioTse(2026), collectedAt: null }]
    : ["camara", "ceaps-senado"].flatMap((id) => {
        const source = IMPRENSA_METHOD_SOURCES.find((item) => item.id === id)
        if (!source) return []
        const label = id === "camara" ? `${source.label}: cota parlamentar` : source.label
        return [{ label, url: source.authorityUrl, collectedAt: null }]
      })
  const subjects = selected.map((candidate) => ({
    name: candidate.nome_urna,
    meta: subjectMeta(candidate.partido_sigla, null, null),
    photoUrl: typeof candidate.foto_url === "string" && candidate.foto_url.trim() ? candidate.foto_url : null,
  }))
  const title = axis === "patrimonio" ? "Patrimônio declarado" : "Gastos da cota parlamentar"
  return model("comparador", slugs.join("~"), identity, link, rows, warnings, sources, title, subjects)
}

import { chmod, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { isHistoricoCandidaturaRow } from "../../src/lib/historico-tipo-evento"
import { publicFamilyRowCount, validCoverageSourceProof } from "./lib/coverage-source-proof"

/**
 * Etapa 0: matriz somente leitura da cobertura pública por candidato e família.
 *
 * A matriz deliberadamente exige recibo para fechar uma célula. A presença de
 * linhas no payload prova materialização, mas não prova que a fonte foi
 * consultada; por isso uma célula aplicável sem recibo fica `sem_recibo`.
 */

export const COVERAGE_FAMILIES = [
  "perfil_atual",
  "historico_politico",
  "mudancas_partido",
  "patrimonio",
  "financiamento",
  "projetos_lei",
  "votos_candidato",
  "gastos_parlamentares",
  "gastos_executivo",
  "processos",
  "sites_tse",
  "chapa_vice",
] as const

export type CoverageFamily = (typeof COVERAGE_FAMILIES)[number]
export type CoverageState =
  | "publicado"
  | "vazio_confirmado"
  | "nao_aplicavel"
  | "indeterminado"
  | "sem_recibo"
  | "erro"
  | "desatualizado"
  | "frescor_indefinido"

export type CoverageProfile = Record<string, unknown> & {
  id?: string
  slug?: string
  nome_completo?: string
  nome_urna?: string
  cargo_disputado?: string
  cargo_atual?: string | null
  ids?: Record<string, unknown>
  section_freshness?: Record<string, Record<string, unknown> | undefined>
}

export type CoverageCell = {
  slug: string
  familia: CoverageFamily
  aplicavel: boolean
  estado: CoverageState
  motivo: string
  verificado_em: string | null
  fonte: string | null
  escopo: string | null
  /**
   * De onde veio o recibo lido: linha de coleta_log por candidato, selo de
   * frescor do payload público (não é prova de coleta), nenhum, ou perfil que
   * não respondeu. O gate de CI conta tudo que não é coleta_log.
   */
  origem_recibo: "coleta_log" | "badge_publico" | "nenhum" | "perfil_indisponivel"
  /** Exceção nominal aprovada pelo dono; a célula continua com o estado real. */
  excecao?: { motivo: string; aprovado_por: string; aprovado_em: string; referencia?: string }
}

export type CoverageMatrix = {
  generated_at: string
  requested_profiles: number
  completed_profiles: number
  families: readonly CoverageFamily[]
  cells: CoverageCell[]
  summary: Record<CoverageFamily, Record<CoverageState, number>>
  profile_errors: Array<{ slug: string; error: string }>
  exceptions?: CoverageExceptionReport
}

type Receipt = Record<string, unknown>
export type CoverageReceiptJoin = Record<string, Partial<Record<CoverageFamily, Receipt | null>>>

export type LatestReceiptRow = {
  fonte?: unknown
  escopo?: unknown
  alvo?: unknown
  candidato_id?: unknown
  executado_em?: unknown
  resultado?: unknown
  volume?: unknown
  url?: unknown
  detalhe?: unknown
  periodo?: unknown
  execucao?: unknown
}

/** Precedência dentro de uma mesma execução do coletor. */
const RESULT_RANK: Record<string, number> = { nao_aplicavel: 0, vazio_confirmado: 1, encontrado: 2, publicado: 2, indeterminado: 3, erro: 4 }

function sameExecution(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const left = text(a.execucao)
  const right = text(b.execucao)
  if (left && right) return left === right
  // Sem id de execução, só o mesmo instante prova o mesmo lote.
  const leftAt = parseDate(a.executado_em)
  const rightAt = parseDate(b.executado_em)
  return Boolean(leftAt && rightAt && Date.parse(leftAt) === Date.parse(rightAt))
}

export type ReceiptAdapterResult = {
  joins: CoverageReceiptJoin
  rejected: Array<{ fonte: string | null; alvo: string | null; motivo: string }>
  ignored_partial_receipts: number
}

const STATES: readonly CoverageState[] = [
  "publicado", "vazio_confirmado", "nao_aplicavel", "indeterminado",
  "sem_recibo", "erro", "desatualizado", "frescor_indefinido",
]

/** Recibo por ficha da auditoria diária do TSE (`data-freshness-audit.yml`). */
export const DAILY_CHECK_SOURCE = "tse-auditoria-candidatura"
/** A auditoria roda todo dia; três dias toleram uma falha isolada do cron. */
export const DAILY_CHECK_MAX_AGE_DAYS = 3
const TSE_DERIVED_FAMILIES: readonly CoverageFamily[] = ["perfil_atual", "historico_politico", "patrimonio", "financiamento"]

/**
 * Família de um recibo gravado com a fonte genérica `tse`.
 *
 * Os coletores de patrimônio e financiamento gravaram `fonte='tse'` e puseram a
 * família no detalhe ("patrimonio", "financiamento") ou numa frase fixa. A
 * leitura é uma lista fechada: detalhe desconhecido não vira família nenhuma,
 * em vez de cair no perfil, e fica contado como recibo parcial.
 */
export function tseReceiptFamilies(detalhe: unknown, url: unknown): readonly CoverageFamily[] {
  const parsed = receiptDetail(detalhe)
  const declared = text(parsed?.family)
  if (parsed && declared && TSE_DERIVED_FAMILIES.includes(declared as CoverageFamily)) return [declared as CoverageFamily]
  const raw = typeof detalhe === "string" ? detalhe.trim() : ""
  if (raw === "financiamento" || /^Receita oficial reconciliada/.test(raw) || /sem receita para a candidatura/.test(raw) || /^Financiamento \d{4}:/.test(raw)) return ["financiamento"]
  if (raw === "patrimonio" || /ST_DECLARAR_BENS/.test(raw) || /\bbens=\[/.test(raw) || /totalDeBens/.test(raw)) return ["patrimonio"]
  // Falha de identidade no coletor de contas/bens: a URL oficial diz qual pacote foi lido.
  const source = text(url) ?? ""
  if (/\/prestacao_contas\//.test(source)) return ["financiamento"]
  if (/\/bem_candidato\//.test(source)) return ["patrimonio"]
  return []
}

export function receiptFamilies(fonte: string, detalhe: unknown, url: unknown): readonly CoverageFamily[] | null {
  const key = fonte.toLocaleLowerCase()
  if (key === "tse") return tseReceiptFamilies(detalhe, url)
  return FAMILIES_BY_SOURCE[key] ?? null
}

/**
 * Fontes canônicas da view `coleta_log_ultima` por família da matriz.
 *
 * A view é por fonte, candidato e escopo, enquanto a matriz é por família.
 * Portanto o adaptador precisa fazer essa redução explicitamente. Aliases
 * históricos são aceitos porque existem recibos gravados com mais de um nome;
 * nenhum nome desconhecido fecha uma célula.
 */
const FAMILIES_BY_SOURCE: Record<string, readonly CoverageFamily[]> = {
  "perfil_atual": ["perfil_atual"], "tse-candidaturas": ["perfil_atual"],
  "tse-current": ["perfil_atual"],
  // `tse` é fonte genérica: a família sai do detalhe, em tseReceiptFamilies.
  "tse": [],
  // Resolução de CPF é identidade interna (CPF não é publicado); não certifica
  // nem contradiz campo do perfil. Recibo lido e contado como parcial.
  "tse-cpf": [],
  // Situação de julgamento não certifica os demais campos do perfil.
  "tse-situacao": [],
  // Comparação diária por ficha contra o pacote oficial (auditoria de frescor).
  [DAILY_CHECK_SOURCE]: ["perfil_atual", "chapa_vice"],
  "historico_politico": ["historico_politico"], "tse-historico": ["historico_politico"], "tse-history": ["historico_politico"],
  "mudancas_partido": ["mudancas_partido"], "filiacao": ["mudancas_partido"], "tse-filiacao": ["mudancas_partido"],
  "patrimonio": ["patrimonio"], "tse-patrimonio": ["patrimonio"], "bem-candidato-tse-2018": ["patrimonio"], "destaques-patrimonio": ["patrimonio"],
  "financiamento": ["financiamento"], "tse-financiamento": ["financiamento"], "financiamento-tse": ["financiamento"], "financiamento-verificacoes": ["financiamento"],
  "projetos_lei": ["projetos_lei"], "projetos-lei": ["projetos_lei"], "camara-proposicoes": ["projetos_lei"], "senado-proposicoes": ["projetos_lei"], "camara-dadosabertos-v2": ["projetos_lei"],
  "votos_candidato": ["votos_candidato"], "votos": ["votos_candidato"], "votacoes": ["votos_candidato"], "camara-votacoes": ["votos_candidato"], "destaques-votacoes": ["votos_candidato"], "senado-votacoes": ["votos_candidato"],
  "gastos_parlamentares": ["gastos_parlamentares"], "gastos-parlamentares": ["gastos_parlamentares"], "camara-gastos": ["gastos_parlamentares"], "senado-gastos": ["gastos_parlamentares"], "ceaps-senado": ["gastos_parlamentares"], "jarbas": ["gastos_parlamentares"],
  "gastos_executivo": ["gastos_executivo"], "gastos-executivo": ["gastos_executivo"], "transparencia": ["gastos_executivo"],
  "processos": ["processos"], "processos-curadoria": ["processos"],
  "sites_tse": ["sites_tse"], "sites-tse": ["sites_tse"], "candidate-sites-tse": ["sites_tse"], "tse-sites": ["sites_tse"],
  "chapa_vice": ["chapa_vice"], "chapa-vice": ["chapa_vice"], "chapa": ["chapa_vice"], "chapas": ["chapa_vice"], "tse-chapas": ["chapa_vice"],
}

const CORE_FIELDS = [
  "partido_sigla", "situacao_candidatura", "foto_url", "biografia",
  "naturalidade", "data_nascimento", "formacao", "profissao_declarada",
  "genero", "estado_civil", "cor_raca",
]

function record(value: unknown): Receipt | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Receipt : null
}

function receiptDetail(value: unknown): Receipt | null {
  if (typeof value !== "string") return record(value)
  try { return record(JSON.parse(value)) } catch { return null }
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function present(value: unknown): boolean {
  return text(value) !== null || (typeof value === "number" && Number.isFinite(value))
}

/**
 * Data de recibo em ISO 8601 com hora e fuso explícito (Z ou offset). Data sem
 * fuso é lida no fuso local da máquina que roda a matriz e muda de dia conforme
 * o runner; aqui ela não conta como data.
 */
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/

function parseDate(value: unknown): string | null {
  const raw = text(value)
  return raw && ISO_WITH_ZONE.test(raw) && Number.isFinite(Date.parse(raw)) ? raw : null
}

/**
 * Casa federal de um rótulo de cargo, nas formas masculina, feminina e neutra
 * ("Deputada Federal", "Deputado(a) Federal", "Senadora", "Senador(a)").
 * Suplente não é o cargo: "1º Suplente de Senador" fica de fora.
 */
function federalHouseOfCargo(cargo: string | null): "camara" | "senado" | null {
  if (!cargo) return null
  if (/^Deputad[oa](\(a\))? Federal/.test(cargo)) return "camara"
  if (/^Senador/.test(cargo)) return "senado"
  return null
}

function federalParliamentary(profile: CoverageProfile): boolean {
  const ids = record(profile.ids)
  if (present(ids?.camara) || present(ids?.senado)) return true
  if (holdsFederalSeatNow(profile, "camara") || holdsFederalSeatNow(profile, "senado")) return true
  const historic = Array.isArray(profile.historico) ? profile.historico : []
  return historic.some((item) => {
    const row = record(item)
    if (!row || isCandidacyRow(row)) return false
    return federalHouseOfCargo(text(row?.cargo_canonico) ?? text(row?.cargo)) !== null
  })
}

function isCandidacyRow(row: Receipt): boolean {
  return isHistoricoCandidaturaRow({
    tipo_evento: text(row.tipo_evento),
    observacoes: text(row.observacoes),
    periodo_inicio: typeof row.periodo_inicio === "number" ? row.periodo_inicio : null,
    periodo_fim: typeof row.periodo_fim === "number" ? row.periodo_fim : null,
  })
}

function isExecutive(profile: CoverageProfile): boolean {
  const current = text(profile.cargo_atual)
  return ["Presidente", "Governador", "Vice-Presidente", "Vice-Governador"].includes(current ?? "")
}

function isChapaApplicable(profile: CoverageProfile): boolean {
  return ["Presidente", "Vice-Presidente", "Governador", "Vice-Governador"].includes(text(profile.cargo_disputado) ?? "")
}

function applicable(profile: CoverageProfile, family: CoverageFamily): boolean {
  if (family === "gastos_parlamentares") return federalParliamentary(profile) && expenseSources(profile).length > 0
  if (["projetos_lei", "votos_candidato"].includes(family)) return federalParliamentary(profile)
  if (family === "gastos_executivo") return isExecutive(profile)
  if (family === "chapa_vice") return isChapaApplicable(profile)
  return true
}

function profileId(profile: CoverageProfile): string | null {
  return text(profile.id) ?? text(profile.candidato_id) ?? text(profile.candidate_id)
}

function sourceKey(fonte: string): string {
  const normalized = fonte.toLocaleLowerCase()
  if (normalized.startsWith("camara")) return "camara"
  if (normalized.startsWith("senado")) return "senado"
  if (normalized === "ceaps-senado") return "ceaps-senado"
  return normalized
}

function federalSources(profile: CoverageProfile): string[] {
  const sources = new Set<string>()
  const ids = record(profile.ids)
  if (present(ids?.camara)) sources.add("camara")
  if (present(ids?.senado)) sources.add("senado")
  for (const item of Array.isArray(profile.historico) ? profile.historico : []) {
    const row = record(item)
    if (!row || isCandidacyRow(row)) continue
    const cargo = text(row.cargo_canonico) ?? text(row.cargo)
    if (cargo === "Deputado Federal") sources.add("camara")
    if (cargo === "Senador") sources.add("senado")
  }
  return [...sources]
}

/** Primeiro ano da série oficial de cotas parlamentares (CSV anual da Câmara e CEAPS do Senado). */
export const EXPENSE_SERIES_FIRST_YEAR = 2008

/** A pessoa ocupa hoje o cargo federal desta casa, segundo `cargo_atual`. */
function holdsFederalSeatNow(profile: CoverageProfile, house: "camara" | "senado"): boolean {
  return federalHouseOfCargo(text(profile.cargo_atual)) === house
}

/**
 * Intervalos de mandato federal da casa no histórico publicado. Linha aberta
 * (sem fim) é tratada como indo até o ano corrente: sem fim registrado, não há
 * como afirmar que o mandato terminou antes da série de cotas.
 */
function federalMandateIntervals(profile: CoverageProfile, house: "camara" | "senado", now = new Date().getUTCFullYear()): Array<[number | null, number]> {
  const intervals: Array<[number | null, number]> = []
  for (const item of Array.isArray(profile.historico) ? profile.historico : []) {
    const row = record(item)
    if (!row || isCandidacyRow(row)) continue
    if (federalHouseOfCargo(text(row.cargo_canonico) ?? text(row.cargo)) !== house) continue
    const start = typeof row.periodo_inicio === "number" ? row.periodo_inicio : null
    const end = typeof row.periodo_fim === "number" ? row.periodo_fim : now
    intervals.push([start, Math.min(end, now)])
  }
  return intervals
}

/**
 * Casas cuja cota parlamentar se aplica à ficha. Regra escrita:
 * - exercício atual do cargo ou ID oficial da casa: aplica, sempre;
 * - sem ID e sem exercício atual, só histórico: aplica se algum mandato alcança
 *   a série oficial de cotas (2008 em diante); mandato todo anterior não se aplica.
 */
function expenseSources(profile: CoverageProfile): string[] {
  const ids = record(profile.ids)
  const sources: string[] = []
  for (const house of ["camara", "senado"] as const) {
    if (holdsFederalSeatNow(profile, house) || present(ids?.[house])) {
      sources.push(house)
      continue
    }
    if (federalMandateIntervals(profile, house).some(([, end]) => end >= EXPENSE_SERIES_FIRST_YEAR)) sources.push(house)
  }
  return sources
}

/**
 * Cota zerada declarada pela fonte oficial (`cota-parlamentar-zero`): fecha como
 * vazio só se os anos consultados cobrem todos os anos de mandato da casa dentro
 * da série de cotas. Consulta vazia fora do mandato não prova nada.
 */
function validExpenseZero(profile: CoverageProfile, family: CoverageFamily, receipt: Receipt): boolean {
  if (family !== "gastos_parlamentares") return false
  const detail = record(receipt.cota_zero)
  if (!detail || detail.contract_version !== 1 || detail.kind !== "cota-parlamentar-zero") return false
  const house = detail.house === "camara" || detail.house === "senado" ? detail.house : null
  if (!house || sourceKey(text(receipt.fonte) ?? "") !== house) return false
  const publicId = record(profile.ids)?.[house]
  if (present(publicId) && String(publicId) !== text(detail.source_id)) return false
  const queried = new Set(Array.isArray(detail.anos) ? detail.anos.filter((year): year is number => Number.isInteger(year)) : [])
  const required = new Set<number>()
  for (const [start, end] of federalMandateIntervals(profile, house)) {
    if (start === null) return false
    for (let year = Math.max(start, EXPENSE_SERIES_FIRST_YEAR); year <= end; year++) required.add(year)
  }
  return required.size > 0 && [...required].every((year) => queried.has(year))
}

function requiredSources(profile: CoverageProfile, family: CoverageFamily): string[] {
  if (!["projetos_lei", "votos_candidato", "gastos_parlamentares"].includes(family)) return []
  return family === "gastos_parlamentares" ? expenseSources(profile) : federalSources(profile)
}

/**
 * Adapta uma exportação somente leitura de `coleta_log_ultima`.
 *
 * O vínculo exige simultaneamente candidato_id, slug em `alvo`, escopo
 * candidato, fonte exata e timestamp válido. Uma linha global/territorial ou
 * uma linha de outro candidato não pode fechar nenhuma célula.
 */
export function adaptLatestReceipts(rows: LatestReceiptRow[], profiles: CoverageProfile[]): ReceiptAdapterResult {
  const bySlug = new Map(profiles.map((profile) => [text(profile.slug) ?? "", profile]))
  const joins: CoverageReceiptJoin = {}
  const rejected: ReceiptAdapterResult["rejected"] = []
  let ignoredPartialReceipts = 0
  for (const row of rows) {
    const fonte = text(row.fonte)
    const families = fonte ? receiptFamilies(fonte, row.detalhe, row.url) : null
    if (!families) {
      rejected.push({ fonte, alvo: text(row.alvo), motivo: "fonte não mapeada para uma família da matriz" })
      continue
    }
    const alvo = text(row.alvo)
    const profile = alvo ? bySlug.get(alvo) : undefined
    const candidateId = text(row.candidato_id)
    const expectedId = profile ? profileId(profile) : null
    const reject = (motivo: string) => rejected.push({ fonte, alvo, motivo })
    if (!fonte || !alvo || !profile) { reject("alvo não pertence à coorte pública"); continue }
    if (text(row.escopo) !== "candidato") { reject("escopo não é candidato"); continue }
    if (!candidateId || !expectedId || candidateId !== expectedId) { reject("candidato_id não confere com o perfil"); continue }
    const executed = parseDate(row.executado_em)
    if (!executed) { reject("executado_em inválido"); continue }
    const result = text(row.resultado)
    if (!result || !["encontrado", "publicado", "vazio_confirmado", "nao_aplicavel", "erro", "indeterminado"].includes(result)) { reject("resultado inválido"); continue }
    if (result === "encontrado" && !(typeof row.volume === "number" && row.volume > 0)) { reject("encontrado sem volume positivo"); continue }
    if (result === "publicado" && !(typeof row.volume === "number" && row.volume > 0)) { reject("publicado sem volume positivo"); continue }
    if (!["encontrado", "publicado"].includes(result) && typeof row.volume === "number" && row.volume !== 0) { reject("resultado sem volume zero coerente"); continue }
    if (families.length === 0) { ignoredPartialReceipts++; continue }
    const detail = receiptDetail(row.detalhe)
    const incoming: Receipt = {
      resultado: result,
      executado_em: executed,
      fonte,
      escopo: text(detail?.escopo) ?? "candidato",
      url: text(row.url),
      source_sha256: text(detail?.resource_sha256),
      periodo: text(row.periodo),
      coverage_proof: detail?.coverage_proof,
      execucao: text(row.execucao),
      ...(detail?.kind === "cota-parlamentar-zero" ? { cota_zero: detail } : {}),
      ...(fonte!.toLocaleLowerCase() === DAILY_CHECK_SOURCE ? { daily_check: detail, candidato_id: candidateId } : {}),
    }
    const bucket = joins[alvo] ?? {}
    joins[alvo] = bucket
    for (const family of families) {
      const previous = record(bucket[family])
      const receipts = record(previous?.__receipts) ?? {}
      const key = sourceKey(fonte!)
      const priorSource = record(receipts[key])
      const priorDate = parseDate(priorSource?.executado_em)
      if (priorSource && sameExecution(priorSource, incoming)) {
        // Coletores anuais gravam um recibo por eleição na mesma execução, sem
        // ano na URL (ex.: financiamento encontrado em 2022 e vazio em 2018).
        // "O último vence" escolheria um ano ao acaso; a execução vale pelo
        // resultado mais grave, e um vazio anual não apaga o que ela achou.
        if (RESULT_RANK[result] > RESULT_RANK[text(priorSource.resultado) ?? ""]) receipts[key] = { ...incoming, executado_em: priorDate && Date.parse(priorDate) > Date.parse(executed) ? priorDate : executed }
        else if (priorDate && Date.parse(executed) > Date.parse(priorDate)) receipts[key] = { ...priorSource, executado_em: executed }
      } else if (!priorDate || Date.parse(executed) >= Date.parse(priorDate)) receipts[key] = incoming
      const representative = Object.values(receipts)
        .map((item) => record(item))
        .filter((item): item is Receipt => Boolean(item))
        .sort((a, b) => Date.parse(parseDate(b.executado_em) ?? "1970-01-01") - Date.parse(parseDate(a.executado_em) ?? "1970-01-01"))[0] ?? incoming
      // Recibos com prova de cobertura ficam guardados à parte: um recibo mais
      // novo sem prova (ex.: coleta anual de outro ano na mesma fonte) não
      // apaga a prova que ainda confere com o payload público.
      const previousProofs = Array.isArray(previous?.__proofs) ? previous.__proofs as Receipt[] : []
      const proofs = record(incoming.coverage_proof) ? [...previousProofs, incoming] : previousProofs
      bucket[family] = { ...representative, __receipts: receipts, __proofs: proofs }
    }
  }
  return { joins, rejected, ignored_partial_receipts: ignoredPartialReceipts }
}

function receiptFor(profile: CoverageProfile, family: CoverageFamily, joins: CoverageReceiptJoin): Receipt | null {
  const joined = joins[text(profile.slug) ?? ""]?.[family]
  if (joined) return record(joined)

  // Public profile payloads carry the same collector receipt used to render
  // the freshness badge. It is acceptable as a read-only receipt only when the
  // structured fields are present; arrays or counters never substitute for it.
  const freshness = record(profile.section_freshness?.[family])
  // A historical badge can intentionally omit its verification date. In that
  // case it is not a receipt and must not hide a dated family verification.
  if (freshness && (parseDate(freshness.verifiedAt) || parseDate(freshness.referenceDate))) {
    return {
      status: freshness.status,
      verifiedAt: freshness.verifiedAt ?? freshness.referenceDate,
      sourceLabel: freshness.sourceLabel,
      scope: freshness.scope,
      message: freshness.message,
    }
  }
  const field = ({
    historico_politico: "trajetoria_verificacao",
    mudancas_partido: "filiacao_verificacao",
    patrimonio: "patrimonio_verificacao",
    processos: "processos_verificacao",
    votos_candidato: "votacoes_verificacao",
  } as Partial<Record<CoverageFamily, string>>)[family]
  return field ? record(profile[field]) : null
}

// Null means that an official source revision, rather than elapsed days, must
// establish freshness. Until that comparison exists, do not certify a cell.
const FRESHNESS_DAYS: Record<CoverageFamily, number | null> = {
  perfil_atual: null, historico_politico: null, mudancas_partido: null, patrimonio: null,
  financiamento: null, projetos_lei: 9, votos_candidato: 9, gastos_parlamentares: 9,
  gastos_executivo: 90, processos: 14, sites_tse: null, chapa_vice: null,
}

function hasMaterializedData(profile: CoverageProfile, family: CoverageFamily): boolean {
  if (family === "perfil_atual") return CORE_FIELDS.every((field) => text(profile[field]) !== null)
  if (family === "processos") return Array.isArray(profile.processos) && profile.processos.length > 0
  if (family === "sites_tse") {
    const sites = record(profile.sites_candidato)
    return Boolean(sites && Array.isArray(sites.sites) && sites.sites.length > 0 && text(sites.fonte_url) && text(sites.fonte_sha256))
  }
  if (family === "chapa_vice") {
    const chapa = record(profile.chapa_2026)
    return Boolean(chapa && chapa.identidade_status === "confirmada" && chapa.vinculo_titular_status === "confirmado" && text(chapa.fonte_url) && text(chapa.fonte_sha256))
  }
  const key: Partial<Record<CoverageFamily, string>> = {
    historico_politico: "historico", mudancas_partido: "mudancas_partido",
    patrimonio: "patrimonio_eleicoes", financiamento: "financiamento_eleicoes",
    projetos_lei: "projetos_lei", votos_candidato: "votos",
    gastos_parlamentares: "gastos_parlamentares", gastos_executivo: "gastos_executivo",
  }
  const value = profile[key[family] ?? ""]
  return Array.isArray(value) && value.length > 0
}

/** Eleição em curso; a candidatura dela é a própria ficha, não histórico anterior. */
export const CURRENT_ELECTION_YEAR = 2026

/**
 * Linha de histórico que é só a candidatura em curso. O recibo vazio de
 * `tse-historico` cobre eleições anteriores ("nenhuma candidatura nos anos
 * consultados"); a linha da candidatura 2026 não o contradiz. Vale apenas
 * quando há exatamente uma linha assim: duas candidaturas 2026 na mesma ficha
 * seguem como contradição a revisar.
 */
function currentCycleCandidacyRows(profile: CoverageProfile): Receipt[] {
  const rows = (Array.isArray(profile.historico) ? profile.historico : []).map(record).filter((row): row is Receipt => Boolean(row))
  const current = rows.filter((row) => text(row.tipo_evento) === "candidatura" && typeof row.periodo_inicio === "number" && row.periodo_inicio >= CURRENT_ELECTION_YEAR)
  return current.length === 1 ? current : []
}

/** Ano do pacote oficial na URL do recibo (ex.: prestacao_contas_2018.zip). */
function receiptYear(receipt: Receipt | null): number | null {
  const match = /_(\d{4})(?:_[a-z]+)?\.zip$/i.exec(text(receipt?.url) ?? "")
  const year = match ? Number(match[1]) : Number.NaN
  return Number.isInteger(year) && year >= 1990 && year <= 2100 ? year : null
}

function hasMaterializedDataInReceiptScope(profile: CoverageProfile, family: CoverageFamily, receipt: Receipt | null = null): boolean {
  if (family === "patrimonio" || family === "financiamento") {
    // Recibo vazio de um pacote anual só contradiz o mesmo ano publicado.
    const year = receiptYear(receipt)
    const series = profile[family === "patrimonio" ? "patrimonio_eleicoes" : "financiamento_eleicoes"]
    if (year === null || !Array.isArray(series)) return hasMaterializedData(profile, family)
    return series.some((entry) => Number(record(entry)?.ano) === year)
  }
  if (family !== "historico_politico") return hasMaterializedData(profile, family)
  const rows = Array.isArray(profile.historico) ? profile.historico : []
  return rows.length > currentCycleCandidacyRows(profile).length
}

function validReceipt(receipt: Receipt, state: string | null): boolean {
  const when = parseDate(receipt.verifiedAt) ?? parseDate(receipt.verificado_em) ?? parseDate(receipt.executado_em) ?? parseDate(receipt.coletado_em)
  if (!when || !text(receipt.sourceLabel) && !text(receipt.fonte) && !text(receipt.fonte_url)) return false
  if (Date.parse(when) > Date.now()) return false
  if (["vazio_confirmado", "sem_achado_no_escopo", "nao_aplicavel"].includes(state ?? "")) {
    return Boolean(text(receipt.scope) ?? text(receipt.escopo))
  }
  return true
}

function stateFromSingleReceipt(receipt: Receipt | null, profile: CoverageProfile, family: CoverageFamily): CoverageCell["estado"] {
  if (!receipt) return "sem_recibo"
  const status = text(receipt?.status)
  if (status === "stale") return "desatualizado"
  if (status === "missing") return "sem_recibo"
  const result = text(receipt?.resultado)
  if (!validReceipt(receipt, result)) return "erro"
  const effectiveResult = result ?? (status === "current" || status === "historical" ? "encontrado" : null)
  if (effectiveResult === "erro") return "erro"
  if (effectiveResult === "indeterminado" || effectiveResult === "sem_achado_no_escopo") return "indeterminado"
  // Applicability is decided by the written cargo/history rule in makeCell.
  // A source badge that disagrees with that rule is a review item, not proof
  // that the family can disappear from the denominator.
  if (effectiveResult === "nao_aplicavel" || status === "not_applicable") return "indeterminado"
  // A found receipt without published evidence has no concluded public state,
  // even when the search itself is old. An empty receipt with published data is
  // contradictory and must be reviewed.
  if ((effectiveResult === "encontrado" || effectiveResult === "publicado") && !hasMaterializedData(profile, family)) return "indeterminado"
  if (effectiveResult === "vazio_confirmado" && hasMaterializedDataInReceiptScope(profile, family, receipt)) {
    // Os dados parlamentares podem vir da outra casa; sem partição por fonte
    // não há prova de contradição no recibo vazio desta casa.
    return ["projetos_lei", "votos_candidato", "gastos_parlamentares"].includes(family) ? "indeterminado" : "erro"
  }
  const when = parseDate(receipt.verifiedAt) ?? parseDate(receipt.verificado_em) ?? parseDate(receipt.executado_em) ?? parseDate(receipt.coletado_em)
  if (family === "sites_tse") {
    const snapshot = record(profile.sites_candidato)
    const snapshotAt = parseDate(snapshot?.coletado_em)
    if (!snapshot || !snapshotAt || !when ||
        text(receipt.source_sha256) !== text(snapshot.fonte_sha256) ||
        text(receipt.url) !== text(snapshot.fonte_url) ||
        Date.parse(when) < Date.parse(snapshotAt)) return "frescor_indefinido"
    if (effectiveResult === "vazio_confirmado" && snapshot.resultado === "vazio_confirmado") return "vazio_confirmado"
    if ((effectiveResult === "encontrado" || effectiveResult === "publicado") && snapshot.resultado === "publicado") return "publicado"
    return "indeterminado"
  }
  if (family === "chapa_vice") {
    const snapshot = record(profile.chapa_2026)
    const snapshotAt = parseDate(snapshot?.snapshot_em)
    if (!snapshot || !snapshotAt || !when ||
        text(snapshot.titular_candidato_id) !== profileId(profile) ||
        text(receipt.source_sha256) !== text(snapshot.fonte_sha256) ||
        text(receipt.url) !== text(snapshot.fonte_url) ||
        Date.parse(when) < Date.parse(snapshotAt)) return "frescor_indefinido"
    return effectiveResult === "encontrado" || effectiveResult === "publicado"
      ? "publicado"
      : "indeterminado"
  }
  const maxAge = FRESHNESS_DAYS[family]
  if (maxAge === null) {
    if (!validCoverageSourceProof(profile, family, receipt)) return "frescor_indefinido"
    if (effectiveResult === "vazio_confirmado") return "vazio_confirmado"
    return effectiveResult === "encontrado" || effectiveResult === "publicado" ? "publicado" : "indeterminado"
  }
  if (when && (Date.now() - Date.parse(when)) > maxAge * 86_400_000) return "desatualizado"
  if (effectiveResult === "encontrado" || effectiveResult === "publicado") {
    // Contagem declarada pela Câmara ou Senado não prova persistência,
    // readback nem cobertura do DTO público. Exigir reconciliação por órgão
    // antes de fechar qualquer família parlamentar.
    if (["projetos_lei", "votos_candidato", "gastos_parlamentares"].includes(family)) {
      return validCoverageSourceProof(profile, family, receipt) ? "publicado" : "indeterminado"
    }
    return hasMaterializedData(profile, family) ? "publicado" : "indeterminado"
  }
  if (effectiveResult === "vazio_confirmado") {
    if (["projetos_lei", "votos_candidato", "gastos_parlamentares"].includes(family)) {
      return validCoverageSourceProof(profile, family, receipt) || validExpenseZero(profile, family, receipt) ? "vazio_confirmado" : "indeterminado"
    }
    return "vazio_confirmado"
  }
  return "sem_recibo"
}

function stateFromReceipt(receipt: Receipt | null, profile: CoverageProfile, family: CoverageFamily): CoverageCell["estado"] {
  if (!receipt) return "sem_recibo"
  const stored = record(receipt.__receipts)
  if (!stored) return stateFromSingleReceipt(receipt, profile, family)

  const required = requiredSources(profile, family)
  if (!required.length) return stateFromSingleReceipt(receipt, profile, family)
  const sourceReceipts = required.map((source) => record(stored[source]))
  if (sourceReceipts.some((item) => !item)) return "indeterminado"
  const sourceStates = sourceReceipts.map((item) => stateFromSingleReceipt(item, profile, family))
  if (sourceStates.includes("erro")) return "erro"
  if (sourceStates.includes("indeterminado")) return "indeterminado"
  if (sourceStates.includes("desatualizado")) return "desatualizado"
  if (sourceStates.includes("frescor_indefinido")) return "frescor_indefinido"
  // Duas casas podem ter resultados diferentes. Sem uma prova que atribua
  // cada linha pública à casa/ID correspondente, a união ainda é inconclusiva.
  if (sourceStates.includes("vazio_confirmado") && sourceStates.includes("publicado")) return "indeterminado"
  if (sourceStates.every((state) => state === "vazio_confirmado")) return "vazio_confirmado"
  if (sourceStates.every((state) => state === "publicado")) return "publicado"
  return "indeterminado"
}

function reasonFor(state: CoverageState, receipt: Receipt | null, profile: CoverageProfile, family: CoverageFamily): string {
  if (state === "sem_recibo") return "família aplicável sem recibo de fonte"
  if (state === "desatualizado") return "recibo de fonte fora do prazo de frescor"
  if (state === "frescor_indefinido") return "falta comparar a revisão atual da fonte oficial com o snapshot publicado"
  if (state === "nao_aplicavel") return "regra de aplicabilidade ou recibo explícito"
  if (state === "vazio_confirmado") return "fonte consultada sem registros no escopo"
  if (state === "indeterminado") return "fonte consultada sem conclusão de identidade ou cobertura"
  if (state === "erro") return "recibo ausente, malformado ou com erro de coleta"
  return family === "perfil_atual" ? "recibo de frescor do perfil presente" : "dados e recibo de fonte presentes"
}

type Verdict = { estado: CoverageState; motivo?: string; receipt?: Receipt | null }

const DAILY_PROFILE_CHECKS = ["nome_urna", "partido_sigla", "situacao", "numero_urna"] as const
const OFFICE_BY_CARGO: Record<string, string> = { Governador: "GOVERNADOR", Presidente: "PRESIDENTE", Senador: "SENADOR" }

function officialTseUrl(value: unknown): boolean {
  const raw = text(value)
  if (!raw) return false
  try {
    const url = new URL(raw)
    return url.protocol === "https:" && ["cdn.tse.jus.br", "dadosabertos.tse.jus.br", "divulgacandcontas.tse.jus.br"].includes(url.hostname)
  } catch {
    return false
  }
}

/**
 * Recibo por ficha da auditoria diária. Ele fecha só o que compara:
 * `perfil_atual` exige nome de urna, partido, situação e número iguais ao
 * pacote oficial do dia, o núcleo publicado completo e um recibo datado dos
 * campos curados (biografia, foto); `chapa_vice` exige o vice oficial igual ao
 * publicado. Divergência, identidade diferente ou revisão sem SHA não fecham.
 */
function dailyCheckVerdict(receipt: Receipt, profile: CoverageProfile, family: CoverageFamily): Verdict {
  const detail = record(receipt.daily_check)
  const when = parseDate(receipt.executado_em)
  const result = text(receipt.resultado)
  const version = detail?.contract_version
  if (!detail || (version !== 1 && version !== 2) || detail.kind !== "tse-daily-candidacy-check" || !when) {
    return { estado: "erro", motivo: "recibo da auditoria diária fora do contrato", receipt }
  }
  if (Date.parse(when) > Date.now()) return { estado: "erro", motivo: "recibo da auditoria diária com data futura", receipt }
  if (result === "erro") return { estado: "erro", motivo: "auditoria diária não leu a fonte oficial", receipt }
  // v2 diz se a identidade fechou no pacote oficial; v1 não tinha o campo.
  const matched = record(detail.identity)?.matched
  if (version === 2 && typeof matched !== "boolean") {
    return { estado: "erro", motivo: "recibo da auditoria diária fora do contrato", receipt }
  }
  if (matched === false) return { estado: "indeterminado", motivo: "auditoria diária: identidade não fechou no pacote oficial", receipt }
  const revision = record(detail.source_revision)
  if (!revision || !officialTseUrl(revision.url) || !/^[a-f0-9]{64}$/i.test(text(revision.sha256) ?? "")) {
    return { estado: "erro", motivo: "auditoria diária sem revisão oficial com SHA-256", receipt }
  }
  const identity = record(detail.identity)
  const expectedOffice = OFFICE_BY_CARGO[text(profile.cargo_disputado) ?? ""]
  const expectedUf = text(profile.cargo_disputado) === "Presidente" ? "BR" : text(profile.estado)
  if (!identity || !text(identity.sq_candidato) || text(identity.cargo) !== expectedOffice || text(identity.uf) !== expectedUf) {
    return { estado: "erro", motivo: "auditoria diária comparou candidatura de outro cargo ou UF", receipt }
  }
  if ((Date.now() - Date.parse(when)) > DAILY_CHECK_MAX_AGE_DAYS * 86_400_000) {
    return { estado: "desatualizado", motivo: `auditoria diária há mais de ${DAILY_CHECK_MAX_AGE_DAYS} dias`, receipt }
  }
  // Só recibo encontrado (ou publicado) fecha célula; indeterminado continua aberto.
  if (result !== "encontrado" && result !== "publicado") {
    return { estado: "indeterminado", motivo: `auditoria diária com resultado ${result ?? "ausente"}`, receipt }
  }
  const checks = record(detail.checks) ?? {}
  if (family === "chapa_vice") {
    const chapa = text(checks.chapa_vice)
    const snapshot = record(profile.chapa_2026)
    if (chapa !== "ok") return { estado: "indeterminado", motivo: `auditoria diária: chapa_vice ${chapa ?? "sem resultado"}`, receipt }
    if (!hasMaterializedData(profile, "chapa_vice") || text(snapshot?.titular_candidato_id) !== profileId(profile)) {
      return { estado: "indeterminado", motivo: "chapa conferida pelo TSE, mas a ficha não publica a chapa confirmada deste titular", receipt }
    }
    return { estado: "publicado", motivo: "vice publicado igual ao pacote oficial do dia", receipt }
  }
  const divergent = DAILY_PROFILE_CHECKS.filter((check) => text(checks[check]) !== "ok")
  if (divergent.length) return { estado: "indeterminado", motivo: `auditoria diária divergente ou sem resultado em: ${divergent.join(", ")}`, receipt }
  if (!hasMaterializedData(profile, "perfil_atual")) {
    return { estado: "indeterminado", motivo: "núcleo do perfil incompleto no payload público", receipt }
  }
  const curated = record(profile.section_freshness?.perfil_atual)
  if (!curated || !parseDate(curated.verifiedAt) || !text(curated.sourceLabel)) {
    return { estado: "indeterminado", motivo: "campos oficiais conferidos; falta recibo datado dos campos curados", receipt }
  }
  return { estado: "publicado", motivo: "campos oficiais iguais ao pacote do dia e campos curados com recibo datado", receipt }
}

/**
 * Família guiada por revisão oficial (patrimônio, financiamento, histórico,
 * perfil) fecha com a prova mais recente que ainda confere com o payload
 * público atual, mesmo que haja recibo mais novo sem prova na mesma fonte. Um
 * erro posterior à prova, ou vazio posterior que contradiga ano publicado,
 * reabre a célula. Payload alterado invalida a prova pelo hash.
 */
function provenVerdict(receipt: Receipt | null, profile: CoverageProfile, family: CoverageFamily): Verdict | null {
  if (FRESHNESS_DAYS[family] !== null || requiredSources(profile, family).length) return null
  const proofs = (Array.isArray(receipt?.__proofs) ? receipt.__proofs as Receipt[] : [])
    .filter((item) => ["encontrado", "publicado", "vazio_confirmado"].includes(text(item.resultado) ?? "") && parseDate(item.executado_em) && Date.parse(parseDate(item.executado_em)!) <= Date.now())
    .sort((a, b) => Date.parse(parseDate(b.executado_em)!) - Date.parse(parseDate(a.executado_em)!))
  const proof = proofs.find((item) => validCoverageSourceProof(profile, family, item))
  if (!proof) return null
  // O resultado da prova tem de concordar com o payload: vazio com linha
  // publicada, ou encontrado sem linha publicada, é contradição.
  const publicRows = publicFamilyRowCount(profile, family)
  const provedEmpty = text(proof.resultado) === "vazio_confirmado"
  if (provedEmpty && publicRows !== 0) {
    return { estado: "erro", motivo: `prova de vazio contra ${publicRows} linha(s) publicada(s)`, receipt: proof }
  }
  if (!provedEmpty && publicRows <= 0) {
    return { estado: "erro", motivo: "prova de publicado sem linha no payload público", receipt: proof }
  }
  const provedAt = Date.parse(parseDate(proof.executado_em)!)
  const later = Object.values(record(receipt?.__receipts) ?? {}).map(record)
    .filter((item): item is Receipt => Boolean(item) && Date.parse(parseDate(item!.executado_em) ?? "1970-01-01") > provedAt)
  if (later.some((item) => text(item.resultado) === "erro")) {
    return { estado: "erro", motivo: "erro de coleta posterior à prova de cobertura", receipt: later.find((item) => text(item.resultado) === "erro") }
  }
  const contradiction = later.find((item) => text(item.resultado) === "vazio_confirmado" && hasMaterializedDataInReceiptScope(profile, family, item))
  if (contradiction) return { estado: "erro", motivo: "vazio posterior à prova contradiz ano publicado", receipt: contradiction }
  const years = (Array.isArray(record(proof.coverage_proof)?.source_revisions) ? record(proof.coverage_proof)!.source_revisions as unknown[] : [])
    .map((item) => Number(record(item)?.year)).filter((year) => Number.isInteger(year) && year > 0)
  const suffix = years.length ? ` (anos ${[...new Set(years)].sort().join(", ")})` : ""
  return text(proof.resultado) === "vazio_confirmado"
    ? { estado: "vazio_confirmado", motivo: `prova de cobertura: fonte oficial sem registros no escopo${suffix}`, receipt: proof }
    : { estado: "publicado", motivo: `prova de cobertura: payload público igual à revisão oficial${suffix}`, receipt: proof }
}

function verdictFor(receipt: Receipt | null, profile: CoverageProfile, family: CoverageFamily): Verdict {
  const stored = record(receipt?.__receipts)
  const daily = (family === "perfil_atual" || family === "chapa_vice") ? record(stored?.[DAILY_CHECK_SOURCE]) : null
  if (daily) return dailyCheckVerdict(daily, profile, family)
  const proven = provenVerdict(receipt, profile, family)
  if (proven) return proven
  const estado = stateFromReceipt(receipt, profile, family)
  if (family === "historico_politico" && estado === "frescor_indefinido" && text(receipt?.resultado) === "vazio_confirmado" &&
      currentCycleCandidacyRows(profile).length === 1 && !hasMaterializedDataInReceiptScope(profile, family)) {
    return { estado, motivo: `TSE sem candidatura anterior a ${CURRENT_ELECTION_YEAR}; a única linha pública é a candidatura em curso; falta revisão oficial fixada para certificar o vazio` }
  }
  if (family === "chapa_vice" && estado === "sem_recibo") {
    return { estado, motivo: `chapa sem recibo por ficha; recibos territoriais ou globais não identificam o titular (fonte esperada: ${DAILY_CHECK_SOURCE})` }
  }
  return { estado }
}

export type CoverageException = {
  slug: string
  familia: CoverageFamily
  /** Estado aceito pelo dono; se a célula mudar de estado, a exceção deixa de valer. */
  estado: CoverageState
  motivo: string
  aprovado_por: string
  aprovado_em: string
  /** Obrigatório: exceção sem prazo vira dívida permanente escondida. */
  expira_em: string
  referencia?: string
}

export type CoverageExceptionReport = {
  aplicadas: Array<{ slug: string; familia: CoverageFamily; estado: CoverageState }>
  sem_celula: Array<{ slug: string; familia: string; motivo: string }>
}

const OPEN_STATES: readonly CoverageState[] = ["sem_recibo", "indeterminado", "erro", "desatualizado", "frescor_indefinido"]

/** Prazo máximo de uma exceção: renovar exige nova aprovação datada. */
const EXCEPTION_MAX_DAYS = 90

/**
 * Valida o arquivo de exceções nominais aprovadas pelo dono; erro de formato
 * aborta. Exceção vencida não aborta nem se aplica: a matriz a lista em
 * `exceptions.sem_celula` para o dono renovar ou remover.
 */
export function parseCoverageExceptions(raw: unknown, now = new Date()): CoverageException[] {
  const list = Array.isArray(raw) ? raw : record(raw)?.exceptions
  if (!Array.isArray(list)) throw new Error("--exceptions exige lista ou { exceptions: [] }")
  const seen = new Set<string>()
  return list.map((item, index) => {
    const row = record(item)
    const where = `exceção #${index + 1}`
    if (!row) throw new Error(`${where}: não é objeto`)
    const slug = text(row.slug)
    const familia = text(row.familia) as CoverageFamily | null
    const estado = text(row.estado) as CoverageState | null
    if (!slug || !familia || !COVERAGE_FAMILIES.includes(familia)) throw new Error(`${where}: slug e família válida são obrigatórios`)
    if (!estado || !OPEN_STATES.includes(estado)) throw new Error(`${where}: estado deve ser um estado aberto (${OPEN_STATES.join(", ")})`)
    for (const field of ["motivo", "aprovado_por", "aprovado_em"] as const) {
      if (!text(row[field])) throw new Error(`${where}: ${field} é obrigatório`)
    }
    const approvedAt = parseDate(row.aprovado_em)
    const expiresAt = parseDate(row.expira_em)
    if (!approvedAt) throw new Error(`${where}: aprovado_em inválido (ISO 8601 com fuso)`)
    if (!expiresAt) throw new Error(`${where}: expira_em obrigatório e válido (ISO 8601 com fuso)`)
    if (Date.parse(approvedAt) > now.getTime()) throw new Error(`${where}: aprovado_em no futuro`)
    if (Date.parse(expiresAt) <= Date.parse(approvedAt)) throw new Error(`${where}: expira_em deve ser depois de aprovado_em`)
    if (Date.parse(expiresAt) > Date.parse(approvedAt) + EXCEPTION_MAX_DAYS * 86_400_000) {
      throw new Error(`${where}: expira_em passa de ${EXCEPTION_MAX_DAYS} dias após aprovado_em`)
    }
    const key = `${slug}|${familia}`
    if (seen.has(key)) throw new Error(`${where}: exceção duplicada para ${key}`)
    seen.add(key)
    return {
      slug, familia, estado,
      motivo: text(row.motivo)!, aprovado_por: text(row.aprovado_por)!, aprovado_em: text(row.aprovado_em)!,
      expira_em: text(row.expira_em)!,
      ...(text(row.referencia) ? { referencia: text(row.referencia)! } : {}),
    }
  })
}

function makeCell(profile: CoverageProfile, family: CoverageFamily, joins: CoverageReceiptJoin, profileError?: string): CoverageCell {
  const slug = text(profile.slug) ?? "<sem-slug>"
  // A failed profile read cannot establish either the data or the rule of
  // applicability. Keep every family as an errored, applicable cell instead
  // of manufacturing `nao_aplicavel` from missing fields.
  const applicableCell = profileError ? true : applicable(profile, family)
  const joined = receiptFor(profile, family, joins)
  const verdict: Verdict = !applicableCell
      ? { estado: "nao_aplicavel" }
      : profileError
      ? { estado: "erro" }
      : verdictFor(joined, profile, family)
  const state = verdict.estado
  const receipt = verdict.receipt ?? joined
  const explicitReason = !applicableCell
    ? "regra escrita: família não se aplica ao cargo ou ao histórico federal do candidato"
    : profileError
      ? `perfil não respondeu: ${profileError}`
      : verdict.motivo ?? reasonFor(state, receipt, profile, family)
  return {
    slug,
    familia: family,
    aplicavel: applicableCell,
    estado: state,
    motivo: explicitReason,
    verificado_em: parseDate(receipt?.verifiedAt) ?? parseDate(receipt?.verificado_em) ?? parseDate(receipt?.executado_em) ?? parseDate(receipt?.coletado_em),
    fonte: text(receipt?.sourceLabel) ?? text(receipt?.fonte) ?? text(receipt?.fonte_url),
    escopo: text(receipt?.scope) ?? text(receipt?.escopo),
    origem_recibo: profileError ? "perfil_indisponivel"
      : joins[slug]?.[family] ? "coleta_log"
      : joined ? "badge_publico"
      : "nenhum",
  }
}

export function buildCoverageMatrix(
  profiles: CoverageProfile[],
  profileErrors: Array<{ slug: string; error: string }> = [],
  joins: CoverageReceiptJoin = {},
  exceptions: CoverageException[] = [],
  now = new Date(),
): CoverageMatrix {
  const errors = new Map(profileErrors.map((item) => [item.slug, item.error]))
  const erroredProfiles = profileErrors.map((item) => ({ slug: item.slug } satisfies CoverageProfile))
  const cells = [...profiles, ...erroredProfiles].flatMap((profile) => COVERAGE_FAMILIES.map((family) => makeCell(profile, family, joins, errors.get(text(profile.slug) ?? ""))))
  const exceptionReport: CoverageExceptionReport = { aplicadas: [], sem_celula: [] }
  const byKey = new Map(cells.map((cell) => [`${cell.slug}|${cell.familia}`, cell]))
  for (const exception of exceptions) {
    const cell = byKey.get(`${exception.slug}|${exception.familia}`)
    if (Date.parse(exception.expira_em) <= now.getTime()) {
      exceptionReport.sem_celula.push({ slug: exception.slug, familia: exception.familia, motivo: `exceção expirada em ${exception.expira_em}` })
    } else if (!cell || !cell.aplicavel) {
      exceptionReport.sem_celula.push({ slug: exception.slug, familia: exception.familia, motivo: "célula aplicável não existe nesta coorte" })
    } else if (cell.estado !== exception.estado) {
      exceptionReport.sem_celula.push({ slug: exception.slug, familia: exception.familia, motivo: `estado atual ${cell.estado} difere do aprovado ${exception.estado}` })
    } else {
      cell.excecao = { motivo: exception.motivo, aprovado_por: exception.aprovado_por, aprovado_em: exception.aprovado_em, ...(exception.referencia ? { referencia: exception.referencia } : {}) }
      exceptionReport.aplicadas.push({ slug: cell.slug, familia: cell.familia, estado: cell.estado })
    }
  }
  const summary = Object.fromEntries(COVERAGE_FAMILIES.map((family) => {
    const counts = Object.fromEntries(STATES.map((state) => [state, 0])) as Record<CoverageState, number>
    for (const cell of cells) if (cell.familia === family) counts[cell.estado] += 1
    return [family, counts]
  })) as Record<CoverageFamily, Record<CoverageState, number>>
  return {
    generated_at: new Date().toISOString(),
    requested_profiles: profiles.length + profileErrors.length,
    completed_profiles: profiles.length,
    families: COVERAGE_FAMILIES,
    cells,
    summary,
    profile_errors: profileErrors,
    exceptions: exceptionReport,
  }
}

/**
 * Decisão do gate `sem-recibo`. Em enforce, perfil não lido também reprova:
 * célula em erro de leitura não prova nada e esconderia ausência de recibo.
 */
export function coverageGateFailure(matrix: CoverageMatrix, mode: "warn" | "enforce"): string | null {
  if (matrix.completed_profiles === 0) return "gate de cobertura sem nenhum perfil público lido"
  if (mode !== "enforce") return null
  if (matrix.profile_errors.length > 0) return `gate de cobertura: ${matrix.profile_errors.length} perfil(is) público(s) não lido(s)`
  const missing = missingReceiptCells(matrix)
  return missing.length > 0 ? `gate de cobertura: ${missing.length} célula(s) aplicável(is) sem recibo` : null
}

/** Células aplicáveis ainda abertas e sem exceção nominal aprovada. */
export function blockingCells(matrix: CoverageMatrix): CoverageCell[] {
  return matrix.cells.filter((cell) => cell.aplicavel && OPEN_STATES.includes(cell.estado) && !cell.excecao)
}

/**
 * Nota sobre cota parlamentar com duas casas (mandato na Câmara e no Senado):
 * a célula é uma só, e um recibo de coleta_log de qualquer das casas já a tira
 * deste gate (origem coleta_log). Se a outra casa ficou sem recibo, isso aparece
 * no estado da célula (indeterminado), não aqui.
 *
 * Gate de CI: família aplicável sem nenhuma linha de coleta_log por candidato
 * (o piso da régua). O selo de frescor do payload público não conta como
 * recibo, e perfil que não respondeu fica fora (é erro de leitura, não prova
 * de ausência).
 */
export function missingReceiptCells(matrix: CoverageMatrix): CoverageCell[] {
  return matrix.cells.filter((cell) => cell.aplicavel && !cell.excecao &&
    (cell.origem_recibo === "nenhum" || cell.origem_recibo === "badge_publico"))
}

export async function fetchPublicProfiles(
  baseUrl: string,
  fetcher: typeof fetch = fetch,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<{ profiles: CoverageProfile[]; errors: Array<{ slug: string; error: string }> }> {
  const slugResponse = await fetcher(`${baseUrl.replace(/\/$/, "")}/api/candidato-slugs`, { headers: { accept: "application/json" } })
  if (!slugResponse.ok) throw new Error(`/api/candidato-slugs HTTP ${slugResponse.status}`)
  const body = await slugResponse.json() as { slugs?: unknown }
  if (!Array.isArray(body.slugs) || body.slugs.some((slug) => typeof slug !== "string")) throw new Error("/api/candidato-slugs não retornou lista válida")
  if (!body.slugs.length || new Set(body.slugs).size !== body.slugs.length || body.slugs.some((slug) => !slug.trim())) {
    throw new Error("/api/candidato-slugs retornou coorte vazia, duplicada ou inválida")
  }
  const profiles: CoverageProfile[] = []
  const errors: Array<{ slug: string; error: string }> = []
  for (const slug of body.slugs as string[]) {
    try {
      const url = `${baseUrl.replace(/\/$/, "")}/api/candidato-profile/${encodeURIComponent(slug)}`
      let response = await fetcher(url, { headers: { accept: "application/json" } })
      // A rota pública limita por IP; 429 é espera, não ausência (mesma
      // cadência do aplicador de recibos).
      for (let attempt = 1; response.status === 429 && attempt <= 5; attempt++) {
        await sleep(5_000 * attempt)
        response = await fetcher(url, { headers: { accept: "application/json" } })
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const envelope = await response.json() as { data?: unknown; sourceStatus?: unknown }
      if (envelope.sourceStatus !== "live") throw new Error(`perfil não publicado: ${String(envelope.sourceStatus)}`)
      const profile = record(envelope.data) ?? record(envelope)
      if (!profile) throw new Error("payload de perfil inválido")
      if (profile.slug !== slug) throw new Error("identidade do perfil diverge do slug solicitado")
      profiles.push(profile as CoverageProfile)
    } catch (error) {
      errors.push({ slug, error: error instanceof Error ? error.message : String(error) })
    }
    // The public profile route is IP-rate-limited. Mirror the existing audit's
    // serial cadence instead of turning 429 into a false absence.
    await sleep(250)
  }
  return { profiles, errors }
}

function parseArgs(args: string[]) {
  const value = (prefix: string) => args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null
  return {
    baseUrl: value("--base-url=") ?? "https://puxaficha.com.br",
    input: value("--input="),
    receipts: value("--receipts="),
    receiptsExtra: args.filter((arg) => arg.startsWith("--receipts-extra=")).map((arg) => arg.slice("--receipts-extra=".length)),
    out: value("--out="),
    strict: args.includes("--strict"),
    exceptions: value("--exceptions="),
    gate: value("--gate="),
    mode: value("--mode=") ?? "enforce",
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const fetched = options.input
    ? { profiles: JSON.parse(await readFile(path.resolve(options.input), "utf8")) as CoverageProfile[], errors: [] }
    : await fetchPublicProfiles(options.baseUrl)
  let joins: CoverageReceiptJoin = {}
  let rejectedReceipts: ReceiptAdapterResult["rejected"] = []
  let ignoredPartialReceipts = 0
  const receiptPaths = [options.receipts, ...options.receiptsExtra].filter((item): item is string => Boolean(item))
  if (receiptPaths.length) {
    const loaded = await Promise.all(receiptPaths.map(async (file) => JSON.parse(await readFile(path.resolve(file), "utf8")) as unknown))
    const rowGroups = loaded.map((raw) => Array.isArray(raw)
      ? raw as LatestReceiptRow[]
      : Array.isArray(record(raw)?.rows) ? record(raw)?.rows as LatestReceiptRow[]
        : Array.isArray(record(raw)?.receipts) ? record(raw)?.receipts as LatestReceiptRow[] : null)
    if (rowGroups.every((rows) => rows !== null)) {
      const adapted = adaptLatestReceipts(rowGroups.flatMap((rows) => rows ?? []), fetched.profiles)
      joins = adapted.joins
      rejectedReceipts = adapted.rejected
      ignoredPartialReceipts = adapted.ignored_partial_receipts
    } else {
      // Joins pré-montados não passam pelo adaptador (sem validação de
      // candidato, escopo e contrato); só linhas de coleta_log entram.
      throw new Error("--receipts e --receipts-extra exigem lista, rows[] ou receipts[] de coleta_log")
    }
  }
  const exceptions = options.exceptions
    ? parseCoverageExceptions(JSON.parse(await readFile(path.resolve(options.exceptions), "utf8")) as unknown)
    : []
  const matrix = buildCoverageMatrix(fetched.profiles, fetched.errors, joins, exceptions)
  if (options.out) {
    const outputPath = path.resolve(options.out)
    await writeFile(outputPath, `${JSON.stringify(matrix, null, 2)}\n`, { encoding: "utf8", mode: 0o600 })
    await chmod(outputPath, 0o600)
  }
  const totals = Object.fromEntries(COVERAGE_FAMILIES.map((family) => [family, matrix.summary[family]]))
  console.log(JSON.stringify({
    generated_at: matrix.generated_at, requested_profiles: matrix.requested_profiles, completed_profiles: matrix.completed_profiles,
    profile_errors: matrix.profile_errors.length, rejected_receipts: rejectedReceipts.length, ignored_partial_receipts: ignoredPartialReceipts,
    exceptions_applied: matrix.exceptions?.aplicadas.length ?? 0, exceptions_without_cell: matrix.exceptions?.sem_celula ?? [],
    totals,
  }, null, 2))
  if (options.gate !== null) {
    if (options.gate !== "sem-recibo") throw new Error(`--gate desconhecido: ${options.gate}`)
    if (options.mode !== "warn" && options.mode !== "enforce") throw new Error("--mode deve ser warn ou enforce")
    if (matrix.completed_profiles === 0) throw new Error("gate de cobertura sem nenhum perfil público lido")
    const missing = missingReceiptCells(matrix)
    const annotation = options.mode === "warn" ? "::warning::" : "::error::"
    for (const cell of missing.slice(0, 50)) console.log(`${annotation}gate de cobertura: ${cell.slug} sem recibo em ${cell.familia}`)
    if (matrix.profile_errors.length) console.log(`::warning::gate de cobertura: ${matrix.profile_errors.length} perfil(is) não lido(s); células ficam em erro, não em sem_recibo`)
    const slugs = [...new Set(missing.map((cell) => cell.slug))].sort()
    console.log(`GATE_SEM_RECIBO mode=${options.mode} cells=${missing.length} profiles=${slugs.length}`)
    if (slugs.length) console.log(`GATE_SEM_RECIBO_SLUGS ${slugs.join(",")}`)
    const failure = coverageGateFailure(matrix, options.mode)
    if (failure) throw new Error(failure)
  }
  const blocking = blockingCells(matrix)
  if (options.strict && blocking.length > 0) {
    throw new Error(`células aplicáveis sem fechamento: ${blocking.length}`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})

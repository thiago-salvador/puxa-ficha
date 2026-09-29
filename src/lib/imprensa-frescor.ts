import freshnessCatalog from "../../scripts/data/data-freshness-sources.json"
import { IMPRENSA_DATA_BUCKETS, imprensaDataBucket, type ImprensaDataBucket } from "@/lib/imprensa-facts"
import type { ImprensaPageRow } from "@/lib/imprensa-cache"

/**
 * Como coletamos: uma linha por fonte usada nas fichas, com a última coleta
 * bem-sucedida registrada e a situação dela contra o prazo do catálogo de
 * frescor (`scripts/data/data-freshness-sources.json`). Puro: o servidor só
 * entrega a data da última coleta bem-sucedida de cada fonte.
 */

export type MethodSituacao = "em_dia" | "atrasada" | "sem_registro"

export interface MethodSource {
  /** `source_id` no catálogo de frescor. */
  id: string
  label: string
  traz: string
  authorityUrl: string
  cadence: string
  /** Prazo do catálogo entre duas coletas; null quando o catálogo não define. */
  maxAgeHours: number | null
  /** Fontes de `coleta_log_ultima` que contam como coleta desta linha. */
  receiptSources: readonly string[]
}

export interface MethodSourceRow {
  source: MethodSource
  situacao: MethodSituacao
  ultimaColeta: string | null
}

type CatalogEntry = (typeof freshnessCatalog)[number]

function catalogEntry(sourceId: string): CatalogEntry {
  const entry = freshnessCatalog.find((item) => item.source_id === sourceId)
  if (!entry) throw new Error(`Fonte ausente do catálogo de frescor: ${sourceId}`)
  return entry
}

function fromCatalog(sourceId: string, label: string, traz: string, authorityUrl?: string): MethodSource {
  const entry = catalogEntry(sourceId)
  return {
    id: sourceId,
    label,
    traz,
    authorityUrl: authorityUrl ?? entry.authority_url,
    cadence: entry.cadence,
    maxAgeHours: typeof entry.max_age_hours === "number" && entry.max_age_hours > 0 ? entry.max_age_hours : null,
    receiptSources: [...entry.collection_source_ids],
  }
}

/**
 * Fontes das fichas na ordem da página. Cada uma existe no catálogo de frescor
 * e na lista pública de fontes (`src/data/methodology-sources.ts`), exceto a
 * busca judicial, que o catálogo registra como `processos-judiciais`.
 */
export const IMPRENSA_METHOD_SOURCES: readonly MethodSource[] = [
  fromCatalog("tse-current", "TSE", "Candidaturas, situação do registro, bens declarados, vice e suplentes."),
  fromCatalog("processos-judiciais", "DJEN e DataJud", "Processos em que o nome do candidato aparece, com link do tribunal."),
  fromCatalog("transparencia-sanctions", "CGU: cadastros de sanções", "Registros no CEIS, CNEP e CEAF, consultados pelo CPF."),
  fromCatalog("tcu", "TCU", "Processos e julgamentos do Tribunal de Contas da União."),
  fromCatalog("camara", "Câmara dos Deputados", "Votações, projetos e mandato de quem é ou foi deputado federal."),
  fromCatalog("camara-cotas", "Câmara: cota parlamentar", "Gastos da cota parlamentar dos deputados federais, por ano."),
  fromCatalog("senado", "Senado Federal", "Votações, projetos e mandato de quem é ou foi senador."),
  fromCatalog("ceaps-senado", "Senado: cota parlamentar", "Gastos da cota parlamentar dos senadores, por ano."),
  fromCatalog("transparencia", "Portal da Transparência", "Gastos públicos, como os totais do cartão corporativo por órgão."),
]

const CADENCE_LABELS: Record<string, string> = {
  daily: "Diária",
  weekly: "Semanal",
  monthly: "Mensal",
  on_demand: "Sob demanda",
  electoral_cycle: "A cada eleição",
}

export function methodCadenceLabel(cadence: string): string {
  return CADENCE_LABELS[cadence] ?? "Sem ritmo definido"
}

/** "Em dia até 9 dias depois da coleta." Dias quando o prazo é inteiro em dias. */
export function methodDeadlineLabel(maxAgeHours: number | null): string | null {
  if (maxAgeHours === null) return null
  const span = maxAgeHours % 24 === 0
    ? `${maxAgeHours / 24} ${maxAgeHours === 24 ? "dia" : "dias"}`
    : `${maxAgeHours} horas`
  return `Em dia até ${span} depois da coleta.`
}

export const METHOD_SITUACAO_LABELS: Record<MethodSituacao, string> = {
  em_dia: "Em dia",
  atrasada: "Atrasada",
  sem_registro: "Sem registro de coleta",
}

function validDate(value: string | null | undefined): string | null {
  return value && Number.isFinite(Date.parse(value)) ? value : null
}

/**
 * Sem coleta bem-sucedida registrada: "sem_registro". Com coleta e prazo no
 * catálogo: "em_dia" até o prazo, "atrasada" depois. Sem prazo no catálogo a
 * fonte nunca é dada como em dia; por isso toda fonte da lista tem prazo (teste).
 */
export function buildMethodSourceRow(source: MethodSource, latestSuccessAt: string | null, now: string): MethodSourceRow {
  const ultimaColeta = validDate(latestSuccessAt)
  if (!ultimaColeta) return { source, situacao: "sem_registro", ultimaColeta: null }
  const ageHours = (Date.parse(now) - Date.parse(ultimaColeta)) / 3_600_000
  const late = source.maxAgeHours === null || !Number.isFinite(ageHours) || ageHours > source.maxAgeHours
  return { source, situacao: late ? "atrasada" : "em_dia", ultimaColeta }
}

export function buildMethodSourceRows(
  latestBySource: Readonly<Record<string, string | null>>,
  now: string,
  sources: readonly MethodSource[] = IMPRENSA_METHOD_SOURCES,
): MethodSourceRow[] {
  return sources.map((source) => buildMethodSourceRow(source, latestBySource[source.id] ?? null, now))
}

// ---------------------------------------------------------------------------
// Quadro dos quatro estados do dado, por tipo de dado.
// ---------------------------------------------------------------------------

export type MethodStateRowInput = Pick<ImprensaPageRow, "patrimonio" | "processos" | "sancoes" | "tcu" | "sites">

export interface MethodStateBoardRow {
  id: "patrimonio" | "processos" | "sancoes" | "tcu" | "sites"
  label: string
  counts: Record<ImprensaDataBucket, number>
}

const BOARD_FIELDS: ReadonlyArray<{ id: MethodStateBoardRow["id"]; label: string; state: (row: MethodStateRowInput) => string }> = [
  { id: "patrimonio", label: "Patrimônio declarado", state: (row) => row.patrimonio.estado },
  { id: "processos", label: "Processos", state: (row) => row.processos.estado },
  { id: "sancoes", label: "Sanções da CGU", state: (row) => row.sancoes.estado },
  { id: "tcu", label: "TCU", state: (row) => row.tcu.estado },
  { id: "sites", label: "Sites de campanha", state: (row) => row.sites.estado },
]

function emptyCounts(): Record<ImprensaDataBucket, number> {
  return Object.fromEntries(IMPRENSA_DATA_BUCKETS.map((bucket) => [bucket.id, 0])) as Record<ImprensaDataBucket, number>
}

/** Contagem de candidatos por estado do dado, com os mesmos quatro grupos da seção. */
export function computeMethodStateBoard(rows: readonly MethodStateRowInput[]): MethodStateBoardRow[] {
  return BOARD_FIELDS.map((field) => {
    const counts = emptyCounts()
    for (const row of rows) {
      const bucket = imprensaDataBucket(field.state(row))
      if (bucket) counts[bucket] += 1
    }
    return { id: field.id, label: field.label, counts }
  })
}

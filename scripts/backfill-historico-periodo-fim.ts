/**
 * Backfill periodo_fim for historico_politico mandatos.
 *
 * Usage: npx tsx scripts/backfill-historico-periodo-fim.ts [--apply]
 * Default: dry-run. With --apply: writes to DB.
 * Generates data/manual-review-periodo-fim.csv for manual queue.
 */
import { pathToFileURL } from "node:url"
import { writeFileSync } from "fs"
import { resolve } from "path"
import { supabase } from "./lib/supabase"
import { escreverAuditado } from "./lib/escrita-auditada"
import { log, warn } from "./lib/logger"

const ELECTIVE_CARGOS = new Set([
  "Presidente", "Vice-Presidente", "Governador", "Vice-Governador",
  "Senador", "Deputado Federal", "Deputado Estadual", "Deputado Distrital",
  "Prefeito", "Vice-Prefeito", "Vereador",
])

const INCOMPATIBILITY: Record<string, string[]> = {
  Presidente: ["Vice-Presidente", "Governador", "Vice-Governador", "Senador", "Deputado Federal", "Deputado Estadual", "Deputado Distrital", "Prefeito", "Vice-Prefeito", "Vereador"],
  "Vice-Presidente": ["Governador", "Vice-Governador", "Senador", "Deputado Federal", "Deputado Estadual", "Deputado Distrital", "Prefeito", "Vice-Prefeito", "Vereador"],
  Governador: ["Deputado Federal", "Deputado Estadual", "Deputado Distrital", "Vereador", "Prefeito", "Vice-Prefeito"],
  "Vice-Governador": ["Deputado Federal", "Deputado Estadual", "Deputado Distrital", "Vereador", "Prefeito", "Vice-Prefeito"],
  Senador: ["Deputado Federal", "Deputado Estadual", "Deputado Distrital", "Vereador"],
  Prefeito: ["Deputado Estadual", "Deputado Distrital", "Vereador"],
  "Deputado Federal": ["Deputado Estadual", "Deputado Distrital", "Vereador"],
  "Deputado Estadual": ["Vereador"],
  "Deputado Distrital": ["Vereador"],
}

export const MAX_DURATION: Record<string, number> = {
  Presidente: 4, "Vice-Presidente": 4,
  Governador: 4, "Vice-Governador": 4,
  Prefeito: 4, "Vice-Prefeito": 4,
  Senador: 8,
  "Deputado Federal": 4, "Deputado Estadual": 4, "Deputado Distrital": 4,
  Vereador: 4,
}

/**
 * CF art. 14, paragrafo 6: Presidente, Governador e Prefeito que queiram
 * concorrer a OUTRO cargo precisam renunciar ate seis meses antes do pleito.
 * So esses tres. Vices nao renunciam para disputar outro cargo, e no
 * Legislativo tambem nao ha renuncia: perder uma eleicao no meio do mandato
 * nao interrompe o mandato de deputado ou vereador.
 */
const RESIGN_TO_RUN_CARGOS = new Set(["Presidente", "Governador", "Prefeito"])

/** Ano de referencia do "hoje" usado para decidir se um mandato ja terminou. */
export const REFERENCE_YEAR = 2026
/** Mandatos iniciados a partir daqui podem estar em curso; nao se fecha por teto. */
const ONGOING_CUTOFF_YEAR = 2022

export interface HistoricoRow {
  id: string
  candidato_id: string
  slug: string
  cargo_canonico: string
  periodo_inicio: number
  periodo_fim: number | null
  observacoes: string | null
  /** "mandato" | "candidatura" | null. Ausente ou null e tratado como mandato. */
  tipo_evento?: string | null
}

export interface BackfillChange {
  id: string
  slug: string
  cargo: string
  inicio: number
  newFim: number
  reason: string
}

export interface BackfillResult {
  totalRows: number
  openRows: number
  autoQueueSize: number
  manualQueueSize: number
  changes: BackfillChange[]
  applied: number
  errors: number
  manualCsvRows: string[]
}

export interface BackfillDeps {
  apply: boolean
  fetchRows: () => Promise<HistoricoRow[]>
  updateRow: (id: string, periodoFim: number) => Promise<void>
  writeCSV?: (path: string, content: string) => void
  log: (message: string) => void
  warn: (message: string) => void
  /** Ano de "hoje" para decidir se o mandato ja terminou. Default REFERENCE_YEAR. */
  referenceYear?: number
}

export function isAutoSource(obs: string | null): boolean {
  if (!obs) return false
  return obs.includes("(TSE ") || obs.includes("Wikidata")
}

export function closesMandate(newCargo: string, existingCargo: string): boolean {
  if (newCargo === existingCargo) return true
  return INCOMPATIBILITY[newCargo]?.includes(existingCargo) ?? false
}

/** Linhas sem tipo_evento sao tratadas como mandato (era o default do schema). */
export function eventKind(row: Pick<HistoricoRow, "tipo_evento">): string {
  return row.tipo_evento ?? "mandato"
}

/** So mandatos recebem periodo_fim. Candidatura e evento pontual, nao mandato. */
export function isBackfillTarget(row: Pick<HistoricoRow, "tipo_evento">): boolean {
  return eventKind(row) === "mandato"
}

/**
 * Uma candidatura posterior so encerra o mandato anterior no caso do art. 14,
 * paragrafo 6: quem esta em mandato de Presidente, Governador ou Prefeito e
 * registra candidatura a cargo DIFERENTE teve de renunciar. Reeleicao (mesmo
 * cargo) nao encerra nada.
 */
export function candidaturaClosesMandate(recordCargo: string, candidaturaCargo: string | null): boolean {
  if (!candidaturaCargo) return false
  if (!RESIGN_TO_RUN_CARGOS.has(recordCargo)) return false
  return candidaturaCargo !== recordCargo
}

export interface CloserHit {
  ano: number
  reason: string
}

/**
 * Primeiro evento posterior que encerra o mandato de `record`, varrendo a
 * linha do tempo do candidato em ordem crescente de periodo_inicio.
 */
export function findCloser(record: HistoricoRow, sorted: HistoricoRow[]): CloserHit | null {
  for (const other of sorted) {
    if (other.id === record.id) continue
    if (other.periodo_inicio <= record.periodo_inicio) continue

    if (eventKind(other) === "candidatura") {
      if (candidaturaClosesMandate(record.cargo_canonico, other.cargo_canonico)) {
        return {
          ano: other.periodo_inicio,
          reason: `closed by candidatura ${other.cargo_canonico} (${other.periodo_inicio}), desincompatibilizacao`,
        }
      }
      continue
    }

    if (other.cargo_canonico === record.cargo_canonico) {
      return {
        ano: other.periodo_inicio,
        reason: `closed by later ${record.cargo_canonico} (${other.periodo_inicio})`,
      }
    }

    if (
      ELECTIVE_CARGOS.has(record.cargo_canonico) &&
      ELECTIVE_CARGOS.has(other.cargo_canonico) &&
      closesMandate(other.cargo_canonico, record.cargo_canonico)
    ) {
      return {
        ano: other.periodo_inicio,
        reason: `closed by ${other.cargo_canonico} (${other.periodo_inicio})`,
      }
    }
  }
  return null
}

/**
 * Regra corrigida (bug V4): o teto de duracao do cargo vence a proximidade.
 * Antes, qualquer evento posterior fechava o mandato no ano dele, por mais
 * distante que fosse, e o teto so era consultado quando nao havia evento
 * nenhum. Era assim que saiam periodos como "Prefeito 2000-2020".
 */
export function resolvePeriodoFim(
  record: HistoricoRow,
  sorted: HistoricoRow[],
  referenceYear: number = REFERENCE_YEAR
): CloserHit | null {
  const maxDur = MAX_DURATION[record.cargo_canonico]
  const cap = maxDur === undefined ? null : record.periodo_inicio + maxDur
  const closer = findCloser(record, sorted)

  if (closer && (cap === null || closer.ano <= cap)) return closer

  const mandateIsOver =
    maxDur !== undefined &&
    record.periodo_inicio < ONGOING_CUTOFF_YEAR &&
    referenceYear - record.periodo_inicio > maxDur

  if (cap !== null && mandateIsOver) {
    return {
      ano: cap,
      reason: closer
        ? `max duration ${maxDur}yr cap (${record.cargo_canonico}, started ${record.periodo_inicio}); ` +
          `proximity closer at ${closer.ano} exceeds the cap`
        : `max duration ${maxDur}yr (${record.cargo_canonico}, started ${record.periodo_inicio})`,
    }
  }

  return null
}

export async function runBackfillHistoricoPeriodoFim(deps: BackfillDeps): Promise<BackfillResult> {
  const { apply, fetchRows, updateRow, log: logFn, warn: warnFn } = deps

  logFn(`Mode: ${apply ? "APPLY" : "DRY-RUN"}`)

  const rows = await fetchRows()
  // Candidaturas entram no fetch para servir de contexto na linha do tempo,
  // mas nunca sao alvo de backfill nem entram nas filas de revisao.
  const backfillable = rows.filter(isBackfillTarget)
  const openRows = backfillable.filter((r) => r.periodo_fim === null)
  const autoQueue = openRows.filter((r) => isAutoSource(r.observacoes))
  const manualQueue = openRows.filter((r) => !isAutoSource(r.observacoes))

  logFn(`Total rows: ${rows.length}, mandatos: ${backfillable.length}, open: ${openRows.length}`)
  logFn(`AUTO queue (TSE+Wikidata): ${autoQueue.length}`)
  logFn(`MANUAL queue (to CSV): ${manualQueue.length}`)

  const csvHeader = "id,slug,cargo_canonico,periodo_inicio,periodo_fim,observacoes"
  const csvDataRows = manualQueue.map((r) =>
    `${r.id},${r.slug},${r.cargo_canonico},${r.periodo_inicio},${r.periodo_fim ?? ""},${(r.observacoes ?? "").replace(/,/g, ";")}`
  )
  const manualCsvRows = [csvHeader, ...csvDataRows]

  if (deps.writeCSV) {
    deps.writeCSV("manual-review-periodo-fim.csv", manualCsvRows.join("\n"))
  }

  const byCandidato = new Map<string, HistoricoRow[]>()
  for (const row of rows) {
    const candidateRows = byCandidato.get(row.candidato_id) ?? []
    candidateRows.push(row)
    byCandidato.set(row.candidato_id, candidateRows)
  }

  const changes: BackfillChange[] = []
  const autoIds = new Set(autoQueue.map((r) => r.id))

  for (const candidateRows of byCandidato.values()) {
    const autoRecords = candidateRows.filter((r) => autoIds.has(r.id))
    if (autoRecords.length === 0) continue

    const sorted = [...candidateRows].sort((a, b) => a.periodo_inicio - b.periodo_inicio)

    for (const record of autoRecords) {
      if (record.periodo_fim !== null) continue

      const resolved = resolvePeriodoFim(record, sorted, deps.referenceYear)
      if (!resolved) continue

      changes.push({
        id: record.id,
        slug: record.slug,
        cargo: record.cargo_canonico,
        inicio: record.periodo_inicio,
        newFim: resolved.ano,
        reason: resolved.reason,
      })
    }
  }

  logFn(`Changes proposed: ${changes.length}`)
  for (const change of changes) {
    logFn(`  ${change.slug}: ${change.cargo} ${change.inicio} -> fim=${change.newFim} (${change.reason})`)
  }

  let applied = 0
  let errors = 0
  if (apply && changes.length > 0) {
    for (const change of changes) {
      try {
        await updateRow(change.id, change.newFim)
        applied++
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        warnFn(`Failed ${change.slug} ${change.cargo} ${change.inicio}: ${message}`)
        errors++
      }
    }
    logFn(`Applied: ${applied}, errors: ${errors}`)
  } else if (!apply) {
    logFn("Dry-run complete. Use --apply to execute.")
  }

  return {
    totalRows: rows.length,
    openRows: openRows.length,
    autoQueueSize: autoQueue.length,
    manualQueueSize: manualQueue.length,
    changes,
    applied,
    errors,
    manualCsvRows,
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface SupabaseLikeClient {
  from(table: string): any
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Guarda para quem monta as deps sem dizer como escrever.
 *
 * A única escrita de produção deste arquivo mora dentro de `escreverAuditado()`
 * em `main()`, e não aqui. Isso não é estilo: uma cadeia de UPDATE solta neste
 * módulo seria uma segunda porta para escrever em `historico_politico` sem
 * trilha, e o gate da issue #131 (`scripts/audit/check-escrita-auditada.ts`)
 * acusaria o arquivo com razão. Quem quiser escrever declara como.
 */
async function escritaNaoInjetada(): Promise<never> {
  throw new Error(
    "backfill-periodo-fim: updateRow não foi injetado. A escrita de produção passa por " +
      "escreverAuditado() em main(); um teste que queira escrever injeta o próprio updateRow.",
  )
}

export function createBackfillDepsFromClient(
  client: SupabaseLikeClient,
  options: {
    apply: boolean
    logFn?: (msg: string) => void
    warnFn?: (msg: string) => void
    /** Como escrever. Sem isto, escrever é erro alto, nunca escrita sem trilha. */
    updateRow?: BackfillDeps["updateRow"]
  }
): BackfillDeps {
  return {
    apply: options.apply,
    async fetchRows() {
      // Sem filtro por tipo_evento de proposito. `.eq("tipo_evento","mandato")`
      // escondia (a) candidaturas intermediarias, que sao contexto para fechar
      // o mandato anterior, e (b) linhas com tipo_evento NULL, que em producao
      // incluem periodo de mandato real. O recorte de quem recebe periodo_fim
      // passou para isBackfillTarget(), no nivel do algoritmo.
      const { data: allRows, error: queryErr } = await client
        .from("historico_politico")
        .select(
          "id, candidato_id, cargo_canonico, periodo_inicio, periodo_fim, observacoes, tipo_evento, candidatos!inner(slug)"
        )
        .not("periodo_inicio", "is", null)
        .order("periodo_inicio", { ascending: true })

      if (queryErr || !allRows) {
        throw new Error(`Query failed: ${queryErr?.message}`)
      }

      return allRows.map((row: Record<string, unknown>) => ({
        id: row.id as string,
        candidato_id: row.candidato_id as string,
        slug: ((row.candidatos as Record<string, unknown>)?.slug ?? "unknown") as string,
        cargo_canonico: row.cargo_canonico as string,
        periodo_inicio: row.periodo_inicio as number,
        periodo_fim: row.periodo_fim as number | null,
        observacoes: row.observacoes as string | null,
        tipo_evento: (row.tipo_evento ?? null) as string | null,
      }))
    },
    updateRow: options.updateRow ?? escritaNaoInjetada,
    log: options.logFn ?? (() => {}),
    warn: options.warnFn ?? (() => {}),
  }
}

const SRC = "backfill-periodo-fim"

async function main() {
  const apply = process.argv.includes("--apply")
  const deps = createBackfillDepsFromClient(supabase, {
    apply,
    logFn: (msg) => log(SRC, msg),
    warnFn: (msg) => warn(SRC, msg),
    // Uma linha de trilha por registro fechado, e não uma por rodada: cada
    // periodo_fim aqui é uma dedução própria (qual evento fechou o mandato), e
    // é isso que alguém vai querer conferir daqui a seis meses.
    updateRow: async (id, periodoFim) => {
      await escreverAuditado(
        {
          script: SRC,
          tabela: "historico_politico",
          motivo: "fecha periodo_fim de mandato aberto, deduzido da cadeia de eventos do candidato",
          recorte: `linha ${id}, periodo_fim = ${periodoFim}`,
        },
        () =>
          supabase
            .from("historico_politico")
            .update({ periodo_fim: periodoFim })
            .eq("id", id)
            .select("id"),
      )
    },
  })
  deps.writeCSV = (filename, content) => {
    const csvPath =
      process.env.PF_MANUAL_REVIEW_PERIODO_FIM_CSV_PATH?.trim() || resolve(process.cwd(), `data/${filename}`)
    writeFileSync(csvPath, content, "utf-8")
    log(SRC, `Manual review CSV: ${csvPath}`)
  }
  await runBackfillHistoricoPeriodoFim(deps)
}

const isDirectRun = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false

if (isDirectRun) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}

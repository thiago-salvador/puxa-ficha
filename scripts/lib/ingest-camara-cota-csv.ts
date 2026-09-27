import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parse } from "csv-parse/sync"
import { loadCandidatosPublicos, resolveCandidatoId } from "./helpers-db"
import { aplicarCoorteAtualizacao } from "./coorte-atualizacao"
import { downloadToFile, verifyZip } from "./download-to-file"
import { supabase } from "./supabase"
import { ativarDryRun, deveAtivarDryRunDoColetor, emDryRun, planejarEscrita } from "./dry-run"
import { escreverAuditado } from "./escrita-auditada"
import { decidirChaveOcupada, lerLinhaNaChave } from "./gastos-chave-anual"
import { log, warn } from "./logger"
import type { IngestResult } from "./types"

export const CAMARA_COTA_CSV_FIRST_YEAR = 2008
export const CAMARA_COTA_CSV_LAST_YEAR = 2026
export const CAMARA_COTA_CSV_YEARS = Object.freeze(Array.from(
  { length: CAMARA_COTA_CSV_LAST_YEAR - CAMARA_COTA_CSV_FIRST_YEAR + 1 },
  (_, index) => CAMARA_COTA_CSV_FIRST_YEAR + index,
))
export const CAMARA_COTA_CSV_PARTIAL_YEARS = new Set([2026])
export const CAMARA_COTA_CSV_COMPLETE_YEARS = new Set(CAMARA_COTA_CSV_YEARS.filter((year) => !CAMARA_COTA_CSV_PARTIAL_YEARS.has(year)))
export const CAMARA_COTA_CSV_URL = (year: number) => `https://www.camara.leg.br/cotas/Ano-${year}.csv.zip`

type CotaCsvRow = Record<string, string>
export interface CotaParlamentarAggregate {
  sourceId: string
  rowCount: number
  totalLiquido: number
  categories: Map<string, number>
}

export interface LegacyCotaRow {
  id: string
  ano: number
  fonte: string | null
  total_gasto?: number | null
  despublicado_em?: string | null
  despublicacao_motivo?: string | null
}

type TombstoneUndo = { candidatoId: string; slug: string; row: LegacyCotaRow; reason: string }

/** Restaura preimages em ordem inversa se uma etapa posterior do par falhar. */
export async function restaurarTombstonesAposFalha<T>(
  tombstones: readonly T[],
  restore: (tombstone: T) => Promise<void>,
): Promise<string[]> {
  const failures: string[] = []
  for (const tombstone of [...tombstones].reverse()) {
    try {
      await restore(tombstone)
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error))
    }
  }
  return failures
}

/** Mantém resultados já finalizados intactos ao gerar recibos de falha pendentes. */
export function anexarRecibosPendentesCota<T extends { slug: string }>(
  finalized: readonly IngestResult[],
  candidates: readonly T[],
  detail: string,
  durationMs: number,
  failedUrl: string,
  sourceRevisions: unknown[],
  errorClass = "unknown",
): IngestResult[] {
  const finalizedSlugs = new Set(finalized.map((result) => result.candidato))
  const pending = candidates.filter((candidate) => !finalizedSlugs.has(candidate.slug)).map((candidate): IngestResult => ({
    source: "camara-cotas", candidato: candidate.slug, tables_updated: [], rows_upserted: 0,
    errors: [detail], duration_ms: durationMs, coleta_resultado: "erro",
    coleta_detalhe: JSON.stringify({ contract_version: 2, kind: "camara-cota-csv", status: "fonte_indisponivel_ou_invalida", attempted_url: failedUrl, source_revisions: sourceRevisions, scope_complete: false, error_class: errorClass }),
    coleta_url: failedUrl,
  }))
  return [...finalized, ...pending]
}

export function autorizarDespublicacoesCota(input: { legacyRows: number; tombstones: number; runTotal: number }): { allowed: boolean; reason?: string } {
  const perCandidateCap = Math.min(25, Math.floor(input.legacyRows * 0.2))
  if (input.tombstones > perCandidateCap) return { allowed: false, reason: `limite por candidato/proporção excedido (${input.tombstones}/${input.legacyRows}; máximo ${perCandidateCap})` }
  if (input.runTotal + input.tombstones > 250) return { allowed: false, reason: `limite por execução excedido (${input.runTotal + input.tombstones}/250)` }
  return { allowed: true }
}

function fonteCamaraApiId(fonte: string | null, idCamara?: string | number | null): boolean {
  const match = fonte?.match(/^https:\/\/dadosabertos\.camara\.leg\.br\/api\/v2\/deputados\/(\d+)\/despesas\/?$/)
  return Boolean(match && idCamara != null && match[1] === String(idCamara))
}

/**
 * Rótulo de uma carga antiga da própria cota da Câmara (dados abertos), com
 * sufixo de onda. É a mesma Casa: só entra na decisão de substituir a linha
 * que ocupa a chave anual, não na reconciliação de linhas legadas.
 */
export function fonteCotaCamaraLegada(fonte: string | null): boolean {
  return fonte != null && /^Cota Parlamentar\/Camara dadosabertos( \([^)]*\))?$/.test(fonte)
}

function fonteCamaraReconhecida(fonte: string | null, idCamara?: string | number | null): boolean {
  if (fonte === "Câmara" || fonte === "Camara" || fonte === "Camara CEAP CSV") return true
  return fonteCamaraApiId(fonte, idCamara)
}

export function planejarReconciliacaoCotaLegada(input: {
  legacyRows: readonly LegacyCotaRow[]
  officialYears: ReadonlySet<number>
  officialTotals: ReadonlyMap<number, number>
  scopeComplete: boolean
  otherHouseApplicable?: boolean
  idCamara?: string | number | null
  partialYears?: ReadonlySet<number>
}): { confirmed: LegacyCotaRow[]; absent: LegacyCotaRow[]; duplicates: LegacyCotaRow[]; review: LegacyCotaRow[] } {
  const confirmed: LegacyCotaRow[] = []
  const absent: LegacyCotaRow[] = []
  const duplicates: LegacyCotaRow[] = []
  const review: LegacyCotaRow[] = []
  const byYear = new Map<number, LegacyCotaRow[]>()
  for (const row of input.legacyRows) {
    if (row.despublicado_em) continue
    if (row.fonte === null) { review.push(row); continue }
    if (!fonteCamaraReconhecida(row.fonte, input.idCamara)) continue
    const group = byYear.get(row.ano) ?? []
    group.push(row)
    byYear.set(row.ano, group)
  }
  for (const [year, rows] of byYear) {
    const yearComplete = input.scopeComplete && !input.partialYears?.has(year)
    const officialTotal = input.officialTotals.get(year)
    const confirmedTotal = input.officialYears.has(year) && officialTotal != null
    const hasPositiveHouseProof = (row: LegacyCotaRow) => !input.otherHouseApplicable || row.fonte !== null
      || fonteCamaraApiId(row.fonte, input.idCamara)
    const canonical = rows.filter((row) => row.fonte === "Camara")
    if (canonical.length > 1) { review.push(...rows); continue }
    if (canonical.length === 1) {
      const primary = canonical[0]!
      const primaryMatches = confirmedTotal && primary.total_gasto != null && Number(primary.total_gasto) === officialTotal
      for (const row of rows.filter((candidate) => candidate.id !== primary.id)) {
        if (primaryMatches && confirmedTotal && row.total_gasto != null && Number(row.total_gasto) === officialTotal
          && hasPositiveHouseProof(row)) duplicates.push(row)
        else if (yearComplete && fonteCamaraReconhecida(row.fonte, input.idCamara)
          && (!confirmedTotal || row.total_gasto == null || Number(row.total_gasto) !== officialTotal)) absent.push(row)
        else review.push(row)
      }
      continue
    }
    if (rows.length > 1) {
      const matching = confirmedTotal ? rows.filter((row) => row.total_gasto != null && Number(row.total_gasto) === officialTotal) : []
      if (matching.length === rows.length && rows.every(hasPositiveHouseProof)) {
        const [primary, ...extras] = [...matching].sort((a, b) => a.id.localeCompare(b.id))
        if (primary) confirmed.push(primary)
        duplicates.push(...extras)
      } else {
        for (const row of rows) {
          if (confirmedTotal && row.total_gasto != null && Number(row.total_gasto) === officialTotal && hasPositiveHouseProof(row)) confirmed.push(row)
          else if (confirmedTotal && row.total_gasto != null && Number(row.total_gasto) === officialTotal) review.push(row)
          else if (yearComplete && fonteCamaraReconhecida(row.fonte, input.idCamara)) absent.push(row)
          else review.push(row)
        }
      }
      continue
    }
    const [row] = rows
    if (!row) continue
    if (input.officialYears.has(year) && row.total_gasto != null && Number(row.total_gasto) === input.officialTotals.get(year)
      && hasPositiveHouseProof(row)) confirmed.push(row)
    else if (input.otherHouseApplicable && row.fonte === null) review.push(row)
    else if (input.otherHouseApplicable && !fonteCamaraApiId(row.fonte, input.idCamara)) review.push(row)
    else if (input.officialYears.has(year) && yearComplete) absent.push(row)
    else if (input.officialYears.has(year)) review.push(row)
    else if (yearComplete && input.officialYears.has(year)) absent.push(row)
    else review.push(row)
  }
    return { confirmed, absent, duplicates, review }
}

export function selecionarCandidatosCotaCamara<T extends { slug: string }>(
  candidates: readonly T[],
  options: { targetSlugs?: readonly string[]; cohortPredicate?: (candidate: T) => boolean } = {},
): T[] {
  const targets = options.targetSlugs === undefined ? null : new Set(options.targetSlugs)
  return candidates.filter((candidate) =>
    (!targets || targets.has(candidate.slug)) && (!options.cohortPredicate || options.cohortPredicate(candidate)),
  )
}

function parseMoney(value: string, field: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error(`Cota Câmara: campo ${field} não numérico`)
  return parsed
}

/** Agrupa pelo ID oficial. CPF/CNPJ, nome e fornecedor não entram no resultado. */
export function aggregateCamaraCotaCsv(csv: string, year: number): Map<string, CotaParlamentarAggregate> {
  const rows = parse(csv, { bom: true, columns: true, delimiter: ";", skip_empty_lines: true, relax_column_count: false }) as CotaCsvRow[]
  if (!rows.length) throw new Error("Cota Câmara: CSV sem linhas")
  const required = ["ideCadastro", "numAno", "txtDescricao", "vlrDocumento", "vlrGlosa", "vlrLiquido"]
  for (const column of required) {
    if (!Object.hasOwn(rows[0], column)) throw new Error(`Cota Câmara: coluna ausente (${column})`)
  }
  const aggregates = new Map<string, CotaParlamentarAggregate>()
  for (const row of rows) {
    if (Number(row.numAno) !== year) throw new Error(`Cota Câmara: linha fora do ano ${year}`)
    const sourceId = row.ideCadastro.trim()
    if (!/^\d+$/.test(sourceId)) continue // registros de liderança/órgão não identificam deputado
    const category = row.txtDescricao.trim()
    if (!category) throw new Error(`Cota Câmara: categoria vazia para ID ${sourceId}`)
    parseMoney(row.vlrDocumento, "vlrDocumento")
    parseMoney(row.vlrGlosa, "vlrGlosa")
    const net = parseMoney(row.vlrLiquido, "vlrLiquido")
    // Preserve the source net value as published. `valorLiquido` is the
    // authoritative amount; source adjustments can make arithmetic equality
    // against document minus glosa invalid for individual rows.
    const aggregate = aggregates.get(sourceId) ?? {
      sourceId, rowCount: 0, totalLiquido: 0, categories: new Map<string, number>(),
    }
    aggregate.rowCount += 1
    const liquidCents = Math.round(net * 100)
    aggregate.totalLiquido = Math.round((aggregate.totalLiquido * 100 + liquidCents)) / 100
    aggregate.categories.set(category, Math.round(((aggregate.categories.get(category) ?? 0) * 100 + liquidCents)) / 100)
    aggregates.set(sourceId, aggregate)
  }
  return aggregates
}

export function validarContagemAnualCotaCorroborada(primaryCsv: string, corroboratingCsv: string, year: number): number {
  const primary = aggregateCamaraCotaCsv(primaryCsv, year)
  const corroborating = aggregateCamaraCotaCsv(corroboratingCsv, year)
  const countParsedRows = (csv: string) => {
    const rows = parse(csv, { bom: true, columns: true, delimiter: ";", skip_empty_lines: true, relax_column_count: false }) as CotaCsvRow[]
    return rows.length
  }
  const primaryRows = countParsedRows(primaryCsv)
  const corroboratingRows = countParsedRows(corroboratingCsv)
  if (primaryRows !== corroboratingRows) throw new Error(`Cota Câmara: total de linhas CSV diverge entre chamadas independentes (${year}: ${primaryRows} vs ${corroboratingRows})`)
  const signature = (rows: Map<string, CotaParlamentarAggregate>) => [...rows].map(([id, row]) => [id, row.rowCount] as const).sort(([a], [b]) => a.localeCompare(b))
  if (JSON.stringify(signature(primary)) !== JSON.stringify(signature(corroborating))) {
    throw new Error(`Cota Câmara: contagem anual/IDs divergem entre chamadas independentes (${year})`)
  }
  return primaryRows
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function safeDetail(revisions: Array<{ url: string; sha256: string; year: number }>, sourceRows: number, sourceId: string, matchedYears: number[], reconciliation?: { provenance_added: number; unpublished: number; review: number }): string {
  return JSON.stringify({ contract_version: 2, kind: "camara-cota-csv", source_id: sourceId, source_rows: sourceRows, source_revisions: revisions, identity: "ideCadastro", scope_complete: revisions.length === CAMARA_COTA_CSV_YEARS.length && CAMARA_COTA_CSV_PARTIAL_YEARS.size === 0, years: CAMARA_COTA_CSV_YEARS, complete_years: [...CAMARA_COTA_CSV_COMPLETE_YEARS], partial_years: [...CAMARA_COTA_CSV_PARTIAL_YEARS], matched_years: matchedYears, reconciliation })
}

/** Coleta oficial anual da Câmara; não reproduz julgamentos de suspeita do Jarbas. */
export async function ingestCamaraCotasCsv(options: { targetSlugs?: string[]; cohortPredicate?: (candidate: Awaited<ReturnType<typeof loadCandidatosPublicos>>[number]) => boolean; apply?: boolean; dryRun?: boolean } = {}): Promise<IngestResult[]> {
  if (deveAtivarDryRunDoColetor(options)) ativarDryRun()
  const started = Date.now()
  // coorte-atualizacao: aplica (CSV anual também filtra explicitamente a coorte de atualização)
  const candidates = await aplicarCoorteAtualizacao(await loadCandidatosPublicos(), "camara-cotas")
  const scoped = selecionarCandidatosCotaCamara(candidates, { targetSlugs: options.targetSlugs, cohortPredicate: options.cohortPredicate })
  const work = mkdtempSync(join(tmpdir(), "pf-camara-cotas-"))
  const sourceRevisions: Array<{ url: string; sha256: string; year: number; corroboration_sha256?: string; source_rows?: number }> = []
  const results: IngestResult[] = []
  const tombstonesInProgress: TombstoneUndo[] = []
  const finalize = (result: IngestResult) => { results.push(result) }
  let failedUrl = CAMARA_COTA_CSV_URL(CAMARA_COTA_CSV_FIRST_YEAR)
  try {
    const aggregates = new Map<string, Map<number, CotaParlamentarAggregate>>()
    let sourceRows = 0
    for (const year of CAMARA_COTA_CSV_YEARS) {
      const zipPath = join(work, `cotas-${year}.csv.zip`)
      const url = CAMARA_COTA_CSV_URL(year)
      failedUrl = url
      if (!await downloadToFile(url, zipPath, { verify: verifyZip, retry: { windowMs: 15_000, baseDelayMs: 1_000, maxDelayMs: 4_000 } })) throw new Error(`download falhou: ${url}`)
      const digest = sha256(readFileSync(zipPath))
      const csvBytes = execFileSync("unzip", ["-p", zipPath], { maxBuffer: 512 * 1024 * 1024 })
      const csv = csvBytes.toString("utf8")
      const annual = aggregateCamaraCotaCsv(csv, year)
      const corroborationPath = join(work, `cotas-${year}-corroboracao.csv.zip`)
      if (!await downloadToFile(url, corroborationPath, { verify: verifyZip, retry: { windowMs: 15_000, baseDelayMs: 1_000, maxDelayMs: 4_000 } })) throw new Error(`segunda chamada oficial falhou: ${url}`)
      const corroborationBytes = readFileSync(corroborationPath)
      const corroborationCsv = execFileSync("unzip", ["-p", corroborationPath], { maxBuffer: 512 * 1024 * 1024 }).toString("utf8")
      const validatedRows = validarContagemAnualCotaCorroborada(csv, corroborationCsv, year)
      const corroborationDigest = sha256(corroborationBytes)
      rmSync(corroborationPath, { force: true })
      for (const [id, aggregate] of annual) {
        const perYear = aggregates.get(id) ?? new Map<number, CotaParlamentarAggregate>()
        perYear.set(year, aggregate)
        aggregates.set(id, perYear)
        sourceRows += aggregate.rowCount
      }
      sourceRevisions.push({ url, sha256: digest, year, corroboration_sha256: corroborationDigest, source_rows: validatedRows })
      rmSync(zipPath, { force: true })
    }
    const candidatesPerId = new Map<string, number>()
    for (const candidate of scoped) if (candidate.ids.camara != null) {
      const id = String(candidate.ids.camara)
      candidatesPerId.set(id, (candidatesPerId.get(id) ?? 0) + 1)
    }
    let runTombstones = 0
    for (const candidate of scoped) {
      const tombstoneUndoStart = tombstonesInProgress.length
      const base: IngestResult = {
        source: "camara-cotas", candidato: candidate.slug, tables_updated: [], rows_upserted: 0,
        errors: [], duration_ms: 0, coleta_url: CAMARA_COTA_CSV_URL(CAMARA_COTA_CSV_LAST_YEAR),
      }
      const start = Date.now()
      if (candidate.ids.camara == null) {
        base.coleta_resultado = "indeterminado"
        base.coleta_detalhe = JSON.stringify({
          contract_version: 2,
          kind: "camara-cota-csv",
          status: "identidade_camara_ausente",
          scope_complete: true,
          years: CAMARA_COTA_CSV_YEARS,
          source_revisions: sourceRevisions,
          identity_verified: false,
          nenhum_casamento_por_nome_tentado: true,
        })
        base.duration_ms = Date.now() - start
        finalize(base)
        continue
      }
      const annualAggregates = aggregates.get(String(candidate.ids.camara))
      if (candidatesPerId.get(String(candidate.ids.camara)) !== 1) {
        base.coleta_resultado = "indeterminado"
        base.coleta_detalhe = JSON.stringify({ contract_version: 2, kind: "camara-cota-csv", status: "id_oficial_duplicado_na_coorte", source_id: String(candidate.ids.camara), years: CAMARA_COTA_CSV_YEARS, source_revisions: sourceRevisions, identity_verified: false, scope_complete: false })
        base.duration_ms = Date.now() - start
        finalize(base)
        continue
      }
      const candidateSourceRows = [...(annualAggregates?.values() ?? [])].reduce((sum, aggregate) => sum + aggregate.rowCount, 0)
      const candidateId = await resolveCandidatoId(candidate.slug)
      if (!candidateId) throw new Error(`candidato_id ausente: ${candidate.slug}`)
      const legacyQuery = await supabase.from("gastos_parlamentares")
        .select("id, ano, fonte, total_gasto, despublicado_em, despublicacao_motivo", { count: "exact" })
        .eq("candidato_id", candidateId)
        .in("ano", CAMARA_COTA_CSV_YEARS)
        .is("despublicado_em", null)
      if (legacyQuery.error) throw new Error(`leitura de despesas legadas falhou (${candidate.slug})`)
      if (legacyQuery.count == null || legacyQuery.count !== (legacyQuery.data ?? []).length) throw new Error(`leitura de despesas legadas truncada (${candidate.slug})`)
      const legacyRows = (legacyQuery.data ?? []) as Array<LegacyCotaRow & { total_gasto: number | null; despublicacao_motivo: string | null }>
      const yearsComplete = sourceRevisions.length === CAMARA_COTA_CSV_YEARS.length
      const completeYears = new Set(CAMARA_COTA_CSV_COMPLETE_YEARS)
      const officialTotals = new Map([...(annualAggregates ?? [])].map(([year, aggregate]) => [year, Math.round(aggregate.totalLiquido * 100) / 100]))
      const reconciliation = planejarReconciliacaoCotaLegada({
        legacyRows,
        officialYears: completeYears,
        officialTotals,
        scopeComplete: yearsComplete,
        otherHouseApplicable: candidate.ids.senado != null,
        idCamara: candidate.ids.camara,
        partialYears: CAMARA_COTA_CSV_PARTIAL_YEARS,
      })
      const plannedTombstones = [...reconciliation.absent, ...reconciliation.duplicates]
      const tombstoneGuard = autorizarDespublicacoesCota({ legacyRows: legacyRows.length, tombstones: plannedTombstones.length, runTotal: runTombstones })
      const tombstonesToApply = tombstoneGuard.allowed ? plannedTombstones : []
      if (tombstoneGuard.allowed) runTombstones += plannedTombstones.length
      else base.errors.push(`despublicações retidas para revisão: ${tombstoneGuard.reason}`)
      if (reconciliation.review.length) {
        const reason = candidate.ids.senado != null
          ? "há ID do Senado e a linha legada pode ser CEAPS"
          : !yearsComplete
            ? "a série oficial anual está incompleta"
            : "total legado diverge do total anual oficial ou não foi confirmado"
        base.errors.push(`${reconciliation.review.length} linha(s) legada(s) aguardam revisão: ${reason}`)
      }
      let materialized = 0
      // Tombstone primeiro: linhas confirmadas ainda permanecem como fonte
      // visível durante a materialização. Se a etapa seguinte falhar, o catch
      // restaura estas preimages antes de devolver erro.
      for (const legacy of tombstonesToApply) {
        const isDuplicate = reconciliation.duplicates.some((row) => row.id === legacy.id)
        if (emDryRun()) {
          planejarEscrita({ fonte: "camara-cotas", tabela: "gastos_parlamentares", operacao: "update", alvo: candidate.slug,
            identidade: `ideCadastro:${candidate.ids.camara}`, chave: { id: legacy.id, ano: legacy.ano, fonte: legacy.fonte },
            valores: { despublicado_em: "now()", despublicacao_motivo: isDuplicate ? "camara-cota-csv: duplicata confirmada pelo total anual oficial" : "camara-cota-csv: ausência confirmada em fonte anual completa" } })
          continue
        }
        const explicitApiCasa = fonteCamaraApiId(legacy.fonte, candidate.ids.camara)
        const status = isDuplicate ? `duplicata de linha confirmada pelo total oficial de ${legacy.ano}` : officialTotals.has(legacy.ano)
          ? explicitApiCasa
            ? `URL oficial Câmara para ideCadastro ${candidate.ids.camara} confirma a Casa; total legado diverge do CSV Cota completo de ${legacy.ano}`
            : `total legado diverge da cota oficial completa de ${legacy.ano}`
          : explicitApiCasa
            ? `URL oficial Câmara para ideCadastro ${candidate.ids.camara} confirma a Casa; linha ausente no CSV Cota completo de ${legacy.ano}`
            : `linha legada ausente no CSV oficial completo de ${legacy.ano}`
        const reason = `camara-cota-csv: ${status}; mantida para auditoria`
        let tombstone = supabase.from("gastos_parlamentares").update({ despublicado_em: new Date().toISOString(), despublicacao_motivo: reason })
          .eq("id", legacy.id).eq("candidato_id", candidateId).eq("ano", legacy.ano)
        tombstone = legacy.fonte === null ? tombstone.is("fonte", null) : tombstone.eq("fonte", legacy.fonte)
        tombstone = legacy.total_gasto == null ? tombstone.is("total_gasto", null) : tombstone.eq("total_gasto", legacy.total_gasto)
        const write = await escreverAuditado({ script: "ingest-camara-cota-csv", tabela: "gastos_parlamentares",
          motivo: "Despublicar gasto legado ausente em CSV oficial anual completo", recorte: `${candidate.slug}:${legacy.ano}` },
        () => tombstone.is("despublicado_em", null).select("id, despublicado_em, despublicacao_motivo"))
        if (write.length !== 1 || write[0]?.id !== legacy.id || !write[0]?.despublicado_em || write[0]?.despublicacao_motivo !== reason) {
          throw new Error(`readback da despublicação divergiu para ${candidate.slug}:${legacy.ano}`)
        }
        tombstonesInProgress.push({ candidatoId: candidateId, slug: candidate.slug, row: legacy, reason })
        const readback = await supabase.from("gastos_parlamentares").select("id, fonte, despublicado_em, despublicacao_motivo")
          .eq("id", legacy.id).maybeSingle()
        if (readback.error || readback.data?.despublicacao_motivo !== reason || readback.data?.despublicado_em == null || readback.data?.fonte !== legacy.fonte) {
          throw new Error(`readback independente da despublicação divergiu para ${candidate.slug}:${legacy.ano}`)
        }
        materialized += 1
      }
      for (const [year, aggregate] of annualAggregates ?? []) {
        const existingQuery = await supabase.from("gastos_parlamentares")
          .select("id, fonte, total_gasto", { count: "exact" }).eq("candidato_id", candidateId).eq("ano", year)
          .is("despublicado_em", null).limit(100)
        if (existingQuery.error) throw new Error(`leitura gastos_parlamentares falhou (${year})`)
        if (existingQuery.count == null || existingQuery.count !== (existingQuery.data ?? []).length) throw new Error(`leitura de despesas anuais truncada (${candidate.slug}:${year})`)
        const annualRows = existingQuery.data ?? []
        const matches = annualRows.filter((row) => fonteCamaraReconhecida(row.fonte, candidate.ids.camara))
        const unknownSources = annualRows.filter((row) => !fonteCamaraReconhecida(row.fonte, candidate.ids.camara))
        if (unknownSources.length) {
          base.errors.push(`${candidate.slug}:${year} tem ${unknownSources.length} linha(s) com outra fonte; mantidas em revisão sem bloquear a linha Câmara confirmada`)
        }
        const target = matches.find((match) => match.fonte === "Camara") ?? matches.find((match) => reconciliation.confirmed.some((legacy) => legacy.id === match.id)) ?? null
        if (matches.length > 1 && (!target || matches.some((match) => match.id !== target.id && !reconciliation.duplicates.some((row) => row.id === match.id)))) {
          base.errors.push(`${candidate.slug}:${year} tem múltiplas linhas Câmara/legadas não deduplicadas com prova e fica em revisão`)
          continue
        }
        const categories = [...aggregate.categories].map(([categoria, cents]) => ({
          categoria,
          valor: Math.round(cents * 100) / 100,
        }))
        const total = Math.round(aggregate.totalLiquido * 100) / 100
        const targetIsLegacy = Boolean(target && target.fonte !== "Camara")
        const targetLegacyConfirmed = target && reconciliation.confirmed.some((legacy) => legacy.id === target.id)
        if (targetIsLegacy && !targetLegacyConfirmed) {
          base.errors.push(`${candidate.slug}:${year} tem gasto legado sem Casa/fonte que não pode ser atribuído com segurança; revisão necessária`)
          continue
        }
        const row = {
          candidato_id: candidateId,
          ano: year,
          total_gasto: total,
          coletado_em: new Date().toISOString(),
          detalhamento: {
            categorias: categories,
            proveniencia: {
              tipo: "camara-cota-csv",
              identity_field: "ideCadastro",
              id_camara: Number(candidate.ids.camara),
              ano: year,
              source_rows: aggregate.rowCount,
              source_revisions: sourceRevisions,
              scope_complete: sourceRevisions.length === CAMARA_COTA_CSV_YEARS.length && CAMARA_COTA_CSV_PARTIAL_YEARS.size === 0,
              years: CAMARA_COTA_CSV_YEARS,
              complete_years: [...CAMARA_COTA_CSV_COMPLETE_YEARS],
              partial_years: [...CAMARA_COTA_CSV_PARTIAL_YEARS],
            },
          },
          gastos_destaque: [...categories].sort((a, b) => b.valor - a.valor).slice(0, 5)
            .map(({ categoria, valor }) => ({ descricao: categoria, categoria, valor })),
          fonte: "Camara",
        }
        // A chave (candidato_id, ano) é única mesmo para linha despublicada:
        // sem alvo publicado, a linha oficial substitui a ocupante da mesma Casa.
        const chave = target
          ? { acao: "inserir" as const }
          : decidirChaveOcupada(await lerLinhaNaChave(candidateId, year), (fonte) => fonteCamaraReconhecida(fonte, candidate.ids.camara) || fonteCotaCamaraLegada(fonte), { aceitaPublicada: true })
        if (chave.acao === "revisao") {
          base.errors.push(`${candidate.slug}:${year} ${chave.motivo}; revisão necessária`)
          continue
        }
        const ocupante = chave.acao === "substituir" ? chave.linha : null
        if (emDryRun()) {
          planejarEscrita({
            fonte: "camara-cotas", tabela: "gastos_parlamentares",
            operacao: target || ocupante ? "update" : "insert", alvo: candidate.slug,
            identidade: `ideCadastro:${candidate.ids.camara}`,
            chave: target ? { id: target.id } : ocupante ? { id: ocupante.id, republicar: true } : { candidato_id: candidateId, ano: year, fonte: "Camara" },
            valores: row,
          })
        } else if (ocupante) {
          const write = await escreverAuditado({
            script: "ingest-camara-cota-csv",
            tabela: "gastos_parlamentares",
            motivo: "Substituir a linha da mesma chave anual pelo total oficial da cota da Câmara",
            recorte: `${candidate.slug}:${year}`,
          }, () => {
            let query = supabase.from("gastos_parlamentares").update({ ...row, despublicado_em: null, despublicacao_motivo: null })
              .eq("id", ocupante.id).eq("candidato_id", candidateId).eq("ano", year)
            query = ocupante.fonte === null ? query.is("fonte", null) : query.eq("fonte", ocupante.fonte)
            query = ocupante.total_gasto === null ? query.is("total_gasto", null) : query.eq("total_gasto", ocupante.total_gasto)
            query = ocupante.despublicado_em === null ? query.is("despublicado_em", null) : query.not("despublicado_em", "is", null)
            return query.select("id, fonte, total_gasto, despublicado_em")
          })
          const written = write[0] as { id?: string; fonte?: string; total_gasto?: number; despublicado_em?: string | null } | undefined
          if (write.length !== 1 || written?.id !== ocupante.id || written?.fonte !== "Camara" || Number(written?.total_gasto) !== total || written?.despublicado_em != null) {
            throw new Error(`readback da substituição divergiu para ${candidate.slug}:${year}`)
          }
          materialized += 1
        } else {
          const write = await escreverAuditado({
            script: "ingest-camara-cota-csv",
            tabela: "gastos_parlamentares",
            motivo: "Materializar despesas anuais da cota oficial da Câmara com proveniência verificável",
            recorte: `${candidate.slug}:${year}`,
          }, () => target
            ? (() => {
                let query = supabase.from("gastos_parlamentares").update(row).eq("id", target.id).eq("ano", year).eq("total_gasto", target.total_gasto)
                query = target.fonte === null ? query.is("fonte", null) : query.eq("fonte", target.fonte)
                return query.is("despublicado_em", null).select("id, fonte, total_gasto")
              })()
            : supabase.from("gastos_parlamentares").insert(row).select("id"))
          const written = write[0] as { id?: string; fonte?: string; total_gasto?: number } | undefined
          if (target && (write.length !== 1 || written?.id !== target.id || written?.fonte !== "Camara" || Number(written?.total_gasto) !== total)) {
            throw new Error(`readback gastos_parlamentares divergiu para ${candidate.slug}:${year}`)
          }
          materialized += write.length
          const readback = await supabase.from("gastos_parlamentares").select("id, fonte, total_gasto, despublicado_em", { count: "exact" })
            .eq("candidato_id", candidateId).eq("ano", year).eq("fonte", "Camara").is("despublicado_em", null)
          if (readback.error || readback.count !== 1 || (readback.data ?? []).length !== 1
            || readback.data?.[0]?.fonte !== "Camara" || Number(readback.data?.[0]?.total_gasto) !== total
            || readback.data?.[0]?.despublicado_em != null) {
            throw new Error(`readback independente gastos_parlamentares divergiu para ${candidate.slug}:${year}`)
          }
        }
      }
      base.coleta_resultado = base.errors.length ? "indeterminado" : candidateSourceRows ? "encontrado" : "vazio_confirmado"
      base.coleta_volume = candidateSourceRows
      base.coleta_detalhe = safeDetail(sourceRevisions, candidateSourceRows, String(candidate.ids.camara), [...(annualAggregates?.keys() ?? [])], {
        provenance_added: reconciliation.confirmed.length,
        unpublished: reconciliation.absent.length,
        review: reconciliation.review.length,
      })
      if (materialized) {
        base.rows_upserted = materialized
        base.tables_updated.push("gastos_parlamentares")
      }
      base.duration_ms = Date.now() - start
      finalize(base)
      tombstonesInProgress.splice(tombstoneUndoStart)
    }
      log("camara-cotas", `CSV oficial ${CAMARA_COTA_CSV_FIRST_YEAR}-${CAMARA_COTA_CSV_LAST_YEAR}: ${aggregates.size} IDs com despesas; ${sourceRevisions.length} pacotes verificados (${sourceRows} linhas)`)
    return results
  } catch (error) {
    let detail = error instanceof Error ? error.message : String(error)
    warn("camara-cotas", detail)
    const rollbackFailures = await restaurarTombstonesAposFalha(tombstonesInProgress, async (undo) => {
        const previousReason = undo.row.despublicacao_motivo ?? null
        let restore = supabase.from("gastos_parlamentares").update({ despublicado_em: null, despublicacao_motivo: previousReason })
          .eq("id", undo.row.id).eq("candidato_id", undo.candidatoId).eq("ano", undo.row.ano)
          .eq("despublicacao_motivo", undo.reason).not("despublicado_em", "is", null)
        restore = undo.row.fonte === null ? restore.is("fonte", null) : restore.eq("fonte", undo.row.fonte)
        restore = undo.row.total_gasto == null ? restore.is("total_gasto", null) : restore.eq("total_gasto", undo.row.total_gasto)
        const restored = await escreverAuditado({ script: "ingest-camara-cota-csv", tabela: "gastos_parlamentares",
          motivo: "Restaurar preimage de tombstone após falha posterior no mesmo candidato", recorte: `${undo.slug}:${undo.row.ano}` },
        () => restore.select("id, despublicado_em, despublicacao_motivo"))
        if (restored.length !== 1 || restored[0]?.id !== undo.row.id || restored[0]?.despublicado_em != null
          || restored[0]?.despublicacao_motivo !== previousReason) throw new Error("readback da restauração divergiu")
    })
    if (rollbackFailures.length) detail += `; rollback incompleto: ${rollbackFailures.join(" | ")}`
    return anexarRecibosPendentesCota(results, scoped, detail, Date.now() - started, failedUrl, sourceRevisions, error instanceof Error ? error.name : "unknown")
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

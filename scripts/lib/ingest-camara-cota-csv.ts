import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parse } from "csv-parse/sync"
import { loadCandidatosPublicos, resolveCandidatoId } from "./helpers-db"
import { downloadToFile, verifyZip } from "./download-to-file"
import { supabase } from "./supabase"
import { emDryRun, planejarEscrita } from "./dry-run"
import { escreverAuditado } from "./escrita-auditada"
import { log, warn } from "./logger"
import type { IngestResult } from "./types"

export const CAMARA_COTA_CSV_FIRST_YEAR = 2008
export const CAMARA_COTA_CSV_LAST_YEAR = 2026
export const CAMARA_COTA_CSV_YEARS = Object.freeze(Array.from(
  { length: CAMARA_COTA_CSV_LAST_YEAR - CAMARA_COTA_CSV_FIRST_YEAR + 1 },
  (_, index) => CAMARA_COTA_CSV_FIRST_YEAR + index,
))
export const CAMARA_COTA_CSV_URL = (year: number) => `https://www.camara.leg.br/cotas/Ano-${year}.csv.zip`

type CotaCsvRow = Record<string, string>
export interface CotaParlamentarAggregate {
  sourceId: string
  rowCount: number
  totalLiquido: number
  categories: Map<string, number>
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

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function safeDetail(revisions: Array<{ url: string; sha256: string; year: number }>, sourceRows: number, sourceId: string, matchedYears: number[]): string {
  return JSON.stringify({ contract_version: 2, kind: "camara-cota-csv", source_id: sourceId, source_rows: sourceRows, source_revisions: revisions, identity: "ideCadastro", scope_complete: revisions.length === CAMARA_COTA_CSV_YEARS.length, years: CAMARA_COTA_CSV_YEARS, matched_years: matchedYears })
}

/** Coleta oficial anual da Câmara; não reproduz julgamentos de suspeita do Jarbas. */
export async function ingestCamaraCotasCsv(options: { targetSlugs?: string[]; cohortPredicate?: (candidate: Awaited<ReturnType<typeof loadCandidatosPublicos>>[number]) => boolean } = {}): Promise<IngestResult[]> {
  const started = Date.now()
  const candidates = await loadCandidatosPublicos()
  const scoped = selecionarCandidatosCotaCamara(candidates, { targetSlugs: options.targetSlugs, cohortPredicate: options.cohortPredicate })
  const work = mkdtempSync(join(tmpdir(), "pf-camara-cotas-"))
  const sourceRevisions: Array<{ url: string; sha256: string; year: number }> = []
  let failedUrl = CAMARA_COTA_CSV_URL(CAMARA_COTA_CSV_FIRST_YEAR)
  try {
    const aggregates = new Map<string, Map<number, CotaParlamentarAggregate>>()
    let sourceRows = 0
    for (const year of CAMARA_COTA_CSV_YEARS) {
      const zipPath = join(work, `cotas-${year}.csv.zip`)
      const url = CAMARA_COTA_CSV_URL(year)
      failedUrl = url
      if (!await downloadToFile(url, zipPath, { verify: verifyZip })) throw new Error(`download falhou: ${url}`)
      const digest = sha256(readFileSync(zipPath))
      const csvBytes = execFileSync("unzip", ["-p", zipPath], { maxBuffer: 512 * 1024 * 1024 })
      const annual = aggregateCamaraCotaCsv(csvBytes.toString("utf8"), year)
      for (const [id, aggregate] of annual) {
        const perYear = aggregates.get(id) ?? new Map<number, CotaParlamentarAggregate>()
        perYear.set(year, aggregate)
        aggregates.set(id, perYear)
        sourceRows += aggregate.rowCount
      }
      sourceRevisions.push({ url, sha256: digest, year })
      rmSync(zipPath, { force: true })
    }
    const candidatesPerId = new Map<string, number>()
    for (const candidate of scoped) if (candidate.ids.camara != null) {
      const id = String(candidate.ids.camara)
      candidatesPerId.set(id, (candidatesPerId.get(id) ?? 0) + 1)
    }
    const results: IngestResult[] = []
    for (const candidate of scoped) {
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
        results.push(base)
        continue
      }
      const annualAggregates = aggregates.get(String(candidate.ids.camara))
      if (candidatesPerId.get(String(candidate.ids.camara)) !== 1) {
        base.coleta_resultado = "indeterminado"
        base.coleta_detalhe = JSON.stringify({ contract_version: 2, kind: "camara-cota-csv", status: "id_oficial_duplicado_na_coorte", source_id: String(candidate.ids.camara), years: CAMARA_COTA_CSV_YEARS, source_revisions: sourceRevisions, identity_verified: false, scope_complete: false })
        base.duration_ms = Date.now() - start
        results.push(base)
        continue
      }
      const candidateSourceRows = [...(annualAggregates?.values() ?? [])].reduce((sum, aggregate) => sum + aggregate.rowCount, 0)
      const candidateId = await resolveCandidatoId(candidate.slug)
      if (!candidateId) throw new Error(`candidato_id ausente: ${candidate.slug}`)
      let materialized = 0
      for (const [year, aggregate] of annualAggregates ?? []) {
        const existingQuery = await supabase.from("gastos_parlamentares")
          .select("id").eq("candidato_id", candidateId).eq("ano", year).eq("fonte", "Camara").limit(2)
        if (existingQuery.error) throw new Error(`leitura gastos_parlamentares falhou (${year})`)
        const matches = existingQuery.data ?? []
        if (matches.length > 1) throw new Error(`mais de uma linha Camara para candidato/ano ${year}`)
        const categories = [...aggregate.categories].map(([categoria, cents]) => ({
          categoria,
          valor: Math.round(cents * 100) / 100,
        }))
        const total = Math.round(aggregate.totalLiquido * 100) / 100
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
              scope_complete: sourceRevisions.length === CAMARA_COTA_CSV_YEARS.length,
              years: CAMARA_COTA_CSV_YEARS,
            },
          },
          gastos_destaque: [...categories].sort((a, b) => b.valor - a.valor).slice(0, 5)
            .map(({ categoria, valor }) => ({ descricao: categoria, categoria, valor })),
          fonte: "Camara",
        }
        if (emDryRun()) {
          planejarEscrita({
            fonte: "camara-cotas", tabela: "gastos_parlamentares",
            operacao: matches.length ? "update" : "insert", alvo: candidate.slug,
            identidade: `ideCadastro:${candidate.ids.camara}`,
            chave: matches.length ? { id: matches[0].id } : { candidato_id: candidateId, ano: year, fonte: "Camara" },
            valores: row,
          })
        } else {
          const write = await escreverAuditado({
            script: "ingest-camara-cota-csv",
            tabela: "gastos_parlamentares",
            motivo: "Materializar despesas anuais da cota oficial da Câmara com proveniência verificável",
            recorte: `${candidate.slug}:${year}`,
          }, () => matches.length
            ? supabase.from("gastos_parlamentares").update(row).eq("id", matches[0].id).select("id")
            : supabase.from("gastos_parlamentares").insert(row).select("id"))
          materialized += write.length
        }
      }
      base.coleta_resultado = candidateSourceRows ? "encontrado" : "vazio_confirmado"
      base.coleta_volume = candidateSourceRows
      base.coleta_detalhe = safeDetail(sourceRevisions, candidateSourceRows, String(candidate.ids.camara), [...(annualAggregates?.keys() ?? [])])
      if (materialized) {
        base.rows_upserted = materialized
        base.tables_updated.push("gastos_parlamentares")
      }
      base.duration_ms = Date.now() - start
      results.push(base)
    }
      log("camara-cotas", `CSV oficial ${CAMARA_COTA_CSV_FIRST_YEAR}-${CAMARA_COTA_CSV_LAST_YEAR}: ${aggregates.size} IDs com despesas; ${sourceRevisions.length} pacotes verificados (${sourceRows} linhas)`)
    return results
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    warn("camara-cotas", detail)
    return scoped.map((candidate) => ({
      source: "camara-cotas", candidato: candidate.slug, tables_updated: [], rows_upserted: 0,
      errors: [detail], duration_ms: Date.now() - started, coleta_resultado: "erro",
      coleta_detalhe: JSON.stringify({ contract_version: 2, kind: "camara-cota-csv", status: "fonte_indisponivel_ou_invalida", attempted_url: failedUrl, source_revisions: sourceRevisions, scope_complete: false, error_class: error instanceof Error ? error.name : "unknown" }),
      coleta_url: failedUrl,
    }))
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

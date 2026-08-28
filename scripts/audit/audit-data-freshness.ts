import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import { compareCandidacies } from "../lib/data-freshness/candidaturas"
import {
  aggregateSourceEvidence,
  evaluateSourceFreshness,
  loadFreshnessRegistry,
  type SourceEvidence,
} from "../lib/data-freshness/registry"
import {
  buildDataFreshnessRecommendations,
  recommendationsMarkdown,
  type DataFreshnessRecommendation,
} from "../lib/data-freshness/recommendations"
import {
  downloadOfficialCandidacies,
  OfficialSourceError,
  officialRecordsFromVersionedSnapshot,
  parseOfficialCandidaciesZip,
} from "../lib/data-freshness/tse-source"
import type { CandidacyRecord } from "../lib/data-freshness/types"

interface PublishedSnapshot {
  generated_at?: string
  records: CandidacyRecord[]
  collection_evidence?: SourceEvidence[]
}

interface CliOptions {
  published: string
  officialSnapshot: string | null
  out: string
  now: Date
}

function parseArgs(args: string[]): CliOptions {
  const values = new Map<string, string>()
  for (const arg of args) {
    const match = arg.match(/^--([^=]+)=(.+)$/)
    if (match) values.set(match[1], match[2])
  }
  const published = values.get("published")
  if (!published) throw new Error("uso: --published=<snapshot.json> [--official-snapshot=<snapshot.json>]")
  const nowValue = values.get("now")
  const now = nowValue ? new Date(nowValue) : new Date()
  if (!Number.isFinite(now.getTime())) throw new Error(`--now inválido: ${nowValue}`)
  return {
    published: resolve(published),
    officialSnapshot: values.get("official-snapshot")
      ? resolve(values.get("official-snapshot") as string)
      : null,
    out: resolve(values.get("out") ?? "reports/data-freshness"),
    now,
  }
}

function readPublished(path: string): PublishedSnapshot {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as PublishedSnapshot | CandidacyRecord[]
  const snapshot = Array.isArray(parsed) ? { records: parsed } : parsed
  if (!Array.isArray(snapshot.records)) throw new Error("snapshot publicado não contém records[]")
  return snapshot
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function summaryMarkdown(input: {
  generatedAt: string
  overall: "ok" | "review_required" | "source_error"
  officialCount: number
  publishedCount: number
  changeCounts: Record<string, number>
  freshnessCounts: Record<string, number>
  recommendations: DataFreshnessRecommendation[]
  sourceError?: string
}): string {
  const changes = Object.entries(input.changeCounts)
    .map(([key, value]) => `| ${key} | ${value} |`)
    .join("\n")
  const freshness = Object.entries(input.freshnessCounts)
    .map(([key, value]) => `| ${key} | ${value} |`)
    .join("\n")
  return `# Auditoria de atualização dos dados\n\n` +
    `- Gerada em: ${input.generatedAt}\n` +
    `- Estado: **${input.overall}**\n` +
    `- Candidaturas oficiais: ${input.officialCount}\n` +
    `- Registros publicados: ${input.publishedCount}\n` +
    (input.sourceError ? `- Erro da fonte: ${input.sourceError}\n` : "") +
    `\n## Diferenças de candidaturas\n\n| Classificação | Total |\n|---|---:|\n${changes}\n` +
    `\n## Atualidade por fonte\n\n| Estado | Total |\n|---|---:|\n${freshness}\n`
    + `\n${recommendationsMarkdown(input.recommendations)}`
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  mkdirSync(options.out, { recursive: true })
  const generatedAt = options.now.toISOString()
  const published = readPublished(options.published)
  const registry = loadFreshnessRegistry()
  const monitoredRegistry = registry.filter((entry) => entry.refresh_mode !== "disabled")
  let official: CandidacyRecord[] = []
  let source: Record<string, unknown>

  try {
    if (options.officialSnapshot) {
      const raw = JSON.parse(readFileSync(options.officialSnapshot, "utf8")) as {
        source_url?: string
        source_catalog_url?: string
        source_sha256?: string
        extracted_at?: string
      }
      official = officialRecordsFromVersionedSnapshot(options.officialSnapshot)
      source = {
        status: "fresh",
        checked_at: generatedAt,
        mode: "versioned_snapshot",
        source_url: raw.source_url ?? null,
        source_catalog_url: raw.source_catalog_url ?? null,
        source_sha256: raw.source_sha256 ?? null,
        snapshot_extracted_at: raw.extracted_at ?? null,
        attempts: [],
      }
    } else {
      const downloaded = await downloadOfficialCandidacies()
      official = await parseOfficialCandidaciesZip(downloaded.bytes)
      source = {
        status: "fresh",
        checked_at: downloaded.checked_at,
        mode: "live_official",
        source_url: downloaded.source_url,
        source_catalog_url: downloaded.source_catalog_url,
        source_sha256: downloaded.source_sha256,
        attempts: downloaded.attempts,
      }
    }
  } catch (error) {
    const attempts = error instanceof OfficialSourceError ? error.attempts : []
    const message = error instanceof Error ? error.message : String(error)
    source = { status: "source_error", checked_at: generatedAt, error: message, attempts }
    const freshness = monitoredRegistry.map((entry) =>
      evaluateSourceFreshness(
        entry,
        entry.source_id === "tse-current"
          ? { source_id: entry.source_id, checked_at: null, source_error: message }
          : aggregateSourceEvidence(entry, published.collection_evidence ?? []),
        options.now,
      ),
    )
    const freshnessCounts = Object.fromEntries(
      ["fresh", "stale", "source_error", "review_required"].map((status) => [
        status,
        freshness.filter((item) => item.status === status).length,
      ]),
    )
    const recommendations = buildDataFreshnessRecommendations({ comparison: null, freshness, registry })
    writeJson(resolve(options.out, "source.json"), source)
    writeJson(resolve(options.out, "universe.json"), { generated_at: generatedAt, official: [], published: published.records })
    writeJson(resolve(options.out, "diff.json"), {
      generated_at: generatedAt,
      status: "source_error",
      error: message,
      candidacies: null,
      freshness,
    })
    writeFileSync(
      resolve(options.out, "summary.md"),
      summaryMarkdown({
        generatedAt,
        overall: "source_error",
        officialCount: 0,
        publishedCount: published.records.length,
        changeCounts: {},
        freshnessCounts,
        recommendations,
        sourceError: message,
      }),
    )
    console.error(`DATA_FRESHNESS_SOURCE_ERROR: ${message}`)
    process.exitCode = 2
    return
  }

  const comparison = compareCandidacies(official, published.records, generatedAt)
  const freshness = monitoredRegistry.map((entry) =>
    evaluateSourceFreshness(
      entry,
      entry.source_id === "tse-current"
        ? { source_id: entry.source_id, checked_at: generatedAt }
        : aggregateSourceEvidence(entry, published.collection_evidence ?? []),
      options.now,
    ),
  )
  const freshnessCounts = Object.fromEntries(
    ["fresh", "stale", "source_error", "review_required"].map((status) => [
      status,
      freshness.filter((item) => item.status === status).length,
    ]),
  )
  const sourceNeedsReview = freshness.some((item) =>
    item.status === "source_error" || item.status === "review_required" || item.status === "stale")
  const overall = comparison.status === "review_required" || sourceNeedsReview ? "review_required" : "ok"
  const recommendations = buildDataFreshnessRecommendations({ comparison, freshness, registry })

  writeJson(resolve(options.out, "source.json"), source)
  writeJson(resolve(options.out, "universe.json"), { generated_at: generatedAt, official, published: published.records })
  writeJson(resolve(options.out, "diff.json"), {
    generated_at: generatedAt,
    status: overall,
    candidacies: comparison,
    freshness,
  })
  writeFileSync(
    resolve(options.out, "summary.md"),
    summaryMarkdown({
      generatedAt,
      overall,
      officialCount: official.length,
      publishedCount: published.records.length,
      changeCounts: comparison.counts,
      freshnessCounts,
      recommendations,
    }),
  )

  if (overall === "review_required") {
    console.error("DATA_FRESHNESS_REVIEW_REQUIRED")
    process.exitCode = 1
  } else {
    console.log("DATA_FRESHNESS_OK")
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 2
})

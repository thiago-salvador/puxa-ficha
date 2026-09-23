import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { rosterQuality, type RosterRecord } from "../lib/roster-deputados"

const manifest = process.argv.find((arg) => arg.startsWith("--manifest="))?.slice("--manifest=".length)
if (!manifest) throw new Error("uso: --manifest=<relatorio-roster.json>")
const path = resolve(manifest)
if (!existsSync(path)) throw new Error(`manifesto roster não encontrado: ${path}`)
const parsed = JSON.parse(readFileSync(path, "utf8")) as { records?: RosterRecord[]; total?: number; source?: { snapshot_em?: string; collectedAt?: string; coletado_em?: string }; snapshot_em?: string; coletado_em?: string }
const records = parsed.records ?? []
const snapshotAt = parsed.snapshot_em ?? parsed.source?.snapshot_em ?? (records[0]?.snapshot_em ?? null)
const quality = rosterQuality(records, snapshotAt)
const result = { domain: "candidatos_roster_2026", status: quality.status, total: records.length, snapshot_em: snapshotAt, coletado_em: parsed.coletado_em ?? (records[0]?.coletado_em ?? null), zero_por_uf_cargo: quality.zero, idade_dias: Number.isFinite(quality.ageDays) ? Math.round(quality.ageDays * 100) / 100 : null, rule: "partial se qualquer UF/cargo tiver contagem zero, snapshot_em ausente/indeterminado ou snapshot tiver mais de 30 dias", source: path }
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
if (quality.status === "partial" && process.argv.includes("--strict")) process.exitCode = 2

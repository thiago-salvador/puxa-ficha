/** Plano de revisão local; não importa cliente de banco e não oferece --apply. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { createHash } from "node:crypto"
import { planCandidaturaSituacao, type CandidaturaSituacaoDbRow, type SituacaoOficialCandidatura } from "../lib/candidatura-situacao-reconciliacao"

export function reconciliarCandidaturasSituacaoLocal(args: string[]): void {
  const keys = ["before", "official", "out"]
  const optionalKeys = ["published", "published-out"]
  const options = new Map<string, string>()
  for (const arg of args) {
    const match = arg.match(/^--([^=]+)=(.+)$/)
    if (!match || ![...keys, ...optionalKeys].includes(match[1]) || options.has(match[1])) throw new Error(`Argumento inválido: ${arg}`)
    options.set(match[1], resolve(match[2]))
  }
  if (!keys.every(key => options.has(key))) throw new Error("Uso: --before=<json> --official=<json> --out=<json>; somente local")
  if (options.has("published") !== options.has("published-out")) throw new Error("Replay exige --published e --published-out juntos")
  const beforePath = options.get("before")!
  const officialPath = options.get("official")!
  const outputPath = options.get("out")!
  const publishedPath = options.get("published")
  const replayPath = options.get("published-out")
  const inputs = [beforePath, officialPath, publishedPath].filter(Boolean)
  if (inputs.includes(outputPath)) throw new Error("Saída não pode sobrescrever uma fonte")
  if (replayPath && [...inputs, outputPath].includes(replayPath)) throw new Error("Replay não pode sobrescrever entradas ou plano")
  const beforeBytes = readFileSync(beforePath)
  const officialBytes = readFileSync(officialPath)
  const rows = JSON.parse(beforeBytes.toString()) as CandidaturaSituacaoDbRow[]
  const official = JSON.parse(officialBytes.toString()) as SituacaoOficialCandidatura[]
  if (!Array.isArray(rows) || !rows.length || !Array.isArray(official)) throw new Error("Entradas devem ser arrays; coorte vazia não é prova")
  if (new Set(rows.map(row => row.id)).size !== rows.length || new Set(rows.map(row => row.slug)).size !== rows.length) throw new Error("Identidades locais duplicadas")
  const plans = rows.map(row => planCandidaturaSituacao(row, official))
  const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex")
  const report = {
    schema_version: 1, dry_run: true, persisted: 0,
    before_sha256: hash(beforeBytes), official_sha256: hash(officialBytes),
    summary: {
      total: plans.length,
      ready: plans.filter(plan => plan.status === "ready").length,
      unchanged: plans.filter(plan => plan.status === "unchanged").length,
      blocked: plans.filter(plan => plan.status === "blocked").length,
      review_required: plans.filter(plan => plan.status === "review_required").length,
    },
    plans,
  }
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
  if (publishedPath && replayPath) {
    const published = JSON.parse(readFileSync(publishedPath, "utf8")) as {
      public_candidacies: Array<Record<string, unknown>>
      public_profiles: Array<Record<string, unknown>>
    }
    if (!Array.isArray(published.public_candidacies) || !Array.isArray(published.public_profiles)) throw new Error("Snapshot publicado incompleto")
    for (const plan of plans) {
      if (!plan.after) continue
      const matches = published.public_candidacies.filter(row => row.slug === plan.before.slug && row.candidato_id === plan.before.id && row.sq_candidato === plan.before.sq_candidato_2026 && row.office === plan.before.cargo_disputado && row.uf === plan.before.estado)
      if (matches.length !== 1) throw new Error(`Replay sem identidade única: ${plan.before.slug}`)
      const targets = [...matches, ...published.public_profiles.filter(row => row.slug === plan.before.slug)]
      for (const row of targets) {
        if (row.situacao_candidatura !== plan.before.situacao_candidatura) throw new Error(`Replay com julgamento anterior divergente: ${plan.before.slug}`)
        Object.assign(row, plan.after)
      }
    }
    mkdirSync(dirname(replayPath), { recursive: true })
    writeFileSync(replayPath, `${JSON.stringify(published, null, 2)}\n`, { mode: 0o600 })
  }
  console.log(JSON.stringify({ ...report.summary, dry_run: true, persisted: 0, out: outputPath }))
  if (report.summary.blocked || report.summary.review_required) process.exitCode = 2
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { reconciliarCandidaturasSituacaoLocal(process.argv.slice(2)) }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 2 }
}

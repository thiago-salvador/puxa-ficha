/**
 * Quarentena nominal das posições do quiz sem suporte suficiente.
 *
 * O padrão é dry-run. `--apply` é a única forma de atualizar o banco e exige
 * que cada linha ainda case por candidato, tema, URL e posição original.
 * Somente `verificado` muda; fonte, descrição e posição ficam preservadas.
 *
 * Uso:
 *   npx tsx scripts/apply-quiz-position-quarantine.ts
 *   npx tsx scripts/apply-quiz-position-quarantine.ts --out=/tmp/quiz.json
 *   npx tsx scripts/apply-quiz-position-quarantine.ts --apply --out=/tmp/quiz.json
 */
import { readFileSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { escreverAuditado } from "./lib/escrita-auditada"
import { supabase } from "./lib/supabase"

export type QuarantineEntry = {
  global_index: number
  candidate_id: string
  slug: string
  tema: string
  url_fonte: string
  posicao: "a_favor" | "contra" | "ambiguo"
  reason: string
  expected_descricao_sha256: string
}

export type PositionRow = {
  id: string
  candidate_id: string
  slug: string
  tema: string
  posicao: "a_favor" | "contra" | "ambiguo"
  url_fonte: string
  descricao: string | null
  fonte: string | null
  verificado: boolean
  gerado_por: string | null
  created_at: string
}

export type PositionPlan = {
  entry: QuarantineEntry
  status: "update" | "already_quarantined"
  before: PositionRow
  after: PositionRow
}

const MANIFEST = resolve(import.meta.dirname, "audit", "quiz-position-quarantine-20260917.json")
const DEFAULT_OUT = "/tmp/puxaficha-quiz-accuracy-release-20260917-position-quarantine.json"
const SCRIPT = "apply-quiz-position-quarantine"

export function readManifest(path = MANIFEST): QuarantineEntry[] {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as { entries?: QuarantineEntry[] }
  if (!Array.isArray(parsed.entries) || parsed.entries.length !== 28) {
    throw new Error(`manifesto: esperadas 28 entradas, encontrado ${parsed.entries?.length ?? 0}`)
  }
  const keys = new Set<string>()
  for (const entry of parsed.entries) {
    const key = `${entry.candidate_id}|${entry.tema}|${entry.url_fonte}|${entry.posicao}`
    if (keys.has(key)) throw new Error(`manifesto: chave duplicada ${key}`)
    if (!/^[a-f0-9]{64}$/.test(entry.expected_descricao_sha256)) {
      throw new Error(`manifesto: expected_descricao_sha256 inválido em ${entry.global_index}`)
    }
    keys.add(key)
  }
  return parsed.entries
}

function key(row: Pick<PositionRow, "candidate_id" | "tema" | "url_fonte" | "posicao">): string {
  return `${row.candidate_id}|${row.tema}|${row.url_fonte}|${row.posicao}`
}

export function buildPlan(entries: QuarantineEntry[], rows: PositionRow[]): PositionPlan[] {
  const byKey = new Map(rows.map((row) => [key(row), row]))
  return entries.map((entry) => {
    const before = byKey.get(key(entry))
    if (!before) {
      throw new Error(`CAS: posição ausente ou divergente ${entry.slug}/${entry.tema}/${entry.global_index}`)
    }
    if (before.slug !== entry.slug) throw new Error(`CAS: slug divergente para ${entry.global_index}`)
    const descricaoSha256 = createHash("sha256").update(before.descricao ?? "", "utf8").digest("hex")
    if (descricaoSha256 !== entry.expected_descricao_sha256) {
      throw new Error(`CAS: descrição divergente para ${entry.slug}/${entry.tema}/${entry.global_index}`)
    }
    const after = { ...before, verificado: false }
    return {
      entry,
      status: before.verificado ? "update" : "already_quarantined",
      before,
      after,
    }
  })
}

/**
 * Guard de importação: uma migration nova não pode reintroduzir um alvo da
 * quarentena com `verificado=true`. Migrations históricas anteriores ao corte
 * continuam sendo evidência do estado anterior e não são reescritas.
 */
export function findReintroductionTargets(
  files: Array<{ name: string; source: string }>,
  entries = readManifest(),
  cutoff = "20260917190000",
): string[] {
  const violations: string[] = []
  for (const file of files) {
    if (file.name < cutoff || !file.name.endsWith(".sql")) continue
    for (const entry of entries) {
      const urlOffset = file.source.indexOf(entry.url_fonte)
      if (urlOffset < 0) continue
      const localStatement = file.source.slice(
        Math.max(0, file.source.lastIndexOf(";", urlOffset) + 1),
        file.source.indexOf(";", urlOffset) < 0 ? file.source.length : file.source.indexOf(";", urlOffset) + 1,
      )
      const mentionsTarget =
        localStatement.includes(entry.candidate_id) &&
        localStatement.includes(`'${entry.tema}'`) &&
        localStatement.includes(`'${entry.posicao}'`)
      if (!mentionsTarget) continue
      const explicitFlag = /\bverificado\s*(?:=|:)\s*true\b/i.test(localStatement)
      const insertFlag = (() => {
        const insert = localStatement.match(/\(([^()]*)\)\s*values\s*\(([^()]*)\)/i)
        if (!insert) return false
        const columns = insert[1].split(",").map((column) => column.trim().replace(/^['"`]|['"`]$/g, "").toLowerCase())
        const verifiedIndex = columns.indexOf("verificado")
        if (verifiedIndex < 0) return false
        const values = insert[2].split(",").map((value) => value.trim())
        return /\btrue\b/i.test(values[verifiedIndex] ?? "")
      })()
      if (explicitFlag || insertFlag) {
        violations.push(`${file.name}:${entry.global_index}`)
      }
    }
  }
  return violations
}

function outputPath(): string {
  const arg = process.argv.find((value) => value.startsWith("--out="))
  return arg ? resolve(arg.slice("--out=".length)) : DEFAULT_OUT
}

async function main(): Promise<void> {
  const entries = readManifest()
  const ids = [...new Set(entries.map((entry) => entry.candidate_id))]
  const { data, error } = await supabase
    .from("posicoes_declaradas")
    .select("id,candidato_id,tema,posicao,descricao,fonte,url_fonte,verificado,gerado_por,created_at,candidatos!inner(slug)")
    .in("candidato_id", ids)
  if (error) throw new Error(`leitura posicoes_declaradas: ${error.message}`)

  const rows = (data ?? []).map((row) => {
    const candidate = Array.isArray(row.candidatos) ? row.candidatos[0] : row.candidatos
    return { ...row, candidate_id: row.candidato_id, slug: candidate?.slug } as PositionRow
  })
  const plan = buildPlan(entries, rows)
  const updates = plan.filter((item) => item.status === "update")
  const report = {
    task: "quiz-accuracy-release-20260917",
    script: SCRIPT,
    mode: process.argv.includes("--apply") ? "apply" : "dry-run",
    policy: "only verificado changes; source/description/position preserved",
    counts: {
      manifest: entries.length,
      matched: plan.length,
      updates: updates.length,
      already_quarantined: plan.length - updates.length,
    },
    plan,
    generated_at: new Date().toISOString(),
  }
  if (!process.argv.includes("--apply")) {
    const path = outputPath()
    writeFileSync(path, JSON.stringify(report, null, 2) + "\n")
    console.log(JSON.stringify({ mode: report.mode, output: path, counts: report.counts }))
    return
  }

  for (const item of updates) {
    const { entry } = item
    const touched = await escreverAuditado(
      {
        script: SCRIPT,
        tabela: "posicoes_declaradas",
        motivo: `quarentena da posição auditada ${entry.global_index}, preservando fonte e descrição`,
        recorte: `${entry.slug}/${entry.tema} com CAS candidato_id+tema+url_fonte+posicao`,
      },
      () => {
        const update = supabase
          .from("posicoes_declaradas")
          .update({ verificado: false })
          .eq("id", item.before.id)
          .eq("candidato_id", entry.candidate_id)
          .eq("tema", entry.tema)
          .eq("url_fonte", entry.url_fonte)
          .eq("posicao", entry.posicao)
          .eq("verificado", true)
        const cas = item.before.descricao === null ? update.is("descricao", null) : update.eq("descricao", item.before.descricao)
        return cas.select("id,candidato_id,tema,posicao,descricao,fonte,url_fonte,verificado,gerado_por,created_at")
      },
    )
    if (touched.length !== 1) throw new Error(`CAS: atualização não tocou exatamente uma linha em ${entry.global_index}`)
    const rawReturned = touched[0] as {
      id: string
      candidato_id: string
      tema: string
      posicao: PositionRow["posicao"]
      descricao: string | null
      fonte: string | null
      url_fonte: string
      verificado: boolean
      gerado_por: string | null
      created_at: string
    }
    const returned = { ...rawReturned, candidate_id: rawReturned.candidato_id }
    for (const field of ["candidate_id", "tema", "posicao", "descricao", "fonte", "url_fonte", "gerado_por", "created_at"] as const) {
      if (returned[field] !== item.before[field]) {
        throw new Error(`readback: campo preservado divergiu em ${entry.global_index}: ${field}`)
      }
    }
    item.after = { ...item.before, verificado: false }
  }

  report.plan = plan
  report.counts.updates = updates.length
  const path = outputPath()
  writeFileSync(path, JSON.stringify(report, null, 2) + "\n")
  console.log(JSON.stringify({ mode: report.mode, output: path, counts: report.counts }))
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}

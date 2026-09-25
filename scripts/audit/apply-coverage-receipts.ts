/**
 * Grava em `coleta_log` recibos de cobertura que FECHAM célula da matriz, e só
 * esses. Padrão é dry-run; a escrita exige `--apply`, credencial de serviço e
 * uma lista explícita de fontes.
 *
 * Cada recibo é reavaliado contra o perfil público do momento com a mesma
 * régua da matriz (`audit-cobertura-fichas.ts`): se a prova não fecha mais a
 * célula (payload mudou, identidade não confere, estado não é publicado nem
 * vazio confirmado), o recibo é recusado. Recibo `indeterminado` nunca é
 * gravado por aqui, porque só trocaria um estado aberto por outro.
 *
 * Antes do INSERT, o último recibo de cada (alvo, fonte) é salvo em backup; o
 * INSERT devolve os ids, e o rollback é apagar exatamente esses ids.
 *
 * Uso:
 *   node --import tsx scripts/audit/apply-coverage-receipts.ts \
 *     --in=/privado/recibos.json --allow-fonte=tse-patrimonio,camara-gastos \
 *     --out-dir=/privado/aplicacao [--profiles=/privado/perfis.json | --base-url=https://puxaficha.com.br] \
 *     [--apply --execucao=f8:20260925]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import {
  adaptLatestReceipts,
  buildCoverageMatrix,
  receiptFamilies,
  type CoverageFamily,
  type CoverageProfile,
  type LatestReceiptRow,
} from "./audit-cobertura-fichas"

export type PlannedReceipt = {
  fonte: string
  escopo: "candidato"
  alvo: string
  candidato_id: string
  resultado: "encontrado" | "vazio_confirmado"
  volume: number
  url: string | null
  detalhe: string | null
  familia: CoverageFamily
  estado_projetado: "publicado" | "vazio_confirmado"
}

export type PlanResult = {
  planned: PlannedReceipt[]
  rejected: Array<{ fonte: string | null; alvo: string | null; motivo: string }>
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

/** Reavalia cada recibo sozinho contra o perfil público; aceita só o que fecha a célula. */
export function planCoverageReceipts(rows: LatestReceiptRow[], profiles: CoverageProfile[], allowedSources: ReadonlySet<string>): PlanResult {
  const bySlug = new Map(profiles.map((profile) => [text(profile.slug) ?? "", profile]))
  const planned: PlannedReceipt[] = []
  const rejected: PlanResult["rejected"] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const fonte = text(row.fonte)
    const alvo = text(row.alvo)
    const reject = (motivo: string) => rejected.push({ fonte, alvo, motivo })
    if (!fonte || !allowedSources.has(fonte)) { reject("fonte fora da lista permitida"); continue }
    if (text(row.escopo) !== "candidato") { reject("escopo não é candidato"); continue }
    const profile = alvo ? bySlug.get(alvo) : undefined
    if (!alvo || !profile) { reject("alvo fora da coorte pública lida"); continue }
    if (text(row.candidato_id) !== text(profile.id)) { reject("candidato_id não confere com o perfil público"); continue }
    const resultado = text(row.resultado)
    if (resultado !== "encontrado" && resultado !== "vazio_confirmado") { reject(`resultado ${resultado ?? "ausente"} não fecha célula`); continue }
    const families = receiptFamilies(fonte, row.detalhe, row.url) ?? []
    if (families.length !== 1) { reject("recibo precisa mapear exatamente uma família"); continue }
    const familia = families[0]
    const key = `${alvo}|${fonte}|${familia}`
    if (seen.has(key)) { reject("recibo duplicado para a mesma ficha, fonte e família"); continue }
    // A régua completa, só com este recibo: o que ele sozinho faz com a célula.
    const probe = { ...row, executado_em: new Date(Date.now() - 1000).toISOString() }
    const joins = adaptLatestReceipts([probe], [profile]).joins
    const cell = buildCoverageMatrix([profile], [], joins).cells.find((item) => item.familia === familia)
    if (!cell || (cell.estado !== "publicado" && cell.estado !== "vazio_confirmado")) {
      reject(`a régua não fecha ${familia} com este recibo (${cell?.estado ?? "sem célula"})`)
      continue
    }
    // Famílias anuais: o detalhe precisa dizer quais eleições a prova cobre,
    // para que recibo de outro ano na mesma fonte não seja lido como substituto.
    let detail: Record<string, unknown> | null = null
    try { detail = typeof row.detalhe === "string" ? JSON.parse(row.detalhe) as Record<string, unknown> : row.detalhe as Record<string, unknown> ?? null } catch { detail = null }
    const revisions = Array.isArray((detail?.coverage_proof as Record<string, unknown> | undefined)?.source_revisions)
      ? (detail!.coverage_proof as Record<string, unknown>).source_revisions as Array<Record<string, unknown>> : []
    const years = [...new Set(revisions.map((revision) => Number(revision?.year)).filter((year) => Number.isInteger(year) && year > 1900))].sort((a, b) => a - b)
    if (["patrimonio", "financiamento", "historico_politico"].includes(familia) && years.length === 0) {
      reject("prova sem os anos/eleições cobertos")
      continue
    }
    seen.add(key)
    planned.push({
      fonte, escopo: "candidato", alvo, candidato_id: text(profile.id)!, resultado,
      volume: resultado === "encontrado" ? Math.max(1, Math.trunc(Number(row.volume) || 1)) : 0,
      url: text(row.url), detalhe: detail ? JSON.stringify({ ...detail, anos_cobertos: years }) : null,
      familia, estado_projetado: cell.estado,
    })
  }
  return { planned, rejected }
}

function arg(name: string): string | null {
  const prefix = `--${name}=`
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) ?? null
}

async function loadProfiles(slugs: string[]): Promise<CoverageProfile[]> {
  const file = arg("profiles")
  if (file) return JSON.parse(readFileSync(resolve(file), "utf8")) as CoverageProfile[]
  const base = (arg("base-url") ?? "https://puxaficha.com.br").replace(/\/$/, "")
  const profiles: CoverageProfile[] = []
  for (const slug of slugs) {
    let response = await fetch(`${base}/api/candidato-profile/${encodeURIComponent(slug)}`, { headers: { accept: "application/json" } })
    // A rota pública limita por IP; 429 é espera, não ausência.
    for (let attempt = 1; response.status === 429 && attempt <= 5; attempt++) {
      await new Promise((accept) => setTimeout(accept, 5_000 * attempt))
      response = await fetch(`${base}/api/candidato-profile/${encodeURIComponent(slug)}`, { headers: { accept: "application/json" } })
    }
    if (!response.ok) throw new Error(`perfil ${slug}: HTTP ${response.status}`)
    const envelope = await response.json() as { data?: CoverageProfile; sourceStatus?: unknown }
    if (envelope.sourceStatus !== "live" || envelope.data?.slug !== slug) throw new Error(`perfil ${slug} não publicado ou divergente`)
    profiles.push(envelope.data)
    await new Promise((accept) => setTimeout(accept, 250))
  }
  return profiles
}

function writePrivate(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" })
}

async function main(): Promise<void> {
  const input = arg("in")
  const outDir = arg("out-dir")
  const allow = new Set((arg("allow-fonte") ?? "").split(",").map((item) => item.trim()).filter(Boolean))
  const apply = process.argv.includes("--apply")
  if (!input || !outDir || allow.size === 0) throw new Error("use --in=, --out-dir= e --allow-fonte=")
  const raw = JSON.parse(readFileSync(resolve(input), "utf8")) as { receipts?: LatestReceiptRow[]; rows?: LatestReceiptRow[] } | LatestReceiptRow[]
  const rows = Array.isArray(raw) ? raw : raw.receipts ?? raw.rows ?? []
  const slugs = [...new Set(rows.map((row) => text(row.alvo)).filter((slug): slug is string => Boolean(slug)))]
  const profiles = await loadProfiles(slugs)
  const plan = planCoverageReceipts(rows, profiles, allow)
  mkdirSync(resolve(outDir), { recursive: true, mode: 0o700 })
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const byFamily: Record<string, number> = {}
  for (const item of plan.planned) byFamily[`${item.fonte}|${item.familia}|${item.estado_projetado}`] = (byFamily[`${item.fonte}|${item.familia}|${item.estado_projetado}`] ?? 0) + 1
  writePrivate(resolve(outDir, `plano-${stamp}.json`), { mode: apply ? "apply" : "dry-run", input: resolve(input), profiles_read: profiles.length, by_family: byFamily, planned: plan.planned, rejected: plan.rejected })
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", entrada: rows.length, planejados: plan.planned.length, recusados: plan.rejected.length, por_familia: byFamily }))
  if (!apply) return

  const execucao = arg("execucao")
  if (!execucao || !/^[a-z0-9][a-z0-9:._-]{2,80}$/i.test(execucao)) throw new Error("--apply exige --execucao=<id único da rodada>")
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("--apply exige SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY")
  const { createClient } = await import("@supabase/supabase-js")
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const already = await db.from("coleta_log").select("id", { count: "exact", head: true }).eq("execucao", execucao)
  if (already.error) throw new Error(already.error.message)
  if ((already.count ?? 0) > 0) throw new Error(`execução ${execucao} já tem ${already.count} linha(s); nada gravado`)
  // Backup: último recibo de cada (alvo, fonte) afetado, antes do INSERT.
  const backup: unknown[] = []
  for (const item of plan.planned) {
    const { data, error } = await db.from("coleta_log").select("id,fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,url,execucao")
      .eq("alvo", item.alvo).eq("fonte", item.fonte).eq("escopo", "candidato").order("executado_em", { ascending: false }).limit(1)
    if (error) throw new Error(error.message)
    backup.push({ alvo: item.alvo, fonte: item.fonte, anterior: data?.[0] ?? null })
  }
  writePrivate(resolve(outDir, `backup-${stamp}.json`), { execucao, backup })
  const insertRows = plan.planned.map((item) => ({
    fonte: item.fonte, escopo: item.escopo, alvo: item.alvo, candidato_id: item.candidato_id, resultado: item.resultado,
    volume: item.volume, url: item.url, detalhe: item.detalhe, execucao, duracao_ms: null,
  }))
  const inserted = await db.from("coleta_log").insert(insertRows).select("id,alvo,fonte,resultado")
  if (inserted.error) throw new Error(inserted.error.message)
  const ids = (inserted.data ?? []).map((row) => row.id as number)
  const readback = await db.from("coleta_log").select("id", { count: "exact", head: true }).eq("execucao", execucao)
  const ok = !readback.error && readback.count === insertRows.length && ids.length === insertRows.length
  writePrivate(resolve(outDir, `aplicacao-${stamp}.json`), { execucao, planejados: insertRows.length, inseridos: ids.length, readback: readback.count ?? null, ok, ids, rollback: `delete from coleta_log where execucao = '${execucao}' and id = any(array[${ids.join(",")}])` })
  console.log(JSON.stringify({ execucao, inseridos: ids.length, readback: readback.count ?? null, ok }))
  if (!ok) throw new Error("readback não confere com o planejado")
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})

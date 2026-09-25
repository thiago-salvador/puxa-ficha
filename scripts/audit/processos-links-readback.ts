import { createHash } from "node:crypto"
import { mkdirSync, chmodSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { createClient } from "@supabase/supabase-js"
import { cnjValido } from "../gerar-migration-processos-curadoria"
import { stripAccents } from "../../src/lib/strip-accents"

export type ProcessoLinkRow = {
  id: string
  candidato_id: string
  slug: string
  nome_completo: string
  numero_processo: string | null
  url_fonte: string | null
  tribunal: string | null
  tipo: string | null
}

export type OfficialReadback = {
  status: number
  body: string
  url: string
}

type DjenItem = {
  numero_processo?: unknown
  numeroprocessocommascara?: unknown
  ativo?: unknown
  destinatarios?: unknown
}

export type LinkDecision = {
  id: string
  slug: string
  nome_completo: string
  numero_processo: string | null
  original_url: string | null
  decision: "revisao_editorial" | "omitir_contagem"
  reason: string
  official_url: string | null
  official_status: number | null
  official_body_sha256: string | null
}

const DJEN = "https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=100&numeroProcesso="
const CNJ = /^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/

export function isOfficialCourtUrl(value: string | null): boolean {
  if (!value) return false
  try {
    const url = new URL(value)
    // The baseline and public contract use the literal host form `*.jus.br`.
    // A port-bearing PJe document URL is retained as an external legacy link
    // and must be reconciled through the canonical readback below.
    return url.protocol === "https:" && !/^https:\/\/[^/]+:\d+(?:\/|$)/i.test(value) && (url.hostname === "jus.br" || url.hostname.endsWith(".jus.br"))
  } catch {
    return false
  }
}

export function canonicalDjenUrl(numero: string): string | null {
  if (!CNJ.test(numero) || !cnjValido(numero)) return null
  return `${DJEN}${numero.replace(/\D/g, "")}`
}

function normalize(value: string): string {
  return stripAccents(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

function djenItems(body: string): DjenItem[] | null {
  try {
    const parsed: unknown = JSON.parse(body)
    if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { items?: unknown }).items)) return null
    return (parsed as { items: unknown[] }).items.filter((item): item is DjenItem => Boolean(item) && typeof item === "object")
  } catch {
    return null
  }
}

function itemMatches(item: DjenItem, numero: string, nome: string): boolean {
  const expectedCnj = numero.replace(/\D/g, "")
  const itemCnj = String(item.numero_processo ?? item.numeroprocessocommascara ?? "").replace(/\D/g, "")
  if (item.ativo !== true || itemCnj !== expectedCnj || !Array.isArray(item.destinatarios)) return false
  return item.destinatarios.some((destinatario) => {
    if (!destinatario || typeof destinatario !== "object") return false
    return normalize(String((destinatario as { nome?: unknown }).nome ?? "")) === normalize(nome)
  })
}

export function decideLink(row: ProcessoLinkRow, official: OfficialReadback | null): LinkDecision {
  const base = { id: row.id, slug: row.slug, nome_completo: row.nome_completo, numero_processo: row.numero_processo, original_url: row.url_fonte }
  if (isOfficialCourtUrl(row.url_fonte)) {
    return { ...base, decision: "revisao_editorial", reason: "URL judicial oficial requer revisão nominal antes de qualquer contagem", official_url: row.url_fonte, official_status: null, official_body_sha256: null }
  }
  const officialUrl = row.numero_processo ? canonicalDjenUrl(row.numero_processo) : null
  if (!officialUrl) return { ...base, decision: "omitir_contagem", reason: "sem CNJ válido para consulta oficial exata", official_url: null, official_status: null, official_body_sha256: null }
  if (!official) return { ...base, decision: "omitir_contagem", reason: "readback oficial não executado", official_url: officialUrl, official_status: null, official_body_sha256: null }
  const items = djenItems(official.body)
  const matched = items?.some((item) => itemMatches(item, row.numero_processo!, row.nome_completo)) ?? false
  const digest = createHash("sha256").update(official.body).digest("hex")
  if (official.status >= 200 && official.status < 300 && matched) {
    return { ...base, decision: "revisao_editorial", reason: "DJEN oficial contém item ativo com CNJ exato e destinatário nominal exato; falta segundo identificador para decisão definitiva", official_url: official.url, official_status: official.status, official_body_sha256: digest }
  }
  return { ...base, decision: "omitir_contagem", reason: `readback estruturado não confirmou item ativo, CNJ e destinatário exatos (status=${official.status}, itens=${items?.length ?? "inválido"}, matched=${matched})`, official_url: official.url, official_status: official.status, official_body_sha256: digest }
}

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error("SUPABASE_URL e SUPABASE_ANON_KEY são obrigatórios")
  const supabase = createClient(url, key, { auth: { persistSession: false } })
  const { data: candidatos, error: candidatoError } = await supabase.from("candidatos_publico").select("id,slug,nome_completo")
  if (candidatoError || !candidatos) throw new Error(`candidatos_publico: ${candidatoError?.message ?? "sem dados"}`)
  const byId = new Map(candidatos.map((c) => [c.id as string, c]))
  const processos: Array<Record<string, unknown>> = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from("processos").select("id,candidato_id,numero_processo,url_fonte,tribunal,tipo").order("id").range(offset, offset + 999)
    if (error) throw new Error(`processos: ${error.message}`)
    processos.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  // The baseline counts links with a process-specific path, tribunal, or CNJ.
  // A bare publisher home page with none of those signals is outside this
  // 26-line reconciliation scope.
  const rows = processos.filter((p) => {
    if (!byId.has(String(p.candidato_id)) || !p.url_fonte || isOfficialCourtUrl(String(p.url_fonte))) return false
    if (p.tribunal || p.numero_processo) return true
    try { return new URL(String(p.url_fonte)).pathname !== "/" } catch { return true }
  }).map((p) => {
    const c = byId.get(String(p.candidato_id))!
    return { id: String(p.id), candidato_id: String(p.candidato_id), slug: String(c.slug), nome_completo: String(c.nome_completo), numero_processo: p.numero_processo == null ? null : String(p.numero_processo), url_fonte: String(p.url_fonte), tribunal: p.tribunal == null ? null : String(p.tribunal), tipo: p.tipo == null ? null : String(p.tipo) }
  })
  const decisions: LinkDecision[] = []
  for (const row of rows) {
    const officialUrl = row.numero_processo ? canonicalDjenUrl(row.numero_processo) : null
    let readback: OfficialReadback | null = null
    if (officialUrl) {
      const response = await fetch(officialUrl, { signal: AbortSignal.timeout(30_000) })
      readback = { status: response.status, body: await response.text(), url: officialUrl }
    }
    decisions.push(decideLink(row, readback))
  }
  const evidencePath = process.env.LINKS_EVIDENCE_PATH
  if (!evidencePath) throw new Error("LINKS_EVIDENCE_PATH obrigatorio para salvar o readback")
  const output = resolve(evidencePath)
  mkdirSync(resolve(output, ".."), { recursive: true, mode: 0o700 })
  const packageData = { schema_version: 2, generated_at: new Date().toISOString(), source: { table: "candidatos_publico + processos", mode: "read-only", supabase_url: url }, total_external_lines: decisions.length, official_matches_in_editorial_review: decisions.filter((d) => d.decision === "revisao_editorial").length, omitted_from_count: decisions.filter((d) => d.decision === "omitir_contagem").length, decisions }
  writeFileSync(output, `${JSON.stringify(packageData, null, 2)}\n`, { mode: 0o600 })
  chmodSync(output, 0o600)
  console.log(JSON.stringify({ output, total_external_lines: packageData.total_external_lines, official_matches_in_editorial_review: packageData.official_matches_in_editorial_review, omitted_from_count: packageData.omitted_from_count }))
}

if (process.argv[1]?.endsWith("processos-links-readback.ts")) void main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 })

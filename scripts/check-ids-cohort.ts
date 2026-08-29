/**
 * Fase 2.3 (2026-04-16) — health check remoto de IDs da coorte.
 *
 * Relatorio read-only que, para cada slug em `data/candidatos.json` com
 * `ids.camara` ou `ids.senado` preenchido, consulta a API publica oficial
 * (dadosabertos.camara.leg.br, legis.senado.leg.br) e classifica o ID como:
 *
 *   - ok          : nome normalizado bate (name-unique or name-contains) e,
 *                   quando o seed tem `estado`, UF da API bate com o seed.
 *   - mismatch    : nome normalizado nao bate OR UF diverge quando seed tem.
 *   - not_found   : API respondeu 404.
 *   - error       : falha de rede / timeout / shape inesperado.
 *
 * **Nao escreve em DB. Nao altera seed.** So emite relatorio em texto (stdout)
 * e opcionalmente JSON (`--json` ou `--output=PATH`). O modo `--fail-on-mismatch`
 * tambem funciona como gate fail-closed: qualquer mismatch, not_found ou erro
 * depois das tentativas configuradas reprova a execucao.
 *
 * Contrato de match (ver curadoria interna, Fluxo 1):
 *   - Usar `normalizeForMatch` (NFD + strip combining + UPPER + trim), igual
 *     ao resolver TSE e ao ingest Camara/Senado. Base compartilhada evita
 *     drift de semantica entre health check e ingest.
 *   - Aceitar como nome canonico remoto: Camara `ultimoStatus.nome` OU
 *     `ultimoStatus.nomeEleitoral` OU top-level `nomeCivil`. Para Senado:
 *     `IdentificacaoParlamentar.NomeParlamentar` OU `NomeCompletoParlamentar`.
 *   - Nome bate se qualquer variante remota bate (via `namesLookCompatible`,
 *     mesma logica do `ingest-camara.ts`) contra `nome_completo` OU
 *     `nome_urna` do seed.
 *   - UF so e comparada quando `seed.estado` esta presente e a API retornou
 *     campo equivalente (Camara `siglaUf`, Senado `UfParlamentar`). Para
 *     slugs Presidente (sem `estado`) a UF e ignorada.
 *
 * CLI flags:
 *   --json                 emite JSON em stdout (logs vao pra stderr)
 *   --output=PATH          grava JSON em PATH (alem do stdout legivel)
 *   --slug=slug-a,slug-b   filtra por lista de slugs
 *   --only=camara|senado   so checa aquele campo
 *   --skip-remote          pula chamadas HTTP (contrato-only, util em CI)
 *   --timeout-ms=N         default 15000
 *   --max-retries=N        default 2
 *   --fail-on-mismatch     exit 1 se houver mismatch/not_found/error
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"

import type { CandidatoConfig } from "./lib/types"
import { namesLookCompatible } from "./lib/name-match"
import { normalizeForMatch } from "./lib/normalize-for-match"

export { namesLookCompatible } from "./lib/name-match"

export const CAMARA_API_BASE = "https://dadosabertos.camara.leg.br/api/v2"
export const SENADO_API_BASE = "https://legis.senado.leg.br/dadosabertos"

// ── Tipos publicos (testaveis) ─────────────────────────────────────

export type CheckStatus = "ok" | "mismatch" | "not_found" | "error" | "skipped"

export interface RemoteIdentity {
  /** Nome principal retornado pela API. */
  name: string
  /** Nomes alternativos (ex: nomeCivil, nomeEleitoral). */
  aliases: string[]
  /** UF quando disponivel (Camara: siglaUf, Senado: UfParlamentar). */
  uf?: string
  /** Metadata bruto pra debug; nao e parte do contrato estavel. */
  raw?: Record<string, unknown>
}

export interface CheckResult {
  slug: string
  source: "camara" | "senado"
  id: number
  status: CheckStatus
  seed: {
    nome_completo: string
    nome_urna: string
    estado: string | null
  }
  remote: RemoteIdentity | null
  reasons: string[]
  http_status?: number
  error?: string
}

export interface ReportShape {
  generated_at: string
  cohort_size: number
  checks: {
    camara: number
    senado: number
    skipped: number
  }
  summary: Record<CheckStatus, number>
  results: CheckResult[]
}

// ── Pure helpers (testaveis sem rede) ──────────────────────────────

/**
 * Reaproveita a mesma heuristica do `ingest-camara.ts:namesLookCompatible`:
 * nomes sao compativeis se batem exatamente (post-normalize) OU se um esta
 * contido no outro. Isso aceita "ANDRE FIGUEIREDO" casando com
 * "ANDRE FIGUEIREDO PATRICIO" (nome civil vs nome eleitoral) sem exigir que
 * o seed registre todas as variantes.
 */
/**
 * Extrai identidade da resposta da Camara em `/deputados/{id}`.
 * Retorna null se a resposta nao tem os campos esperados (shape invalido).
 */
export function extractCamaraIdentity(raw: unknown): RemoteIdentity | null {
  if (!raw || typeof raw !== "object") return null
  const payload = (raw as Record<string, unknown>).dados
  if (!payload || typeof payload !== "object") return null
  const dep = payload as Record<string, unknown>
  const ultimoStatus = (dep.ultimoStatus ?? null) as Record<string, unknown> | null
  const name =
    (typeof ultimoStatus?.nome === "string" ? ultimoStatus.nome : null) ??
    (typeof ultimoStatus?.nomeEleitoral === "string" ? ultimoStatus.nomeEleitoral : null) ??
    (typeof dep.nomeCivil === "string" ? dep.nomeCivil : null)
  if (!name) return null
  const aliases: string[] = []
  if (typeof dep.nomeCivil === "string" && dep.nomeCivil !== name) aliases.push(dep.nomeCivil)
  if (typeof ultimoStatus?.nomeEleitoral === "string" && ultimoStatus.nomeEleitoral !== name) {
    aliases.push(ultimoStatus.nomeEleitoral)
  }
  if (typeof ultimoStatus?.nome === "string" && ultimoStatus.nome !== name) aliases.push(ultimoStatus.nome)
  const uf = typeof ultimoStatus?.siglaUf === "string" ? ultimoStatus.siglaUf : undefined
  return { name, aliases, uf }
}

/**
 * Extrai identidade da resposta do Senado em `/senador/{codigo}`. A API do
 * Senado empacota em `DetalheParlamentar.Parlamentar.IdentificacaoParlamentar`
 * com nomes em Pascal/UpperCamelCase (padrao legado). Variacoes observadas:
 * alguns endpoints retornam `ListaParlamentarLegislatura.Parlamentares.Parlamentar`
 * com shape ligeiramente diferente. Cobrimos ambos conservadoramente.
 */
export function extractSenadoIdentity(raw: unknown): RemoteIdentity | null {
  if (!raw || typeof raw !== "object") return null
  const obj = raw as Record<string, unknown>
  // Caminho canonico /senador/{id}:
  //   DetalheParlamentar.Parlamentar.IdentificacaoParlamentar
  const detalhe = obj.DetalheParlamentar as Record<string, unknown> | undefined
  const parlamentar = detalhe?.Parlamentar as Record<string, unknown> | undefined
  const ident = (parlamentar?.IdentificacaoParlamentar ??
    obj.IdentificacaoParlamentar ??
    parlamentar) as Record<string, unknown> | undefined
  if (!ident) return null
  const nomeParlamentar =
    typeof ident.NomeParlamentar === "string" ? ident.NomeParlamentar : null
  const nomeCompleto =
    typeof ident.NomeCompletoParlamentar === "string" ? ident.NomeCompletoParlamentar : null
  const name = nomeParlamentar ?? nomeCompleto
  if (!name) return null
  const aliases: string[] = []
  if (nomeCompleto && nomeCompleto !== name) aliases.push(nomeCompleto)
  if (nomeParlamentar && nomeParlamentar !== name && nomeParlamentar !== nomeCompleto) {
    aliases.push(nomeParlamentar)
  }
  const uf = typeof ident.UfParlamentar === "string" ? ident.UfParlamentar : undefined
  return { name, aliases, uf }
}

/**
 * Classifica um par (seed, remote) em ok | mismatch. Nome eh comparado via
 * `namesLookCompatible` contra `[nome_completo, nome_urna]` do seed cruzado
 * com `[remote.name, ...remote.aliases]`. UF so e validada quando o seed
 * declara `estado` (Governador). Se o remoto nao expoe UF, tratamos como
 * "nao sabemos" e nao penalizamos (reason `uf_unknown_on_remote` fica no
 * log mas nao vira mismatch).
 */
export function classifyMatch(
  seed: { nome_completo: string; nome_urna: string; estado: string | null },
  remote: RemoteIdentity,
): { status: "ok" | "mismatch"; reasons: string[] } {
  const reasons: string[] = []
  const nameOk = namesLookCompatible(
    [seed.nome_completo, seed.nome_urna],
    [remote.name, ...remote.aliases],
  )
  if (!nameOk) {
    reasons.push(
      `name_mismatch:seed=[${seed.nome_urna}] remote=[${[remote.name, ...remote.aliases].join(" | ")}]`,
    )
  }
  if (seed.estado) {
    if (!remote.uf) {
      reasons.push(`uf_unknown_on_remote:seed=${seed.estado}`)
    } else if (normalizeForMatch(remote.uf) !== normalizeForMatch(seed.estado)) {
      reasons.push(`uf_mismatch:seed=${seed.estado} remote=${remote.uf}`)
    }
  }
  // So name_mismatch e uf_mismatch contam como mismatch. uf_unknown e nota.
  const isMismatch = reasons.some((r) => r.startsWith("name_mismatch:") || r.startsWith("uf_mismatch:"))
  return { status: isMismatch ? "mismatch" : "ok", reasons }
}

// ── HTTP (isolado) ────────────────────────────────────────────────

interface FetchOutcome {
  status: "ok" | "not_found" | "error"
  http_status?: number
  body?: unknown
  error?: string
}

async function fetchJsonWithRetry(
  url: string,
  timeoutMs: number,
  maxRetries: number,
): Promise<FetchOutcome> {
  let lastErr: string | undefined
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal })
      if (res.status === 404) return { status: "not_found", http_status: 404 }
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("retry-after") ?? 0)
        const waitMs = retryAfter > 0 ? retryAfter * 1000 : 2000 * (attempt + 1)
        await new Promise((r) => setTimeout(r, Math.min(waitMs, 10_000)))
        continue
      }
      if (!res.ok) {
        lastErr = `HTTP ${res.status}`
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
        continue
      }
      const body = await res.json()
      return { status: "ok", http_status: res.status, body }
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err)
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
        continue
      }
    } finally {
      clearTimeout(timer)
    }
  }
  return { status: "error", error: lastErr ?? "unknown" }
}

// ── CLI ────────────────────────────────────────────────────────────

interface CliOptions {
  json: boolean
  outputPath: string | null
  slugFilter: Set<string> | null
  only: "camara" | "senado" | null
  skipRemote: boolean
  timeoutMs: number
  maxRetries: number
  failOnMismatch: boolean
}

export function parseCliArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    json: false,
    outputPath: null,
    slugFilter: null,
    only: null,
    skipRemote: false,
    timeoutMs: 15_000,
    maxRetries: 2,
    failOnMismatch: false,
  }
  for (const raw of argv) {
    if (raw === "--json") opts.json = true
    else if (raw === "--skip-remote") opts.skipRemote = true
    else if (raw === "--fail-on-mismatch") opts.failOnMismatch = true
    else if (raw.startsWith("--output=")) opts.outputPath = raw.slice("--output=".length)
    else if (raw.startsWith("--slug=")) {
      const list = raw
        .slice("--slug=".length)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
      opts.slugFilter = new Set(list)
    } else if (raw.startsWith("--only=")) {
      const v = raw.slice("--only=".length)
      if (v === "camara" || v === "senado") opts.only = v
    } else if (raw.startsWith("--timeout-ms=")) opts.timeoutMs = Number(raw.slice("--timeout-ms=".length))
    else if (raw.startsWith("--max-retries=")) opts.maxRetries = Number(raw.slice("--max-retries=".length))
  }
  return opts
}

/**
 * Define o contrato do gate remoto. Um relatorio com erro nao prova que a
 * coorte esta correta: a fonte nao respondeu mesmo depois dos retries. Por
 * isso, qualquer erro residual reprova, enquanto checks skipped continuam
 * informativos e nao sao confundidos com falha de fonte.
 */
export function shouldFailGate(summary: Partial<Record<CheckStatus, number>>): boolean {
  return (summary.mismatch ?? 0) > 0 || (summary.not_found ?? 0) > 0 || (summary.error ?? 0) > 0
}

function loadSeed(): CandidatoConfig[] {
  const path = resolve(process.cwd(), "data/candidatos.json")
  return JSON.parse(readFileSync(path, "utf-8"))
}

function logStderr(msg: string, jsonMode: boolean) {
  if (jsonMode) console.error(msg)
  else console.log(msg)
}

async function checkOne(
  slug: string,
  source: "camara" | "senado",
  id: number,
  seed: CheckResult["seed"],
  opts: CliOptions,
): Promise<CheckResult> {
  if (opts.skipRemote) {
    return {
      slug,
      source,
      id,
      status: "skipped",
      seed,
      remote: null,
      reasons: ["skipped_remote"],
    }
  }
  const url =
    source === "camara"
      ? `${CAMARA_API_BASE}/deputados/${id}`
      : `${SENADO_API_BASE}/senador/${id}`
  const outcome = await fetchJsonWithRetry(url, opts.timeoutMs, opts.maxRetries)
  if (outcome.status === "not_found") {
    return {
      slug,
      source,
      id,
      status: "not_found",
      seed,
      remote: null,
      reasons: ["http_404"],
      http_status: outcome.http_status,
    }
  }
  if (outcome.status === "error") {
    return {
      slug,
      source,
      id,
      status: "error",
      seed,
      remote: null,
      reasons: [`fetch_error:${outcome.error ?? "unknown"}`],
      error: outcome.error,
    }
  }
  const remote =
    source === "camara" ? extractCamaraIdentity(outcome.body) : extractSenadoIdentity(outcome.body)
  if (!remote) {
    return {
      slug,
      source,
      id,
      status: "error",
      seed,
      remote: null,
      reasons: ["shape_invalid:unexpected_payload"],
      error: "unexpected_payload",
    }
  }
  const { status, reasons } = classifyMatch(seed, remote)
  return { slug, source, id, status, seed, remote, reasons, http_status: outcome.http_status }
}

function formatHuman(results: CheckResult[], summary: Record<CheckStatus, number>): string {
  const lines: string[] = []
  lines.push("=== IDs Cohort Health Check (Fase 2.3) ===")
  lines.push(
    `summary: ok=${summary.ok ?? 0} mismatch=${summary.mismatch ?? 0} not_found=${summary.not_found ?? 0} error=${summary.error ?? 0} skipped=${summary.skipped ?? 0}`,
  )
  lines.push(`total_checks: ${results.length}`)
  const grouped = new Map<CheckStatus, CheckResult[]>()
  for (const r of results) {
    const arr = grouped.get(r.status) ?? []
    arr.push(r)
    grouped.set(r.status, arr)
  }
  const order: CheckStatus[] = ["mismatch", "not_found", "error", "ok", "skipped"]
  for (const status of order) {
    const arr = grouped.get(status) ?? []
    if (arr.length === 0) continue
    lines.push("")
    lines.push(`--- ${status} (${arr.length}) ---`)
    for (const r of arr) {
      const tag = r.source.toUpperCase()
      const seedUF = r.seed.estado ?? "—"
      const remoteName = r.remote?.name ?? "∅"
      const remoteUF = r.remote?.uf ?? "—"
      lines.push(
        `  [${tag}] ${r.slug} id=${r.id} seed(${r.seed.nome_urna}/${seedUF}) remote(${remoteName}/${remoteUF})`,
      )
      for (const reason of r.reasons) lines.push(`      · ${reason}`)
    }
  }
  return lines.join("\n")
}

async function runCli() {
  const opts = parseCliArgs(process.argv.slice(2))
  const seed = loadSeed()
  const slugs = opts.slugFilter
  const items = seed.filter((c) => !slugs || slugs.has(c.slug))

  let camaraCount = 0
  let senadoCount = 0
  let skippedCount = 0
  const results: CheckResult[] = []

  for (const c of items) {
    const seedShape: CheckResult["seed"] = {
      nome_completo: c.nome_completo,
      nome_urna: c.nome_urna,
      estado: c.estado ?? null,
    }
    if ((opts.only === null || opts.only === "camara") && c.ids?.camara != null) {
      camaraCount++
      const r = await checkOne(c.slug, "camara", c.ids.camara, seedShape, opts)
      results.push(r)
    }
    if ((opts.only === null || opts.only === "senado") && c.ids?.senado != null) {
      senadoCount++
      const r = await checkOne(c.slug, "senado", c.ids.senado, seedShape, opts)
      results.push(r)
    }
    // Candidatos sem camara/senado sao skipped silenciosamente (nao e gap do
    // ponto de vista de health check remoto; muitos Governadores/Presidentes
    // nao exercem cargo federal).
    if ((c.ids?.camara == null) && (c.ids?.senado == null)) skippedCount++
  }

  const summary: Record<CheckStatus, number> = {
    ok: 0,
    mismatch: 0,
    not_found: 0,
    error: 0,
    skipped: 0,
  }
  for (const r of results) summary[r.status] = (summary[r.status] ?? 0) + 1

  const report: ReportShape = {
    generated_at: new Date().toISOString(),
    cohort_size: seed.length,
    checks: { camara: camaraCount, senado: senadoCount, skipped: skippedCount },
    summary,
    results,
  }

  if (opts.outputPath) {
    const full = resolve(process.cwd(), opts.outputPath)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, JSON.stringify(report, null, 2) + "\n", "utf-8")
    logStderr(`wrote ${full}`, opts.json)
  }

  if (opts.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n")
  } else {
    console.log(formatHuman(results, summary))
  }

  if (opts.failOnMismatch && shouldFailGate(summary)) process.exit(1)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli().catch((err) => {
    console.error(err instanceof Error ? err.stack ?? err.message : String(err))
    process.exit(2)
  })
}

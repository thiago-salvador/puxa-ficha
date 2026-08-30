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
 *   --pace-ms=N            default 250; minimo entre requests ao mesmo host
 *   --circuit-failures=N   default 4; abre o circuito apos falhas consecutivas
 *   --circuit-cooldown-ms=N default 30000
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
  error_info?: ErrorTelemetry
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

export interface ErrorTelemetry {
  kind: "timeout" | "network" | "http" | "parse" | "circuit_open"
  name: string
  message: string
  attempts?: number
  code?: string
  cause?: {
    name: string
    message: string
    code?: string
  }
}

interface FetchOutcome {
  status: "ok" | "not_found" | "error"
  http_status?: number
  body?: unknown
  error?: string
  error_info?: ErrorTelemetry
}

type Sleep = (ms: number) => Promise<void>
type FetchImpl = typeof fetch

interface HostCircuit {
  generation: number
  consecutiveFailures: number
  openUntil: number
  lastRequestAt?: number
  /** O cooldown desta indisponibilidade ja foi consumido por uma tentativa half-open. */
  cooldownWaited: boolean
  halfOpen: boolean
  cooldownPromise?: Promise<void>
}

export interface RemoteFetchClientOptions {
  timeoutMs: number
  maxRetries: number
  paceMs?: number
  circuitFailureThreshold?: number
  circuitCooldownMs?: number
  fetchImpl?: FetchImpl
  sleep?: Sleep
  now?: () => number
}

const DEFAULT_PACE_MS = 250
const DEFAULT_CIRCUIT_FAILURE_THRESHOLD = 4
const DEFAULT_CIRCUIT_COOLDOWN_MS = 30_000
const MAX_TIMEOUT_MS = 120_000
const MAX_RETRIES = 10
const MAX_PACE_MS = 60_000
const MAX_CIRCUIT_FAILURE_THRESHOLD = 100
const MAX_CIRCUIT_COOLDOWN_MS = 300_000

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
}

function boundedNumber(value: number | undefined, fallback: number, min: number): number {
  return Number.isFinite(value) ? Math.max(min, value as number) : fallback
}

function sanitizeErrorText(value: unknown): string {
  const text = typeof value === "string" ? value : String(value)
  return text
    .replace(/https?:\/\/[^\s)]+/gi, "<redacted-url>")
    .replace(/([?&](?:token|key|secret|password|authorization|api[_-]?key)=)[^&\s]+/gi, "$1<redacted>")
    .slice(0, 240)
}

function errorPart(value: unknown): { name: string; message: string; code?: string } {
  if (value instanceof Error) {
    const code = (value as Error & { code?: unknown }).code
    return {
      name: value.name || "Error",
      message: sanitizeErrorText(value.message || "unknown"),
      ...(typeof code === "string" ? { code: sanitizeErrorText(code) } : {}),
    }
  }
  return { name: "UnknownError", message: sanitizeErrorText(value) }
}

function captureError(err: unknown, kind: ErrorTelemetry["kind"], attempts?: number): ErrorTelemetry {
  const primary = errorPart(err)
  const rawCause = err && typeof err === "object" && "cause" in err ? (err as { cause?: unknown }).cause : undefined
  const cause = rawCause === undefined ? undefined : errorPart(rawCause)
  return { kind, ...primary, ...(attempts === undefined ? {} : { attempts }), ...(cause ? { cause } : {}) }
}

function isAbortError(err: unknown): boolean {
  return err !== null && typeof err === "object" && "name" in err && (err as { name?: unknown }).name === "AbortError"
}

function formatError(info: ErrorTelemetry): string {
  const code = info.code ? `/${info.code}` : ""
  const cause = info.cause ? ` cause=${info.cause.name}${info.cause.code ? `/${info.cause.code}` : ""}` : ""
  return `${info.kind}:${info.name}${code}:${info.message}${cause}`
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500
}

/**
 * Cliente HTTP read-only com pacing por host, retries apenas para falhas
 * transientes e circuit breaker. O breaker reduz uma tempestade durante uma
 * indisponibilidade, mas cada chamada interrompida continua sendo `error`:
 * falha da fonte nunca vira sucesso nem `skipped`.
 */
export class RemoteFetchClient {
  private readonly circuits = new Map<string, HostCircuit>()
  private readonly paceTails = new Map<string, Promise<void>>()
  private readonly fetchImpl: FetchImpl
  private readonly sleep: Sleep
  private readonly now: () => number
  private readonly paceMs: number
  private readonly circuitFailureThreshold: number
  private readonly circuitCooldownMs: number

  constructor(private readonly options: RemoteFetchClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch
    this.sleep = options.sleep ?? sleepMs
    this.now = options.now ?? Date.now
    this.paceMs = boundedNumber(options.paceMs, DEFAULT_PACE_MS, 0)
    this.circuitFailureThreshold = boundedNumber(
      options.circuitFailureThreshold,
      DEFAULT_CIRCUIT_FAILURE_THRESHOLD,
      1,
    )
    this.circuitCooldownMs = boundedNumber(options.circuitCooldownMs, DEFAULT_CIRCUIT_COOLDOWN_MS, 0)
  }

  private async pace(host: string): Promise<void> {
    const previous = this.paceTails.get(host) ?? Promise.resolve()
    let release!: () => void
    const current = new Promise<void>((resolveRelease) => {
      release = resolveRelease
    })
    this.paceTails.set(host, current)
    await previous
    try {
      const circuit = this.circuits.get(host) ?? {
        generation: 0,
        consecutiveFailures: 0,
        openUntil: 0,
        cooldownWaited: false,
        halfOpen: false,
      }
      const elapsed = circuit.lastRequestAt === undefined ? this.paceMs : this.now() - circuit.lastRequestAt
      const waitMs = Math.max(0, this.paceMs - elapsed)
      if (waitMs > 0) await this.sleep(waitMs)
      circuit.lastRequestAt = this.now()
      this.circuits.set(host, circuit)
    } finally {
      release()
      if (this.paceTails.get(host) === current) this.paceTails.delete(host)
    }
  }

  private markSuccess(host: string): void {
    const circuit = this.circuits.get(host) ?? {
      generation: 0,
      consecutiveFailures: 0,
      openUntil: 0,
      cooldownWaited: false,
      halfOpen: false,
    }
    circuit.generation++
    circuit.cooldownPromise = undefined
    circuit.consecutiveFailures = 0
    circuit.openUntil = 0
    circuit.cooldownWaited = false
    circuit.halfOpen = false
    this.circuits.set(host, circuit)
  }

  private markFailure(host: string): void {
    const circuit = this.circuits.get(host) ?? {
      generation: 0,
      consecutiveFailures: 0,
      openUntil: 0,
      cooldownWaited: false,
      halfOpen: false,
    }
    circuit.generation++
    circuit.cooldownPromise = undefined
    circuit.consecutiveFailures++
    if (circuit.halfOpen || circuit.consecutiveFailures >= this.circuitFailureThreshold) {
      circuit.openUntil = this.now() + this.circuitCooldownMs
      circuit.halfOpen = false
    }
    this.circuits.set(host, circuit)
  }

  async get(url: string): Promise<FetchOutcome> {
    const host = new URL(url).host
    const circuit = this.circuits.get(host)
    let halfOpenProbe = false
    if (circuit?.halfOpen) {
      const info: ErrorTelemetry = {
        kind: "circuit_open",
        name: "CircuitOpen",
        message: `host=${host} half_open_probe_in_flight`,
      }
      return { status: "error", error: formatError(info), error_info: info }
    }
    if (circuit && circuit.openUntil > this.now()) {
      if (!circuit.cooldownWaited) {
        if (circuit.cooldownPromise) {
          await circuit.cooldownPromise
          const info: ErrorTelemetry = {
            kind: "circuit_open",
            name: "CircuitOpen",
            message: `host=${host} half_open_probe_in_flight`,
          }
          return { status: "error", error: formatError(info), error_info: info }
        }
        const generation = circuit.generation
        const cooldownPromise = this.sleep(circuit.openUntil - this.now()).then(() => {
          if (
            this.circuits.get(host) !== circuit ||
            circuit.generation !== generation ||
            circuit.cooldownPromise !== cooldownPromise
          ) {
            return
          }
          circuit.openUntil = 0
          circuit.cooldownWaited = true
          circuit.halfOpen = true
          circuit.cooldownPromise = undefined
          this.circuits.set(host, circuit)
        })
        circuit.cooldownPromise = cooldownPromise
        this.circuits.set(host, circuit)
        await cooldownPromise
        const refreshedAfterCooldown = this.circuits.get(host)
        if (
          refreshedAfterCooldown?.generation === generation &&
          refreshedAfterCooldown.cooldownPromise === undefined &&
          refreshedAfterCooldown.halfOpen
        ) {
          halfOpenProbe = true
        } else if (
          refreshedAfterCooldown?.halfOpen ||
          refreshedAfterCooldown?.cooldownPromise ||
          (refreshedAfterCooldown?.openUntil ?? 0) > this.now()
        ) {
          const info: ErrorTelemetry = {
            kind: "circuit_open",
            name: "CircuitOpen",
            message: `host=${host} cooldown_invalidated`,
          }
          return { status: "error", error: formatError(info), error_info: info }
        }
      } else {
        const info: ErrorTelemetry = {
          kind: "circuit_open",
          name: "CircuitOpen",
          message: `host=${host} cooldown_ms=${circuit.openUntil - this.now()}`,
        }
        return { status: "error", error: formatError(info), error_info: info }
      }
    } else if (circuit && circuit.openUntil > 0 && circuit.openUntil <= this.now()) {
      // Transicao sincronizada para half-open na fronteira exata do cooldown.
      circuit.openUntil = 0
      circuit.cooldownWaited = true
      circuit.halfOpen = true
      this.circuits.set(host, circuit)
      halfOpenProbe = true
    }

    let lastInfo: ErrorTelemetry | undefined
    for (let attempt = 0; attempt <= this.options.maxRetries; attempt++) {
      await this.pace(host)
      const refreshedCircuit = this.circuits.get(host)
      const refreshedNow = this.now()
      if (!halfOpenProbe && refreshedCircuit) {
        if (refreshedCircuit.halfOpen || refreshedCircuit.cooldownPromise || refreshedCircuit.openUntil > refreshedNow) {
          const info: ErrorTelemetry = {
            kind: "circuit_open",
            name: "CircuitOpen",
            message: `host=${host} blocked_after_pacing`,
          }
          return { status: "error", error: formatError(info), error_info: info }
        }
        if (refreshedCircuit.openUntil > 0 && refreshedCircuit.openUntil <= refreshedNow) {
          refreshedCircuit.openUntil = 0
          refreshedCircuit.cooldownWaited = true
          refreshedCircuit.halfOpen = true
          this.circuits.set(host, refreshedCircuit)
          halfOpenProbe = true
        }
      }
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), this.options.timeoutMs)
      try {
        const res = await this.fetchImpl(url, {
          headers: { Accept: "application/json" },
          signal: controller.signal,
        })
        if (res.status === 404) {
          this.markSuccess(host)
          return { status: "not_found", http_status: 404 }
        }
        if (!res.ok) {
          lastInfo = {
            kind: "http",
            name: "HttpError",
            message: `status=${res.status}`,
            code: String(res.status),
            attempts: attempt + 1,
          }
          if (!isRetryableStatus(res.status)) {
            this.markSuccess(host)
            break
          }
          if (attempt >= this.options.maxRetries) break
          const retryAfterSeconds = Number(res.headers.get("retry-after") ?? 0)
          const retryAfterMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : 0
          await this.sleep(Math.min(retryAfterMs || 500 * 2 ** attempt, 10_000))
          continue
        }
        let body: unknown
        try {
          body = await res.json()
        } catch (err) {
          if (isAbortError(err)) throw err
          lastInfo = captureError(err, "parse", attempt + 1)
          this.markSuccess(host)
          break
        }
        this.markSuccess(host)
        return { status: "ok", http_status: res.status, body }
      } catch (err) {
        lastInfo = captureError(
          err,
          isAbortError(err) ? "timeout" : "network",
          attempt + 1,
        )
        if (attempt >= this.options.maxRetries) break
        await this.sleep(Math.min(500 * 2 ** attempt, 8_000))
      } finally {
        clearTimeout(timer)
      }
    }

    const info = lastInfo ?? {
      kind: "network" as const,
      name: "UnknownError",
      message: "unknown",
    }
    const isTransient =
      info.kind === "network" ||
      info.kind === "timeout" ||
      (info.kind === "http" && isRetryableStatus(Number(info.code)))
    if (isTransient) this.markFailure(host)
    return { status: "error", error: formatError(info), error_info: info }
  }
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
  paceMs: number
  circuitFailureThreshold: number
  circuitCooldownMs: number
  failOnMismatch: boolean
}

function parseBoundedInteger(raw: string, flag: string, min: number, max: number): number {
  const value = Number(raw)
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${flag} deve ser um inteiro finito entre ${min} e ${max}`)
  }
  return value
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
    paceMs: DEFAULT_PACE_MS,
    circuitFailureThreshold: DEFAULT_CIRCUIT_FAILURE_THRESHOLD,
    circuitCooldownMs: DEFAULT_CIRCUIT_COOLDOWN_MS,
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
    } else if (raw.startsWith("--timeout-ms=")) {
      opts.timeoutMs = parseBoundedInteger(raw.slice("--timeout-ms=".length), "--timeout-ms", 1, MAX_TIMEOUT_MS)
    } else if (raw.startsWith("--max-retries=")) {
      opts.maxRetries = parseBoundedInteger(raw.slice("--max-retries=".length), "--max-retries", 0, MAX_RETRIES)
    } else if (raw.startsWith("--pace-ms=")) {
      opts.paceMs = parseBoundedInteger(raw.slice("--pace-ms=".length), "--pace-ms", 1, MAX_PACE_MS)
    } else if (raw.startsWith("--circuit-failures=")) {
      opts.circuitFailureThreshold = parseBoundedInteger(
        raw.slice("--circuit-failures=".length),
        "--circuit-failures",
        1,
        MAX_CIRCUIT_FAILURE_THRESHOLD,
      )
    } else if (raw.startsWith("--circuit-cooldown-ms=")) {
      opts.circuitCooldownMs = parseBoundedInteger(
        raw.slice("--circuit-cooldown-ms=".length),
        "--circuit-cooldown-ms",
        1,
        MAX_CIRCUIT_COOLDOWN_MS,
      )
    }
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
  client: RemoteFetchClient,
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
  const outcome = await client.get(url)
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
      error_info: outcome.error_info,
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
  const client = new RemoteFetchClient({
    timeoutMs: opts.timeoutMs,
    maxRetries: opts.maxRetries,
    paceMs: opts.paceMs,
    circuitFailureThreshold: opts.circuitFailureThreshold,
    circuitCooldownMs: opts.circuitCooldownMs,
  })

  for (const c of items) {
    const seedShape: CheckResult["seed"] = {
      nome_completo: c.nome_completo,
      nome_urna: c.nome_urna,
      estado: c.estado ?? null,
    }
    if ((opts.only === null || opts.only === "camara") && c.ids?.camara != null) {
      camaraCount++
      const r = await checkOne(c.slug, "camara", c.ids.camara, seedShape, opts, client)
      results.push(r)
    }
    if ((opts.only === null || opts.only === "senado") && c.ids?.senado != null) {
      senadoCount++
      const r = await checkOne(c.slug, "senado", c.ids.senado, seedShape, opts, client)
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

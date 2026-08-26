import { resolve } from "node:path"

import {
  avaliarEvidenciaAoVivo,
  escreverRelatorios,
  listarAlvosMonitoramento,
  obterContratoFonte,
  resultadoEvidenciaBloqueada,
  resultadoFonteIndisponivel,
  type EvidenciaPesquisaCandidata,
} from "./lib/pesquisas-monitoramento"
import {
  obterAdaptadorMonitoramento,
  parsePublicacaoMonitorada,
  type AlvoMonitoramento,
} from "./lib/pesquisas-monitoramento-adapters"
import {
  criarClienteHttpMonitoramento,
  type ClienteHttpMonitoramento,
} from "./lib/pesquisas-monitoramento-rede"
import {
  descobrirUrlZipTse,
  extrairCsvDoZipTse,
  parseRegistrosTse,
  type RegistroTseMonitoramento,
} from "./lib/pesquisas-monitoramento-tse"

interface Args {
  liveCheck: boolean
  out: string
  source: string
  uf: string | null
}

const OPTION_SETTERS: Record<string, (args: Args, value: string) => void> = {
  "--out": (args, value) => { args.out = value },
  "--source": (args, value) => { args.source = value },
  "--uf": (args, value) => { args.uf = value.toLocaleUpperCase("pt-BR") },
}

function assertSeparateValue(value: string, key: string): void {
  if (value.startsWith("--")) throw new Error(`valor ausente para ${key}`)
}

function optionValue(argv: string[], index: number, inlineValue: string | undefined, key: string): { consumedNext: boolean; value: string } {
  const value = inlineValue ? inlineValue : argv[index + 1]
  if (!value) throw new Error(`valor ausente para ${key}`)
  if (!inlineValue) assertSeparateValue(value, key)
  return { consumedNext: !inlineValue, value }
}

function applyOption(parsed: Args, argv: string[], index: number, arg: string): number {
  const [key, inlineValue] = arg.split("=", 2)
  const setter = OPTION_SETTERS[key]
  if (!setter) throw new Error(`argumento desconhecido: ${arg}`)
  const option = optionValue(argv, index, inlineValue, key)
  setter(parsed, option.value)
  return index + Number(option.consumedNext)
}

export function parseArgs(argv: string[]): Args {
  const parsed: Args = {
    liveCheck: false,
    out: ".artifacts/pesquisas-monitoramento",
    source: "all",
    uf: null,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--live-check") {
      parsed.liveCheck = true
      continue
    }
    index = applyOption(parsed, argv, index, arg)
  }
  return parsed
}

type MonitoringResult = ReturnType<typeof resultadoFonteIndisponivel>

interface CapturaAoVivo {
  evidence: EvidenciaPesquisaCandidata | null
  html: string | null
  observedAt: string | null
  target: AlvoMonitoramento
  result: MonitoringResult
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function sourceFailureReason(error: unknown): "source_timeout" | "source_unavailable" {
  return /timeout/i.test(errorMessage(error)) ? "source_timeout" : "source_unavailable"
}

function evidenceIsComplete(evidence: EvidenciaPesquisaCandidata, target: AlvoMonitoramento): boolean {
  return [
    evidence.registration.id === target.registration_id,
    evidence.scenario.office === target.office,
    evidence.scenario.geography_code === target.geography_code,
    evidence.scenario.turn === target.turn,
    evidence.sample.size > 0,
    evidence.results.length >= 2,
    Boolean(evidence.fieldwork.start),
    Boolean(evidence.fieldwork.end),
    /^[a-f0-9]{64}$/.test(evidence.evidence_sha256),
  ].every(Boolean)
}

async function collectSource(
  client: ClienteHttpMonitoramento,
  target: AlvoMonitoramento,
): Promise<CapturaAoVivo> {
  const source = obterContratoFonte(target.source_id)
  try {
    const response = await client.getText(target.url)
    const evidence = parsePublicacaoMonitorada({
      source,
      target,
      html: response.body,
      observedAt: response.observedAt,
    })
    if (!evidenceIsComplete(evidence, target)) throw new Error("evidencia publica incompleta")
    console.log(`SOURCE_ADAPTER_OBSERVED: ${target.source_id} ${target.poll_id}`)
    return {
      evidence,
      html: response.body,
      observedAt: response.observedAt,
      target,
      result: resultadoFonteIndisponivel("tse_registry_pending"),
    }
  } catch (error) {
    console.error(`[${target.poll_id}] ${errorMessage(error)}`)
    return {
      evidence: null,
      html: null,
      observedAt: null,
      target,
      result: resultadoFonteIndisponivel(sourceFailureReason(error)),
    }
  }
}

async function loadTseRegistry(client: ClienteHttpMonitoramento): Promise<RegistroTseMonitoramento[]> {
  const dataset = await client.getText("https://dadosabertos.tse.jus.br/dataset/pesquisas-eleitorais-2026")
  const zip = await client.getBytes(descobrirUrlZipTse(dataset.body))
  return parseRegistrosTse(extrairCsvDoZipTse(zip.body))
}

function reconcileCapture(capture: CapturaAoVivo, registry: RegistroTseMonitoramento[]): CapturaAoVivo {
  if (!capture.html || !capture.observedAt || !capture.evidence) return capture
  const source = obterContratoFonte(capture.target.source_id)
  return {
    ...capture,
    result: avaliarEvidenciaAoVivo({
      source,
      target: capture.target,
      html: capture.html,
      observedAt: capture.observedAt,
      registry,
    }),
  }
}

function buildSourceClient(targets: AlvoMonitoramento[]): ClienteHttpMonitoramento {
  const allowedOrigins = new Set<string>()
  for (const target of targets) {
    const adapter = obterAdaptadorMonitoramento(target.source_id)
    const origin = new URL(target.url).origin
    if (!adapter.allowed_origins.includes(origin)) {
      throw new Error(`origem fora da allowlist do adaptador: ${origin}`)
    }
    allowedOrigins.add(origin)
  }
  return criarClienteHttpMonitoramento({
    allowedOrigins: [...allowedOrigins],
    logger: (message) => console.error(`[monitor:fonte] ${message}`),
    maxBytes: 2_000_000,
  })
}

function buildTseClient(): ClienteHttpMonitoramento {
  return criarClienteHttpMonitoramento({
    allowedOrigins: ["https://dadosabertos.tse.jus.br", "https://cdn.tse.jus.br"],
    logger: (message) => console.error(`[monitor:tse] ${message}`),
    maxBytes: 20_000_000,
  })
}

function assertLiveCheck(args: Args, captures: CapturaAoVivo[]): void {
  if (!args.liveCheck) return
  const complete = captures.filter((capture) => (
    capture.evidence &&
    capture.result.decision.reason !== "tse_registry_unavailable" &&
    capture.result.decision.reason !== "tse_registry_pending"
  ))
  if (complete.length !== captures.length) {
    throw new Error(`dry-run real incompleto: ${complete.length}/${captures.length} combinações comprovadas`)
  }
  console.log(`MONITORAMENTO_LIVE_SOURCE_PASS: ${complete.length}/${captures.length}`)
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const targets = listarAlvosMonitoramento({ sourceId: args.source, uf: args.uf })
  if (targets.length === 0) {
    escreverRelatorios([], resolve(args.out))
    console.log("nenhuma combinação aprovada corresponde aos filtros")
    if (args.liveCheck) throw new Error("dry-run real não observou combinação aprovada")
    return
  }

  const sourceClient = buildSourceClient(targets)
  const captures: CapturaAoVivo[] = []
  for (const target of targets) captures.push(await collectSource(sourceClient, target))

  let reconciled = captures
  try {
    const registry = await loadTseRegistry(buildTseClient())
    reconciled = captures.map((capture) => reconcileCapture(capture, registry))
    console.log(`TSE_REGISTRY_OBSERVED: ${registry.length} registros`)
  } catch (error) {
    console.error(`TSE fail-closed: ${errorMessage(error)}`)
    reconciled = captures.map((capture) => capture.evidence
      ? { ...capture, result: resultadoEvidenciaBloqueada(capture.evidence, "tse_registry_unavailable") }
      : capture)
  }

  escreverRelatorios(
    reconciled.map((capture) => ({
      case_id: `${capture.target.poll_id}-live`,
      result: capture.result,
    })),
    resolve(args.out),
  )
  const eligible = reconciled.filter((capture) => capture.result.decision.eligible_for_human_review).length
  console.log(`dry-run concluído: ${reconciled.length} combinações, ${eligible} elegíveis; revisão humana obrigatória`)
  assertLiveCheck(args, reconciled)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})

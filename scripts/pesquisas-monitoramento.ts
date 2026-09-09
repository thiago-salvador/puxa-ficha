import { resolve } from "node:path"
import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { validarEntradasDescobertas } from "./lib/pesquisas-monitoramento-entrada"
import type { ObservacaoListagemPesquisas } from "./lib/pesquisas-monitoramento-descoberta"
import { consultarRegistroPesqele, type ObservacaoPesqele } from "./lib/pesquisas-monitoramento-pesqele"
import { descobrirRelatorioPoderData, extrairDocumentoPoderData, type DocumentoPoderData } from "./lib/pesquisas-monitoramento-poderdata-pdf"

import {
  avaliarEvidenciaAoVivo,
  escreverRelatorios,
  listarAlvosMonitoramento,
  obterContratoFonte,
  resultadoEvidenciaBloqueada,
  resultadoFonteIndisponivel,
  resultadoFalhaColeta,
  type EvidenciaPesquisaCandidata,
} from "./lib/pesquisas-monitoramento"
import {
  obterAdaptadorMonitoramento,
  extractPublicationDate,
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
  discovery: string | null
  discoveryOnly: boolean
}

const OPTION_SETTERS: Record<string, (args: Args, value: string) => void> = {
  "--out": (args, value) => { args.out = value },
  "--source": (args, value) => { args.source = value },
  "--uf": (args, value) => { args.uf = value.toLocaleUpperCase("pt-BR") },
  "--discovery": (args, value) => { args.discovery = value },
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
    discovery: null,
    discoveryOnly: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--discovery-only") { parsed.discoveryOnly = true; continue }
    if (arg === "--live-check") {
      parsed.liveCheck = true
      continue
    }
    index = applyOption(parsed, argv, index, arg)
  }
  if (parsed.discoveryOnly && !parsed.discovery) throw new Error("--discovery-only exige --discovery")
  return parsed
}

type MonitoringResult = ReturnType<typeof resultadoFonteIndisponivel>

interface CapturaAoVivo {
  evidence: EvidenciaPesquisaCandidata | null
  html: string | null
  observedAt: string | null
  target: AlvoMonitoramento
  result: MonitoringResult
  registrySupplement?: ObservacaoPesqele
  resultDocument?: DocumentoPoderData
  attempts?: Array<{ url: string; error: string; source_sha256: string | null }>
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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
  registrySupplement?: ObservacaoPesqele,
): Promise<CapturaAoVivo> {
  const source = obterContratoFonte(target.source_id)
  let observed: { body: string; observedAt: string } | null = null
  try {
    const response = await client.getText(target.url)
    observed = response
    let resultDocument: DocumentoPoderData | undefined
    if (target.source_id === "poderdata-aya-nacional-2026") {
      const pdfUrl = descobrirRelatorioPoderData(response.body, registrySupplement?.registry.field_end)
      const documentClient = criarClienteHttpMonitoramento({ allowedOrigins: ["https://static.poder360.com.br"], maxBytes: 5_000_000 })
      const pdf = await documentClient.getBytes(pdfUrl)
      resultDocument = extrairDocumentoPoderData({ bytes: pdf.body, url: pdfUrl, observedAt: pdf.observedAt, registrationId: target.registration_id, publicationDate: extractPublicationDate(response.body) })
    }
    const evidence = parsePublicacaoMonitorada({
      source,
      target,
      html: response.body,
      observedAt: response.observedAt,
      registrySupplement,
      resultDocument,
    })
    if (!evidenceIsComplete(evidence, target)) throw new Error("evidencia publica incompleta")
    console.log(`SOURCE_ADAPTER_OBSERVED: ${target.source_id} ${target.poll_id}`)
    return {
      evidence,
      html: response.body,
      observedAt: response.observedAt,
      target,
      registrySupplement,
      resultDocument,
      result: resultadoFonteIndisponivel("tse_registry_pending"),
    }
  } catch (error) {
    console.error(`[${target.poll_id}] ${errorMessage(error)}`)
    if (target.alternative_urls?.length) {
      const [url, ...remaining] = target.alternative_urls
      const next = await collectSource(client, { ...target, url, alternative_urls: remaining }, registrySupplement)
      next.attempts = [{ url: target.url, error: errorMessage(error), source_sha256: observed ? createHash("sha256").update(observed.body).digest("hex") : null }, ...(next.attempts ?? [])]
      return next
    }
    return {
      evidence: null,
      html: observed?.body ?? null,
      observedAt: observed?.observedAt ?? null,
      target,
      result: resultadoFalhaColeta({ detail: errorMessage(error), source_url: target.url, source_observed_at: observed?.observedAt ?? null, source_sha256: observed ? createHash("sha256").update(observed.body).digest("hex") : null }),
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
      registrySupplement: capture.registrySupplement,
      resultDocument: capture.resultDocument,
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
    if (target.source_id === "poderdata-aya-nacional-2026") allowedOrigins.add("https://static.poder360.com.br")
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
    capture.evidence?.scenario_complete && capture.evidence.publication_complete &&
    capture.result.decision.reason !== "registry_conflict" &&
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
  let targets = listarAlvosMonitoramento({ sourceId: args.source, uf: args.uf })
  const observations = new Map<string, ObservacaoPesqele>()
  let discoveryBlocked = false
  if (args.discovery) {
    const discovery = JSON.parse(readFileSync(resolve(args.discovery), "utf8")) as { observations: ObservacaoListagemPesquisas[] }
    if (!Array.isArray(discovery.observations)) throw new Error("manifesto de descoberta inválido")
    const intake = await validarEntradasDescobertas({ observations: discovery.observations, knownTargets: listarAlvosMonitoramento(), sourceId: args.source, uf: args.uf })
    intake.registry.forEach((observation) => observations.set(observation.registry.registration_id, observation))
    const merged = new Map((args.discoveryOnly ? [] : targets).map((target) => [target.poll_id, target]))
    intake.targets.forEach((target) => merged.set(target.poll_id, target))
    targets = [...merged.values()]
    discoveryBlocked = discovery.observations.some((observation) => observation.status !== "observed") || intake.entries.some((entry) => entry.status === "blocked")
    mkdirSync(resolve(args.out), { recursive: true })
    writeFileSync(resolve(args.out, "discovered-targets.json"), `${JSON.stringify(intake, null, 2)}\n`)
    console.log(`DISCOVERY_INTAKE: ${intake.targets.length} alvos; ${intake.entries.filter((entry) => entry.status === "blocked").length} URLs bloqueadas`)
  }
  if (targets.length === 0) {
    escreverRelatorios([], resolve(args.out))
    console.log("nenhuma combinação aprovada corresponde aos filtros")
    if (args.liveCheck) throw new Error("dry-run real não observou combinação aprovada")
    return
  }

  const sourceClient = buildSourceClient(targets)
  let registry: RegistroTseMonitoramento[] = []
  try {
    registry = await loadTseRegistry(buildTseClient())
  } catch (error) {
    console.error(`TSE dataset indisponível: ${errorMessage(error)}; consultar registro público PesqEle`)
  }
  // Public registry pages also contain methodology and confidence absent from news reports.
  for (const target of targets) {
    try {
      const observation = observations.get(target.registration_id) ?? await consultarRegistroPesqele(target.registration_id)
      observations.set(target.registration_id, observation)
      if (!registry.some((entry) => entry.registration_id === target.registration_id)) registry.push(observation.registry)
    } catch (error) {
      console.error(`[pesqele:${target.registration_id}] ${errorMessage(error)}`)
    }
  }
  mkdirSync(resolve(args.out), { recursive: true })
  writeFileSync(resolve(args.out, "tse-observations.json"), `${JSON.stringify([...observations.values()], null, 2)}\n`)
  const captures: CapturaAoVivo[] = []
  for (const target of targets) captures.push(await collectSource(sourceClient, target, observations.get(target.registration_id)))
  const htmlDirectory = resolve(args.out, "source-html")
  mkdirSync(htmlDirectory, { recursive: true })
  for (const capture of captures) {
    if (capture.html !== null && /^[a-z0-9-]+$/.test(capture.target.poll_id)) writeFileSync(resolve(htmlDirectory, `${capture.target.poll_id}.html.txt`), capture.html)
  }
  writeFileSync(resolve(args.out, "document-observations.json"), `${JSON.stringify(captures.flatMap((capture) => capture.resultDocument ? [capture.resultDocument] : []), null, 2)}\n`)
  writeFileSync(resolve(args.out, "source-attempts.json"), `${JSON.stringify(captures.map((capture) => ({ poll_id: capture.target.poll_id, selected_url: capture.target.url, failed_attempts: capture.attempts ?? [] })), null, 2)}\n`)

  let reconciled = captures
  try {
    if (registry.length === 0) throw new Error("nenhum registro TSE pôde ser consultado")
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
  if (args.liveCheck && discoveryBlocked) throw new Error("descoberta contém URLs sem conciliação")
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})

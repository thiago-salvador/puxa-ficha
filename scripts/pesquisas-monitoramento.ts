import { resolve } from "node:path"

import {
  avaliarEvidenciaAoVivo,
  escreverRelatorios,
  obterContratoFonte,
  parsePoderDataPublicacao,
  resultadoFonteIndisponivel,
} from "./lib/pesquisas-monitoramento"
import { criarClienteHttpMonitoramento } from "./lib/pesquisas-monitoramento-rede"
import {
  descobrirUrlZipTse,
  extrairCsvDoZipTse,
  parseRegistrosTse,
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

function parseArgs(argv: string[]): Args {
  const parsed: Args = {
    liveCheck: false,
    out: ".artifacts/pesquisas-monitoramento",
    source: "poderdata-aya-nacional-2026",
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

type Source = ReturnType<typeof obterContratoFonte>
type Client = ReturnType<typeof criarClienteHttpMonitoramento>
type MonitoringResult = ReturnType<typeof resultadoFonteIndisponivel>

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function skipUnsupportedGeography(args: Args, geographyCode: string | null): boolean {
  if (!args.uf || args.uf === geographyCode) return false
  escreverRelatorios([], resolve(args.out))
  console.log(`nenhum adaptador aprovado configurado para UF ${args.uf}`)
  if (args.liveCheck) throw new Error("teste manual nao observou fonte para a UF solicitada")
  return true
}

async function evaluateWithTse(client: Client, source: Source, html: string, observedAt: string, registrationId: string): Promise<MonitoringResult> {
  try {
    const dataset = await client.getText("https://dadosabertos.tse.jus.br/dataset/pesquisas-eleitorais-2026")
    const zip = await client.getBytes(descobrirUrlZipTse(dataset.body))
    const registry = parseRegistrosTse(extrairCsvDoZipTse(zip.body))
    const result = avaliarEvidenciaAoVivo({ source, html, observedAt, registry })
    if (registry.some((entry) => entry.registration_id === registrationId)) console.log("TSE_REGISTRY_OBSERVED")
    return result
  } catch (error) {
    console.error(`TSE fail-closed: ${errorMessage(error)}`)
    return resultadoFonteIndisponivel("tse_registry_unavailable")
  }
}

function evidenceIsComplete(evidence: ReturnType<typeof parsePoderDataPublicacao>, expectedRegistration: string): boolean {
  return [
    evidence.registration.id === expectedRegistration,
    evidence.sample.size > 0,
    Boolean(evidence.fieldwork.start),
    Boolean(evidence.fieldwork.end),
    /^[a-f0-9]{64}$/.test(evidence.evidence_sha256),
  ].every(Boolean)
}

function sourceFailureReason(error: unknown): "source_timeout" | "source_unavailable" {
  return /timeout/i.test(errorMessage(error)) ? "source_timeout" : "source_unavailable"
}

async function collectLive(client: Client, source: Source): Promise<{ liveObserved: boolean; result: MonitoringResult }> {
  const representative = source.representative_poll
  if (!representative) throw new Error("fonte sem rodada representativa no scorecard")
  try {
    const response = await client.getText(representative.result_url)
    const evidence = parsePoderDataPublicacao({ source, html: response.body, observedAt: response.observedAt })
    const liveObserved = evidenceIsComplete(evidence, representative.registration_id)
    const result = await evaluateWithTse(client, source, response.body, response.observedAt, evidence.registration.id)
    return { liveObserved, result }
  } catch (error) {
    console.error(errorMessage(error))
    return { liveObserved: false, result: resultadoFonteIndisponivel(sourceFailureReason(error)) }
  }
}

function assertLiveCheck(liveCheck: boolean, liveObserved: boolean): void {
  if (!liveCheck) return
  if (!liveObserved) throw new Error("fonte publica aprovada nao produziu evidencia controlada completa")
  console.log("MONITORAMENTO_LIVE_SOURCE_PASS")
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const source = obterContratoFonte(args.source)
  const representative = source.representative_poll
  if (!representative) throw new Error("fonte sem rodada representativa no scorecard")
  const geographyCode = representative.geography === "Brasil" ? "BR" : null
  if (skipUnsupportedGeography(args, geographyCode)) return

  const url = new URL(representative.result_url)
  const client = criarClienteHttpMonitoramento({
    allowedOrigins: [url.origin, "https://dadosabertos.tse.jus.br", "https://cdn.tse.jus.br"],
    logger: (message) => console.error(`[monitor] ${message}`),
    maxBytes: 20_000_000,
  })
  const { liveObserved, result } = await collectLive(client, source)

  escreverRelatorios([{ case_id: `${args.source}-live`, result }], resolve(args.out))
  console.log(`dry-run concluido: ${result.decision.classification}; revisao humana obrigatoria`)
  assertLiveCheck(args.liveCheck, liveObserved)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})

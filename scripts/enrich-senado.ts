import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import {
  loadPublishedSenadoCandidate,
  attachSenadoCuratedArtifacts,
  materializeSenadoEnrichmentConfig,
  planSenadoEnrichmentSources,
  readSenadoIdentityOverride,
  readSenadoBiographyArtifact,
  readSenadoMediaManifest,
  readSenadoNetworksManifest,
  readSenadoProfileFieldsManifest,
  readSenadoFederalReceiptManifest,
  readSenadoSourceManifest,
  runSenadoEnrichment,
} from "./lib/senado-enrichment"
import { emDryRun } from "./lib/dry-run"

export function assertLocalSupabaseEndpoint(raw: string): string {
  let url: URL
  try { url = new URL(raw) } catch { throw new Error("endpoint Supabase inválido") }
  if (!["http:", "https:"].includes(url.protocol) || !new Set(["localhost", "127.0.0.1", "::1"]).has(url.hostname) || url.username || url.password || url.search || url.hash) {
    throw new Error("enrich-senado só aceita endpoint localhost explícito")
  }
  return url.toString().replace(/\/$/, "")
}

function option(name: string): string | undefined {
  const prefix = `--${name}=`
  const inline = process.argv.find((value) => value.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function parseList(value: string | undefined): string[] | undefined {
  if (!value) return undefined
  const items = [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))]
  return items.length > 0 ? items : undefined
}

function parseYears(value: string | undefined): number[] | undefined {
  const years = parseList(value)?.map(Number)
  if (!years) return undefined
  if (years.some((year) => !Number.isSafeInteger(year) || year < 2000 || year > 2026)) throw new Error("--years contém ano inválido")
  return years
}

export function parseBoolean(value: string | undefined, name: string): boolean | undefined {
  if (value === undefined) return undefined
  if (value === "1" || value === "true") return true
  if (value === "0" || value === "false") return false
  throw new Error(`--${name} inválido: use 1/0`)
}

// Chaves do Supabase local: --key-file=<env> ou PF_LOCAL_KEY_FILE. Sem nenhum
// dos dois, usa o ambiente já carregado.
function loadKeyFile(path: string | undefined): void {
  const raw = path ?? process.env.PF_LOCAL_KEY_FILE
  if (!raw) return
  const target = resolve(raw)
  if (!existsSync(target)) throw new Error(`arquivo de chave local não encontrado: ${target}`)
  process.loadEnvFile(target)
}

async function main(): Promise<void> {
  const requestedDryRun = parseBoolean(option("dry-run"), "dry-run")
  // PF_DRY_RUN is an execution safety switch and therefore cannot be disabled
  // by a command-line value.
  const dryRun = emDryRun() || requestedDryRun === true
  const endpoint = assertLocalSupabaseEndpoint(option("endpoint") ?? "http://127.0.0.1:54321")
  loadKeyFile(option("key-file"))
  process.env.SUPABASE_URL = endpoint
  const slug = option("slug")
  if (!slug) throw new Error("--slug é obrigatório")
  const manifestOption = option("manifest")
  if (!manifestOption) throw new Error("--manifest é obrigatório")
  const manifestPath = resolve(manifestOption)
  let manifest = readSenadoSourceManifest(manifestPath)
  const biographyPath = option("biography")
  const mediaPath = option("media-manifest")
  const networksPath = option("networks-manifest")
  const profileFieldsPath = option("profile-fields-manifest")
  const federalReceiptsPath = option("federal-receipts-manifest")
  manifest = attachSenadoCuratedArtifacts(
    manifest,
    biographyPath ? readSenadoBiographyArtifact(biographyPath, manifest.identity_key) : undefined,
    mediaPath ? readSenadoMediaManifest(mediaPath) : undefined,
    networksPath ? readSenadoNetworksManifest(networksPath, manifest.identity_key) : undefined,
    profileFieldsPath ? readSenadoProfileFieldsManifest(profileFieldsPath, manifest.identity_key) : undefined,
    federalReceiptsPath ? readSenadoFederalReceiptManifest(federalReceiptsPath, manifest.identity_key) : undefined,
  )
  const candidate = await loadPublishedSenadoCandidate(slug)
  const overridePath = option("override")
  const override = overridePath ? readSenadoIdentityOverride(overridePath) : undefined
  const config = materializeSenadoEnrichmentConfig(candidate, manifest, override)
  const sources = parseList(option("sources"))
  const years = parseYears(option("years"))
  if (dryRun) {
    console.log(JSON.stringify({ mode: "dry-run", manifest: manifestPath, candidate: { id: candidate.id, slug: candidate.slug }, plans: planSenadoEnrichmentSources(config, sources) }, null, 2))
    return
  }
  const result = await runSenadoEnrichment(config, { requestedSources: sources, years })
  console.log(JSON.stringify({ manifest: manifestPath, candidate: { id: candidate.id, slug: candidate.slug }, plans: result.plans, results: result.results }, null, 2))
  if (result.exit_code !== 0) process.exitCode = result.exit_code
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}

/** Download local dos ZIPs eleitorais oficiais usados na prova de cobertura.
 *
 * Saída e manifesto ficam fora do repositório. O catálogo CKAN é consultado a
 * cada execução; recurso ausente ou ambíguo aborta antes do download.
 */
import { createHash } from "node:crypto"
import { createReadStream, createWriteStream, existsSync, mkdirSync, openSync, closeSync, readSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs"
import { basename, join, resolve } from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { pathToFileURL } from "node:url"
import { assertOutsideRepository } from "./lib/private-output"

type Family = "perfil_atual" | "historico_politico" | "patrimonio" | "financiamento"
type Resource = { name?: string; url?: string; format?: string }
type Catalog = { resources?: Resource[]; metadata_modified?: string }
type Asset = { family: Family; year: number; path: string; url: string; sha256: string; bytes: number; catalog_url: string; catalog_revision: string | null; reused_cache?: boolean }
type Pending = { family: Family; year: number; catalog_url: string; reason: string }

const CATALOG_BASE = "https://dadosabertos.tse.jus.br/api/3/action/package_show?id="
const MAX_BYTES = 2_000_000_000

function option(name: string): string | null {
  return process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null
}

function officialZip(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === "https:" && parsed.hostname === "cdn.tse.jus.br" && parsed.pathname.toLowerCase().endsWith(".zip")
  } catch { return false }
}

async function catalog(slug: string): Promise<{ url: string; data: Catalog }> {
  const url = `${CATALOG_BASE}${encodeURIComponent(slug)}`
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`${slug}: catálogo HTTP ${response.status}`)
  const body = await response.json() as { success?: boolean; result?: Catalog }
  if (body.success !== true || !Array.isArray(body.result?.resources)) throw new Error(`${slug}: catálogo sem recursos válidos`)
  return { url, data: body.result }
}

function select(resources: Resource[], family: Family, year: number): { name: string; url: string } {
  if (family === "financiamento") {
    const preferredNames = new Set([`prestacao_contas_${year}.zip`, `prestacao_final_${year}.zip`])
    const preferred = resources.filter((item) => typeof item.url === "string" && officialZip(item.url) && preferredNames.has(basename(new URL(item.url).pathname).toLowerCase()))
    if (preferred.length === 1) return { name: preferred[0]!.name ?? "", url: preferred[0]!.url! }
  }
  const exactPath = family === "financiamento"
    ? new RegExp(`/(?:prestacao_contas|prestacao_de_contas)[^/]*${year}[^/]*\\.zip$`, "i")
    : family === "patrimonio"
      ? new RegExp(`/bem_candidato_${year}\\.zip$`, "i")
      : new RegExp(`/consulta_cand_${year}\\.zip$`, "i")
  const matches = resources.filter((item) => typeof item.url === "string" && officialZip(item.url) && exactPath.test(new URL(item.url).pathname))
  const candidateNamed = family === "financiamento"
    ? matches.filter((item) => /candidat/i.test(item.name ?? "") || /candidat/i.test(item.url ?? ""))
    : []
  // Pleitos antigos publicam um único ZIP `prestacao_contas_<ano>.zip`, sem
  // a palavra candidato no nome do recurso. A seleção só é inequívoca quando
  // há exatamente esse único ZIP oficial no catálogo da eleição.
  const filtered = family === "financiamento" && candidateNamed.length === 0 && matches.length === 1
    ? matches
    : family === "financiamento" ? candidateNamed : matches
  if (filtered.length !== 1) throw new Error(`${family}/${year}: ${filtered.length} recursos oficiais inequívocos no catálogo`)
  return { name: filtered[0]!.name ?? "", url: filtered[0]!.url! }
}

async function download(url: string, path: string): Promise<{ sha256: string; bytes: number }> {
  const response = await fetch(url, { signal: AbortSignal.timeout(600_000) })
  if (!response.ok || !response.body) throw new Error(`${basename(path)}: HTTP ${response.status}`)
  let bytes = 0
  const hash = createHash("sha256")
  const source = Readable.fromWeb(response.body as never)
  async function* measured() {
    for await (const value of source) {
      const chunk = Buffer.from(value as Uint8Array)
      bytes += chunk.length
      if (bytes > MAX_BYTES) throw new Error(`${basename(path)} excede limite local de 2 GB`)
      hash.update(chunk)
      yield chunk
    }
  }
  await pipeline(Readable.from(measured()), createWriteStream(path, { mode: 0o600, flags: "wx" }))
  if (bytes < 4) throw new Error(`${basename(path)} vazio/incompleto`)
  const fd = openSync(path, "r")
  try {
    const magic = Buffer.alloc(4)
    readSync(fd, magic, 0, 4, 0)
    if (magic[0] !== 0x50 || magic[1] !== 0x4b || magic[2] !== 0x03 || magic[3] !== 0x04) throw new Error(`${basename(path)} não é ZIP`)
  } finally { closeSync(fd) }
  return { sha256: hash.digest("hex"), bytes }
}

async function fileSha256(path: string): Promise<string> {
  const hash = createHash("sha256")
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest("hex")
}

async function localCache(url: string, directory: string | null): Promise<{ path: string; sha256: string; bytes: number; reused_cache: true } | null> {
  if (!directory) return null
  const root = assertOutsideRepository(directory, "--cache-dir")
  const path = join(root, basename(new URL(url).pathname))
  if (!existsSync(path)) return null
  const fd = openSync(path, "r")
  try {
    const magic = Buffer.alloc(4)
    readSync(fd, magic, 0, 4, 0)
    if (magic[0] !== 0x50 || magic[1] !== 0x4b || magic[2] !== 0x03 || magic[3] !== 0x04) throw new Error(`cache não é ZIP: ${path}`)
  } finally { closeSync(fd) }
  return { path, sha256: await fileSha256(path), bytes: statSync(path).size, reused_cache: true }
}

async function main(): Promise<void> {
  const destination = option("destino")
  const years = option("years")?.split(",").map(Number) ?? []
  const selectedFamilies = new Set((option("families") ?? "perfil_atual,historico_politico,patrimonio,financiamento").split(","))
  if (!destination || !years.length || years.some((year) => !Number.isInteger(year) || year < 1996 || year > 2026) || new Set(years).size !== years.length) {
    throw new Error("uso: --destino=<pasta privada> --years=2018,2020,2022,2024,2026")
  }
  if (selectedFamilies.size === 0 || [...selectedFamilies].some((family) => !["perfil_atual", "historico_politico", "patrimonio", "financiamento"].includes(family))) {
    throw new Error("--families aceita perfil_atual,historico_politico,patrimonio,financiamento")
  }
  const out = assertOutsideRepository(destination, "destino")
  mkdirSync(out, { recursive: true, mode: 0o700 })
  const cacheDirectory = option("cache-dir")
  const assets: Asset[] = []
  const pending: Pending[] = []
  for (const year of years.sort((a, b) => a - b)) {
    const candidateSlug = year === 2020 ? "candidatos-2020-subtemas" : `candidatos-${year}`
    const candidateCatalog = await catalog(candidateSlug).catch(() => null)
    const financeCatalog = await catalog(`prestacao-de-contas-eleitorais-${year}`).catch(() => null)
    const requested: Array<{ family: Family; from: { url: string; data: Catalog } }> = []
    if (candidateCatalog) {
      requested.push(...(
        [
        { family: "perfil_atual", from: candidateCatalog },
        { family: "historico_politico", from: candidateCatalog },
        { family: "patrimonio", from: candidateCatalog },
        ] as Array<{ family: Family; from: { url: string; data: Catalog } }>
      ).filter((item) => selectedFamilies.has(item.family)))
    } else {
      for (const family of ["perfil_atual", "historico_politico", "patrimonio"] as const) {
        if (selectedFamilies.has(family)) pending.push({ family, year, catalog_url: `${CATALOG_BASE}${encodeURIComponent(candidateSlug)}`, reason: "catálogo oficial indisponível" })
      }
    }
    const downloaded = new Map<string, { path: string; sha256: string; bytes: number }>()
    for (const item of requested) {
      try {
        const resource = select(item.from.data.resources!, item.family, year)
        let local = downloaded.get(resource.url)
        if (!local) {
          local = await localCache(resource.url, cacheDirectory) ?? undefined
          if (local) downloaded.set(resource.url, local)
        }
        if (!local) {
          const filename = basename(new URL(resource.url).pathname)
          const temporary = join(out, `${filename}.${process.pid}.tmp`)
          try {
            const result = await download(resource.url, temporary)
            const path = join(out, `${filename.slice(0, -4)}-${result.sha256.slice(0, 12)}.zip`)
            if (existsSync(path)) {
              if (await fileSha256(path) !== result.sha256) throw new Error(`cache local diverge do SHA: ${path}`)
              rmSync(temporary, { force: true })
            } else renameSync(temporary, path)
            local = { path, ...result }
            downloaded.set(resource.url, local)
          } catch (error) {
            rmSync(temporary, { force: true })
            throw error
          }
        }
        assets.push({ family: item.family, year, path: local.path, url: resource.url, sha256: local.sha256, bytes: local.bytes, catalog_url: item.from.url, catalog_revision: item.from.data.metadata_modified ?? null, reused_cache: "reused_cache" in local ? true : undefined })
      } catch (error) {
        pending.push({ family: item.family, year, catalog_url: item.from.url, reason: error instanceof Error ? error.message : String(error) })
      }
    }
    if (!selectedFamilies.has("financiamento")) continue
    if (!financeCatalog) {
      pending.push({ family: "financiamento", year, catalog_url: `${CATALOG_BASE}${encodeURIComponent(`prestacao-de-contas-eleitorais-${year}`)}`, reason: "catálogo oficial indisponível" })
    } else {
      try {
        const resource = select(financeCatalog.data.resources!, "financiamento", year)
        const filename = basename(new URL(resource.url).pathname)
        const temporary = join(out, `${filename}.${process.pid}.tmp`)
        let local: { path: string; sha256: string; bytes: number; reused_cache?: boolean } | null = await localCache(resource.url, cacheDirectory)
        if (!local) {
        try {
          const result = await download(resource.url, temporary)
          const path = join(out, `${filename.slice(0, -4)}-${result.sha256.slice(0, 12)}.zip`)
          if (existsSync(path)) {
            if (await fileSha256(path) !== result.sha256) throw new Error(`cache local diverge do SHA: ${path}`)
            rmSync(temporary, { force: true })
          } else renameSync(temporary, path)
          local = { path, ...result }
        } catch (error) {
          rmSync(temporary, { force: true })
          throw error
        }
        }
        assets.push({ family: "financiamento", year, path: local.path, url: resource.url, sha256: local.sha256, bytes: local.bytes, catalog_url: financeCatalog.url, catalog_revision: financeCatalog.data.metadata_modified ?? null, reused_cache: "reused_cache" in local ? true : undefined })
      } catch (error) {
        pending.push({ family: "financiamento", year, catalog_url: financeCatalog.url, reason: error instanceof Error ? error.message : String(error) })
      }
    }
  }
  const manifest = { schema_version: 1, generated_at: new Date().toISOString(), assets, pending }
  const manifestPath = join(out, "tse-family-assets.json")
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600, flag: "wx" })
  console.log(JSON.stringify({ manifest: manifestPath, resources: new Set(assets.map((asset) => asset.path)).size, assets: assets.length, pending: pending.length, years }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 })
}

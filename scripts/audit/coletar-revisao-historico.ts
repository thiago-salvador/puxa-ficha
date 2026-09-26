/**
 * Coletor agendado de revisão do histórico político (fonte `tse-historico`).
 *
 * Lê os pacotes consulta_cand baixados por `fetch-tse-family-sources-local.ts`
 * (manifesto com URL oficial e SHA-256), os mandatos do Senado ao vivo e o
 * snapshot dos perfis públicos, e escreve um recibo por ficha num arquivo
 * privado. Não grava banco e não altera histórico: a gravação dos recibos é do
 * `apply-coverage-receipts.ts`, e as divergências vão para o arquivo de
 * revisão.
 *
 * Fonte indisponível vira recibo `erro` por ficha, nunca vazio:
 *   --falha-fonte="<motivo>"   quando o download do TSE nem começou;
 *   ano pedido em --anos sem pacote no manifesto;
 *   Senado sem resposta para quem tem ID ou linha do Senado.
 *
 * Uso:
 *   node --import tsx scripts/audit/coletar-revisao-historico.ts \
 *     --manifest=/privado/tse/tse-family-assets.json --anos=1996,1998,...,2026 \
 *     --public-profiles=/privado/perfis.json --out=/privado/historico-recibos.json \
 *     --revisao=/privado/historico-revisao.json [--candidatos=data/candidatos.json] \
 *     [--senado=live|off] [--checked-at=<ISO>]
 */
import { createHash } from "node:crypto"
import { execFileSync, spawn } from "node:child_process"
import { createReadStream, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { parse } from "csv-parse"
import type { CoverageProfile } from "./audit-cobertura-fichas"
import { assertOutsideRepository } from "./lib/private-output"
import {
  HISTORICO_FONTE,
  anchorIdentity,
  belongsToIdentity,
  historicoRevisionVerdict,
  seedAnchors,
  tseCandidacyFromCsv,
  type HistoricoReceipt,
  type HistoricoReviewItem,
  type HistoricoSourceRevision,
  type SeedCandidate,
  type SenadoSource,
  type TseCandidacyRow,
} from "./lib/historico-revisao"

const SENADO_API = "https://legis.senado.leg.br/dadosabertos"
const OFFICIAL_ZIP = /^https:\/\/cdn\.tse\.jus\.br\/.+\/consulta_cand_(\d{4})\.zip$/i

type ManifestAsset = { family: string; year: number; path: string; url: string; sha256: string }

function option(name: string): string | null {
  return process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null
}

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex")
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256")
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer)
  return hash.digest("hex")
}

export function parseAnos(raw: string | null): number[] {
  const anos = (raw ?? "").split(",").map((item) => Number(item.trim())).filter((year) => Number.isInteger(year))
  if (!anos.length || anos.some((year) => year < 1994 || year > 2026 || year % 2 !== 0) || new Set(anos).size !== anos.length) {
    throw new Error("--anos exige anos eleitorais pares entre 1994 e 2026, sem repetição")
  }
  return anos.sort((a, b) => a - b)
}

/** Recibo `erro` por ficha: a fonte não foi lida, então nada fecha e nada vira vazio. */
export function sourceFailureReceipts(profiles: readonly CoverageProfile[], motivo: string, anos: readonly number[], checkedAt: string, url: string | null): HistoricoReceipt[] {
  return profiles.filter((profile) => typeof profile.slug === "string" && typeof profile.id === "string").map((profile) => ({
    fonte: HISTORICO_FONTE, escopo: "candidato", alvo: profile.slug as string, candidato_id: profile.id as string,
    resultado: "erro", volume: 0, url, executado_em: checkedAt,
    detalhe: JSON.stringify({ contract_version: 1, kind: "historico-revisao", family: "historico_politico", motivo, anos_consultados: [...anos] }),
  }))
}

export function selectConsultaCandMembers(listing: string): string[] {
  const members = listing.split(/\r?\n/).map((item) => item.trim())
    .filter((member) => /consulta_cand_\d{4}_[a-z]+\.(?:csv|txt)$/i.test(member) && !/complementar/i.test(member))
  const national = members.filter((member) => /_brasil\.(?:csv|txt)$/i.test(member))
  return national.length === 1 ? national : members.filter((member) => !/_brasil\./i.test(member))
}

async function readZip(asset: ManifestAsset, onRow: (row: TseCandidacyRow) => void): Promise<void> {
  const listing = execFileSync("unzip", ["-Z1", asset.path], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 })
  const members = selectConsultaCandMembers(listing)
  if (!members.length) throw new Error(`consulta_cand ${asset.year}: ZIP sem CSV de candidaturas`)
  for (const member of members) {
    const child = spawn("unzip", ["-p", asset.path, member], { stdio: ["ignore", "pipe", "pipe"] })
    const exit = new Promise<number>((accept, reject) => { child.once("error", reject); child.once("close", (code) => accept(code ?? 1)) })
    child.stdout.setEncoding("latin1")
    const parser = child.stdout.pipe(parse({ delimiter: ";", columns: true, skip_empty_lines: true, relax_column_count: true, relax_quotes: true, cast: (value: string) => value.trim() }))
    for await (const raw of parser) {
      const row = tseCandidacyFromCsv(raw as Record<string, string>, asset.year)
      if (row) onRow(row)
    }
    if (await exit !== 0) throw new Error(`consulta_cand ${asset.year}: unzip falhou em ${member}`)
  }
}

function asArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
  return value && typeof value === "object" ? [value as Record<string, unknown>] : []
}

async function fetchSenado(codigo: string): Promise<SenadoSource> {
  const url = `${SENADO_API}/senador/${encodeURIComponent(codigo)}/mandatos.json`
  let last = "sem resposta"
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(30_000) })
      if (!response.ok) { last = `HTTP ${response.status}`; if (response.status < 500 && response.status !== 429) break }
      else {
        const bytes = Buffer.from(await response.arrayBuffer())
        const json = JSON.parse(bytes.toString("utf8")) as Record<string, unknown>
        const parlamentar = (json.MandatoParlamentar as Record<string, unknown> | undefined)?.Parlamentar as Record<string, unknown> | undefined
        if (!parlamentar) return { status: "erro", url, motivo: "resposta sem MandatoParlamentar.Parlamentar" }
        const mandatos = asArray((parlamentar.Mandatos as Record<string, unknown> | undefined)?.Mandato)
        return { status: "ok", url, sha256: sha256(bytes), mandatos }
      }
    } catch (error) {
      last = error instanceof Error ? error.message : String(error)
    }
    await new Promise((accept) => setTimeout(accept, 2_000 * attempt))
  }
  return { status: "erro", url, motivo: last }
}

function writePrivate(path: string, value: unknown): void {
  const target = assertOutsideRepository(path, "saída")
  const temporary = `${target}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" })
  renameSync(temporary, target)
}

function summarize(receipts: readonly HistoricoReceipt[], review: readonly HistoricoReviewItem[]) {
  const porResultado: Record<string, number> = {}
  for (const receipt of receipts) porResultado[receipt.resultado] = (porResultado[receipt.resultado] ?? 0) + 1
  const porRevisao: Record<string, number> = {}
  for (const item of review) porRevisao[item.tipo] = (porRevisao[item.tipo] ?? 0) + 1
  return { recibos: receipts.length, por_resultado: porResultado, itens_revisao: review.length, revisao_por_tipo: porRevisao }
}

async function main(): Promise<void> {
  const anos = parseAnos(option("anos"))
  const out = option("out")
  const revisaoPath = option("revisao")
  const profilesPath = option("public-profiles")
  if (!out || !revisaoPath || !profilesPath) throw new Error("uso: --anos= --public-profiles= --out= --revisao= (--manifest= | --falha-fonte=)")
  const checkedAt = option("checked-at") ?? new Date().toISOString()
  if (!Number.isFinite(Date.parse(checkedAt))) throw new Error("--checked-at inválido")
  const profiles = JSON.parse(readFileSync(resolve(profilesPath), "utf8")) as CoverageProfile[]
  if (!Array.isArray(profiles) || !profiles.length) throw new Error("--public-profiles sem perfis")
  const falha = option("falha-fonte")
  const manifestPath = option("manifest")
  const finish = (receipts: HistoricoReceipt[], review: HistoricoReviewItem[]) => {
    writePrivate(out, { schema_version: 1, generated_at: checkedAt, fonte: HISTORICO_FONTE, anos, receipts })
    writePrivate(revisaoPath, { schema_version: 1, generated_at: checkedAt, itens: review })
    console.log(JSON.stringify(summarize(receipts, review)))
  }
  if (falha || !manifestPath || !existsSync(resolve(manifestPath))) {
    finish(sourceFailureReceipts(profiles, `pacote TSE não lido: ${falha ?? "manifesto ausente"}`, anos, checkedAt, null), [])
    return
  }
  const manifest = JSON.parse(readFileSync(resolve(manifestPath), "utf8")) as { assets?: ManifestAsset[]; pending?: Array<{ family?: string; year?: number; reason?: string }> }
  const assets = (manifest.assets ?? []).filter((asset) => asset.family === "historico_politico" && anos.includes(asset.year))
  const byYear = new Map<number, ManifestAsset>()
  for (const asset of assets) {
    const match = OFFICIAL_ZIP.exec(asset.url)
    if (!match || Number(match[1]) !== asset.year || !/^[a-f0-9]{64}$/i.test(asset.sha256) || !existsSync(asset.path)) throw new Error(`asset inválido ${asset.year}`)
    if (await sha256File(asset.path) !== asset.sha256.toLowerCase()) throw new Error(`SHA-256 divergente no pacote ${asset.year}`)
    byYear.set(asset.year, asset)
  }
  const missing = anos.filter((year) => !byYear.has(year))
  if (missing.length) {
    const reasons = (manifest.pending ?? []).filter((item) => item.family === "historico_politico" && missing.includes(Number(item.year))).map((item) => `${item.year}: ${item.reason ?? "?"}`)
    finish(sourceFailureReceipts(profiles, `pacote TSE ausente para ${missing.join(",")}${reasons.length ? ` (${reasons.join("; ").slice(0, 300)})` : ""}`, anos, checkedAt, null), [])
    return
  }
  const seed = JSON.parse(readFileSync(resolve(option("candidatos") ?? "data/candidatos.json"), "utf8")) as SeedCandidate[]
  const seedBySlug = new Map(seed.map((candidate) => [candidate.slug, candidate]))
  const wantedAnchors = new Set<string>()
  for (const profile of profiles) for (const anchor of seedAnchors(seedBySlug.get(String(profile.slug)) ?? { slug: "" })) wantedAnchors.add(`${anchor.year}|${anchor.sq}`)

  // Passo 1: linhas âncora (SQ do seed) de cada pacote.
  const anchorRows = new Map<string, TseCandidacyRow[]>()
  for (const asset of byYear.values()) {
    await readZip(asset, (row) => {
      const key = `${row.year}|${row.sq}`
      if (wantedAnchors.has(key)) anchorRows.set(key, [...(anchorRows.get(key) ?? []), row])
    })
  }
  const identities = new Map(profiles.map((profile) => {
    const candidate = seedBySlug.get(String(profile.slug)) ?? null
    return [String(profile.slug), candidate ? anchorIdentity(candidate, anchorRows) : { anchors: 0, anchorSource: null, cpfs: [], nomeNascimento: [], ambiguous: null }] as const
  }))
  const byCpf = new Map<string, string[]>()
  const byName = new Map<string, string[]>()
  for (const [slug, identity] of identities) {
    if (identity.ambiguous || !identity.anchors) continue
    for (const cpf of identity.cpfs) byCpf.set(cpf, [...(byCpf.get(cpf) ?? []), slug])
    for (const key of identity.nomeNascimento) byName.set(key, [...(byName.get(key) ?? []), slug])
  }

  // Passo 2: toda candidatura ligada à identidade ancorada, em todos os anos.
  const sourceRows = new Map<string, TseCandidacyRow[]>()
  for (const asset of byYear.values()) {
    await readZip(asset, (row) => {
      const slugs = row.cpf ? byCpf.get(row.cpf) : row.nomeNascimento ? byName.get(row.nomeNascimento) : undefined
      for (const slug of slugs ?? []) {
        if (belongsToIdentity(row, identities.get(slug)!)) sourceRows.set(slug, [...(sourceRows.get(slug) ?? []), row])
      }
    })
  }

  const tseRevisions: HistoricoSourceRevision[] = [...byYear.values()].map((asset) => ({ year: asset.year, url: asset.url, sha256: asset.sha256.toLowerCase() }))
  const senadoMode = option("senado") ?? "live"
  const receipts: HistoricoReceipt[] = []
  const review: HistoricoReviewItem[] = []
  for (const profile of profiles) {
    if (typeof profile.slug !== "string" || typeof profile.id !== "string") continue
    const candidate = seedBySlug.get(profile.slug) ?? null
    const codigo = String(candidate?.ids?.senado ?? "").trim()
    let senado: SenadoSource | null = null
    if (/^\d+$/.test(codigo)) {
      senado = senadoMode === "off"
        ? { status: "erro", url: `${SENADO_API}/senador/${codigo}/mandatos.json`, motivo: "consulta ao Senado desligada nesta rodada" }
        : await fetchSenado(codigo)
    }
    const result = historicoRevisionVerdict({
      profile, candidate, identity: identities.get(profile.slug)!, sourceRows: sourceRows.get(profile.slug) ?? [],
      anos, tseRevisions, senado, checkedAt,
    })
    receipts.push(result.receipt)
    review.push(...result.review)
  }
  finish(receipts, review)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}

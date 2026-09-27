/**
 * Compara chapas publicadas com um ZIP oficial do TSE já guardado localmente.
 * Não consulta rede nem banco. Um par que continua igual num ZIP novo recebe
 * recibo indeterminado: a ficha ainda aponta para a revisão antiga da fonte.
 */
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { stripAccents } from "../../src/lib/strip-accents"
import { parseCSV } from "../lib/parse-csv-local"

type Row = Record<string, string>
type Obj = Record<string, unknown>
type Candidate = Obj & { id?: string; slug?: string; chapa_2026?: Obj }
type Snapshot = { metadata: Obj; chapas: Obj[] }

export type ChapaProjection = {
  receipt: {
    fonte: "chapa_vice"; escopo: "candidato"; alvo: string; candidato_id: string
    executado_em: string; resultado: "encontrado" | "indeterminado"
    volume: number; url: string; detalhe: string
  } | null
  reason: "ok" | "revision_changed" | "public_link_unverifiable" | "snapshot_not_applicable" | "profile_mismatch" |
    "official_row_missing_or_duplicate" | "official_pair_changed"
}

function object(value: unknown): Obj | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Obj : null
}

function value(obj: Obj | null, key: string): string {
  const raw = obj?.[key]
  return typeof raw === "string" ? raw.trim() : ""
}

function normalized(raw: string): string {
  return stripAccents(raw)
    .replace(/[^A-Za-z0-9]+/g, " ").trim().toUpperCase()
}

function sameText(a: string, b: string): boolean {
  return Boolean(a && b) && normalized(a) === normalized(b)
}

function validSha(raw: string): boolean { return /^[a-f0-9]{64}$/.test(raw) }

function isoDate(raw: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw)
  return match ? `${match[3]}-${match[2]}-${match[1]}` : ""
}

function personMatches(row: Row, person: Obj, expectedOffice: string, expectedStatus: string): boolean {
  return row.SQ_CANDIDATO === value(person, "sq_candidato") &&
    sameText(row.DS_CARGO ?? "", expectedOffice) &&
    sameText(row.NM_CANDIDATO ?? "", value(person, "nome_completo")) &&
    sameText(row.NM_URNA_CANDIDATO ?? "", value(person, "nome_urna")) &&
    sameText(row.SG_PARTIDO ?? "", value(person, "partido_sigla")) &&
    sameText(row.NM_PARTIDO ?? "", value(person, "partido_nome")) &&
    row.NR_CANDIDATO === value(person, "numero") &&
    row.DT_NASCIMENTO === value(person, "data_nascimento") &&
    row.CD_SITUACAO_CANDIDATURA === expectedStatus
}

/** Compara somente campos da chapa. Dados não selecionados do CSV nunca entram no artefato. */
export function projectChapaReceipt(input: {
  profile: Candidate; snapshot: Snapshot; rowsBySq: ReadonlyMap<string, readonly Row[]>
  coalitionSqs: ReadonlyMap<string, readonly string[]>
  candidateIdsBySlug: ReadonlyMap<string, string>
  currentSha256: string; checkedAt: string
}): ChapaProjection {
  const { profile, snapshot, rowsBySq, coalitionSqs, candidateIdsBySlug, currentSha256, checkedAt } = input
  const chapa = object(profile.chapa_2026)
  const id = value(profile, "id")
  const slug = value(profile, "slug")
  const snapshotSha = value(snapshot.metadata, "source_sha256")
  const sourceUrl = value(snapshot.metadata, "source_url")
  if (!chapa || !id || !slug || value(chapa, "identidade_status") !== "confirmada" ||
    value(chapa, "vinculo_titular_status") !== "confirmado" ||
    value(chapa, "fonte_sha256") !== snapshotSha || value(chapa, "fonte_url") !== sourceUrl ||
    !validSha(snapshotSha) || !validSha(currentSha256)) {
    return { receipt: null, reason: "snapshot_not_applicable" }
  }
  const slate = snapshot.chapas.filter((item) => value(item, "chave") === value(chapa, "chave"))
  const publishedAt = value(chapa, "snapshot_em")
  if (slate.length !== 1 || !Number.isFinite(Date.parse(publishedAt)) ||
    !Number.isFinite(Date.parse(checkedAt)) || Date.parse(checkedAt) < Date.parse(publishedAt)) {
    return { receipt: null, reason: "snapshot_not_applicable" }
  }
  const stored = slate[0]
  const titular = object(stored.titular)
  const vice = object(stored.vice)
  const optionalFields = [
    "sq_coligacao", "tipo_agremiacao", "composicao",
    "tse_situacao_titular_codigo", "tse_situacao_vice_codigo",
  ]
  const optionalMatches = optionalFields.every((field) =>
    !value(chapa, field) || value(chapa, field) === value(stored, field)
  )
  const viceSlug = value(chapa, "vice_slug")
  const viceId = value(chapa, "vice_candidato_id")
  const viceLinkVerified = !viceId || Boolean(viceSlug && candidateIdsBySlug.get(viceSlug) === viceId)
  if (!titular || !vice || value(stored, "identidade_status") !== "confirmada" ||
    !optionalMatches || value(chapa, "vice_situacao_divulgacand") ||
    !["Presidente", "Governador"].includes(value(stored, "cargo_titular")) ||
    value(chapa, "cargo_titular") !== value(stored, "cargo_titular") ||
    !value(stored, "sq_coligacao") || !value(stored, "eleicao_codigo") ||
    !value(stored, "tse_situacao_titular_codigo") || !value(stored, "tse_situacao_vice_codigo") ||
    value(titular, "perfil_slug") !== slug || value(chapa, "titular_candidato_id") !== id ||
    value(titular, "vinculo_perfil_status") !== "confirmado" ||
    value(chapa, "titular_slug") !== slug ||
    value(titular, "sq_candidato") !== value(chapa, "titular_sq_candidato") ||
    value(vice, "sq_candidato") !== value(chapa, "vice_sq_candidato") ||
    !sameText(value(titular, "nome_completo"), value(chapa, "titular_nome_completo")) ||
    !sameText(value(vice, "nome_completo"), value(chapa, "vice_nome_completo")) ||
    !sameText(value(titular, "nome_urna"), value(chapa, "titular_nome_urna")) ||
    !sameText(value(vice, "nome_urna"), value(chapa, "vice_nome_urna")) ||
    !sameText(value(titular, "partido_sigla"), value(chapa, "titular_partido_sigla")) ||
    !sameText(value(vice, "partido_sigla"), value(chapa, "vice_partido_sigla")) ||
    viceSlug !== value(vice, "perfil_slug") ||
    value(chapa, "eleicao_data") !== isoDate(value(stored, "eleicao_data")) ||
    value(chapa, "eleicao_codigo") !== value(stored, "eleicao_codigo") ||
    value(chapa, "uf") !== value(stored, "uf") ||
    value(stored, "tse_situacao_codigo") !== value(chapa, "tse_situacao_codigo")) {
    return { receipt: null, reason: "profile_mismatch" }
  }
  const titularRows = rowsBySq.get(value(titular, "sq_candidato")) ?? []
  const viceRows = rowsBySq.get(value(vice, "sq_candidato")) ?? []
  if (titularRows.length !== 1 || viceRows.length !== 1) {
    return { receipt: null, reason: "official_row_missing_or_duplicate" }
  }
  const [titularRow] = titularRows
  const [viceRow] = viceRows
  const uf = value(stored, "uf") || "BR"
  const coalitionKey = [value(stored, "eleicao_codigo"), uf, value(stored, "sq_coligacao")].join("|")
  const members = coalitionSqs.get(coalitionKey) ?? []
  if (members.length !== 2 || new Set(members).size !== 2 ||
    !members.includes(value(titular, "sq_candidato")) ||
    !members.includes(value(vice, "sq_candidato"))) {
    return { receipt: null, reason: "official_pair_changed" }
  }
  const common = (row: Row) => row.NR_TURNO === "1" && row.ANO_ELEICAO === "2026" &&
    row.CD_ELEICAO === value(stored, "eleicao_codigo") && row.SG_UF === uf &&
    row.SQ_COLIGACAO === value(stored, "sq_coligacao") &&
    row.DT_ELEICAO === value(stored, "eleicao_data")
  const office = value(stored, "cargo_titular")
  const viceOffice = office === "Presidente" ? "Vice-Presidente" : "Vice-Governador"
  if (!common(titularRow) || !common(viceRow) ||
    !personMatches(titularRow, titular, office, value(stored, "tse_situacao_titular_codigo")) ||
    !personMatches(viceRow, vice, viceOffice, value(stored, "tse_situacao_vice_codigo")) ||
    titularRow.DS_SITUACAO_CANDIDATURA !== value(stored, "tse_situacao_codigo") ||
    titularRow.TP_AGREMIACAO !== value(stored, "tipo_agremiacao") ||
    !sameText(titularRow.DS_COMPOSICAO_COLIGACAO || titularRow.SG_PARTIDO, value(stored, "composicao"))) {
    return { receipt: null, reason: "official_pair_changed" }
  }
  const sameRevision = currentSha256 === snapshotSha
  const conclusive = sameRevision && viceLinkVerified
  return {
    receipt: {
      fonte: "chapa_vice", escopo: "candidato", alvo: slug, candidato_id: id,
      executado_em: checkedAt, resultado: conclusive ? "encontrado" : "indeterminado",
      volume: conclusive ? 1 : 0, url: sourceUrl,
      detalhe: JSON.stringify({
        resource_sha256: currentSha256, snapshot_sha256: snapshotSha,
        comparison: "official_pair_matches_published_snapshot",
        revision: sameRevision ? "same" : "changed",
        public_vice_link: viceLinkVerified ? "verified_or_absent" : "unverifiable",
        escopo: "candidato",
      }),
    },
    reason: !sameRevision ? "revision_changed" : viceLinkVerified ? "ok" : "public_link_unverifiable",
  }
}

function argument(name: string): string {
  const prefix = `--${name}=`
  const raw = process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length)
  if (!raw) throw new Error(`argumento obrigatório: ${prefix}<arquivo>`)
  return resolve(raw)
}

async function main(): Promise<void> {
  const profiles = JSON.parse(readFileSync(argument("profiles"), "utf8")) as Candidate[]
  const snapshot = JSON.parse(readFileSync(argument("snapshot"), "utf8")) as Snapshot
  const catalog = JSON.parse(readFileSync(argument("catalog"), "utf8")) as Obj
  const zipPath = argument("zip")
  const outPath = argument("out")
  const checkedAt = value(catalog, "fetched_at")
  const sourceUrl = value(snapshot.metadata, "source_url")
  const resource = (Array.isArray(catalog.resources) ? catalog.resources : [])
    .map(object).find((item) => value(item, "url") === sourceUrl)
  const currentSha256 = createHash("sha256").update(readFileSync(zipPath)).digest("hex")
  if (!Array.isArray(profiles) || !Array.isArray(snapshot.chapas) ||
    !resource || !validSha(currentSha256) || currentSha256 !== value(resource, "sha256") ||
    !Number.isFinite(Date.parse(checkedAt)) || basename(zipPath) !== "consulta_cand_2026.zip") {
    throw new Error("pacote oficial local, catálogo ou escopo inválido")
  }
  const entries = execFileSync("unzip", ["-Z1", zipPath], { encoding: "utf8", maxBuffer: 1024 * 1024 })
    .trim().split(/\r?\n/)
  const member = entries.filter((entry) => entry === "consulta_cand_2026_BRASIL.csv")
  if (member.length !== 1) throw new Error("CSV Brasil ausente ou duplicado no ZIP oficial")
  const targetSqs = new Set(profiles.flatMap((profile) => {
    const chapa = object(profile.chapa_2026)
    return chapa ? [value(chapa, "titular_sq_candidato"), value(chapa, "vice_sq_candidato")] : []
  }).filter(Boolean))
  const targetCoalitions = new Set(snapshot.chapas.map((item) => [
    value(item, "eleicao_codigo"), value(item, "uf") || "BR", value(item, "sq_coligacao"),
  ].join("|")))
  const privateDir = mkdtempSync(join(tmpdir(), "pf-chapa-local-"))
  const rowsBySq = new Map<string, Row[]>()
  const coalitionSqs = new Map<string, string[]>()
  try {
    const csvPath = join(privateDir, member[0])
    const csv = execFileSync("unzip", ["-p", zipPath, member[0]], { maxBuffer: 512 * 1024 * 1024 })
    writeFileSync(csvPath, csv, { mode: 0o600 })
    await parseCSV(csvPath, (row) => {
      if (row.NR_TURNO !== "1" || row.ANO_ELEICAO !== "2026") return
      const office = normalized(row.DS_CARGO ?? "")
      if (!["PRESIDENTE", "VICE PRESIDENTE", "GOVERNADOR", "VICE GOVERNADOR"].includes(office)) return
      const coalitionKey = [row.CD_ELEICAO, row.SG_UF, row.SQ_COLIGACAO].join("|")
      if (targetCoalitions.has(coalitionKey)) {
        const members = coalitionSqs.get(coalitionKey) ?? []
        members.push(row.SQ_CANDIDATO)
        coalitionSqs.set(coalitionKey, members)
      }
      if (!targetSqs.has(row.SQ_CANDIDATO)) return
      const selected = Object.fromEntries([
        "SQ_CANDIDATO", "NR_TURNO", "ANO_ELEICAO", "CD_ELEICAO", "DT_ELEICAO", "SG_UF", "SQ_COLIGACAO",
        "DS_CARGO", "NM_CANDIDATO", "NM_URNA_CANDIDATO", "SG_PARTIDO", "NM_PARTIDO",
        "NR_CANDIDATO", "DT_NASCIMENTO", "CD_SITUACAO_CANDIDATURA",
        "DS_SITUACAO_CANDIDATURA", "TP_AGREMIACAO", "DS_COMPOSICAO_COLIGACAO",
      ].map((key) => [key, row[key] ?? ""])) as Row
      const rows = rowsBySq.get(row.SQ_CANDIDATO) ?? []
      rows.push(selected)
      rowsBySq.set(row.SQ_CANDIDATO, rows)
    })
  } finally { rmSync(privateDir, { recursive: true, force: true }) }
  const receipts: NonNullable<ChapaProjection["receipt"]>[] = []
  const diagnostics: Array<{ slug: string; reason: ChapaProjection["reason"] }> = []
  const candidateIdsBySlug = new Map(profiles
    .filter((profile) => value(profile, "slug") && value(profile, "id"))
    .map((profile) => [value(profile, "slug"), value(profile, "id")]))
  for (const profile of profiles) {
    if (!profile.chapa_2026) continue
    const projected = projectChapaReceipt({ profile, snapshot, rowsBySq, coalitionSqs, candidateIdsBySlug, currentSha256, checkedAt })
    if (projected.receipt) receipts.push(projected.receipt)
    if (projected.reason !== "ok") diagnostics.push({ slug: value(profile, "slug"), reason: projected.reason })
  }
  const output = {
    schema_version: 1, generated_at: new Date().toISOString(),
    source_url: sourceUrl, source_sha256: currentSha256,
    snapshot_sha256: value(snapshot.metadata, "source_sha256"),
    receipts, diagnostics,
  }
  const temporary = `${outPath}.${process.pid}.tmp`
  try {
    writeFileSync(temporary, `${JSON.stringify(output, null, 2)}\n`, { flag: "wx", mode: 0o600 })
    renameSync(temporary, outPath)
  } catch (error) { rmSync(temporary, { force: true }); throw error }
  console.log(JSON.stringify({ receipts: receipts.length, diagnostics: diagnostics.length, source_sha256: currentSha256 }))
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 })
}

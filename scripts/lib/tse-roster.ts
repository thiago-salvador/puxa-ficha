import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { basename, resolve } from "node:path"

import { parse as parseCsv } from "csv-parse/sync"

export const TSE_CARGO_SENADOR = "5"
export const TSE_CARGO_PRIMEIRO_SUPLENTE = "9"
export const TSE_CARGO_SEGUNDO_SUPLENTE = "10"
export const TSE_SENADO_CARGOS = Object.freeze({
  [TSE_CARGO_SENADOR]: "titular",
  [TSE_CARGO_PRIMEIRO_SUPLENTE]: "1",
  [TSE_CARGO_SEGUNDO_SUPLENTE]: "2",
} as const)

export const UF_BRASIL = Object.freeze([
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const)

export type SenadoRole = "titular" | "1" | "2"
export type RosterAction = "criar" | "manter" | "atualizar" | "revisar"

export interface TSESnapshotRow {
  ANO_ELEICAO?: string
  NR_TURNO?: string
  SG_UF?: string
  SG_UE?: string
  CD_ELEICAO?: string
  DS_ELEICAO?: string
  DT_ELEICAO?: string
  CD_CARGO?: string
  DS_CARGO?: string
  SQ_CANDIDATO?: string
  NR_CANDIDATO?: string
  NM_CANDIDATO?: string
  NM_URNA_CANDIDATO?: string
  NM_SOCIAL_CANDIDATO?: string
  CD_SITUACAO_CANDIDATURA?: string
  DS_SITUACAO_CANDIDATURA?: string
  TP_AGREMIACAO?: string
  SG_PARTIDO?: string
  NM_PARTIDO?: string
  SQ_COLIGACAO?: string
  DS_COMPOSICAO_COLIGACAO?: string
  [key: string]: string | undefined
}

export interface TSEComplementRow {
  ANO_ELEICAO?: string
  SG_UF?: string
  SQ_CANDIDATO?: string
  CD_SITUACAO_JULGAMENTO?: string
  DS_SITUACAO_JULGAMENTO?: string
  CD_SITUACAO_JULGAMENTO_PLEITO?: string
  DS_SITUACAO_JULGAMENTO_PLEITO?: string
  CD_SITUACAO_CANDIDATO_PLEITO?: string
  DS_SITUACAO_CANDIDATO_PLEITO?: string
  ST_SUBSTITUIDO?: string
  SQ_SUBSTITUIDO?: string
  SQ_ORDEM_SUPLENCIA?: string
  [key: string]: string | undefined
}

export interface SenadoRosterPerson {
  sq_candidato: string
  uf: string
  ano: number
  cargo_codigo: string
  cargo: "Senador" | "1º Suplente" | "2º Suplente"
  papel: SenadoRole
  numero: string | null
  nome_completo: string
  nome_urna: string
  partido_sigla: string | null
  partido_nome: string | null
  sq_coligacao: string
  chave_chapa: string
  situacao: string | null
  situacao_codigo: string | null
  situacao_julgamento: string | null
  substituido: boolean
  sq_substituido: string | null
  fonte_arquivo: string
  fonte_url: string
  fonte_sha256: string
  publicavel: false
  slug: string | null
  action: RosterAction
  reason: string
}

export interface SenadoRunningMateLink {
  ordem: 1 | 2
  cargo_codigo: string
  sq_candidato: string
  nome_completo: string
  nome_urna: string
  situacao: string | null
  situacao_codigo: string | null
  substituido: boolean
  fonte_url: string
  fonte_sha256: string
}

export interface SenadoRosterTicket {
  chave_chapa: string
  ano: number
  uf: string
  sq_coligacao: string
  numero: string
  titular_sq_candidato: string
  titular: SenadoRosterPerson
  suplentes: SenadoRunningMateLink[]
  linkage: "confirmado" | "revisar"
  linkage_reason: string
}

export interface SenadoRosterManifest {
  schema_version: "senado-roster-v1"
  metadata: {
    ano: number
    source_url: string
    source_catalog_url: string
    source_sha256: string
    complement_source_url: string | null
    complement_sha256: string | null
    generated_at: string
    ufs: string[]
    total_rows: number
    total_titulares: number
    total_primeiros_suplentes: number
    total_segundos_suplentes: number
    total_chapas: number
    reconciliacao_27_ufs: Record<string, { titulares: number; primeiro_suplente: number; segundo_suplente: number; sqs: number }>
    fontes: Array<{ path: string; url: string; sha256: string; kind: "snapshot" | "complemento" | "chapa" }>
  }
  rows: SenadoRosterPerson[]
  tickets: SenadoRosterTicket[]
  pilot: {
    ufs: string[]
    cobertura: string[]
    selection_rule: string
  }
}

export interface ExistingRosterRow {
  ano?: number | string
  year?: number | string
  uf?: string
  cargo_codigo?: string
  cargo?: string
  sq_candidato?: string
  [key: string]: unknown
}

export interface PrepareSenadoRosterOptions {
  snapshotPath: string
  complementPath?: string | null
  chapaPath?: string | null
  ano?: number
  sourceUrl?: string
  sourceCatalogUrl?: string
  complementUrl?: string | null
  generatedAt?: string
  existing?: ExistingRosterRow[]
  pilotUFs?: string[]
}

export interface LoadedSource<T> {
  rows: T[]
  path: string
  sha256: string
  files: string[]
}

const SOURCE_URL = "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip"
const OFFICIAL_SNAPSHOT_PATH = "/data/tse-cpf/consulta_cand_2026.zip"
const COMPLEMENT_URL = "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand_complementar/consulta_cand_complementar_2026.zip"
const OFFICIAL_COMPLEMENT_PATH = "/output/sites-candidato-tse-2026/consulta_cand_complementar_2026.zip"
const SOURCE_CATALOG_URL = "https://dadosabertos.tse.jus.br/dataset/candidatos-2026/resource/7748de82-a23b-47c4-9ec1-35535d945e5b"
const normalize = (value: unknown) => String(value ?? "").trim()
const normalizeUpper = (value: unknown) => normalize(value).toUpperCase()

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function parseCsvText(text: string): Record<string, string>[] {
  return parseCsv(text, {
    delimiter: ";",
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
    bom: true,
    cast: (value: string) => value.trim(),
  }) as Record<string, string>[]
}

function sourceRows<T>(path: string): LoadedSource<T> {
  const absolute = resolve(path)
  if (!existsSync(absolute)) throw new Error(`fonte TSE não encontrada: ${absolute}`)
  const bytes = readFileSync(absolute)
  const digest = sha256(bytes)
  const lower = absolute.toLowerCase()
  if (lower.endsWith(".zip")) {
    const names = execFileSync("unzip", ["-Z1", absolute], { encoding: "utf8" })
      .split(/\r?\n/)
      // O ZIP traz BRASIL e os arquivos por UF. Usar somente os arquivos UF
      // evita contar a mesma inscrição duas vezes.
      .filter((name) => /_[A-Z]{2}\.csv$/i.test(name))
      .sort()
    const rows: T[] = []
    for (const name of names) {
      const text = execFileSync("unzip", ["-p", absolute, name], { encoding: "latin1", maxBuffer: 64 * 1024 * 1024 })
      rows.push(...(parseCsvText(text) as T[]))
    }
    return { rows, path: absolute, sha256: digest, files: names }
  }
  if (lower.endsWith(".json")) {
    const value = JSON.parse(bytes.toString("utf8")) as unknown
    const rows = Array.isArray(value) ? value : (value && typeof value === "object" && Array.isArray((value as { rows?: unknown }).rows) ? (value as { rows: unknown[] }).rows : null)
    if (!rows) throw new Error(`JSON TSE sem array de rows: ${absolute}`)
    return { rows: rows as T[], path: absolute, sha256: digest, files: [basename(absolute)] }
  }
  return { rows: parseCsvText(bytes.toString("latin1")) as T[], path: absolute, sha256: digest, files: [basename(absolute)] }
}

export function roleFromTseRow(row: Pick<TSESnapshotRow, "CD_CARGO" | "DS_CARGO">): SenadoRole | null {
  const code = normalize(row.CD_CARGO)
  const description = normalizeUpper(row.DS_CARGO)
  const expected = TSE_SENADO_CARGOS[code as keyof typeof TSE_SENADO_CARGOS]
  if (expected) {
    const valid = expected === "titular" ? description === "SENADOR" : description === `${expected === "1" ? "1º" : "2º"} SUPLENTE`
    if (!valid) throw new Error(`CD_CARGO ${code} com DS_CARGO incompatível: ${row.DS_CARGO}`)
    return expected
  }
  if (description === "SENADOR" || description === "1º SUPLENTE" || description === "2º SUPLENTE") {
    throw new Error(`DS_CARGO ${row.DS_CARGO} com CD_CARGO desconhecido: ${row.CD_CARGO}`)
  }
  return null
}

function roleLabel(role: SenadoRole): SenadoRosterPerson["cargo"] {
  return role === "titular" ? "Senador" : role === "1" ? "1º Suplente" : "2º Suplente"
}

function keyFor(row: Pick<TSESnapshotRow, "SG_UF" | "SQ_COLIGACAO" | "NR_CANDIDATO">): string {
  return [normalizeUpper(row.SG_UF), normalize(row.SQ_COLIGACAO), normalize(row.NR_CANDIDATO)].join("|")
}

function rowKey(row: object): string {
  const value = row as TSESnapshotRow & SenadoRosterPerson & Record<string, unknown>
  return [normalize(value.ANO_ELEICAO ?? value.ano), normalizeUpper(value.SG_UF ?? value.uf), normalize(value.CD_CARGO ?? value.cargo_codigo), normalize(value.SQ_CANDIDATO ?? value.sq_candidato)].join("|")
}

const terminalStatuses = new Set(["CANCELADO", "FALECIDO", "INDEFERIDO", "RENÚNCIA", "RENUNCIA", "PEDIDO NÃO CONHECIDO", "PEDIDO NAO CONHECIDO"])
function isTerminal(status: string | null): boolean {
  return terminalStatuses.has(normalizeUpper(status))
}

function hasValidComplement(row: TSEComplementRow | undefined, ano = 2026): boolean {
  if (!row || normalize(row.ANO_ELEICAO) !== String(ano)) return false
  const status = normalize(row.DS_SITUACAO_JULGAMENTO)
  return Boolean(status) && !["#NULO#", "#NE", "-1"].includes(status.toUpperCase())
}

function complementMatchesBase(row: TSESnapshotRow, complement: TSEComplementRow | undefined, ano: number): boolean {
  if (!hasValidComplement(complement, ano)) return false
  const complementUf = normalizeUpper(complement?.SG_UF)
  return !complementUf || complementUf === normalizeUpper(row.SG_UF)
}

function currentCandidate(rows: TSESnapshotRow[], supplements: Map<string, TSEComplementRow>): { row: TSESnapshotRow | null; reason: string } {
  const replaced = new Set(rows.map((row) => normalize(supplements.get(normalize(row.SQ_CANDIDATO))?.SQ_SUBSTITUIDO)).filter((sq) => sq && sq !== "-1"))
  const eligible = rows.filter((row) => {
    const sq = normalize(row.SQ_CANDIDATO)
    const complement = supplements.get(normalize(row.SQ_CANDIDATO))
    if (!complementMatchesBase(row, complement, Number(normalize(row.ANO_ELEICAO)))) return false
    const status = normalize(complement?.DS_SITUACAO_JULGAMENTO || row.DS_SITUACAO_CANDIDATURA)
    return !isTerminal(status) && normalizeUpper(complement?.ST_SUBSTITUIDO) !== "S" && !replaced.has(sq)
  })
  if (rows.length === 1 && eligible.length === 1) return { row: rows[0], reason: "único registro oficial no slot com julgamento e UF compatíveis" }
  if (eligible.length === 1) return { row: eligible[0], reason: "registro vigente selecionado por situação oficial e substituição" }
  return { row: null, reason: `slot com ${rows.length} registros e ${eligible.length} elegíveis; revisão exigida` }
}

function asComplement(rows: TSEComplementRow[]): Map<string, TSEComplementRow> {
  const map = new Map<string, TSEComplementRow>()
  for (const row of rows) {
    const sq = normalize(row.SQ_CANDIDATO)
    if (!sq) continue
    if (map.has(sq)) throw new Error(`SQ_CANDIDATO duplicado no complementar: ${sq}`)
    map.set(sq, row)
  }
  return map
}

function actionFor(person: SenadoRosterPerson, existing: ExistingRosterRow[]): { action: RosterAction; reason: string; slug: string | null } {
  const matches = existing.filter((row) => rowKey({ ano: normalize(row.ano ?? row.year), uf: row.uf, cargo_codigo: row.cargo_codigo, sq_candidato: row.sq_candidato }) === rowKey(person))
  if (matches.length > 1) return { action: "revisar", reason: "identidade operacional duplicada para o mesmo ano, UF, cargo e SQ", slug: null }
  const found = matches[0]
  if (!found) {
    const samePersonName = existing.filter((row) => {
      const rowUf = normalizeUpper(row.uf ?? row.estado)
      const rowCargo = normalize(row.cargo_codigo ?? row.cargo ?? row.cargo_disputado).toUpperCase()
      const sameCargo = rowCargo === person.cargo.toUpperCase() || rowCargo === person.cargo_codigo
      const rowName = normalizeUpper(row.nome_urna ?? row.nome_completo ?? row.name)
      return rowUf === person.uf && sameCargo && rowName !== "" && (rowName === normalizeUpper(person.nome_urna) || rowName === normalizeUpper(person.nome_completo))
    })
    if (samePersonName.length > 0) return { action: "revisar", reason: "possível identidade existente por nome/UF sem âncora SQ 2026; mapeamento manual exigido", slug: null }
    return { action: "criar", reason: "SQ oficial ausente do cadastro operacional; permanece não publicável", slug: null }
  }
  const fields = ["nome_completo", "nome_urna", "uf", "cargo_codigo", "sq_coligacao"] as const
  const changed = fields.some((field) => normalize(found[field]) !== normalize(person[field]))
  const slug = typeof found.slug === "string" ? found.slug : null
  return changed ? { action: "atualizar", reason: "SQ forte encontrado, com campos oficiais divergentes", slug } : { action: "manter", reason: "identidade e campos oficiais permanecem iguais", slug }
}

function toPerson(row: TSESnapshotRow, role: SenadoRole, complement: TSEComplementRow | undefined, source: LoadedSource<TSESnapshotRow>, sourceUrl: string, existing: ExistingRosterRow[]): SenadoRosterPerson {
  const ano = Number(normalize(row.ANO_ELEICAO))
  const uf = normalizeUpper(row.SG_UF)
  const sq = normalize(row.SQ_CANDIDATO)
  // #NE em DS_SITUACAO_CANDIDATO_PLEITO é marcador de resultado ainda não
  // publicado. O estado estruturado usado na elegibilidade vem do julgamento
  // complementar oficial.
  const situation = normalize(complement?.DS_SITUACAO_JULGAMENTO || complement?.DS_SITUACAO_CANDIDATO_PLEITO || row.DS_SITUACAO_CANDIDATURA) || null
  const judgment = normalize(complement?.DS_SITUACAO_JULGAMENTO) || null
  const person: SenadoRosterPerson = {
    sq_candidato: sq,
    uf,
    ano,
    cargo_codigo: normalize(row.CD_CARGO),
    cargo: roleLabel(role),
    papel: role,
    numero: normalize(row.NR_CANDIDATO) || null,
    nome_completo: normalize(row.NM_CANDIDATO),
    nome_urna: normalize(row.NM_URNA_CANDIDATO),
    partido_sigla: normalize(row.SG_PARTIDO) || null,
    partido_nome: normalize(row.NM_PARTIDO) || null,
    sq_coligacao: normalize(row.SQ_COLIGACAO),
    chave_chapa: keyFor(row),
    situacao: situation,
    situacao_codigo: normalize(complement?.CD_SITUACAO_CANDIDATO_PLEITO || row.CD_SITUACAO_CANDIDATURA) || null,
    situacao_julgamento: judgment,
    substituido: normalizeUpper(complement?.ST_SUBSTITUIDO) === "S",
    sq_substituido: normalize(complement?.SQ_SUBSTITUIDO) && normalize(complement?.SQ_SUBSTITUIDO) !== "-1" ? normalize(complement?.SQ_SUBSTITUIDO) : null,
    fonte_arquivo: source.files.find((name) => name.toUpperCase().includes(`_${uf}.CSV`)) ?? source.files[0] ?? basename(source.path),
    fonte_url: sourceUrl,
    fonte_sha256: source.sha256,
    publicavel: false,
    slug: null,
    action: "criar",
    reason: "",
  }
  const action = actionFor(person, existing)
  person.action = action.action
  person.reason = action.reason
  person.slug = action.slug
  if (!complementMatchesBase(row, complement, ano)) {
    person.action = "revisar"
    person.reason = "complementar oficial ausente ou sem situação de julgamento válida"
  } else if (person.substituido || isTerminal(person.situacao_julgamento)) {
    person.action = "revisar"
    person.reason = person.substituido ? "registro substituído preservado como alternativa oficial" : "registro terminal preservado para reconciliação"
  }
  return person
}

function validateBase(rows: TSESnapshotRow[], ano: number): TSESnapshotRow[] {
  const selected: TSESnapshotRow[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    if (normalize(row.ANO_ELEICAO) !== String(ano)) continue
    if (normalize(row.NR_TURNO) && normalize(row.NR_TURNO) !== "1") continue
    const role = roleFromTseRow(row)
    if (!role) continue
    const uf = normalizeUpper(row.SG_UF)
    if (!(UF_BRASIL as readonly string[]).includes(uf)) throw new Error(`UF inválida em candidatura Senado: ${row.SG_UF}`)
    for (const field of ["SQ_CANDIDATO", "SQ_COLIGACAO", "NR_CANDIDATO", "NM_CANDIDATO", "NM_URNA_CANDIDATO"] as const) {
      if (!normalize(row[field])) throw new Error(`linha Senado sem ${field} na UF ${uf}`)
    }
    const key = rowKey(row)
    if (seen.has(key)) throw new Error(`SQ/CARGO/UF/ANO duplicado no snapshot: ${key}`)
    seen.add(key)
    selected.push(row)
  }
  if (selected.length === 0) throw new Error(`snapshot ${ano} não contém candidaturas de Senado`)
  return selected
}

export function buildSenadoRosterManifest(options: PrepareSenadoRosterOptions): SenadoRosterManifest {
  const ano = options.ano ?? 2026
  const source = sourceRows<TSESnapshotRow>(options.snapshotPath)
  const selected = validateBase(source.rows, ano)
  const complement = options.complementPath ? sourceRows<TSEComplementRow>(options.complementPath) : null
  const complementBySq = asComplement(complement?.rows ?? [])
  const sourceUrl = options.sourceUrl ?? (source.path.endsWith(OFFICIAL_SNAPSHOT_PATH) ? SOURCE_URL : `local://${basename(source.path)}`)
  const rows = selected.map((row) => {
    const role = roleFromTseRow(row)
    if (!role) throw new Error("role inesperado")
    return toPerson(row, role, complementBySq.get(normalize(row.SQ_CANDIDATO)), source, sourceUrl, options.existing ?? [])
  }).sort((a, b) => [a.uf, a.chave_chapa, a.papel, a.sq_candidato].join("|").localeCompare([b.uf, b.chave_chapa, b.papel, b.sq_candidato].join("|"), "pt-BR"))

  const byTicket = new Map<string, SenadoRosterPerson[]>()
  for (const person of rows) byTicket.set(person.chave_chapa, [...(byTicket.get(person.chave_chapa) ?? []), person])
  const tickets: SenadoRosterTicket[] = []
  for (const [key, people] of [...byTicket.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const titularRows = people.filter((person) => person.papel === "titular")
    const firstRows = people.filter((person) => person.papel === "1")
    const secondRows = people.filter((person) => person.papel === "2")
    const titularSelection = currentCandidate(titularRows.map((person) => selected.find((row) => normalize(row.SQ_CANDIDATO) === person.sq_candidato)!), complementBySq)
    const titular = titularSelection.row ? rows.find((person) => person.sq_candidato === normalize(titularSelection.row!.SQ_CANDIDATO)) ?? null : null
    const first = currentCandidate(firstRows.map((person) => selected.find((row) => normalize(row.SQ_CANDIDATO) === person.sq_candidato)!), complementBySq)
    const second = currentCandidate(secondRows.map((person) => selected.find((row) => normalize(row.SQ_CANDIDATO) === person.sq_candidato)!), complementBySq)
    const selectedFirst = first.row ? rows.find((person) => person.sq_candidato === normalize(first.row!.SQ_CANDIDATO)) : null
    const selectedSecond = second.row ? rows.find((person) => person.sq_candidato === normalize(second.row!.SQ_CANDIDATO)) : null
    const links: SenadoRunningMateLink[] = []
    if (selectedFirst) links.push({ ordem: 1, cargo_codigo: selectedFirst.cargo_codigo, sq_candidato: selectedFirst.sq_candidato, nome_completo: selectedFirst.nome_completo, nome_urna: selectedFirst.nome_urna, situacao: selectedFirst.situacao, situacao_codigo: selectedFirst.situacao_codigo, substituido: selectedFirst.substituido, fonte_url: selectedFirst.fonte_url, fonte_sha256: selectedFirst.fonte_sha256 })
    if (selectedSecond) links.push({ ordem: 2, cargo_codigo: selectedSecond.cargo_codigo, sq_candidato: selectedSecond.sq_candidato, nome_completo: selectedSecond.nome_completo, nome_urna: selectedSecond.nome_urna, situacao: selectedSecond.situacao, situacao_codigo: selectedSecond.situacao_codigo, substituido: selectedSecond.substituido, fonte_url: selectedSecond.fonte_url, fonte_sha256: selectedSecond.fonte_sha256 })
    const titularBase = titular ? selected.find((row) => normalize(row.SQ_CANDIDATO) === titular.sq_candidato) : undefined
    const titularComplementValid = titular
      ? Boolean(titularBase && complementMatchesBase(titularBase, complementBySq.get(titular.sq_candidato), ano))
      : false
    const titularEligible = Boolean(titular && titularComplementValid && !titular.substituido && !isTerminal(titular.situacao_julgamento))
    const valid = Boolean(titularEligible && selectedFirst && selectedSecond && firstRows.length >= 1 && secondRows.length >= 1)
    const reason = !titular ? `chapa sem titular corrente único: ${titularSelection.reason}` : !titularComplementValid ? "titular sem situação de julgamento válida no complementar oficial" : !selectedFirst || !selectedSecond ? `suplência incompleta: ${first.reason}; ${second.reason}` : "titular corrente e posições 1/2 ligados por UF, SQ_COLIGACAO, NR_CANDIDATO e cadeia SQ_SUBSTITUIDO"
    tickets.push({ chave_chapa: key, ano, uf: titular?.uf ?? people[0].uf, sq_coligacao: titular?.sq_coligacao ?? people[0].sq_coligacao, numero: titular?.numero ?? people[0].numero ?? "", titular_sq_candidato: titular?.sq_candidato ?? "", titular: titular ?? people[0], suplentes: links.sort((a, b) => a.ordem - b.ordem), linkage: valid ? "confirmado" : "revisar", linkage_reason: reason })
  }

  const reconciliation: SenadoRosterManifest["metadata"]["reconciliacao_27_ufs"] = {}
  for (const uf of UF_BRASIL) {
    const scoped = rows.filter((row) => row.uf === uf)
    reconciliation[uf] = { titulares: scoped.filter((row) => row.papel === "titular").length, primeiro_suplente: scoped.filter((row) => row.papel === "1").length, segundo_suplente: scoped.filter((row) => row.papel === "2").length, sqs: new Set(scoped.map((row) => row.sq_candidato)).size }
  }
  const pilotUFs = [...new Set((options.pilotUFs ?? ["AM", "SP", "AC"]).map((uf) => uf.toUpperCase()))].filter((uf) => (UF_BRASIL as readonly string[]).includes(uf)).sort()
  return {
    schema_version: "senado-roster-v1",
    metadata: {
      ano,
      source_url: sourceUrl,
      source_catalog_url: options.sourceCatalogUrl ?? SOURCE_CATALOG_URL,
      source_sha256: source.sha256,
      complement_source_url: complement ? (options.complementUrl ?? (complement.path.endsWith(OFFICIAL_COMPLEMENT_PATH) ? COMPLEMENT_URL : `local://${basename(complement.path)}`)) : null,
      complement_sha256: complement?.sha256 ?? null,
      generated_at: options.generatedAt ?? new Date().toISOString(),
      ufs: [...UF_BRASIL],
      total_rows: rows.length,
      total_titulares: rows.filter((row) => row.papel === "titular").length,
      total_primeiros_suplentes: rows.filter((row) => row.papel === "1").length,
      total_segundos_suplentes: rows.filter((row) => row.papel === "2").length,
      total_chapas: tickets.length,
      reconciliacao_27_ufs: reconciliation,
      fontes: [
        { path: source.path, url: sourceUrl, sha256: source.sha256, kind: "snapshot" },
        ...(complement ? [{ path: complement.path, url: options.complementUrl ?? (complement.path.endsWith(OFFICIAL_COMPLEMENT_PATH) ? COMPLEMENT_URL : `local://${basename(complement.path)}`), sha256: complement.sha256, kind: "complemento" as const }] : []),
      ],
    },
    rows,
    tickets,
    pilot: {
      ufs: pilotUFs,
      cobertura: pilotUFs.map((uf) => `${uf}: titular e SQ registrados em official-sample; categoria de mandato federal depende de evidência local explícita`),
      selection_rule: "piloto registra UF/SQ/chapa oficiais; slugs e IDs locais só são associados quando presentes no seed, e ausência permanece pendência",
    },
  }
}

export const prepareSenadoRoster = buildSenadoRosterManifest
export const loadTseSource = sourceRows

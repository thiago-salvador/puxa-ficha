/**
 * Gera recibos locais, somente leitura, para as três famílias parlamentares.
 *
 * O módulo não consulta rede, Supabase nem grava coleta_log. Ele recebe um
 * snapshot oficial já capturado e um readback do DTO público. Assim a prova
 * pode ser reproduzida sem transformar uma tentativa de coleta em dado
 * publicado.
 *
 * A chave de identidade é sempre (casa, id oficial). Nome nunca participa do
 * join. Candidatos sem ID permanecem `indeterminado` e não são promovidos a
 * vazio por falta de uma consulta.
 */

import { createHash } from "node:crypto"
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { publicFamilyPayloadSha256 } from "./lib/coverage-source-proof"

export const PARLIAMENTARY_FAMILIES = [
  "projetos_lei",
  "votos_candidato",
  "gastos_parlamentares",
] as const

export type ParliamentaryFamily = (typeof PARLIAMENTARY_FAMILIES)[number]
export type ParliamentaryHouse = "camara" | "senado"
export type ReceiptResult = "encontrado" | "vazio_confirmado" | "indeterminado" | "erro"

export interface ParliamentaryCandidate {
  slug: string
  candidato_id: string
  ids: { camara?: number | string | null; senado?: number | string | null }
}

export interface OfficialRosterProof {
  /** URL do roster/lista oficial que contém o ID consultado. */
  roster_url: string
  /** Revisão, data ou ETag declarada pelo pacote/endpoint oficial. */
  roster_revision: string
  /** Caminho local do payload bruto; o coletor calcula o SHA-256. */
  roster_path: string
}

export interface ParliamentaryReadback {
  /** Arquivo bruto do DTO público relido independentemente. */
  dto_path: string
  /** Caminho até a lista do DTO; obrigatório para evitar escolher array errado. */
  dto_rows_path: readonly string[]
  /** Arquivo bruto do perfil público inteiro. */
  profile_path: string
  /** Revisão do DTO público que foi relida. */
  dto_revision: string
  /** URL ou referência local da leitura independente. */
  dto_readback_url: string
}

export interface OfficialFamilyObservation {
  /** Endpoint/pacote oficial da família, não a rota do DTO público. */
  source_url: string
  /** Caminho local do payload bruto; o coletor calcula linhas e SHA-256. */
  source_path: string
  /** Caminho até a lista de linhas, quando o formato não for autodetectável. */
  rows_path?: readonly string[]
}

interface DerivedRawPage {
  page: number
  url: string
  path: string
  bytes: number
  sha256: string
  complete: boolean
}

export interface ParliamentarySourceObservation {
  house: ParliamentaryHouse
  family: ParliamentaryFamily
  official_id: number | string
  roster: OfficialRosterProof
  source: OfficialFamilyObservation
  readback: ParliamentaryReadback
  /** Anos declarados antes da captura de gastos, para detectar ano omitido. */
  years?: readonly number[]
}

export interface ParliamentaryReceipt {
  fonte: "camara-proposicoes" | "camara-votacoes" | "camara-gastos" | "senado-proposicoes" | "senado-votacoes" | "ceaps-senado"
  escopo: "candidato"
  alvo: string
  candidato_id: string
  resultado: ReceiptResult
  volume: number
  url: string
  detalhe: string
  /** Campo auxiliar para consumidores locais; não é coluna de coleta_log. */
  familia: ParliamentaryFamily
  executado_em: string
}

export interface ParliamentaryReceiptRun {
  generated_at: string
  receipts: ParliamentaryReceipt[]
  unresolved_without_id: Array<{ slug: string; familia: ParliamentaryFamily; motivo: string }>
  errors: string[]
}

function normalizedId(value: number | string): string {
  const normalized = String(value).trim()
  if (!/^\d+$/.test(normalized)) throw new Error(`ID parlamentar inválido: ${normalized || "vazio"}`)
  return normalized
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

function sha256Bytes(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex")
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`
}

function sortedIds(values: readonly (number | string)[]): string[] {
  return [...new Set(values.map(normalizedId))].sort()
}

function validSha(value: string): boolean {
  return /^[0-9a-f]{64}$/i.test(value)
}

function validOfficialUrl(url: string, family: ParliamentaryFamily, officialId: string, requireId = true): boolean {
  try {
    const parsed = new URL(url)
    const hosts = family === "gastos_parlamentares"
      ? ["dadosabertos.camara.leg.br", "adm.senado.gov.br", "legis.senado.leg.br", "www.senado.leg.br"]
      : ["dadosabertos.camara.leg.br", "legis.senado.leg.br", "www.senado.leg.br", "www.camara.leg.br"]
    return parsed.protocol === "https:" && hosts.includes(parsed.hostname) && (!requireId || parsed.href.includes(officialId))
  } catch {
    return false
  }
}

function sourceName(house: ParliamentaryHouse, family: ParliamentaryFamily): ParliamentaryReceipt["fonte"] {
  if (house === "camara") {
    if (family === "projetos_lei") return "camara-proposicoes"
    if (family === "votos_candidato") return "camara-votacoes"
    return "camara-gastos"
  }
  if (family === "projetos_lei") return "senado-proposicoes"
  if (family === "votos_candidato") return "senado-votacoes"
  return "ceaps-senado"
}

function normalizedKeys(values: readonly string[]): string[] {
  const keys = [...new Set(values.map((value) => String(value).trim()).filter(Boolean))]
  if (keys.length !== values.length) throw new Error("chaves de linha vazias ou duplicadas")
  return keys.sort()
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function readRawJson(filePath: string): { bytes: Buffer; value: unknown } {
  const bytes = readFileSync(filePath)
  try {
    return { bytes, value: JSON.parse(bytes.toString("utf8")) }
  } catch {
    throw new Error(`payload oficial não é JSON legível: ${filePath}; XML/CSV exige adaptador explícito`)
  }
}

function valueAtPath(value: unknown, path: readonly string[] | undefined): unknown {
  let current = value
  for (const part of path ?? []) {
    const container = object(current)
    if (!container) return undefined
    current = container[part]
  }
  return current
}

function objectArrays(value: unknown): Array<Record<string, unknown>[]> {
  if (Array.isArray(value)) {
    const own = value.filter((item): item is Record<string, unknown> => Boolean(object(item)))
    return [own, ...value.flatMap(objectArrays)]
  }
  const record = object(value)
  return record ? Object.values(record).flatMap(objectArrays) : []
}

function rowsFromPayload(value: unknown, path: readonly string[] | undefined): Record<string, unknown>[] {
  if (!path || path.length === 0) throw new Error("rows_path obrigatório; o coletor não escolhe o maior array")
  const selected = valueAtPath(value, path)
  if (!Array.isArray(selected)) throw new Error("rows_path não aponta para uma lista")
  return selected.filter((row): row is Record<string, unknown> => Boolean(object(row)))
}

function rowContainsOfficialId(value: unknown, officialId: string): boolean {
  if (Array.isArray(value)) return value.some((item) => rowContainsOfficialId(item, officialId))
  const row = object(value)
  if (!row) return false
  if (["idDeputado", "idDeputadoAutor", "idParlamentar", "codSenador", "CodigoParlamentar", "codigoParlamentar", "idSenador"].some((key) => String(row[key] ?? "").trim() === officialId)) return true
  return Object.values(row).some((item) => item && typeof item === "object" && rowContainsOfficialId(item, officialId))
}

function validRawPageUrl(value: string, observation: ParliamentarySourceObservation, officialId: string): boolean {
  if (!validOfficialUrl(value, observation.family, officialId, observation.house === "camara" && observation.family !== "votos_candidato")) return false
  const url = new URL(value)
  if (observation.house === "camara" && observation.family === "projetos_lei") return url.pathname === "/api/v2/proposicoes" && url.searchParams.get("idDeputadoAutor") === officialId
  if (observation.house === "camara" && observation.family === "gastos_parlamentares") {
    const year = Number(url.searchParams.get("ano"))
    return url.pathname === `/api/v2/deputados/${officialId}/despesas` && Number.isInteger(year) && year >= 2000 && year <= 2026 && url.searchParams.get("idLegislatura") === (year <= 2022 ? "56" : "57")
  }
  if (observation.house === "camara") return /^\/api\/v2\/votacoes\/\d+\/votos$/.test(url.pathname)
  if (observation.family === "projetos_lei") return url.pathname === `/dadosabertos/senador/${officialId}/autorias.json`
  if (observation.family === "votos_candidato") return url.pathname === `/dadosabertos/senador/${officialId}/votacoes.json`
  return /^\/adm-dadosabertos\/api\/v1\/senadores\/despesas_ceaps\/\d{4}$/.test(url.pathname)
}

function rawPageRows(value: unknown, observation: ParliamentarySourceObservation, officialId: string): Record<string, unknown>[] {
  if (observation.house === "senado" && observation.family !== "gastos_parlamentares") {
    const envelopeName = observation.family === "projetos_lei" ? "MateriasAutoriaParlamentar" : "VotacaoParlamentar"
    const groupName = observation.family === "projetos_lei" ? "Autorias" : "Votacoes"
    const rowName = observation.family === "projetos_lei" ? "Autoria" : "Votacao"
    const envelope = object(object(value)?.[envelopeName])
    const parliamentarian = object(envelope?.Parlamentar)
    const declaredId = normalizedId(String(parliamentarian?.Codigo ?? ""))
    if (declaredId !== officialId) throw new Error("página bruta do Senado diverge do ID oficial")
    const list = object(parliamentarian?.[groupName])?.[rowName]
    if (!Array.isArray(list)) throw new Error(`página bruta do Senado sem ${groupName}.${rowName}`)
    return list.map((row) => {
      const record = object(row)
      if (!record) throw new Error("linha bruta do Senado inválida")
      return { ...record, CodigoParlamentar: declaredId }
    })
  }
  if (observation.house === "senado" && observation.family === "gastos_parlamentares") {
    const list = Array.isArray(value) ? value : object(value)?.DespesasSenador
    if (!Array.isArray(list)) throw new Error("página bruta CEAPS sem array anual")
    return list.filter((row) => rowContainsOfficialId(row, officialId)) as Record<string, unknown>[]
  }
  const rows = rowsFromPayload(value, observation.source.rows_path)
  return observation.house === "camara" && observation.family === "votos_candidato"
    ? rows.filter((row) => rowContainsOfficialId(row, officialId))
    : rows
}

function reconstructFromRawPages(bundle: Record<string, unknown>, observation: ParliamentarySourceObservation, officialId: string): Record<string, unknown>[] {
  const pages = bundle.derived_from_pages
  if (!Array.isArray(pages) || pages.length === 0) throw new Error("bundle positivo sem derived_from_pages")
  const metadata = pages.map((raw): DerivedRawPage => {
    const page = object(raw)
    if (!page || !Number.isInteger(page.page) || typeof page.url !== "string" || typeof page.path !== "string" || !Number.isInteger(page.bytes) || typeof page.sha256 !== "string" || typeof page.complete !== "boolean") {
      throw new Error("metadado de página bruta incompleto")
    }
    if (!validSha(page.sha256) || !validRawPageUrl(page.url, observation, officialId)) {
      throw new Error("URL ou SHA inválido em página bruta")
    }
    if (observation.house === "senado" && observation.family === "gastos_parlamentares" && new URL(page.url).pathname.split("/").at(-1) === "") throw new Error("URL anual CEAPS inválida")
    return page as unknown as DerivedRawPage
  })
  const rows: Record<string, unknown>[] = []
  const groups = new Map<string, DerivedRawPage[]>()
  for (const page of metadata) {
    if (!existsSync(page.path)) throw new Error(`página bruta ausente ou SHA divergente: ${page.page}`)
    const raw = readFileSync(page.path)
    if (raw.length !== page.bytes || sha256Bytes(raw) !== page.sha256) throw new Error(`página bruta ausente ou SHA divergente: ${page.page}`)
    const value = JSON.parse(raw.toString("utf8")) as unknown
    const parsedUrl = new URL(page.url)
    if (observation.house === "senado" && observation.family === "gastos_parlamentares" && !/^\d{4}$/.test(parsedUrl.pathname.split("/").at(-1) ?? "")) throw new Error("página CEAPS sem ano no endpoint")
    const pageParam = parsedUrl.searchParams.get("pagina")
    if (pageParam !== null && Number(pageParam) !== page.page) throw new Error("número de página diverge da URL")
    parsedUrl.searchParams.delete("pagina")
    const groupKey = parsedUrl.href
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), page])
    const pageRows = rawPageRows(value, observation, officialId)
    rows.push(...pageRows)

    if (observation.house === "camara") {
      const pageRoot = object(value)
      const hasNext = Array.isArray(pageRoot?.links)
        ? (pageRoot!.links as unknown[]).some((link) => object(link)?.rel === "next")
        : pageRows.length >= 100
      if (page.complete === hasNext) throw new Error("marcador de exaustão diverge da resposta bruta")
    } else if (!page.complete) throw new Error("página Senado/CEAPS sem marcador de exaustão")
  }
  for (const group of groups.values()) {
    group.sort((a, b) => a.page - b.page)
    if (group.some((page, index) => page.page !== index + 1)) throw new Error("sequência de páginas não contígua")
    if (group.some((page, index) => page.complete !== (index === group.length - 1))) throw new Error("paginação sem esgotamento comprovado")
  }
  if (observation.family === "gastos_parlamentares") {
    const expected = observation.years
    if (!Array.isArray(expected) || expected.length === 0 || expected.some((year) => !Number.isInteger(year))) throw new Error("escopo anual de gastos ausente")
    const actual = metadata.map((page) => {
      const url = new URL(page.url)
      return observation.house === "camara" ? Number(url.searchParams.get("ano")) : Number(url.pathname.split("/").at(-1))
    })
    if (new Set(actual).size !== expected.length || new Set(expected).size !== expected.length || expected.some((year) => !actual.includes(year))) {
      throw new Error("páginas de gastos não cobrem todos os anos declarados")
    }
  }
  if (bundle.complete !== true || bundle.total !== rows.length) throw new Error("bundle diverge das páginas brutas reconstruídas")
  return rows
}

function identityFromRow(row: Record<string, unknown>): string | null {
  for (const field of ["idDeputadoAutor", "idDeputado", "idParlamentar", "codSenador", "CodigoParlamentar", "codigoParlamentar", "idSenador"]) {
    const raw = row[field]
    if (raw !== undefined && raw !== null && String(raw).trim()) return normalizedId(String(raw))
  }
  return null
}

function rowKey(row: Record<string, unknown>, family: ParliamentaryFamily): string {
  const fields = family === "projetos_lei"
    ? ["id", "idProposicao", "Codigo", "CodigoMateria", "proposicao_id_api"]
    : family === "votos_candidato"
      ? ["id", "idVotacao", "CodigoVotacao", "Codigo", "votacao_id_api"]
      : ["id", "numeroDocumento", "numeroDocumentoFiscal", "id_despesa", "data", "DataDespesa"]
  for (const field of fields) {
    const raw = row[field]
    if (raw !== undefined && raw !== null && String(raw).trim()) return `${field}:${String(raw).trim()}`
  }
  return `sha256:${sha256(canonicalJson(row))}`
}

function field(row: Record<string, unknown>, names: readonly string[]): unknown {
  for (const name of names) {
    const value = row[name]
    if (value !== undefined && value !== null && String(value).trim() !== "") return value
  }
  return undefined
}

function materialRow(row: Record<string, unknown>, family: ParliamentaryFamily): Record<string, unknown> {
  if (family === "projetos_lei") {
    const id = field(row, ["id", "idProposicao", "Codigo", "CodigoMateria", "proposicao_id_api"])
    const type = field(row, ["siglaTipo", "tipo", "Sigla", "sigla"]) 
    const number = field(row, ["numero", "Numero", "numeroMateria"])
    const year = field(row, ["ano", "Ano", "anoMateria"])
    const text = field(row, ["ementa", "Ementa", "EmentaMateria"])
    const statusRaw = field(row, ["situacao", "statusProposicao", "DescricaoSituacao"])
    const status = object(statusRaw)?.descricaoSituacao ?? statusRaw
    if ([id, type, number, year, text, status].some((value) => value === undefined)) throw new Error("projeto sem campos materiais completos")
    return { id: String(id), type: String(type), number: String(number), year: String(year), text: String(text), status: String(status) }
  }
  if (family === "votos_candidato") {
    const id = field(row, ["id", "idVotacao", "CodigoVotacao", "Codigo", "votacao_id_api"])
    const vote = field(row, ["voto", "Voto", "tipoVoto", "voto_normalizado"])
    if (id === undefined || vote === undefined) throw new Error("votação sem ID ou voto")
    return { id: String(id), vote: String(vote) }
  }
  const id = field(row, ["id", "numeroDocumento", "numeroDocumentoFiscal", "id_despesa"])
  const year = field(row, ["ano", "Ano", "year"])
  const amount = field(row, ["valorLiquido", "valorLiquidoFonte", "valorReembolsado", "ValorDespesa", "valor"])
  if (id === undefined || year === undefined || amount === undefined) throw new Error("gasto sem ID, ano ou valor")
  return { id: String(id), year: String(year), amount: String(amount) }
}

function idsFromRoster(value: unknown): string[] {
  // Câmara returns an individual object while Senado commonly wraps the
  // identity in DetalheParlamentar/IdentificacaoParlamentar. Do not choose the
  // largest array: it can be a list of unrelated mandate or contact rows.
  const ids: string[] = []
  const visit = (current: unknown): void => {
    if (Array.isArray(current)) { current.forEach(visit); return }
    const record = object(current)
    if (!record) return
    for (const key of ["id", "codigo", "CodigoParlamentar", "codigoParlamentar", "Codigo", "idParlamentar", "idSenador"]) {
      const raw = record[key]
      if (raw !== undefined && raw !== null && String(raw).trim() !== "") {
        try { ids.push(normalizedId(raw as number | string)) } catch { /* non-numeric object ids are not official IDs */ }
      }
    }
    Object.values(record).forEach(visit)
  }
  visit(value)
  return [...new Set(ids)].sort()
}

function detailFor(input: {
  candidate: ParliamentaryCandidate
  observation: ParliamentarySourceObservation
  dtoCount: number
  dtoSubsetSha256: string
  identityIds: string[]
  sourceSha256: string
  sourceRows: number
  declaredTotal: number | null
  rosterSha256: string
  publicPayloadSha256: string
}): string {
  const { candidate, observation, dtoCount, dtoSubsetSha256, identityIds, sourceSha256, sourceRows, declaredTotal, rosterSha256, publicPayloadSha256 } = input
  return JSON.stringify({
    contrato: "parliamentary-family-receipt-v1",
    casa: observation.house,
    official_id: normalizedId(observation.official_id),
    familia: observation.family,
    roster_url: observation.roster.roster_url,
    roster_revision: observation.roster.roster_revision,
    roster_sha256: rosterSha256,
    dto_revision: observation.readback.dto_revision,
    dto_readback_url: observation.readback.dto_readback_url,
    dto_readback_count: dtoCount,
    dto_subset_sha256: dtoSubsetSha256,
    dto_identity_ids: identityIds,
    identidade_verificada_por: "casa+id; nome não participa do join",
    coverage_proof: {
      version: 1,
      family: observation.family,
      method: "official-source-to-public-readback",
      source_revisions: [{
        url: observation.source.source_url,
        sha256: sourceSha256,
        revision: observation.roster.roster_revision,
      }],
      public_payload_sha256: publicPayloadSha256,
      source_rows: sourceRows,
      public_rows: dtoCount,
      matched_rows: dtoCount,
      unmatched_rows: Math.max(0, sourceRows - dtoCount),
      scope_complete: true,
      declared_total: declaredTotal,
      identity: {
        slug: candidate.slug,
        candidate_id: candidate.candidato_id,
        house: observation.house,
        source_id: normalizedId(observation.official_id),
        official_id: normalizedId(observation.official_id),
        roster_url: observation.roster.roster_url,
        roster_sha256: rosterSha256,
      },
    },
  })
}

function makeReceipt(candidate: ParliamentaryCandidate, observation: ParliamentarySourceObservation, executedAt: string): ParliamentaryReceipt {
  const officialId = normalizedId(observation.official_id)
  if (!validOfficialUrl(observation.source.source_url, observation.family, officialId)) throw new Error("source_url oficial não contém casa/ID verificável")
  if (!validOfficialUrl(observation.roster.roster_url, observation.family, officialId, false)) throw new Error("roster_url oficial inválido")
  const rosterPayload = readRawJson(observation.roster.roster_path)
  const rosterSha256 = sha256Bytes(rosterPayload.bytes)
  const rosterIds = idsFromRoster(rosterPayload.value)
  if (!rosterIds.includes(officialId)) throw new Error(`ID ${officialId} não consta no roster oficial ${observation.roster.roster_url}`)
  const sourcePayload = readRawJson(observation.source.source_path)
  const sourceSha256 = sha256Bytes(sourcePayload.bytes)
  const sourceBundle = object(sourcePayload.value)
  if (!sourceBundle) throw new Error("bundle oficial inválido")
  const sourceRowsData = reconstructFromRawPages(sourceBundle, observation, officialId)
  const bundleRows = rowsFromPayload(sourcePayload.value, observation.source.rows_path)
  if (canonicalJson(bundleRows) !== canonicalJson(sourceRowsData)) throw new Error("dados do bundle divergem da reconstrução das páginas brutas")
  const sourceRows = sourceRowsData.length
  const sourceRoot = object(sourcePayload.value)
  if (sourceRoot?.complete !== true) throw new Error("fonte sem marcador complete=true; paginação não provada")
  const sourceKeys = normalizedKeys(sourceRowsData.map((row) => rowKey(row, observation.family)))
  const sourceIdentities = sourceRowsData.map(identityFromRow).filter((id): id is string => id !== null)
  if (sourceRows > 0 && sourceIdentities.length !== sourceRows) throw new Error("linhas oficiais sem ID parlamentar por linha")
  if (sourceIdentities.some((id) => id !== officialId)) throw new Error("linhas oficiais misturam IDs parlamentares")
  const declaredTotal = (() => {
    const root = sourceRoot
    for (const key of ["total", "totalCount", "count", "quantidade", "totalRegistros"]) {
      const raw = root?.[key]
      if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0) return raw
      if (typeof raw === "string" && /^\d+$/.test(raw.trim())) return Number(raw)
    }
    return null
  })()
  if (declaredTotal === null) throw new Error("fonte sem total oficial explícito")
  if (declaredTotal != null && declaredTotal !== sourceRows) throw new Error(`fonte paginada/incompleta: ${sourceRows}/${declaredTotal} linhas`)
  if (sourceRows === 0 && declaredTotal !== 0) throw new Error("vazio oficial exige total explícito zero")
  const dtoPayload = readRawJson(observation.readback.dto_path)
  const dtoRows = rowsFromPayload(dtoPayload.value, observation.readback.dto_rows_path)
  const dtoKeys = normalizedKeys(dtoRows.map((row) => rowKey(row, observation.family)))
  // Public DTO rows often omit the upstream parliament ID. When an ID is
  // present, it must match the target; absence is handled by the profile
  // identity and does not turn a valid readback into an error.
  const dtoIdentities = dtoRows.map(identityFromRow)
  const dtoIdentityIds = sortedIds(dtoIdentities.filter((id): id is string => id !== null))
  if (dtoIdentityIds.some((id) => id !== officialId)) {
    throw new Error(`readback DTO devolveu ID fora do alvo ${candidate.slug}/${observation.family}`)
  }
  if (dtoRows.length > 0 && dtoIdentityIds.length > 1) throw new Error(`DTO sem identidade única para ${candidate.slug}/${observation.family}`)
  const sourceKeySet = new Set(sourceKeys)
  const unmatched = dtoKeys.filter((key) => !sourceKeySet.has(key))
  if (unmatched.length > 0) throw new Error(`DTO contém chaves ausentes na fonte oficial: ${unmatched.slice(0, 3).join(",")}`)
  if (dtoKeys.length !== sourceKeys.length) {
    throw new Error(`DTO truncado: ${dtoKeys.length}/${sourceKeys.length} linhas; declared_total=${declaredTotal ?? "?"}`)
  }
  const sourceByKey = new Map(sourceRowsData.map((row) => [rowKey(row, observation.family), materialRow(row, observation.family)]))
  const dtoByKey = new Map(dtoRows.map((row) => [rowKey(row, observation.family), materialRow(row, observation.family)]))
  for (const key of sourceKeys) {
    if (canonicalJson(sourceByKey.get(key)) !== canonicalJson(dtoByKey.get(key))) {
      throw new Error(`conteúdo material da linha diverge entre fonte e DTO: ${key}`)
    }
  }
  const profilePayload = readRawJson(observation.readback.profile_path)
  const envelope = object(profilePayload.value)
  const publicProfile = object(envelope?.data) ?? envelope
  if (!publicProfile || publicProfile.slug !== candidate.slug || publicProfile.id !== candidate.candidato_id) {
    throw new Error("perfil público do readback diverge de slug/candidato_id")
  }
  const field = observation.family === "projetos_lei" ? "projetos_lei" : observation.family === "votos_candidato" ? "votos" : "gastos_parlamentares"
  const publicRows = publicProfile[field]
  if (!Array.isArray(publicRows) || canonicalJson(publicRows) !== canonicalJson(dtoRows)) {
    throw new Error("linhas do DTO não conferem com o perfil público integral")
  }
  const publicPayloadSha256 = publicFamilyPayloadSha256(publicProfile, observation.family)
  const dtoSubsetSha256 = sha256(canonicalJson(dtoRows))
  const dtoCount = dtoRows.length
  const resultado: ReceiptResult = dtoCount > 0 ? "encontrado" : "vazio_confirmado"
  return {
    fonte: sourceName(observation.house, observation.family),
    escopo: "candidato",
    alvo: candidate.slug,
    candidato_id: candidate.candidato_id,
    resultado,
    volume: dtoCount,
    familia: observation.family,
    url: observation.source.source_url,
    executado_em: executedAt,
    detalhe: detailFor({ candidate, observation, dtoCount, dtoSubsetSha256, identityIds: dtoIdentityIds, sourceSha256, sourceRows, declaredTotal, rosterSha256, publicPayloadSha256 }),
  }
}

/**
 * Constrói recibos sem fazer join nominal e sem converter ID ausente em vazio.
 * A ausência de observação para um ID existente é erro de prova, não sucesso.
 */
export function collectParliamentaryFamilyReceipts(
  candidates: readonly ParliamentaryCandidate[],
  observations: readonly ParliamentarySourceObservation[],
  generatedAt = new Date().toISOString(),
): ParliamentaryReceiptRun {
  const receipts: ParliamentaryReceipt[] = []
  const unresolved_without_id: ParliamentaryReceiptRun["unresolved_without_id"] = []
  const errors: string[] = []
  const byKey = new Map(observations.map((item) => [`${item.house}:${normalizedId(item.official_id)}:${item.family}`, item]))

  for (const candidate of candidates) {
    for (const family of PARLIAMENTARY_FAMILIES) {
      const houses: ParliamentaryHouse[] = []
      if (candidate.ids.camara != null && String(candidate.ids.camara).trim() !== "") houses.push("camara")
      if (candidate.ids.senado != null && String(candidate.ids.senado).trim() !== "") houses.push("senado")
      if (houses.length === 0) {
        unresolved_without_id.push({ slug: candidate.slug, familia: family, motivo: "ID oficial da Câmara/Senado ausente; nenhum join por nome" })
        continue
      }
      for (const house of houses) {
        const id = normalizedId(candidate.ids[house] as number | string)
        const observation = byKey.get(`${house}:${id}:${family}`)
        if (!observation) {
          errors.push(`${candidate.slug}/${family}/${house}/${id}: readback oficial ausente`)
          continue
        }
        try {
          receipts.push(makeReceipt(candidate, observation, generatedAt))
        } catch (error) {
          errors.push(`${candidate.slug}/${family}/${house}/${id}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    }
  }
  return { generated_at: generatedAt, receipts, unresolved_without_id, errors }
}

/** Leitura opcional de um pacote JSON local; não consulta rede. */
export function loadLocalParliamentaryReceiptInputs(path: string): {
  candidates: ParliamentaryCandidate[]
  observations: ParliamentarySourceObservation[]
} {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as { candidates?: ParliamentaryCandidate[]; observations?: ParliamentarySourceObservation[] }
  if (!Array.isArray(parsed.candidates) || !Array.isArray(parsed.observations)) throw new Error("pacote local precisa de candidates e observations")
  return { candidates: parsed.candidates, observations: parsed.observations }
}

function cliArgument(name: string): string | null {
  const prefix = `--${name}=`
  const value = process.argv.slice(2).find((argument) => argument.startsWith(prefix))
  return value ? value.slice(prefix.length) : null
}

function writePrivateAtomic(path: string, value: unknown): void {
  const absolute = resolve(path)
  const moduleRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
  if (absolute === moduleRoot || absolute.startsWith(`${moduleRoot}/`)) throw new Error("--out precisa estar fora do repositório")
  mkdirSync(dirname(absolute), { recursive: true, mode: 0o700 })
  const temporary = `${absolute}.tmp-${process.pid}`
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" })
  chmodSync(temporary, 0o600)
  renameSync(temporary, absolute)
  chmodSync(absolute, 0o600)
}

async function runCli(): Promise<void> {
  const input = cliArgument("input")
  const output = cliArgument("out")
  if (!input || !output) throw new Error("uso: --input=<manifest.json> --out=<arquivo-privado.json>")
  const { candidates, observations } = loadLocalParliamentaryReceiptInputs(resolve(input))
  const result = collectParliamentaryFamilyReceipts(candidates, observations)
  writePrivateAtomic(output, result)
  process.stdout.write(JSON.stringify({
    status: result.errors.length === 0 ? "ok" : "partial",
    candidates: candidates.length,
    observations: observations.length,
    receipts: result.receipts.length,
    unresolved_without_id: result.unresolved_without_id.length,
    errors: result.errors.length,
  }) + "\n")
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null
if (invokedPath === import.meta.url) {
  void runCli().catch((error: unknown) => {
    process.stderr.write(`collect-parliamentary-family-receipts-local: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}

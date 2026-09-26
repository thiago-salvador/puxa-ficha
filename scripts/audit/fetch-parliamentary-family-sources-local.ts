/**
 * Captura local, somente leitura, das fontes parlamentares oficiais.
 *
 * Este programa não conhece Supabase e não grava dados do produto. Cada
 * resposta é preservada como bytes recebidos. Para consultas paginadas, o
 * manifesto aponta para as páginas brutas e para um bundle derivado que o
 * coletor de recibos pode ler. A completude do bundle só é declarada quando a
 * API encerra a paginação; uma resposta XML/CSV sem adaptador é pendência.
 *
 * A lista de candidatos é o universo nominal. A identidade vem exclusivamente
 * de ids.camara e ids.senado. Um roster atual não é usado como prova de
 * completude histórica: ele é rotulado como legislatura atual e a cobertura
 * histórica permanece indeterminada.
 */

import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { assertOutsideRepository } from "./lib/private-output"

type House = "camara" | "senado"
type Family = "projetos_lei" | "votos_candidato" | "gastos_parlamentares"
type Candidate = { slug: string; candidato_id?: string; nome_completo?: string; ids?: { camara?: number | string | null; senado?: number | string | null } }
type Page = { page: number; url: string; path: string; bytes: number; sha256: string; rows: number; complete: boolean }
type Pending = { house: House; family: Family; official_id?: string; reason: string; source?: string }
type Readback = { dto_path: string; dto_rows_path: string[]; profile_path: string; dto_revision: string; dto_readback_url: string }
type ReadbackIndex = Record<string, Readback>

const CAMARA = "https://dadosabertos.camara.leg.br/api/v2"
const SENADO = "https://legis.senado.leg.br/dadosabertos"
const CEAPS = "https://adm.senado.gov.br/adm-dadosabertos/api/v1/senadores/despesas_ceaps"
const MAX_BYTES = 200_000_000
let cacheRoot: string | null = null

function option(name: string): string | null {
  return process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null
}

function sha256(bytes: Buffer): string { return createHash("sha256").update(bytes).digest("hex") }

function id(value: unknown): string | null {
  const normalized = String(value ?? "").trim()
  return /^\d+$/.test(normalized) ? normalized : null
}

function officialUrl(value: string): URL {
  const url = new URL(value)
  if (url.protocol !== "https:" || ![
    "dadosabertos.camara.leg.br",
    "legis.senado.leg.br",
    "adm.senado.gov.br",
  ].includes(url.hostname)) throw new Error(`endpoint oficial rejeitado: ${value}`)
  return url
}

/** Metadados da página sem os bytes decodificados. */
function stripValue<T extends { value: unknown }>(item: T): Omit<T, "value"> {
  const copy: Partial<T> = { ...item }
  delete copy.value
  return copy as Omit<T, "value">
}

function privateDestination(value: string): string {
  const destination = assertOutsideRepository(value, "destino")
  mkdirSync(destination, { recursive: true, mode: 0o700 })
  return destination
}

function readCandidates(path: string): Candidate[] {
  const value = JSON.parse(readFileSync(path, "utf8")) as unknown
  if (!Array.isArray(value)) throw new Error("candidatos precisa ser uma lista JSON")
  return value.filter((candidate): candidate is Candidate => Boolean(candidate && typeof candidate === "object" && typeof (candidate as Candidate).slug === "string"))
}

function readVoteIds(path: string | null): string[] {
  if (!path) return []
  const value = JSON.parse(readFileSync(path, "utf8")) as unknown
  const rows = Array.isArray(value) ? value : (value && typeof value === "object" && Array.isArray((value as { votacoes?: unknown[] }).votacoes) ? (value as { votacoes: unknown[] }).votacoes : [])
  return [...new Set(rows.map((row) => typeof row === "string" ? row : (row && typeof row === "object" ? (row as Record<string, unknown>).votacao_id_api ?? (row as Record<string, unknown>).id : null)).map(id).filter((value): value is string => value !== null))]
}

function readReadbacks(path: string | null): ReadbackIndex {
  if (!path) return {}
  const value = JSON.parse(readFileSync(path, "utf8")) as unknown
  const raw = value && typeof value === "object" && !Array.isArray(value)
    ? ((value as { readbacks?: unknown }).readbacks ?? value)
    : {}
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("readback precisa ser um mapa house:id:family")
  const result: ReadbackIndex = {}
  for (const [key, candidate] of Object.entries(raw)) {
    if (!candidate || typeof candidate !== "object") continue
    const item = candidate as Partial<Readback>
    if (typeof item.dto_path === "string" && Array.isArray(item.dto_rows_path) && typeof item.profile_path === "string" && typeof item.dto_revision === "string" && typeof item.dto_readback_url === "string") {
      result[key] = { dto_path: resolve(item.dto_path), dto_rows_path: item.dto_rows_path.map(String), profile_path: resolve(item.profile_path), dto_revision: item.dto_revision, dto_readback_url: item.dto_readback_url }
    }
  }
  return result
}

function readbackFromPublicProfiles(path: string, destination: string, candidates: Candidate[]): ReadbackIndex {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown
  if (!Array.isArray(parsed)) throw new Error("--public-profiles exige lista de perfis públicos")
  const bySlug = new Map<string, Record<string, unknown>>()
  for (const raw of parsed) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("perfil público inválido")
    const profile = raw as Record<string, unknown>
    if (typeof profile.slug !== "string" || typeof profile.id !== "string" || !profile.id || bySlug.has(profile.slug)) {
      throw new Error("slug/id público ausente ou duplicado")
    }
    bySlug.set(profile.slug, profile)
  }
  const result: ReadbackIndex = {}
  for (const candidate of candidates) {
    if (!candidate.ids?.camara && !candidate.ids?.senado) continue
    const profile = bySlug.get(candidate.slug)
    if (!profile) continue
    candidate.candidato_id = profile.id as string
    const dir = join(destination, "readbacks", sha256(Buffer.from(candidate.slug, "utf8")))
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    const profileBytes = Buffer.from(`${JSON.stringify(profile)}\n`)
    const profilePath = join(dir, "profile.json")
    writeFileSync(profilePath, profileBytes, { mode: 0o600, flag: "wx" })
    for (const family of ["projetos_lei", "votos_candidato", "gastos_parlamentares"] as const) {
      const key = family === "votos_candidato" ? "votos" : family
      if (!Array.isArray(profile[key])) continue
      const dtoBytes = Buffer.from(`${JSON.stringify({ dados: profile[key] })}\n`)
      const dtoPath = join(dir, `${family}.json`)
      writeFileSync(dtoPath, dtoBytes, { mode: 0o600, flag: "wx" })
      for (const house of ["camara", "senado"] as const) {
        const officialId = id(candidate.ids[house])
        if (!officialId) continue
        result[`${house}:${officialId}:${family}`] = {
          dto_path: dtoPath, dto_rows_path: ["dados"], profile_path: profilePath,
          dto_revision: `sha256:${sha256(dtoBytes)}`, dto_readback_url: `local-public-profile-snapshot:${resolve(path)}`,
        }
      }
    }
  }
  return result
}

async function fetchRaw(url: string): Promise<{ bytes: Buffer; contentType: string }> {
  const parsed = officialUrl(url)
  const response = await fetch(parsed, { signal: AbortSignal.timeout(120_000), headers: { Accept: "application/json" } })
  const contentType = response.headers.get("content-type") ?? ""
  const bytes = Buffer.from(await response.arrayBuffer())
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  if (bytes.length > MAX_BYTES) throw new Error(`${url}: resposta excede ${MAX_BYTES} bytes`)
  if (!/json/i.test(contentType)) throw new Error(`${url}: formato não JSON (${contentType || "sem content-type"}); XML/CSV permanece unresolved`)
  try { JSON.parse(bytes.toString("utf8")) } catch { throw new Error(`${url}: JSON inválido; XML/CSV permanece unresolved`) }
  return { bytes, contentType }
}

function rowsOf(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (value && typeof value === "object" && Array.isArray((value as { dados?: unknown[] }).dados)) return (value as { dados: unknown[] }).dados
  if (value && typeof value === "object" && Array.isArray((value as { DespesasSenador?: unknown[] }).DespesasSenador)) return (value as { DespesasSenador: unknown[] }).DespesasSenador
  const root = value && typeof value === "object" ? value as Record<string, unknown> : {}
  for (const [envelope, group, rowKey] of [["MateriasAutoriaParlamentar", "Autorias", "Autoria"], ["VotacaoParlamentar", "Votacoes", "Votacao"]] as const) {
    if (!(envelope in root)) continue
    const parlamentar = (root[envelope] as { Parlamentar?: { Codigo?: unknown; [key: string]: unknown } } | undefined)?.Parlamentar
    const container = parlamentar?.[group] as Record<string, unknown> | undefined
    const rows = container?.[rowKey]
    if (!Array.isArray(rows) || !/^\d+$/.test(String(parlamentar?.Codigo ?? ""))) throw new Error(`formato ${envelope} sem ${group}.${rowKey} e ID`)
    return rows.map((row) => row && typeof row === "object" && !Array.isArray(row)
      ? { ...(row as Record<string, unknown>), CodigoParlamentar: String(parlamentar?.Codigo) }
      : row)
  }
  return []
}

function hasNext(value: unknown, rowCount: number): boolean {
  if (Array.isArray(value)) return false
  if (value && typeof value === "object" && ("MateriasAutoriaParlamentar" in value || "VotacaoParlamentar" in value)) return false
  if (value && typeof value === "object" && Array.isArray((value as { links?: unknown[] }).links)) {
    return (value as { links: Array<{ rel?: string }> }).links.some((link) => link.rel === "next")
  }
  return rowCount >= 100
}

async function capturePage(destination: string, relative: string, page: number, url: string): Promise<Page & { value: unknown }> {
  const cached = cacheRoot ? join(cacheRoot, relative, `pagina-${page}.json`) : null
  const result = cached && existsSync(cached)
    ? { bytes: readFileSync(cached), contentType: "application/json" }
    : await fetchRaw(url)
  const path = join(destination, relative, `pagina-${page}.json`)
  mkdirSync(resolve(path, ".."), { recursive: true, mode: 0o700 })
  writeFileSync(path, result.bytes, { mode: 0o600, flag: "wx" })
  const value = JSON.parse(result.bytes.toString("utf8")) as unknown
  const rows = rowsOf(value).length
  return { page, url, path, bytes: result.bytes.length, sha256: sha256(result.bytes), rows, complete: !hasNext(value, rows), value }
}

async function capturePaginated(destination: string, relative: string, baseUrl: string, params: Record<string, string>): Promise<Page[]> {
  const pages: Page[] = []
  for (let page = 1; ; page++) {
    const query = new URLSearchParams({ ...params, itens: "100", pagina: String(page) })
    const captured = await capturePage(destination, relative, page, `${baseUrl}?${query}`)
    pages.push(captured)
    if (captured.complete) return pages
  }
}

function writeBundle(destination: string, relative: string, pages: Array<Page & { value: unknown }>): { path: string; sha256: string; bytes: number } {
  const rows = pages.flatMap((page) => rowsOf(page.value))
  const groups = new Map<string, Array<Page & { value: unknown }>>()
  for (const page of pages) {
    const url = new URL(page.url)
    url.searchParams.delete("pagina")
    const key = url.href
    groups.set(key, [...(groups.get(key) ?? []), page])
  }
  const complete = groups.size > 0 && [...groups.values()].every((group) =>
    group[group.length - 1]?.complete === true && group.slice(0, -1).every((page) => page.complete === false))
  // O total do bundle é derivado somente depois de todas as páginas de cada
  // consulta terminarem. O coletor ainda compara cada linha com o DTO público.
  const declaredTotal = complete ? rows.length : null
  const bundle = { schema_version: 1, complete, total: declaredTotal ?? (complete ? rows.length : null), derived_from_pages: pages.map(({ page, url, path, bytes, sha256: digest, complete: pageComplete }) => ({ page, url, path, bytes, sha256: digest, complete: pageComplete })), dados: rows }
  const bytes = Buffer.from(`${JSON.stringify(bundle)}\n`, "utf8")
  const path = join(destination, relative, "bundle.json")
  mkdirSync(resolve(path, ".."), { recursive: true, mode: 0o700 })
  writeFileSync(path, bytes, { mode: 0o600, flag: "wx" })
  return { path, sha256: sha256(bytes), bytes: bytes.length }
}

function rowContainsId(row: unknown, officialId: string): boolean {
  if (Array.isArray(row)) return row.some((item) => rowContainsId(item, officialId))
  if (!row || typeof row !== "object") return false
  const record = row as Record<string, unknown>
  for (const key of ["idDeputado", "idDeputadoAutor", "idParlamentar", "codSenador", "CodigoParlamentar", "codigoParlamentar", "idSenador"]) {
    if (String(record[key] ?? "").trim() === officialId) return true
  }
  for (const value of Object.values(record)) if (value && typeof value === "object" && rowContainsId(value, officialId)) return true
  return false
}

function filterBundlePages(pages: Array<Page & { value: unknown }>, officialId: string): Array<Page & { value: unknown }> {
  return pages.map((page) => {
    if (Array.isArray(page.value)) return { ...page, value: page.value.filter((row) => rowContainsId(row, officialId)) }
    const value = page.value && typeof page.value === "object" ? { ...(page.value as Record<string, unknown>) } : page.value
    if (!value || typeof value !== "object") return page
    const root = value as Record<string, unknown>
    for (const key of ["dados", "rows", "VotacaoParlamentar", "DespesasSenador"]) {
      if (Array.isArray(root[key])) root[key] = root[key].filter((row) => rowContainsId(row, officialId))
    }
    return { ...page, value }
  })
}

function familySource(house: House, family: Family, officialId: string): string {
  if (house === "camara") {
    if (family === "projetos_lei") return `${CAMARA}/proposicoes?idDeputadoAutor=${officialId}`
    if (family === "votos_candidato") return `${CAMARA}/votacoes/{votacao_id}/votos`
    return `${CAMARA}/deputados/${officialId}/despesas`
  }
  if (family === "projetos_lei") return `${SENADO}/senador/${officialId}/autorias.json`
  if (family === "votos_candidato") return `${SENADO}/senador/${officialId}/votacoes.json`
  return `${CEAPS}/{ano}`
}

async function main(): Promise<void> {
  const destinationArg = option("destino")
  const candidatesPath = option("candidatos") ?? "data/candidatos.json"
  if (!destinationArg) throw new Error("uso: --destino=<pasta privada> [--candidatos=data/candidatos.json] --public-profiles=<snapshot-privado.json> [--anos=2019,2020,...] [--camara-votacoes=arquivo.json]")
  const destination = privateDestination(destinationArg)
  cacheRoot = option("cache-dir") ? privateDestination(option("cache-dir")!) : null
  const candidates = readCandidates(candidatesPath)
  const years = (option("anos") ?? "2019,2020,2021,2022,2023,2024,2025,2026").split(",").map(Number).filter((year) => Number.isInteger(year) && year >= 2000 && year <= 2026)
  const camaraVoteIds = readVoteIds(option("camara-votacoes"))
  const publicProfilesPath = option("public-profiles")
  const readbackPath = option("readback")
  if (Boolean(publicProfilesPath) === Boolean(readbackPath)) throw new Error("forneça exatamente um de --public-profiles ou --readback")
  const readbacks = publicProfilesPath
    ? readbackFromPublicProfiles(publicProfilesPath, destination, candidates)
    : readReadbacks(readbackPath)
  const observations: Array<Record<string, unknown>> = []
  const pending: Pending[] = []
  const ceapsByYear = new Map<number, Page & { value: unknown }>()
  const addObservation = (input: { house: House; family: Family; officialId: string; sourceUrl: string; sourcePath: string; rowsPath: string[]; roster: Record<string, unknown>; rawPages: unknown[]; bundleSha256: string; extra?: Record<string, unknown> }): void => {
    const key = `${input.house}:${input.officialId}:${input.family}`
    const readback = readbacks[key]
    if (!readback) {
      pending.push({ house: input.house, family: input.family, official_id: input.officialId, reason: "readback DTO/perfil não fornecido; captura não pode virar recibo positivo", source: input.sourceUrl })
      return
    }
    observations.push({ house: input.house, family: input.family, official_id: input.officialId, roster: input.roster, source: { source_url: input.sourceUrl, source_path: input.sourcePath, rows_path: input.rowsPath }, readback, raw_pages: input.rawPages, source_bundle_sha256: input.bundleSha256, ...input.extra })
  }

  for (const candidate of candidates) {
    if (publicProfilesPath && !candidate.candidato_id) continue
    for (const house of ["camara", "senado"] as const) {
      const officialId = id(candidate.ids?.[house])
      if (!officialId) continue
      try {
      const rosterUrl = house === "camara" ? `${CAMARA}/deputados/${officialId}` : `${SENADO}/senador/${officialId}.json`
      const roster = await capturePage(destination, `rosters/${house}/${officialId}`, 1, rosterUrl)
      const rosterRef = { roster_url: rosterUrl, roster_revision: `captured:${roster.sha256}`, roster_path: roster.path, scope: "cohort_id_identity_only", historical_completeness: "unresolved" }

      if (house === "camara") {
        const projects = await capturePaginated(destination, `familias/${house}/${officialId}/projetos_lei`, `${CAMARA}/proposicoes`, { idDeputadoAutor: officialId, ordem: "DESC", ordenarPor: "id" })
        const projectsBundle = writeBundle(destination, `familias/${house}/${officialId}/projetos_lei`, projects as Array<Page & { value: unknown }>)
        addObservation({ house, family: "projetos_lei", officialId, sourceUrl: familySource(house, "projetos_lei", officialId), sourcePath: projectsBundle.path, rowsPath: ["dados"], roster: rosterRef, rawPages: (projects as Array<Page & { value: unknown }>).map(stripValue), bundleSha256: projectsBundle.sha256 })

        // The existing Câmara ingest reads each year and uses the legislature
        // matching that year. Keeping those query parameters here prevents a
        // current-legislature response from being mislabeled as history.
        const expensePages: Array<Page & { value: unknown }> = []
        for (const year of years) {
          const idLegislatura = year <= 2022 ? "56" : "57"
          const pages = await capturePaginated(destination, `familias/${house}/${officialId}/gastos_parlamentares/${year}`, `${CAMARA}/deputados/${officialId}/despesas`, { ano: String(year), idLegislatura })
          expensePages.push(...pages as Array<Page & { value: unknown }>)
        }
        const expensesBundle = writeBundle(destination, `familias/${house}/${officialId}/gastos_parlamentares`, expensePages)
        addObservation({ house, family: "gastos_parlamentares", officialId, sourceUrl: `${CAMARA}/deputados/${officialId}/despesas`, sourcePath: expensesBundle.path, rowsPath: ["dados"], roster: rosterRef, rawPages: expensePages.map(stripValue), bundleSha256: expensesBundle.sha256, extra: { years, id_legislatura_by_year: Object.fromEntries(years.map((year) => [year, year <= 2022 ? 56 : 57])) } })
        if (camaraVoteIds.length === 0) {
          pending.push({ house, family: "votos_candidato", official_id: officialId, reason: "IDs exatos de votações-chave da Câmara não foram fornecidos; endpoint por deputado é deliberadamente recusado pelo ingest existente", source: familySource(house, "votos_candidato", officialId) })
        } else {
          const pages: Array<Page & { value: unknown }> = []
          for (const voteId of camaraVoteIds) pages.push(await capturePage(destination, `familias/${house}/${officialId}/votos_candidato/${voteId}`, 1, `${CAMARA}/votacoes/${voteId}/votos`))
          const filteredPages = filterBundlePages(pages, officialId)
          const filteredCounts = filteredPages.map((page) => {
            const root = page.value && typeof page.value === "object" ? page.value as Record<string, unknown> : {}
            return Array.isArray(root.dados) ? root.dados.length : null
          })
          if (filteredCounts.some((count) => count === null) || filteredCounts.every((count) => count === 0)) {
            pending.push({ house, family: "votos_candidato", official_id: officialId, reason: "as páginas de votação não contêm linha nominal do deputado alvo", source: `${CAMARA}/votacoes/{votacao_id}/votos` })
          } else {
            const bundle = writeBundle(destination, `familias/${house}/${officialId}/votos_candidato`, filteredPages)
            addObservation({ house, family: "votos_candidato", officialId, sourceUrl: `${CAMARA}/votacoes/{votacao_id}/votos?deputado=${officialId}`, sourcePath: bundle.path, rowsPath: ["dados"], roster: rosterRef, rawPages: filteredPages.map(stripValue), bundleSha256: bundle.sha256, extra: { vote_ids: camaraVoteIds } })
          }
        }
      } else {
        for (const [family, url] of [["projetos_lei", `${SENADO}/senador/${officialId}/autorias.json`], ["votos_candidato", `${SENADO}/senador/${officialId}/votacoes.json`]] as const) {
          try {
            const page = await capturePage(destination, `familias/${house}/${officialId}/${family}`, 1, url)
            const bundle = writeBundle(destination, `familias/${house}/${officialId}/${family}`, [page])
            addObservation({ house, family, officialId, sourceUrl: url, sourcePath: bundle.path, rowsPath: ["dados"], roster: rosterRef, rawPages: [((stripValue)(page))], bundleSha256: bundle.sha256 })
          } catch (error) {
            pending.push({ house, family, official_id: officialId, reason: error instanceof Error ? error.message : String(error), source: url })
          }
        }
        try {
          const expensePages: Array<Page & { value: unknown }> = []
          for (const year of years) {
            let page = ceapsByYear.get(year)
            if (!page) {
              page = await capturePage(destination, `fontes/ceaps/${year}`, 1, `${CEAPS}/${year}`)
              ceapsByYear.set(year, page)
            }
            expensePages.push(filterBundlePages([page], officialId)[0]!)
          }
          const expenseBundle = writeBundle(destination, `familias/${house}/${officialId}/gastos_parlamentares`, expensePages)
          addObservation({ house, family: "gastos_parlamentares", officialId, sourceUrl: `${CEAPS}/{ano}?codSenador=${officialId}`, sourcePath: expenseBundle.path, rowsPath: ["dados"], roster: rosterRef, rawPages: expensePages.map(stripValue), bundleSha256: expenseBundle.sha256, extra: { years, source_filter: { field: "codSenador", value: officialId } } })
        } catch (error) {
          pending.push({ house, family: "gastos_parlamentares", official_id: officialId, reason: error instanceof Error ? error.message : String(error), source: familySource(house, "gastos_parlamentares", officialId) })
        }
      }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        for (const family of ["projetos_lei", "votos_candidato", "gastos_parlamentares"] as const) {
          pending.push({ house, family, official_id: officialId, reason, source: familySource(house, family, officialId) })
        }
      }
    }
  }

  const cohortCandidates = publicProfilesPath ? candidates.filter((candidate) => Boolean(candidate.candidato_id)) : candidates
  const manifest = { schema_version: 1, generated_at: new Date().toISOString(), candidates_path: resolve(candidatesPath), candidates: cohortCandidates, observations, pending, limitations: ["roster atual/histórico não é usado como completude histórica", "CEAPS é lote anual e exige filtro codSenador", "votos Câmara exigem lista local de IDs exatos", "XML/CSV sem adaptador explícito permanece unresolved"] }
  const manifestPath = join(destination, "parliamentary-family-sources.json")
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600, flag: "wx" })
  console.log(JSON.stringify({ manifest: manifestPath, observations: observations.length, pending: pending.length, candidates: cohortCandidates.length }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 })
}

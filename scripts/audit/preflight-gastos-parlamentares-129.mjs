/**
 * Preflight somente leitura para a quarentena de gastos de 25/09/2026.
 * Rodar com Node 24 e --import tsx, informando --evidence, --env e --out.
 * Nunca envia POST/PATCH/DELETE ao banco nem à fonte oficial.
 */
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { GASTOS_PARLAMENTARES_EM_REVISAO } from "../../src/lib/gastos-parlamentares-em-revisao.ts"

const EXPECTED_EVIDENCE_SHA = "775e5af5c0bc4bd371162334ded355a5bced1c8662d215fe2962980e7e559416"
const CAMARA = new Map([
  ["tse-2026-10002544274:2026", [220589, 57]],
  ["tse-2026-140002542691:2011", [73933, 54]],
  ["tse-2026-190002548141:2015", [73701, 55]],
  ["tse-2026-190002548141:2019", [73701, 56]],
  ["tse-2026-190002548141:2023", [73701, 57]],
  ["tse-2026-190002548141:2025", [73701, 57]],
  ["tse-2026-190002548141:2026", [73701, 57]],
  ["tse-2026-80002551368:2011", [73507, 54]],
])

function sha256(data) {
  return createHash("sha256").update(data).digest("hex")
}

function requiredArg(name) {
  const index = process.argv.indexOf(`--${name}`)
  if (index < 0 || !process.argv[index + 1]) throw new Error(`Falta --${name} <path>`)
  return process.argv[index + 1]
}

function readEnv(path) {
  const result = {}
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue
    const index = line.indexOf("=")
    if (index < 0) continue
    result[line.slice(0, index)] = line.slice(index + 1).replace(/^['"]|['"]$/g, "")
  }
  if (!result.SUPABASE_URL || !result.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Env Supabase incompleto")
  if (!result.SUPABASE_URL.startsWith("https://")) throw new Error("URL Supabase inválida")
  return result
}

async function getJsonWithHash(url, headers = undefined) {
  const response = await fetch(url, { method: "GET", headers, signal: AbortSignal.timeout(60_000) })
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  const body = Buffer.from(await response.arrayBuffer())
  return { data: JSON.parse(body.toString("utf8")), sha256: sha256(body) }
}

function cents(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) throw new Error(`Valor inválido: ${value}`)
  return Math.round(number * 100)
}

async function camaraTotal(id, year, legislature) {
  const base = `https://dadosabertos.camara.leg.br/api/v2/deputados/${id}/despesas`
  let next = `${base}?ano=${year}&idLegislatura=${legislature}&itens=100&pagina=1`
  const seen = new Set()
  const pageHashes = []
  let rows = 0
  let totalCents = 0
  while (next) {
    if (!next.startsWith(base + "?") || seen.has(next) || pageHashes.length >= 30) {
      throw new Error(`Paginação Câmara inválida: ${id}/${year}`)
    }
    seen.add(next)
    const page = await getJsonWithHash(next)
    if (!Array.isArray(page.data.dados)) throw new Error(`Resposta Câmara inválida: ${id}/${year}`)
    pageHashes.push(page.sha256)
    for (const row of page.data.dados) {
      if (Number(row.ano) !== year) throw new Error(`Câmara retornou outro ano: ${id}/${year}`)
      totalCents += cents(row.valorLiquido)
      rows++
    }
    next = page.data.links?.find((link) => link.rel === "next")?.href ?? null
  }
  if (rows === 0) throw new Error(`Câmara sem documentos: ${id}/${year}`)
  return { source_url: base, source_sha256: sha256(pageHashes.join("\n")), source_rows: rows, source_pages: pageHashes.length, official_total_cents: totalCents }
}

async function main() {
  const evidencePath = requiredArg("evidence")
  const envPath = requiredArg("env")
  const outputPath = requiredArg("out")
  const evidenceBody = readFileSync(evidencePath)
  if (sha256(evidenceBody) !== EXPECTED_EVIDENCE_SHA) throw new Error("SHA-256 da lista de 129 casos mudou")
  const cases = JSON.parse(evidenceBody.toString("utf8")).casos
  const senateCases = new Map()
  for (const item of cases) {
    if (item.familia !== "gastos_parlamentares") continue
    for (const [pathKey, shaKey] of [["fonte_arquivada", "fonte_arquivada_sha256"], ["dto_arquivado", "dto_arquivado_sha256"]]) {
      if (sha256(readFileSync(item[pathKey])) !== item[shaKey]) throw new Error(`Arquivo alterado: ${item.slug}/${pathKey}`)
    }
    if (item.casa === "senado") senateCases.set(item.slug, item)
  }

  const env = readEnv(envPath)
  const headers = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
  const slugs = [...new Set(GASTOS_PARLAMENTARES_EM_REVISAO.map(([slug]) => slug))]
  const candidateUrl = new URL(`${env.SUPABASE_URL}/rest/v1/candidatos`)
  candidateUrl.searchParams.set("select", "id,slug")
  candidateUrl.searchParams.set("slug", `in.(${slugs.join(",")})`)
  const candidateRows = (await getJsonWithHash(candidateUrl.toString(), headers)).data
  if (candidateRows.length !== slugs.length) throw new Error(`Banco retornou ${candidateRows.length}/${slugs.length} candidatos`)
  const ids = candidateRows.map((row) => row.id)
  const slugById = new Map(candidateRows.map((row) => [row.id, row.slug]))
  const idBySlug = new Map(candidateRows.map((row) => [row.slug, row.id]))
  const expenseUrl = new URL(`${env.SUPABASE_URL}/rest/v1/gastos_parlamentares`)
  expenseUrl.searchParams.set("select", "id,candidato_id,ano,total_gasto,fonte,detalhamento")
  expenseUrl.searchParams.set("candidato_id", `in.(${ids.join(",")})`)
  expenseUrl.searchParams.set("limit", "1000")
  const dbRows = (await getJsonWithHash(expenseUrl.toString(), headers)).data
  if (dbRows.length >= 1000) throw new Error("Preimage truncada pelo limite PostgREST")
  const dbByKey = new Map()
  for (const row of dbRows) {
    const key = `${slugById.get(row.candidato_id)}:${row.ano}`
    const list = dbByKey.get(key) ?? []
    list.push(row)
    dbByKey.set(key, list)
  }

  const years = [...new Set(GASTOS_PARLAMENTARES_EM_REVISAO.filter(([slug, year]) => !CAMARA.has(`${slug}:${year}`)).map(([, year]) => year))]
  const senateYearData = new Map()
  for (const year of years.sort((a, b) => a - b)) {
    const sourceUrl = `https://adm.senado.gov.br/adm-dadosabertos/api/v1/senadores/despesas_ceaps/${year}`
    const response = await getJsonWithHash(sourceUrl)
    if (!Array.isArray(response.data) || response.data.some((row) => Number(row.ano) !== year)) throw new Error(`Resposta Senado inválida: ${year}`)
    senateYearData.set(year, { ...response, sourceUrl })
  }

  const checkedAt = new Date().toISOString()
  const results = []
  for (const [slug, year, expectedCents] of GASTOS_PARLAMENTARES_EM_REVISAO) {
    const key = `${slug}:${year}`
    const matchingDbRows = dbByKey.get(key) ?? []
    if (matchingDbRows.length !== 1) throw new Error(`${key}: ${matchingDbRows.length} linhas no banco, esperado 1`)
    const db = matchingDbRows[0]
    if (db.candidato_id !== idBySlug.get(slug) || cents(db.total_gasto) !== expectedCents) throw new Error(`${key}: preimage do banco mudou`)
    let source
    let house
    let officialId
    let legislature = null
    if (CAMARA.has(key)) {
      house = "camara"
      ;[officialId, legislature] = CAMARA.get(key)
      source = await camaraTotal(officialId, year, legislature)
    } else {
      house = "senado"
      const senateCase = senateCases.get(slug)
      if (!senateCase) throw new Error(`${key}: ID Senado não consta do recibo`)
      officialId = Number(senateCase.id_oficial_parlamentar)
      const annual = senateYearData.get(year)
      const matching = annual.data.filter((row) => Number(row.codSenador) === officialId)
      if (matching.length === 0) throw new Error(`${key}: sem registros na fonte Senado`)
      source = {
        source_url: annual.sourceUrl,
        source_sha256: annual.sha256,
        source_rows: matching.length,
        source_pages: 1,
        official_total_cents: matching.reduce((sum, row) => sum + cents(row.valorReembolsado), 0),
      }
    }
    if (source.official_total_cents === expectedCents) throw new Error(`${key}: linha não diverge mais; rever quarentena`)
    results.push({
      slug, year, house, official_id: officialId, legislature,
      preimage: { id: db.id, total_cents: expectedCents, fonte: db.fonte, detalhamento_sha256: sha256(JSON.stringify(db.detalhamento)) },
      ...source,
      difference_cents: expectedCents - source.official_total_cents,
      checked_at: checkedAt,
    })
  }
  if (results.length !== 57 || new Set(results.map((row) => row.slug)).size !== 40) throw new Error("Escopo diferente de 57 linhas/40 fichas")
  const output = {
    schema_version: 1,
    checked_at: checkedAt,
    evidence_sha256: EXPECTED_EVIDENCE_SHA,
    summary: { rows: results.length, profiles: new Set(results.map((row) => row.slug)).size, senate: results.filter((row) => row.house === "senado").length, camara: results.filter((row) => row.house === "camara").length },
    rows: results,
  }
  writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`)
  console.log(JSON.stringify({ output: outputPath, ...output.summary, checked_at: checkedAt }))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})

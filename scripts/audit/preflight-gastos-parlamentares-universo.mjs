/**
 * Preflight somente leitura: confere toda linha viva de gastos_parlamentares
 * de ficha pública contra a fonte oficial e lista o que vai para quarentena.
 *
 * Rodar com Node 24:
 *   node --import tsx scripts/audit/preflight-gastos-parlamentares-universo.mjs \
 *     --env .env.local --out <recibo.json> --cache <dir-dos-csv-anuais>
 *
 * Fontes (somente GET):
 * - Senado: despesas_ceaps/{ano}, soma de valorReembolsado por codSenador.
 * - Câmara: /deputados/{id}/despesas?ano=&idLegislatura=, soma de valorLiquido
 *   em todas as legislaturas que cobrem o ano (ano de posse soma as duas).
 * - Câmara, segunda fonte: CSV anual oficial cotas/Ano-{ano}.csv.zip, soma de
 *   vlrLiquido por ideCadastro.
 * - Identidade: /deputados/{id} e senador/{codigo}, nome civil e nascimento.
 *
 * Regra (scripts/audit/lib/gastos-parlamentares-conferencia.ts): confere se a
 * diferença não passa de max(1% do oficial, R$ 50) contra a API ou o CSV anual.
 * O resto vai para quarentena. Nunca envia POST/PATCH/DELETE.
 */
import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { createInterface } from "node:readline"
import {
  casaDaFonte,
  causaDivergencia,
  centavos,
  classificarLinha,
  identidadeConfere,
  legislaturasDoAno,
  statusVaiParaQuarentena,
} from "./lib/gastos-parlamentares-conferencia.ts"
import { GASTOS_PARLAMENTARES_EM_REVISAO } from "../../src/lib/gastos-parlamentares-em-revisao.ts"

const CAMARA_API = "https://dadosabertos.camara.leg.br/api/v2"
const SENADO_CEAPS = "https://adm.senado.gov.br/adm-dadosabertos/api/v1/senadores/despesas_ceaps"
const SENADO_LEGIS = "https://legis.senado.leg.br/dadosabertos/senador"
const CSV_ANUAL = "https://www.camara.leg.br/cotas"

/**
 * Ids que não constam do seed nem da fonte gravada, resolvidos por busca
 * nominal na API da casa. Passam pela mesma verificação de identidade.
 */
const IDS_RESOLVIDOS = {
  "aecio-neves": { senado: 391, camara: 74646 },
}

function sha256(data) {
  return createHash("sha256").update(data).digest("hex")
}

function arg(name, required = true) {
  const index = process.argv.indexOf(`--${name}`)
  if (index < 0 || !process.argv[index + 1]) {
    if (required) throw new Error(`Falta --${name}`)
    return null
  }
  return process.argv[index + 1]
}

function readEnv(path) {
  const env = {}
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue
    const index = line.indexOf("=")
    if (index < 0) continue
    env[line.slice(0, index)] = line.slice(index + 1).replace(/^['"]|['"]$/g, "")
  }
  if (!env.SUPABASE_URL?.startsWith("https://") || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Env Supabase incompleto")
  return env
}

async function getJson(url, headers = { Accept: "application/json" }, tries = 4) {
  let lastError
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      const response = await fetch(url, { method: "GET", headers, signal: AbortSignal.timeout(90_000) })
      if (response.ok) {
        const body = Buffer.from(await response.arrayBuffer())
        return { data: JSON.parse(body.toString("utf8")), sha256: sha256(body) }
      }
      lastError = new Error(`${url}: HTTP ${response.status}`)
      if (response.status < 500 && response.status !== 429) break
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)))
  }
  throw lastError
}

async function restAll(env, path) {
  const headers = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
  const out = []
  for (let from = 0; ; from += 1000) {
    const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
      method: "GET",
      headers: { ...headers, Range: `${from}-${from + 999}` },
      signal: AbortSignal.timeout(60_000),
    })
    if (!response.ok) throw new Error(`PostgREST ${path.split("?")[0]}: HTTP ${response.status}`)
    const page = await response.json()
    out.push(...page)
    if (page.length < 1000) break
  }
  return out
}

async function pool(items, size, fn) {
  const results = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index])
    }
  }))
  return results
}

async function camaraApiTotal(id, ano) {
  const porLegislatura = {}
  const pageHashes = []
  let cents = 0
  let rows = 0
  for (const legislatura of legislaturasDoAno(ano)) {
    const base = `${CAMARA_API}/deputados/${id}/despesas`
    let next = `${base}?ano=${ano}&idLegislatura=${legislatura}&itens=100&pagina=1`
    const seen = new Set()
    let parcial = 0
    while (next) {
      if (!next.startsWith(`${base}?`) || seen.has(next) || seen.size >= 60) throw new Error(`Paginação Câmara inválida: ${id}/${ano}`)
      seen.add(next)
      const page = await getJson(next)
      if (!Array.isArray(page.data.dados)) throw new Error(`Resposta Câmara inválida: ${id}/${ano}`)
      pageHashes.push(page.sha256)
      for (const row of page.data.dados) {
        if (Number(row.ano) !== ano) throw new Error(`Câmara retornou outro ano: ${id}/${ano}`)
        parcial += centavos(row.valorLiquido)
        rows++
      }
      next = page.data.links?.find((link) => link.rel === "next")?.href ?? null
    }
    porLegislatura[legislatura] = parcial
    cents += parcial
  }
  return { cents, rows, por_legislatura: porLegislatura, source_sha256: sha256(pageHashes.join("\n")), pages: pageHashes.length }
}

async function download(url, path) {
  if (existsSync(path)) return
  const response = await fetch(url, { method: "GET", signal: AbortSignal.timeout(600_000) })
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  writeFileSync(path, Buffer.from(await response.arrayBuffer()))
}

/** Soma vlrLiquido por ideCadastro no CSV anual, lendo o zip em fluxo. */
async function csvAnual(ano, cacheDir, idsDeInteresse) {
  const zipPath = join(cacheDir, `Ano-${ano}.csv.zip`)
  await download(`${CSV_ANUAL}/Ano-${ano}.csv.zip`, zipPath)
  const zipSha = sha256(readFileSync(zipPath))
  const child = spawn("unzip", ["-p", zipPath], { stdio: ["ignore", "pipe", "inherit"] })
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity })
  const totals = new Map()
  let header = null
  let linhas = 0
  for await (const raw of lines) {
    const line = raw.replace(/^﻿/, "")
    const fields = line.slice(1, -1).split('";"')
    if (!header) {
      header = new Map(fields.map((name, index) => [name, index]))
      for (const name of ["ideCadastro", "vlrLiquido", "numAno"]) {
        if (!header.has(name)) throw new Error(`CSV ${ano} sem coluna ${name}`)
      }
      continue
    }
    linhas++
    const id = Number(fields[header.get("ideCadastro")])
    if (!idsDeInteresse.has(id)) continue
    if (Number(fields[header.get("numAno")]) !== ano) throw new Error(`CSV ${ano} com numAno divergente`)
    const current = totals.get(id) ?? { cents: 0, rows: 0 }
    current.cents += centavos(fields[header.get("vlrLiquido")])
    current.rows++
    totals.set(id, current)
  }
  const exitCode = await new Promise((resolve) => child.on("close", resolve))
  if (exitCode !== 0 || !header || linhas === 0) throw new Error(`CSV ${ano}: unzip saiu ${exitCode}, ${linhas} linhas`)
  return { url: `${CSV_ANUAL}/Ano-${ano}.csv.zip`, zip_sha256: zipSha, linhas, totals }
}

async function identidadeCamara(id) {
  const { data } = await getJson(`${CAMARA_API}/deputados/${id}`)
  return { nome: data.dados?.nomeCivil ?? null, nascimento: data.dados?.dataNascimento ?? null }
}

async function identidadeSenado(codigo) {
  const { data } = await getJson(`${SENADO_LEGIS}/${codigo}.json`)
  const parlamentar = data.DetalheParlamentar?.Parlamentar
  return {
    nome: parlamentar?.IdentificacaoParlamentar?.NomeCompletoParlamentar ?? null,
    nascimento: parlamentar?.DadosBasicosParlamentar?.DataNascimento ?? null,
  }
}

function idsCandidatos(row, seedIds, slug) {
  const camara = new Set()
  const senado = new Set()
  if (seedIds.camara) camara.add(Number(seedIds.camara))
  if (seedIds.senado) senado.add(Number(seedIds.senado))
  const url = String(row.fonte ?? "").match(/\/deputados\/(\d+)\/despesas/)
  if (url) camara.add(Number(url[1]))
  const prov = row.detalhamento && !Array.isArray(row.detalhamento) ? row.detalhamento.proveniencia : null
  if (prov?.id_camara) camara.add(Number(prov.id_camara))
  const resolvido = IDS_RESOLVIDOS[slug]
  if (resolvido?.camara) camara.add(resolvido.camara)
  if (resolvido?.senado) senado.add(resolvido.senado)
  return { camara: [...camara], senado: [...senado] }
}

async function main() {
  const env = readEnv(arg("env"))
  const outPath = arg("out")
  const cacheDir = arg("cache")
  mkdirSync(cacheDir, { recursive: true })
  const checkedAt = new Date().toISOString()
  const anoCorrente = Number(checkedAt.slice(0, 4))

  const publicos = await restAll(env, "candidatos_publico?select=id,slug")
  const publicIds = new Set(publicos.map((c) => c.id))
  const candidatos = (await restAll(env, "candidatos?select=id,slug,nome_completo,data_nascimento")).filter((c) => publicIds.has(c.id))
  const bySlug = new Map(candidatos.map((c) => [c.slug, c]))
  const slugById = new Map(candidatos.map((c) => [c.id, c.slug]))
  const gastos = (await restAll(env, "gastos_parlamentares?select=id,candidato_id,ano,total_gasto,fonte,detalhamento,despublicado_em&order=id"))
    .filter((row) => slugById.has(row.candidato_id))
  const vivos = gastos.filter((row) => row.despublicado_em === null)
  const seed = JSON.parse(readFileSync(new URL("../../data/candidatos.json", import.meta.url), "utf8"))
  const seedBySlug = new Map(seed.map((c) => [c.slug, c.ids ?? {}]))
  const emRevisao = new Set(GASTOS_PARLAMENTARES_EM_REVISAO.map(([slug, ano]) => `${slug}:${ano}`))

  const linhas = vivos.map((row) => {
    const slug = slugById.get(row.candidato_id)
    return { row, slug, casa: casaDaFonte(row.fonte), ids: idsCandidatos(row, seedBySlug.get(slug) ?? {}, slug) }
  })

  // Identidade de todo id candidato, uma vez por id.
  const identidades = new Map()
  const pedidos = []
  for (const linha of linhas) {
    if (linha.casa === "fora_da_regra") continue
    for (const id of linha.ids[linha.casa]) pedidos.push(`${linha.casa}:${id}`)
  }
  const unicos = [...new Set(pedidos)]
  await pool(unicos, 4, async (key) => {
    const [casa, id] = key.split(":")
    identidades.set(key, casa === "camara" ? await identidadeCamara(id) : await identidadeSenado(id))
  })
  const verificacaoIds = []
  for (const linha of linhas) {
    if (linha.casa === "fora_da_regra") continue
    const ficha = bySlug.get(linha.slug)
    const verificados = linha.ids[linha.casa].filter((id) =>
      identidadeConfere(identidades.get(`${linha.casa}:${id}`), { nome: ficha.nome_completo, nascimento: ficha.data_nascimento }),
    )
    linha.idOficial = verificados.length === 1 ? verificados[0] : null
    linha.idsRecusados = linha.ids[linha.casa].filter((id) => !verificados.includes(id))
    if (verificados.length > 1) linha.idsConflitantes = verificados
  }
  for (const key of unicos) verificacaoIds.push({ chave: key, ...identidades.get(key) })

  // Senado: um GET por ano.
  const senadoAnos = [...new Set(linhas.filter((l) => l.casa === "senado" && l.idOficial != null).map((l) => l.row.ano))].sort()
  const senado = new Map()
  for (const ano of senadoAnos) {
    const url = `${SENADO_CEAPS}/${ano}`
    const response = await getJson(url)
    if (!Array.isArray(response.data) || response.data.some((row) => Number(row.ano) !== ano)) throw new Error(`Resposta Senado inválida: ${ano}`)
    senado.set(ano, { url, sha256: response.sha256, data: response.data })
  }

  // Câmara: API por deputado e CSV anual.
  const camaraLinhas = linhas.filter((l) => l.casa === "camara" && l.idOficial != null)
  const pares = [...new Set(camaraLinhas.map((l) => `${l.idOficial}:${l.row.ano}`))]
  const api = new Map()
  await pool(pares, 4, async (key) => {
    const [id, ano] = key.split(":").map(Number)
    api.set(key, await camaraApiTotal(id, ano))
  })
  const csvPorAno = new Map()
  for (const ano of [...new Set(camaraLinhas.map((l) => l.row.ano))].sort()) {
    const ids = new Set(camaraLinhas.filter((l) => l.row.ano === ano).map((l) => l.idOficial))
    csvPorAno.set(ano, await csvAnual(ano, cacheDir, ids))
  }

  const rows = []
  for (const linha of linhas) {
    const { row, slug, casa } = linha
    const dbCents = centavos(row.total_gasto)
    const base = { id: row.id, slug, ano: row.ano, casa, fonte: row.fonte, db_cents: dbCents }
    if (emRevisao.has(`${slug}:${row.ano}`)) {
      rows.push({ ...base, status: "ja_em_quarentena_no_app" })
      continue
    }
    if (casa === "fora_da_regra") {
      rows.push({ ...base, status: "fora_da_regra" })
      continue
    }
    let apiTotal = null
    let csvTotal = null
    let extra = {}
    if (linha.idOficial != null && casa === "senado") {
      const annual = senado.get(row.ano)
      const matching = annual.data.filter((item) => Number(item.codSenador) === linha.idOficial)
      apiTotal = { cents: matching.reduce((sum, item) => sum + centavos(item.valorReembolsado), 0), rows: matching.length }
      extra = { fonte_oficial_sha256: annual.sha256 }
    } else if (linha.idOficial != null) {
      const total = api.get(`${linha.idOficial}:${row.ano}`)
      apiTotal = { cents: total.cents, rows: total.rows }
      const csv = csvPorAno.get(row.ano)
      csvTotal = csv.totals.get(linha.idOficial) ?? { cents: 0, rows: 0 }
      extra = { api_por_legislatura: total.por_legislatura, api_sha256: total.source_sha256, csv_cents: csvTotal.cents, csv_rows: csvTotal.rows }
    }
    const status = classificarLinha({ dbCents, idOficial: linha.idOficial, api: apiTotal, csv: csvTotal })
    const out = {
      ...base,
      id_oficial: linha.idOficial,
      ...(linha.idsRecusados?.length ? { ids_recusados_por_identidade: linha.idsRecusados } : {}),
      ...(linha.idsConflitantes ? { ids_conflitantes: linha.idsConflitantes } : {}),
      api_cents: apiTotal?.cents ?? null,
      api_rows: apiTotal?.rows ?? null,
      ...extra,
      status,
      quarentena: statusVaiParaQuarentena(status),
    }
    if (status === "diverge" || status === "fonte_sem_linhas") {
      out.causa = causaDivergencia({ dbCents, ano: row.ano, anoCorrente, api: apiTotal, porLegislatura: extra.api_por_legislatura })
    }
    if (status === "sem_id_oficial") out.causa = linha.idsConflitantes ? "ids_conflitantes" : linha.ids[casa].length ? "identidade_nao_confere" : "sem_id_em_fonte_alguma"
    rows.push(out)
  }

  const quarentena = rows.filter((row) => row.quarentena)
  const contar = (list, key) => list.reduce((acc, row) => ((acc[row[key]] = (acc[row[key]] ?? 0) + 1), acc), {})
  const output = {
    schema_version: 1,
    checked_at: checkedAt,
    regra: "confere se |banco - oficial| <= max(1% do oficial, R$ 50) contra API (todas as legislaturas do ano) ou CSV anual da Câmara; senão quarentena",
    fontes: {
      senado: [...senado.entries()].map(([ano, value]) => ({ ano, url: value.url, sha256: value.sha256 })),
      camara_csv: [...csvPorAno.entries()].map(([ano, value]) => ({ ano, url: value.url, zip_sha256: value.zip_sha256, linhas: value.linhas })),
    },
    resumo: {
      linhas_vivas: vivos.length,
      por_status: contar(rows, "status"),
      quarentena: quarentena.length,
      quarentena_fichas: new Set(quarentena.map((row) => row.slug)).size,
      quarentena_por_causa: contar(quarentena, "causa"),
    },
    identidades: verificacaoIds,
    linhas: rows,
  }
  writeFileSync(outPath, `${JSON.stringify(output, null, 1)}\n`)
  console.log(JSON.stringify({ out: outPath, ...output.resumo }))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exitCode = 1
})

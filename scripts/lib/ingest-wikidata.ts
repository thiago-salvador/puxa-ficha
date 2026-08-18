import { supabase } from "./supabase"
import { loadCandidatosPublicos, resolveCandidatoId } from "./helpers-db"
import { fetchJSON, sleep } from "./helpers"
import { log, warn } from "./logger"
import { finalizarColeta, registrarErroColeta } from "./coleta-resultado"
import type { IngestResult } from "./types"

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql"
const HEADERS = {
  Accept: "application/sparql-results+json",
  "User-Agent": "PuxaFicha/1.0 (puxaficha.com.br)",
}

export interface SparqlBinding {
  item?: { value: string }
  instagram?: { value: string }
  twitter?: { value: string }
  facebook?: { value: string }
  site?: { value: string }
  foto?: { value: string }
  nascimento?: { value: string }
  profissao?: { value: string }
  idCamara?: { value: string }
  idSenado?: { value: string }
}

type InstagramSocial = Record<string, unknown> & {
  username?: string | null
  url?: string | null
  followers?: number | null
}

interface RedesSociais {
  instagram?: InstagramSocial | string
  twitter?: string
  facebook?: string
  site_oficial?: string
}

function temValorSocial(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === "string") return value.trim().length > 0
  if (typeof value === "object") return Object.values(value).some(temValorSocial)
  return true
}

const OPTIONAL_PROPS = `
  OPTIONAL { ?item wdt:P2003 ?instagram }
  OPTIONAL { ?item wdt:P2002 ?twitter }
  OPTIONAL { ?item wdt:P2013 ?facebook }
  OPTIONAL { ?item wdt:P856 ?site }
  OPTIONAL { ?item wdt:P18 ?foto }
  OPTIONAL { ?item wdt:P569 ?nascimento }
  OPTIONAL { ?item wdt:P106 ?profissao }
  OPTIONAL { ?item wdt:P6947 ?idCamara }
  OPTIONAL { ?item wdt:P7662 ?idSenado }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "pt,en" }
`

type JsonFetcher = typeof fetchJSON

export interface IngestWikidataDependencies {
  database: typeof supabase
  loadCandidates: typeof loadCandidatosPublicos
  resolveCandidateId: typeof resolveCandidatoId
  fetchJson: JsonFetcher
  wait: typeof sleep
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function textoSocialNaoVazio(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function usernameInstagramDaUrl(value: string): string | null {
  try {
    const url = new URL(value)
    const hostsValidos = new Set(["instagram.com", "www.instagram.com", "m.instagram.com"])
    if (!hostsValidos.has(url.hostname.toLowerCase())) return null
    if (url.protocol !== "https:" && url.protocol !== "http:") return null
    if (url.username || url.password || url.port) return null

    const segmentos = url.pathname.split("/").filter(Boolean)
    if (segmentos.length !== 1) return null

    const username = decodeURIComponent(segmentos[0])
    const caminhosReservados = new Set([
      "about", "accounts", "direct", "explore", "p", "privacy", "reel", "reels",
      "stories", "terms", "tv",
    ])
    if (caminhosReservados.has(username.toLowerCase())) return null
    return /^[A-Za-z0-9._]+$/.test(username) ? username : null
  } catch {
    return null
  }
}

function mergeInstagramPorPropriedade(
  atual: InstagramSocial | undefined,
  usernameWikidata: string,
): InstagramSocial {
  const usernameLocal = textoSocialNaoVazio(atual?.username) ? atual.username : null
  const urlLocal = textoSocialNaoVazio(atual?.url) ? atual.url : null

  if (usernameLocal) {
    return {
      ...atual,
      username: usernameLocal,
      url: urlLocal ?? `https://instagram.com/${usernameLocal}`,
    }
  }

  if (urlLocal) {
    const usernameDaUrl = usernameInstagramDaUrl(urlLocal)
    const identidadeCoincide = usernameDaUrl?.toLowerCase() === usernameWikidata.toLowerCase()
    return usernameDaUrl && identidadeCoincide
      ? { ...atual, username: usernameDaUrl, url: urlLocal }
      : { ...atual }
  }

  return {
    ...atual,
    username: usernameWikidata,
    url: `https://instagram.com/${usernameWikidata}`,
  }
}

function bindingValue(row: Record<string, unknown>, property: string, index: number): void {
  const value = row[property]
  if (value === undefined) return
  if (!isObject(value) || typeof value.value !== "string") {
    throw new Error(`Resposta SPARQL invalida: binding ${index}.${property} sem value string`)
  }
}

/** Aceita zero bindings como resposta valida, mas nunca mascara shape remoto quebrado. */
export function validarRespostaSparql(payload: unknown): SparqlBinding[] {
  if (!isObject(payload) || !isObject(payload.results) || !Array.isArray(payload.results.bindings)) {
    throw new Error("Resposta SPARQL invalida: results.bindings ausente ou nao e array")
  }

  return payload.results.bindings.map((raw, index) => {
    if (!isObject(raw)) {
      throw new Error(`Resposta SPARQL invalida: binding ${index} nao e objeto`)
    }
    for (const property of [
      "item", "instagram", "twitter", "facebook", "site", "foto",
      "nascimento", "profissao", "idCamara", "idSenado",
    ]) {
      bindingValue(raw, property, index)
    }
    if (!isObject(raw.item) || typeof raw.item.value !== "string") {
      throw new Error(`Resposta SPARQL invalida: binding ${index} sem item.value`)
    }
    if (!/\/Q[1-9]\d*$/.test(raw.item.value)) {
      throw new Error(`Resposta SPARQL invalida: binding ${index} sem QID valido`)
    }
    return raw as SparqlBinding
  })
}

export async function queryWikidataById(
  wikidataId: string,
  fetcher: JsonFetcher = fetchJSON,
): Promise<SparqlBinding | null> {
  if (!/^Q[1-9]\d*$/.test(wikidataId)) {
    throw new Error(`wikidata_id invalido: ${wikidataId}`)
  }
  const query = `
SELECT ?item ?itemLabel ?instagram ?twitter ?facebook ?site ?foto ?nascimento ?profissao ?idCamara ?idSenado WHERE {
  BIND(wd:${wikidataId} AS ?item)
  FILTER EXISTS { ?item ?existencePredicate ?existenceObject }
  ${OPTIONAL_PROPS}
}
LIMIT 1
`
  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}`
  const resp = await fetcher<unknown>(url, HEADERS, 3, 20000)
  const bindings = validarRespostaSparql(resp)
  return bindings.length > 0 ? bindings[0] : null
}

// RC2 fix: get QID from Wikipedia page (most reliable, avoids homonym contamination)
export async function getWikidataIdFromWikipedia(
  wikipediaTitle: string,
  fetcher: JsonFetcher = fetchJSON,
): Promise<string | null> {
  const params = new URLSearchParams({
    action: "query",
    titles: wikipediaTitle,
    prop: "pageprops",
    ppprop: "wikibase_item",
    format: "json",
    origin: "*",
  })

  const url = `https://pt.wikipedia.org/w/api.php?${params}`
  const json = await fetcher<unknown>(url, {}, 3, 10000)
  if (!isObject(json) || !isObject(json.query) || !isObject(json.query.pages)) {
    throw new Error("Resposta Wikipedia invalida: query.pages ausente")
  }
  const pages = Object.values(json.query.pages)
  if (pages.length !== 1 || !isObject(pages[0])) {
    throw new Error("Resposta Wikipedia invalida: esperado exatamente um registro de pagina")
  }
  const page = pages[0]
  if (page.missing !== undefined) return null
  if (page.pageprops === undefined) return null
  if (!isObject(page.pageprops)) {
    throw new Error("Resposta Wikipedia invalida: pageprops nao e objeto")
  }
  const qid = page.pageprops.wikibase_item
  if (qid === undefined) return null
  if (typeof qid !== "string" || !/^Q[1-9]\d*$/.test(qid)) {
    throw new Error("Resposta Wikipedia invalida: wikibase_item nao e um QID")
  }
  return qid
}

export async function ingestWikidata(
  overrides: Partial<IngestWikidataDependencies> = {},
): Promise<IngestResult[]> {
  const deps: IngestWikidataDependencies = {
    database: supabase,
    loadCandidates: loadCandidatosPublicos,
    resolveCandidateId: resolveCandidatoId,
    fetchJson: fetchJSON,
    wait: sleep,
    ...overrides,
  }
  const candidatos = await deps.loadCandidates()
  const results: IngestResult[] = []

  for (const cand of candidatos) {
    const result: IngestResult = {
      source: "wikidata",
      candidato: cand.slug,
      tables_updated: [],
      rows_upserted: 0,
      errors: [],
      duration_ms: 0,
    }
    const start = Date.now()

    log("wikidata", `Processando ${cand.slug} (busca: "${cand.nome_urna}")`)

    try {
      const candidatoId = await deps.resolveCandidateId(cand.slug)
      if (!candidatoId) {
        throw new Error(`Candidato ${cand.slug} nao encontrado no Supabase`)
      }

      // Busca dados atuais do candidato para merge (e wikidata_id se ja existir)
      const { data: dbCand, error: selectError } = await deps.database
        .from("candidatos")
        .select("redes_sociais, wikidata_id, foto_url, data_nascimento, profissao_declarada")
        .eq("id", candidatoId)
        .single()
      if (selectError) throw new Error(`Erro lendo candidato: ${selectError.message}`)
      if (!dbCand) throw new Error(`Candidato ${cand.slug} sem registro apos resolucao do ID`)

      // RC2 fix: priority order for QID resolution:
      // 1. Existing wikidata_id in DB (trusted)
      // 2. Wikipedia page QID via pageprops (reliable, avoids homonym)
      // 3. Skip (name search removed — too prone to homonym contamination)
      let binding: SparqlBinding | null = null
      let aplicavel = false
      let detalhe = "sem wikidata_id e sem wikipedia_title: nenhuma consulta remota foi executada"
      if (dbCand?.wikidata_id) {
        aplicavel = true
        log("wikidata", `  ${cand.slug}: query por ID (${dbCand.wikidata_id})`)
        binding = await queryWikidataById(dbCand.wikidata_id, deps.fetchJson)
        detalhe = binding ? "1 binding retornado pelo Wikidata" : "consulta SPARQL valida sem bindings"
      } else if (cand.wikipedia_title) {
        const qid = await getWikidataIdFromWikipedia(cand.wikipedia_title, deps.fetchJson)
        if (qid) {
          aplicavel = true
          log("wikidata", `  ${cand.slug}: QID via Wikipedia: ${qid}`)
          binding = await queryWikidataById(qid, deps.fetchJson)
          detalhe = binding ? "1 binding retornado pelo Wikidata via QID da Wikipedia" : "consulta SPARQL valida sem bindings"
        } else {
          warn("wikidata", `  ${cand.slug}: Wikipedia page sem wikidata_id`)
          detalhe = "Wikipedia respondeu sem QID; nenhuma consulta SPARQL Wikidata foi executada"
        }
      } else {
        warn("wikidata", `  ${cand.slug}: sem wikidata_id e sem wikipedia_title, pulando`)
      }

      if (!binding) {
        warn("wikidata", `  ${cand.slug}: nao encontrado no Wikidata`)
      } else {
        const updates: Record<string, unknown> = {}

      // Wikidata ID
        const wikidataId = binding.item?.value.split("/").pop() ?? null
        if (wikidataId && !dbCand?.wikidata_id) {
          updates.wikidata_id = wikidataId
        }

      // Foto URL (so se nao tiver)
        if (binding.foto?.value && !dbCand?.foto_url) {
          updates.foto_url = binding.foto.value
        }

      // Data de nascimento (so se nao tiver)
        if (binding.nascimento?.value && !dbCand?.data_nascimento) {
        // Wikidata retorna ISO 8601: "+1970-01-01T00:00:00Z"
        const rawDate = binding.nascimento.value.replace(/^\+/, "").split("T")[0]
          updates.data_nascimento = rawDate
        }

      // Profissao declarada (so se nao tiver)
        if (binding.profissao?.value && !dbCand?.profissao_declarada) {
        // Wikidata retorna URL da entidade, nao o label. Guardamos o ID como referencia.
        const profissaoId = binding.profissao.value.split("/").pop() ?? null
          if (profissaoId) updates.profissao_declarada = profissaoId
        }

      // Redes sociais: merge preservando o que ja existe
        const redesAtual: RedesSociais = (dbCand?.redes_sociais as RedesSociais) ?? {}
        const instagram = binding.instagram?.value.trim() || null
        const twitter = binding.twitter?.value.trim() || null
        const facebook = binding.facebook?.value.trim() || null
        const site = binding.site?.value.trim() || null

        const redesUpdate: RedesSociais = { ...redesAtual }
        if (instagram) {
          const instagramAtual = redesAtual.instagram
          if (!textoSocialNaoVazio(instagramAtual)) {
            redesUpdate.instagram = mergeInstagramPorPropriedade(
              isObject(instagramAtual) ? instagramAtual : undefined,
              instagram,
            )
          }
        }
        if (twitter && !temValorSocial(redesAtual.twitter)) {
          redesUpdate.twitter = twitter
        }
        if (facebook && !temValorSocial(redesAtual.facebook)) {
          redesUpdate.facebook = facebook
        }
        if (site && !temValorSocial(redesAtual.site_oficial)) {
          redesUpdate.site_oficial = site
        }

      // So atualiza redes se mudou algo
        const redesMudou = JSON.stringify(redesAtual) !== JSON.stringify(redesUpdate)
        if (redesMudou) {
          updates.redes_sociais = redesUpdate
        }

        if (Object.keys(updates).length > 0) {
          const { error: updateError } = await deps.database
          .from("candidatos")
          .update(updates)
          .eq("id", candidatoId)

          if (updateError) {
            throw new Error(`Erro atualizando candidato: ${updateError.message}`)
          } else {
          result.tables_updated.push("candidatos")
          result.rows_upserted++
            log("wikidata", `  ${cand.slug}: atualizado (wikidata_id: ${wikidataId}, campos: ${Object.keys(updates).join(", ")})`)
          }
        } else {
          log("wikidata", `  ${cand.slug}: sem alteracoes necessarias`)
        }
      }

      finalizarColeta(result, { aplicavel, volumeFonte: binding ? 1 : 0, detalhe })
    } catch (err) {
      registrarErroColeta(result, err)
      warn("wikidata", `  ${cand.slug}: ${err instanceof Error ? err.message : String(err)}`)
    }

    result.duration_ms = Date.now() - start
    results.push(result)

    // Rate limit: Wikidata pede 1s entre queries
    await deps.wait(1000)
  }

  return results
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ingestWikidata().then((r) => console.log(JSON.stringify(r, null, 2)))
}

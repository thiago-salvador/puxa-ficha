import { supabase } from "./supabase"
import { loadCandidatosPublicos } from "./helpers-db"
import { fetchJSON, sleep } from "./helpers"
import { log, warn, error } from "./logger"
import { finalizarColeta, registrarErroColeta } from "./coleta-resultado"
import type { IngestResult } from "./types"
import { pareceNomeDeInstituicao } from "../../src/lib/formacao-display"

const args = process.argv.slice(2)
const slugArgs = args
  .filter((arg, index) => args[index - 1] === "--slug")
  .flatMap((value) => value.split(","))
  .map((value) => value.trim())
  .filter(Boolean)
const filterSlugs = slugArgs.length > 0 ? new Set(slugArgs) : null

// Manual biodata fallback for candidates with incomplete Wikipedia coverage.
// Photo files must exist in public/candidates/{slug}.jpg when used.
// Data sourced from TSE, official pages, party sites, and solid news outlets.
const FALLBACK_DATA: Record<string, {
  foto_url?: string
  data_nascimento?: string
  naturalidade?: string
  formacao?: string
  formacao_instituicao?: string
  profissao_declarada?: string
}> = {
  "hertz-dias": {
    foto_url: "/candidates/hertz-dias.jpg",
    data_nascimento: "1970-10-20",
    naturalidade: "São Luís/MA",
    formacao: "Superior completo (História, UFMA; Mestrado em Educação)",
    profissao_declarada: "Professor",
  },
  "samara-martins": {
    foto_url: "/candidates/samara-martins.jpg",
    data_nascimento: "1987-08-31",
    naturalidade: "Belo Horizonte/MG",
    formacao: "Superior completo (Odontologia, UFRN)",
    profissao_declarada: "Dentista",
  },
  "alysson-bezerra": {
    foto_url: "/candidates/alysson-bezerra.jpg",
    data_nascimento: "1992-05-12",
    naturalidade: "Mossoró/RN",
  },
  "evandro-augusto": {
    foto_url: "/candidates/evandro-augusto.jpg",
    naturalidade: "Santa Cruz do Sul/RS",
    formacao: "Jornalismo; especialização em Educação e Mercados Ilícitos e Crime Organizado",
  },
  // review 2026-06-10: governadores publicados que estavam sem foto. Sem Wikipedia/
  // Wikidata/Câmara/Senado/TSE, fotos verificadas e auto-hospedadas em public/candidates/
  // (durável, sem dependência de CDN de notícia/partido que pode rotacionar).
  "ben-mendes": {
    // Foto editorial O Tempo (crédito @drbenonimendes); pré-candidato MISSÃO/MBL ao governo de MG.
    foto_url: "/candidates/ben-mendes.jpg",
  },
  "breno-barcelar": {
    // Perfil oficial do Partido Missão; pré-candidato a governador do ES.
    // OBS: o nome de urna real parece ser "Breno Barcelos" (não "Barcelar") — flag de dados no log 2026-06-10.
    foto_url: "/candidates/breno-barcelar.jpg",
  },
  "luiz-franca": {
    // Retrato editorial neutro G1/Globo; pré-candidato MISSÃO ao governo do PR.
    foto_url: "/candidates/luiz-franca.jpg",
  },
  "pedro-abib": {
    // Foto de lançamento (euideal, RO); pré-candidato MDB ao governo de Rondônia (primeira candidatura).
    foto_url: "/candidates/pedro-abib.jpg",
  },
  "lais-chaud": {
    // Crop centralizado da foto verificada do NSC Total (marcha UP/Liga de Mulheres);
    // pré-candidata UP ao governo de SC. Identidade confirmada pelo artigo da pré-candidatura
    // e aprovada pelo dono em 2026-06-10.
    foto_url: "/candidates/lais-chaud.jpg",
  },
  "lucien-rezende": {
    data_nascimento: "1964-02-08",
    naturalidade: "Glória de Dourados/MS",
    formacao: "Superior incompleto",
  },
  "marcelo-brigadeiro": {
    data_nascimento: "1982-05-04",
    naturalidade: "Rio de Janeiro/RJ",
    formacao: "Medicina Veterinária (UFF)",
  },
  "andre-kamai": {
    data_nascimento: "1981-10-31",
    naturalidade: "Rio Branco/AC",
    profissao_declarada: "Sociólogo",
  },
  "gabriel-azevedo": {
    naturalidade: "Belo Horizonte/MG",
    formacao: "Direito; Jornalismo e Publicidade",
  },
  "natasha-slhessarenko": {
    data_nascimento: "1967-11-23",
    naturalidade: "Cuiabá/MT",
    formacao: "Medicina (UFMT); residência em Pediatria e Patologia Clínica (USP); mestrado e doutorado (USP)",
  },
  "pazolini": {
    formacao: "Direito",
  },
  "eduardo-girao": {
    formacao: "Administração de Empresas",
  },
  "joao-henrique-catan": {
    data_nascimento: "1988-04-19",
    naturalidade: "Campo Grande/MS",
    formacao_instituicao: "Instituto Presbiteriano Mackenzie",
  },
  "orleans-brandao": {
    formacao: "Administração",
  },
}

const WIKI_API = "https://pt.wikipedia.org/w/api.php"
const WIKIDATA_SPARQL = "https://query.wikidata.org/sparql"

interface WikiStructuredFallback {
  dataNascimento: string | null
  naturalidade: string | null
  formacao: string | null
}

export type WikiPageLookup =
  | { status: "encontrado"; photoUrl: string | null; wikidataId: string | null }
  | { status: "vazio_confirmado"; photoUrl: null; wikidataId: null }
  | { status: "erro"; erro: string; photoUrl: null; wikidataId: null }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function mensagemErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro)
}

/** Test seam: separa verbete ausente de payload corrompido ou incompleto. */
export function interpretarWikiPagePayload(payload: unknown): WikiPageLookup {
  if (!isRecord(payload) || !isRecord(payload.query) || !isRecord(payload.query.pages)) {
    return {
      status: "erro",
      erro: "payload Wikipedia invalido: query.pages ausente",
      photoUrl: null,
      wikidataId: null,
    }
  }

  const pages = Object.values(payload.query.pages)
  if (pages.length !== 1 || !isRecord(pages[0])) {
    return {
      status: "erro",
      erro: "payload Wikipedia invalido: pagina unica ausente",
      photoUrl: null,
      wikidataId: null,
    }
  }

  const page = pages[0]
  if (Object.prototype.hasOwnProperty.call(page, "missing")) {
    return { status: "vazio_confirmado", photoUrl: null, wikidataId: null }
  }
  if (typeof page.title !== "string" || page.title.trim() === "") {
    return {
      status: "erro",
      erro: "payload Wikipedia invalido: title da pagina ausente",
      photoUrl: null,
      wikidataId: null,
    }
  }

  const thumbnail = isRecord(page.thumbnail) ? page.thumbnail : null
  const original = isRecord(page.original) ? page.original : null
  const pageprops = isRecord(page.pageprops) ? page.pageprops : null
  const photoCandidate = thumbnail?.source ?? original?.source
  const wikidataCandidate = pageprops?.wikibase_item
  if (photoCandidate !== undefined && typeof photoCandidate !== "string") {
    return {
      status: "erro",
      erro: "payload Wikipedia invalido: URL de imagem nao textual",
      photoUrl: null,
      wikidataId: null,
    }
  }
  if (wikidataCandidate !== undefined && typeof wikidataCandidate !== "string") {
    return {
      status: "erro",
      erro: "payload Wikipedia invalido: wikibase_item nao textual",
      photoUrl: null,
      wikidataId: null,
    }
  }

  return {
    status: "encontrado",
    photoUrl: photoCandidate ?? null,
    wikidataId: wikidataCandidate ?? null,
  }
}

export function finalizarResultadoWikipedia(
  resultado: IngestResult,
  status: "encontrado" | "vazio_confirmado" | "nao_aplicavel",
  detalhe: string,
): void {
  finalizarColeta(resultado, {
    aplicavel: status !== "nao_aplicavel",
    volumeFonte: status === "encontrado" ? 1 : 0,
    detalhe,
  })
}

// Fetch article summary/biography via Wikipedia REST API
async function fetchWikiSummary(title: string): Promise<string | null> {
  const url = `https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
  const data = await fetchJSON<unknown>(url, {
    "User-Agent": "PuxaFicha/1.0 (puxaficha.com.br)",
  })
  if (!isRecord(data)) throw new Error("payload de resumo Wikipedia invalido")
  if (data.extract === undefined || data.extract === null || data.extract === "") return null
  if (typeof data.extract !== "string") throw new Error("payload de resumo Wikipedia: extract nao textual")
  return data.extract // 1-2 paragraphs of article intro
}

// Fetch social media links from Wikipedia external links
async function fetchWikiSocialLinks(title: string): Promise<Record<string, string>> {
  const params = new URLSearchParams({
    action: "query",
    titles: title,
    prop: "extlinks",
    ellimit: "500",
    format: "json",
    origin: "*",
  })

  const json = await fetchJSON<unknown>(`${WIKI_API}?${params}`)
  if (!isRecord(json) || !isRecord(json.query) || !isRecord(json.query.pages)) {
    throw new Error("payload de links Wikipedia invalido: query.pages ausente")
  }
  const page = Object.values(json.query.pages)[0]
  if (!isRecord(page)) throw new Error("payload de links Wikipedia invalido: pagina ausente")
  const rawLinks = page.extlinks ?? []
  if (!Array.isArray(rawLinks)) throw new Error("payload de links Wikipedia invalido: extlinks nao e lista")
  const links = rawLinks.map((entry) => {
    if (!isRecord(entry)) throw new Error("payload de links Wikipedia invalido: item nao e objeto")
    const link = entry["*"] ?? entry.url
    if (typeof link !== "string") throw new Error("payload de links Wikipedia invalido: URL ausente")
    return link
  })

  const socials: Record<string, string> = {}
    // Classifica pelo hostname real do link, não por substring (que aceitaria
    // um domínio trapaceiro como evil.com/instagram.com/).
    const hostMatches = (host: string, domain: string) =>
      host === domain || host.endsWith(`.${domain}`)
  for (const link of links) {
      let host: string
      try {
        host = new URL(link).hostname.toLowerCase()
      } catch {
        continue
      }
      if (hostMatches(host, "instagram.com")) {
        const match = link.match(/instagram\.com\/([^/?]+)/)
        if (match) socials.instagram = match[1]
      } else if (hostMatches(host, "twitter.com") || hostMatches(host, "x.com")) {
        const match = link.match(/(?:twitter|x)\.com\/([^/?]+)/)
        if (match && match[1] !== "intent" && match[1] !== "share") socials.twitter = match[1]
      } else if (hostMatches(host, "facebook.com")) {
        const match = link.match(/facebook\.com\/([^/?]+)/)
        if (match && match[1] !== "sharer") socials.facebook = match[1]
      } else if (hostMatches(host, "youtube.com")) {
        const match = link.match(/youtube\.com\/@?([^/?]+)/)
        if (match) socials.youtube = match[1]
      } else if (hostMatches(host, "tiktok.com")) {
        const match = link.match(/tiktok\.com\/@?([^/?]+)/)
        if (match) socials.tiktok = match[1]
      }
  }
  return socials
}

// Fetch photo URL (800px) + Wikidata QID from Wikipedia in a single API call
export async function fetchWikiPage(
  title: string,
  fetchJSONImpl: (url: string) => Promise<unknown> = (url) => fetchJSON<unknown>(url),
): Promise<WikiPageLookup> {
  const params = new URLSearchParams({
    action: "query",
    titles: title,
    prop: "pageimages|pageprops",
    piprop: "thumbnail|original",
    pithumbsize: "800",
    ppprop: "wikibase_item",
    format: "json",
    origin: "*",
  })

  try {
    const json = await fetchJSONImpl(`${WIKI_API}?${params}`)
    return interpretarWikiPagePayload(json)
  } catch (err) {
    const detalhe = `consulta Wikipedia falhou: ${mensagemErro(err)}`
    warn("wikipedia", `  fetchWikiPage failed for ${title}: ${mensagemErro(err)}`)
    return { status: "erro", erro: detalhe, photoUrl: null, wikidataId: null }
  }
}

function stripWikiMarkup(value: string): string {
  let text = value
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "")
    .replace(/<ref[^/]*\/>/gi, "")
    .replace(/<br\s*\/?>/gi, "; ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\{\{small\|([^{}]+)\}\}/gi, "$1")
    .replace(/\{\{abbr\|([^|}]+)\|[^}]+\}\}/gi, "$1")
    .replace(/\{\{lang\|[^|]+\|([^}]+)\}\}/gi, "$1")
    .replace(/\{\{nowrap\|([^}]+)\}\}/gi, "$1")
    .replace(/\{\{ill\|([^|}]+)(?:\|[^}]*)?\}\}/gi, "$1")
    .replace(/\{\{hlist\|([^}]+)\}\}/gi, "$1")

  while (/\{\{[^{}]*\}\}/.test(text)) {
    text = text.replace(/\{\{[^{}]*\}\}/g, "")
  }

  // Remove tags HTML repetidamente até estabilizar: uma passada única deixaria
  // resíduo em tags aninhadas/malformadas (ex.: "<scr<b>ipt>").
  let cleaned = text.replace(/'''?/g, "")
  let previous: string
  do {
    previous = cleaned
    cleaned = cleaned.replace(/<\/?[^>]+>/g, "")
  } while (cleaned !== previous)

  return cleaned
    .replace(/\s+/g, " ")
    .replace(/\s*;\s*/g, "; ")
    .trim()
}

function extractWikitextField(content: string, fieldNames: string[]): string | null {
  for (const field of fieldNames) {
    const match = content.match(new RegExp(`\\|\\s*${field}\\s*=\\s*([^\\r\\n]*)`, "im"))
    const value = match?.[1]?.trim()
    if (value) {
      return value
    }
  }
  return null
}

function formatISODate(year: number, month: number, day: number): string | null {
  if (!year || !month || !day) return null
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function parseWikiBirthDate(rawValue: string | null): string | null {
  if (!rawValue) return null

  const dniMatch = rawValue.match(/\{\{(?:dni|Dtlink|dtlink)\|(\d{1,2})\|(\d{1,2})\|(\d{4})/i)
  if (dniMatch) {
    const [, day, month, year] = dniMatch
    return formatISODate(Number(year), Number(month), Number(day))
  }

  const brMatch = rawValue.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (brMatch) {
    const [, day, month, year] = brMatch
    return formatISODate(Number(year), Number(month), Number(day))
  }

  const isoMatch = rawValue.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) {
    return isoMatch[0]
  }

  return null
}

function isYearOnlyBirthDate(value: string | null): boolean {
  return Boolean(value && /^\d{4}-01-01$/.test(value))
}

function isInvalidStructuredText(value: unknown): boolean {
  if (typeof value !== "string") return false
  const normalized = value.trim()
  return normalized === "" || normalized.startsWith("|") || normalized === "#NULO#"
}

function pickBestBirthDate(primary: string | null, fallback: string | null): string | null {
  if (!primary) return fallback
  if (!fallback) return primary
  if (isYearOnlyBirthDate(primary) && !isYearOnlyBirthDate(fallback)) {
    return fallback
  }
  return primary
}

function extractFormacaoFromSummary(summary: string | null): string | null {
  if (!summary) return null
  const patterns = [
    /formad[oa] em ([^.]+?)(?:\.|,)/i,
    /graduad[oa] em ([^.]+?)(?:\.|,)/i,
    /bacharel em ([^.]+?)(?:\.|,)/i,
  ]

  for (const pattern of patterns) {
    const match = summary.match(pattern)
    if (match?.[1]) {
      return match[1].trim()
    }
  }

  return null
}

async function fetchWikiWikitextStructured(title: string, summary: string | null): Promise<WikiStructuredFallback> {
  const params = new URLSearchParams({
    action: "query",
    prop: "revisions",
    titles: title,
    rvslots: "main",
    rvprop: "content",
    format: "json",
    origin: "*",
  })

  const json = await fetchJSON<unknown>(`${WIKI_API}?${params}`)
  if (!isRecord(json) || !isRecord(json.query) || !isRecord(json.query.pages)) {
    throw new Error("payload de wikitext Wikipedia invalido: query.pages ausente")
  }
  const page = Object.values(json.query.pages)[0]
  if (!isRecord(page)) throw new Error("payload de wikitext Wikipedia invalido: pagina ausente")

  const revisions = page.revisions
  if (revisions === undefined) {
    return { dataNascimento: null, naturalidade: null, formacao: extractFormacaoFromSummary(summary) }
  }
  if (!Array.isArray(revisions)) throw new Error("payload de wikitext Wikipedia invalido: revisions nao e lista")
  const revision = revisions[0]
  if (!isRecord(revision) || !isRecord(revision.slots) || !isRecord(revision.slots.main)) {
    throw new Error("payload de wikitext Wikipedia invalido: slot main ausente")
  }
  const content = revision.slots.main["*"]
  if (content === undefined || content === "") {
    return { dataNascimento: null, naturalidade: null, formacao: extractFormacaoFromSummary(summary) }
  }
  if (typeof content !== "string") throw new Error("payload de wikitext Wikipedia invalido: conteudo nao textual")

  const birthRaw = extractWikitextField(content, ["data_nascimento"])
  const placeRaw = extractWikitextField(content, ["local_nascimento"])
  const educationRaw = extractWikitextField(content, ["alma_mater", "formação", "instituição"])

  return {
    dataNascimento: parseWikiBirthDate(birthRaw),
    naturalidade: placeRaw ? stripWikiMarkup(placeRaw) : null,
    formacao: educationRaw ? stripWikiMarkup(educationRaw) : extractFormacaoFromSummary(summary),
  }
}

function mergeFallbackUpdates(
  slug: string,
  existing: Record<string, unknown>,
  pendingUpdates: Record<string, unknown>
): Record<string, unknown> {
  const fb = FALLBACK_DATA[slug]
  if (!fb) return pendingUpdates

  const mergedState = { ...existing, ...pendingUpdates }
  if (fb.foto_url && !mergedState.foto_url) pendingUpdates.foto_url = fb.foto_url
  if (fb.data_nascimento && (!mergedState.data_nascimento || isYearOnlyBirthDate(String(mergedState.data_nascimento)))) {
    pendingUpdates.data_nascimento = fb.data_nascimento
  }
  if (fb.naturalidade && (!mergedState.naturalidade || isInvalidStructuredText(mergedState.naturalidade))) {
    pendingUpdates.naturalidade = fb.naturalidade
  }
  if (fb.formacao_instituicao && !mergedState.formacao_instituicao) {
    pendingUpdates.formacao_instituicao = fb.formacao_instituicao
  }
  if (fb.formacao && (!mergedState.formacao || isInvalidStructuredText(mergedState.formacao))) {
    if (pareceNomeDeInstituicao(fb.formacao)) {
      if (!mergedState.formacao_instituicao) pendingUpdates.formacao_instituicao = fb.formacao
    } else {
      pendingUpdates.formacao = fb.formacao
    }
  }
  if (fb.profissao_declarada && (!mergedState.profissao_declarada || isInvalidStructuredText(mergedState.profissao_declarada))) {
    pendingUpdates.profissao_declarada = fb.profissao_declarada
  }

  return pendingUpdates
}

// Fetch structured data from Wikidata via SPARQL
async function fetchWikidataStructured(qid: string): Promise<{
  dataNascimento: string | null
  naturalidade: string | null
  formacao: string | null
}> {
  const sparql = `
    SELECT ?birthDate ?birthPlaceLabel ?educationLabel WHERE {
      OPTIONAL { wd:${qid} wdt:P569 ?birthDate }
      OPTIONAL { wd:${qid} wdt:P19 ?birthPlace }
      OPTIONAL { wd:${qid} wdt:P69 ?education }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "pt,en" }
    }
    LIMIT 1
  `

  const params = new URLSearchParams({ query: sparql, format: "json" })
  const json = await fetchJSON<unknown>(`${WIKIDATA_SPARQL}?${params}`, {
    Accept: "application/sparql-results+json",
    "User-Agent": "PuxaFicha/1.0 (https://puxaficha.com.br; contact@puxaficha.com.br)",
  })
  if (!isRecord(json) || !isRecord(json.results) || !Array.isArray(json.results.bindings)) {
    throw new Error("payload Wikidata invalido: results.bindings ausente")
  }
  const row = json.results.bindings[0]
  if (row === undefined) return { dataNascimento: null, naturalidade: null, formacao: null }
  if (!isRecord(row)) throw new Error("payload Wikidata invalido: binding nao e objeto")

  const valueOf = (field: unknown, name: string): string | null => {
    if (field === undefined) return null
    if (!isRecord(field) || typeof field.value !== "string") {
      throw new Error(`payload Wikidata invalido: ${name}.value ausente`)
    }
    return field.value
  }
  const birthRaw = valueOf(row.birthDate, "birthDate")
  const dataNascimento = birthRaw ? birthRaw.split("T")[0] : null
  const naturalidade = valueOf(row.birthPlaceLabel, "birthPlaceLabel")
  const formacao = valueOf(row.educationLabel, "educationLabel")

  return { dataNascimento, naturalidade, formacao }
}

// Apply fallback data for candidates without Wikipedia pages
async function applyFallback(slug: string, candidatoId: string, existing: Record<string, unknown>): Promise<number> {
  const fb = FALLBACK_DATA[slug]
  if (!fb) return 0

  const updates: Record<string, unknown> = {}

  if (fb.foto_url && !existing.foto_url) updates.foto_url = fb.foto_url
  if (fb.data_nascimento && !existing.data_nascimento) updates.data_nascimento = fb.data_nascimento
  if (fb.naturalidade && !existing.naturalidade) updates.naturalidade = fb.naturalidade
  if (fb.formacao_instituicao && !existing.formacao_instituicao) {
    updates.formacao_instituicao = fb.formacao_instituicao
  }
  if (fb.formacao && !existing.formacao) {
    if (pareceNomeDeInstituicao(fb.formacao)) {
      if (!existing.formacao_instituicao) updates.formacao_instituicao = fb.formacao
    } else {
      updates.formacao = fb.formacao
    }
  }
  if (fb.profissao_declarada && !existing.profissao_declarada) updates.profissao_declarada = fb.profissao_declarada

  if (Object.keys(updates).length === 0) {
    log("wikipedia", `  ${slug}: fallback - nada para atualizar (campos ja preenchidos)`)
    return 0
  }

  updates.ultima_atualizacao = new Date().toISOString()
  const { error: err } = await supabase.from("candidatos").update(updates).eq("id", candidatoId)

  if (err) {
    error("wikipedia", `  ${slug}: fallback erro: ${err.message}`)
    throw new Error(`fallback local: ${err.message}`)
  }

  const fields = Object.keys(updates).filter((k) => k !== "ultima_atualizacao")
  log("wikipedia", `  ${slug}: fallback OK (${fields.join(", ")})`)
  return 1
}

export async function enrichWikipedia(): Promise<IngestResult[]> {
  const candidatos = (await loadCandidatosPublicos()).filter((cand) => !filterSlugs || filterSlugs.has(cand.slug))
  const results: IngestResult[] = []

  for (const cand of candidatos) {
    const start = Date.now()
    const result: IngestResult = {
      source: "wikipedia",
      candidato: cand.slug,
      tables_updated: [],
      rows_upserted: 0,
      errors: [],
      duration_ms: 0,
    }
    let desfechoBase: "encontrado" | "vazio_confirmado" | "nao_aplicavel" = "nao_aplicavel"
    let detalheBase = "candidato sem wikipedia_title; nenhuma consulta Wikipedia realizada"

    // Check current state of candidate in DB
    let existing: Record<string, unknown> | null = null
    try {
      const consultaDb = await supabase
        .from("candidatos")
        .select("id, foto_url, data_nascimento, naturalidade, formacao, formacao_instituicao, profissao_declarada, biografia, redes_sociais, wikidata_id")
        .eq("slug", cand.slug)
        .single()

      if (consultaDb.error || !consultaDb.data) {
        throw new Error(consultaDb.error?.message ?? `Candidato ${cand.slug} nao encontrado no Supabase`)
      }
      existing = consultaDb.data as Record<string, unknown>
    } catch (err) {
      registrarErroColeta(result, err, "consulta do candidato no banco")
      error("wikipedia", `  ${cand.slug}: nao encontrado no banco`)
      result.duration_ms = Date.now() - start
      results.push(result)
      continue
    }

    const wikiTitle = cand.wikipedia_title?.trim()

    // --- Path A: Wikipedia + Wikidata ---
    if (wikiTitle) {
      log("wikipedia", `Processando ${cand.slug} → ${wikiTitle}`)

      const pageLookup = await fetchWikiPage(wikiTitle)
      await sleep(300)

      const updates: Record<string, unknown> = {}
      let summary: string | null = null

      if (pageLookup.status === "erro") {
        registrarErroColeta(result, pageLookup.erro)
        detalheBase = pageLookup.erro
      } else if (pageLookup.status === "vazio_confirmado") {
        desfechoBase = "vazio_confirmado"
        detalheBase = `Wikipedia confirmou ausencia do verbete ${wikiTitle}`
      } else {
        desfechoBase = "encontrado"
        detalheBase = `verbete Wikipedia encontrado: ${wikiTitle}`
        const { photoUrl, wikidataId } = pageLookup

        // 1F fix: save wikidata_id from Wikipedia (most reliable source, prevents homonym contamination)
        // Guard: don't overwrite existing wikidata_id (may have been manually corrected)
        if (wikidataId && !existing.wikidata_id) updates.wikidata_id = wikidataId

        if (photoUrl) {
          updates.foto_url = photoUrl
          log("wikipedia", `  ${cand.slug}: foto OK`)
        } else {
          warn("wikipedia", `  ${cand.slug}: sem foto na Wikipedia`)
        }

        if (!existing.biografia || !existing.data_nascimento || !existing.naturalidade || !existing.formacao || !existing.formacao_instituicao) {
          try {
            summary = await fetchWikiSummary(wikiTitle)
          } catch (err) {
            registrarErroColeta(result, err, "resumo Wikipedia")
          }
          await sleep(300)
        }

        const needsStructured = !existing.data_nascimento || !existing.naturalidade || !existing.formacao || !existing.formacao_instituicao
        let wd: WikiStructuredFallback = { dataNascimento: null, naturalidade: null, formacao: null }
        let wikiStructured: WikiStructuredFallback = { dataNascimento: null, naturalidade: null, formacao: null }
        if (wikidataId && needsStructured) {
          log("wikipedia", `  ${cand.slug}: buscando Wikidata ${wikidataId}`)
          try {
            wd = await fetchWikidataStructured(wikidataId)
          } catch (err) {
            registrarErroColeta(result, err, "dados estruturados Wikidata")
          }
          await sleep(500)
        }

        if (needsStructured && (
          !wikidataId ||
          (!existing.data_nascimento && !wd.dataNascimento) ||
          (!existing.naturalidade && !wd.naturalidade) ||
          (!existing.formacao && !existing.formacao_instituicao && !wd.formacao)
        )) {
          try {
            wikiStructured = await fetchWikiWikitextStructured(wikiTitle, summary)
          } catch (err) {
            registrarErroColeta(result, err, "wikitext Wikipedia")
          }
          await sleep(300)
        }

        const dataNascimento = pickBestBirthDate(wd.dataNascimento, wikiStructured.dataNascimento)
        const naturalidade = wd.naturalidade ?? wikiStructured.naturalidade
        const educacao = wd.formacao ?? wikiStructured.formacao
        if (!existing.data_nascimento && dataNascimento) {
          updates.data_nascimento = dataNascimento
          log("wikipedia", `  ${cand.slug}: data_nascimento = ${dataNascimento}`)
        }
        if (!existing.naturalidade && naturalidade) {
          updates.naturalidade = naturalidade
          log("wikipedia", `  ${cand.slug}: naturalidade = ${naturalidade}`)
        }
        if (educacao) {
          if (pareceNomeDeInstituicao(educacao)) {
            if (!existing.formacao_instituicao) {
              updates.formacao_instituicao = educacao
              log("wikipedia", `  ${cand.slug}: formacao_instituicao = ${educacao}`)
            }
          } else if (!existing.formacao) {
            updates.formacao = educacao
            log("wikipedia", `  ${cand.slug}: formacao = ${educacao}`)
          }
        }

        if (!existing.biografia && summary) {
          updates.biografia = summary
          log("wikipedia", `  ${cand.slug}: biografia OK (${summary.length} chars)`)
        }

        const currentRedes = isRecord(existing.redes_sociais) ? existing.redes_sociais : {}
        const isEmpty = Object.keys(currentRedes).length === 0
        if (isEmpty || !currentRedes.instagram) {
          try {
            const wikiSocials = await fetchWikiSocialLinks(wikiTitle)
            if (Object.keys(wikiSocials).length > 0) {
              // Existing editorial data keeps priority over automatically found links.
              const merged: Record<string, unknown> = { ...wikiSocials }
              for (const [k, v] of Object.entries(currentRedes)) {
                if (v) merged[k] = v
              }
              updates.redes_sociais = merged
              log("wikipedia", `  ${cand.slug}: redes sociais (${Object.keys(wikiSocials).join(", ")})`)
            }
          } catch (err) {
            registrarErroColeta(result, err, "links externos Wikipedia")
          }
          await sleep(300)
        }
      }

      mergeFallbackUpdates(cand.slug, existing, updates)

      if (Object.keys(updates).length > 0) {
        updates.ultima_atualizacao = new Date().toISOString()
        try {
          const { error: updateErr } = await supabase
            .from("candidatos")
            .update(updates)
            .eq("id", existing.id)

          if (updateErr) throw new Error(updateErr.message)
          result.tables_updated.push("candidatos")
          result.rows_upserted++
        } catch (err) {
          registrarErroColeta(result, err, "atualizacao do candidato no banco")
          error("wikipedia", `  ${cand.slug}: erro ao atualizar: ${mensagemErro(err)}`)
        }
      } else {
        log("wikipedia", `  ${cand.slug}: nada para atualizar`)
      }

    // --- Path B: Fallback for candidates without Wikipedia ---
    } else if (FALLBACK_DATA[cand.slug]) {
      log("wikipedia", `${cand.slug}: sem Wikipedia, usando fallback`)
      detalheBase = "candidato sem wikipedia_title; fallback local aplicado sem consulta externa"
      try {
        const updated = await applyFallback(cand.slug, existing.id as string, existing)
        if (updated > 0) {
          result.tables_updated.push("candidatos")
          result.rows_upserted++
        }
      } catch (err) {
        registrarErroColeta(result, err)
      }

    } else {
      warn("wikipedia", `${cand.slug}: sem Wikipedia e sem fallback configurado`)
    }

    // Photo priority rule: never leave a candidate without a photo.
    // After all sources tried, check if candidate still has no foto_url.
    // Priority: 1) Wikipedia, 2) local fallback, 3) Câmara/Senado API, 4) Wikidata, 5) generated placeholder
    try {
      const { data: afterUpdate, error: afterUpdateError } = await supabase
        .from("candidatos")
        .select("foto_url")
        .eq("id", existing.id)
        .single()
      if (afterUpdateError) throw new Error(afterUpdateError.message)

      if (!afterUpdate?.foto_url) {
        warn("wikipedia", `  ${cand.slug}: sem foto em nenhuma fonte, usando fallback local de iniciais`)
      }
    } catch (err) {
      registrarErroColeta(result, err, "verificacao/escrita de foto no banco")
    }

    finalizarResultadoWikipedia(result, desfechoBase, detalheBase)
    result.duration_ms = Date.now() - start
    results.push(result)
    await sleep(500)
  }

  return results
}

if (import.meta.url === `file://${process.argv[1]}`) {
  enrichWikipedia().then((results) => {
    const updated = results.filter((r) => r.rows_upserted > 0).length
    const errors = results.reduce((s, r) => s + r.errors.length, 0)
    console.log(`\n=== Wikipedia Enrichment ===`)
    console.log(`Candidatos processados: ${results.length}`)
    console.log(`Atualizados: ${updated}`)
    console.log(`Erros: ${errors}`)
    if (errors > 0) {
      for (const r of results.filter((r) => r.errors.length > 0)) {
        console.log(`  ${r.candidato}: ${r.errors.join("; ")}`)
      }
    }
  })
}

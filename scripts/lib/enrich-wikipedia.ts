import { supabase } from "./supabase"
import { loadCandidatos, fetchJSON, sleep } from "./helpers"
import { log, warn, error } from "./logger"
import type { IngestResult } from "./types"

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
  profissao_declarada?: string
}> = {
  "hertz-dias": {
    foto_url: "/candidates/hertz-dias.jpg",
    data_nascimento: "1970-10-20",
    naturalidade: "Sao Luis/MA",
    formacao: "Superior completo (Historia, UFMA; Mestrado em Educacao)",
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
    naturalidade: "Mossoro/RN",
  },
  "evandro-augusto": {
    foto_url: "/candidates/evandro-augusto.jpg",
    naturalidade: "Santa Cruz do Sul/RS",
    formacao: "Jornalismo; especializacao em Educacao e Mercados Ilicitos e Crime Organizado",
  },
  "lucien-rezende": {
    data_nascimento: "1964-02-08",
    naturalidade: "Gloria de Dourados/MS",
    formacao: "Superior incompleto",
  },
  "marcelo-brigadeiro": {
    data_nascimento: "1982-05-04",
    naturalidade: "Rio de Janeiro/RJ",
    formacao: "Medicina Veterinaria (UFF)",
  },
  "andre-kamai": {
    data_nascimento: "1981-10-31",
    naturalidade: "Acre",
    formacao: "Superior completo",
  },
  "gabriel-azevedo": {
    naturalidade: "Belo Horizonte/MG",
    formacao: "Direito; Jornalismo e Publicidade",
  },
  "natasha-slhessarenko": {
    data_nascimento: "1967-11-23",
    naturalidade: "Cuiaba/MT",
    formacao: "Medicina (UFMT); residencia em Pediatria e Patologia Clinica (USP); mestrado e doutorado (USP)",
  },
  "pazolini": {
    formacao: "Direito",
  },
  "eduardo-girao": {
    formacao: "Administracao de Empresas",
  },
  "joao-henrique-catan": {
    data_nascimento: "1988-04-19",
    naturalidade: "Campo Grande/MS",
    formacao: "Instituto Presbiteriano Mackenzie",
  },
  "orleans-brandao": {
    formacao: "Administracao",
  },
}

const WIKI_API = "https://pt.wikipedia.org/w/api.php"
const WIKIDATA_SPARQL = "https://query.wikidata.org/sparql"

interface WikiPage {
  pageid?: number
  title: string
  thumbnail?: { source: string; width: number; height: number }
  original?: { source: string; width: number; height: number }
  pageimage?: string
  pageprops?: { wikibase_item?: string }
  missing?: string
}

interface WikiExtLinkEntry {
  "*": string
  url?: string
}

interface WikiExtLinksResponse {
  query?: {
    pages?: Record<string, { extlinks?: WikiExtLinkEntry[] }>
  }
}

interface WikiStructuredFallback {
  dataNascimento: string | null
  naturalidade: string | null
  formacao: string | null
}

// Fetch article summary/biography via Wikipedia REST API
async function fetchWikiSummary(title: string): Promise<string | null> {
  try {
    const url = `https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
    const res = await fetch(url, {
      headers: { "User-Agent": "PuxaFicha/1.0 (puxaficha.com.br)" },
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.extract || null // 1-2 paragraphs of article intro
  } catch {
    return null
  }
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

  try {
    const json = await fetchJSON<WikiExtLinksResponse>(`${WIKI_API}?${params}`)
    const pages = json.query?.pages ?? {}
    const page = Object.values(pages)[0]
    const links: string[] = (page?.extlinks ?? []).map((link) => link["*"] || link.url || "")

    const socials: Record<string, string> = {}
    for (const link of links) {
      if (link.includes("instagram.com/")) {
        const match = link.match(/instagram\.com\/([^/?]+)/)
        if (match) socials.instagram = match[1]
      } else if (link.includes("twitter.com/") || link.includes("x.com/")) {
        const match = link.match(/(?:twitter|x)\.com\/([^/?]+)/)
        if (match && match[1] !== "intent" && match[1] !== "share") socials.twitter = match[1]
      } else if (link.includes("facebook.com/")) {
        const match = link.match(/facebook\.com\/([^/?]+)/)
        if (match && match[1] !== "sharer") socials.facebook = match[1]
      } else if (link.includes("youtube.com/")) {
        const match = link.match(/youtube\.com\/@?([^/?]+)/)
        if (match) socials.youtube = match[1]
      } else if (link.includes("tiktok.com/")) {
        const match = link.match(/tiktok\.com\/@?([^/?]+)/)
        if (match) socials.tiktok = match[1]
      }
    }
    return socials
  } catch {
    return {}
  }
}

// Fetch photo URL (800px) + Wikidata QID from Wikipedia in a single API call
async function fetchWikiPage(title: string): Promise<{ photoUrl: string | null; wikidataId: string | null }> {
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
    const json = await fetchJSON<{ query: { pages: Record<string, WikiPage> } }>(`${WIKI_API}?${params}`)
    const page = Object.values(json.query?.pages ?? {})[0]

    if (!page || page.missing !== undefined) {
      return { photoUrl: null, wikidataId: null }
    }

    // Prefer 800px thumbnail (properly sized); fall back to original
    const photoUrl = page.thumbnail?.source ?? page.original?.source ?? null

    return {
      photoUrl,
      wikidataId: page.pageprops?.wikibase_item ?? null,
    }
  } catch {
    warn("wikipedia", `  fetchWikiPage failed for ${title}`)
    return { photoUrl: null, wikidataId: null }
  }
}

function stripWikiMarkup(value: string): string {
  let text = value
    .replace(/<ref[^>]*>.*?<\/ref>/gis, "")
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

  return text
    .replace(/'''?/g, "")
    .replace(/<\/?[^>]+>/g, "")
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

  try {
    const json = await fetchJSON<{
      query?: {
        pages?: Record<string, {
          revisions?: Array<{ slots?: { main?: { "*": string } } }>
        }>
      }
    }>(`${WIKI_API}?${params}`)

    const page = Object.values(json.query?.pages ?? {})[0]
    const content = page?.revisions?.[0]?.slots?.main?.["*"] ?? ""

    if (!content) {
      return { dataNascimento: null, naturalidade: null, formacao: extractFormacaoFromSummary(summary) }
    }

    const birthRaw = extractWikitextField(content, ["data_nascimento"])
    const placeRaw = extractWikitextField(content, ["local_nascimento"])
    const educationRaw = extractWikitextField(content, ["alma_mater", "formação", "instituição"])

    return {
      dataNascimento: parseWikiBirthDate(birthRaw),
      naturalidade: placeRaw ? stripWikiMarkup(placeRaw) : null,
      formacao: educationRaw ? stripWikiMarkup(educationRaw) : extractFormacaoFromSummary(summary),
    }
  } catch (err) {
    warn("wikipedia", `  Wikitext parse error for ${title}: ${err instanceof Error ? err.message : err}`)
    return { dataNascimento: null, naturalidade: null, formacao: extractFormacaoFromSummary(summary) }
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
  if (fb.formacao && (!mergedState.formacao || isInvalidStructuredText(mergedState.formacao))) {
    pendingUpdates.formacao = fb.formacao
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

  try {
    const params = new URLSearchParams({ query: sparql, format: "json" })
    const res = await fetch(`${WIKIDATA_SPARQL}?${params}`, {
      headers: {
        Accept: "application/sparql-results+json",
        "User-Agent": "PuxaFicha/1.0 (https://puxaficha.com.br; contact@puxaficha.com.br)",
      },
    })

    if (!res.ok) {
      warn("wikipedia", `  Wikidata SPARQL HTTP ${res.status}`)
      return { dataNascimento: null, naturalidade: null, formacao: null }
    }

    const json = (await res.json()) as {
      results: { bindings: Array<Record<string, { value: string }>> }
    }
    const row = json.results?.bindings?.[0]
    if (!row) return { dataNascimento: null, naturalidade: null, formacao: null }

    const birthRaw = row.birthDate?.value
    const dataNascimento = birthRaw ? birthRaw.split("T")[0] : null
    const naturalidade = row.birthPlaceLabel?.value ?? null
    const formacao = row.educationLabel?.value ?? null

    return { dataNascimento, naturalidade, formacao }
  } catch (err) {
    warn("wikipedia", `  Wikidata SPARQL error: ${err instanceof Error ? err.message : err}`)
    return { dataNascimento: null, naturalidade: null, formacao: null }
  }
}

// Apply fallback data for candidates without Wikipedia pages
async function applyFallback(slug: string, candidatoId: string, existing: Record<string, unknown>): Promise<number> {
  const fb = FALLBACK_DATA[slug]
  if (!fb) return 0

  const updates: Record<string, unknown> = {}

  if (fb.foto_url && !existing.foto_url) updates.foto_url = fb.foto_url
  if (fb.data_nascimento && !existing.data_nascimento) updates.data_nascimento = fb.data_nascimento
  if (fb.naturalidade && !existing.naturalidade) updates.naturalidade = fb.naturalidade
  if (fb.formacao && !existing.formacao) updates.formacao = fb.formacao
  if (fb.profissao_declarada && !existing.profissao_declarada) updates.profissao_declarada = fb.profissao_declarada

  if (Object.keys(updates).length === 0) {
    log("wikipedia", `  ${slug}: fallback - nada para atualizar (campos ja preenchidos)`)
    return 0
  }

  updates.ultima_atualizacao = new Date().toISOString()
  const { error: err } = await supabase.from("candidatos").update(updates).eq("id", candidatoId)

  if (err) {
    error("wikipedia", `  ${slug}: fallback erro: ${err.message}`)
    return 0
  }

  const fields = Object.keys(updates).filter((k) => k !== "ultima_atualizacao")
  log("wikipedia", `  ${slug}: fallback OK (${fields.join(", ")})`)
  return 1
}

export async function enrichWikipedia(): Promise<IngestResult[]> {
  const candidatos = loadCandidatos().filter((cand) => !filterSlugs || filterSlugs.has(cand.slug))
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

    // Check current state of candidate in DB
    const { data: existing, error: dbErr } = await supabase
      .from("candidatos")
      .select("id, foto_url, data_nascimento, naturalidade, formacao, profissao_declarada, biografia, redes_sociais")
      .eq("slug", cand.slug)
      .single()

    if (dbErr || !existing) {
      result.errors.push(`Candidato ${cand.slug} nao encontrado no Supabase`)
      error("wikipedia", `  ${cand.slug}: nao encontrado no banco`)
      results.push(result)
      continue
    }

    const wikiTitle = cand.wikipedia_title?.trim()

    // --- Path A: Wikipedia + Wikidata ---
    if (wikiTitle) {
      log("wikipedia", `Processando ${cand.slug} → ${wikiTitle}`)

      const { photoUrl, wikidataId } = await fetchWikiPage(wikiTitle)
      await sleep(300)

      const updates: Record<string, unknown> = {}
      let summary: string | null = null

      if (photoUrl) {
        updates.foto_url = photoUrl
        log("wikipedia", `  ${cand.slug}: foto OK`)
      } else {
        warn("wikipedia", `  ${cand.slug}: sem foto na Wikipedia`)
      }

      if (!existing.biografia || !existing.data_nascimento || !existing.naturalidade || !existing.formacao) {
        summary = await fetchWikiSummary(wikiTitle)
        await sleep(300)
      }

      // Fetch structured data from Wikidata (only if fields are missing)
      const needsStructured = !existing.data_nascimento || !existing.naturalidade || !existing.formacao
      if (wikidataId && needsStructured) {
        log("wikipedia", `  ${cand.slug}: buscando Wikidata ${wikidataId}`)
        const wd = await fetchWikidataStructured(wikidataId)
        await sleep(500)

        let wikiStructured: WikiStructuredFallback = { dataNascimento: null, naturalidade: null, formacao: null }
        if (
          (!existing.data_nascimento && !wd.dataNascimento) ||
          (!existing.naturalidade && !wd.naturalidade) ||
          (!existing.formacao && !wd.formacao)
        ) {
          wikiStructured = await fetchWikiWikitextStructured(wikiTitle, summary)
          await sleep(300)
        }

        const dataNascimento = pickBestBirthDate(wd.dataNascimento, wikiStructured.dataNascimento)
        const naturalidade = wd.naturalidade ?? wikiStructured.naturalidade
        const formacao = wd.formacao ?? wikiStructured.formacao

        if (!existing.data_nascimento && dataNascimento) {
          updates.data_nascimento = dataNascimento
          log("wikipedia", `  ${cand.slug}: data_nascimento = ${dataNascimento}`)
        }
        if (!existing.naturalidade && naturalidade) {
          updates.naturalidade = naturalidade
          log("wikipedia", `  ${cand.slug}: naturalidade = ${naturalidade}`)
        }
        if (!existing.formacao && formacao) {
          updates.formacao = formacao
          log("wikipedia", `  ${cand.slug}: formacao = ${formacao}`)
        }
      } else if (needsStructured) {
        const wikiStructured = await fetchWikiWikitextStructured(wikiTitle, summary)
        await sleep(300)

        if (!existing.data_nascimento && wikiStructured.dataNascimento) {
          updates.data_nascimento = wikiStructured.dataNascimento
          log("wikipedia", `  ${cand.slug}: data_nascimento = ${wikiStructured.dataNascimento}`)
        }
        if (!existing.naturalidade && wikiStructured.naturalidade) {
          updates.naturalidade = wikiStructured.naturalidade
          log("wikipedia", `  ${cand.slug}: naturalidade = ${wikiStructured.naturalidade}`)
        }
        if (!existing.formacao && wikiStructured.formacao) {
          updates.formacao = wikiStructured.formacao
          log("wikipedia", `  ${cand.slug}: formacao = ${wikiStructured.formacao}`)
        }
      }

      // Fetch article summary for biography (only if biografia is null)
      if (!existing.biografia) {
        if (summary) {
          updates.biografia = summary
          log("wikipedia", `  ${cand.slug}: biografia OK (${summary.length} chars)`)
        }
      }

      // Fetch social links from Wikipedia external links
      const currentRedes = (existing.redes_sociais as Record<string, unknown>) ?? {}
      const isEmpty = Object.keys(currentRedes).length === 0
      if (isEmpty || !currentRedes.instagram) {
        const wikiSocials = await fetchWikiSocialLinks(wikiTitle)
        if (Object.keys(wikiSocials).length > 0) {
          // Merge: don't overwrite existing social links
          // Handle nested objects (instagram can be { username, url, followers } from Wikidata)
          const merged: Record<string, unknown> = { ...wikiSocials }
          for (const [k, v] of Object.entries(currentRedes)) {
            if (v) merged[k] = v // Existing data takes priority
          }
          updates.redes_sociais = merged
          log("wikipedia", `  ${cand.slug}: redes sociais (${Object.keys(wikiSocials).join(", ")})`)
        }
        await sleep(300)
      }

      mergeFallbackUpdates(cand.slug, existing as Record<string, unknown>, updates)

      if (Object.keys(updates).length > 0) {
        updates.ultima_atualizacao = new Date().toISOString()
        const { error: updateErr } = await supabase
          .from("candidatos")
          .update(updates)
          .eq("id", existing.id)

        if (updateErr) {
          result.errors.push(updateErr.message)
          error("wikipedia", `  ${cand.slug}: erro ao atualizar: ${updateErr.message}`)
        } else {
          result.tables_updated.push("candidatos")
          result.rows_upserted++
        }
      } else {
        log("wikipedia", `  ${cand.slug}: nada para atualizar`)
      }

    // --- Path B: Fallback for candidates without Wikipedia ---
    } else if (FALLBACK_DATA[cand.slug]) {
      log("wikipedia", `${cand.slug}: sem Wikipedia, usando fallback`)
      const updated = await applyFallback(cand.slug, existing.id as string, existing as Record<string, unknown>)
      if (updated > 0) {
        result.tables_updated.push("candidatos")
        result.rows_upserted++
      }

    } else {
      warn("wikipedia", `${cand.slug}: sem Wikipedia e sem fallback configurado`)
    }

    // Photo priority rule: never leave a candidate without a photo.
    // After all sources tried, check if candidate still has no foto_url.
    // Priority: 1) Wikipedia, 2) local fallback, 3) Câmara/Senado API, 4) Wikidata, 5) generated placeholder
    const { data: afterUpdate } = await supabase
      .from("candidatos")
      .select("foto_url")
      .eq("id", existing.id)
      .single()

    if (!afterUpdate?.foto_url) {
      // Last resort: UI Avatars placeholder with candidate initials
      const initials = cand.nome_urna
        .split(/\s+/)
        .filter((w: string) => w.length > 2)
        .slice(0, 2)
        .map((w: string) => w[0])
        .join("")
        .toUpperCase()
      const placeholderUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&size=400&background=1e293b&color=fff&bold=true`
      await supabase
        .from("candidatos")
        .update({ foto_url: placeholderUrl, ultima_atualizacao: new Date().toISOString() })
        .eq("id", existing.id)
      warn("wikipedia", `  ${cand.slug}: sem foto em nenhuma fonte, usando placeholder (${initials})`)
    }

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

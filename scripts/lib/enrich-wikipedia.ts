import { supabase } from "./supabase"
import { loadCandidatos, fetchJSON, sleep } from "./helpers"
import { log, warn, error } from "./logger"
import type { IngestResult } from "./types"

// Slug → Portuguese Wikipedia article title (manually verified)
const WIKI_TITLES: Record<string, string> = {
  // Presidenciais
  "lula": "Luiz_Inácio_Lula_da_Silva",
  "flavio-bolsonaro": "Flávio_Bolsonaro",
  "tarcisio": "Tarcísio_de_Freitas",
  "romeu-zema": "Romeu_Zema",
  "ronaldo-caiado": "Ronaldo_Caiado",
  "ratinho-junior": "Ratinho_Júnior",
  "aldo-rebelo": "Aldo_Rebelo",
  "renan-santos": "Renan_Santos",
  "ciro-gomes": "Ciro_Gomes",
  "eduardo-leite": "Eduardo_Leite",
  "rui-costa-pimenta": "Rui_Costa_Pimenta",
  // SP Governadores
  "tarcisio-gov-sp": "Tarcísio_de_Freitas",
  "haddad-gov-sp": "Fernando_Haddad",
  "erika-hilton": "Érika_Hilton",
  "felicio-ramuth": "Felício_Ramuth",
  "ricardo-nunes": "Ricardo_Nunes_(político)",
  "geraldo-alckmin": "Geraldo_Alckmin",
  "gilberto-kassab": "Gilberto_Kassab",
  "andre-do-prado": "André_do_Prado",
  "marcio-franca": "Márcio_França",
  "guilherme-derrite": "Guilherme_Derrite",
  // PR Governadores
  "sergio-moro-gov-pr": "Sergio_Moro",
  "guto-silva": "Guto_Silva",
  "alexandre-curi": "Alexandre_Curi",
  "rafael-greca": "Rafael_Greca",
  "requiao-filho": "Requião_Filho",
  "paulo-martins-gov-pr": "Paulo_Martins_(político)",
  // SC Governadores
  "jorginho-mello": "Jorginho_Mello",
  "joao-rodrigues": "João_Rodrigues_(político_de_Santa_Catarina)",
  "decio-lima": "Décio_Lima",
  "marcos-vieira": "Marcos_Vieira_(político)",
  // RS Governadores
  "luciano-zucco": "Luciano_Zucco",
  "juliana-brizola": "Juliana_Brizola",
  "edegar-pretto": "Edegar_Pretto",
  "gabriel-souza": "Gabriel_Souza_(político)",
  "marcelo-maranata": "Marcelo_Maranata",
  // RJ Governadores
  "eduardo-paes": "Eduardo_Paes",
  "douglas-ruas": "Douglas_Ruas",
  "rodrigo-bacellar": "Rodrigo_Bacellar",
  "washington-reis": "Washington_Reis",
  "garotinho": "Anthony_Garotinho",
  "tarcisio-motta": "Tarcísio_Motta",
  // MG Governadores
  "cleitinho": "Cleitinho_Azevedo",
  "nikolas-ferreira": "Nikolas_Ferreira",
  "mateus-simoes": "Mateus_Simões",
  "rodrigo-pacheco": "Rodrigo_Pacheco_(político)",
  "gabriel-azevedo": "Gabriel_Azevedo_(político)",
  "maria-da-consolacao": "Maria_da_Consolação",
  // ES Governadores
  "pazolini": "Lorenzo_Pazolini",
  "ricardo-ferraco": "Ricardo_Ferraço",
  "paulo-hartung": "Paulo_Hartung",
  "sergio-vidigal": "Sérgio_Vidigal",
  "arnaldinho-borgo": "Arnaldinho_Borgo",
  "helder-salomao": "Hélder_Salomão",
  "da-vitoria": "Da_Vitória",
  // BA Governadores
  "jeronimo": "Jerônimo_Rodrigues",
  "acm-neto": "ACM_Neto",
  "joao-roma": "João_Roma",
  "jose-carlos-aleluia": "José_Carlos_Aleluia",
  // CE Governadores
  "elmano-de-freitas": "Elmano_de_Freitas",
  "ciro-gomes-gov-ce": "Ciro_Gomes",
  "roberto-claudio": "Roberto_Cláudio",
  "eduardo-girao": "Eduardo_Girão",
  "capitao-wagner": "Capitão_Wagner",
  // MA Governadores
  "eduardo-braide": "Eduardo_Braide",
  "felipe-camarao": "Felipe_Camarão_(político)",
  "lahesio-bonfim": "Lahesio_Bonfim",
  // PE Governadores
  "joao-campos": "João_Campos_(político)",
  "raquel-lyra": "Raquel_Lyra",
  "gilson-machado": "Gilson_Machado_Neto",
  "anderson-ferreira": "Anderson_Ferreira_(político)",
  // PB Governadores
  "cicero-lucena": "Cícero_Lucena",
  "efraim-filho": "Efraim_Filho",
  "pedro-cunha-lima": "Pedro_Cunha_Lima",
  // PI Governadores
  "rafael-fonteles": "Rafael_Fonteles",
  "silvio-mendes": "Sílvio_Mendes",
  "margarete-coelho": "Margarete_Coelho",
  // RN Governadores
  "alysson-bezerra": "Alysson_Bezerra",
  "alvaro-dias-rn": "Álvaro_Dias_(político_do_Rio_Grande_do_Norte)",
  // SE Governadores
  "fabio-mitidieri": "Fábio_Mitidieri",
  "valmir-de-francisquinho": "Valmir_de_Francisquinho",
  // AL Governadores
  "jhc": "João_Henrique_Caldas",
  "renan-filho": "Renan_Filho",
  // DF Governadores
  "celina-leao": "Celina_Leão",
  "leandro-grass": "Leandro_Grass",
  "paula-belmonte": "Paula_Belmonte",
  "ricardo-cappelli": "Ricardo_Cappelli",
  // GO Governadores
  "daniel-vilela": "Daniel_Vilela",
  "marconi-perillo": "Marconi_Perillo",
  "adriana-accorsi": "Adriana_Accorsi",
  "wilder-morais": "Wilder_Morais",
  "jose-eliton": "José_Eliton",
  // MS Governadores
  "eduardo-riedel": "Eduardo_Riedel",
  "fabio-trad": "Fábio_Trad",
  // MT Governadores
  "wellington-fagundes": "Wellington_Fagundes",
  "janaina-riva": "Janaína_Riva",
  "otaviano-pivetta": "Otaviano_Pivetta",
  // AC Governadores
  "alan-rick": "Alan_Rick",
  "mailza-assis": "Mailza_Assis",
  "tiao-bocalom": "Tião_Bocalom",
  // AM Governadores
  "omar-aziz": "Omar_Aziz",
  "eduardo-braga": "Eduardo_Braga",
  "david-almeida": "David_Almeida",
  // AP Governadores
  "dr-furlan": "Dr._Furlan",
  "clecio-luis": "Clécio_Luís",
  "joao-capiberibe": "João_Capiberibe",
  // PA Governadores
  "hana-ghassan": "Hana_Ghassan",
  "delegado-eder-mauro": "Delegado_Éder_Mauro",
  "beto-faro": "Beto_Faro",
  "simao-jatene": "Simão_Jatene",
  // RO Governadores
  "marcos-rogerio": "Marcos_Rogério",
  "hildon-chaves": "Hildon_Chaves",
  "confucio-moura": "Confúcio_Moura",
  // RR Governadores
  "teresa-surita": "Teresa_Surita",
  // TO Governadores
  "professora-dorinha": "Professora_Dorinha",
  "laurez-moreira": "Laurez_Moreira",
  "ataides-oliveira": "Ataídes_Oliveira",
  "vicentinho-junior": "Vicentinho_Júnior",
  "amelio-cayres": "Amério_Cayres",
  // Missing from previous mapping
  "orleans-brandao": "Carlos_Brandão_(político)",
  "anderson-ferreira": "Anderson_Ferreira_(político)",
  "ivan-moraes": "Ivan_Moraes_Filho",
  "joel-rodrigues": "Joel_Rodrigues_(político)",
  "cadu-xavier": "Cadu_Xavier",
  "thiago-de-joaldo": "Thiago_de_Joaldo",
  "expedito-netto": "Expedito_Netto",
  "dr-fernando-maximo": "Fernando_Máximo",
  "arthur-henrique": "Arthur_Henrique_(político)",
  "natasha-slhessarenko": "Natasha_Slhessarenko",
  "soldado-sampaio": "Soldado_Sampaio",
  "andre-kamai": "André_Kamai",
  "ronaldo-mansur": "Ronaldo_Mansur_(político)",
  "enilton-rodrigues": "Enilton_Rodrigues",
  "lucas-ribeiro": "Lucas_Ribeiro_(político_da_Paraíba)",
  "adailton-furia": "Adailton_Fúria",
  "silvio-mendes": "Sílvio_Mendes",
}

// Fallback data for candidates without Wikipedia pages.
// Photo files must exist in public/candidates/{slug}.jpg
// Data sourced from TSE, party sites, and news outlets.
const FALLBACK_DATA: Record<string, {
  foto_url: string
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
  },
  "evandro-augusto": {
    foto_url: "/candidates/evandro-augusto.jpg",
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
    const json = await fetchJSON<any>(`${WIKI_API}?${params}`)
    const pages = json.query?.pages ?? {}
    const page = Object.values(pages)[0] as any
    const links: string[] = (page?.extlinks ?? []).map((l: any) => l["*"] || l.url || "")

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
  const candidatos = loadCandidatos()
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

    const wikiTitle = WIKI_TITLES[cand.slug]

    // --- Path A: Wikipedia + Wikidata ---
    if (wikiTitle) {
      log("wikipedia", `Processando ${cand.slug} → ${wikiTitle}`)

      const { photoUrl, wikidataId } = await fetchWikiPage(wikiTitle)
      await sleep(300)

      const updates: Record<string, unknown> = {}

      if (photoUrl) {
        updates.foto_url = photoUrl
        log("wikipedia", `  ${cand.slug}: foto OK`)
      } else {
        warn("wikipedia", `  ${cand.slug}: sem foto na Wikipedia`)
      }

      // Fetch structured data from Wikidata (only if fields are missing)
      const needsStructured = !existing.data_nascimento || !existing.naturalidade || !existing.formacao
      if (wikidataId && needsStructured) {
        log("wikipedia", `  ${cand.slug}: buscando Wikidata ${wikidataId}`)
        const wd = await fetchWikidataStructured(wikidataId)
        await sleep(500)

        if (!existing.data_nascimento && wd.dataNascimento) {
          updates.data_nascimento = wd.dataNascimento
          log("wikipedia", `  ${cand.slug}: data_nascimento = ${wd.dataNascimento}`)
        }
        if (!existing.naturalidade && wd.naturalidade) {
          updates.naturalidade = wd.naturalidade
          log("wikipedia", `  ${cand.slug}: naturalidade = ${wd.naturalidade}`)
        }
        if (!existing.formacao && wd.formacao) {
          updates.formacao = wd.formacao
          log("wikipedia", `  ${cand.slug}: formacao = ${wd.formacao}`)
        }
      }

      // Fetch article summary for biography (only if biografia is null)
      if (!existing.biografia) {
        const summary = await fetchWikiSummary(wikiTitle)
        if (summary) {
          updates.biografia = summary
          log("wikipedia", `  ${cand.slug}: biografia OK (${summary.length} chars)`)
        }
        await sleep(300)
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

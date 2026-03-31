import { supabase } from "./supabase"
import { loadCandidatos, sleep } from "./helpers"
import { log, warn, error } from "./logger"

// Slug → Portuguese Wikipedia article title (reuse from enrich-wikipedia.ts)
// We import only the titles we need by re-reading the main file
const WIKI_API = "https://pt.wikipedia.org/w/api.php"

// Category patterns that indicate political positions
const CARGO_PATTERNS: Array<{
  pattern: RegExp
  cargo: string
  extractEstado?: boolean
}> = [
  { pattern: /^Deputados federais do Brasil por (.+)$/i, cargo: "Deputado Federal", extractEstado: true },
  { pattern: /^Senadores do Brasil por (.+)$/i, cargo: "Senador", extractEstado: true },
  { pattern: /^Governadores d[eoa] (.+)$/i, cargo: "Governador", extractEstado: true },
  { pattern: /^Vice-governadores d[eoa] (.+)$/i, cargo: "Vice-Governador", extractEstado: true },
  { pattern: /^Prefeitos d[eoa] (.+)$/i, cargo: "Prefeito", extractEstado: true },
  { pattern: /^Vice-prefeitos d[eoa] (.+)$/i, cargo: "Vice-Prefeito", extractEstado: true },
  { pattern: /^Deputados estaduais d[eoa] (.+)$/i, cargo: "Deputado Estadual", extractEstado: true },
  { pattern: /^Vereadores d[eoa] (.+)$/i, cargo: "Vereador", extractEstado: true },
  { pattern: /^Ministros d[eoa] (.+) do Brasil$/i, cargo: "Ministro" },
  { pattern: /^Presidentes da C[aâ]mara dos Deputados do Brasil$/i, cargo: "Presidente da Camara dos Deputados" },
  { pattern: /^Presidentes do Senado Federal do Brasil$/i, cargo: "Presidente do Senado Federal" },
  { pattern: /^Secretários estaduais/i, cargo: "Secretario Estadual" },
]

// State name normalization
const STATE_NAMES: Record<string, string> = {
  "acre": "AC", "alagoas": "AL", "amapá": "AP", "amazonas": "AM",
  "bahia": "BA", "ceará": "CE", "distrito federal": "DF", "espírito santo": "ES",
  "goiás": "GO", "maranhão": "MA", "mato grosso": "MT", "mato grosso do sul": "MS",
  "minas gerais": "MG", "pará": "PA", "paraíba": "PB", "paraná": "PR",
  "pernambuco": "PE", "piauí": "PI", "rio de janeiro": "RJ",
  "rio grande do norte": "RN", "rio grande do sul": "RS", "rondônia": "RO",
  "roraima": "RR", "santa catarina": "SC", "são paulo": "SP", "sergipe": "SE",
  "tocantins": "TO",
}

function normalizeEstado(name: string): string {
  const lower = name.toLowerCase().trim()
  return STATE_NAMES[lower] ?? name
}

async function fetchWikiCategories(title: string): Promise<string[]> {
  const params = new URLSearchParams({
    action: "query",
    titles: title,
    prop: "categories",
    cllimit: "100",
    format: "json",
    origin: "*",
  })

  try {
    const res = await fetch(`${WIKI_API}?${params}`, {
      headers: { "User-Agent": "PuxaFicha/1.0 (puxaficha.com.br)" },
    })
    if (!res.ok) return []
    const json = await res.json()
    const pages = json.query?.pages ?? {}
    const page = Object.values(pages)[0] as any
    return (page?.categories ?? [])
      .map((c: any) => c.title?.replace("Categoria:", "") ?? "")
      .filter(Boolean)
  } catch {
    return []
  }
}

function extractCargosFromCategories(categories: string[]): Array<{
  cargo: string
  estado: string
}> {
  const cargos: Array<{ cargo: string; estado: string }> = []

  for (const cat of categories) {
    for (const p of CARGO_PATTERNS) {
      const match = cat.match(p.pattern)
      if (match) {
        const estado = p.extractEstado && match[1]
          ? normalizeEstado(match[1])
          : ""
        cargos.push({ cargo: p.cargo, estado })
        break
      }
    }
  }

  return cargos
}

// Dynamically import WIKI_TITLES from enrich-wikipedia.ts
async function getWikiTitles(): Promise<Record<string, string>> {
  try {
    const mod = await import("./enrich-wikipedia")
    // The WIKI_TITLES is not exported, so we need to read the file
    // Instead, let's use a simpler approach: query DB for candidates and match with known titles
    return {}
  } catch {
    return {}
  }
}

export async function enrichWikiHistorico() {
  const candidatos = loadCandidatos()

  // Read WIKI_TITLES inline (same map as enrich-wikipedia.ts)
  // We dynamically read the file to get the title mappings
  const { readFileSync } = await import("fs")
  const { resolve } = await import("path")
  const wikiSource = readFileSync(resolve(process.cwd(), "scripts/lib/enrich-wikipedia.ts"), "utf-8")

  // Parse WIKI_TITLES from source
  const titleMap: Record<string, string> = {}
  const regex = /"([^"]+)":\s*"([^"]+)"/g
  let match
  // Only match entries within the WIKI_TITLES block
  const titleBlock = wikiSource.split("const WIKI_TITLES")[1]?.split("}")[0] ?? ""
  while ((match = regex.exec(titleBlock)) !== null) {
    titleMap[match[1]] = match[2]
  }

  log("wiki-historico", `Titulos Wikipedia carregados: ${Object.keys(titleMap).length}`)

  let totalInserted = 0
  let totalSkipped = 0
  let totalErrors = 0

  for (const cand of candidatos) {
    const wikiTitle = titleMap[cand.slug]
    if (!wikiTitle) continue

    // Get candidate ID from DB
    const { data: dbCand } = await supabase
      .from("candidatos")
      .select("id, partido_sigla")
      .eq("slug", cand.slug)
      .single()

    if (!dbCand) continue

    // Check existing historico
    const { data: existing } = await supabase
      .from("historico_politico")
      .select("cargo, estado")
      .eq("candidato_id", dbCand.id)

    const existingSet = new Set(
      (existing ?? []).map((h) => `${h.cargo}|${h.estado}`)
    )

    // Fetch Wikipedia categories
    const categories = await fetchWikiCategories(wikiTitle)
    await sleep(500)

    if (categories.length === 0) continue

    const cargos = extractCargosFromCategories(categories)
    if (cargos.length === 0) continue

    log("wiki-historico", `${cand.slug}: ${cargos.length} cargos encontrados via categorias`)

    for (const c of cargos) {
      const key = `${c.cargo}|${c.estado}`
      if (existingSet.has(key)) {
        totalSkipped++
        continue
      }

      const { error: insertErr } = await supabase
        .from("historico_politico")
        .insert({
          candidato_id: dbCand.id,
          cargo: c.cargo,
          estado: c.estado,
          partido: dbCand.partido_sigla,
          periodo_inicio: 0, // Unknown from categories alone
          eleito_por: "Wikipedia (categorias)",
          observacoes: "Cargo identificado via categorias da Wikipedia. Periodo nao determinado.",
        })

      if (insertErr) {
        // Likely duplicate, skip
        if (insertErr.message.includes("duplicate")) {
          totalSkipped++
        } else {
          error("wiki-historico", `  ${cand.slug}: erro inserindo ${c.cargo}: ${insertErr.message}`)
          totalErrors++
        }
      } else {
        log("wiki-historico", `  ${cand.slug}: + ${c.cargo} (${c.estado})`)
        totalInserted++
        existingSet.add(key)
      }
    }
  }

  console.log(`\n=== Wikipedia Historico ===`)
  console.log(`Cargos inseridos: ${totalInserted}`)
  console.log(`Duplicatas ignoradas: ${totalSkipped}`)
  console.log(`Erros: ${totalErrors}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  enrichWikiHistorico()
}

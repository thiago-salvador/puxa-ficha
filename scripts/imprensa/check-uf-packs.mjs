import { load } from "cheerio"

const baseUrl = (process.argv[2] || "http://127.0.0.1:3000").replace(/\/$/, "")
const ufs = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"]
const failures = []

for (const uf of ufs) {
  try {
    const pageResponse = await fetch(`${baseUrl}/imprensa/uf/${uf.toLowerCase()}`, { signal: AbortSignal.timeout(20_000) })
    if (!pageResponse.ok) throw new Error(`página HTTP ${pageResponse.status}`)
    const html = await pageResponse.text()
    const $ = load(html)
    const totalText = $("p").toArray().map((node) => $(node).text().trim()).find((text) => text.startsWith("Total no recorte:"))
    const renderedTotal = totalText && /^Total no recorte:\s*(\d+)/.exec(totalText)?.[1]
    if (renderedTotal === undefined) throw new Error("total do pacote não encontrado no HTML")
    const generatedAt = $("time[data-generated-at]").attr("data-generated-at")
    if (!generatedAt || Number.isNaN(Date.parse(generatedAt))) throw new Error("generatedAt ausente ou inválido no snapshot do pacote")
    if (!Number.isInteger(Number(renderedTotal))) throw new Error(`total do pacote inválido: ${renderedTotal}`)
    const candidates = $("[data-uf-candidate]").toArray()
    if (Number(renderedTotal) !== candidates.length) throw new Error(`total divergente no mesmo snapshot: cabeçalho=${renderedTotal}, fichas=${candidates.length}`)
    const slugs = new Set(candidates.map((node) => $(node).attr("data-uf-candidate")))
    if (slugs.size !== candidates.length || slugs.has(undefined)) throw new Error("fichas duplicadas ou sem slug no pacote")
    const counts = new Map()
    for (const node of candidates) {
      const cargo = $(node).attr("data-cargo")
      if (!cargo) throw new Error("ficha sem cargo no pacote")
      counts.set(cargo, (counts.get(cargo) ?? 0) + 1)
    }
    const displayedCounts = $("[data-uf-cargo-count]").toArray()
    if (displayedCounts.length !== counts.size) throw new Error("quantidade de cargos divergente no mesmo snapshot")
    for (const node of displayedCounts) {
      const cargo = $(node).attr("data-uf-cargo-count")
      const total = Number($(node).attr("data-total"))
      if (!cargo || !Number.isInteger(total) || counts.get(cargo) !== total) throw new Error(`contagem por cargo divergente no mesmo snapshot: ${cargo ?? "sem cargo"}`)
    }
  } catch (error) {
    failures.push(`${uf}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

if (failures.length) {
  console.error(`UF_PACKS_FAIL ${ufs.length - failures.length}/${ufs.length}`)
  for (const failure of failures) console.error(failure)
  process.exitCode = 1
} else {
  console.log("UF_PACKS_OK 27/27")
}

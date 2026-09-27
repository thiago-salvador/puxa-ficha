import { load } from "cheerio"

const baseUrl = (process.argv[2] || "http://127.0.0.1:3000").replace(/\/$/, "")
const ufs = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"]
const failures = []

for (const uf of ufs) {
  try {
    const pageResponse = await fetch(`${baseUrl}/imprensa/uf/${uf.toLowerCase()}`, { signal: AbortSignal.timeout(20_000) })
    const exportResponse = await fetch(`${baseUrl}/api/imprensa/export?format=json&uf=${uf}`, { signal: AbortSignal.timeout(20_000) })
    if (!pageResponse.ok) throw new Error(`página HTTP ${pageResponse.status}`)
    if (!exportResponse.ok) throw new Error(`export HTTP ${exportResponse.status}`)
    const html = await pageResponse.text()
    const payload = await exportResponse.json()
    if (!Array.isArray(payload.rows) || payload.filters?.uf !== uf) throw new Error("export inválido ou filtro UF divergente")
    const $ = load(html)
    const totalText = $("p").toArray().map((node) => $(node).text().trim()).find((text) => text.startsWith("Total no recorte:"))
    const renderedTotal = totalText && /^Total no recorte:\s*(\d+)/.exec(totalText)?.[1]
    if (renderedTotal === undefined) throw new Error("total do pacote não encontrado no HTML")
    if (Number(renderedTotal) !== payload.rows.length) throw new Error(`total divergente: pacote=${renderedTotal}, export=${payload.rows.length}`)
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

import "server-only"

interface CenarioRealTime {
  turn: 1 | 2
  label: string
  mode: "estimulado" | "espontaneo"
  results: Array<{ raw_label: string; value_percent: number }>
}

const CATEGORY = /^(Outros|Nulos?\/Brancos?|Brancos?\/Nulos?|Não sabe|Não sabe\/Não respondeu(?: \(NS\/NR\))?)$/i

/** Read complete published lists; a headline or valid-vote calculation is never a table. */
export function extrairPublicacaoRealTime(html: string, plain: (html: string) => string): { scenarios: CenarioRealTime[]; notes: string[] } | null {
  const safe = html.replace(/<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
  const scenarios: CenarioRealTime[] = []
  const notes: string[] = []
  let turn: 1 | 2 = 1
  let mode: CenarioRealTime["mode"] = "estimulado"
  let context = ""
  let heading = ""
  let runoffLevel = 0
  let runoffCount: number | null = null
  let footnoteRequired = false
  let inGovernorScope = true
  for (const block of safe.matchAll(/<(h[1-6]|p|ul)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const tag = block[1].toLowerCase()
    const text = plain(block[2])
    if (tag.startsWith("h")) {
      const level = Number(tag[1])
      if (/senado|senador|deputad|vereador|prefeit/i.test(text)) {
        if (scenarios.length) break
        inGovernorScope = false
        continue
      }
      if (/governador|governo/i.test(text)) inGovernorScope = true
      if (!inGovernorScope) continue
      if (turn === 1 && /espont[âa]ne[ao]/i.test(text)) { mode = "espontaneo"; context = text }
      if (turn === 1 && /estimulad[ao]/i.test(text)) { mode = "estimulado"; context = text }
      if (/^(?:Cenários? de )?(?:segundo|2[oº°]) turno(?: para governador(?:a)?(?: .+)?)?$/i.test(text)) {
        turn = 2; mode = "estimulado"; runoffLevel = level; heading = ""; continue
      }
      if (turn === 2 && /\s+x\s+/i.test(text) && level >= runoffLevel) { heading = text; continue }
      if (turn === 2 && level <= runoffLevel) break
      if (turn === 2) heading = text
      continue
    }
    if (tag === "p") {
      if (!inGovernorScope && /governador|governo/i.test(text) && !/senado|senador|deputad|vereador|prefeit/i.test(text)) inGovernorScope = true
      if (!inGovernorScope) continue
      if (/^\*/.test(text)) notes.push(text)
      if (turn === 1 && /espont[âa]ne[ao]/i.test(text) && !/estimulad[ao]/i.test(text)) mode = "espontaneo"
      if (turn === 1 && /estimulad[ao]/i.test(text) && !/espont[âa]ne[ao]/i.test(text)) mode = "estimulado"
      if (turn === 1 && /cenário|confira|veja o resultado|espont[âa]ne[ao]/i.test(text)) context = text
      if (turn === 2) {
        const count = text.match(/\b(\d+|um|dois|três|quatro|cinco|seis) cenários? de (?:segundo|2[oº°]) turno/i)?.[1]
        if (count) runoffCount = /^\d+$/.test(count) ? Number(count) : ["", "um", "dois", "três", "quatro", "cinco", "seis"].indexOf(count.toLowerCase())
        if (/^Cenário \d+:?$|\s+x\s+/i.test(text)) heading = text
      }
      continue
    }
    if (!inGovernorScope) continue
    const lines = [...block[2].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((match) => plain(match[1]))
    const numerical = lines.filter((line) => /^.+?\s*:\s*\d+(?:[,.]\d+)?\s*%\*?$/.test(line))
    const named = numerical.filter((line) => !CATEGORY.test(line.split(":")[0].trim()))
    if (named.length < 2) continue
    if (turn === 1 && mode !== "espontaneo" && named.filter((line) => /\([^()]+\)\s*:/.test(line)).length < 2) continue
    if (numerical.length !== lines.length) throw new Error("Real Time: lista contém linha sem percentual completo")
    const results = lines.map((line) => {
      const match = line.match(/^(.+?)\s*:\s*(\d+(?:[,.]\d+)?)\s*%(\*)?$/)!
      if (match[3]) footnoteRequired = true
      const value = Number(match[2].replace(",", "."))
      if (value < 0 || value > 100) throw new Error("Real Time: percentual inválido")
      return { raw_label: match[1].trim(), value_percent: value }
    })
    if (new Set(results.map((row) => row.raw_label)).size !== results.length || Math.abs(results.reduce((sum, row) => sum + row.value_percent, 0) - 100) > results.length * 0.5) throw new Error("Real Time: lista incompleta ou duplicada")
    if (!results.some((row) => /^(Nulos?\/brancos?|Brancos?\/nulos?)$/i.test(row.raw_label)) || !results.some((row) => /^Não sabe/i.test(row.raw_label))) throw new Error("Real Time: categorias de resposta ausentes")
    const names = results.filter((row) => !CATEGORY.test(row.raw_label)).map((row) => row.raw_label)
    if (turn === 2) {
      if (names.length !== 2) throw new Error("Real Time: segundo turno exige dois candidatos")
      if (/\s+x\s+/i.test(heading)) {
        const expected = heading.split(/\s+x\s+/i).map((name) => name.trim())
        const components = (value: string) => {
          const match = value.match(/^(.+?)\s+\(([^()]+)\)$/)
          return { name: match?.[1] ?? value, party: match?.[2]?.toLocaleUpperCase("pt-BR") }
        }
        if (expected.length !== 2 || !names.every((name) => expected.some((value) => {
          const left = components(name), right = components(value)
          return left.name === right.name && (!left.party || !right.party || left.party === right.party)
        }))) throw new Error("Real Time: nomes conflitantes no segundo turno")
      }
    }
    const label = turn === 2 ? (/\s+x\s+/i.test(heading) ? heading : `${heading ? `${heading} · ` : ""}${names.join(" x ")}`) : `${mode === "espontaneo" ? "Primeiro turno espontâneo" : "Primeiro turno estimulado"}${context ? `: ${context}` : ""}`
    if (scenarios.some((scenario) => scenario.turn === turn && scenario.mode === mode && scenario.results.map((row) => row.raw_label).sort().join("|") === results.map((row) => row.raw_label).sort().join("|"))) throw new Error("Real Time: listas de mesmo escopo ambíguas")
    scenarios.push({ turn, mode, label, results })
    heading = ""
  }
  if (!scenarios.length) return null
  if (footnoteRequired && !notes.length) throw new Error("Real Time: nota de agrupamento ausente")
  if (!scenarios.some((scenario) => scenario.turn === 1)) throw new Error("Real Time: primeiro turno ausente")
  const runoffs = scenarios.filter((scenario) => scenario.turn === 2).length
  if (runoffCount !== null && runoffCount !== runoffs) throw new Error("Real Time: quantidade de cenários divergente")
  if (!runoffs && /(?:segundo|2[oº°])\s+turno/i.test(plain(safe))) throw new Error("Real Time: segundo turno sem captura completa")
  return { scenarios, notes }
}

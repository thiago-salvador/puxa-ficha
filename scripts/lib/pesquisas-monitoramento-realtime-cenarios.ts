import "server-only"

export interface CenarioRealTime {
  turn: 1 | 2
  label: string
  mode: "estimulado" | "espontaneo"
  results: Array<{ raw_label: string; value_percent: number }>
}

export interface LeituraRealTime {
  scenarios: CenarioRealTime[]
  notes: string[]
  blockers: Array<{ code: "metadata_conflict" | "extraction_incomplete"; detail: string; scenario_index?: number }>
}

export interface OpcoesLeituraRealTime {
  /** Independent source manifest can require a grouping note even when a
   * reduced fixture has lost its asterisk. Never infer individual shares. */
  groupingNotesRequired?: number[]
}

const CATEGORY = /^(Outros|Nulos?\/Brancos?|Brancos?\/Nulos?|Não sabe|Não sabe\/Não respondeu(?: \(NS\s*\/\s*NR\))?|NS\s*\/\s*NR)$/i
const normalizeCategoryLabel = (value: string) => value.replace(/\s*\/\s*/g, "/").trim()

/** Read complete published lists; a headline or valid-vote calculation is never a table. */
export function extrairPublicacaoRealTime(html: string, plain: (html: string) => string, options: OpcoesLeituraRealTime = {}): { scenarios: CenarioRealTime[]; notes: string[] } | null {
  const result = inspecionarPublicacaoRealTime(html, plain, options)
  if (!result) return null
  if (result.blockers.length) throw new Error(result.blockers[0].detail)
  return { scenarios: result.scenarios, notes: result.notes }
}

/** Preserve complete lists and unresolved headings for review. This is not an
 * eligibility API: callers must retain every blocker and reconcile metadata.
 * The original strict entrypoint above continues to reject these conflicts.
 */
export function inspecionarPublicacaoRealTime(html: string, plain: (html: string) => string, options: OpcoesLeituraRealTime = {}): LeituraRealTime | null {
  const safe = html.replace(/<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
  const scenarios: CenarioRealTime[] = []
  const notes: string[] = []
  const blockers: LeituraRealTime["blockers"] = []
  const runoffHeadings: Array<{ heading: string; names: string[]; index: number }> = []
  let turn: 1 | 2 = 1
  let mode: CenarioRealTime["mode"] = "estimulado"
  let context = ""
  let heading = ""
  let runoffLevel = 0
  let runoffCount: number | null = null
  const footnoteRequired = new Set(options.groupingNotesRequired ?? [])
  const scenarioNotes = new Map<number, string[]>()
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
      if (/^\*/.test(text)) {
        notes.push(text)
        const index = scenarios.length - 1
        scenarioNotes.set(index, [...(scenarioNotes.get(index) ?? []), text])
      }
      if (turn === 1 && /espont[âa]ne[ao]/i.test(text) && !/estimulad[ao]/i.test(text)) mode = "espontaneo"
      if (turn === 1 && /estimulad[ao]/i.test(text) && !/espont[âa]ne[ao]/i.test(text)) mode = "estimulado"
      if (turn === 1 && /cenário|confira|veja o resultado|espont[âa]ne[ao]/i.test(text)) context = text
      const count = text.match(/\b(\d+|um|dois|três|quatro|cinco|seis) cenários? de (?:segundo|2[oº°]) turno/i)?.[1]
      if (count) runoffCount = /^\d+$/.test(count) ? Number(count) : ["", "um", "dois", "três", "quatro", "cinco", "seis"].indexOf(count.toLowerCase())
      if (turn === 2) {
        if (/^Cenário \d+:?$|\s+x\s+/i.test(text)) heading = text
      }
      continue
    }
    if (!inGovernorScope) continue
    const lines = [...block[2].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((match) => plain(match[1]))
    const numerical = lines.filter((line) => /^.+?\s*:\s*\d+(?:[,.]\d+)?\s*%\*?$/.test(line))
    const named = numerical.filter((line) => !CATEGORY.test(normalizeCategoryLabel(line.split(":")[0])))
    if (named.length < 2) continue
    if (turn === 1 && mode !== "espontaneo" && named.filter((line) => /\([^()]+\)\s*:/.test(line)).length < 2) continue
    if (numerical.length !== lines.length) throw new Error("Real Time: lista contém linha sem percentual completo")
    const results = lines.map((line) => {
      const match = line.match(/^(.+?)\s*:\s*(\d+(?:[,.]\d+)?)\s*%(\*)?$/)!
      if (match[3]) footnoteRequired.add(scenarios.length)
      const value = Number(match[2].replace(",", "."))
      if (value < 0 || value > 100) throw new Error("Real Time: percentual inválido")
      return { raw_label: match[1].trim(), value_percent: value }
    })
    if (new Set(results.map((row) => row.raw_label)).size !== results.length || Math.abs(results.reduce((sum, row) => sum + row.value_percent, 0) - 100) > results.length * 0.5) throw new Error("Real Time: lista incompleta ou duplicada")
    if (!results.some((row) => /^(Nulos?\/brancos?|Brancos?\/nulos?)$/i.test(normalizeCategoryLabel(row.raw_label))) || !results.some((row) => /^(?:Não sabe|NS\s*\/\s*NR)/i.test(normalizeCategoryLabel(row.raw_label)))) throw new Error("Real Time: categorias de resposta ausentes")
    const names = results.filter((row) => !CATEGORY.test(normalizeCategoryLabel(row.raw_label))).map((row) => row.raw_label)
    if (turn === 2) {
      if (names.length !== 2) throw new Error("Real Time: segundo turno exige dois candidatos")
      if (/\s+x\s+/i.test(heading)) {
        runoffHeadings.push({ heading, names, index: scenarios.length })
      }
    }
    const label = turn === 2 ? (/\s+x\s+/i.test(heading) ? heading : `${heading ? `${heading} · ` : ""}${names.join(" x ")}`) : `${mode === "espontaneo" ? "Primeiro turno espontâneo" : "Primeiro turno estimulado"}${context ? `: ${context}` : ""}`
    if (scenarios.some((scenario) => scenario.turn === turn && scenario.mode === mode && scenario.results.map((row) => row.raw_label).sort().join("|") === results.map((row) => row.raw_label).sort().join("|"))) throw new Error("Real Time: listas de mesmo escopo ambíguas")
    scenarios.push({ turn, mode, label, results })
    heading = ""
  }
  if (!scenarios.length) return null
  // Segundo passe: considerar listas posteriores e preservar o partido conhecido
  // mesmo quando a lista do duelo o omite. Não resolve identidade fora da fonte.
  const normalized = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim()
  const components = (value: string) => {
    const match = value.match(/^(.+?)\s+\(([^()]+)\)$/)
    return { name: normalized(match?.[1] ?? value), party: match?.[2]?.toLocaleUpperCase("pt-BR") }
  }
  const sourceNames = new Map<string, Set<string>>()
  for (const name of scenarios.flatMap((scenario) => scenario.results.map((row) => row.raw_label)).filter((name) => !CATEGORY.test(normalizeCategoryLabel(name)))) {
    const part = components(name)
    const parties = sourceNames.get(part.name) ?? new Set<string>()
    if (part.party) parties.add(part.party)
    sourceNames.set(part.name, parties)
  }
  for (const { heading, names, index } of runoffHeadings) {
    const expected = heading.split(/\s+x\s+/i).map(components)
    const headingMatches = expected.map(({ name: short }) => [...sourceNames.keys()].filter((full) => full === short || full.startsWith(`${short} `) || full.endsWith(` ${short}`)))
    if (expected.length !== 2 || headingMatches.some((matches) => matches.length !== 1) || new Set(headingMatches.flat()).size !== 2 ||
        !names.every((name) => expected.some((part, index) => {
          const actual = components(name)
          const parties = sourceNames.get(actual.name)!
          return actual.name === headingMatches[index]?.[0] && parties.size <= 1 &&
            (!part.party || parties.size === 0 || parties.has(part.party))
        }))) blockers.push({ code: "metadata_conflict", detail: `Real Time: nomes conflitantes no segundo turno: ${heading}; lista: ${names.join(" x ")}`, scenario_index: index })
  }
  for (const index of footnoteRequired) {
    const others = scenarios[index]?.results.find((row) => /^Outros$/i.test(row.raw_label))
    if (!(scenarioNotes.get(index) ?? []).some((note) => {
      const grouping = note.match(/(?:somad[oa]s?|somam|juntos|agrupad[oa]s?|outros)[^%]*?\b(\d+(?:[,.]\d+)?)\s*%/i)
      return grouping && others && Number(grouping[1].replace(",", ".")) === others.value_percent
    })) blockers.push({ code: "extraction_incomplete", detail: "Real Time: nota de agrupamento ausente ou conflitante", scenario_index: index })
  }
  if (!scenarios.some((scenario) => scenario.turn === 1)) blockers.push({ code: "extraction_incomplete", detail: "Real Time: primeiro turno ausente" })
  const runoffs = scenarios.filter((scenario) => scenario.turn === 2).length
  if (runoffCount !== null && runoffCount !== runoffs) blockers.push({ code: "extraction_incomplete", detail: "Real Time: quantidade de cenários divergente" })
  if (!runoffs && /(?:segundo|2[oº°])\s+turno/i.test(plain(safe))) blockers.push({ code: "extraction_incomplete", detail: "Real Time: segundo turno sem captura completa" })
  const spontaneousMentioned = /espont[âa]ne[ao]/i.test(plain(safe))
  const spontaneousCaptured = scenarios.some((scenario) => scenario.turn === 1 && scenario.mode === "espontaneo")
  if (spontaneousMentioned && !spontaneousCaptured) blockers.push({ code: "extraction_incomplete", detail: "Real Time: pesquisa espontânea mencionada sem lista completa" })
  return { scenarios, notes, blockers }
}

import "server-only"

export interface ValorEstaticoFolha {
  raw_value: string
  value_percent: number | null
}

/** Raw chart evidence only. This is deliberately not a publishable poll/scenario. */
export interface DadosEstaticosFolha {
  title: string
  intro: string
  source_text: string
  notes: string[]
  raw_tsv: string
  orientation: "dates_in_columns" | "dates_in_rows" | "undated"
  date_labels: string[]
  rows: Array<{ raw_label: string; values: ValorEstaticoFolha[] }>
  gaps: string[]
}

const DATE_LABEL = /^\d{1,2}\.(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)(?:\.\d{4})?$/i

function dateKey(label: string): string {
  const [dayRaw, monthRaw, yearRaw] = label.toLowerCase().split(".")
  const month = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"].indexOf(monthRaw)
  const day = Number(dayRaw)
  // Leap-year reference only checks day/month validity; it is never assigned to source data.
  const year = yearRaw ? Number(yearRaw) : 2000
  if (!DATE_LABEL.test(label) || year < 1000 || day < 1 || day > new Date(Date.UTC(year, month + 1, 0)).getUTCDate()) {
    throw new Error("Folha: data de tabela inválida")
  }
  return `${yearRaw ?? "?"}-${month + 1}-${day}`
}

function plain(text: string): string {
  return text.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim()
}

function fragments(html: string, className: string): string[] {
  const regex = new RegExp(`<([a-z][a-z0-9]*)\\b[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1>`, "gi")
  return [...html.matchAll(regex)].map((match) => plain(match[2]))
}

function value(raw: string): ValorEstaticoFolha {
  const normalized = raw.trim()
  if (["", "-", "–", "—"].includes(normalized)) return { raw_value: raw, value_percent: null }
  if (!/^\d{1,3}(?:[.,]\d+)?%?$/.test(normalized)) throw new Error("Folha: célula percentual não suportada")
  const number = Number(normalized.replace(/%$/, "").replace(",", "."))
  if (number > 100) throw new Error("Folha: percentual fora do intervalo")
  return { raw_value: raw, value_percent: number }
}

/** Decode the one JSON string literal already delivered in the HTML. Never executes scripts. */
export function extrairDadosEstaticosFolha(html: string): DadosEstaticosFolha | null {
  const matches = [...html.matchAll(/^\s*data:\s*("(?:\\.|[^"\\])*")\s*,?\s*$/gm)]
  if (!matches.length) return null
  if (matches.length !== 1) throw new Error("Folha: múltiplas tabelas estáticas ambíguas")
  const raw = JSON.parse(matches[0][1]) as string
  const table = raw.replace(/\r\n/g, "\n").split("\n").map((line) => line.split("\t"))
  if (table.at(-1)?.length === 1 && table.at(-1)?.[0] === "") table.pop()
  if (table.length < 2 || table[0].length < 2 || table.some((row) => row.length !== table[0].length)) {
    throw new Error("Folha: tabela vazia ou colunas inconsistentes")
  }
  const title = fragments(html, "chart-title")
  if (title.length !== 1) throw new Error("Folha: título de gráfico ausente ou ambíguo")
  const intro = fragments(html, "chart-intro").join("\n")
  const notes = [...fragments(html, "chart-notes"), ...fragments(html, "chart-note")]
  const sourceText = fragments(html, "source-block").join("\n")
  let orientation: DadosEstaticosFolha["orientation"]
  let dateLabels: string[]
  let rows: DadosEstaticosFolha["rows"]
  if (/^Data$/i.test(table[0][0])) {
    orientation = "dates_in_rows"
    dateLabels = table.slice(1).map((row) => row[0])
    if (!dateLabels.every((date) => DATE_LABEL.test(date))) throw new Error("Folha: data de linha não suportada")
    rows = table[0].slice(1).map((label, index) => ({ raw_label: label, values: table.slice(1).map((row) => value(row[index + 1])) }))
  } else if (table[0].slice(1).every((date) => DATE_LABEL.test(date))) {
    orientation = "dates_in_columns"
    dateLabels = table[0].slice(1)
    rows = table.slice(1).map((row) => ({ raw_label: row[0], values: row.slice(1).map(value) }))
  } else {
    if (table[0].length !== 2) throw new Error("Folha: coluna temporal não identificada")
    orientation = "undated"
    dateLabels = []
    const body = /^Nome$/i.test(table[0][0]) && /^Percentual$/i.test(table[0][1]) ? table.slice(1) : table
    rows = body.map((row) => ({ raw_label: row[0], values: [value(row[1])] }))
  }
  if (rows.length < 2 || rows.some((row) => !row.raw_label.trim()) || new Set(rows.map((row) => row.raw_label.trim())).size !== rows.length) {
    throw new Error("Folha: rótulos ausentes ou duplicados")
  }
  if (new Set(dateLabels.map(dateKey)).size !== dateLabels.length) throw new Error("Folha: datas duplicadas")
  const gaps: string[] = []
  if (orientation === "undated") gaps.push("date_not_in_table")
  if (dateLabels.some((label) => !/\.\d{4}$/.test(label))) gaps.push("year_not_in_table")
  if (rows.some((row) => row.values.some((cell) => cell.value_percent === null))) gaps.push("missing_published_cells")
  if ([title[0], ...rows.map((row) => row.raw_label)].some((text) => /\*/.test(text)) && !notes.length) gaps.push("footnote_marker_without_note")
  return { title: title[0], intro, source_text: sourceText, notes, raw_tsv: raw, orientation, date_labels: dateLabels, rows, gaps }
}

/** Exact literal selection; the caller must independently reconcile the date with source/registry. */
export function selecionarDataFolha(data: DadosEstaticosFolha, dateLabel: string): {
  raw_date: string
  results: Array<{ raw_label: string; raw_value: string; value_percent: number | null }>
} {
  const index = data.date_labels.indexOf(dateLabel)
  if (index < 0) throw new Error("Folha: data solicitada não consta da tabela; seleção implícita proibida")
  return { raw_date: dateLabel, results: data.rows.map((row) => ({ raw_label: row.raw_label, ...row.values[index] })) }
}

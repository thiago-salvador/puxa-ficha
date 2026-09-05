/** Divide statements externos, sem confundir strings, comentários e blocos DO. */
function statements(sql: string): string[] {
  const result: string[] = []
  let start = 0, i = 0
  while (i < sql.length) {
    if (sql.startsWith("--", i)) { const end = sql.indexOf("\n", i); i = end < 0 ? sql.length : end + 1; continue }
    if (sql.startsWith("/*", i)) {
      let depth = 1; i += 2
      while (i < sql.length && depth) {
        if (sql.startsWith("/*", i)) { depth++; i += 2 }
        else if (sql.startsWith("*/", i)) { depth--; i += 2 }
        else i++
      }
      if (depth) throw new Error("transaction: unterminated comment")
      continue
    }
    const quote = sql[i]
    if (quote === "'" || quote === '"') {
      // The driver pins standard_conforming_strings=on. Only E'...' uses
      // backslash escapes; ordinary strings and quoted identifiers do not.
      const escapeString = quote === "'" && /[eE]/.test(sql[i - 1] ?? "") && !/[\w$]/.test(sql[i - 2] ?? "")
      i++; let closed = false
      while (i < sql.length) {
        if (sql[i] === quote) { i++; if (sql[i] === quote) { i++; continue }; closed = true; break }
        if (escapeString && sql[i] === "\\") i++
        i++
      }
      if (!closed) throw new Error("transaction: unterminated quote")
      continue
    }
    const dollar = /^\$(?:[a-zA-Z_][\w]*)?\$/.exec(sql.slice(i))?.[0]
    if (dollar) {
      const end = sql.indexOf(dollar, i + dollar.length)
      if (end < 0) throw new Error("transaction: unterminated dollar quote")
      i = end + dollar.length; continue
    }
    if (sql[i] === "\\") throw new Error("transaction: psql meta-command forbidden")
    if (sql[i] === ";") { result.push(sql.slice(start, i + 1)); start = i + 1 }
    i++
  }
  const tail = sql.slice(start).replace(/--[^\n]*(?:\n|$)/g, "").replace(/\/\*[\s\S]*?\*\//g, "").trim()
  if (tail) throw new Error("transaction: SQL outside terminated statement")
  return result
}

export function transactionBody(sql: string): string {
  const parts = statements(sql)
  const bare = (part: string) => part.replace(/--[^\n]*(?:\n|$)/g, "").replace(/\/\*[\s\S]*?\*\//g, "").trim()
  if (parts.length < 3 || !/^BEGIN(?:\s+READ\s+ONLY)?\s*;$/i.test(bare(parts[0])) || !/^(?:COMMIT|ROLLBACK)\s*;$/i.test(bare(parts.at(-1)!))) throw new Error("transaction: exact outer BEGIN/end required")
  const body = parts.slice(1, -1)
  for (const part of body) {
    if (/^(?:BEGIN|COMMIT|ROLLBACK|ABORT|END|START\s+TRANSACTION|SAVEPOINT|RELEASE|PREPARE\s+TRANSACTION)\b/i.test(bare(part))) throw new Error("transaction: internal transaction control forbidden")
  }
  return body.join("")
}

#!/usr/bin/env node

import { execFileSync } from "node:child_process"
import { createRequire } from "node:module"
import { readFileSync } from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const ts = require("typescript")
const root = process.cwd()
const supportedModes = new Set(["all", "--check-example", "--check-docs"])

function trackedFiles() {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean)
}

function isProcessEnv(node, sourceFile) {
  return (
    ts.isPropertyAccessExpression(node) &&
    node.expression.getText(sourceFile) === "process" &&
    node.name.text === "env"
  )
}

function scanJavaScript(files) {
  const names = new Set()
  const unresolved = []
  const clientViolations = []

  for (const file of files.filter((entry) => /\.(?:[cm]?[jt]sx?)$/.test(entry))) {
    const source = readFileSync(path.join(root, file), "utf8")
    const sourceFile = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )
    const envAliases = new Set()
    const stringConstants = new Map()
    const isClientFile =
      sourceFile.statements.length > 0 &&
      ts.isExpressionStatement(sourceFile.statements[0]) &&
      ts.isStringLiteral(sourceFile.statements[0].expression) &&
      sourceFile.statements[0].expression.text === "use client"

    function collect(node) {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
        if (node.initializer && isProcessEnv(node.initializer, sourceFile)) {
          envAliases.add(node.name.text)
        }
        if (node.initializer && ts.isStringLiteralLike(node.initializer)) {
          stringConstants.set(node.name.text, node.initializer.text)
        }
      }
      if (
        ts.isVariableDeclaration(node) &&
        ts.isObjectBindingPattern(node.name) &&
        node.initializer?.getText(sourceFile) === "process"
      ) {
        for (const element of node.name.elements) {
          const property = element.propertyName ?? element.name
          if (
            ts.isIdentifier(property) &&
            property.text === "env" &&
            ts.isIdentifier(element.name)
          ) {
            envAliases.add(element.name.text)
          }
        }
      }
      if (
        ts.isParameter(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        isProcessEnv(node.initializer, sourceFile)
      ) {
        envAliases.add(node.name.text)
      }
      ts.forEachChild(node, collect)
    }
    collect(sourceFile)

    function isEnvObject(node) {
      return isProcessEnv(node, sourceFile) || (ts.isIdentifier(node) && envAliases.has(node.text))
    }

    function recordName(name, node) {
      names.add(name)
      if (isClientFile && name !== "NODE_ENV" && !name.startsWith("NEXT_PUBLIC_")) {
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
        clientViolations.push(`${file}:${line}:${name}`)
      }
    }

    function visit(node) {
      if (ts.isPropertyAccessExpression(node) && isEnvObject(node.expression)) {
        recordName(node.name.text, node)
      }
      if (ts.isElementAccessExpression(node) && isEnvObject(node.expression)) {
        const argument = node.argumentExpression
        if (ts.isStringLiteralLike(argument)) {
          recordName(argument.text, node)
        } else if (ts.isIdentifier(argument) && stringConstants.has(argument.text)) {
          recordName(stringConstants.get(argument.text), node)
        } else {
          const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
          unresolved.push(`${file}:${line}`)
        }
      }
      if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) && node.initializer) {
        if (isEnvObject(node.initializer)) {
          for (const element of node.name.elements) {
            const property = element.propertyName ?? element.name
            if (ts.isIdentifier(property)) recordName(property.text, element)
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
  }

  const allowedDynamicPrefixes = [
    "scripts/audit/auditar-classificacao-eleitoral.ts:",
    "scripts/audit/check-candidatura-resultados.ts:",
    "scripts/audit/congelar-sobreposicoes.ts:",
    "scripts/curate-contradictions-evidence.mjs:",
    "scripts/merge-queue/adapters.mjs:",
    "tests/",
  ]
  const unexpectedDynamic = unresolved.filter(
    (entry) => !allowedDynamicPrefixes.some((prefix) => entry.startsWith(prefix)),
  )
  if (unexpectedDynamic.length > 0) {
    throw new Error(`acessos dinâmicos a process.env sem classificação: ${unexpectedDynamic.join(", ")}`)
  }
  if (clientViolations.length > 0) {
    throw new Error(
      `variáveis server-only em arquivo use client: ${clientViolations.sort().join(", ")}`,
    )
  }

  return names
}

function scanPython(files) {
  const names = new Set()
  const patterns = [
    /(?:os\.)?getenv\(\s*["']([A-Z][A-Z0-9_]*)["']/g,
    /os\.environ(?:\.get\(\s*|\[\s*)["']([A-Z][A-Z0-9_]*)["']/g,
  ]
  for (const file of files.filter((entry) => entry.endsWith(".py"))) {
    const source = readFileSync(path.join(root, file), "utf8")
    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) names.add(match[1])
    }
  }
  return names
}

export function scanShellSource(source) {
  const names = new Set()
  let singleQuoted = false
  let doubleQuoted = false
  let commented = false
  let sanitized = ""
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    const previous = index === 0 ? "\n" : source[index - 1]
    if (character === "\n") {
      commented = false
      sanitized += character
      continue
    }
    if (commented) {
      sanitized += " "
      continue
    }
    if (singleQuoted) {
      if (character === "'") singleQuoted = false
      sanitized += " "
      continue
    }
    if (character === "'" && !doubleQuoted) {
      singleQuoted = true
      sanitized += " "
      continue
    }
    if (character === '"' && previous !== "\\") doubleQuoted = !doubleQuoted
    if (character === "#" && !doubleQuoted && /\s/.test(previous)) {
      commented = true
      sanitized += " "
      continue
    }
    sanitized += character
  }

  function commands() {
    const result = []
    let current = ""
    let quoted = false
    for (let index = 0; index < sanitized.length; index += 1) {
      const character = sanitized[index]
      const previous = index === 0 ? "" : sanitized[index - 1]
      if (character === '"' && previous !== "\\") quoted = !quoted
      const pair = sanitized.slice(index, index + 2)
      if (!quoted && (character === "\n" || character === ";" || pair === "&&" || pair === "||")) {
        if (current.trim()) result.push(current)
        current = ""
        if (pair === "&&" || pair === "||") index += 1
        continue
      }
      current += character
    }
    if (current.trim()) result.push(current)
    return result
  }

  function words(command) {
    const result = []
    let current = ""
    let quoted = false
    let substitutionDepth = 0
    for (let index = 0; index < command.length; index += 1) {
      const character = command[index]
      const previous = index === 0 ? "" : command[index - 1]
      if (character === '"' && previous !== "\\") quoted = !quoted
      if (!quoted && command.slice(index, index + 2) === "$(") substitutionDepth += 1
      if (!quoted && character === ")" && substitutionDepth > 0) substitutionDepth -= 1
      if (!quoted && substitutionDepth === 0 && /\s/.test(character)) {
        if (current) result.push(current)
        current = ""
        continue
      }
      current += character
    }
    if (current) result.push(current)
    return result
  }

  function persistentAssignments(command) {
    const tokens = words(command)
    if (tokens.length === 0) return []
    if (["export", "local", "readonly"].includes(tokens[0])) tokens.shift()
    if (tokens[0] === "declare") {
      tokens.shift()
      while (tokens[0]?.startsWith("-")) tokens.shift()
    }
    const assignments = tokens.filter((token) => /^[A-Z][A-Z0-9_]*\+?=/.test(token))
    return assignments.length === tokens.length
      ? assignments.map((token) => /^([A-Z][A-Z0-9_]*)/.exec(token)[1])
      : []
  }

  const locals = new Set()
  for (const command of commands()) {
    for (const match of command.matchAll(/(?<!\\)\$\{([A-Z][A-Z0-9_]*)(?=[:}?+\-])/g)) {
      if (!locals.has(match[1])) names.add(match[1])
    }
    for (const match of command.matchAll(/(?<![\\$])\$([A-Z][A-Z0-9_]*)\b/g)) {
      if (!locals.has(match[1])) names.add(match[1])
    }
    for (const match of command.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
      names.add(match[1])
    }
    for (const name of persistentAssignments(command)) locals.add(name)
  }

  return names
}

function scanShell(files) {
  const names = new Set()
  for (const file of files.filter((entry) => entry.endsWith(".sh"))) {
    const source = readFileSync(path.join(root, file), "utf8")
    for (const name of scanShellSource(source)) names.add(name)
  }
  return names
}

function workflowRunBlocks(source) {
  const lines = source.split(/\r?\n/)
  const blocks = []

  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(\s*)(?:-\s+)?run:\s*(.*)$/.exec(lines[index])
    if (!match) continue

    const runIndent = match[1].length
    const value = match[2].trim()
    if (value && !/^[>|][+-]?$/.test(value)) {
      blocks.push(value)
      continue
    }

    const blockLines = []
    let contentIndent = null
    for (index += 1; index < lines.length; index += 1) {
      const line = lines[index]
      const indent = /^\s*/.exec(line)[0].length
      if (line.trim() && indent <= runIndent) {
        index -= 1
        break
      }
      if (line.trim() && contentIndent === null) contentIndent = indent
      blockLines.push(line)
    }
    const strip = contentIndent ?? runIndent + 2
    blocks.push(blockLines.map((line) => line.slice(Math.min(strip, line.length))).join("\n"))
  }

  return blocks
}

export function scanWorkflowSource(source) {
  const names = new Set()
  for (const match of source.matchAll(/^\s{2,12}([A-Z][A-Z0-9_]*):\s*(?!$)/gm)) {
    names.add(match[1])
  }
  for (const match of source.matchAll(
    /\$\{\{\s*(?:secrets|vars|env)(?:\.([A-Z][A-Z0-9_]*)|\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\])/g,
  )) {
    names.add(match[1] ?? match[2])
  }
  for (const block of workflowRunBlocks(source)) {
    for (const name of scanShellSource(block)) names.add(name)
  }
  return names
}

function scanWorkflows(files) {
  const names = new Set()
  for (const file of files.filter((entry) => entry.startsWith(".github/") && /\.ya?ml$/.test(entry))) {
    const source = readFileSync(path.join(root, file), "utf8")
    for (const name of scanWorkflowSource(source)) names.add(name)
  }
  return names
}

function contractBlock() {
  const docs = readFileSync(path.join(root, "Settings/AUTOMATIONS_AND_ENVIRONMENTS.md"), "utf8")
  const match = docs.match(/<!-- env-contract:start -->([\s\S]*?)<!-- env-contract:end -->/)
  if (!match) throw new Error("bloco env-contract ausente na documentação")
  return match[1]
}

function recoveryRunbook() {
  return readFileSync(path.join(root, "docs/RUNBOOK-DR.md"), "utf8")
}

export function checkRunbookVercelInventory(documented, source = recoveryRunbook()) {
  const row = source.split(/\r?\n/).find((line) => line.startsWith("| Vercel, runtime |"))
  if (!row) throw new Error("inventário Vercel ausente em docs/RUNBOOK-DR.md")

  const keys = new Set([...row.matchAll(/`([A-Z][A-Z0-9_]*)`/g)].map((match) => match[1]))
  const required = ["PF_ALERTS_REPLY_TO_EMAIL"]
  const missing = required.filter((key) => !keys.has(key))
  const unknown = [...keys].filter((key) => !documented.has(key)).sort()
  if (missing.length || unknown.length) {
    throw new Error(
      [
        missing.length ? `runbook Vercel sem variável obrigatória: ${missing.join(", ")}` : "",
        unknown.length ? `runbook Vercel fora do contrato: ${unknown.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("; "),
    )
  }
}

function documentedKeys() {
  return new Set([...contractBlock().matchAll(/`([A-Z][A-Z0-9_]*)`/g)].map((match) => match[1]))
}

function exampleEntries() {
  const source = readFileSync(path.join(root, ".env.example"), "utf8")
  const entries = new Map()
  for (const [index, line] of source.split(/\r?\n/).entries()) {
    if (!line || line.trimStart().startsWith("#")) continue
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line)
    if (!match) throw new Error(`linha inválida em .env.example:${index + 1}`)
    if (entries.has(match[1])) throw new Error(`chave duplicada em .env.example: ${match[1]}`)
    entries.set(match[1], match[2])
  }
  return entries
}

function referenceKeys() {
  const files = trackedFiles()
  return new Set([
    ...scanJavaScript(files),
    ...scanPython(files),
    ...scanShell(files),
    ...scanWorkflows(files),
  ])
}

const safeNonEmptyExamples = new Map([
  ["SUPABASE_URL", "https://your-project.supabase.co"],
  ["NEXT_PUBLIC_SUPABASE_URL", "https://your-project.supabase.co"],
  ["NEXT_PUBLIC_SITE_URL", "http://localhost:3000"],
  ["NEXT_PUBLIC_X_HANDLE", "@puxaficha"],
  ["PF_BASE_URL", "http://127.0.0.1:3000"],
  ["PF_PUBLIC_SITE_URL", "https://puxaficha.com.br"],
  ["PF_PUBLIC_ORIGIN", "https://puxaficha.com.br"],
  ["NEXT_PUBLIC_ALERTS_EMAIL_ENABLED", "false"],
  ["SENTRY_ENABLE_PREVIEW", "0"],
  ["NEXT_PUBLIC_SENTRY_ENABLE_PREVIEW", "0"],
  ["SENTRY_TRACES_SAMPLE_RATE", "0.05"],
  ["NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE", "0.05"],
  ["PF_SUPABASE_FETCH_CONCURRENCY", "24"],
  ["PF_SUPABASE_FETCH_QUEUE_TIMEOUT_MS", "10000"],
  ["SUPABASE_ATTEMPT_TIMEOUT_MS", "15000"],
  ["PF_FORCE_PRODUCTION_SECURITY_HEADERS", "0"],
  ["PF_DRY_RUN", "1"],
  ["PF_TSE_INGEST_DRY_RUN", "1"],
  ["PF_TSE_INGEST_SKIP_PATRIMONIO", "0"],
  ["PF_KEEP_TSE_DOWNLOADS", "0"],
  ["PF_PLAYWRIGHT_EDITORIAL_WEBSERVER", "0"],
  ["PF_QUIZ_OG_BASE_URL", "http://127.0.0.1:3000"],
  ["PF_RUN_SEARCH_SMOKE", "0"],
])

function checkExample(references, documented) {
  const entries = exampleEntries()
  const unknown = [...entries.keys()].filter((key) => !references.has(key))
  const undocumented = [...entries.keys()].filter((key) => !documented.has(key))
  const unsafe = []
  for (const [key, value] of entries) {
    const expected = safeNonEmptyExamples.get(key) ?? ""
    if (value !== expected) unsafe.push(key)
  }
  if (unknown.length || undocumented.length || unsafe.length) {
    throw new Error(
      [
        unknown.length ? `sem uso real: ${unknown.join(", ")}` : "",
        undocumented.length ? `sem documentação: ${undocumented.join(", ")}` : "",
        unsafe.length ? `valor de exemplo não seguro ou inesperado: ${unsafe.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("; "),
    )
  }
  console.log(`PASS: exemplo seguro (${entries.size} chaves, nenhum segredo versionado)`)
}

export function checkDocs(references, documented, block = contractBlock()) {
  const missing = [...references].filter((key) => !documented.has(key)).sort()
  const stale = [...documented].filter((key) => !references.has(key)).sort()
  const requiredMarkers = [
    "Obrigatoriedade e fallback",
    "Responsável",
    "PF_ALERTS_REPLY_TO_EMAIL",
    "um único endereço simples",
    "sem fallback",
    "antes de qualquer chamada de rede",
  ]
  const missingMarkers = requiredMarkers.filter((marker) => !block.includes(marker))
  const staleMarkers = ["PF-24 ainda não está", "explicitamente pendente"]
  const presentStaleMarkers = staleMarkers.filter((marker) => block.includes(marker))
  if (missing.length || stale.length || missingMarkers.length || presentStaleMarkers.length) {
    throw new Error(
      [
        missing.length ? `referências sem documentação: ${missing.join(", ")}` : "",
        stale.length ? `documentação sem uso real: ${stale.join(", ")}` : "",
        missingMarkers.length ? `campos obrigatórios ausentes: ${missingMarkers.join(", ")}` : "",
        presentStaleMarkers.length
          ? `marcadores obsoletos ainda presentes: ${presentStaleMarkers.join(", ")}`
          : "",
      ]
        .filter(Boolean)
        .join("; "),
    )
  }
  checkRunbookVercelInventory(documented)
  console.log(`PASS: documentação alinhada (${documented.size} variáveis classificadas)`)
}

function main() {
  const mode = process.argv[2] ?? "all"
  if (!supportedModes.has(mode)) {
    console.error(`modo desconhecido: ${mode}`)
    process.exitCode = 2
    return
  }

  try {
    const references = referenceKeys()
    const documented = documentedKeys()
    if (mode === "--check-example") {
      checkExample(references, documented)
    } else if (mode === "--check-docs") {
      checkDocs(references, documented)
    } else {
      checkDocs(references, documented)
      checkExample(references, documented)
      console.log("PASS: 0 referências sem classificação")
    }
  } catch (error) {
    console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()

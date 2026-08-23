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

function lexicalScope(parent = null) {
  return { parent, bindings: new Map() }
}

function findBinding(scope, name) {
  for (let current = scope; current; current = current.parent) {
    if (current.bindings.has(name)) return current.bindings.get(name)
  }
  return undefined
}

function updateBinding(scope, name, binding) {
  for (let current = scope; current; current = current.parent) {
    if (current.bindings.has(name)) {
      current.bindings.set(name, binding)
      return
    }
  }
  scope.bindings.set(name, binding)
}

export function scanJavaScriptSource(source, file = "<fixture>.ts") {
  const names = new Set()
  const unresolved = []
  const clientViolations = []
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  let isClientFile = false
  for (const statement of sourceFile.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) break
    if (statement.expression.text === "use client") isClientFile = true
  }

  function staticString(node, scope) {
    if (ts.isStringLiteralLike(node)) return node.text
    if (ts.isIdentifier(node)) {
      const binding = findBinding(scope, node.text)
      if (binding?.kind === "string") return binding.value
    }
    return undefined
  }

  function isProcessObject(node, scope) {
    return ts.isIdentifier(node) && node.text === "process" && !findBinding(scope, "process")
  }

  function isEnvObject(node, scope) {
    if (ts.isIdentifier(node)) return findBinding(scope, node.text)?.kind === "env"
    if (ts.isPropertyAccessExpression(node)) {
      return isProcessObject(node.expression, scope) && node.name.text === "env"
    }
    if (ts.isElementAccessExpression(node) && isProcessObject(node.expression, scope)) {
      return staticString(node.argumentExpression, scope) === "env"
    }
    return false
  }

  function bindingFor(node, scope) {
    if (!node) return { kind: "other" }
    if (isEnvObject(node, scope)) return { kind: "env" }
    const value = staticString(node, scope)
    if (value !== undefined) return { kind: "string", value }
    return { kind: "other" }
  }

  function recordName(name, node) {
    names.add(name)
    if (isClientFile && name !== "NODE_ENV" && !name.startsWith("NEXT_PUBLIC_")) {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
      clientViolations.push(`${file}:${line}:${name}`)
    }
  }

  function bindPattern(name, initializer, scope) {
    if (ts.isIdentifier(name)) {
      scope.bindings.set(name.text, bindingFor(initializer, scope))
      return
    }
    if (!ts.isObjectBindingPattern(name)) return

    const fromProcess = initializer && isProcessObject(initializer, scope)
    const fromEnv = initializer && isEnvObject(initializer, scope)
    for (const element of name.elements) {
      if (!ts.isIdentifier(element.name)) continue
      const property = element.propertyName ?? element.name
      const propertyName = ts.isComputedPropertyName(property)
        ? staticString(property.expression, scope)
        : ts.isIdentifier(property) || ts.isStringLiteralLike(property)
          ? property.text
          : undefined
      if (fromProcess && propertyName === "env") {
        scope.bindings.set(element.name.text, { kind: "env" })
      } else {
        if (fromEnv && propertyName) recordName(propertyName, element)
        scope.bindings.set(element.name.text, { kind: "other" })
      }
    }
  }

  function visit(node, scope) {
    if (ts.isSourceFile(node)) {
      for (const statement of node.statements) visit(statement, scope)
      return
    }
    if (ts.isBlock(node)) {
      const blockScope = lexicalScope(scope)
      for (const statement of node.statements) visit(statement, blockScope)
      return
    }
    if (ts.isFunctionLike(node)) {
      if ("name" in node && node.name && ts.isIdentifier(node.name)) {
        scope.bindings.set(node.name.text, { kind: "other" })
      }
      const functionScope = lexicalScope(scope)
      for (const parameter of node.parameters) {
        if (parameter.initializer) visit(parameter.initializer, scope)
        bindPattern(parameter.name, parameter.initializer, functionScope)
      }
      if (node.body) visit(node.body, functionScope)
      return
    }
    if (ts.isVariableDeclaration(node)) {
      if (node.initializer) visit(node.initializer, scope)
      bindPattern(node.name, node.initializer, scope)
      return
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left)
    ) {
      visit(node.right, scope)
      updateBinding(scope, node.left.text, bindingFor(node.right, scope))
      return
    }
    if (ts.isPropertyAccessExpression(node) && isEnvObject(node.expression, scope)) {
      recordName(node.name.text, node)
    }
    if (ts.isElementAccessExpression(node)) {
      if (isEnvObject(node.expression, scope)) {
        const key = staticString(node.argumentExpression, scope)
        if (key) recordName(key, node)
        else {
          const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
          unresolved.push(`${file}:${line}:dynamic env key`)
        }
      } else if (isProcessObject(node.expression, scope)) {
        const key = staticString(node.argumentExpression, scope)
        if (key === undefined) {
          const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
          unresolved.push(`${file}:${line}:dynamic process key`)
        }
      }
    }
    ts.forEachChild(node, (child) => visit(child, scope))
  }

  visit(sourceFile, lexicalScope())
  return { names, unresolved, clientViolations }
}

function scanJavaScript(files) {
  const names = new Set()
  const unresolved = []
  const clientViolations = []
  for (const file of files.filter((entry) => /\.(?:[cm]?[jt]sx?)$/.test(entry))) {
    const source = readFileSync(path.join(root, file), "utf8")
    const result = scanJavaScriptSource(source, file)
    for (const name of result.names) names.add(name)
    unresolved.push(...result.unresolved)
    clientViolations.push(...result.clientViolations)
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

export function scanPythonSource(source) {
  const names = new Set()
  const patterns = [
    /(?:os\.)?getenv\(\s*["']([A-Z][A-Z0-9_]*)["']/g,
    /os\.environ(?:\.get\(\s*|\[\s*)["']([A-Z][A-Z0-9_]*)["']/g,
  ]
  for (const match of source.matchAll(/from\s+os\s+import\s+environ(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?/g)) {
    const alias = match[1] ?? "environ"
    patterns.push(
      new RegExp(`\\b${alias}(?:\\.get\\(\\s*|\\[\\s*)["']([A-Z][A-Z0-9_]*)["']`, "g"),
    )
  }
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) names.add(match[1])
  }
  return names
}

function scanPython(files) {
  const names = new Set()
  for (const file of files.filter((entry) => entry.endsWith(".py"))) {
    const source = readFileSync(path.join(root, file), "utf8")
    for (const name of scanPythonSource(source)) names.add(name)
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
      sanitized += character === "$" ? " " : character
      continue
    }
    if (character === "'" && !doubleQuoted) {
      singleQuoted = true
      sanitized += character
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
    let single = false
    let double = false
    for (let index = 0; index < sanitized.length; index += 1) {
      const character = sanitized[index]
      const previous = index === 0 ? "" : sanitized[index - 1]
      if (character === "'" && !double) single = !single
      if (character === '"' && !single && previous !== "\\") double = !double
      const pair = sanitized.slice(index, index + 2)
      if (!single && !double && (character === "\n" || character === ";" || pair === "&&" || pair === "||")) {
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
    let single = false
    let double = false
    let substitutionDepth = 0
    for (let index = 0; index < command.length; index += 1) {
      const character = command[index]
      const previous = index === 0 ? "" : command[index - 1]
      if (character === "'" && !double) single = !single
      if (character === '"' && !single && previous !== "\\") double = !double
      if (!single && command.slice(index, index + 2) === "$(") substitutionDepth += 1
      if (!single && character === ")" && substitutionDepth > 0) substitutionDepth -= 1
      if (!single && !double && substitutionDepth === 0 && /\s/.test(character)) {
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
    const indirect = [...command.matchAll(/(?<!\\)\$\{!([A-Z][A-Z0-9_]*)\}/g)]
    if (indirect.length > 0) {
      throw new Error(
        `expansão shell indireta sem resolução estática: ${indirect.map((match) => match[1]).join(", ")}`,
      )
    }
    for (const match of command.matchAll(/(?<!\\)\$\{([A-Z][A-Z0-9_]*)(?=[:}?+\-=])/g)) {
      if (!locals.has(match[1])) names.add(match[1])
    }
    for (const match of command.matchAll(/(?<![\\$])\$([A-Z][A-Z0-9_]*)\b/g)) {
      if (!locals.has(match[1])) names.add(match[1])
    }
    for (const match of command.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
      names.add(match[1])
    }
    for (const match of command.matchAll(/\bprintenv\s+(?:--\s+)?(?:(?:"([^"$]+)")|(?:'([^'$]+)')|([A-Z][A-Z0-9_]*))/g)) {
      const key = match[1] ?? match[2] ?? match[3]
      if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
        throw new Error(`printenv com chave dinâmica: ${key}`)
      }
      if (!locals.has(key)) names.add(key)
    }
    if (/\bprintenv(?:\s|$)/.test(command) && !/\bprintenv\s+(?:--\s+)?(?:"[^"$]+"|'[^'$]+'|[A-Z][A-Z0-9_]*)/.test(command)) {
      throw new Error(`printenv com chave dinâmica ou ausente: ${command.trim()}`)
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
      if (value.startsWith("'") && value.endsWith("'")) {
        blocks.push(value.slice(1, -1).replace(/''/g, "'"))
      } else if (value.startsWith('"') && value.endsWith('"')) {
        try {
          blocks.push(JSON.parse(value))
        } catch {
          throw new Error(`run inline YAML com aspas inválidas: ${value}`)
        }
      } else {
        blocks.push(value)
      }
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
    const normalized = blockLines.map((line) => line.slice(Math.min(strip, line.length)))
    blocks.push(value.startsWith(">") ? normalized.join(" ") : normalized.join("\n"))
  }

  return blocks
}

export function scanWorkflowSource(source) {
  const names = new Set()
  for (const match of source.matchAll(/^\s{2,12}([A-Z][A-Z0-9_]*):\s*(?!$)/gm)) {
    names.add(match[1])
  }
  for (const expressionMatch of source.matchAll(/\$\{\{([\s\S]*?)\}\}/g)) {
    const expression = expressionMatch[1]
    for (const match of expression.matchAll(/\b(?:secrets|vars|env)\.([A-Z][A-Z0-9_]*)/g)) {
      names.add(match[1])
    }
    for (const match of expression.matchAll(/\b(secrets|vars|env)\s*\[([^\]]+)\]/g)) {
      const keyMatch = /^\s*["']([A-Z][A-Z0-9_]*)["']\s*$/.exec(match[2])
      if (!keyMatch) {
        throw new Error(`acesso dinâmico de Actions sem resolução estática: ${match[0]}`)
      }
      names.add(keyMatch[1])
    }
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

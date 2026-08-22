#!/usr/bin/env node

import { execFileSync } from "node:child_process"
import { createRequire } from "node:module"
import { readFileSync } from "node:fs"
import path from "node:path"
import process from "node:process"

const require = createRequire(import.meta.url)
const ts = require("typescript")
const root = process.cwd()
const mode = process.argv[2] ?? "all"
const supportedModes = new Set(["all", "--check-example", "--check-docs"])

if (!supportedModes.has(mode)) {
  console.error(`modo desconhecido: ${mode}`)
  process.exit(2)
}

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

    function visit(node) {
      if (ts.isPropertyAccessExpression(node) && isEnvObject(node.expression)) {
        names.add(node.name.text)
      }
      if (ts.isElementAccessExpression(node) && isEnvObject(node.expression)) {
        const argument = node.argumentExpression
        if (ts.isStringLiteralLike(argument)) {
          names.add(argument.text)
        } else if (ts.isIdentifier(argument) && stringConstants.has(argument.text)) {
          names.add(stringConstants.get(argument.text))
        } else {
          const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
          unresolved.push(`${file}:${line}`)
        }
      }
      if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) && node.initializer) {
        if (isEnvObject(node.initializer)) {
          for (const element of node.name.elements) {
            const property = element.propertyName ?? element.name
            if (ts.isIdentifier(property)) names.add(property.text)
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

function scanShell(files) {
  const names = new Set()
  for (const file of files.filter((entry) => entry.endsWith(".sh"))) {
    const source = readFileSync(path.join(root, file), "utf8")
    const lines = source.split(/\r?\n/)
    const assigned = new Set()
    for (const line of lines) {
      for (const match of line.matchAll(/(?:^|[\s;])(?:export\s+)?([A-Z][A-Z0-9_]*)=/g)) {
        assigned.add(match[1])
      }
    }
    const withoutComments = lines.map((line) => line.replace(/#.*$/, "")).join("\n")
    for (const match of withoutComments.matchAll(/\$\{([A-Z][A-Z0-9_]*)(?=[:}?+\-])/g)) {
      if (!assigned.has(match[1])) names.add(match[1])
    }
    for (const match of withoutComments.matchAll(/(?<!\$)\$([A-Z][A-Z0-9_]*)\b/g)) {
      if (!assigned.has(match[1])) names.add(match[1])
    }
    for (const match of source.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
      names.add(match[1])
    }
  }
  return names
}

function scanWorkflows(files) {
  const names = new Set()
  for (const file of files.filter((entry) => entry.startsWith(".github/") && /\.ya?ml$/.test(entry))) {
    const source = readFileSync(path.join(root, file), "utf8")
    for (const match of source.matchAll(/^\s{2,12}([A-Z][A-Z0-9_]*):\s*(?!$)/gm)) {
      names.add(match[1])
    }
    for (const match of source.matchAll(/\$\{\{\s*(?:secrets|vars|env)\.([A-Z][A-Z0-9_]*)/g)) {
      names.add(match[1])
    }
  }
  return names
}

function contractBlock() {
  const docs = readFileSync(path.join(root, "Settings/AUTOMATIONS_AND_ENVIRONMENTS.md"), "utf8")
  const match = docs.match(/<!-- env-contract:start -->([\s\S]*?)<!-- env-contract:end -->/)
  if (!match) throw new Error("bloco env-contract ausente na documentação")
  return match[1]
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
  ["PF_REPLAY_POSTGRES_IMAGE", "postgres:17-alpine"],
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

function checkDocs(references, documented) {
  const missing = [...references].filter((key) => !documented.has(key)).sort()
  const stale = [...documented].filter((key) => !references.has(key)).sort()
  const block = contractBlock()
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
  console.log(`PASS: documentação alinhada (${documented.size} variáveis classificadas)`)
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
  process.exit(1)
}

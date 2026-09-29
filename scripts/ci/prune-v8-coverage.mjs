#!/usr/bin/env node

// Poda o dump bruto do NODE_V8_COVERAGE antes de subir como artefato do shard
// de cobertura. Cada arquivo de teste gera um JSON com a cobertura de tudo que
// o processo carregou (internos do Node, node_modules, tsx); medido em
// 29/09/2026, só 2,6% dos bytes são de src/ ou scripts/, que é tudo o que o
// c8.config.json inclui. Manter só essas entradas (e o source-map-cache delas)
// deixa o relatório final idêntico e o artefato ~40 vezes menor.
//
// O prefixo opcional renomeia os arquivos mantidos, para que os dumps de
// shards diferentes nunca colidam de nome quando o job final os junta num
// único temp-directory do c8.
//
// Uso: node scripts/ci/prune-v8-coverage.mjs <temp-directory> [prefixo]

import { readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

const [dir, prefix] = process.argv.slice(2)
if (!dir) {
  console.error("uso: prune-v8-coverage.mjs <temp-directory> [prefixo]")
  process.exit(2)
}

const root = pathToFileURL(process.cwd()).href
const prefixes = [`${root}/src/`, `${root}/scripts/`]
const keep = (url) => prefixes.some((start) => url.startsWith(start))

let before = 0
let after = 0
let files = 0
let dropped = 0

for (const name of readdirSync(dir)) {
  if (!name.endsWith(".json")) continue
  const file = path.join(dir, name)
  const raw = readFileSync(file, "utf8")
  before += raw.length
  const dump = JSON.parse(raw)
  const result = (dump.result ?? []).filter((entry) => keep(entry.url))
  if (result.length === 0) {
    rmSync(file)
    dropped += 1
    continue
  }
  const pruned = { ...dump, result }
  if (dump["source-map-cache"]) {
    pruned["source-map-cache"] = Object.fromEntries(
      Object.entries(dump["source-map-cache"]).filter(([url]) => keep(url))
    )
  }
  const out = JSON.stringify(pruned)
  after += out.length
  files += 1
  writeFileSync(file, out)
  if (prefix) renameSync(file, path.join(dir, `${prefix}-${name}`))
}

console.log(
  `prune-v8-coverage: ${files} arquivos mantidos, ${dropped} sem código do projeto; ` +
    `${(before / 1e6).toFixed(1)} MB -> ${(after / 1e6).toFixed(1)} MB`
)

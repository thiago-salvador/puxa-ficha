import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

// Superfícies que renderizam fora do layout do site e já perderam o design
// system (Inter e Anton, paleta neutra) sem que nenhum outro teste percebesse.

test("OG do comparador lado a lado registra Inter e Anton", () => {
  const source = readFileSync("src/lib/og.tsx", "utf8")
  const start = source.indexOf("export async function buildComparadorPairOg(")
  const end = source.indexOf("export async function buildEditorialOg(")
  assert.ok(start >= 0 && end > start)
  const block = source.slice(start, end)
  assert.match(block, /await getOgFonts\(\)/)
  assert.match(block, /fonts: \[/)
  assert.match(block, /fontFamily: FONT_HEADING/)
  assert.match(block, /fontFamily: FONT_SANS/)
})

test("impressão A4 da colinha usa as fontes do site, sem Arial", () => {
  const builder = readFileSync("src/components/ColinhaBuilder.tsx", "utf8")
  assert.doesNotMatch(builder, /Arial/)
  assert.match(builder, /\.colinha-print-sheet \{[^}]*font-family:var\(--font-inter\)/)
  assert.match(builder, /\.colinha-print-sheet h1 \{[^}]*font-family:var\(--font-anton\)/)
})

test("global-error aplica as variáveis de fonte do layout raiz", () => {
  const source = readFileSync("src/app/global-error.tsx", "utf8")
  assert.match(source, /from "\.\/fonts"/)
  assert.match(source, /<html lang="pt-BR" className=\{`\$\{inter\.variable\} \$\{anton\.variable\}`\}>/)
})

test("aviso offline fica na paleta neutra e usa Anton no título", () => {
  const worker = readFileSync("public/offline-worker.js", "utf8")
  assert.doesNotMatch(worker, /#baff00/i)
  assert.match(worker, /h1\{[^}]*font-family:Anton/)
})

/**
 * Escala tipográfica: `src/app/globals.css` define 8 tokens (11 a 36px). Em
 * 2026-09-01 a produção tinha 25 tamanhos de fonte distintos, 92 usos de
 * `text-[10px]` e um de 9px, quase todos em rótulos de dado (valores de
 * patrimônio, "Ver ficha", metadados de card). Abaixo de 11px o texto deixa
 * de ser legível no celular, e um tamanho arbitrário igual a um token é só
 * uma forma de fugir da escala.
 *
 * Regras que este teste trava, fora de `styleguide/`:
 *   1. nenhum `text-[Npx]` com N < 11 (a exceção listada é um glifo SVG de
 *      marcador da linha do tempo, que não é texto corrido);
 *   2. nenhum `text-[Npx]` cujo N seja exatamente um token da escala.
 *
 * Tamanhos arbitrários fora da escala (15, 18, 20, 24, 48, 72...) continuam
 * permitidos até a escala ganhar tokens para eles; o que se trava aqui é o
 * piso de legibilidade e a duplicidade com token existente.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { execSync } from "node:child_process"
import { test } from "node:test"

const TOKEN_PX = new Map([
  [11, "eyebrow"],
  [12, "caption"],
  [13, "body-sm"],
  [14, "body"],
  [16, "body-lg"],
  [22, "heading-sm"],
  [28, "heading"],
  [36, "heading-lg"],
])

const ALLOWLIST_SUB11: ReadonlyArray<{ file: string; snippet: string; motivo: string }> = [
  {
    file: "src/components/timeline/TimelineDesktop.tsx",
    snippet: 'className="pointer-events-none text-[6.5px] font-black uppercase"',
    motivo: "glifo de uma letra dentro de um marcador SVG de raio 6,5; o tamanho é do ícone, não de texto corrido",
  },
]

function sourceFiles(): string[] {
  return execSync("git ls-files 'src/**/*.tsx' 'src/**/*.ts'", { encoding: "utf8" })
    .split("\n")
    .filter((file) => file && !file.includes("/styleguide/"))
}

function tokensInCss(): number[] {
  const css = readFileSync("src/app/globals.css", "utf8")
  return [...css.matchAll(/--text-[a-z-]+:\s*(\d+)px/g)].map((match) => Number(match[1]))
}

test("os tokens do teste batem com globals.css", () => {
  assert.deepEqual([...TOKEN_PX.keys()].sort((a, b) => a - b), tokensInCss().sort((a, b) => a - b))
})

test("nenhum text-[Npx] abaixo de 11px fora da allowlist", () => {
  const offenders: string[] = []
  for (const file of sourceFiles()) {
    const source = readFileSync(file, "utf8")
    for (const match of source.matchAll(/text-\[([0-9.]+)px\]/g)) {
      const px = Number(match[1])
      if (px >= 11) continue
      const allowed = ALLOWLIST_SUB11.some((entry) => entry.file === file && source.includes(entry.snippet))
      if (!allowed) offenders.push(`${file}: ${match[0]}`)
    }
  }
  assert.deepEqual(offenders, [], "use text-[length:var(--text-eyebrow)] (11px) no lugar")
  for (const entry of ALLOWLIST_SUB11) {
    assert.ok(readFileSync(entry.file, "utf8").includes(entry.snippet), `allowlist órfã: ${entry.file}`)
  }
})

test("nenhum text-[Npx] com o valor exato de um token da escala", () => {
  const offenders: string[] = []
  for (const file of sourceFiles()) {
    const source = readFileSync(file, "utf8")
    for (const match of source.matchAll(/text-\[([0-9.]+)px\]/g)) {
      const token = TOKEN_PX.get(Number(match[1]))
      if (token) offenders.push(`${file}: ${match[0]} -> text-[length:var(--text-${token})]`)
    }
  }
  assert.deepEqual(offenders, [])
})

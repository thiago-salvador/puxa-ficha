import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  COMPARADOR_ADICIONAR_PATTERN,
  COMPARADOR_REMOVER_PATTERN,
  comparadorAdicionarLabel,
  comparadorRemoverLabel,
  comparadorToggleLabel,
} from "@/lib/comparador-labels"

const PANEL = "src/components/ComparadorPanel.tsx"
const SMOKE = "scripts/smoke-lancamento.ts"

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
}

test("o padrao do smoke casa o rotulo de adicionar emitido pelo componente", () => {
  for (const nome of ["Pablo Marçal", "Lula", "Vera Lúcia", "José D'Ávila"]) {
    assert.match(comparadorToggleLabel(nome, false), COMPARADOR_ADICIONAR_PATTERN)
    assert.equal(comparadorToggleLabel(nome, false), comparadorAdicionarLabel(nome))
    assert.match(comparadorToggleLabel(nome, true), COMPARADOR_REMOVER_PATTERN)
    assert.equal(comparadorToggleLabel(nome, true), comparadorRemoverLabel(nome))
  }
})

test("adicionar e remover nao se casam entre si", () => {
  assert.doesNotMatch(comparadorAdicionarLabel("Lula"), COMPARADOR_REMOVER_PATTERN)
  assert.doesNotMatch(comparadorRemoverLabel("Lula"), COMPARADOR_ADICIONAR_PATTERN)
})

test("a combinacao que quebrou o smoke em producao nao existe", () => {
  // Ate 04/09/2026 o smoke procurava /^Adicionar .* da comparação$/i, combinacao
  // que nenhum estado do botao emite: adicionar usa "à", remover usa "da". O
  // clique so falhava por timeout de 20s, contra producao, dois dias depois de
  // o rotulo mudar em #222.
  const combinacaoInexistente = /^Adicionar .+ da comparação$/i
  assert.doesNotMatch(comparadorAdicionarLabel("Lula"), combinacaoInexistente)
  assert.doesNotMatch(comparadorRemoverLabel("Lula"), combinacaoInexistente)
})

test("a crase de 'à comparação' faz parte do contrato", () => {
  assert.equal(comparadorAdicionarLabel("Lula"), "Adicionar Lula à comparação")
  assert.doesNotMatch("Adicionar Lula a comparação", COMPARADOR_ADICIONAR_PATTERN)
})

test("o componente nao reescreve os rotulos fora da lib", () => {
  const panel = read(PANEL)
  assert.doesNotMatch(
    panel,
    /(?:Adicionar|Remover) \$\{/,
    `${PANEL} voltou a montar o rotulo inline; use comparadorToggleLabel de @/lib/comparador-labels`,
  )
  assert.match(panel, /comparadorToggleLabel\(/)
})

test("o smoke nao reescreve o seletor fora da lib", () => {
  const smoke = read(SMOKE)
  assert.doesNotMatch(
    smoke,
    /\/\^?Adicionar /,
    `${SMOKE} voltou a inlinear o regex; use COMPARADOR_ADICIONAR_PATTERN de @/lib/comparador-labels`,
  )
  assert.match(smoke, /COMPARADOR_ADICIONAR_PATTERN/)
})

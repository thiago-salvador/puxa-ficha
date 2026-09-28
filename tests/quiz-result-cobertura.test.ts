import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const root = new URL("..", import.meta.url)
const card = readFileSync(new URL("src/components/quiz/QuizResultCard.tsx", root), "utf8")
const strip = readFileSync(new URL("src/components/quiz/QuizWeightStrip.tsx", root), "utf8")
const result = readFileSync(new URL("src/components/quiz/QuizResult.tsx", root), "utf8")

test("resultado do quiz separa cobertura de compatibilidade e não sugere nota de uma fonte só", () => {
  assert.match(card, /Cobertura: \$\{score\.perguntas_comparadas\} de \$\{score\.perguntas_respondidas\} perguntas/)
  assert.match(card, /Sem evidência comparável/)
  assert.doesNotMatch(card, /Referências nominais disponíveis/)
  assert.match(strip, /if \(segments\.length < 2\) return null/)
  assert.match(strip, /não é nota/)
  assert.match(result, /ordem alfabética/)
  assert.match(result, /não que a nota é zero/)
})

test("alvos de toque do resultado do quiz e da busca da colinha têm ao menos 24 px e foco visível", () => {
  const builder = readFileSync(new URL("src/components/ColinhaBuilder.tsx", root), "utf8")
  assert.match(card, /inline-flex min-h-11 items-center text-sm font-medium text-foreground/)
  assert.match(result, /inline-flex min-h-6 items-center/)
  assert.match(builder, /focus-within:ring-2 focus-within:ring-foreground\/30/)
  assert.match(builder, /min-h-11 min-w-0 flex-1 self-stretch/)
})

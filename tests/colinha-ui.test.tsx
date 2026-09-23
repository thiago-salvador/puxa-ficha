import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const root = new URL("..", import.meta.url)
const page = readFileSync(new URL("src/app/(site)/colinha/page.tsx", root), "utf8")
const builder = readFileSync(new URL("src/components/ColinhaBuilder.tsx", root), "utf8")

test("colinha é privada para indexação e referrer", () => {
  assert.match(page, /index: false/)
  assert.match(page, /referrer: ["']no-referrer["']/)
})

test("colinha usa estado na URL, seis slots e history.replaceState", () => {
  assert.match(builder, /parseColinhaState/)
  assert.match(builder, /buildColinhaUrl/)
  assert.match(builder, /history\.replaceState/)
  for (const slot of ["df", "de", "s1", "s2", "g", "p"]) assert.match(builder, new RegExp(`SLOT_ORDER|${slot}`))
  assert.match(builder, /s1.*s2|s2.*s1/)
})

test("colinha consulta a API oficial, oferece compartilhamento e marca parcial", () => {
  assert.match(builder, /\/api\/colinha\/candidatos/)
  assert.match(builder, /\/api\/colinha\/card/)
  assert.match(builder, /WhatsApp/)
  assert.match(builder, /Imprimir A4/)
  assert.match(builder, /Fonte indisponível/)
  assert.match(builder, /Snapshot indisponível ou sem data de geração/)
  assert.match(builder, /colinhaShare/)
  assert.match(builder, /safeEvent\("text"\)/)
  assert.match(builder, /colinha-print-sheet/)
  assert.match(builder, /@media print/)
  assert.match(builder, /imageAlt/)
  assert.match(builder, /resumo/)
})

test("nenhuma rota ou lib compartilhada da colinha foi alterada pela UI", () => {
  assert.doesNotMatch(builder, /colinha-data/)
  assert.doesNotMatch(builder, /colinha-card/)
})

test("resultados mantêm ficha publicada fora do botão de seleção", () => {
  assert.match(builder, /<li key=\{candidate\.sq_candidato\} className=.*<button/)
  assert.match(builder, /candidate\.slug && <Link href=\{`\/candidato\//)
  assert.doesNotMatch(builder, /<button[^>]*>[\s\S]{0,300}<Link/)
  assert.match(builder, /Candidatura não encontrada neste snapshot/)
  assert.match(builder, /Escolha indisponível:/)
})

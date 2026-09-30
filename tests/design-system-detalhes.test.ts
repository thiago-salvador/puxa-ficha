import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

test("subtítulo do OG editorial escala com o comprimento para não invadir o rodapé", () => {
  const source = readFileSync("src/lib/og.tsx", "utf8")
  assert.match(source, /fontSize: getEditorialSubtitleSize\(subtitle\)/)
  assert.doesNotMatch(source, /fontSize: 31,\n\s+lineHeight: 1\.18,/)
})

test("aviso de conferir a fonte usa o mesmo âmbar do site no card social, no embed e na imprensa", () => {
  const card = readFileSync("src/lib/social-card.tsx", "utf8")
  const imprensa = readFileSync("src/app/(site)/imprensa/imprensa.module.css", "utf8")
  const embed = readFileSync("src/app/(embed)/embed/[slug]/page.tsx", "utf8")
  assert.match(embed, /border-amber-300 bg-amber-50[^"]*text-amber-950/)
  for (const source of [card, imprensa]) {
    assert.doesNotMatch(source, /#fff7ed|#7c2d12/i)
    assert.match(source, /#fffbeb/i)
    assert.match(source, /#451a03/i)
  }
})

test("embed declara a mesma cor de fundo que pinta", () => {
  const layout = readFileSync("src/app/(embed)/embed/layout.tsx", "utf8")
  assert.match(layout, /themeColor: "#ffffff"/)
  assert.match(layout, /bg-background/)
})

test("email de alerta tenta Anton e Inter locais antes do fallback, sem fonte externa", () => {
  const source = readFileSync("src/lib/alerts-shared.ts", "utf8")
  assert.match(source, /EMAIL_FONT_HEADING =\s*"Anton,/)
  assert.match(source, /EMAIL_FONT_BODY = "Inter,/)
  assert.doesNotMatch(source, /fonts\.googleapis\.com/)
})

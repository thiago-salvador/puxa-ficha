import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

test("preload e imagem do hero compartilham srcset responsivo sem baixar o original em paralelo", () => {
  const source = readFileSync("src/app/(site)/page.tsx", "utf8")
  assert.match(source, /getImageProps\(/)
  assert.match(source, /preload\(heroImage\.src,/)
  assert.match(source, /imageSrcSet:\s*heroImage\.srcSet/)
  assert.match(source, /imageSizes:\s*heroImage\.sizes/)
  assert.match(source, /<img\s+\{\.\.\.heroImage\}\s+alt=\{heroImage\.alt\}/)
  assert.doesNotMatch(source, /preload\("\/images\/hero-dossie\.webp"/)
  assert.match(source, /<source media="\(max-width: 640px\)" srcSet="\/images\/hero-dossie-mobile\.webp"/)
})

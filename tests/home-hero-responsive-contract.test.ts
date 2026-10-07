import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

test("hero da home: preload e imagem compartilham srcset responsivo sem baixar o original em paralelo", () => {
  // Desde 05/10 a faixa preta voltou ao topo da home única: é o LCP, carrega já e tem preload.
  const page = readFileSync("src/app/(site)/page.tsx", "utf8")
  assert.match(page, /getImageProps\(/)
  assert.match(page, /loading: "eager"/)
  assert.match(page, /fetchPriority: "high"/)
  assert.match(page, /preload\(heroImage\.src,/)
  // Com os finalistas o hero mostra os retratos: a imagem do dossiê só tem preload no hero de fallback.
  assert.match(page, /if \(!finalistasPresidente\) \{[\s\S]*?preload\(heroImage\.src,/)
  assert.match(page, /imageSrcSet:\s*heroImage\.srcSet/)
  assert.match(page, /imageSizes:\s*heroImage\.sizes/)
  assert.match(page, /preload\("\/images\/hero-dossie-mobile\.webp", \{[^}]*media: "\(max-width: 640px\)"/)
  assert.doesNotMatch(page, /preload\("\/images\/hero-dossie\.webp"/)
  assert.match(page, /<HomeHero2026[\s\S]*?imagem=\{heroImage\}/)

  const hero = readFileSync("src/components/HomeHero2026.tsx", "utf8")
  assert.match(hero, /<img\s+\{\.\.\.imagem\}\s+alt=\{imagem\.alt\}/)
  assert.match(hero, /<source media="\(max-width: 640px\)" srcSet="\/images\/hero-dossie-mobile\.webp"/)
  // O Navbar fica transparente sobre "main > div > section.bg-black": o hero é essa section.
  assert.match(hero, /<section className="relative overflow-hidden bg-black"/)
})

test("a faixa \"Sobre o projeto\" do fim da página saiu: o hero voltou ao topo", () => {
  const page = readFileSync("src/app/(site)/page.tsx", "utf8")
  assert.doesNotMatch(page, /Sobre o projeto/)
  assert.doesNotMatch(page, /hero-dossie-mobile\.webp" \/>/)
})

test("hero com finalistas: foto de celular escondida no desktop não tem preload nem baixa em tamanho real", () => {
  const hero = readFileSync("src/components/HomeHero2026.tsx", "utf8")
  const foto = hero.match(/data-pf-hero-foto-celular>[\s\S]*?<Image ([^>]*)\/>/)?.[1] ?? ""
  assert.match(foto, /sizes="\(min-width: 1024px\) 1px,/)
  assert.doesNotMatch(foto, /\b(priority|preload)\b/)
})

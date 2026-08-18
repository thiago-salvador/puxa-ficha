import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { test } from "node:test"

test("quiz e privacidade expõem imagem social explícita", () => {
  for (const path of [
    "src/app/(site)/quiz/page.tsx",
    "src/app/(site)/privacidade/page.tsx",
  ]) {
    const src = readFileSync(path, "utf8")
    assert.match(
      src,
      /const image\s*=\s*(?:buildAbsoluteUrl\(["']\/[^"']+["']\)|["']\/[^"']+["'])/,
      `${path} deve definir imagem social`,
    )
    assert.match(src, /images:\s*\[/, `${path} deve expor openGraph.images`)
    assert.match(src, /buildTwitterMetadata\(\{[\s\S]*image/, `${path} deve expor twitter:image`)
  }
})

test("manifest público existe em webmanifest e manifest.json", () => {
  assert.ok(existsSync("src/app/manifest.ts"), "app/manifest.ts deve gerar /manifest.webmanifest")
  assert.ok(existsSync("src/app/manifest.json/route.ts"), "route deve servir /manifest.json")

  const manifest = readFileSync("src/lib/site-manifest.ts", "utf8")
  assert.match(manifest, /name:\s*"Puxa Ficha"/)
  assert.match(manifest, /display:\s*"standalone"/)
  assert.match(manifest, /src:\s*"\/icon-192\.png"/)
  assert.match(manifest, /src:\s*"\/icon-512\.png"/)
})

test("bots de auditoria recebem metadata sem streaming tardio", () => {
  const src = readFileSync("next.config.ts", "utf8")

  assert.match(src, /htmlLimitedBots/, "Next config deve declarar bots HTML-limited")
  assert.match(src, /Chrome\\\/\\d\+/, "Lighthouse com UA Chrome comum deve receber metadata inicial")
  assert.match(src, /Chrome-Lighthouse/, "Lighthouse nomeado deve receber metadata no HTML inicial")
  assert.match(src, /HeadlessChrome/, "Chrome headless de auditoria deve receber metadata no HTML inicial")

  const layout = readFileSync("src/app/layout.tsx", "utf8")
  assert.match(layout, /<noscript>/, "layout deve oferecer fallback sem JavaScript")
  assert.match(layout, /href="\/no-js\.css"/, "fallback deve carregar CSS externo compatível com CSP")

  const noJsCss = readFileSync("public/no-js.css", "utf8")
  assert.match(noJsCss, /@layer base/, "fallback deve competir com o reset de hidden do Tailwind")
  assert.match(noJsCss, /div\[hidden\]\[id\^="S:"\]/, "fallback deve revelar chunks SSR do React")
})

test("páginas institucionais orientam retificação de ficha pública", () => {
  const pages = [
    {
      path: "src/app/(site)/sobre/page.tsx",
      channel: /mailto:contato@puxaficha\.com\.br/,
    },
    {
      path: "src/app/(site)/privacidade/page.tsx",
      channel: /mailto:privacidade@puxaficha\.com\.br/,
    },
  ]

  for (const { path, channel } of pages) {
    const src = readFileSync(path, "utf8")
    assert.match(src, /Retificação de\s+ficha/, `${path} deve nomear o fluxo de retificação`)
    assert.match(src, /link da\s+ficha/, `${path} deve pedir o link da ficha`)
    assert.match(src, /fonte oficial ou documento/, `${path} deve pedir fonte de correção`)
    assert.match(src, channel, `${path} deve expor canal de contato por mailto`)
  }
})

test("selos de fonte e curadoria expõem atributos verificáveis no HTML", () => {
  const editorialBadge = readFileSync("src/components/attention-points/EditorialBadge.tsx", "utf8")
  assert.match(editorialBadge, /data-pf-editorial-badge/, "selo editorial deve ter seletor estável")
  assert.match(editorialBadge, /data-pf-editorial-kind/, "selo editorial deve expor tipo")
  assert.match(editorialBadge, /data-pf-editorial-label/, "selo editorial deve expor rótulo")
  assert.match(editorialBadge, /data-pf-curation-verified/, "selo editorial deve expor status de curadoria")

  const fontesList = readFileSync("src/components/attention-points/FontesList.tsx", "utf8")
  assert.match(fontesList, /data-pf-source-list/, "lista de fontes deve ter seletor estável")
  assert.match(fontesList, /data-pf-source-link/, "links de fonte devem ter seletor estável")
  assert.match(fontesList, /data-pf-source-title/, "links de fonte devem expor título")

  const indicadorFonte = readFileSync("src/components/IndicadorFonteTag.tsx", "utf8")
  assert.match(indicadorFonte, /data-pf-source-badge/, "tag de fonte deve ter seletor estável")
  assert.match(indicadorFonte, /data-pf-source-label/, "tag de fonte deve expor rótulo")

  const sourceFooter = readFileSync("src/components/ProfileSourceFooter.tsx", "utf8")
  assert.match(sourceFooter, /data-pf-profile-server-disclosure/, "aviso legal deve ser renderizado no servidor")
  assert.match(sourceFooter, /data-pf-profile-source-footer/, "rodapé de fonte da ficha deve ser verificável")
  assert.match(sourceFooter, /data-pf-profile-sources/, "rodapé deve expor fontes")
  assert.match(sourceFooter, /data-pf-profile-updated-at/, "rodapé deve expor data de atualização")
  assert.match(sourceFooter, /Não é recomendação de voto/, "aviso legal deve existir no HTML inicial")
  assert.match(sourceFooter, /href="\/metodologia"/, "aviso deve ligar para a metodologia")

  const candidateView = readFileSync("src/app/(site)/candidato/[slug]/CandidatoFichaView.tsx", "utf8")
  assert.match(candidateView, /<ProfileSourceFooter ficha=\{ficha\}/, "ficha deve montar o aviso no servidor")

  const profile = readFileSync("src/components/CandidatoProfile.tsx", "utf8")
  assert.match(profile, /data-pf-editorial-badge-summary/, "ficha deve expor resumo SSR dos selos")
  assert.match(profile, /data-pf-editorial-badge-count/, "resumo deve expor total de selos")
  assert.match(profile, /data-pf-source-link-count/, "resumo deve expor total de links de fonte")
})

test("imagens JSX declaram alternativa textual ou ficam decorativas", () => {
  const paths = [
    "src/app/(site)/page.tsx",
    "src/app/(site)/sobre/page.tsx",
    "src/components/CandidatoCard.tsx",
    "src/components/CandidatePhoto.tsx",
    "src/components/Navbar.tsx",
  ]

  for (const path of paths) {
    const src = readFileSync(path, "utf8")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "")
    const tags = src.match(/<(?:Image|img)\b[\s\S]*?>/g) ?? []
    for (const tag of tags) {
      assert.match(tag, /\balt\s*=/, `${path} contém imagem sem alt: ${tag}`)
    }
  }
})

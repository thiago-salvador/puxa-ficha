import assert from "node:assert/strict"
import test from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { SocialLinks } from "../src/components/SocialLinks"

test("SocialLinks não renderiza handle que é segmento reservado da plataforma", () => {
  const html = renderToStaticMarkup(
    createElement(SocialLinks, {
      redes: {
        youtube: "channel",
        instagram: "p",
        twitter: "intent",
        facebook: "sharer",
        tiktok: "tag",
      },
    }),
  )
  assert.equal(html, "")
})

test("SocialLinks descarta URL de post mas mantém perfil válido ao lado", () => {
  const html = renderToStaticMarkup(
    createElement(SocialLinks, {
      redes: {
        instagram: "HTTPS://WWW.INSTAGRAM.COM/REEL/CABC123/",
        twitter: "perfilteste",
      },
    }),
  )
  assert.doesNotMatch(html, /instagram/i)
  assert.match(html, /https:\/\/x\.com\/perfilteste/)
})

test("SocialLinks mantém canal do YouTube guardado como URL /c/ ou /channel/", () => {
  const html = renderToStaticMarkup(
    createElement(SocialLinks, {
      redes: { youtube: "https://www.youtube.com/channel/UCa1B2c3D4e5F6g7H8i9J0-_" },
    }),
  )
  assert.match(html, /href="https:\/\/www\.youtube\.com\/channel\/UCa1B2c3D4e5F6g7H8i9J0-_"/)
  assert.doesNotMatch(html, /youtube\.com\/@channel/)
})

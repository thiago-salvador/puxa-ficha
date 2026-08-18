import test from "node:test"
import assert from "node:assert/strict"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { SocialLinks } from "../src/components/SocialLinks"

/**
 * Por que este teste existe (2026-08-05).
 *
 * `SocialLinks` descarta em SILENCIO qualquer chave que nao esteja em
 * `SOCIAL_ICONS` (`if (!info) return null`). O DTO publico, por outro lado, nao
 * tem allowlist: ele repassa toda chave de `redes_sociais`. As duas coisas
 * juntas produzem o pior modo de falha para este projeto, que e dado coletado,
 * gravado no banco e invisivel na ficha, sem erro em lugar nenhum.
 *
 * Foi exatamente o que aconteceu com LinkedIn: o pacote oficial
 * `rede_social_candidato_2026` do TSE, preenchido pelo proprio candidato no
 * registro, traz 170 URLs de LinkedIn ja nas primeiras 5.382 candidaturas, e a
 * ficha de `ricardo-leite` so tem essa rede. Sem a entrada no mapa, a ficha dele
 * continuaria parecendo "sem rede nenhuma" com o dado no banco.
 */

test("SocialLinks renderiza LinkedIn a partir do handle declarado ao TSE", () => {
  const html = renderToStaticMarkup(
    createElement(SocialLinks, { redes: { linkedin: "fabio-ricardo-leite-806a30326" } }),
  )

  assert.match(html, /https:\/\/linkedin\.com\/in\/fabio-ricardo-leite-806a30326/)
  assert.match(html, /@fabio-ricardo-leite-806a30326/)
})

test("SocialLinks cobre as plataformas que o TSE publica com mais volume", () => {
  // Ordem de volume no rede_social_candidato_2026: instagram, facebook,
  // tiktok, youtube, x/twitter, linkedin.
  for (const [plataforma, handle, esperado] of [
    ["instagram", "meirereis.psol", "https://instagram.com/meirereis.psol"],
    ["facebook", "arcangelicosta", "https://facebook.com/arcangelicosta"],
    ["twitter", "geraldopstu", "https://x.com/geraldopstu"],
    ["youtube", "reporterbenmendes", "https://youtube.com/@reporterbenmendes"],
    ["tiktok", "algum.handle", "https://tiktok.com/@algum.handle"],
    ["linkedin", "fabio-ricardo-leite-806a30326", "https://linkedin.com/in/fabio-ricardo-leite-806a30326"],
  ] as const) {
    const html = renderToStaticMarkup(
      createElement(SocialLinks, { redes: { [plataforma]: handle } }),
    )
    assert.ok(
      html.includes(esperado),
      `${plataforma} deveria virar link para ${esperado}, e saiu: ${html}`,
    )
  }
})

test("SocialLinks aceita URL completa sem prefixar o dominio de novo", () => {
  // O TSE devolve URL completa em varios casos (o Facebook do dr-luisinho e um
  // `profile.php?id=...`, que nao cabe no formato de handle).
  const html = renderToStaticMarkup(
    createElement(SocialLinks, {
      redes: { facebook: "https://www.facebook.com/profile.php?id=61592070802260" },
    }),
  )

  assert.match(html, /href="https:\/\/www\.facebook\.com\/profile\.php\?id=61592070802260"/)
  assert.doesNotMatch(html, /facebook\.com\/https/)
})

test("SocialLinks ignora plataforma desconhecida em vez de quebrar a ficha", () => {
  const html = renderToStaticMarkup(
    createElement(SocialLinks, { redes: { orkut: "alguem" } }),
  )

  // Nenhum link sai, e o handle nunca vaza como texto solto. O container vazio
  // fica: `entries.length` conta a chave desconhecida antes de o map descartar,
  // entao o early return nao dispara. E cosmetico, mas fica documentado aqui
  // para nao ser confundido com o dado tendo sido renderizado.
  assert.doesNotMatch(html, /<a /)
  assert.doesNotMatch(html, /alguem/)
  assert.equal(html, '<div class="flex flex-wrap gap-2"></div>')
})

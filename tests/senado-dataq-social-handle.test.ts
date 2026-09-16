import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { extrairRedesSociaisDeLinks } from "../scripts/lib/enrich-wikipedia"
import {
  SOCIAL_SEGMENTOS_RESERVADOS,
  extrairPerfilSocial,
  valorSocialReservado,
} from "../src/lib/social-profile-url"

describe("extrairPerfilSocial: YouTube", () => {
  it("aceita /@handle e guarda só o handle", () => {
    assert.equal(extrairPerfilSocial("youtube", "https://www.youtube.com/@perfilteste"), "perfilteste")
    assert.equal(extrairPerfilSocial("youtube", "https://youtube.com/@perfilteste/videos"), "perfilteste")
  })

  it("preserva /c/, /user/ e /channel/ como URL completa (o prefixo @ quebraria o link)", () => {
    assert.equal(extrairPerfilSocial("youtube", "https://www.youtube.com/c/NomeCanal"), "https://www.youtube.com/c/NomeCanal")
    assert.equal(extrairPerfilSocial("youtube", "http://youtube.com/user/nomeusuario/"), "https://www.youtube.com/user/nomeusuario")
    const channelId = `UC${"a1B2c3D4e5F6g7H8i9J0-_"}`
    assert.equal(
      extrairPerfilSocial("youtube", `https://www.youtube.com/channel/${channelId}?view_as=subscriber`),
      `https://www.youtube.com/channel/${channelId}`,
    )
  })

  it("descarta vídeo, busca, playlist e prefixos sem identificador", () => {
    for (const url of [
      "https://www.youtube.com/watch?v=abcdefghijk",
      "https://www.youtube.com/shorts/abcdefghijk",
      "https://www.youtube.com/embed/abcdefghijk",
      "https://www.youtube.com/results?search_query=teste",
      "https://www.youtube.com/playlist?list=PL123",
      "https://www.youtube.com/channel/",
      "https://www.youtube.com/channel/nao-e-id",
      "https://www.youtube.com/c/",
      "https://www.youtube.com/user",
      "https://youtu.be/abcdefghijk",
    ]) {
      assert.equal(extrairPerfilSocial("youtube", url), null, url)
    }
  })
})

describe("extrairPerfilSocial: Instagram, X, Facebook, TikTok", () => {
  it("Instagram aceita perfil e descarta post, reel, stories e explore", () => {
    assert.equal(extrairPerfilSocial("instagram", "https://www.instagram.com/perfil.teste_1/"), "perfil.teste_1")
    assert.equal(extrairPerfilSocial("instagram", "https://instagram.com/perfilteste?hl=pt-br"), "perfilteste")
    for (const url of [
      "https://www.instagram.com/p/Cabc123/",
      "https://www.instagram.com/reel/Cabc123/",
      "https://www.instagram.com/stories/perfilteste/123/",
      "https://www.instagram.com/explore/tags/eleicoes/",
      "https://www.instagram.com/perfilteste/p/Cabc123/",
    ]) {
      assert.equal(extrairPerfilSocial("instagram", url), null, url)
    }
  })

  it("X/Twitter aceita perfil e descarta intent, share, hashtag e status", () => {
    assert.equal(extrairPerfilSocial("twitter", "https://twitter.com/Perfil_Teste"), "Perfil_Teste")
    assert.equal(extrairPerfilSocial("twitter", "https://x.com/perfilteste/"), "perfilteste")
    for (const url of [
      "https://twitter.com/intent/tweet?text=oi",
      "https://twitter.com/share?url=x",
      "https://twitter.com/hashtag/eleicoes",
      "https://twitter.com/perfilteste/status/1234567890",
      "https://x.com/i/web/status/1234567890",
      "https://twitter.com/search?q=teste",
    ]) {
      assert.equal(extrairPerfilSocial("twitter", url), null, url)
    }
  })

  it("Facebook aceita página nomeada e profile.php com id; descarta sharer e páginas genéricas", () => {
    assert.equal(extrairPerfilSocial("facebook", "https://www.facebook.com/perfil.teste/"), "perfil.teste")
    assert.equal(
      extrairPerfilSocial("facebook", "https://www.facebook.com/profile.php?id=100012345678901&ref=x"),
      "https://www.facebook.com/profile.php?id=100012345678901",
    )
    for (const url of [
      "https://www.facebook.com/profile.php",
      "https://www.facebook.com/profile.php?ref=bookmarks",
      "https://www.facebook.com/sharer/sharer.php?u=x",
      "https://www.facebook.com/sharer.php?u=x",
      "https://www.facebook.com/pages/Nome-Qualquer/123456",
      "https://www.facebook.com/groups/123456",
      "https://www.facebook.com/watch/?v=123",
      "https://www.facebook.com/perfilteste/posts/123",
    ]) {
      assert.equal(extrairPerfilSocial("facebook", url), null, url)
    }
  })

  it("TikTok aceita só /@handle", () => {
    assert.equal(extrairPerfilSocial("tiktok", "https://www.tiktok.com/@perfil.teste"), "perfil.teste")
    assert.equal(extrairPerfilSocial("tiktok", "https://www.tiktok.com/@perfil.teste/video/123"), null)
    assert.equal(extrairPerfilSocial("tiktok", "https://www.tiktok.com/tag/eleicoes"), null)
  })

  it("rejeita host trapaceiro e URL inválida", () => {
    assert.equal(extrairPerfilSocial("instagram", "https://evil.com/instagram.com/perfilteste"), null)
    assert.equal(extrairPerfilSocial("instagram", "nao é url"), null)
  })
})

describe("valorSocialReservado: defesa na renderização", () => {
  it("lista compartilhada cobre os segmentos que o parser antigo gravava", () => {
    for (const seg of ["watch", "channel", "user", "c"]) assert.ok(SOCIAL_SEGMENTOS_RESERVADOS.youtube.has(seg), seg)
    for (const seg of ["p", "reel", "stories", "explore"]) assert.ok(SOCIAL_SEGMENTOS_RESERVADOS.instagram.has(seg), seg)
    for (const seg of ["intent", "share", "hashtag"]) assert.ok(SOCIAL_SEGMENTOS_RESERVADOS.twitter.has(seg), seg)
    for (const seg of ["sharer", "pages"]) assert.ok(SOCIAL_SEGMENTOS_RESERVADOS.facebook.has(seg), seg)
  })

  it("marca handle nu reservado, em qualquer caixa, e URL cujo primeiro segmento é reservado", () => {
    assert.equal(valorSocialReservado("youtube", "channel"), true)
    assert.equal(valorSocialReservado("youtube", "WATCH"), true)
    assert.equal(valorSocialReservado("youtube", "@c"), true)
    assert.equal(valorSocialReservado("instagram", "p"), true)
    assert.equal(valorSocialReservado("instagram", "HTTPS://WWW.INSTAGRAM.COM/P/CABC/"), true)
    assert.equal(valorSocialReservado("twitter", "intent"), true)
    assert.equal(valorSocialReservado("facebook", "https://www.facebook.com/profile.php"), true)
  })

  it("não marca perfil legítimo nem as formas válidas de canal do YouTube", () => {
    assert.equal(valorSocialReservado("youtube", "perfilteste"), false)
    assert.equal(valorSocialReservado("youtube", "https://www.youtube.com/c/NomeCanal"), false)
    assert.equal(valorSocialReservado("youtube", "https://www.youtube.com/channel/UCa1B2c3D4e5F6g7H8i9J0-_"), false)
    assert.equal(valorSocialReservado("instagram", "HTTPS://WWW.INSTAGRAM.COM/PERFILTESTE/"), false)
    assert.equal(valorSocialReservado("facebook", "https://www.facebook.com/profile.php?id=100012345678901"), false)
    assert.equal(valorSocialReservado("linkedin", "in"), false)
  })
})

describe("valorSocialReservado: URL da plataforma passa pelo parser inteiro", () => {
  it("marca post, vídeo ou link curto mesmo quando o primeiro segmento não é reservado", () => {
    assert.equal(valorSocialReservado("instagram", "https://www.instagram.com/perfilteste/p/Cabc123/"), true)
    assert.equal(valorSocialReservado("youtube", "https://youtu.be/abcdefghijk"), true)
    assert.equal(valorSocialReservado("tiktok", "https://www.tiktok.com/@perfilteste/video/1234567890"), true)
    assert.equal(valorSocialReservado("twitter", "https://x.com/perfilteste/status/1234567890"), true)
    assert.equal(valorSocialReservado("instagram", "perfilteste/p/Cabc123"), true)
  })

  it("não marca perfil com sufixo de navegação, query de rastreio ou host fora da plataforma", () => {
    assert.equal(valorSocialReservado("youtube", "https://www.youtube.com/@perfilteste/videos"), false)
    assert.equal(valorSocialReservado("instagram", "https://instagram.com/perfilteste?igshid=abc"), false)
    assert.equal(valorSocialReservado("tiktok", "https://www.tiktok.com/@perfilteste?lang=pt-BR"), false)
    assert.equal(valorSocialReservado("instagram", "@perfilteste"), false)
    assert.equal(valorSocialReservado("instagram", "perfilteste/"), false)
    assert.equal(valorSocialReservado("instagram", "https://linktr.ee/perfilteste"), false)
  })
})

describe("enrich-wikipedia usa o parser compartilhado", () => {
  it("nunca grava segmento reservado a partir dos extlinks", () => {
    const redes = extrairRedesSociaisDeLinks([
      "https://www.youtube.com/watch?v=abcdefghijk",
      "https://www.instagram.com/p/Cabc123/",
      "https://twitter.com/perfilteste/status/1234567890",
      "https://www.facebook.com/sharer/sharer.php?u=x",
    ])
    assert.deepEqual(redes, {})
  })

  it("mantém o primeiro perfil válido e ignora referências posteriores inválidas", () => {
    const redes = extrairRedesSociaisDeLinks([
      "https://www.instagram.com/perfilteste/",
      "https://www.instagram.com/p/Cabc123/",
      "https://www.youtube.com/user/nomeusuario",
      "https://www.youtube.com/watch?v=abcdefghijk",
      "https://evil.com/twitter.com/outro",
    ])
    assert.deepEqual(redes, {
      instagram: "perfilteste",
      youtube: "https://www.youtube.com/user/nomeusuario",
    })
  })
})

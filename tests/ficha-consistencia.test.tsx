import test, { describe } from "node:test"
import assert from "node:assert/strict"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { nomeDaRedeSocial } from "../src/lib/rede-social-nome"
import { VOTO_BADGE_NEUTRO_CLASS, formatVotoCasaQuando } from "../src/lib/vote-badge"
import { formatDestaquesLegenda } from "../src/lib/ui-labels"
import { variacaoPatrimonialDaFicha } from "../src/lib/patrimonio-contexto"
import { SocialLinks } from "../src/components/SocialLinks"
import type { Patrimonio } from "../src/lib/types"

describe("mapa domínio → rede social", () => {
  test("reconhece cada rede pelo domínio, com e sem www e subdomínio", () => {
    const casos: [string, string][] = [
      ["https://instagram.com/fulano", "Instagram"],
      ["https://www.instagram.com/fulano/", "Instagram"],
      ["HTTPS://WWW.INSTAGRAM.COM/FULANO/", "Instagram"],
      ["https://x.com/fulano", "X"],
      ["https://twitter.com/fulano", "X"],
      ["https://m.facebook.com/fulano", "Facebook"],
      ["https://www.facebook.com/profile.php?id=1", "Facebook"],
      ["https://tiktok.com/@fulano", "TikTok"],
      ["https://vm.tiktok.com/abc", "TikTok"],
      ["https://youtube.com/@fulano", "YouTube"],
      ["https://youtu.be/abc", "YouTube"],
      ["https://threads.com/@fulano", "Threads"],
      ["https://www.threads.net/@fulano", "Threads"],
      ["https://kwai.com/@fulano", "Kwai"],
      ["https://linkedin.com/in/fulano", "LinkedIn"],
      ["https://t.me/fulano", "Telegram"],
    ]
    for (const [url, nome] of casos) assert.equal(nomeDaRedeSocial(url), nome, url)
  })

  test("domínio desconhecido aparece como o próprio domínio, sem adivinhar a rede", () => {
    assert.equal(nomeDaRedeSocial("https://www.linktr.ee/fulano"), "linktr.ee")
    // Sufixo parecido não casa: "notx.com" não é o X.
    assert.equal(nomeDaRedeSocial("https://notx.com/fulano"), "notx.com")
    assert.equal(nomeDaRedeSocial("não é url"), null)
  })

  test("o chip do hero mostra o nome da rede antes do @perfil", () => {
    const html = renderToStaticMarkup(
      createElement(SocialLinks, {
        redes: {
          instagram: "flaviobolsonaro",
          twitter: "https://x.com/flaviobolsonaro",
          facebook: "https://www.facebook.com/flaviobolsonaro/",
        },
      }),
    )
    assert.match(html, /data-pf-social-rede="Instagram"[^>]*>.*?>Instagram<\/span> <span>@flaviobolsonaro<\/span>/)
    assert.match(html, /data-pf-social-rede="X"[^>]*>.*?>X<\/span> <span>@flaviobolsonaro<\/span>/)
    assert.match(html, /data-pf-social-rede="Facebook"[^>]*>.*?>Facebook<\/span> <span>@flaviobolsonaro<\/span>/)
  })
})

describe("votações sem peso visual desigual", () => {
  test("uma única classe neutra, sem preenchimento", () => {
    assert.doesNotMatch(VOTO_BADGE_NEUTRO_CLASS, /bg-foreground|bg-secondary/)
    assert.match(VOTO_BADGE_NEUTRO_CLASS, /\bborder\b/)
    assert.match(VOTO_BADGE_NEUTRO_CLASS, /\bfont-bold\b/)
  })

  test("casa e ano só quando a votação traz os dois; nada inventado", () => {
    assert.equal(formatVotoCasaQuando({ casa: "Senado", data_votacao: "2023-03-12" }), "Senado · 2023")
    assert.equal(formatVotoCasaQuando({ casa: "Câmara", data_votacao: "2021-11-04" }, "data"), "Câmara · 04/11/2021")
    assert.equal(formatVotoCasaQuando({ casa: "Senado", data_votacao: "" }), "Senado")
    assert.equal(formatVotoCasaQuando({ casa: "" as "Senado", data_votacao: "2023-03-12" }), null)
    assert.equal(formatVotoCasaQuando(undefined), null)
  })
})

describe("legenda do KPI Destaques", () => {
  test("separa alertas e pontos positivos, com plural", () => {
    assert.equal(formatDestaquesLegenda(2, 1), "2 alertas · 1 ponto positivo")
    assert.equal(formatDestaquesLegenda(1, 0), "1 alerta")
    assert.equal(formatDestaquesLegenda(0, 3), "3 pontos positivos")
    assert.equal(formatDestaquesLegenda(0, 0), "alertas e pontos positivos")
  })
})

describe("crescimento patrimonial com um número só", () => {
  const linha = (ano: number, valor: number, id = `p-${ano}`) =>
    ({ id, candidato_id: "c", ano_eleicao: ano, valor_total: valor, bens: [] }) as unknown as Patrimonio

  test("compara as duas últimas declarações, não a primeira da série", () => {
    const variacao = variacaoPatrimonialDaFicha([linha(2006, 100), linha(2018, 1000), linha(2026, 4700)])
    assert.ok(variacao)
    assert.equal(variacao.anterior.ano_eleicao, 2018)
    assert.equal(variacao.atual.ano_eleicao, 2026)
    assert.equal(variacao.pct, 370)
  })

  test("uma declaração só não tem percentual", () => {
    assert.equal(variacaoPatrimonialDaFicha([linha(2026, 4700)]), null)
  })
})

import assert from "node:assert/strict"
import test from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import { SocialLinks } from "@/components/SocialLinks"

/**
 * O pacote de redes sociais do TSE devolve URL em CAIXA ALTA. Medido no banco de
 * producao em 17/08/2026: 34 das 207 fichas publicadas foram importadas assim,
 * entre elas orleans-brandao, pedro-brito, flavio-roscoe e jose-moita.
 *
 * O componente quebrava DUAS vezes, porque os dois testes de esquema eram
 * sensiveis a maiuscula:
 *
 *   1. `handle.startsWith("http")` dava false para "HTTPS://...", entao o prefixo
 *      da plataforma era colado na frente da URL inteira e o href virava
 *      `https://instagram.com/HTTPS://WWW.INSTAGRAM.COM/FULANO/`. O `safeHref`
 *      nao pegava, porque `new URL()` normaliza o protocolo e a URL concatenada e
 *      sintaticamente valida: o link renderizava bonito e dava 404.
 *   2. a remocao de esquema e host na hora de exibir tambem nao casava, entao o
 *      chip mostrava a URL inteira gritando em caixa alta no lugar do @handle.
 *
 * Estes testes existem para que uma reimportacao do TSE nao traga o defeito de
 * volta em silencio.
 */

const CAIXA_ALTA = {
  instagram: { url: "HTTPS://WWW.INSTAGRAM.COM/ORLEANSBRANDAOMA/" },
} as unknown as Record<string, string>

test("URL em caixa alta nao vira href concatenado", () => {
  const html = renderToStaticMarkup(<SocialLinks redes={CAIXA_ALTA} />)
  assert.doesNotMatch(
    html,
    /instagram\.com\/HTTPS/i,
    "o prefixo da plataforma foi colado na frente da URL inteira",
  )
  assert.match(html, /href="HTTPS:\/\/WWW\.INSTAGRAM\.COM\/ORLEANSBRANDAOMA\/"/)
})

test("o chip mostra o @handle, nao a URL inteira", () => {
  const html = renderToStaticMarkup(<SocialLinks redes={CAIXA_ALTA} />)
  assert.match(html, /@orleansbrandaoma/)
  assert.doesNotMatch(html, /@HTTPS/i, "a URL inteira vazou para o texto do chip")
})

test("minuscula continua funcionando igual", () => {
  const html = renderToStaticMarkup(
    <SocialLinks
      redes={{ instagram: "https://www.instagram.com/fulano/" } as unknown as Record<string, string>}
    />,
  )
  assert.match(html, /@fulano/)
  assert.doesNotMatch(html, /instagram\.com\/https/i)
})

test("handle sem esquema ainda ganha o prefixo da plataforma", () => {
  const html = renderToStaticMarkup(
    <SocialLinks redes={{ instagram: "fulano" } as unknown as Record<string, string>} />,
  )
  assert.match(html, /href="https:\/\/instagram\.com\/fulano"/)
  assert.match(html, /@fulano/)
})

test("barra final da URL do TSE nao vaza para o chip", () => {
  const html = renderToStaticMarkup(
    <SocialLinks
      redes={
        { facebook: "HTTPS://WWW.FACEBOOK.COM/ORLEANSBRANDAOMA/" } as unknown as Record<
          string,
          string
        >
      }
    />,
  )
  assert.match(html, />@orleansbrandaoma</)
  assert.doesNotMatch(html, /@orleansbrandaoma\//)
})

test("threads renderiza em vez de sumir em silencio", () => {
  // Antes de 17/08 `threads` nao estava em SOCIAL_ICONS e o `if (!info) return null`
  // descartava o link sem aviso, o mesmo defeito que o LinkedIn teve em 05/08.
  const html = renderToStaticMarkup(
    <SocialLinks
      redes={
        { threads: "HTTPS://WWW.THREADS.COM/@ORLEANSBRANDAOMA" } as unknown as Record<
          string,
          string
        >
      }
    />,
  )
  assert.match(html, /@orleansbrandaoma/)
  assert.match(html, /threads\.com/i)
})

test("rede desconhecida continua sendo descartada", () => {
  const html = renderToStaticMarkup(
    <SocialLinks redes={{ orkut: "https://orkut.com/fulano" } as unknown as Record<string, string>} />,
  )
  assert.doesNotMatch(html, /orkut/i)
})

test("objeto { url } em caixa alta tambem e tratado", () => {
  const html = renderToStaticMarkup(
    <SocialLinks
      redes={
        { youtube: { url: "HTTPS://WWW.YOUTUBE.COM/@ORLEANSBRANDAOMA" } } as unknown as Record<
          string,
          string
        >
      }
    />,
  )
  assert.match(html, /@orleansbrandaoma/)
  assert.doesNotMatch(html, /youtube\.com\/@HTTPS/i)
})

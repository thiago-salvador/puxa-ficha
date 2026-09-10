import assert from "node:assert/strict"
import test from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import { NewsSection } from "../src/components/NewsSection"
import type { NoticiaCandidato } from "../src/lib/types"

const news: NoticiaCandidato = {
  id: "test-article", candidato_id: "test-candidate", titulo: "Manchete de teste - Fonte de Teste",
  fonte: "Fonte de Teste", snippet: "Explicação da notícia usada apenas neste teste.",
  url: "https://example.test/noticia?a=1&b=2", data_publicacao: "2026-09-10T12:00:00Z",
}

test("o link do email abre o resumo e mantém fonte, data e link seguro", () => {
  const html = renderToStaticMarkup(<NewsSection noticias={[news]} candidateSlug="teste" selectedNewsId={news.id} />)
  assert.match(html, /<details open=""/)
  assert.match(html, /Explicação da notícia usada apenas neste teste/)
  assert.match(html, /href="https:\/\/example.test\/noticia\?a=1&amp;b=2"/)
  assert.match(html, /rel="noopener noreferrer"/)
  assert.match(html, /<time dateTime="2026-09-10T12:00:00Z"/)
})

test("notícia selecionada além das dez iniciais continua renderizada", () => {
  const items = Array.from({length: 20}, (_, index) => ({...news, id: `test-${index}`, data_publicacao: new Date(Date.UTC(2026, 8, 20-index)).toISOString()}))
  const html = renderToStaticMarkup(<NewsSection noticias={items} candidateSlug="teste" selectedNewsId="test-15" />)
  assert.match(html, /id="noticia-test-15"/)
  assert.equal((html.match(/<article /g) ?? []).length, 16)
  assert.equal((html.match(/<details open=""/g) ?? []).length, 1)
})

test("não inventa resumo, não injeta HTML e não publica URL insegura", () => {
  const html = renderToStaticMarkup(<NewsSection noticias={[{...news, snippet: null, titulo: '<script>alert("x")</script>', url: 'javascript:alert(1)'}]} candidateSlug="teste" />)
  assert.doesNotMatch(html, /Ainda não temos|resumo (?:indisponível|não disponível)|>Resumo</)
  assert.match(html, /Link da matéria indisponível/)
  assert.doesNotMatch(html, /<script>|href="javascript:/)
})

test("resumo ausente fica vazio e mantém acesso ao portal", () => {
  const html = renderToStaticMarkup(<NewsSection noticias={[{...news, snippet: null}]} candidateSlug="teste" selectedNewsId={news.id} />)
  assert.doesNotMatch(html, /Ainda não temos|resumo (?:indisponível|não disponível)|>Resumo</)
  assert.match(html, /Ler no portal/)
  assert.match(html, /href="https:\/\/example.test\/noticia/)
})

test("data de publicação não recua um dia conforme o fuso do leitor", () => {
  const html = renderToStaticMarkup(<NewsSection noticias={[{...news, data_publicacao: "2026-08-13T00:00:00+00:00"}]} candidateSlug="teste" />)
  assert.match(html, />13\/08\/2026<\/time>/)
})

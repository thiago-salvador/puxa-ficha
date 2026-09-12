import assert from "node:assert/strict"
import test from "node:test"
import { observarPublicacaoPesquisa } from "../scripts/lib/pesquisas-publication-observation"

test("reconhece shell editorial mesmo sem article/main", () => {
  const result = observarPublicacaoPesquisa('<html><head><meta property="article:published_time" content="2026-09-12"></head><h1><span>Pesquisa de intenção de voto para governador</span></h1><p>Datafolha apresenta o levantamento eleitoral no estado. Eleitores foram entrevistados sobre suas intenções de voto. A pesquisa detalha a metodologia das entrevistas e os cenários apresentados aos participantes.</p></html>')
  assert.equal(result.recognized, true)
  assert.equal(result.has_article_or_main, false)
  assert.equal(result.has_h1, true)
  assert.equal(result.has_publication_date, true)
  assert.equal(result.has_research_text, true)
})

test("rejeita challenge HTTP 200 e HTML sem identidade editorial", () => {
  const challenge = observarPublicacaoPesquisa("<html><h1>Just a moment...</h1><p>Checking your browser before accessing</p></html>")
  assert.equal(challenge.recognized, false)
  assert.equal(challenge.is_challenge, true)
  const unknown = observarPublicacaoPesquisa("<html><p>12/09/2026</p><p>conteúdo genérico</p></html>")
  assert.equal(unknown.recognized, false)
  assert.equal(unknown.has_h1, false)
  const navigationOnly = observarPublicacaoPesquisa('<h1>Conteúdo não disponível para consulta</h1><nav>Datafolha pesquisa de intenção de voto publicada em 12/09/2026. Eleitores participaram do levantamento. Dados da pesquisa e informações para eleitores estão nesta navegação.</nav>')
  assert.equal(navigationOnly.recognized, false)
})

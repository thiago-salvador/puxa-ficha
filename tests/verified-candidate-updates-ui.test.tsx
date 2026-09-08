import assert from "node:assert/strict"
import { test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { HomeRecentUpdates } from "../src/components/HomeRecentUpdates"
import { isVerifiedCandidateUpdate, type VerifiedCandidateUpdate } from "../src/lib/verified-candidate-updates"

const update: VerifiedCandidateUpdate = {
  id: "event-test", candidate_slug: "teste", candidate_name: "Pessoa de teste",
  field: "patrimonio", year: 2026, before_value: "0", after_value: "1250.50",
  source_url: "https://cdn.tse.jus.br/estatistica/bens.zip", detected_at: "2026-09-08T15:00:00Z",
}

test("verified update validates provenance and rejects unsafe or malformed records", () => {
  assert.equal(isVerifiedCandidateUpdate(update), true)
  for (const changes of [
    { source_url: "https://tse.jus.br.example.com/fake" },
    { source_url: "https://user:secret@tse.jus.br/file" },
    { source_url: "javascript:alert(1)" },
    { source_url: "http://tse.jus.br/file" },
    { after_value: "NaN" }, { before_value: "-1" },
    { after_value: "0" }, { candidate_slug: "../private" },
    { detected_at: "invalid" }, { field: "email" }, { year: 1989 },
  ]) assert.equal(isVerifiedCandidateUpdate({ ...update, ...changes }), false)
})

test("updates render before/after, election year, detection time and official source in existing cards", () => {
  const html = renderToStaticMarkup(createElement(HomeRecentUpdates, { resource: { status: "available", updates: [update] } }))
  assert.match(html, /Pessoa de teste/)
  assert.match(html, /Antes/)
  assert.match(html, /Agora/)
  assert.match(html, /1\.250,50/)
  assert.match(html, /2026/)
  assert.match(html, /Detectado em/)
  assert.match(html, /não quando ela aconteceu/)
  assert.match(html, /href="\/candidato\/teste"/)
  assert.match(html, /href="https:\/\/cdn.tse.jus.br\/estatistica\/bens.zip"/)
  assert.doesNotMatch(html, /indisponível|nenhuma mudança ocorreu/)
})

test("empty history is distinguished from unavailable source and never claims global absence", () => {
  const html = renderToStaticMarkup(createElement(HomeRecentUpdates, { resource: { status: "available", updates: [] } }))
  assert.match(html, /primeira consulta cria a referência inicial/)
  assert.match(html, /Isso não significa que nenhuma mudança ocorreu/)
  assert.doesNotMatch(html, /histórico de mudanças verificadas ainda não está disponível/)
  const failed = renderToStaticMarkup(createElement(HomeRecentUpdates, { resource: { status: "unavailable", updates: [] } }))
  assert.match(failed, /histórico de mudanças verificadas ainda não está disponível/)
  assert.doesNotMatch(failed, /Ainda não há mudanças verificadas neste histórico/)
})

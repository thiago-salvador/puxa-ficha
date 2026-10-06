import assert from "node:assert/strict"
import { test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { HomeRecentUpdates } from "../src/components/HomeRecentUpdates"
import { filtrarAtualizacoesPorSlugs, isVerifiedCandidateUpdate, type VerifiedCandidateUpdate } from "../src/lib/verified-candidate-updates"
import { readFileSync } from "node:fs"

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

test("2nd-round scope: filter by slug, scoped copy and truthful empty state", () => {
  const outro = { ...update, id: "event-outro", candidate_slug: "outro", candidate_name: "Outra pessoa" }
  assert.deepEqual(filtrarAtualizacoesPorSlugs([update, outro], ["teste"]).map((u) => u.id), ["event-test"])
  assert.deepEqual(filtrarAtualizacoesPorSlugs([update, outro], []), [])
  assert.equal(filtrarAtualizacoesPorSlugs([update, outro]).length, 2)

  const html = renderToStaticMarkup(createElement(HomeRecentUpdates, { resource: { status: "available", updates: [update] }, escopo: "segundo-turno" }))
  assert.match(html, /candidatos do 2º turno/)
  assert.match(html, /Só candidatos que disputam o 2º turno\./)
  assert.match(html, />Ficha completa<span class="sr-only"> de Pessoa de teste<\/span>/)

  const vazio = renderToStaticMarkup(createElement(HomeRecentUpdates, { resource: { status: "available", updates: [] }, escopo: "segundo-turno" }))
  assert.match(vazio, /Ainda não há mudanças verificadas para os candidatos do 2º turno\./)
  assert.match(vazio, /Isso não significa que nenhuma mudança ocorreu/)
  assert.doesNotMatch(vazio, /Ainda não há mudanças verificadas neste histórico/)

  // Padrão inalterado fora da home do 2º turno.
  const padrao = renderToStaticMarkup(createElement(HomeRecentUpdates, { resource: { status: "available", updates: [update] } }))
  assert.match(padrao, />Ver ficha</)
  assert.doesNotMatch(padrao, /2º turno/)

  // O recorte vai na consulta, antes do limite de seis, e lista vazia nem consulta.
  const data = readFileSync("src/lib/verified-candidate-updates-data.ts", "utf8")
  assert.match(data, /if \(slugs && slugs\.length === 0\) return \{ status: "available", updates: \[\] \}/)
  assert.match(data, /if \(slugs\) query = query\.in\("candidate_slug", \[\.\.\.slugs\]\)[\s\S]*?\.limit\(6\)/)
})

test("no recorte do 2º turno a seção some enquanto não houver mudança verificada", async () => {
  const { deveMostrarAtualizacoes } = await import("../src/lib/verified-candidate-updates")
  assert.equal(deveMostrarAtualizacoes({ status: "available", updates: [] }, "segundo-turno"), false)
  assert.equal(deveMostrarAtualizacoes({ status: "unavailable", updates: [] }, "segundo-turno"), false)
  assert.equal(deveMostrarAtualizacoes({ status: "available", updates: [{} as never] }, "segundo-turno"), true)
  // Fora do recorte o comportamento antigo continua: o estado vazio explica a ausência.
  assert.equal(deveMostrarAtualizacoes({ status: "available", updates: [] }, "todos"), true)
})

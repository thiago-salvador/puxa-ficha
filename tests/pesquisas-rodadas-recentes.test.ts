import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import {
  listarRodadasRecentesDoCandidato,
  parsePesquisasEleitoraisJson,
} from "../src/lib/pesquisas-eleitorais"

function fixture() {
  const catalogo = parsePesquisasEleitoraisJson(
    readFileSync("scripts/data/pesquisas-presidencia-2026.json", "utf8"),
    readFileSync("scripts/data/pesquisas-eleitorais-fontes.json", "utf8"),
  )
  catalogo.pesquisas = [catalogo.pesquisas[0]]
  return catalogo
}

test("revisão de uma rodada não aprova outro registro do mesmo instituto", () => {
  const polls = JSON.parse(readFileSync("scripts/data/pesquisas-presidencia-2026.json", "utf8"))
  const sources = readFileSync("scripts/data/pesquisas-eleitorais-fontes.json", "utf8")
  const reviewed = polls.pesquisas.find((p: { id: string }) => p.id === "meio-ideia-br-07935-2026")
  assert.ok(reviewed)
  reviewed.registration.code.value = "BR-99999/2026"
  assert.throws(() => parsePesquisasEleitoraisJson(JSON.stringify(polls), sources), /não pertence às rodadas revisadas/)
})

test("rodada nova aparece mesmo com lista diferente e conserva cenários alternativos", () => {
  const catalogo = fixture()
  const nova = structuredClone(catalogo.pesquisas[0])
  nova.id = "rodada-nova"
  nova.publicationDate.value = "2099-01-01"
  const slug = nova.cenarios[0].resultados.find((r) => r.candidateSlug)!.candidateSlug!
  nova.cenarios[0].comparabilityKey += "|outra-lista"
  const alternativo = structuredClone(nova.cenarios[0])
  alternativo.id += "-alternativo"
  alternativo.labelRaw = "Primeiro turno estimulado, cenário alternativo"
  alternativo.comparabilityKey += "|alternativo"
  alternativo.resultados.find((r) => r.candidateSlug === slug)!.valuePercent = 0
  nova.cenarios.push(alternativo)
  catalogo.pesquisas.push(nova)
  const selected = listarRodadasRecentesDoCandidato(catalogo, slug)
  assert.equal(selected.length, 2)
  assert.ok(selected.every((p) => p.id === nova.id))
  assert.equal(selected[1].resultado.valuePercent, 0)
  assert.equal(selected[1].cenario.labelRaw, alternativo.labelRaw)
  assert.notEqual(selected[0].cenario.comparabilityKey, selected[1].cenario.comparabilityKey)
})

test("não recupera percentual antigo quando a rodada nova omite o candidato", () => {
  const catalogo = fixture()
  const nova = structuredClone(catalogo.pesquisas[0])
  const slug = nova.cenarios[0].resultados.find((r) => r.candidateSlug)!.candidateSlug!
  nova.id = "rodada-sem-percentual-individual"
  nova.publicationDate.value = "2099-01-01"
  nova.cenarios.forEach((c) => { c.resultados = c.resultados.filter((r) => r.candidateSlug !== slug) })
  catalogo.pesquisas.push(nova)
  assert.deepEqual(listarRodadasRecentesDoCandidato(catalogo, slug), [])
})

test("rodada nova só de segundo turno não apaga o primeiro turno elegível", () => {
  const catalogo = fixture()
  const original = catalogo.pesquisas[0]
  const slug = original.cenarios[0].resultados.find((r) => r.candidateSlug)!.candidateSlug!
  const nova = structuredClone(original)
  nova.id = "nova-apenas-segundo-turno"
  nova.publicationDate.value = "2099-01-01"
  nova.cenarios.forEach((c) => { c.turn = 2 })
  catalogo.pesquisas.push(nova)
  assert.equal(listarRodadasRecentesDoCandidato(catalogo, slug)[0].id, original.id)
})

test("divulgação desconhecida não supera uma rodada com data confirmada", () => {
  const catalogo = fixture()
  const original = catalogo.pesquisas[0]
  const slug = original.cenarios[0].resultados.find((r) => r.candidateSlug)!.candidateSlug!
  const unknown = structuredClone(original)
  unknown.id = "divulgacao-desconhecida"
  unknown.publicationDate = { value: null, status: "indeterminado" }
  unknown.fieldwork.end.value = "2099-01-01"
  catalogo.pesquisas.push(unknown)
  assert.equal(listarRodadasRecentesDoCandidato(catalogo, slug)[0].id, original.id)
  catalogo.pesquisas.reverse()
  assert.equal(listarRodadasRecentesDoCandidato(catalogo, slug)[0].id, original.id)
})

test("mesma divulgação usa fim do campo e conserva empate real sem depender da ordem", () => {
  const catalogo = fixture()
  const original = catalogo.pesquisas[0]
  const slug = original.cenarios[0].resultados.find((r) => r.candidateSlug)!.candidateSlug!
  const nova = structuredClone(original)
  nova.id = "campo-mais-recente"
  nova.fieldwork.end.value = original.publicationDate.value
  assert.ok(nova.fieldwork.end.value! > original.fieldwork.end.value!)
  catalogo.pesquisas.push(nova)
  assert.deepEqual(listarRodadasRecentesDoCandidato(catalogo, slug).map((p) => p.id), [nova.id])
  catalogo.pesquisas.reverse()
  assert.deepEqual(listarRodadasRecentesDoCandidato(catalogo, slug).map((p) => p.id), [nova.id])
  const empate = structuredClone(nova)
  empate.id = "empate-real"
  catalogo.pesquisas.push(empate)
  const first = listarRodadasRecentesDoCandidato(catalogo, slug).map((p) => p.id)
  catalogo.pesquisas.reverse()
  assert.equal(first.length, 2)
  assert.deepEqual(listarRodadasRecentesDoCandidato(catalogo, slug).map((p) => p.id), first)
})

test("não cruza UF, cargo, ano, turno nem slug e prioriza divulgação recente", () => {
  const catalogo = fixture()
  const original = catalogo.pesquisas[0]
  const slug = original.cenarios[0].resultados.find((r) => r.candidateSlug)!.candidateSlug!
  for (const field of ["uf", "cargo", "ano", "turno", "espontaneo"]) {
    const invalid = structuredClone(original)
    invalid.sourceId += field
    invalid.instituto.value += field
    if (field === "uf") invalid.geography.code = "SP"
    if (field === "cargo") invalid.office = "Governador"
    if (field === "ano") invalid.electionYear = 2022
    if (field === "turno") invalid.cenarios.forEach((c) => { c.turn = 2 })
    if (field === "espontaneo") invalid.cenarios.forEach((c) => { c.comparabilityKey = c.comparabilityKey.replace("|estimulado|", "|espontaneo|") })
    catalogo.pesquisas.push(invalid)
  }
  assert.equal(listarRodadasRecentesDoCandidato(catalogo, slug).length, 1)
  assert.equal(listarRodadasRecentesDoCandidato(catalogo, slug.toUpperCase()).length, 0)
  const newer = structuredClone(original)
  newer.sourceId = "outro-instituto"
  newer.instituto.value = "Outro instituto"
  newer.publicationDate.value = "2099-01-01"
  catalogo.pesquisas.push(newer)
  assert.equal(listarRodadasRecentesDoCandidato(catalogo, slug)[0].sourceId, newer.sourceId)
})

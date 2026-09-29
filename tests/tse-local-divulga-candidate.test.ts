import assert from "node:assert/strict"
import { test } from "node:test"

import { candidateUrl, collectDivulgaCandidateFallback, derivePartyChanges, type SeedCandidateIdentity } from "../scripts/tse-local/divulga-candidate"
import { candidateUfForDivulga } from "../scripts/tse-local/ingest-tse-local"
import type { TseChromeClient } from "../scripts/tse-local/chrome-fetch"

const identity: SeedCandidateIdentity = { slug: "candidata-teste", uf: "SP", sqCandidato: "250002554080" }
const electionId = "20322002026"
const ordinarias = [{ id: electionId, ano: 2026 }, { id: "2040602026", ano: 2024 }]

test("routes presidential candidates through BR, including seed state RJ or blank", () => {
  assert.equal(candidateUfForDivulga({ cargo_disputado: "Presidente", estado: "RJ" }), "BR")
  assert.equal(candidateUfForDivulga({ cargo_disputado: "Presidente", estado: "" }), "BR")
  assert.equal(candidateUfForDivulga({ cargo_disputado: "Governador", estado: "to" }), "TO")
  const president: SeedCandidateIdentity = { slug: "flavio-bolsonaro", uf: "BR", sqCandidato: "280002551544" }
  assert.equal(candidateUrl(president, electionId), "https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/BR/20322002026/candidato/280002551544")
  assert.match(candidateUrl({ ...identity, uf: "TO" }, electionId), /\/buscar\/2026\/TO\/20322002026\/candidato\/250002554080$/)
})

test("accepts BR as a valid request UF for presidential candidates", async () => {
  const seen: string[] = []
  const president: SeedCandidateIdentity = { slug: "flavio-bolsonaro", uf: "BR", sqCandidato: "280002551544" }
  const detail = { id: president.sqCandidato, ufCandidatura: "BR", eleicao: { id: electionId, ano: 2026 } }
  const [result] = await collectDivulgaCandidateFallback([president], fakeWithClient(
    [ordinarias, detail], seen, { opened: 0 },
  ))
  assert.equal(result?.status, "ok")
  assert.equal(seen[1], candidateUrl(president, electionId))
})

function fakeWithClient(payloads: unknown[], seen: string[], contexts: { opened: number }) {
  return async <T>(run: (client: TseChromeClient) => Promise<T>): Promise<T> => {
    contexts.opened += 1
    let cursor = 0
    const client = {
      getJson: async (url: string) => {
        seen.push(url)
        return payloads[cursor++]
      },
      downloadZip: async () => { throw new Error("não usado") },
    } as TseChromeClient
    return run(client)
  }
}

test("preserves missing bens as null and explicit empty bens as []", async () => {
  const seen: string[] = []
  const contexts = { opened: 0 }
  const detail = { id: identity.sqCandidato, ufCandidatura: "SP", eleicao: { id: electionId, ano: 2026 }, totalDeBens: 0 }
  const [missing, empty] = await collectDivulgaCandidateFallback(
    [identity, { ...identity, slug: "candidata-teste-2", sqCandidato: "250002554081" }],
    fakeWithClient([ordinarias, detail, { ...detail, id: "250002554081", bens: [] }], seen, contexts),
  )
  assert.equal(missing?.status, "ok")
  assert.equal(missing?.bens, null)
  assert.equal(missing?.totalDeBens, 0)
  assert.deepEqual(empty?.bens, [])
  assert.equal(contexts.opened, 1)
  assert.equal(seen[0], "https://divulgacandcontas.tse.jus.br/divulga/rest/v1/eleicao/ordinarias")
  assert.match(seen[1] ?? "", new RegExp(`/buscar/2026/SP/${electionId}/candidato/${identity.sqCandidato}$`))
})

test("rejects invalid SQ/UF before opening Chrome and does not echo identifier-like slug", async () => {
  const invalid = { ...identity, slug: "000.000.000-00", uf: "ZZ", sqCandidato: "cpf" }
  let opened = false
  const result = await collectDivulgaCandidateFallback([invalid], async () => {
    opened = true
    throw new Error("should not run")
  })
  assert.equal(opened, false)
  assert.equal(result[0]?.status, "erro")
  assert.equal(result[0]?.motivo, "identidade_seed_invalida")
  assert.equal(result[0]?.slug, "")
  assert.equal(JSON.stringify(result).includes("000.000.000-00"), false)
})

test("returns erro when ordinarias does not uniquely identify the 2026 election", async () => {
  const seen: string[] = []
  const result = await collectDivulgaCandidateFallback([identity], fakeWithClient(
    [[{ id: electionId, ano: 2026 }, { id: "20322002027", ano: 2026 }]], seen, { opened: 0 },
  ))
  assert.equal(result[0]?.status, "erro")
  assert.equal(result[0]?.motivo, "eleicao_2026_nao_resolvida")
  assert.equal(seen.length, 1)
})

test("rejects detail whose official SQ, UF, or election ID does not match the seed request", async () => {
  const seen: string[] = []
  const wrongDetail = {
    id: identity.sqCandidato,
    ufCandidatura: "RJ",
    eleicao: { id: "20322002027", ano: 2026 },
  }
  const [result] = await collectDivulgaCandidateFallback([identity], fakeWithClient(
    [ordinarias, wrongDetail], seen, { opened: 0 },
  ))
  assert.equal(result?.status, "erro")
  assert.equal(result?.motivo, "detalhe_divergente")
  assert.match(result?.source ?? "", /\/buscar\/2026\/SP\/20322002026\/candidato\/250002554080$/)
  assert.equal(result?.sha256_payload, null)
})

test("whitelists requested public fields and excludes CPF and voter title from raw detail", async () => {
  const seen: string[] = []
  const raw = {
    id: identity.sqCandidato,
    ufCandidatura: "SP",
    eleicao: { id: electionId, ano: 2026 },
    cpf: "000.000.000-00",
    tituloEleitor: "000000000000",
    bens: [{ tipoBem: "Casa", descricaoBem: "Imóvel", valorBem: 1_000_000, cpf: "000.000.000-00", tituloEleitor: "000000000000" }],
    totalDeBens: 1_000_000,
    gastoCampanha1T: 42.5,
    eleicoesAnteriores: [{ year: 2022, cargo: "Deputado", partido: "ABC", UF: "SP", situacaoTotalizacao: "Eleito", SQ: "25000123456", cpf: "000.000.000-00" }],
    numeroProcessoPrestContas: "0600000-00.2026.6.26.0000",
  }
  const result = await collectDivulgaCandidateFallback([identity], fakeWithClient(
    [ordinarias, raw], seen, { opened: 0 },
  ))
  assert.equal(result[0]?.status, "ok")
  assert.equal(result[0]?.gastoCampanha1T, 42.5)
  assert.deepEqual(result[0]?.eleicoesAnteriores, [{
    year: 2022, cargo: "Deputado", partido: "ABC", uf: "SP", situacaoTotalizacao: "Eleito", sqCandidato: "25000123456",
  }])
  const serialized = JSON.stringify(result)
  assert.equal(serialized.includes("cpf"), false)
  assert.equal(serialized.includes("tituloEleitor"), false)
  assert.equal(serialized.includes("000.000.000-00"), false)
  assert.equal(serialized.includes("000000000000"), false)
  assert.match(result[0]?.sha256_payload ?? "", /^[a-f0-9]{64}$/)
})

test("reads the current DivulgaCand previous election keys without treating a city code as UF", async () => {
  const detail = {
    id: identity.sqCandidato, ufCandidatura: "SP", eleicao: { id: electionId, ano: 2026 },
    numero: 133, partido: { numero: 13 }, cargo: { codigo: 5 },
    eleicoesAnteriores: [
      { nrAno: 2018, id: "190000614721", idEleicao: "2022802018", sgUe: "RJ", cargo: "Senador", partido: "PSL" },
      { nrAno: 2016, id: "190000011736", idEleicao: "2", sgUe: "60011", cargo: "Prefeito", partido: "PSC" },
    ],
  }
  const [result] = await collectDivulgaCandidateFallback([identity], fakeWithClient(
    [ordinarias, detail], [], { opened: 0 },
  ))
  assert.deepEqual(result?.eleicoesAnteriores?.map(({ year, sqCandidato, uf }) => ({ year, sqCandidato, uf })), [
    { year: 2018, sqCandidato: "190000614721", uf: "RJ" },
    { year: 2016, sqCandidato: "190000011736", uf: null },
  ])
  assert.deepEqual([result?.numeroCandidato, result?.partidoNumero, result?.cargoCodigo], [133, 13, 5])
})

test("derives party changes at candidacy granularity without guessing missing or conflicting years", () => {
  assert.equal(derivePartyChanges(null), null)
  assert.deepEqual(derivePartyChanges([]), [])
  const row = (year: number | null, partido: string | null) => ({
    year, partido, cargo: null, uf: null, situacaoTotalizacao: null, sqCandidato: null,
  })
  assert.deepEqual(derivePartyChanges([
    row(2022, "BBB"), row(2018, "AAA"), row(2020, null), row(2024, "BBB"),
  ]), [{ fromYear: 2018, fromParty: "AAA", toYear: 2022, toParty: "BBB" }])
  assert.deepEqual(derivePartyChanges([
    row(2018, "AAA"), row(2020, "BBB"), row(2020, "CCC"), row(2022, "AAA"),
  ]), [])
})

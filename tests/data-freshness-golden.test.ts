import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { compareCandidacies } from "../scripts/lib/data-freshness/candidaturas"
import type { CandidacyChangeKind, CandidacyRecord, RelevantOffice } from "../scripts/lib/data-freshness/types"

interface FixtureRecord {
  sq: string
  cargo: RelevantOffice
  uf: string | null
  coalition: string
  name: string
  party: string
  status: string
  profile: string | null
}

interface GoldenCase {
  name: string
  official: FixtureRecord[]
  published: FixtureRecord[]
  expected: Partial<Record<CandidacyChangeKind, number>>
}

function expand(record: FixtureRecord): CandidacyRecord {
  return {
    sq_candidato: record.sq,
    cargo: record.cargo,
    uf: record.uf,
    sq_coligacao: record.coalition,
    nome_urna: record.name,
    partido_sigla: record.party,
    situacao_codigo: record.status,
    situacao_descricao: null,
    perfil_slug: record.profile,
  }
}

const fixtures = readFileSync("tests/fixtures/data-freshness/cases.jsonl", "utf8")
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line) as GoldenCase)

test("golden set contém ao menos 20 casos reais versionados", () => {
  assert.ok(fixtures.length >= 20, `esperados >=20 casos, encontrados ${fixtures.length}`)
})

test("todo registro oficial do golden set é rastreável ao snapshot TSE versionado", () => {
  const snapshot = JSON.parse(readFileSync("data/chapas-2026-tse-20260815.json", "utf8")) as {
    chapas: Array<{
      uf: string | null
      cargo_titular: "Presidente" | "Governador"
      sq_coligacao: string
      tse_situacao_titular_codigo: string
      tse_situacao_vice_codigo: string
      titular: { sq_candidato: string | null; nome_urna: string; partido_sigla: string }
      vice: { sq_candidato: string | null; nome_urna: string; partido_sigla: string }
    }>
  }
  const official = new Map<string, FixtureRecord>()
  for (const slate of snapshot.chapas) {
    const pairs = [
      [slate.titular, slate.cargo_titular === "Presidente" ? "PRESIDENTE" : "GOVERNADOR", slate.tse_situacao_titular_codigo],
      [slate.vice, slate.cargo_titular === "Presidente" ? "VICE PRESIDENTE" : "VICE GOVERNADOR", slate.tse_situacao_vice_codigo],
    ] as const
    for (const [person, cargo, status] of pairs) {
      if (!person.sq_candidato) continue
      official.set(person.sq_candidato, {
        sq: person.sq_candidato,
        cargo,
        uf: slate.uf,
        coalition: slate.sq_coligacao,
        name: person.nome_urna,
        party: person.partido_sigla,
        status,
        profile: null,
      })
    }
  }
  for (const fixture of fixtures) {
    for (const record of fixture.official) {
      const source = official.get(record.sq)
      assert.ok(source, `${fixture.name}: SQ ${record.sq} ausente do snapshot`)
      assert.deepEqual(
        { ...record, profile: null },
        source,
        `${fixture.name}: registro oficial diverge do snapshot`,
      )
    }
  }
})

for (const fixture of fixtures) {
  test(`golden: ${fixture.name}`, () => {
    const result = compareCandidacies(fixture.official.map(expand), fixture.published.map(expand))
    const nonZero = Object.fromEntries(Object.entries(result.counts).filter(([, value]) => value > 0))
    assert.deepEqual(nonZero, fixture.expected)
  })
}

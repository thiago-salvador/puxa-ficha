import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"
import { MOCK_CANDIDATOS } from "../src/data/mock"
import { CANDIDATE_ASSERTIONS } from "../scripts/lib/factual-assertions"

interface JsonCandidate {
  slug: string
  cargo_disputado: string
}

function loadJsonCandidates(): JsonCandidate[] {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), "data/candidatos.json"), "utf-8"),
  ) as JsonCandidate[]
}

test("cargo_disputado stays aligned across json, mock and explicit assertions for shared slugs", () => {
  const jsonMap = new Map(loadJsonCandidates().map((candidate) => [candidate.slug, candidate]))
  const mockMap = new Map(MOCK_CANDIDATOS.map((candidate) => [candidate.slug, candidate]))

  const explicitAssertions = CANDIDATE_ASSERTIONS.filter(
    (assertion) => assertion.expected.cargo_disputado !== undefined,
  )
  const sharedAssertions = explicitAssertions.filter(
    (assertion) => jsonMap.has(assertion.slug) && mockMap.has(assertion.slug),
  )

  for (const slug of ["guilherme-derrite", "teresa-surita", "soldado-sampaio"]) {
    assert.ok(
      sharedAssertions.some((assertion) => assertion.slug === slug),
      `o invariante precisa cobrir ${slug}`,
    )
  }

  const mismatches = sharedAssertions.flatMap((assertion) => {
    const expected = assertion.expected.cargo_disputado
    const jsonCargo = jsonMap.get(assertion.slug)?.cargo_disputado
    const mockCargo = mockMap.get(assertion.slug)?.cargo_disputado
    const issues: string[] = []

    if (jsonCargo !== expected) {
      issues.push(`${assertion.slug}: json=${jsonCargo} expected=${expected}`)
    }
    if (mockCargo !== expected) {
      issues.push(`${assertion.slug}: mock=${mockCargo} expected=${expected}`)
    }

    return issues
  })

  assert.deepEqual(
    mismatches,
    [],
    `cargo_disputado divergente entre superfícies canônicas:\n${mismatches.join("\n")}`,
  )
})

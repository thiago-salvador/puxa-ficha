import assert from "node:assert/strict"
import test from "node:test"
import { findContractRegressions, summarizeContract } from "../scripts/audit/check-public-profile-contract"

const rows = [
  { slug: "a", indice: 80, celulas: { dados: "ok" as const, votos: "missing" as const } },
  { slug: "b", indice: 90, celulas: { dados: "ok" as const, votos: "partial" as const } },
]

test("resume dívida integral sem chamar ausência de completude", () => {
  assert.deepEqual(summarizeContract(rows), {
    public_profiles: 2,
    sections: ["dados", "votos"],
    total_missing: 1,
    total_partial: 1,
    missing_by_section: { votos: 1 },
    partial_by_section: { votos: 1 },
    min_score: 80,
    profiles_below_90: 1,
  })
})

test("falha quando uma seção piora mesmo se outras permanecerem iguais", () => {
  const summary = summarizeContract(rows)
  const regressions = findContractRegressions(summary, {
    version: 1,
    public_profiles: 2,
    sections: ["dados", "votos"],
    total_missing: 0,
    total_partial: 1,
    missing_by_section: {},
    partial_by_section: { votos: 1 },
    min_score: 85,
    profiles_below_90: 0,
  })
  assert.deepEqual(regressions, [
    "missing total 1>0",
    "missing votos 1>0",
    "perfis abaixo de 90 1>0",
    "índice mínimo 80<85",
  ])
})

test("falha fechado quando a coorte muda ou uma seção some", () => {
  const summary = summarizeContract(rows.slice(0, 1))
  const regressions = findContractRegressions(summary, {
    version: 1,
    public_profiles: 2,
    sections: ["dados", "programa", "votos"],
    total_missing: 1,
    total_partial: 1,
    missing_by_section: { votos: 1 },
    partial_by_section: { votos: 1 },
    min_score: 80,
    profiles_below_90: 1,
  })
  assert.deepEqual(regressions, ["perfis públicos 1!=2", "seção ausente programa"])
})

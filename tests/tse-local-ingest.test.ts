import assert from "node:assert/strict"
import test from "node:test"
import { withExplicitCohort } from "../scripts/lib/cohort-context"

import {
  HISTORICAL_YEARS,
  historicalUrl,
  officialPackages2026,
  parseCliOptions,
  selectCandidateCohort,
} from "../scripts/tse-local/ingest-tse-local"

test("CLI defaults to dry-run so scheduled runs can measure sources without a profile snapshot", () => {
  const options = parseCliOptions(["--profiles=/tmp/perfis.json"], "/workspace")
  assert.equal(options.mode, "dry-run")
  assert.equal(options.profiles, "/tmp/perfis.json")
  assert.equal(options.candidates, "/workspace/data/candidatos.json")
  assert.deepEqual(options.historicalYears, HISTORICAL_YEARS)
  assert.equal(parseCliOptions([], "/workspace").profiles, null)
  assert.deepEqual(parseCliOptions(["--years=2026", "--profiles=/tmp/perfis.json"], "/workspace").historicalYears, [2026])
  assert.equal(parseCliOptions(["--verified-cache-manifest=/tmp/tse-assets.json"], "/workspace").verifiedCacheManifest, "/tmp/tse-assets.json")
  assert.throws(() => parseCliOptions(["--years=1994", "--profiles=/tmp/perfis.json"]), /eleições pares canônicas/)
})

test("live mode requires a reviewed SHA and rejects ambiguous mode flags", () => {
  assert.throws(() => parseCliOptions(["--profiles=/tmp/perfis.json", "--live"]), /expected-plan-sha/)
  assert.throws(() => parseCliOptions(["--profiles=/tmp/perfis.json", "--live", "--dry-run", `--expected-plan-sha=${"a".repeat(64)}`]), /use --live ou --dry-run/)
  assert.throws(() => parseCliOptions(["--profiles=/tmp/perfis.json", "--apply"]), /opção TSE local desconhecida/)
  assert.equal(parseCliOptions(["--live", `--expected-plan-sha=${"b".repeat(64)}`]).mode, "live")
  const options = parseCliOptions(["--profiles=/tmp/perfis.json", "--live", `--expected-plan-sha=${"b".repeat(64)}`])
  assert.equal(options.mode, "live")
  assert.equal(options.expectedPlanSha, "b".repeat(64))
})

test("official source plan covers biennial canonical history and the three 2026 ZIPs", () => {
  assert.deepEqual(HISTORICAL_YEARS, [1996, 1998, 2000, 2002, 2004, 2006, 2008, 2010, 2012, 2014, 2016, 2018, 2020, 2022, 2024, 2026])
  assert.match(historicalUrl(1996), /\/consulta_cand\/consulta_cand_1996\.zip$/)
  assert.match(historicalUrl(2026), /\/consulta_cand\/consulta_cand_2026\.zip$/)
  assert.throws(() => historicalUrl(1994), /fora do escopo/)
  assert.deepEqual(officialPackages2026().map((item) => item.cacheName), [
    "consulta_cand_2026.zip",
    "bem_candidato_2026.zip",
    "receitas_2026_0_prestacao_de_contas_eleitorais_candidatos_2026.zip",
  ])
  assert.ok(officialPackages2026().every((item) => new URL(item.url).hostname === "cdn.tse.jus.br"))
})

test("one cohort selector intersects public profiles, seed candidates, and explicit context/slugs", () => {
  const profiles = [
    { slug: "candidato-a", id: "1" },
    { slug: "candidato-b", id: "2" },
    { slug: "sem-seed", id: "3" },
  ]
  const candidates = [{ slug: "candidato-a" }, { slug: "candidato-b" }, { slug: "seed-sem-perfil" }]
  const cohort = selectCandidateCohort(profiles, candidates, ["candidato-b"])
  assert.deepEqual(cohort.profiles.map((profile) => profile.slug), ["candidato-b"])
  assert.deepEqual(cohort.candidates.map((candidate) => candidate.slug), ["candidato-b"])
  assert.throws(() => selectCandidateCohort(profiles, candidates, ["sem-seed"]), /fora da coorte pública local/)
  assert.throws(() => selectCandidateCohort([{ slug: "dup", id: "1" }, { slug: "dup", id: "2" }], [{ slug: "dup" }]), /duplicado/)
  const explicit = [{ slug: "candidato-b", nome_completo: "B", nome_urna: "B", cargo_disputado: "Senador" as const, estado: "SP", ids: { camara: null, senado: null, tse_sq_candidato: { "2026": "123456" } } }]
  const constrained = withExplicitCohort(explicit, () => selectCandidateCohort(profiles, candidates))
  assert.deepEqual(constrained.profiles.map((profile) => profile.slug), ["candidato-b"])
})

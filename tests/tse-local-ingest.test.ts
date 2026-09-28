import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { withExplicitCohort } from "../scripts/lib/cohort-context"

import {
  HISTORICAL_YEARS,
  childEnvironment,
  createExecutionId,
  enrichSeedWithDivulga,
  filterPostRoundProfiles,
  historicalFamilyPackages,
  historicalUrl,
  officialPackages2026,
  parseCliOptions,
  main,
  projectedClosure,
  selectCandidateCohort,
  summarizeOpenCells,
} from "../scripts/tse-local/ingest-tse-local"
import type { DivulgaCandidateSummary } from "../scripts/tse-local/divulga-candidate"

test("adds only verified previous SQ links and leaves conflicting curated SQ untouched", () => {
  const seed = [{ slug: "president", cargo_disputado: "Presidente", estado: "RJ", ids: {
    tse_sq_candidato: { "2026": "280002551544", "2018": "190000614721" },
  } }]
  const summary = {
    status: "ok", slug: "president", ano: 2026, uf: "BR", sqCandidato: "280002551544",
    source: "https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/BR/20322002026/candidato/280002551544",
    sha256_payload: "a".repeat(64), eleicoesAnteriores: [
      { year: 2018, sqCandidato: "190000614721", uf: "RJ", cargo: "Senador", partido: "PSL", situacaoTotalizacao: null },
      { year: 2016, sqCandidato: "190000011736", uf: null, cargo: "Prefeito", partido: "PSC", situacaoTotalizacao: null },
      { year: 2014, sqCandidato: "190000000095", uf: "RJ", cargo: "Deputado", partido: "PP", situacaoTotalizacao: null },
    ],
  } as DivulgaCandidateSummary
  const result = enrichSeedWithDivulga(seed, [summary])
  const ids = result.candidates[0]?.ids as { tse_sq_candidato: Record<string, string>; tse_uf_candidatura: Record<string, string>; tse_divulga_prior_uf: Record<string, string> }
  assert.equal(ids.tse_sq_candidato["2016"], "190000011736")
  assert.equal(ids.tse_uf_candidatura["2014"], "RJ")
  assert.equal(ids.tse_sq_candidato["2018"], "190000614721")
  assert.equal(ids.tse_divulga_prior_uf["2018"], "RJ")
  assert.equal(ids.tse_divulga_prior_uf["2016"], undefined)
  assert.deepEqual(result.conflicts, [])
  const conflict = enrichSeedWithDivulga([{ ...seed[0], ids: { tse_sq_candidato: { "2026": "280002551544", "2018": "99999" } } }], [summary])
  assert.deepEqual(conflict.conflicts, [{ slug: "president", year: 2018 }])
  assert.equal((conflict.candidates[0]?.ids as { tse_sq_candidato: Record<string, string> }).tse_sq_candidato["2018"], "99999")
  assert.equal((conflict.candidates[0]?.ids as { tse_divulga_prior_uf: Record<string, string> }).tse_divulga_prior_uf["2018"], undefined)
  assert.equal(enrichSeedWithDivulga(seed, [{ ...summary, sqCandidato: "12345" }]).candidates[0], seed[0])
})

test("apply projection counts only post-write matches and preserves annual confirmed zero", () => {
  const root = mkdtempSync(join(tmpdir(), "tse-projection-"))
  try {
    const planDir = join(root, "plan")
    mkdirSync(planDir)
    writeFileSync(join(planDir, "plano-1.json"), JSON.stringify({ planned: [{ alvo: "history", familia: "historico_politico", fonte: "tse-historico" }] }))
    const cells = join(root, "cells.jsonl")
    writeFileSync(cells, ["history|historico_politico", "wealth|patrimonio", "finance|financiamento", "risk|financiamento", "party|mudancas_partido"].map((key) => {
      const [slug, familia] = key.split("|")
      return JSON.stringify({ slug, familia })
    }).join("\n"))
    const family = join(root, "family.json")
    const history = join(root, "history.json")
    const party = join(root, "party.json")
    const projection = join(root, "projection.json")
    writeFileSync(family, JSON.stringify({ diagnostics: [{ slug: "wealth", family: "patrimonio", reason: "official_row_missing_or_identity_mismatch" }] }))
    writeFileSync(history, JSON.stringify({ receipts: [] }))
    writeFileSync(party, JSON.stringify({ receipts: [{ alvo: "party", fonte: "tse-partido-candidatura", resultado: "indeterminado", detalhe: JSON.stringify({ motivo: "transições públicas não derivam da sequência oficial de partidos por candidatura" }) }] }))
    writeFileSync(projection, JSON.stringify({ apply_projection: [
      { slug: "finance", family: "financiamento", writer_actions: ["atualizar_financiamento"], post_write_readback_matches: true, reason: "ok" },
      { slug: "risk", family: "financiamento", writer_actions: ["atualizar_financiamento"], post_write_readback_matches: true, reason: "ok" },
    ] }))
    const official = [{ slug: "wealth", status: "ok", bens: [], totalDeBens: 0, source: "https://divulgacandcontas.tse.jus.br/fixture" }] as unknown as DivulgaCandidateSummary[]
    const profiles = [{ slug: "wealth", patrimonio: [], patrimonio_eleicoes: [{ ano: 2026, estado: "vazio_confirmado", fonte_url: "https://cdn.tse.jus.br/fixture" }] }]
    const result = projectedClosure(summarizeOpenCells(cells, null), [planDir], projection, family, history, official, profiles, new Set(["risk"]), party)
    assert.equal(result.closed_now, 1)
    assert.equal(result.projected_after_safe_write, 1)
    assert.equal(result.by_source["tse-patrimonio"]?.scope_vazio_confirmado_2026, 1)
    assert.equal(result.by_source["tse-financiamento"]?.identity_review, 1)
    assert.equal(result.by_source["tse-partido-candidatura"]?.scope_rule_review, 1)
    assert.equal(result.cells.find((row) => row.slug === "finance")?.post_write_readback_matches, true)
    assert.equal(result.cells.find((row) => row.slug === "history")?.writer_status, "no_audited_domain_writer")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

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
  assert.throws(() => parseCliOptions(["--live", `--expected-plan-sha=${"b".repeat(64)}`]), /recibos de família e histórico/)
  const pinned = ["--live", `--expected-plan-sha=${"b".repeat(64)}`,
    `--expected-plan-file-sha=${"e".repeat(64)}`, `--expected-report-sha=${"f".repeat(64)}`,
    `--expected-family-sha=${"c".repeat(64)}`, `--expected-history-sha=${"d".repeat(64)}`,
    `--expected-cohort-sha=${"1".repeat(64)}`, `--expected-projection-sha=${"2".repeat(64)}`,
    "--reviewed-run-dir=/tmp/reviewed", "--recibos=/tmp/recibos.json"]
  assert.equal(parseCliOptions(pinned).mode, "live")
  const options = parseCliOptions(["--profiles=/tmp/perfis.json", ...pinned])
  assert.equal(options.mode, "live")
  assert.equal(options.expectedPlanSha, "b".repeat(64))
  assert.equal(options.expectedFamilySha, "c".repeat(64))
  assert.equal(options.expectedHistorySha, "d".repeat(64))
  assert.equal(options.expectedCohortSha, "1".repeat(64))
  assert.equal(options.expectedProjectionSha, "2".repeat(64))
  assert.equal(options.recibos, "/tmp/recibos.json")
})

test("dry-run fails closed before acquisition without post-round receipts", async () => {
  await assert.rejects(() => main(["--dry-run", "--out-dir=/tmp/never-created-local-tse-test"]), /recibos=.*obrigatório/)
})

test("official source plan covers biennial canonical history and the three 2026 ZIPs", () => {
  assert.deepEqual(HISTORICAL_YEARS, [1996, 1998, 2000, 2002, 2004, 2006, 2008, 2010, 2012, 2014, 2016, 2018, 2020, 2022, 2024, 2026])
  assert.match(historicalUrl(1996), /\/consulta_cand\/consulta_cand_1996\.zip$/)
  assert.match(historicalUrl(2026), /\/consulta_cand\/consulta_cand_2026\.zip$/)
  assert.throws(() => historicalUrl(1994), /fora do escopo/)
  assert.deepEqual(historicalFamilyPackages(2000), [])
  assert.deepEqual(historicalFamilyPackages(2002).map((item) => item.family), ["financiamento"])
  assert.match(historicalFamilyPackages(2002)[0]!.url, /\/prestacao_contas\/prestacao_contas_2002\.zip$/)
  assert.deepEqual(historicalFamilyPackages(2006).map((item) => item.family), ["patrimonio", "financiamento"])
  assert.match(historicalFamilyPackages(2012).find((item) => item.family === "financiamento")!.url, /\/prestacao_final_2012\.zip$/)
  assert.deepEqual(historicalFamilyPackages(2026), [])
  assert.throws(() => historicalFamilyPackages(1994), /fora do escopo/)
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

test("every local step receives only post-round eligible profiles", () => {
  const profiles = [{ slug: "open", id: "1" }, { slug: "closed", id: "2" }]
  const receipts = { atualizacao_encerrada: [{ slug: "closed", atualizacao_encerrada_em: "2026-10-04" }] }
  assert.deepEqual(filterPostRoundProfiles(profiles, receipts), [profiles[0]])
  assert.deepEqual(selectCandidateCohort(filterPostRoundProfiles(profiles, receipts), [{ slug: "open" }, { slug: "closed" }]).candidates.map((row) => row.slug), ["open"])
  assert.deepEqual(parseCliOptions(["--slugs=open"]).slugs, ["open"])
})

test("every subprocess gets only the declared environment fields", () => {
  assert.deepEqual(childEnvironment({ NODE_ENV: "test", PATH: "/bin", SUPABASE_URL: "https://example.test", PF_TSE_COHORT_PROFILES: "/tmp/cohort.json", UNRELATED_SECRET: "private" }),
    { NODE_ENV: "test", PATH: "/bin", SUPABASE_URL: "https://example.test", PF_TSE_COHORT_PROFILES: "/tmp/cohort.json" })
})

test("same-second runs receive distinct execution IDs", () => {
  const when = new Date("2026-09-27T12:00:00.000Z")
  const first = createExecutionId(when)
  const second = createExecutionId(when)
  assert.notEqual(first, second)
  assert.match(first, /^tse-local-20260927T120000000Z-[a-f0-9-]{36}$/)
})

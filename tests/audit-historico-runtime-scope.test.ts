/**
 * Testes do dual-scope do audit runtime (Fase 3 §11.D).
 *
 * Cobertura:
 *  - `loadCohortSlugs` lê seed JSON e devolve conjunto de slugs.
 *  - `filterCohortCandidatos` devolve apenas candidatos da coorte.
 *  - `filterCohortCandidatos` com coorte vazia é identidade (fallback defensivo).
 *  - `groupHistoricoByCandidato` agrupa rows por `candidato_id`.
 *  - `buildScopeBlock` conta linhas, candidatos com historico e display issues
 *    corretamente para o recorte dado.
 *  - `parseScopeFlag` aceita `cohort`, `db`, `db_total`, `both` e devolve `null`
 *    em todos os outros casos.
 *  - `shouldGateFail` obedece à semântica documentada de cada escopo.
 *
 * Nenhum teste aqui toca Supabase — todas as funções são puras.
 */

import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  buildScopeBlock,
  filterCohortCandidatos,
  groupHistoricoByCandidato,
  loadCohortSlugs,
  parseScopeFlag,
  shouldGateFail,
  type CandidatoLike,
  type DisplayAuditLike,
  type ScopeBlock,
} from "../scripts/lib/historico-runtime-scope"

function withTempDir(run: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "pf-scope-test-"))
  try {
    run(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe("historico-runtime-scope — loadCohortSlugs", () => {
  it("lê seed JSON válido e devolve Set com todos os slugs", () => {
    withTempDir((dir) => {
      const seedPath = join(dir, "seed.json")
      const seed = [
        { slug: "lula", nome_urna: "Lula" },
        { slug: "bolsonaro", nome_urna: "Bolsonaro" },
        { slug: "ciro-gomes", nome_urna: "Ciro" },
      ]
      writeFileSync(seedPath, JSON.stringify(seed), "utf8")
      const slugs = loadCohortSlugs(seedPath)
      assert.equal(slugs.size, 3)
      assert.ok(slugs.has("lula"))
      assert.ok(slugs.has("bolsonaro"))
      assert.ok(slugs.has("ciro-gomes"))
    })
  })

  it("ignora entradas sem slug válido (string vazia, null, ausente)", () => {
    withTempDir((dir) => {
      const seedPath = join(dir, "seed.json")
      const seed = [
        { slug: "lula" },
        { slug: "" },
        { slug: null },
        {},
        { slug: "ciro" },
      ]
      writeFileSync(seedPath, JSON.stringify(seed), "utf8")
      const slugs = loadCohortSlugs(seedPath)
      assert.equal(slugs.size, 2)
      assert.ok(slugs.has("lula"))
      assert.ok(slugs.has("ciro"))
    })
  })

  it("devolve Set vazio quando o seed não existe", () => {
    const slugs = loadCohortSlugs("/tmp/definitely-does-not-exist-12345.json")
    assert.equal(slugs.size, 0)
  })

  it("devolve Set vazio quando o seed tem JSON inválido", () => {
    withTempDir((dir) => {
      const seedPath = join(dir, "seed.json")
      writeFileSync(seedPath, "{ this is not json }", "utf8")
      const slugs = loadCohortSlugs(seedPath)
      assert.equal(slugs.size, 0)
    })
  })
})

describe("historico-runtime-scope — filterCohortCandidatos", () => {
  const candidatos: CandidatoLike[] = [
    { id: "id-1", slug: "lula" },
    { id: "id-2", slug: "bolsonaro" },
    { id: "id-3", slug: "ciro-gomes" },
    { id: "id-4", slug: "legacy-slug" },
  ]

  it("devolve apenas candidatos cujo slug está na coorte", () => {
    const cohort = new Set(["lula", "ciro-gomes"])
    const filtered = filterCohortCandidatos(candidatos, cohort)
    assert.equal(filtered.length, 2)
    assert.deepEqual(
      filtered.map((c) => c.slug),
      ["lula", "ciro-gomes"],
    )
  })

  it("devolve lista inalterada quando a coorte é vazia (fallback defensivo)", () => {
    const cohort = new Set<string>()
    const filtered = filterCohortCandidatos(candidatos, cohort)
    assert.equal(filtered.length, candidatos.length)
    assert.deepEqual(filtered, candidatos)
  })

  it("preserva a ordem de entrada", () => {
    const cohort = new Set(["bolsonaro", "lula", "ciro-gomes"])
    const filtered = filterCohortCandidatos(candidatos, cohort)
    assert.deepEqual(
      filtered.map((c) => c.slug),
      ["lula", "bolsonaro", "ciro-gomes"],
    )
  })

  it("não muta a lista original", () => {
    const cohort = new Set(["lula"])
    const before = [...candidatos]
    const filtered = filterCohortCandidatos(candidatos, cohort)
    assert.notStrictEqual(filtered, candidatos)
    assert.deepEqual(candidatos, before)
  })
})

describe("historico-runtime-scope — groupHistoricoByCandidato", () => {
  it("agrupa linhas por candidato_id", () => {
    const rows = [
      { candidato_id: "id-1", cargo: "Deputado Federal" },
      { candidato_id: "id-2", cargo: "Senador" },
      { candidato_id: "id-1", cargo: "Vereador" },
      { candidato_id: "id-3", cargo: "Governador" },
      { candidato_id: "id-1", cargo: "Prefeito" },
    ]
    const grouped = groupHistoricoByCandidato(rows)
    assert.equal(grouped.size, 3)
    assert.equal(grouped.get("id-1")?.length, 3)
    assert.equal(grouped.get("id-2")?.length, 1)
    assert.equal(grouped.get("id-3")?.length, 1)
  })

  it("devolve Map vazio para lista vazia", () => {
    const grouped = groupHistoricoByCandidato([])
    assert.equal(grouped.size, 0)
  })
})

describe("historico-runtime-scope — buildScopeBlock", () => {
  const candidatosCohort: CandidatoLike[] = [
    { id: "id-1", slug: "lula" },
    { id: "id-2", slug: "bolsonaro" },
    { id: "id-3", slug: "ciro-gomes" },
  ]
  const candidatosDbTotal: CandidatoLike[] = [
    ...candidatosCohort,
    { id: "id-legacy-1", slug: "marina-silva" },
    { id: "id-legacy-2", slug: "simone-tebet" },
  ]

  const historicoByCandidato = new Map<string, Array<{ candidato_id: string; cargo: string }>>([
    ["id-1", [
      { candidato_id: "id-1", cargo: "Presidente" },
      { candidato_id: "id-1", cargo: "Deputado Federal" },
    ]],
    ["id-2", [
      { candidato_id: "id-2", cargo: "Presidente" },
    ]],
    // id-3 (ciro-gomes) sem historico — espelha slugs da coorte sem rows
    ["id-legacy-1", [
      { candidato_id: "id-legacy-1", cargo: "Senadora" },
      { candidato_id: "id-legacy-1", cargo: "Ministra do Meio Ambiente" },
    ]],
    ["id-legacy-2", [
      { candidato_id: "id-legacy-2", cargo: "Senadora" },
    ]],
  ])

  const displayIssuesBySlug = new Map<string, DisplayAuditLike>([
    ["bolsonaro", { counts: { alta: 1, media: 0, baixa: 0 } }],
    ["marina-silva", { counts: { alta: 0, media: 2, baixa: 0 } }],
    ["simone-tebet", { counts: { alta: 0, media: 0, baixa: 1 } }],
  ])

  it("bloco cohort conta apenas historico de slugs da coorte", () => {
    const block = buildScopeBlock(candidatosCohort, historicoByCandidato, displayIssuesBySlug)
    assert.equal(block.size, 3)
    assert.equal(block.total_historico_rows, 3, "2 rows de lula + 1 row de bolsonaro")
    assert.equal(block.total_candidatos_com_historico, 2, "só lula e bolsonaro")
    assert.deepEqual(block.display_issue_candidates.alta, ["bolsonaro"])
    assert.deepEqual(block.display_issue_candidates.media, [])
    assert.deepEqual(block.display_issue_candidates.baixa, [])
  })

  it("bloco db_total conta historico de todos os candidatos", () => {
    const block = buildScopeBlock(candidatosDbTotal, historicoByCandidato, displayIssuesBySlug)
    assert.equal(block.size, 5)
    assert.equal(block.total_historico_rows, 6, "3 cohort + 3 legacy (2 + 1)")
    assert.equal(block.total_candidatos_com_historico, 4)
    assert.deepEqual(block.display_issue_candidates.alta, ["bolsonaro"])
    assert.deepEqual(block.display_issue_candidates.media, ["marina-silva"])
    assert.deepEqual(block.display_issue_candidates.baixa, ["simone-tebet"])
  })

  it("display_issue_candidates é ordenado alfabeticamente", () => {
    const candidatos: CandidatoLike[] = [
      { id: "z", slug: "zeze" },
      { id: "a", slug: "alice" },
      { id: "m", slug: "maria" },
    ]
    const issues = new Map<string, DisplayAuditLike>([
      ["zeze", { counts: { alta: 1, media: 0, baixa: 0 } }],
      ["alice", { counts: { alta: 1, media: 0, baixa: 0 } }],
      ["maria", { counts: { alta: 1, media: 0, baixa: 0 } }],
    ])
    const block = buildScopeBlock(candidatos, new Map(), issues)
    assert.deepEqual(block.display_issue_candidates.alta, ["alice", "maria", "zeze"])
  })

  it("escopo vazio devolve tudo zerado", () => {
    const block = buildScopeBlock([], historicoByCandidato, displayIssuesBySlug)
    assert.equal(block.size, 0)
    assert.equal(block.total_historico_rows, 0)
    assert.equal(block.total_candidatos_com_historico, 0)
    assert.deepEqual(block.display_issue_candidates.alta, [])
  })
})

describe("historico-runtime-scope — parseScopeFlag", () => {
  it("cohort", () => {
    assert.equal(parseScopeFlag(["--scope=cohort"]), "cohort")
  })
  it("db (alias)", () => {
    assert.equal(parseScopeFlag(["--scope=db"]), "db_total")
  })
  it("db_total", () => {
    assert.equal(parseScopeFlag(["--scope=db_total"]), "db_total")
  })
  it("both", () => {
    assert.equal(parseScopeFlag(["--scope=both"]), "both")
  })
  it("valor inválido devolve null", () => {
    assert.equal(parseScopeFlag(["--scope=xpto"]), null)
  })
  it("sem flag devolve null", () => {
    assert.equal(parseScopeFlag(["--json", "--fail-on-display-issues"]), null)
  })
  it("case-insensitive", () => {
    assert.equal(parseScopeFlag(["--scope=COHORT"]), "cohort")
    assert.equal(parseScopeFlag(["--scope=Both"]), "both")
  })
})

describe("historico-runtime-scope — shouldGateFail", () => {
  const clean: ScopeBlock = {
    size: 0,
    total_historico_rows: 0,
    total_candidatos_com_historico: 0,
    display_issue_candidates: { alta: [], media: [], baixa: [] },
  }
  const cohortIssues: ScopeBlock = {
    ...clean,
    display_issue_candidates: { alta: ["lula"], media: [], baixa: [] },
  }
  const dbIssues: ScopeBlock = {
    ...clean,
    display_issue_candidates: { alta: [], media: ["marina-silva"], baixa: [] },
  }

  it("null (sem flag): falha se qualquer bloco tem issues", () => {
    assert.equal(shouldGateFail(null, clean, clean), false)
    assert.equal(shouldGateFail(null, cohortIssues, clean), true)
    assert.equal(shouldGateFail(null, clean, dbIssues), true)
  })

  it("cohort: falha só se o bloco cohort tem issues", () => {
    assert.equal(shouldGateFail("cohort", clean, dbIssues), false)
    assert.equal(shouldGateFail("cohort", cohortIssues, clean), true)
  })

  it("db_total: falha só se o bloco db_total tem issues", () => {
    assert.equal(shouldGateFail("db_total", cohortIssues, clean), false)
    assert.equal(shouldGateFail("db_total", clean, dbIssues), true)
  })

  it("both: falha se qualquer bloco tem issues", () => {
    assert.equal(shouldGateFail("both", clean, clean), false)
    assert.equal(shouldGateFail("both", cohortIssues, clean), true)
    assert.equal(shouldGateFail("both", clean, dbIssues), true)
    assert.equal(shouldGateFail("both", cohortIssues, dbIssues), true)
  })
})

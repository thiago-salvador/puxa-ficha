import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { describe, test } from "node:test"

const API_PATH = "src/lib/api.ts"
const PROFILE_PATH = "src/components/CandidatoProfile.tsx"
const ROUTE_PATH = "src/app/api/candidato-profile/[slug]/projetos-lei/route.ts"

describe("inventário de projetos de lei sob demanda", () => {
  test("a ficha inicial limita projetos e preserva a contagem exata", async () => {
    const source = await readFile(API_PATH, "utf8")
    const initialQuery = source.slice(
      source.indexOf("withSupabaseRetry(`projetos_lei(${slug})`"),
      source.indexOf("withSupabaseRetry(`legislacao_mandato_executivo(${slug})`"),
    )

    assert.match(initialQuery, /select\(PROJETOS_LEI_COLUNAS, \{ count: "exact" \}\)/)
    assert.match(initialQuery, /\.limit\(25\)/)
    assert.match(source, /projetos_lei_total: projetos\.count/)
    assert.match(source, /projetos_lei_truncados:/)
  })

  test("as duas queries de projetos_lei nunca voltam a puxar colunas mortas", async () => {
    const source = await readFile(API_PATH, "utf8")
    const colunas = source.match(/const PROJETOS_LEI_COLUNAS =\s*\n?\s*"([^"]+)"/)

    assert.ok(colunas, "PROJETOS_LEI_COLUNAS precisa existir como lista explícita de colunas")
    const lista = colunas[1].split(",").map((c) => c.trim())

    // `metadata` (jsonb) é 60% do peso da tabela e não é lido em lugar nenhum;
    // `coverage_scope` e `created_at` também não. Puxá-los de volta reintroduz a
    // cauda de latência que encostava no statement_timeout de 3s do role `anon`.
    for (const morta of ["metadata", "coverage_scope", "created_at"]) {
      assert.ok(!lista.includes(morta), `coluna ${morta} não deve voltar ao select de projetos_lei`)
    }
    // Campos que a ficha e o DTO público realmente consomem.
    for (const viva of ["id", "tipo", "numero", "ano", "ementa", "situacao", "destaque", "coverage_id"]) {
      assert.ok(lista.includes(viva), `coluna ${viva} é consumida e precisa continuar no select`)
    }
    // Nenhuma das duas queries pode voltar para o select estrela.
    assert.doesNotMatch(source, /\.from\("projetos_lei"\)\s*\n\s*\.select\("\*"/)
  })

  test("o endpoint público limita cada página a 100 e sanitiza a saída", async () => {
    const [api, route] = await Promise.all([
      readFile(API_PATH, "utf8"),
      readFile(ROUTE_PATH, "utf8"),
    ])

    assert.match(api, /const safeLimit = Math\.min\(100,/)
    assert.match(api, /\.range\(safeOffset, safeOffset \+ safeLimit - 1\)/)
    assert.match(route, /toPublicProjetosLeiDto\(resource\.data\.rows\)/)
    assert.doesNotMatch(route, /createServiceRoleSupabaseClient/)
  })

  test("o cliente só busca todas as páginas quando Legislação é aberta", async () => {
    const [source, sections] = await Promise.all([
      readFile(PROFILE_PATH, "utf8"),
      readFile("src/components/LegislationTabSection.tsx", "utf8"),
    ])

    assert.match(source, /activeTab !== "legislacao"/)
    assert.match(source, /while \(offset < total\)/)
    assert.match(source, /projetos_lei_fetch_incomplete/)
    assert.match(sections, /projetosLeiLoadState === "failed"/)
  })
})

import assert from "node:assert/strict"
import test from "node:test"
import { buildPatrimonioWriterPlan } from "../scripts/audit/plan-patrimonio-writers-local"

const asset = {
  family: "patrimonio",
  year: 2022,
  path: "/private/fixture.zip",
  url: "https://cdn.tse.jus.br/consulta/bem_candidato_2022.zip",
  sha256: "a".repeat(64),
  bytes: 100,
}
const candidate = {
  slug: "candidate-fixture",
  ids: {
    tse_sq_candidato: { "2022": "SQ-2022" },
    tse_uf_candidatura: { "2022": "SP" },
  },
}
const source = {
  ANO_ELEICAO: "2022",
  SQ_CANDIDATO: "SQ-2022",
  SG_UF: "SP",
  NR_ORDEM_BEM_CANDIDATO: "1",
  DS_TIPO_BEM_CANDIDATO: "Casa",
  DS_BEM_CANDIDATO: "Imóvel residencial",
  VR_BEM_CANDIDATO: "125.000,00",
  NM_TIPO_ELEICAO: "ELEIÇÃO ORDINÁRIA",
  __member: "bem_candidato_2022_BRASIL.csv",
}
const history = {
  ANO_ELEICAO: "2022",
  SQ_CANDIDATO: "SQ-2022",
  SG_UF: "SP",
  DS_CARGO: "SENADOR",
  NM_TIPO_ELEICAO: "ELEIÇÃO ORDINÁRIA",
  __member: "consulta_cand_2022_BRASIL.csv",
}
const otherContext = {
  id: "row-other",
  ano_eleicao: 2022,
  sq_candidato: "SQ-OTHER",
  uf_candidatura: "RJ",
  cargo_candidatura: "Deputado Federal",
  tipo_eleicao: "ELEIÇÃO ORDINÁRIA",
  valor_total: 20,
  bens: [{ tipo: "Terreno", descricao: "Contexto independente", valor: 20 }],
}
const existingTarget = {
  id: "row-target",
  ano_eleicao: 2022,
  ano_arquivo: 2022,
  sq_candidato: "SQ-2022",
  uf_candidatura: "SP",
  cargo_candidatura: "Deputado Estadual",
  tipo_eleicao: "ELEIÇÃO ORDINÁRIA",
  valor_total: 1,
  bens: [{ tipo: "Casa", descricao: "Registro antigo", valor: 1 }],
}

function fixture(overrides: Record<string, unknown> = {}) {
  const input = {
    sourceComplete: true,
    candidates: [candidate],
    profiles: [{
      id: "candidate-id",
      slug: candidate.slug,
      patrimonio: [existingTarget, otherContext],
      patrimonio_eleicoes: [{
        ano: 2022,
        estado: "publicado",
        fonte_url: "https://cdn.tse.jus.br/old.zip",
        verificado_em: "2025-01-01T00:00:00.000Z",
        contextos: [{ ano_eleicao: 2022, sq_candidato: "SQ-OTHER", uf_candidatura: "RJ", estado: "publicado" }],
      }],
    }],
    cells: [{ slug: candidate.slug, family: "patrimonio", category: "stale_not_projected" }],
    riskSlugs: [],
    assets: [asset],
    checkedAt: "2026-09-27T12:00:00.000Z",
    rowsByAsset: new Map([["patrimonio|2022", [source]]]),
    historyByContext: new Map([["2022|SQ-2022|SP", [history]]]),
    ...overrides,
  }
  return input as Parameters<typeof buildPatrimonioWriterPlan>[0]
}

test("builds exact per-year replacements and preserves another same-year context", () => {
  const result = buildPatrimonioWriterPlan(fixture())
  assert.equal(result.acoes.length, 1)
  const action = result.acoes[0]
  assert.equal(action.tipo, "substituir_patrimonio")
  assert.equal(action.match_mode, "exact_context")
  assert.equal(action.candidato_id, "candidate-id")
  assert.equal(action.ano_eleicao, 2022)
  assert.equal(action.antes_sha256?.toString().length, 64)
  assert.deepEqual(action.antes_publico, [{
    id: "row-target",
    ano_eleicao: 2022,
    ano_arquivo: 2022,
    sq_candidato: "SQ-2022",
    uf_candidatura: "SP",
    cargo_candidatura: "Deputado Estadual",
    tipo_eleicao: "ELEIÇÃO ORDINÁRIA",
    valor_total: 1,
    bens: [{ tipo: "Casa", descricao: "Registro antigo", valor: 1 }],
  }])
  assert.equal((action.depois as Record<string, unknown>).cargo_candidatura, "Senador")
  assert.equal((action.depois as Record<string, unknown>).tipo_eleicao, "ELEIÇÃO ORDINÁRIA")
  assert.equal((action.depois as Record<string, unknown>).valor_total, 125000)
  assert.equal((action.serie as Record<string, unknown>).estado, "publicado")
  const contexts = (action.serie as { contextos: Array<Record<string, unknown>> }).contextos
  assert.equal(contexts.length, 2)
  assert.equal(contexts.some((context) => context.sq_candidato === "SQ-OTHER"), true)
  assert.equal(contexts.some((context) => context.sq_candidato === "SQ-2022"), true)
})

test("keeps identity-risk and rule-scope cells out of the write plan", () => {
  const result = buildPatrimonioWriterPlan(fixture({
    cells: [
      { slug: candidate.slug, family: "patrimonio", category: "stale_not_projected" },
      { slug: "identity-fixture", family: "patrimonio", category: "identity_review" },
      { slug: "outside-fixture", family: "patrimonio", category: "scope_outside_supported_series" },
    ],
    riskSlugs: [candidate.slug, "identity-fixture"],
  }))
  assert.equal(result.acoes.length, 0)
  assert.equal(result.resumo.perfis_seguros, 0)
})

test("routes duplicate target contexts to review and never overwrites them", () => {
  const result = buildPatrimonioWriterPlan(fixture({
    profiles: [{
      id: "candidate-id",
      slug: candidate.slug,
      patrimonio: [existingTarget, { ...existingTarget, id: "row-target-duplicate" }, otherContext],
      patrimonio_eleicoes: [{ ano: 2022, estado: "publicado" }],
    }],
  }))
  assert.equal(result.acoes.length, 0)
  assert.equal(result.revisao.some((item) => item.motivo === "duplicate_exact_year_context"), true)
})

test("uses a unique same-year public row as a guarded pre-image when context IDs are absent", () => {
  const publicRowWithoutContext = {
    id: "row-public-year",
    ano_eleicao: 2022,
    ano_arquivo: 2022,
    cargo_candidatura: "Deputado Estadual",
    tipo_eleicao: "ELEIÇÃO ORDINÁRIA",
    valor_total: 1,
    bens: [{ tipo: "Casa", descricao: "Registro anterior", valor: 1 }],
  }
  const result = buildPatrimonioWriterPlan(fixture({
    profiles: [{ id: "candidate-id", slug: candidate.slug, patrimonio: [publicRowWithoutContext], patrimonio_eleicoes: [] }],
  }))
  assert.equal(result.acoes.length, 1)
  const action = result.acoes[0]!
  assert.equal(action.match_mode, "unique_year_public")
  assert.deepEqual(action.antes_publico, [publicRowWithoutContext])
  assert.equal((action.serie as { contextos: Array<Record<string, unknown>> }).contextos.length, 1)
  assert.equal(((action.serie as { contextos: Array<Record<string, unknown>> }).contextos[0]!).sq_candidato, "SQ-2022")
})

test("keeps document-like sequences masked in the private pre-image", () => {
  const rowWithDocumentLikeText = {
    ...existingTarget,
    bens: [{ tipo: "Casa", descricao: "Registro 12345678901", valor: 1 }],
  }
  const result = buildPatrimonioWriterPlan(fixture({
    profiles: [{ id: "candidate-id", slug: candidate.slug, patrimonio: [rowWithDocumentLikeText], patrimonio_eleicoes: [] }],
  }))
  assert.equal(result.acoes.length, 1)
  const before = (result.acoes[0]!.antes_publico as Array<{ bens: Array<{ descricao: string }> }>)[0]!
  assert.equal(before.bens[0]!.descricao.includes("12345678901"), false)
  assert.equal(before.bens[0]!.descricao.includes("[documento mascarado]"), true)
})

test("routes ambiguous same-year public rows without target context IDs to review", () => {
  const row = { ...existingTarget, sq_candidato: undefined, uf_candidatura: undefined }
  const result = buildPatrimonioWriterPlan(fixture({
    profiles: [{ id: "candidate-id", slug: candidate.slug, patrimonio: [row, { ...row, id: "row-duplicate" }], patrimonio_eleicoes: [] }],
  }))
  assert.equal(result.acoes.length, 0)
  assert.equal(result.revisao.some((item) => item.motivo === "ambiguous_public_year_context"), true)
})

test("does not use a unique-year row whose stored context conflicts with the official SQ or UF", () => {
  const conflicting = { ...existingTarget, sq_candidato: "SQ-OTHER", uf_candidatura: "SP" }
  const result = buildPatrimonioWriterPlan(fixture({
    profiles: [{ id: "candidate-id", slug: candidate.slug, patrimonio: [conflicting], patrimonio_eleicoes: [] }],
  }))
  assert.equal(result.acoes.length, 0)
  assert.equal(result.revisao.some((item) => item.motivo === "public_year_context_identity_conflict"), true)
})

test("does not infer an absence write from an empty TSE context", () => {
  const result = buildPatrimonioWriterPlan(fixture({ rowsByAsset: new Map([["patrimonio|2022", []]]) }))
  assert.equal(result.acoes.length, 0)
  assert.equal(result.revisao.length, 0)
})

test("treats official election type spelling differences as equivalent", () => {
  const result = buildPatrimonioWriterPlan(fixture({
    rowsByAsset: new Map([["patrimonio|2022", [{ ...source, NM_TIPO_ELEICAO: "Eleição Ordinária" }]]]),
  }))
  assert.equal(result.acoes.length, 1)
  assert.equal((result.acoes[0]!.depois as Record<string, unknown>).tipo_eleicao, "ELEIÇÃO ORDINÁRIA")
})

test("uses the canonical TSE legacy marker normalization for patrimônio text", () => {
  const result = buildPatrimonioWriterPlan(fixture({
    rowsByAsset: new Map([["patrimonio|2022", [{ ...source, DS_BEM_CANDIDATO: "Imóvel¿ residencial" }]]]),
  }))
  assert.equal(result.acoes.length, 1)
  assert.equal(((result.acoes[0]!.depois as { bens: Array<{ descricao: string }> }).bens[0]!).descricao, "Imóvel - residencial")
})

test("patrimônio com valor vazio ou linha truncada fica em revisão", () => {
  for (const bad of [{ ...source, VR_BEM_CANDIDATO: "" }, { ...source, __truncated_row: "1" }]) {
    const result = buildPatrimonioWriterPlan(fixture({ rowsByAsset: new Map([["patrimonio|2022", [bad]]]) }))
    assert.equal(result.acoes.length, 0)
    assert.ok(result.revisao.some((row) => row.motivo === "official_asset_row_truncated_or_amount_missing"))
  }
})

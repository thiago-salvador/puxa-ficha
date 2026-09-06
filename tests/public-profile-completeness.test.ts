import assert from "node:assert/strict"
import test from "node:test"

import {
  analyzePublicProfileCompleteness,
  fetchJson,
  runPublicProfileCompletenessAudit,
} from "../scripts/audit/audit-public-profile-completeness"

const completeCore = {
  status: "candidato",
  partido_sigla: "PSTU",
  situacao_candidatura: "aguardando julgamento",
  foto_url: "https://example.test/foto.jpg",
  biografia: "Biografia factual.",
  naturalidade: "Belém (PA)",
  data_nascimento: "1980-03-23",
  formacao: "Superior incompleto",
  profissao_declarada: "Comunicólogo",
  genero: "Feminino",
  estado_civil: "Solteiro(a)",
  cor_raca: "Preta",
}

test("marca patrimônio e financiamento não coletados como acionáveis", () => {
  const result = analyzePublicProfileCompleteness("well-macedo", {
    sourceStatus: "live",
    data: {
      slug: "well-macedo",
      ...completeCore,
      patrimonio_eleicoes: [
        { ano: 2022, estado: "nao_coletado" },
        {
          ano: 2016,
          estado: "vazio_confirmado",
          fonte_url: "https://dadosabertos.tse.jus.br/",
          verificado_em: "2026-09-06T00:00:00.000Z",
        },
      ],
      financiamento_eleicoes: [
        { ano: 2022, estado: "erro" },
        {
          ano: 2016,
          estado: "ausencia_oficial",
          fonte_url: "https://dadosabertos.tse.jus.br/",
          verificado_em: "2026-09-06T00:00:00.000Z",
        },
      ],
    },
  })
  assert.deepEqual(result.actionable, [
    { slug: "well-macedo", kind: "patrimonio_uncollected", year: 2022, state: "nao_coletado" },
    { slug: "well-macedo", kind: "financiamento_uncollected", year: 2022, state: "erro" },
  ])
})

test("aceita publicação, ausência oficial, zero e pleito futuro", () => {
  const result = analyzePublicProfileCompleteness("perfil-completo", {
    sourceStatus: "live",
    data: {
      slug: "perfil-completo",
      ...completeCore,
      patrimonio_eleicoes: [
        { ano: 2022, estado: "publicado" },
        {
          ano: 2018,
          estado: "vazio_confirmado",
          fonte_url: "https://dadosabertos.tse.jus.br/",
          verificado_em: "2026-09-06T00:00:00.000Z",
        },
      ],
      financiamento_eleicoes: [
        { ano: 2022, estado: "zero_declarado" },
        {
          ano: 2018,
          estado: "ausencia_oficial",
          fonte_url: "https://dadosabertos.tse.jus.br/",
          verificado_em: "2026-09-06T00:00:00.000Z",
        },
        { ano: 2026, estado: "pleito_futuro" },
        {
          ano: 1998,
          estado: "fora_da_serie_oficial",
          fonte_url: "https://dadosabertos.tse.jus.br/",
          verificado_em: "2026-09-06T00:00:00.000Z",
        },
      ],
    },
  })
  assert.deepEqual(result.actionable, [])
})

test("marca candidatura atual ausente da trajetória como acionável", () => {
  const result = analyzePublicProfileCompleteness("well-macedo", {
    sourceStatus: "live",
    data: {
      slug: "well-macedo",
      ...completeCore,
      cargo_disputado: "Governador",
      historico: [
        {
          cargo: "Deputado Federal",
          cargo_canonico: "Deputado Federal",
          tipo_evento: "candidatura",
          periodo_inicio: 2022,
          periodo_fim: 2022,
        },
      ],
      patrimonio_eleicoes: [],
      financiamento_eleicoes: [],
    },
  })

  assert.deepEqual(result.actionable, [
    {
      slug: "well-macedo",
      kind: "current_candidacy_missing_from_history",
      field: "historico",
      year: 2026,
    },
  ])
})

test("aceita candidatura atual projetada junto de mandato no mesmo ano", () => {
  const result = analyzePublicProfileCompleteness("governador-candidato", {
    sourceStatus: "live",
    data: {
      slug: "governador-candidato",
      ...completeCore,
      cargo_disputado: "Governador",
      historico: [
        {
          cargo: "Governador",
          cargo_canonico: "Governador",
          tipo_evento: "mandato",
          periodo_inicio: 2026,
          periodo_fim: null,
        },
        {
          cargo: "Governador",
          cargo_canonico: "Governador",
          tipo_evento: "candidatura",
          periodo_inicio: 2026,
          periodo_fim: 2026,
          proveniencia: "tse",
        },
      ],
      patrimonio_eleicoes: [{ ano: 2026, estado: "publicado" }],
      financiamento_eleicoes: [{ ano: 2026, estado: "pleito_futuro" }],
    },
  })

  assert.deepEqual(result.actionable, [])
})

test("marca candidatura oficial cuja linha corrente conserva proveniência editorial", () => {
  const result = analyzePublicProfileCompleteness("registro-sem-proveniencia", {
    sourceStatus: "live",
    data: {
      slug: "registro-sem-proveniencia",
      ...completeCore,
      cargo_disputado: "Governador",
      historico: [{
        cargo: "Governador",
        cargo_canonico: "Governador",
        tipo_evento: "candidatura",
        periodo_inicio: 2026,
        periodo_fim: 2026,
        proveniencia: "manual",
      }],
      patrimonio_eleicoes: [],
      financiamento_eleicoes: [],
    },
  })

  assert.deepEqual(result.actionable, [{
    slug: "registro-sem-proveniencia",
    kind: "current_candidacy_unverified_provenance",
    field: "historico",
    year: 2026,
    state: "manual",
  }])
})

test("marca pleito oficial ausente das duas séries monetárias", () => {
  const result = analyzePublicProfileCompleteness("ano-sumido", {
    sourceStatus: "live",
    data: {
      slug: "ano-sumido",
      ...completeCore,
      cargo_disputado: "Nenhum",
      historico: [{
        cargo: "Deputado Federal",
        cargo_canonico: "Deputado Federal",
        tipo_evento: "candidatura",
        periodo_inicio: 2022,
        periodo_fim: 2022,
        proveniencia: "tse",
      }],
      patrimonio_eleicoes: [],
      financiamento_eleicoes: [],
    },
  })

  assert.deepEqual(result.actionable, [
    { slug: "ano-sumido", kind: "patrimonio_uncollected", year: 2022, state: "missing" },
    { slug: "ano-sumido", kind: "financiamento_uncollected", year: 2022, state: "missing" },
  ])
})

test("marca candidatura atual duplicada na trajetória como acionável", () => {
  const candidaturaAtual = {
    cargo: "Governador",
    cargo_canonico: "Governador",
    tipo_evento: "candidatura",
    periodo_inicio: 2026,
    periodo_fim: 2026,
  }
  const result = analyzePublicProfileCompleteness("duplicado", {
    sourceStatus: "live",
    data: {
      slug: "duplicado",
      ...completeCore,
      cargo_disputado: "Governador",
      historico: [candidaturaAtual, { ...candidaturaAtual, cargo: "Candidato a Governador" }],
      patrimonio_eleicoes: [],
      financiamento_eleicoes: [],
    },
  })

  assert.deepEqual(result.actionable, [
    {
      slug: "duplicado",
      kind: "current_candidacy_duplicate_in_history",
      field: "historico",
      year: 2026,
      state: "2",
    },
  ])
})

test("marca registro oficial ainda rotulado como pré-candidatura", () => {
  const result = analyzePublicProfileCompleteness("registro-oficial", {
    sourceStatus: "live",
    data: {
      slug: "registro-oficial",
      ...completeCore,
      status: "pre-candidato",
      cargo_disputado: "Governador",
      historico: [{
        cargo: "Governador",
        cargo_canonico: "Governador",
        tipo_evento: "candidatura",
        periodo_inicio: 2026,
        periodo_fim: 2026,
      }],
      patrimonio_eleicoes: [],
      financiamento_eleicoes: [],
    },
  })

  assert.deepEqual(result.actionable, [{
    slug: "registro-oficial",
    kind: "current_registration_status_mismatch",
    field: "status",
    year: 2026,
    state: "pre-candidato",
  }])
})

test("separa ausência de recibo contextual de lacuna objetiva", () => {
  const result = analyzePublicProfileCompleteness("sem-recibos", {
    sourceStatus: "live",
    data: {
      slug: "sem-recibos",
      ...completeCore,
      patrimonio_eleicoes: [],
      financiamento_eleicoes: [],
      processos_verificacao: null,
      trajetoria_verificacao: null,
      section_freshness: {
        gastos_parlamentares: { status: "missing" },
      },
    },
  })
  assert.deepEqual(result.actionable, [])
  assert.deepEqual(result.review, [
    { slug: "sem-recibos", section: "processos", reason: "missing_verification" },
    { slug: "sem-recibos", section: "trajetoria", reason: "missing_verification" },
    { slug: "sem-recibos", section: "patrimonio", reason: "missing_verification" },
    { slug: "sem-recibos", section: "votacoes", reason: "missing_verification" },
    { slug: "sem-recibos", section: "gastos_parlamentares", reason: "section_missing" },
  ])
})

test("falha com fonte não live e campo cadastral ausente", () => {
  const result = analyzePublicProfileCompleteness("perfil-quebrado", {
    sourceStatus: "fallback",
    data: {
      slug: "perfil-quebrado",
      ...completeCore,
      foto_url: null,
      patrimonio_eleicoes: [],
      financiamento_eleicoes: [],
    },
  })
  assert.deepEqual(result.actionable, [
    { slug: "perfil-quebrado", kind: "source_not_live", state: "fallback" },
    { slug: "perfil-quebrado", kind: "core_field_missing", field: "foto_url" },
  ])
})

test("falha fechado quando séries monetárias ou identidade do payload são inválidas", () => {
  const result = analyzePublicProfileCompleteness("perfil-esperado", {
    sourceStatus: "live",
    data: {
      slug: "outro-perfil",
      ...completeCore,
      patrimonio_eleicoes: null,
      financiamento_eleicoes: [{ ano: 2022, estado: "estado_desconhecido" }],
    },
  })
  assert.deepEqual(result.actionable, [
    {
      slug: "perfil-esperado",
      kind: "profile_payload_invalid",
      field: "slug",
      state: "outro-perfil",
    },
    {
      slug: "perfil-esperado",
      kind: "profile_payload_invalid",
      field: "patrimonio_eleicoes",
      state: "missing_or_not_array",
    },
    {
      slug: "perfil-esperado",
      kind: "profile_payload_invalid",
      field: "financiamento_eleicoes[0]",
      year: 2022,
      state: "estado_desconhecido",
    },
  ])
})

test("ausência oficial sem fonte e data é lacuna objetiva", () => {
  const result = analyzePublicProfileCompleteness("sem-prova", {
    sourceStatus: "live",
    data: {
      slug: "sem-prova",
      ...completeCore,
      patrimonio_eleicoes: [{ ano: 2022, estado: "vazio_confirmado" }],
      financiamento_eleicoes: [{ ano: 2022, estado: "ausencia_oficial" }],
    },
  })
  assert.deepEqual(result.actionable, [
    {
      slug: "sem-prova",
      kind: "profile_payload_invalid",
      field: "patrimonio_eleicoes[0]",
      year: 2022,
      state: "vazio_confirmado_without_official_proof",
    },
    {
      slug: "sem-prova",
      kind: "profile_payload_invalid",
      field: "financiamento_eleicoes[0]",
      year: 2022,
      state: "ausencia_oficial_without_official_proof",
    },
  ])
})

test("gate rejeita inventário público vazio", async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => Response.json({ slugs: [] })
  try {
    await assert.rejects(
      runPublicProfileCompletenessAudit({
        baseUrl: "https://example.test",
        out: null,
        slug: null,
        allowActionable: false,
        expectZeroActionable: true,
      }),
      /inventário vazio ou inválido/,
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("gate rejeita slugs públicos duplicados", async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => Response.json({ slugs: ["duplicado", "duplicado"] })
  try {
    await assert.rejects(
      runPublicProfileCompletenessAudit({
        baseUrl: "https://example.test",
        out: null,
        slug: null,
        allowActionable: false,
        expectZeroActionable: true,
      }),
      /slugs duplicados/,
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("varredura torna ficha pública fora do seed uma lacuna acionável", async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.endsWith("/api/candidato-slugs")) {
      return Response.json({ slugs: ["fora-do-seed"] })
    }
    return Response.json({
      sourceStatus: "live",
      data: {
        slug: "fora-do-seed",
        ...completeCore,
        patrimonio_eleicoes: [],
        financiamento_eleicoes: [],
      },
    })
  }
  try {
    const report = await runPublicProfileCompletenessAudit({
      baseUrl: "https://example.test",
      out: null,
      slug: null,
      allowActionable: true,
      expectZeroActionable: false,
    })
    assert.deepEqual(report.actionable_issues, [
      { slug: "fora-do-seed", kind: "public_profile_missing_from_seed" },
    ])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("404 falha imediatamente sem consumir retries", async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    return new Response(null, { status: 404 })
  }
  try {
    await assert.rejects(fetchJson("https://example.test/inexistente"), /HTTP 404/)
    assert.equal(calls, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})

console.log("PUBLIC_PROFILE_COMPLETENESS_TESTS_OK")

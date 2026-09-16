import assert from "node:assert/strict"
import test from "node:test"

import {
  analyzePublicProfileCompleteness,
  fetchJson,
  runPublicProfileCompletenessAudit,
  strictTcuVerificationIsComplete,
  strictTransparenciaIsComplete,
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

test("gate estrito exige recibo TCU separado e com escopo", () => {
  const base = {
    fonte: "tcu",
    resultado: "encontrado",
    estado: "encontrado_em_revisao",
    executado_em: "2026-09-15T00:00:00.000Z",
    volume: 1,
    detalhe: "Consulta TCU encontrada.",
    escopo: "dois cadastros oficiais; candidato",
    fontes: [{ cadastro: "responsaveis_contas_irregulares", resultado: "encontrado", volume: 1, url: "https://certidoes.apps.tcu.gov.br/api/publico/responsaveis-contas-irregulares" }],
  }
  assert.equal(strictTcuVerificationIsComplete(base), true)
  assert.equal(strictTcuVerificationIsComplete({ ...base, escopo: null }), false)
  assert.equal(strictTcuVerificationIsComplete({ ...base, fonte: "processos-curadoria" }), false)

  const vazio = {
    ...base,
    resultado: "vazio_confirmado",
    estado: "vazio_verificado",
    volume: 0,
    fontes: [
      { cadastro: "responsaveis_inabilitados", resultado: "vazio_confirmado", volume: 0, url: "https://certidoes.apps.tcu.gov.br/api/publico/responsaveis-inabilitados" },
      { cadastro: "responsaveis_contas_irregulares", resultado: "vazio_confirmado", volume: 0, url: "https://certidoes.apps.tcu.gov.br/api/publico/responsaveis-contas-irregulares" },
    ],
  }
  assert.equal(strictTcuVerificationIsComplete(vazio), true)
  assert.equal(strictTcuVerificationIsComplete({ ...vazio, fontes: [] }), false)
  assert.equal(strictTcuVerificationIsComplete({ ...vazio, fontes: vazio.fontes.slice(0, 1) }), false)
  assert.equal(strictTcuVerificationIsComplete({ ...vazio, fontes: vazio.fontes.map((item) => ({ ...item, resultado: "pendente" })) }), false)
})

test("gate estrito exige as três famílias CGU com paginação e cobertura do escopo", () => {
  const base = ["cartoes", "viagens", "contratos"].map((familia) => ({
    familia,
    resultado: "vazio_confirmado",
    volume: 0,
    paginas: 2,
    endpoint: "https://api.portaldatransparencia.gov.br/api-de-dados",
    fonte: "Portal da Transparência",
    executado_em: "2026-09-15T00:00:00.000Z",
    cobertura: "vazio_escopo_verificado",
    registros: [],
  }))
  assert.equal(strictTransparenciaIsComplete(base), true)
  assert.equal(strictTransparenciaIsComplete(base.map((item) => ({ ...item, paginas: 0 }))), false)
  assert.equal(strictTransparenciaIsComplete(base.map((item) => ({ ...item, familia: "cartoes" }))), false)
})

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

test("aceita vazio patrimonial agregado quando cada candidatura tem prova oficial", () => {
  const prova = {
    estado: "vazio_confirmado",
    ano_eleicao: 2022,
    ano_arquivo: 2022,
    uf_candidatura: "PI",
    fonte_url: "https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2022.zip",
    verificado_em: "2026-09-15T22:31:02.006Z",
  }
  const result = analyzePublicProfileCompleteness("multi-contexto", {
    sourceStatus: "live",
    data: {
      slug: "multi-contexto",
      ...completeCore,
      patrimonio_eleicoes: [{
        ano: 2022,
        estado: "vazio_confirmado",
        fonte_url: null,
        verificado_em: null,
        contextos: [
          { ...prova, sq_candidato: "180001712962", cargo_candidatura: "DEPUTADO FEDERAL" },
          { ...prova, sq_candidato: "180001739161", cargo_candidatura: "VICE-GOVERNADOR" },
        ],
      }],
      financiamento_eleicoes: [],
    },
  })
  assert.deepEqual(result.actionable, [])
})

test("rejeita vazio patrimonial agregado quando um contexto não tem prova oficial", () => {
  const result = analyzePublicProfileCompleteness("multi-contexto-incompleto", {
    sourceStatus: "live",
    data: {
      slug: "multi-contexto-incompleto",
      ...completeCore,
      patrimonio_eleicoes: [{
        ano: 2018,
        estado: "vazio_confirmado",
        fonte_url: null,
        verificado_em: null,
        contextos: [
          {
            estado: "vazio_confirmado",
            ano_eleicao: 2018,
            sq_candidato: "270000618819",
            fonte_url: "https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2018.zip",
            verificado_em: "2026-09-15T22:31:02.006Z",
          },
          {
            estado: "vazio_confirmado",
            ano_eleicao: 2018,
            sq_candidato: "270000629454",
            fonte_url: null,
            verificado_em: "2026-09-15T22:31:02.006Z",
          },
        ],
      }],
      financiamento_eleicoes: [],
    },
  })
  assert.deepEqual(result.actionable, [{
    slug: "multi-contexto-incompleto",
    kind: "profile_payload_invalid",
    field: "patrimonio_eleicoes[0]",
    year: 2018,
    state: "vazio_confirmado_without_official_proof",
  }])
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

test("varredura aceita coorte TSE publicada fora do seed quando a identidade é comprovada", async () => {
  const originalFetch = globalThis.fetch
  const dynamicSlug = "tse-2026-250000000001"
  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.endsWith("/api/candidato-slugs")) return Response.json({ slugs: [dynamicSlug] })
    return Response.json({
      sourceStatus: "live",
      data: {
        slug: dynamicSlug,
        ...completeCore,
        cargo_disputado: "Senador",
        cargo_disputado_proveniencia: "registro_tse",
        estado: "SP",
        sq_candidato: "250000000001",
        patrimonio_eleicoes: [],
        financiamento_eleicoes: [],
        verificacao_campos: {
          candidate_registration: {
            fonte: "TSE",
            estado: "publicado",
            verificado_em: "2026-09-14T00:00:00.000Z",
            fontes_consultadas: [{
              url: "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip",
              escopo: "consulta_cand_2026_SP.csv SQ_CANDIDATO 250000000001",
            }],
          },
        },
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
    assert.equal(report.actionable_issues.some((issue) => issue.kind === "public_profile_missing_from_seed"), false)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("varredura aceita recibo TSE do membro nacional quando UF e geração estão estruturados", async () => {
  const originalFetch = globalThis.fetch
  const dynamicSlug = "tse-2026-250000000001"
  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.endsWith("/api/candidato-slugs")) return Response.json({ slugs: [dynamicSlug] })
    return Response.json({
      sourceStatus: "live",
      data: {
        slug: dynamicSlug,
        ...completeCore,
        cargo_disputado: "Senador",
        cargo_disputado_proveniencia: "registro_tse_pendente",
        estado: "SP",
        sq_candidato: "250000000001",
        patrimonio_eleicoes: [],
        financiamento_eleicoes: [],
        verificacao_campos: {
          candidate_registration: {
            fonte: "TSE",
            estado: "publicado",
            verificado_em: "2026-09-14T00:00:00.000Z",
            fontes_consultadas: [{
              url: "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip",
              escopo: "cadastro oficial; SQ_CANDIDATO 250000000001; membro_csv=consulta_cand_2026_BRASIL.csv; UF=SP; cargo=SENADOR; data_geracao=03/09/2026 19:30:36",
              membro_csv: "consulta_cand_2026_BRASIL.csv",
              uf: "SP",
              cargo: "SENADOR",
              data_geracao: "03/09/2026 19:30:36",
            }],
          },
        },
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
    assert.equal(report.actionable_issues.some((issue) => issue.kind === "public_profile_missing_from_seed"), false)
  } finally {
    globalThis.fetch = originalFetch
  }
})

async function structuredReceiptActionable(overrides: { cargo?: string; scope?: string; sq?: string | null } = {}) {
  const originalFetch = globalThis.fetch
  const dynamicSlug = "tse-2026-250000000001"
  const cargo = overrides.cargo ?? "SENADOR"
  const sq = overrides.sq === undefined ? "250000000001" : overrides.sq
  const scope = overrides.scope ?? "cadastro oficial; SQ_CANDIDATO 250000000001; membro_csv=consulta_cand_2026_BRASIL.csv; UF=SP; cargo=SENADOR; data_geracao=03/09/2026 19:30:36"
  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.endsWith("/api/candidato-slugs")) return Response.json({ slugs: [dynamicSlug] })
    return Response.json({
      sourceStatus: "live",
      data: {
        slug: dynamicSlug,
        ...completeCore,
        cargo_disputado: "Senador",
        cargo_disputado_proveniencia: "registro_tse_pendente",
        estado: "SP",
        sq_candidato: sq,
        patrimonio_eleicoes: [],
        financiamento_eleicoes: [],
        verificacao_campos: {
          candidate_registration: {
            fonte: "TSE",
            estado: "publicado",
            verificado_em: "2026-09-14T00:00:00.000Z",
            fontes_consultadas: [{
              url: "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip",
              escopo: scope,
              membro_csv: "consulta_cand_2026_BRASIL.csv",
              uf: "SP",
              cargo,
              data_geracao: "03/09/2026 19:30:36",
            }],
          },
        },
      },
    })
  }
  try {
    const report = await runPublicProfileCompletenessAudit({ baseUrl: "https://example.test", out: null, slug: null, allowActionable: true, expectZeroActionable: false })
    return report.actionable_issues.some((issue) => issue.kind === "public_profile_missing_from_seed")
  } finally {
    globalThis.fetch = originalFetch
  }
}

test("coorte TSE pendente rejeita cargo estruturado divergente", async () => {
  assert.equal(await structuredReceiptActionable({ cargo: "Deputado Federal", scope: "cadastro oficial; SQ_CANDIDATO 250000000001; membro_csv=consulta_cand_2026_BRASIL.csv; UF=SP; cargo=Deputado Federal; data_geracao=03/09/2026 19:30:36" }), true)
})

test("coorte TSE pendente rejeita recibo estruturado sem SQ no escopo", async () => {
  assert.equal(await structuredReceiptActionable({ scope: "cadastro oficial; membro_csv=consulta_cand_2026_BRASIL.csv; UF=SP; cargo=SENADOR; data_geracao=03/09/2026 19:30:36" }), true)
})

async function dynamicSeedActionable(sourceUrl: string, scope: string, sq = "250000000001") {
  const originalFetch = globalThis.fetch
  const dynamicSlug = "tse-2026-250000000001"
  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.endsWith("/api/candidato-slugs")) return Response.json({ slugs: [dynamicSlug] })
    return Response.json({
      sourceStatus: "live",
      data: {
        slug: dynamicSlug,
        ...completeCore,
        cargo_disputado: "Senador",
        cargo_disputado_proveniencia: "registro_tse",
        estado: "SP",
        sq_candidato: sq,
        patrimonio_eleicoes: [],
        financiamento_eleicoes: [],
        verificacao_campos: {
          candidate_registration: {
            fonte: "TSE",
            estado: "publicado",
            verificado_em: "2026-09-14T00:00:00.000Z",
            fontes_consultadas: [{ url: sourceUrl, escopo: scope }],
          },
        },
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
    return report.actionable_issues.some((issue) => issue.kind === "public_profile_missing_from_seed")
  } finally {
    globalThis.fetch = originalFetch
  }
}

test("coorte TSE dinâmica recusa host que apenas contém o domínio oficial", async () => {
  assert.equal(
    await dynamicSeedActionable(
      "https://tse.jus.br.attacker.test/consulta_cand_2026.zip",
      "consulta_cand_2026_SP.csv SQ_CANDIDATO 250000000001",
    ),
    true,
  )
})

test("coorte TSE dinâmica recusa SQ explícito divergente do slug", async () => {
  assert.equal(
    await dynamicSeedActionable(
      "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip",
      "consulta_cand_2026_SP.csv SQ_CANDIDATO 250000000001",
      "250000000002",
    ),
    true,
  )
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

test("gate estrito falha quando dinheiro está completo mas Justiça não tem prova", async () => {
  const originalFetch = globalThis.fetch
  const verified = {
    resultado: "encontrado",
    executado_em: "2026-09-14T00:00:00.000Z",
    fonte: "fonte oficial",
  }
  const freshness: Record<string, Record<string, unknown>> = Object.fromEntries([
    "perfil_atual",
    "historico_politico",
    "mudancas_partido",
    "patrimonio",
    "financiamento",
    "projetos_lei",
    "votos_candidato",
    "gastos_parlamentares",
    "gastos_executivo",
  ].map((key) => [key, { status: "historical", message: "Cobertura verificada." }]))
  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.endsWith("/api/candidato-profile/lula")) {
      return Response.json({
        sourceStatus: "live",
        data: {
          slug: "lula",
          ...completeCore,
          patrimonio_eleicoes: [],
          financiamento_eleicoes: [],
          processos_verificacao: null,
          trajetoria_verificacao: verified,
          patrimonio_verificacao: verified,
          votacoes_verificacao: verified,
          sancoes_verificacao: verified,
          section_freshness: freshness,
        },
      })
    }
    if (url.endsWith("/api/candidato-slugs")) return Response.json({ slugs: ["lula"] })
    throw new Error(`URL inesperada: ${url}`)
  }
  try {
    await assert.rejects(
      runPublicProfileCompletenessAudit({
        baseUrl: "https://example.test",
        out: null,
        slug: null,
        allowActionable: false,
        expectZeroActionable: false,
        strict: true,
      }),
      /avisos de revisão: 1 em 1 fichas/,
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("gate estrito rejeita recibo de Justiça com erro, mesmo não nulo", async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => Response.json({
    sourceStatus: "live",
    data: {
      slug: "lula",
      ...completeCore,
      patrimonio_eleicoes: [],
      financiamento_eleicoes: [],
      processos_verificacao: {
        resultado: "erro",
        executado_em: "2026-09-14T00:00:00.000Z",
        fonte: "processos-curadoria",
      },
    },
  })
  try {
    await assert.rejects(
      runPublicProfileCompletenessAudit({
        baseUrl: "https://example.test",
        out: null,
        slug: "lula",
        allowActionable: false,
        expectZeroActionable: false,
        strict: true,
      }),
      /avisos de revisão/,
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("gate estrito rejeita recibo sem fonte", async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => Response.json({
    sourceStatus: "live",
    data: {
      slug: "lula",
      ...completeCore,
      patrimonio_eleicoes: [],
      financiamento_eleicoes: [],
      processos_verificacao: {
        resultado: "encontrado",
        executado_em: "2026-09-14T00:00:00.000Z",
      },
    },
  })
  try {
    await assert.rejects(
      runPublicProfileCompletenessAudit({
        baseUrl: "https://example.test",
        out: null,
        slug: "lula",
        allowActionable: false,
        expectZeroActionable: false,
        strict: true,
      }),
      /avisos de revisão/,
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("gate estrito rejeita não aplicável com lista de evidências vazia", () => {
  const report = analyzePublicProfileCompleteness("votacoes-sem-evidencia", {
    sourceStatus: "live",
    data: {
      slug: "votacoes-sem-evidencia",
      ...completeCore,
      patrimonio_eleicoes: [],
      financiamento_eleicoes: [],
      votacoes_verificacao: {
        resultado: "nao_aplicavel",
        executado_em: "2026-09-14T00:00:00.000Z",
        fonte: "Câmara dos Deputados; Senado Federal",
        detalhe: "Recorte nominal federal verificado.",
        escopo: "todas as legislaturas retornadas",
        evidence_sources: [],
        source_urls: [],
      },
    },
  }, { strict: true })
  assert.ok(report.review.some((item) => item.section === "votacoes" && item.reason === "invalid_verification"))
})

test("gate estrito rejeita vazio confirmado sem detalhe de escopo", () => {
  const verified = {
    resultado: "encontrado",
    executado_em: "2026-09-14T00:00:00.000Z",
    fonte: "fonte oficial",
  }
  const freshness: Record<string, Record<string, unknown>> = Object.fromEntries([
    "perfil_atual",
    "historico_politico",
    "mudancas_partido",
    "patrimonio",
    "financiamento",
    "projetos_lei",
    "votos_candidato",
    "gastos_parlamentares",
    "gastos_executivo",
  ].map((key) => [key, { status: "historical", message: "Cobertura verificada." }]))
  const report = analyzePublicProfileCompleteness("vazio-sem-escopo", {
    sourceStatus: "live",
    data: {
      slug: "vazio-sem-escopo",
      ...completeCore,
      patrimonio_eleicoes: [],
      financiamento_eleicoes: [],
      processos_verificacao: {
        resultado: "vazio_confirmado",
        executado_em: verified.executado_em,
        fonte: verified.fonte,
      },
      trajetoria_verificacao: verified,
      patrimonio_verificacao: verified,
      votacoes_verificacao: verified,
      sancoes_verificacao: verified,
      section_freshness: freshness,
    },
  }, { strict: true })
  assert.deepEqual(report.review, [
    { slug: "vazio-sem-escopo", section: "processos", reason: "invalid_verification" },
  ])
})

test("gate estrito aceita não aplicável somente com recibos federais completos", () => {
  const verified = {
    resultado: "encontrado",
    executado_em: "2026-09-14T00:00:00.000Z",
    fonte: "fonte oficial",
  }
  const freshness: Record<string, Record<string, unknown>> = Object.fromEntries([
    ["perfil_atual", { status: "historical", message: "Cobertura verificada." }],
    ["historico_politico", { status: "historical", message: "Cobertura verificada." }],
    ["mudancas_partido", { status: "historical", message: "Cobertura verificada." }],
    ["patrimonio", { status: "historical", message: "Cobertura verificada." }],
    ["financiamento", { status: "historical", message: "Cobertura verificada." }],
    ["projetos_lei", {
      status: "not_applicable", verifiedAt: verified.executado_em,
      sourceLabel: "Câmara dos Deputados; Senado Federal",
      scope: "candidato; acervo federal parlamentar",
      evidence_sources: ["camara", "senado"], message: "Recibo completo.",
      source_urls: ["https://www.camara.leg.br/deputados/quem-sao", "https://www25.senado.leg.br/web/senadores/pesquisa"],
    }],
    ["votos_candidato", {
      status: "not_applicable", verifiedAt: verified.executado_em,
      sourceLabel: "Câmara dos Deputados; Senado Federal",
      scope: "candidato; acervo federal parlamentar",
      evidence_sources: ["camara", "senado"], message: "Recibo completo.",
      source_urls: ["https://www.camara.leg.br/deputados/quem-sao", "https://www25.senado.leg.br/web/senadores/pesquisa"],
    }],
    ["gastos_parlamentares", {
      status: "not_applicable", verifiedAt: verified.executado_em,
      sourceLabel: "Câmara dos Deputados; Senado Federal; CEAPS; Jarbas",
      scope: "candidato; acervo federal parlamentar",
      evidence_sources: ["camara", "senado", "ceaps-senado", "jarbas"], message: "Recibo completo.",
      source_urls: ["https://www.camara.leg.br/deputados/quem-sao", "https://www25.senado.leg.br/web/senadores/pesquisa"],
    }],
    ["gastos_executivo", {
      status: "not_applicable", verifiedAt: verified.executado_em,
      sourceLabel: "Portal da Transparência, CPGF Presidência da República",
      scope: "coorte nominal; Presidência da República / órgão 20101; período 01/2023 até 09/2026",
      evidence_sources: ["executive-collector-binding-lula-20101", "executive-cohort-identity-check"],
      source_urls: ["https://api.portaldatransparencia.gov.br/api-de-dados/cartoes"],
      message: "Esta seção cobre despesas com cartões de pagamento da Presidência da República desde janeiro de 2023. Este candidato está fora desse recorte.",
    }],
  ])
  const report = analyzePublicProfileCompleteness("senador-sem-mandato", {
    sourceStatus: "live",
    data: {
      slug: "senador-sem-mandato",
      ...completeCore,
      patrimonio_eleicoes: [],
      financiamento_eleicoes: [],
      processos_verificacao: verified,
      trajetoria_verificacao: verified,
      patrimonio_verificacao: verified,
      votacoes_verificacao: { ...verified, resultado: "nao_aplicavel", detalhe: "Recibo completo.", escopo: "registro nominal de todas as legislaturas retornadas", evidence_sources: ["camara", "senado"], source_urls: ["https://www.camara.leg.br/deputados/quem-sao", "https://www25.senado.leg.br/web/senadores/pesquisa"] },
      sancoes_verificacao: verified,
      section_freshness: freshness,
    },
  }, { strict: true })
  assert.deepEqual(report.review, [])
})

test("gate estrito rejeita não aplicável sem o conjunto federal completo", () => {
  const freshness: Record<string, Record<string, unknown>> = Object.fromEntries([
    "perfil_atual", "historico_politico", "mudancas_partido", "patrimonio", "financiamento", "gastos_executivo",
  ].map((key) => [key, { status: "historical", message: "Cobertura verificada." }]))
  for (const section of ["projetos_lei", "votos_candidato", "gastos_parlamentares"]) {
    freshness[section] = {
      status: "not_applicable",
      verifiedAt: "2026-09-14T00:00:00.000Z",
      sourceLabel: "fonte",
      scope: "candidato",
      message: "Recibo incompleto.",
      evidence_sources: section === "gastos_parlamentares" ? ["camara", "senado", "ceaps-senado"] : ["camara"],
    }
  }
  const verified = { resultado: "encontrado", executado_em: "2026-09-14T00:00:00.000Z", fonte: "fonte oficial" }
  const report = analyzePublicProfileCompleteness("senador-sem-recibo", {
    sourceStatus: "live",
    data: {
      slug: "senador-sem-recibo", ...completeCore, patrimonio_eleicoes: [], financiamento_eleicoes: [],
      processos_verificacao: verified, trajetoria_verificacao: verified, patrimonio_verificacao: verified,
      votacoes_verificacao: verified, sancoes_verificacao: verified, section_freshness: freshness,
    },
  }, { strict: true })
  assert.deepEqual(report.review.filter((item) => item.reason === "freshness_invalid").map((item) => item.section), [
    "projetos_lei", "votos_candidato", "gastos_parlamentares",
  ])
})

test("gate estrito rejeita N/A executivo sem contrato nominal do recorte", () => {
  const verified = {
    resultado: "encontrado",
    executado_em: "2026-09-14T00:00:00.000Z",
    fonte: "fonte oficial",
  }
  const freshness: Record<string, Record<string, unknown>> = Object.fromEntries([
    "perfil_atual", "historico_politico", "mudancas_partido", "patrimonio", "financiamento",
    "projetos_lei", "votos_candidato", "gastos_parlamentares",
  ].map((key) => [key, { status: "historical", message: "Cobertura verificada." }]))
  freshness.gastos_executivo = {
    status: "not_applicable",
    verifiedAt: verified.executado_em,
    sourceLabel: "Portal da Transparência",
    scope: "candidato",
    message: "Não se aplica.",
    evidence_sources: [],
    source_urls: [],
  }
  const report = analyzePublicProfileCompleteness("executivo-sem-contrato", {
    sourceStatus: "live",
    data: {
      slug: "executivo-sem-contrato",
      ...completeCore,
      patrimonio_eleicoes: [],
      financiamento_eleicoes: [],
      processos_verificacao: verified,
      trajetoria_verificacao: verified,
      patrimonio_verificacao: verified,
      votacoes_verificacao: verified,
      sancoes_verificacao: verified,
      section_freshness: freshness,
    },
  }, { strict: true })
  assert.ok(report.review.some((item) => item.section === "gastos_executivo" && item.reason === "freshness_invalid"))
})

test("gate estrito aceita N/A temporal de gastos sem fechar proposições ou votos", () => {
  const verified = { resultado: "encontrado", executado_em: "2026-09-15T00:00:00.000Z", fonte: "fonte oficial" }
  const freshness: Record<string, Record<string, unknown>> = Object.fromEntries([
    "perfil_atual", "historico_politico", "mudancas_partido", "patrimonio", "financiamento", "projetos_lei", "votos_candidato", "gastos_executivo",
  ].map((key) => [key, { status: "historical", message: "Cobertura verificada." }]))
  freshness.gastos_parlamentares = {
    status: "not_applicable", verifiedAt: "2026-09-15T18:25:35.631Z", referenceYear: 2026,
    sourceLabel: "Jarbas; despesas da Câmara na série anual consultada",
    scope: "Câmara; despesas Jarbas na série anual 2009-2026; identidade nominal por detalhe oficial e SQ/UF",
    evidence_sources: ["camara-parliamentarian-registry-all-legislatures", "camara-parliamentarian-registry-scope-control"],
    source_urls: ["https://www.camara.leg.br/deputados/quem-sao", "https://dadosabertos.camara.leg.br/api/v2/deputados/74192"],
    message: "Despesas da Câmara: recorte consultado de 2009 a 2026; este candidato está fora desse período.",
  }
  const report = analyzePublicProfileCompleteness("gastos-temporal", {
    sourceStatus: "live", data: {
      slug: "gastos-temporal", ...completeCore, cargo_disputado: "Nenhum", historico: [], patrimonio_eleicoes: [], financiamento_eleicoes: [],
      processos_verificacao: verified, trajetoria_verificacao: verified, patrimonio_verificacao: verified, votacoes_verificacao: verified, sancoes_verificacao: verified,
      section_freshness: freshness,
    },
  }, { strict: true })
  assert.equal(report.review.some((item) => item.section === "gastos_parlamentares" && item.reason === "freshness_invalid"), false)
})

test("gate estrito rejeita N/A temporal de gastos sem recorte anual comprovado", () => {
  const freshness: Record<string, Record<string, unknown>> = Object.fromEntries([
    "perfil_atual", "historico_politico", "mudancas_partido", "patrimonio", "financiamento", "projetos_lei", "votos_candidato", "gastos_executivo",
  ].map((key) => [key, { status: "historical", message: "Cobertura verificada." }]))
  freshness.gastos_parlamentares = {
    status: "not_applicable", verifiedAt: "2026-09-15T18:25:35.631Z", referenceYear: 2026,
    sourceLabel: "Jarbas; despesas da Câmara na série anual consultada", scope: "Câmara; identidade nominal",
    evidence_sources: ["camara-parliamentarian-registry-all-legislatures", "camara-parliamentarian-registry-scope-control"],
    source_urls: ["https://www.camara.leg.br/deputados/quem-sao", "https://dadosabertos.camara.leg.br/api/v2/deputados/74192"],
    message: "Não se aplica.",
  }
  const report = analyzePublicProfileCompleteness("gastos-temporal-invalido", {
    sourceStatus: "live", data: {
      slug: "gastos-temporal-invalido", ...completeCore, cargo_disputado: "Nenhum", historico: [], patrimonio_eleicoes: [], financiamento_eleicoes: [],
      processos_verificacao: { resultado: "encontrado", executado_em: "2026-09-15T00:00:00.000Z", fonte: "fonte oficial" },
      trajetoria_verificacao: { resultado: "encontrado", executado_em: "2026-09-15T00:00:00.000Z", fonte: "fonte oficial" }, patrimonio_verificacao: { resultado: "encontrado", executado_em: "2026-09-15T00:00:00.000Z", fonte: "fonte oficial" },
      votacoes_verificacao: { resultado: "encontrado", executado_em: "2026-09-15T00:00:00.000Z", fonte: "fonte oficial" }, sancoes_verificacao: { resultado: "encontrado", executado_em: "2026-09-15T00:00:00.000Z", fonte: "fonte oficial" }, section_freshness: freshness,
    },
  }, { strict: true })
  assert.ok(report.review.some((item) => item.section === "gastos_parlamentares" && item.reason === "freshness_invalid"))
})

console.log("PUBLIC_PROFILE_COMPLETENESS_TESTS_OK")

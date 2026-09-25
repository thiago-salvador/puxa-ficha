import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync, writeFileSync, statSync } from "node:fs"
import { describe, it } from "node:test"
import { tmpdir } from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import {
  adaptLatestReceipts,
  buildCoverageMatrix,
  type CoverageProfile,
} from "../scripts/audit/audit-cobertura-fichas"

function profile(overrides: Partial<CoverageProfile> = {}): CoverageProfile {
  return {
    id: "candidate-1",
    slug: "ana-exemplo",
    nome_completo: "Ana Exemplo",
    cargo_disputado: "Deputado Federal",
    cargo_atual: null,
    ids: { camara: 12345, senado: null },
    section_freshness: {},
    ...overrides,
  }
}

describe("matriz de cobertura das fichas", () => {
  it("não publica processo só porque o recibo disse encontrado", () => {
    const matrix = buildCoverageMatrix([profile({ processos: [] })], [], {
      "ana-exemplo": { processos: { resultado: "encontrado", executado_em: new Date().toISOString(), fonte: "processos-curadoria" } },
    })
    assert.equal(matrix.cells.find((item) => item.familia === "processos")?.estado, "indeterminado")
  })

  it("mantém achado antigo sem linha publicada como indeterminado", () => {
    const matrix = buildCoverageMatrix([profile({ processos: [] })], [], {
      "ana-exemplo": { processos: { resultado: "encontrado", executado_em: "2026-08-06T10:00:00.000Z", fonte: "processos-curadoria" } },
    })
    assert.equal(matrix.cells.find((item) => item.familia === "processos")?.estado, "indeterminado")
  })

  it("marca contradição entre vazio confirmado e linha publicada como erro", () => {
    const matrix = buildCoverageMatrix([profile({ processos: [{ id: 1 }] })], [], {
      "ana-exemplo": { processos: { resultado: "vazio_confirmado", executado_em: new Date().toISOString(), fonte: "tribunais", escopo: "consulta nominal" } },
    })
    assert.equal(matrix.cells.find((item) => item.familia === "processos")?.estado, "erro")
  })

  it("não certifica frescor de família guiada por revisão da fonte sem comparar a revisão", () => {
    const matrix = buildCoverageMatrix([profile({ patrimonio_eleicoes: [{ id: 1 }] })], [], {
      "ana-exemplo": { patrimonio: { resultado: "encontrado", executado_em: new Date().toISOString(), fonte: "TSE" } },
    })
    assert.equal(matrix.cells.find((item) => item.familia === "patrimonio")?.estado, "frescor_indefinido")
  })

  it("não trata badge histórico sem data como recibo nem encobre verificação datada", () => {
    const materialized = profile({
      historico: [{ cargo: "Deputado Federal", tipo_evento: "mandato" }],
      section_freshness: { historico_politico: { status: "historical", verifiedAt: null, sourceLabel: "Histórico político" } },
      trajetoria_verificacao: { resultado: "indeterminado", executado_em: "2026-09-15T10:00:00Z", fonte: "destaques-trajetoria", escopo: "candidato" },
    })
    const verified = buildCoverageMatrix([materialized]).cells.find((cell) => cell.familia === "historico_politico")
    assert.equal(verified?.estado, "indeterminado")
    const withoutVerification = buildCoverageMatrix([{ ...materialized, trajetoria_verificacao: null }]).cells.find((cell) => cell.familia === "historico_politico")
    assert.equal(withoutVerification?.estado, "sem_recibo")
  })

  it("fecha sites somente quando recibo e snapshot usam a mesma revisão oficial", () => {
    const fetchedAt = "2026-09-24T16:56:50.458Z"
    const materialized = profile({ sites_candidato: {
      resultado: "publicado", coletado_em: fetchedAt,
      fonte_url: "https://www.tse.jus.br/fonte-oficial",
      fonte_sha256: "a".repeat(64), sites: [{ ordem: 1, url: "https://exemplo.org" }],
    } })
    const receipt = {
      fonte: "sites_tse", escopo: "candidato", alvo: "ana-exemplo", candidato_id: "candidate-1",
      resultado: "encontrado", volume: 1, executado_em: "2026-09-24T17:00:00.000Z",
      url: "https://www.tse.jus.br/fonte-oficial",
      detalhe: JSON.stringify({ resource_sha256: "a".repeat(64), escopo: "candidato" }),
    }
    const matching = adaptLatestReceipts([receipt], [materialized]).joins
    assert.equal(buildCoverageMatrix([materialized], [], matching).cells.find((cell) => cell.familia === "sites_tse")?.estado, "publicado")
    const conflicting = adaptLatestReceipts([{ ...receipt, detalhe: JSON.stringify({ resource_sha256: "b".repeat(64), escopo: "candidato" }) }], [materialized]).joins
    assert.equal(buildCoverageMatrix([materialized], [], conflicting).cells.find((cell) => cell.familia === "sites_tse")?.estado, "frescor_indefinido")
  })

  it("fecha chapa só quando revisão oficial, vínculo e ordem temporal conferem", () => {
    const materialized = profile({
      cargo_disputado: "Governador",
      chapa_2026: {
        titular_candidato_id: "candidate-1",
        identidade_status: "confirmada",
        vinculo_titular_status: "confirmado",
        fonte_url: "https://www.tse.jus.br/chapas.zip",
        fonte_sha256: "a".repeat(64),
        snapshot_em: "2026-09-24T16:00:00Z",
      },
    })
    const receipt = {
      fonte: "chapa_vice", escopo: "candidato", alvo: "ana-exemplo", candidato_id: "candidate-1",
      resultado: "encontrado", volume: 1, executado_em: "2026-09-24T17:00:00Z",
      url: "https://www.tse.jus.br/chapas.zip",
      detalhe: JSON.stringify({ resource_sha256: "a".repeat(64), escopo: "candidato" }),
    }
    const state = (row: typeof receipt, candidate = materialized) =>
      buildCoverageMatrix([candidate], [], adaptLatestReceipts([row], [candidate]).joins)
        .cells.find((cell) => cell.familia === "chapa_vice")?.estado
    assert.equal(state(receipt), "publicado")
    assert.equal(state({ ...receipt, detalhe: JSON.stringify({ resource_sha256: "b".repeat(64), escopo: "candidato" }) }), "frescor_indefinido")
    assert.equal(state({ ...receipt, url: "https://www.tse.jus.br/outra.zip" }), "frescor_indefinido")
    assert.equal(state({ ...receipt, executado_em: "2026-09-24T15:00:00Z" }), "frescor_indefinido")
    assert.equal(state(receipt, { ...materialized, chapa_2026: { ...(materialized.chapa_2026 as Record<string, unknown>), titular_candidato_id: "candidate-2" } }), "frescor_indefinido")
  })

  it("conta recibo parcial de situação sem fechar perfil_atual", () => {
    const row = {
      fonte: "tse-situacao", escopo: "candidato", alvo: "ana-exemplo", candidato_id: "candidate-1",
      resultado: "encontrado", volume: 1, executado_em: "2026-09-24T17:22:25.641Z",
    }
    const adapted = adaptLatestReceipts([row], [profile()])
    assert.equal(adapted.ignored_partial_receipts, 1)
    assert.equal(adapted.rejected.length, 0)
    assert.equal(buildCoverageMatrix([profile()], [], adapted.joins).cells.find((cell) => cell.familia === "perfil_atual")?.estado, "sem_recibo")
    const invalid = adaptLatestReceipts([{ ...row, candidato_id: "outro" }], [profile()])
    assert.equal(invalid.ignored_partial_receipts, 0)
    assert.equal(invalid.rejected.length, 1)
  })

  it("mantém família aplicável como sem_recibo quando há dados, mas não há prova de fonte", () => {
    const matrix = buildCoverageMatrix([profile({ biografia: "Texto presente", projetos_lei: [{ id: 1 }] })])
    const cell = matrix.cells.find((item) => item.familia === "projetos_lei")
    assert.equal(cell?.aplicavel, true)
    assert.equal(cell?.estado, "sem_recibo")
    assert.match(cell?.motivo ?? "", /sem recibo/)
  })

  it("aceita vazio confirmado somente quando o recibo fecha a busca", () => {
    const matrix = buildCoverageMatrix([profile()], [], { "ana-exemplo": { processos: {
        resultado: "vazio_confirmado",
        executado_em: "2026-09-20T10:00:00.000Z",
        fonte: "tribunais",
        escopo: "consulta nominal nos tribunais oficiais",
      } } })
    const cell = matrix.cells.find((item) => item.familia === "processos")
    assert.equal(cell?.estado, "vazio_confirmado")
    assert.equal(cell?.verificado_em, "2026-09-20T10:00:00.000Z")
  })

  it("não aceita recibo vazio sem data e escopo", () => {
    const matrix = buildCoverageMatrix([profile()], [], { "ana-exemplo": { processos: {
      resultado: "vazio_confirmado",
      fonte: "tribunais",
    } } })
    assert.equal(matrix.cells.find((item) => item.familia === "processos")?.estado, "erro")
    const future = buildCoverageMatrix([profile()], [], { "ana-exemplo": { processos: {
      resultado: "vazio_confirmado",
      executado_em: "2099-01-01T00:00:00Z",
      fonte: "tribunais",
      escopo: "consulta nominal nos tribunais oficiais",
    } } })
    assert.equal(future.cells.find((item) => item.familia === "processos")?.estado, "erro")
  })

  it("rebaixa recibo vazio fora do prazo para desatualizado", () => {
    const matrix = buildCoverageMatrix([profile()], [], { "ana-exemplo": { processos: {
      resultado: "vazio_confirmado",
      executado_em: "2025-01-01T10:00:00.000Z",
      fonte: "tribunais",
      escopo: "consulta nominal nos tribunais oficiais",
    } } })
    assert.equal(matrix.cells.find((item) => item.familia === "processos")?.estado, "desatualizado")
  })

  it("reconhece cargo legislativo como não aplicável a gastos executivos", () => {
    const matrix = buildCoverageMatrix([profile({ cargo_disputado: "Senador", cargo_atual: "Senador" })])
    const cell = matrix.cells.find((item) => item.familia === "gastos_executivo")
    assert.equal(cell?.aplicavel, false)
    assert.equal(cell?.estado, "nao_aplicavel")
  })

  it("não aceita not_applicable de fonte quando regra local considera a família aplicável", () => {
    const matrix = buildCoverageMatrix([profile({
      section_freshness: { projetos_lei: { status: "not_applicable", verifiedAt: new Date().toISOString(), sourceLabel: "API legislativa" } },
    })])
    const cell = matrix.cells.find((item) => item.familia === "projetos_lei")
    assert.equal(cell?.aplicavel, true)
    assert.equal(cell?.estado, "indeterminado")
  })

  it("marca família parlamentar como não aplicável pela regra de escopo quando não há mandato federal", () => {
    const matrix = buildCoverageMatrix([profile({
      slug: "governadora-exemplo",
      cargo_disputado: "Governador",
      ids: { camara: null, senado: null },
      historico: [],
    })])
    for (const family of ["projetos_lei", "votos_candidato", "gastos_parlamentares"] as const) {
      const cell = matrix.cells.find((item) => item.familia === family)
      assert.equal(cell?.aplicavel, false)
      assert.equal(cell?.estado, "nao_aplicavel")
    }
  })

  it("candidatura federal sem mandato não cria aplicabilidade parlamentar", () => {
    const matrix = buildCoverageMatrix([profile({
      ids: { camara: null, senado: null },
      historico: [{ tipo_evento: "candidatura", cargo: "Senador", periodo_inicio: 2022, periodo_fim: 2022 }],
      section_freshness: { projetos_lei: { status: "not_applicable", verifiedAt: "2026-09-14T10:00:00Z", sourceLabel: "Câmara e Senado" } },
    })])
    for (const family of ["projetos_lei", "votos_candidato", "gastos_parlamentares"] as const) {
      const cell = matrix.cells.find((item) => item.familia === family)
      assert.equal(cell?.aplicavel, false)
      assert.equal(cell?.estado, "nao_aplicavel")
    }
  })

  it("mandato federal mantém aplicabilidade apesar de badge not_applicable", () => {
    const matrix = buildCoverageMatrix([profile({
      ids: { camara: null, senado: null },
      historico: [{ tipo_evento: "mandato", cargo: "Senador", periodo_inicio: 2020, periodo_fim: 2024 }],
      section_freshness: { projetos_lei: { status: "not_applicable", verifiedAt: "2026-09-14T10:00:00Z", sourceLabel: "Câmara e Senado" } },
    })])
    const cell = matrix.cells.find((item) => item.familia === "projetos_lei")
    assert.equal(cell?.aplicavel, true)
    assert.equal(cell?.estado, "indeterminado")
  })

  it("não transforma erro de leitura do perfil em vazio", () => {
    const matrix = buildCoverageMatrix([], [{ slug: "perfil-inacessivel", error: "HTTP 503" }])
    assert.equal(matrix.profile_errors.length, 1)
    assert.equal(matrix.cells.length, 12)
    assert.ok(matrix.cells.every((cell) => cell.estado === "erro"))
    assert.equal(matrix.completed_profiles, 0)
  })

  it("só adapta TSE quando candidato_id, slug, fonte e escopo conferem", () => {
    const result = adaptLatestReceipts([
      { fonte: "tse", escopo: "candidato", alvo: "ana-exemplo", candidato_id: "candidate-1", executado_em: "2026-09-23T10:00:00Z", resultado: "encontrado", volume: 1 },
      { fonte: "tse-historico", escopo: "global", alvo: "ana-exemplo", candidato_id: "candidate-1", executado_em: "2026-09-23T10:00:00Z", resultado: "encontrado", volume: 1 },
      { fonte: "tse", escopo: "candidato", alvo: "ana-exemplo", candidato_id: "candidate-other", executado_em: "2026-09-23T10:00:00Z", resultado: "encontrado", volume: 1 },
    ], [profile()])
    assert.ok(result.joins["ana-exemplo"]?.perfil_atual)
    assert.equal(result.joins["ana-exemplo"]?.historico_politico, undefined)
    assert.equal(result.rejected.length, 2)
  })

  it("une recibos das 12 famílias somente por fonte, slug, candidato e escopo", () => {
    const now = "2026-09-23T10:00:00Z"
    const sources = [
      "tse", "tse-historico", "filiacao", "patrimonio", "financiamento", "camara-proposicoes",
      "destaques-votacoes", "ceaps-senado", "gastos-executivo", "processos-curadoria", "sites-tse", "chapa",
    ]
    const rows = sources.map((fonte) => ({
      fonte,
      escopo: "candidato",
      alvo: "ana-exemplo",
      candidato_id: "candidate-1",
      executado_em: now,
      resultado: "encontrado",
      volume: 1,
    }))
    const result = adaptLatestReceipts(rows, [profile({ cargo_atual: "Governador", cargo_disputado: "Governador" })])
    assert.equal(result.rejected.length, 0)
    assert.deepEqual(Object.keys(result.joins["ana-exemplo"] ?? {}).sort(), [
      "chapa_vice", "financiamento", "gastos_executivo", "gastos_parlamentares", "historico_politico",
      "mudancas_partido", "patrimonio", "perfil_atual", "processos", "projetos_lei", "sites_tse", "votos_candidato",
    ])
  })

  it("não usa recorte oficial not_applicable como prova de inaplicabilidade local", () => {
    const matrix = buildCoverageMatrix([profile({
      section_freshness: {
        projetos_lei: {
          status: "not_applicable",
          verifiedAt: "2026-09-20T10:00:00Z",
          sourceLabel: "Câmara e Senado",
          scope: "série anual parcial",
        },
      },
    })])
    const cell = matrix.cells.find((item) => item.familia === "projetos_lei")
    assert.equal(cell?.aplicavel, true)
    assert.equal(cell?.estado, "indeterminado")
  })

  it("não fecha família parlamentar com uma fonte quando o perfil exige dois órgãos", () => {
    const result = adaptLatestReceipts([
      { fonte: "camara-proposicoes", escopo: "candidato", alvo: "ana-exemplo", candidato_id: "candidate-1", executado_em: "2026-09-23T10:00:00Z", resultado: "encontrado", volume: 1 },
      { fonte: "senado-proposicoes", escopo: "candidato", alvo: "ana-exemplo", candidato_id: "candidate-1", executado_em: "2026-09-23T11:00:00Z", resultado: "erro", volume: 0 },
    ], [profile({ ids: { camara: 12345, senado: 67890 } })])
    const matrix = buildCoverageMatrix([profile({ ids: { camara: 12345, senado: 67890 }, projetos_lei: [{ id: 1 }] })], [], result.joins)
    assert.equal(matrix.cells.find((item) => item.familia === "projetos_lei")?.estado, "erro")
  })

  it("mantém erro mais novo da mesma fonte sobre achado antigo", () => {
    const result = adaptLatestReceipts([
      { fonte: "camara-proposicoes", escopo: "candidato", alvo: "ana-exemplo", candidato_id: "candidate-1", executado_em: "2026-09-20T10:00:00Z", resultado: "encontrado", volume: 1 },
      { fonte: "camara-proposicoes", escopo: "candidato", alvo: "ana-exemplo", candidato_id: "candidate-1", executado_em: "2026-09-23T10:00:00Z", resultado: "erro", volume: 0 },
    ], [profile()])
    const matrix = buildCoverageMatrix([profile({ projetos_lei: [{ id: 1 }] })], [], result.joins)
    assert.equal(matrix.cells.find((item) => item.familia === "projetos_lei")?.estado, "erro")
  })

  it("não fecha projetos com recibo genérico da Câmara", () => {
    const result = adaptLatestReceipts([
      { fonte: "camara", escopo: "candidato", alvo: "ana-exemplo", candidato_id: "candidate-1", executado_em: "2026-09-23T10:00:00Z", resultado: "encontrado", volume: 1 },
    ], [profile()])
    const matrix = buildCoverageMatrix([profile({ projetos_lei: [{ id: 1 }] })], [], result.joins)
    assert.equal(result.rejected.length, 1)
    assert.equal(matrix.cells.find((item) => item.familia === "projetos_lei")?.estado, "sem_recibo")
  })

  it("não chama projeto publicado só com contagem declarada e array no DTO", () => {
    const result = adaptLatestReceipts([
      { fonte: "camara-proposicoes", escopo: "candidato", alvo: "ana-exemplo", candidato_id: "candidate-1", executado_em: "2026-09-23T10:00:00Z", resultado: "encontrado", volume: 1 },
    ], [profile()])
    const matrix = buildCoverageMatrix([profile({ projetos_lei: [{ id: 1 }] })], [], result.joins)
    assert.equal(matrix.cells.find((item) => item.familia === "projetos_lei")?.estado, "indeterminado")
  })

  it("Câmara vazia e Senado com dados não provam contradição sem partição por órgão", () => {
    const candidate = profile({ ids: { camara: 12345, senado: 67890 }, projetos_lei: [{ id: 1 }] })
    const result = adaptLatestReceipts([
      { fonte: "camara-proposicoes", escopo: "candidato", alvo: "ana-exemplo", candidato_id: "candidate-1", executado_em: "2026-09-23T10:00:00Z", resultado: "vazio_confirmado", volume: 0 },
      { fonte: "senado-proposicoes", escopo: "candidato", alvo: "ana-exemplo", candidato_id: "candidate-1", executado_em: "2026-09-23T10:00:00Z", resultado: "encontrado", volume: 1 },
    ], [candidate])
    const matrix = buildCoverageMatrix([candidate], [], result.joins)
    assert.equal(matrix.cells.find((item) => item.familia === "projetos_lei")?.estado, "indeterminado")
  })

  it("fixture de candidato novo sem recibo reprova o strict com exit 1 e saída privada", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "puxa-ficha-matrix-"))
    const input = path.join(dir, "candidate-new.json")
    const output = path.join(dir, "matrix.json")
    writeFileSync(input, JSON.stringify([profile({ id: "candidate-new", slug: "candidato-novo" })]))
    const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/audit/audit-cobertura-fichas.ts", "--strict", `--input=${input}`, `--out=${output}`], {
      cwd: path.resolve(import.meta.dirname, ".."),
      encoding: "utf8",
    })
    try {
      assert.equal(result.status, 1)
      assert.match(`${result.stdout}\n${result.stderr}`, /células aplicáveis sem fechamento/)
      assert.equal(statSync(output).mode & 0o777, 0o600)
      const readback = JSON.parse(readFileSync(output, "utf8")) as { requested_profiles: number; cells: unknown[] }
      assert.equal(readback.requested_profiles, 1)
      assert.equal(readback.cells.length, 12)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("não publica recibo TSE antigo e não permite escopo amplo fechar a célula", () => {
    const result = adaptLatestReceipts([
      { fonte: "tse", escopo: "candidato", alvo: "ana-exemplo", candidato_id: "candidate-1", executado_em: "2020-01-01T10:00:00Z", resultado: "encontrado", volume: 1 },
      { fonte: "tse-historico", escopo: "global", alvo: "ana-exemplo", candidato_id: "candidate-1", executado_em: "2026-09-23T10:00:00Z", resultado: "encontrado", volume: 1 },
    ], [profile({ partido_sigla: "ABC", situacao_candidatura: "deferido", foto_url: "https://example.test/foto", biografia: "Bio", naturalidade: "SP", data_nascimento: "1980-01-01", formacao: "Direito", profissao_declarada: "Advogada", genero: "F", estado_civil: "Solteira", cor_raca: "branca", historico: [{ cargo: "Deputado Federal" }] })])
    const matrix = buildCoverageMatrix([profile({ partido_sigla: "ABC", situacao_candidatura: "deferido", foto_url: "https://example.test/foto", biografia: "Bio", naturalidade: "SP", data_nascimento: "1980-01-01", formacao: "Direito", profissao_declarada: "Advogada", genero: "F", estado_civil: "Solteira", cor_raca: "branca", historico: [{ cargo: "Deputado Federal" }] })], [], result.joins)
    assert.equal(matrix.cells.find((item) => item.familia === "perfil_atual")?.estado, "frescor_indefinido")
    assert.equal(matrix.cells.find((item) => item.familia === "historico_politico")?.estado, "sem_recibo")
    assert.equal(result.rejected.length, 1)
  })
})

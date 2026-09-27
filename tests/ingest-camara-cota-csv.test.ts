import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { aggregateCamaraCotaCsv, planejarReconciliacaoCotaLegada, selecionarCandidatosCotaCamara } from "../scripts/lib/ingest-camara-cota-csv"

const header = '"txNomeParlamentar";"cpf";"ideCadastro";"nuDeputadoId";"numAno";"txtDescricao";"vlrDocumento";"vlrGlosa";"vlrLiquido";"txtCNPJCPF"'

describe("CSV oficial de cotas da Câmara", () => {
  it("respeita alvos explícitos vazios e o predicado de coorte futuro", () => {
    const candidates = [{ slug: "a", elegivel: true }, { slug: "b", elegivel: false }]
    assert.deepEqual(selecionarCandidatosCotaCamara(candidates, { targetSlugs: [] }), [])
    assert.deepEqual(
      selecionarCandidatosCotaCamara(candidates, { cohortPredicate: (candidate) => candidate.elegivel }),
      [candidates[0]],
    )
  })

  it("reconcilia linha legada somente por candidato/ano e só despublica ausência com escopo anual completo", () => {
    const rows = [
      { id: "confirmado", ano: 2024, fonte: null, total_gasto: 100 },
      { id: "ausente", ano: 2023, fonte: null },
      { id: "outra-fonte", ano: 2023, fonte: "Senado" },
    ] as const
    const complete = planejarReconciliacaoCotaLegada({ legacyRows: rows, officialYears: new Set([2024]), officialTotals: new Map([[2024, 100]]), scopeComplete: true })
    assert.deepEqual(complete.confirmed.map((row) => row.id), ["confirmado"])
    assert.deepEqual(complete.absent.map((row) => row.id), ["ausente"])
    assert.deepEqual(complete.review, [])
    const partial = planejarReconciliacaoCotaLegada({ legacyRows: rows, officialYears: new Set([2024]), officialTotals: new Map([[2024, 100]]), scopeComplete: false })
    assert.deepEqual(partial.absent, [])
    assert.deepEqual(partial.review.map((row) => row.id), ["ausente"])
    const crossHouse = planejarReconciliacaoCotaLegada({ legacyRows: rows, officialYears: new Set([2024]), officialTotals: new Map([[2024, 100]]), scopeComplete: true, otherHouseApplicable: true })
    assert.deepEqual(crossHouse.confirmed, [])
    assert.deepEqual(crossHouse.absent, [])
    assert.deepEqual(crossHouse.review.map((row) => row.id), ["confirmado", "ausente"])
    const divergence = planejarReconciliacaoCotaLegada({
      legacyRows: [{ id: "divergent", ano: 2024, fonte: null, total_gasto: 99 }],
      officialYears: new Set([2024]), officialTotals: new Map([[2024, 100]]), scopeComplete: true,
    })
    assert.deepEqual(divergence.confirmed, [])
    assert.deepEqual(divergence.absent.map((row) => row.id), ["divergent"])
    const duplicate = planejarReconciliacaoCotaLegada({
      legacyRows: [{ ...rows[0]!, id: "dup" }, rows[0]!], officialYears: new Set([2024],),
      officialTotals: new Map([[2024, 100]]), scopeComplete: true,
    })
    assert.deepEqual(duplicate.confirmed.map((row) => row.id), ["confirmado"])
    assert.deepEqual(duplicate.absent, [])
    assert.deepEqual(duplicate.duplicates.map((row) => row.id), ["dup"])
    assert.equal(duplicate.review.length, 0)
  })

  it("reconhece aliases Câmara apenas com confirmação anual e ID oficial da URL", () => {
    const totals = new Map([[2025, 250]])
    const officialYears = new Set([2025])
    const confirmed = planejarReconciliacaoCotaLegada({
      legacyRows: [
        { id: "ceap", ano: 2025, fonte: "Camara CEAP CSV", total_gasto: 250 },
        { id: "api", ano: 2025, fonte: "https://dadosabertos.camara.leg.br/api/v2/deputados/204531/despesas", total_gasto: 250 },
      ], officialYears, officialTotals: totals, scopeComplete: true, idCamara: "204531",
    })
    assert.deepEqual(confirmed.confirmed.map((row) => row.id), ["api"])
    assert.deepEqual(confirmed.duplicates.map((row) => row.id), ["ceap"])
    assert.deepEqual(confirmed.review, [])
    const mismatch = planejarReconciliacaoCotaLegada({
      legacyRows: [
        { id: "outro-api", ano: 2025, fonte: "https://dadosabertos.camara.leg.br/api/v2/deputados/141413/despesas", total_gasto: 250 },
        { id: "portal", ano: 2025, fonte: "Portal da Transparência — viagens por CPF", total_gasto: 250 },
      ], officialYears, officialTotals: totals, scopeComplete: true, idCamara: "204531",
    })
    assert.deepEqual(mismatch.confirmed, [])
    assert.deepEqual(mismatch.absent, [])
    assert.deepEqual(mismatch.review, [])
  })

  it("tombstoneia duplicata alias quando existe canonical confirmado, sem baixar canonical", () => {
    const result = planejarReconciliacaoCotaLegada({
      legacyRows: [
        { id: "canonical", ano: 2025, fonte: "Camara", total_gasto: 250 },
        { id: "alias", ano: 2025, fonte: "Camara CEAP CSV", total_gasto: 250 },
      ], officialYears: new Set([2025]), officialTotals: new Map([[2025, 250]]), scopeComplete: true,
    })
    assert.deepEqual(result.confirmed, [])
    assert.deepEqual(result.duplicates.map((row) => row.id), ["alias"])
    assert.deepEqual(result.absent, [])
    assert.deepEqual(result.review, [])
  })

  it("mantém linhas Senado paralelas e confirma Câmara no mesmo ano", () => {
    const result = planejarReconciliacaoCotaLegada({
      legacyRows: [
        { id: "senado", ano: 2025, fonte: "Senado CEAPS", total_gasto: 999 },
        { id: "camara", ano: 2025, fonte: "Camara CEAP CSV", total_gasto: 250 },
      ], officialYears: new Set([2025]), officialTotals: new Map([[2025, 250]]), scopeComplete: true,
      otherHouseApplicable: true, idCamara: "204531",
    })
    assert.deepEqual(result.confirmed.map((row) => row.id), ["camara"])
    assert.deepEqual(result.absent, [])
    assert.deepEqual(result.duplicates, [])
    assert.deepEqual(result.review, [])
  })

  it("despublica URL Câmara com ID correspondente e divergência provada, mas revisa fonte nula em candidato dual-house", () => {
    const result = planejarReconciliacaoCotaLegada({
      legacyRows: [
        { id: "api-divergente", ano: 2025, fonte: "https://dadosabertos.camara.leg.br/api/v2/deputados/204531/despesas", total_gasto: 249 },
        { id: "sem-fonte", ano: 2025, fonte: null, total_gasto: 248 },
      ], officialYears: new Set([2025]), officialTotals: new Map([[2025, 250]]), scopeComplete: true,
      otherHouseApplicable: true, idCamara: "204531",
    })
    assert.deepEqual(result.confirmed, [])
    assert.deepEqual(result.absent.map((row) => row.id), ["api-divergente"])
    assert.deepEqual(result.review.map((row) => row.id), ["sem-fonte"])
  })

  it("não atribui nem baixa fonte nula dual-house mesmo quando o total coincide", () => {
    const result = planejarReconciliacaoCotaLegada({
      legacyRows: [{ id: "sem-fonte", ano: 2025, fonte: null, total_gasto: 250 }],
      officialYears: new Set([2025]), officialTotals: new Map([[2025, 250]]), scopeComplete: true,
      otherHouseApplicable: true, idCamara: "204531",
    })
    assert.deepEqual(result.confirmed, [])
    assert.deepEqual(result.absent, [])
    assert.deepEqual(result.duplicates, [])
    assert.deepEqual(result.review.map((row) => row.id), ["sem-fonte"])
  })

  it("não baixa fonte nula igual ao total oficial quando coexiste linha Câmara canonical", () => {
    const result = planejarReconciliacaoCotaLegada({
      legacyRows: [
        { id: "canonical", ano: 2025, fonte: "Camara", total_gasto: 250 },
        { id: "sem-fonte", ano: 2025, fonte: null, total_gasto: 250 },
      ], officialYears: new Set([2025]), officialTotals: new Map([[2025, 250]]), scopeComplete: true,
      otherHouseApplicable: true, idCamara: "204531",
    })
    assert.deepEqual(result.duplicates, [])
    assert.deepEqual(result.absent, [])
    assert.deepEqual(result.review.map((row) => row.id), ["sem-fonte"])
  })

  it("agrega por ID oficial e exclui CPF, CNPJ, fornecedor e nome", () => {
    const csv = `\uFEFF${header}\n"NOME EXEMPLO";"11122233344";"42";"2812";"2026";"DIVULGAÇÃO";"120";"20";"100";"00123456000199"\n"NOME EXEMPLO";"11122233344";"42";"2812";"2026";"PASSAGEM";"50";"0";"50";"00123456000199"\n"LIDERANÇA";"";"";"";"2026";"ESCRITÓRIO";"10";"0";"10";""`
    const result = aggregateCamaraCotaCsv(csv, 2026)
    assert.deepEqual([...result.keys()], ["42"])
    const aggregate = result.get("42")!
    assert.equal(aggregate.rowCount, 2)
    assert.equal(aggregate.totalLiquido, 150)
    assert.deepEqual([...aggregate.categories], [["DIVULGAÇÃO", 100], ["PASSAGEM", 50]])
    assert.equal(JSON.stringify(aggregate).includes("11122233344"), false)
    assert.equal(JSON.stringify(aggregate).includes("00123456000199"), false)
    assert.equal(JSON.stringify(aggregate).includes("NOME EXEMPLO"), false)
  })

  it("falha fechado para arquivo vazio, colunas ausentes, ano divergente e valores não numéricos", () => {
    assert.throws(() => aggregateCamaraCotaCsv(`${header}\n`, 2026), /sem linhas/)
    assert.throws(() => aggregateCamaraCotaCsv('"nuDeputadoId";"numAno"\n"1234";"2026"', 2026), /coluna ausente/)
    assert.throws(() => aggregateCamaraCotaCsv(`${header}\n"N";"";"";"1234";"2025";"G";"10";"0";"10";""`, 2026), /fora do ano/)
    assert.throws(() => aggregateCamaraCotaCsv(`${header}\n"N";"";"42";"1234";"2026";"G";"dez";"0";"10";""`, 2026), /não numérico/)
  })
})

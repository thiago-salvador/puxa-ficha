import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"

import { tseCandidacyFromCsv } from "../scripts/audit/lib/historico-revisao"
import { partitionarAcoesPorRiscoDeIdentidade } from "../scripts/lib/tse-2026-financas-plano"
import {
  celulasLiberadas,
  chaveLinhaTse,
  normalizarCpfTse,
  parseDecisoesIdentidadeCelulas,
  reciboBloqueadoPorIdentidade,
  type DecisoesIdentidadeCelulas,
  type EvidenciaIdentidade,
} from "../scripts/lib/tse-identidade-celulas"
import { linhasDeReciboAplicaveis } from "../scripts/tse-2026-financas"
import { evidenciaIdentidadeDoDryRun, parseCliOptions, projectedClosure, writeFilteredReceiptArtifact } from "../scripts/tse-local/ingest-tse-local"

const ARQUIVO = "scripts/data/tse-identidade-celulas.json"

const decisoes = (celulas: DecisoesIdentidadeCelulas["celulas"]): DecisoesIdentidadeCelulas => ({ schema_version: 1, kind: "tse-identidade-celulas", celulas })
const ancora = (sq: string, uf = "SP") => ({ ano: 2026, uf, municipio: null, sq, decisao: "publicar" as const })
const base = decisoes([
  { lote: "t", slug: "aprovado", familia: "financiamento", decisao: "publicar", linhas: [ancora("250000000001")] },
  { lote: "t", slug: "aprovado", familia: "patrimonio", decisao: "manter_oculto", linhas: [] },
  { lote: "t", slug: "aprovado", familia: "historico_politico", decisao: "publicar", linhas: [
    { ano: 2004, uf: "PB", municipio: "SOUSA", sq: "156", decisao: "publicar" },
    { ano: 2018, uf: "PB", municipio: null, sq: "150000600001", decisao: "publicar" },
    { ano: 2018, uf: "PB", municipio: null, sq: "150000600002", decisao: "manter_oculto" },
  ] },
])
const evidencia = (historico: EvidenciaIdentidade["historico"][string], sq = "250000000001"): EvidenciaIdentidade => ({
  ancoras_2026: { aprovado: { ano: 2026, uf: "SP", municipio: null, sq } },
  historico: { aprovado: historico },
})
const risco = new Set(["aprovado"])

describe("arquivo público de decisões de identidade por célula", () => {
  it("parseia o arquivo do repo sem dado pessoal e com as contagens do L8", () => {
    const bytes = readFileSync(ARQUIVO)
    const parsed = parseDecisoesIdentidadeCelulas(bytes)
    const porFamilia = parsed.celulas.reduce<Record<string, number>>((acc, celula) => { acc[celula.familia] = (acc[celula.familia] ?? 0) + 1; return acc }, {})
    assert.deepEqual(porFamilia, { financiamento: 48, historico_politico: 38, patrimonio: 43 })
    assert.equal(new Set(parsed.celulas.map((celula) => celula.slug)).size, 48)
    assert.ok(parsed.celulas.every((celula) => celula.decisao === "publicar"))
    const texto = bytes.toString("utf8")
    assert.doesNotMatch(texto, /cpf|nascimento|nome|NM_CANDIDATO|\/Users\//i)
    assert.ok(parsed.celulas.flatMap((celula) => celula.linhas).filter((linha) => linha.ano <= 2008).every((linha) => linha.municipio))
    const sousa = parsed.celulas.find((celula) => celula.slug === "tse-2026-150002544909" && celula.familia === "historico_politico")!
    assert.deepEqual(sousa.linhas.filter((linha) => linha.ano <= 2004).map((linha) => [linha.ano, linha.municipio]), [[2000, "SOUSA"], [2004, "SOUSA"]])
    assert.equal(parsed.celulas.flatMap((celula) => celula.linhas).filter((linha) => linha.decisao === "manter_oculto").length, 2)
  })

  it("recusa campo fora do contrato, linha antiga sem município e célula repetida", () => {
    const ok = JSON.parse(JSON.stringify(base)) as DecisoesIdentidadeCelulas
    assert.doesNotThrow(() => parseDecisoesIdentidadeCelulas(JSON.stringify(ok)))
    const comCpf = JSON.parse(JSON.stringify(ok)); comCpf.celulas[0].linhas[0].cpf = "x"
    assert.throws(() => parseDecisoesIdentidadeCelulas(JSON.stringify(comCpf)), /campos da linha/)
    const comNome = JSON.parse(JSON.stringify(ok)); comNome.celulas[0].nome_completo = "x"
    assert.throws(() => parseDecisoesIdentidadeCelulas(JSON.stringify(comNome)), /campos da célula/)
    const semMunicipio = JSON.parse(JSON.stringify(ok)); semMunicipio.celulas[2].linhas[0].municipio = null
    assert.throws(() => parseDecisoesIdentidadeCelulas(JSON.stringify(semMunicipio)), /sem chave única/)
    const repetida = JSON.parse(JSON.stringify(ok)); repetida.celulas.push(repetida.celulas[0])
    assert.throws(() => parseDecisoesIdentidadeCelulas(JSON.stringify(repetida)), /célula repetida/)
    const semAncora = JSON.parse(JSON.stringify(ok)); semAncora.celulas[0].linhas = []
    assert.throws(() => parseDecisoesIdentidadeCelulas(JSON.stringify(semAncora)), /âncora 2026/)
  })
})

describe("chave da linha TSE", () => {
  it("exige município até 2008 e ignora município depois", () => {
    assert.equal(chaveLinhaTse({ ano: 2004, uf: "MG", municipio: null, sq: "124" }), null)
    assert.equal(chaveLinhaTse({ ano: 2004, uf: "mg", municipio: " Contagem ", sq: "124" }), "2004|MG|CONTAGEM|124")
    assert.equal(chaveLinhaTse({ ano: 2008, uf: "SP", municipio: "São Paulo", sq: "9" }), "2008|SP|SAO PAULO|9")
    assert.equal(chaveLinhaTse({ ano: 2012, uf: "SP", municipio: "SAO PAULO", sq: "250000001" }), chaveLinhaTse({ ano: 2012, uf: "SP", municipio: null, sq: "250000001" }))
  })
})

describe("CPF do pacote TSE", () => {
  it("restaura zeros à esquerda perdidos em 2012 só quando o dígito verificador fecha", () => {
    assert.equal(normalizarCpfTse("1234567890"), "01234567890")
    assert.equal(normalizarCpfTse(345678958), "00345678958")
    assert.equal(normalizarCpfTse("1234567891"), null, "dígito verificador errado não vira CPF")
    assert.equal(normalizarCpfTse("-4"), null)
    assert.equal(normalizarCpfTse("#NULO#"), null)
    assert.equal(normalizarCpfTse("1234567"), null)
    assert.equal(normalizarCpfTse("11111111111"), null)
    assert.equal(normalizarCpfTse("123.456.789-01"), "12345678901", "11 dígitos seguem a regra antiga")
  })

  it("o coletor histórico lê o CPF 2012 sem zeros e guarda o município da linha", () => {
    const row = tseCandidacyFromCsv({ ANO_ELEICAO: "2012", SQ_CANDIDATO: "250000000123", DS_CARGO: "VEREADOR", NR_CPF_CANDIDATO: "1234567890",
      NM_CANDIDATO: "PESSOA TESTE", DT_NASCIMENTO: "01/01/1970", SG_UF: "SP", NM_UE: "São Bernardo do Campo", SG_PARTIDO: "PT", DS_SIT_TOT_TURNO: "ELEITO" }, 2012)
    assert.equal(row?.cpf, "01234567890")
    assert.equal(row?.municipio, "SAO BERNARDO DO CAMPO")
  })
})

describe("gate por célula", () => {
  it("libera célula aprovada cuja evidência casa", () => {
    const { liberadas, fechadas } = celulasLiberadas(base, evidencia([
      { ano: 2004, uf: "PB", municipio: "SOUSA", sq: "156" },
      { ano: 2018, uf: "PB", municipio: null, sq: "150000600001" },
    ]), risco)
    assert.deepEqual([...liberadas].sort(), ["aprovado|financiamento", "aprovado|historico_politico"])
    assert.equal(fechadas["aprovado|patrimonio"], "decisao_manter_oculto")
  })

  it("mantém fechada a célula não aprovada, a linha mantida oculta e a linha fora da decisão", () => {
    assert.equal(celulasLiberadas(base, evidencia([{ ano: 2018, uf: "PB", municipio: null, sq: "150000600002" }]), risco).fechadas["aprovado|historico_politico"], "linha_mantida_oculta")
    assert.equal(celulasLiberadas(base, evidencia([{ ano: 2022, uf: "PB", municipio: null, sq: "150000900009" }]), risco).fechadas["aprovado|historico_politico"], "linha_nao_aprovada")
    assert.equal(celulasLiberadas(base, evidencia(null), risco).fechadas["aprovado|historico_politico"], "sem_identidade_ancorada")
    assert.equal(celulasLiberadas(base, evidencia([], "250000000999"), risco).fechadas["aprovado|financiamento"], "linha_nao_aprovada", "SQ 2026 do seed diferente do aprovado")
    assert.equal(celulasLiberadas(base, { ancoras_2026: {}, historico: {} }, risco).fechadas["aprovado|financiamento"], "sem_identidade_ancorada")
    assert.equal(celulasLiberadas(base, evidencia([]), new Set()).liberadas.size, 0, "perfil fora do risco não precisa de liberação")
  })

  it("colisão de SQ antes de 2008: mesmo ano, UF e SQ em outro município, ou sem município, não casa", () => {
    const outroMunicipio = celulasLiberadas(base, evidencia([{ ano: 2004, uf: "PB", municipio: "CAJAZEIRAS", sq: "156" }]), risco)
    assert.equal(outroMunicipio.fechadas["aprovado|historico_politico"], "linha_nao_aprovada")
    const semMunicipio = celulasLiberadas(base, evidencia([{ ano: 2004, uf: "PB", municipio: null, sq: "156" }]), risco)
    assert.equal(semMunicipio.fechadas["aprovado|historico_politico"], "linha_medida_sem_chave_unica")
    assert.equal(semMunicipio.liberadas.has("aprovado|historico_politico"), false)
  })

  it("filtra recibos por célula: só a família liberada do perfil em risco passa", () => {
    const liberadas = new Set(["aprovado|financiamento"])
    assert.equal(reciboBloqueadoPorIdentidade({ alvo: "aprovado", fonte: "tse-financiamento" }, risco, liberadas), false)
    assert.equal(reciboBloqueadoPorIdentidade({ alvo: "aprovado", fonte: "tse-patrimonio" }, risco, liberadas), true)
    assert.equal(reciboBloqueadoPorIdentidade({ alvo: "aprovado", fonte: "tse" }, risco, liberadas), true, "fonte sem família fica fechada")
    assert.equal(reciboBloqueadoPorIdentidade({ alvo: "seguro", fonte: "tse-patrimonio" }, risco, liberadas), false)
    const root = mkdtempSync(join(tmpdir(), "pf-celulas-"))
    try {
      const input = join(root, "in.json")
      const output = join(root, "out.json")
      writeFileSync(input, JSON.stringify({ receipts: [{ alvo: "aprovado", fonte: "tse-financiamento" }, { alvo: "aprovado", fonte: "tse-historico" }, { alvo: "seguro", fonte: "tse-historico" }] }))
      writeFilteredReceiptArtifact(input, output, risco, liberadas)
      assert.deepEqual(JSON.parse(readFileSync(output, "utf8")).receipts, [{ alvo: "aprovado", fonte: "tse-financiamento" }, { alvo: "seguro", fonte: "tse-historico" }])
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  it("partição do plano financeiro mantém só a família liberada e o writer grava só o recibo dela", () => {
    const resumoFamilia = { fichas_com_linha_apos_plano: 1, inserir: 1 }
    const plano = {
      acoes: [
        { tipo: "inserir_financiamento" as const, slug: "aprovado", linha: {} },
        { tipo: "inserir_patrimonio" as const, slug: "aprovado", linha: {} },
      ],
      recibos: [
        { fonte: "tse-financiamento" as const, alvo: "aprovado", candidato_id: "c", resultado: "encontrado" as const, volume: 1, detalhe: "{}" },
        { fonte: "tse-patrimonio" as const, alvo: "aprovado", candidato_id: "c", resultado: "encontrado" as const, volume: 1, detalhe: "{}" },
      ],
      revisao: [],
      resumo: {
        fichas_publicas: 1,
        financiamento: { fichas_com_linha_apos_plano: 1, inserir: 1, atualizar: 0, inalterado: 0, preservado_curadoria: 0, verificacoes_vencidas_apagadas: 0, fichas_vazio_confirmado: 0, fichas_erro: 0, aguardando_backfill_categorias: 0 },
        patrimonio: { fichas_com_linha_apos_plano: 1, inserir: 1, inalterado: 0, divergente_revisao: 0, ausencias_desmentidas_apagadas: 0, fichas_vazio_confirmado: 0, fichas_erro: 0 },
        recibos: { financiamento: 1, patrimonio: 1 },
      },
      resumo_por_perfil: { aprovado: { financiamento: resumoFamilia, patrimonio: resumoFamilia } },
    }
    const { plano: final, deferred } = partitionarAcoesPorRiscoDeIdentidade(plano, risco, new Set(["aprovado|financiamento"]))
    assert.equal(deferred, 1)
    assert.deepEqual(final.acoes.map((acao) => acao.tipo), ["inserir_financiamento"])
    assert.deepEqual(final.recibos.map((recibo) => recibo.resultado), ["encontrado", "indeterminado"])
    assert.equal(final.resumo.financiamento.inserir, 1)
    assert.equal(final.resumo.patrimonio.inserir, 0)
    const gravados = linhasDeReciboAplicaveis({ ...final, identity_risk_slugs: ["aprovado"], identity_released_cells: ["aprovado|financiamento"] }, [])
    assert.deepEqual(gravados.map((linha) => linha.fonte), ["tse-financiamento"])
    assert.equal(linhasDeReciboAplicaveis({ ...final, identity_risk_slugs: ["aprovado"] }, []).length, 0, "sem célula liberada nada do perfil em risco é gravado")
    assert.equal(partitionarAcoesPorRiscoDeIdentidade(plano, risco).plano.acoes.length, 0, "sem liberação o gate segue por perfil")
  })

  it("projeção de fechamento só tira de identity_review a célula liberada", () => {
    const root = mkdtempSync(join(tmpdir(), "pf-celulas-closure-"))
    try {
      const openCells = { supplied: true, rows: 2, in_cohort: 2, by_state: {}, cells: [{ slug: "aprovado", family: "financiamento" }, { slug: "aprovado", family: "patrimonio" }] }
      const projection = join(root, "projection.json")
      writeFileSync(projection, JSON.stringify({ apply_projection: [
        { slug: "aprovado", family: "financiamento", writer_actions: ["inserir_financiamento"], post_write_readback_matches: true, reason: "ok" },
        { slug: "aprovado", family: "patrimonio", writer_actions: ["inserir_patrimonio"], post_write_readback_matches: true, reason: "ok" },
      ] }))
      const result = projectedClosure(openCells, [], projection, join(root, "none.json"), join(root, "none.json"), null, [], risco, undefined, new Set(["aprovado|financiamento"]))
      assert.deepEqual(result.cells?.map((cell) => [cell.family, cell.category]), [["financiamento", "projected_after_safe_write"], ["patrimonio", "identity_review"]])
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  it("evidência do dry-run usa o SQ 2026 do seed e a UF oficial quando difere", () => {
    const evid = evidenciaIdentidadeDoDryRun([
      { slug: "a", cargo_disputado: "Presidente", estado: "RJ", ids: { tse_sq_candidato: { "2026": 280002551544 } } },
      { slug: "b", cargo_disputado: "Presidente", estado: null, ids: { tse_sq_candidato: { "2026": "40002551740" } } },
      { slug: "c", cargo_disputado: "Governador", estado: "MA", ids: {} },
    ], [{ slug: "b", to: "AM" }], { a: [] })
    assert.deepEqual(evid.ancoras_2026, { a: { ano: 2026, uf: "BR", municipio: null, sq: "280002551544" }, b: { ano: 2026, uf: "AM", municipio: null, sq: "40002551740" }, c: null })
    assert.deepEqual(evid.historico, { a: [] })
  })

  it("CLI: live exige decisões e SHA juntos", () => {
    const live = ["--live", "--expected-plan-sha=" + "a".repeat(64), "--expected-family-sha=" + "a".repeat(64), "--expected-history-sha=" + "a".repeat(64),
      "--expected-plan-file-sha=" + "a".repeat(64), "--expected-report-sha=" + "a".repeat(64), "--expected-cohort-sha=" + "a".repeat(64),
      "--expected-projection-sha=" + "a".repeat(64), "--reviewed-run-dir=/tmp/x", "--recibos=/tmp/r.json"]
    assert.throws(() => parseCliOptions([...live, `--identity-cells=${ARQUIVO}`]), /juntos/)
    assert.throws(() => parseCliOptions([...live, `--identity-cells=${ARQUIVO}`, "--expected-identity-cells-sha=xyz"]), /inválido/)
    const options = parseCliOptions([...live, `--identity-cells=${ARQUIVO}`, `--expected-identity-cells-sha=${"b".repeat(64)}`])
    assert.ok(options.identityCells?.endsWith(ARQUIVO))
    assert.equal(parseCliOptions(["--dry-run", "--recibos=/tmp/r.json"]).identityCells, null)
  })
})

import assert from "node:assert/strict"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { buildReceipt, money, projectAuditedFinanceReadback, readbackFromPublicProfiles, safeSourceRow, selectCsvMembers } from "../scripts/audit/collect-tse-family-receipts-local"
import { validCoverageSourceProof } from "../scripts/audit/lib/coverage-source-proof"
import { publicPatrimonioRow } from "../scripts/audit/plan-patrimonio-writers-local"

const candidate = {
  slug: "fixture-candidate",
  id: "candidate-1",
  ids: { tse_sq_candidato: { "2022": "SQ-1" }, tse_uf_candidatura: { "2022": "SP" } },
}
const asset = { family: "patrimonio" as const, year: 2022, path: "/tmp/fixture.zip", url: "https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2022.zip", sha256: "a".repeat(64) }
const rows = [{ SQ_CANDIDATO: "SQ-1", SG_UF: "SP", ANO_ELEICAO: "2022", VR_BEM_CANDIDATO: "100", DS_TIPO_BEM_CANDIDATO: "IMOVEL", DS_BEM_CANDIDATO: "" }]

test("normaliza valores monetários sem perder decimais", () => {
  assert.equal(money(123.45), 123.45)
  assert.equal(money("123.45"), 123.45)
  assert.equal(money("1.234,56"), 1234.56)
  assert.equal(money(0), 0)
  assert.equal(Number.isNaN(money("#NULO#")), true)
})

test("o recorte de linha oficial descarta identificadores pessoais antes de retê-la", () => {
  const safe = safeSourceRow({ SQ_CANDIDATO: "12345", SG_UF: "SP", VR_RECEITA: "100", NR_CPF_CANDIDATO: "11122233344", NR_TITULO_ELEITORAL_CANDIDATO: "123456789012" })
  assert.deepEqual(safe, { SQ_CANDIDATO: "12345", SG_UF: "SP", VR_RECEITA: "100" })
  const donor = safeSourceRow({ SQ_CANDIDATO: "12345", NR_CPF_CNPJ_DOADOR: "1".repeat(11) })
  assert.deepEqual(donor, { SQ_CANDIDATO: "12345", __donor_kind: "PF" })
  const receipt = { SQ_CANDIDATO: "12345", SG_UF_CANDIDATURA: "SP", SQ_RECEITA: "42", VR_RECEITA: "100", NR_CPF_CNPJ_DOADOR: "1".repeat(11) }
  const first = safeSourceRow({ ...receipt, DT_GERACAO: "2026-09-26" }, 2026)
  const repeated = safeSourceRow({ ...receipt, DT_GERACAO: "2026-09-27" }, 2026)
  assert.match(first.__receipt_dedup_sha256, /^[a-f0-9]{64}$/)
  assert.equal(first.__receipt_dedup_sha256, repeated.__receipt_dedup_sha256)
  assert.equal(Object.hasOwn(first, "NR_CPF_CNPJ_DOADOR"), false)
})

test("financiamento seleciona a base nacional sem duplicar UF nem doador originário", () => {
  const listing = [
    "receitas_candidatos_2024_BRASIL.csv",
    "receitas_candidatos_2024_SP.csv",
    "receitas_candidatos_doador_originario_2024_BRASIL.csv",
    "receitas_partidos_2024_BRASIL.csv",
  ].join("\n")
  assert.deepEqual(selectCsvMembers(listing, "financiamento"), ["receitas_candidatos_2024_BRASIL.csv"])
  assert.deepEqual(selectCsvMembers("2002/Candidato/Receita/ReceitaCandidato.csv\n2002/Comitê/Receita/ReceitaComite.csv", "financiamento"), ["2002/Candidato/Receita/ReceitaCandidato.csv"])
  assert.deepEqual(selectCsvMembers("bem_candidato_2026_BRASIL.csv\nbem_candidato_2026_SP.csv", "patrimonio"), ["bem_candidato_2026_BRASIL.csv"])
  assert.deepEqual(selectCsvMembers("consulta_cand_2026_BRASIL.csv\nconsulta_cand_2026_SP.csv", "historico_politico"), ["consulta_cand_2026_BRASIL.csv"])
})

test("TSE family receipt is found only with matching public readback digest", () => {
  const publicProfile = { id: candidate.id, slug: candidate.slug, patrimonio: [{ ano_eleicao: 2022, valor_total: 100, bens: [{ tipo: "IMOVEL", descricao: "", valor: 100 }] }], patrimonio_eleicoes: [{ ano: 2022, estado: "publicado" }] }
  const { receipt } = buildReceipt({ candidate, family: "patrimonio", assets: [asset], sourceRowsByAsset: new Map([[`${asset.family}|${asset.year}|${asset.path}`, rows]]), checkedAt: "2026-09-25T00:00:00.000Z", readback: { slug: candidate.slug, candidato_id: candidate.id, family: "patrimonio", public_profile: publicProfile } })
  assert.equal(receipt.resultado, "encontrado")
  const detail = JSON.parse(String(receipt.detalhe))
  assert.equal(detail.coverage_proof.scope_complete, true)
  assert.deepEqual(detail.coverage_proof.source_revisions, [{ year: 2022, url: asset.url, sha256: asset.sha256 }])
  assert.match(detail.coverage_proof.public_payload_sha256, /^[a-f0-9]{64}$/)
})

test("patrimônio não exige pacote anterior ao início da série exibida", () => {
  const olderCandidate = { ...candidate, ids: { ...candidate.ids, tse_sq_candidato: { "2004": "SQ-OLD", "2022": "SQ-1" } } }
  const publicProfile = { id: candidate.id, slug: candidate.slug, patrimonio: [{ ano_eleicao: 2022, valor_total: 100, bens: [{ tipo: "IMOVEL", descricao: "", valor: 100 }] }], patrimonio_eleicoes: [{ ano: 2022, estado: "publicado" }] }
  const result = buildReceipt({ candidate: olderCandidate, family: "patrimonio", assets: [asset], sourceRowsByAsset: new Map([[`${asset.family}|${asset.year}|${asset.path}`, rows]]), checkedAt: "2026-09-25T00:00:00.000Z", readback: { slug: candidate.slug, candidato_id: candidate.id, family: "patrimonio", public_profile: publicProfile } })
  assert.equal(result.reason, "ok")
})

test("apply projection changes only a unique 2026 row with matching preimage", () => {
  const profile = { slug: "fixture-candidate", financiamento: [{ ano_eleicao: 2026, total_arrecadado: 10, maiores_doadores: [{ nome: "Doadora Teste", valor: 10, tipo: "PF" }] }, { ano_eleicao: 2022, total_arrecadado: 5 }] }
  const action = { tipo: "atualizar_financiamento", slug: profile.slug, antes: { total_arrecadado: 10 }, depois: { total_arrecadado: 20 } }
  const projected = projectAuditedFinanceReadback(profile, [action])
  assert.deepEqual(projected.applied, ["atualizar_financiamento"])
  assert.equal((projected.profile.financiamento as Array<{ total_arrecadado: number }>)[0]?.total_arrecadado, 20)
  assert.equal(profile.financiamento[0]?.total_arrecadado, 10)
  assert.equal((projected.profile.financiamento as Array<{ total_arrecadado: number }>)[1]?.total_arrecadado, 5)
  assert.deepEqual((projected.profile.financiamento as Array<{ maiores_doadores?: unknown }>)[0]?.maiores_doadores, [{ nome: "Doadora Teste", valor: 10, tipo: "PF" }])
  assert.deepEqual(projectAuditedFinanceReadback(profile, [{ ...action, antes: { total_arrecadado: 11 } }]).applied, [])
  assert.deepEqual(projectAuditedFinanceReadback({ ...profile, financiamento: [...profile.financiamento, { ano_eleicao: 2026, total_arrecadado: 1 }] }, [action]).applied, [])
})

test("financiamento histórico substitui só ano único com pré-imagem e série publicadas", () => {
  const old = { ano_eleicao: 2022, cargo_candidatura: "DEPUTADO FEDERAL", total_arrecadado: 10, maiores_doadores: [] }
  const profile = { slug: "fixture-candidate", financiamento: [old, { ano_eleicao: 2026, total_arrecadado: 4 }], financiamento_eleicoes: [{ ano: 2022, estado: "nao_coletado" }, { ano: 2026, estado: "publicado" }] }
  const action = { tipo: "substituir_financiamento", slug: profile.slug, ano_eleicao: 2022, antes_publico: [old], depois: { ...old, total_arrecadado: 20 }, serie: { ano: 2022, estado: "publicado" } }
  const result = projectAuditedFinanceReadback(profile, [action])
  assert.deepEqual(result.applied, ["substituir_financiamento"])
  assert.equal((result.profile.financiamento as Array<{ total_arrecadado: number }>).find((row) => row.total_arrecadado === 4)?.total_arrecadado, 4)
  assert.equal((result.profile.financiamento_eleicoes as Array<{ ano: number; estado: string }>).find((row) => row.ano === 2022)?.estado, "publicado")
  assert.deepEqual(projectAuditedFinanceReadback(profile, [{ ...action, antes_publico: [{ ...old, total_arrecadado: 11 }] }]).applied, [])
  assert.deepEqual(projectAuditedFinanceReadback({ ...profile, financiamento: [...profile.financiamento, { ano_eleicao: 2022, total_arrecadado: 5 }] }, [action]).applied, [])
})

test("projeção patrimonial preserva anos distintos e exige pré-imagem pública", () => {
  const old = { ano_eleicao: 2022, sq_candidato: "123", uf_candidatura: "SP", valor_total: 10, bens: [{ tipo: "IMOVEL", descricao: "", valor: 10 }] }
  const other = { ano_eleicao: 2018, valor_total: 8, bens: [{ tipo: "VEICULO", descricao: "", valor: 8 }] }
  const sameYearOtherContext = { ano_eleicao: 2022, sq_candidato: "456", uf_candidatura: "RJ", valor_total: 4, bens: [] }
  const profile = { slug: "fixture-candidate", patrimonio: [old, other, sameYearOtherContext], patrimonio_eleicoes: [{ ano: 2022, estado: "publicado" }, { ano: 2018, estado: "publicado" }] }
  const action = { tipo: "substituir_patrimonio", slug: profile.slug, ano_eleicao: 2022, sq_candidato: "123", uf_candidatura: "SP", antes_publico: [old], depois: { ano_eleicao: 2022, valor_total: 20, bens: [{ tipo: "IMOVEL", descricao: "", valor: 20 }] } }
  const result = projectAuditedFinanceReadback(profile, [action])
  assert.deepEqual(result.applied, ["substituir_patrimonio"])
  assert.equal((result.profile.patrimonio as Array<{ valor_total: number }>).find((row) => row.valor_total === 8), other)
  assert.equal((result.profile.patrimonio as Array<{ valor_total: number }>).find((row) => row.valor_total === 4), sameYearOtherContext)
  assert.deepEqual(projectAuditedFinanceReadback(profile, [{ ...action, antes_publico: [{ ...old, valor_total: 11 }] }]).applied, [])
})

test("patrimônio só reconcilia cartão sem SQ público quando o ano é único", () => {
  const old = { ano_eleicao: 2026, cargo_candidatura: null, valor_total: 10, bens: [] }
  const profile = { slug: "fixture-candidate", patrimonio: [old], patrimonio_eleicoes: [{ ano: 2026, estado: "publicado" }] }
  const action = { tipo: "substituir_patrimonio", slug: profile.slug, ano_eleicao: 2026, sq_candidato: "123", uf_candidatura: "SP", match_mode: "unique_year_public" as const, antes_publico: [old], depois: { ano_eleicao: 2026, cargo_candidatura: "Governador", valor_total: 20, bens: [] } }
  const result = projectAuditedFinanceReadback(profile, [action])
  assert.deepEqual(result.applied, ["substituir_patrimonio"])
  assert.equal((result.profile.patrimonio as object[]).length, 1)
  assert.deepEqual(projectAuditedFinanceReadback({ ...profile, patrimonio: [old, { ...old, valor_total: 5 }] }, [action]).applied, [])
  assert.deepEqual(projectAuditedFinanceReadback(profile, [{ ...action, match_mode: "exact_context" as const, antes_publico: [] }]).applied, [])
})

test("pré-imagem patrimonial usa a mesma máscara pública do DTO", () => {
  const old = { id: "row-1", ano_eleicao: 2022, cargo_candidatura: null, tipo_eleicao: null, valor_total: 10,
    bens: [{ tipo: "IMOVEL", descricao: "registro 12345678901234", valor: 10 }] }
  const profile = { slug: "fixture-candidate", patrimonio: [old], patrimonio_eleicoes: [{ ano: 2022, estado: "publicado" }] }
  const action = { tipo: "substituir_patrimonio", slug: profile.slug, ano_eleicao: 2022, match_mode: "unique_year_public" as const,
    sq_candidato: "SQ-1", uf_candidatura: "SP", antes_publico: [publicPatrimonioRow(old)],
    depois: { ano_eleicao: 2022, cargo_candidatura: "Governador", tipo_eleicao: "ORDINARIA", valor_total: 10, bens: publicPatrimonioRow(old).bens } }
  assert.deepEqual(projectAuditedFinanceReadback(profile, [action]).applied, ["substituir_patrimonio"])
})

test("projeção histórica só substitui candidaturas TSE guardadas", () => {
  const old = { cargo: "Governador", cargo_canonico: null, tipo_evento: "candidatura", periodo_inicio: 2022, periodo_fim: 2022, partido: "ABC", estado: "SP", eleito_por: null, observacoes: "Candidatura: NÃO ELEITO (TSE 2022)", proveniencia: "tse" }
  const older = { ...old, periodo_inicio: 2006, periodo_fim: 2006, partido: "OLD" }
  const manual = { cargo: "Ministro", tipo_evento: "mandato", proveniencia: "manual", periodo_inicio: 2020 }
  const profile = { slug: "fixture-candidate", historico: [old, older, manual] }
  const after = { ...old, partido: "XYZ" }
  const result = projectAuditedFinanceReadback(profile, [{ tipo: "substituir_historico", slug: profile.slug, antes_publico: [old], depois: [after], source_revisions: [{ year: 2022 }] }])
  assert.deepEqual(result.applied, ["substituir_historico"])
  assert.equal((result.profile.historico as object[]).includes(manual), true)
  assert.equal((result.profile.historico as object[]).includes(older), true)
  assert.equal((result.profile.historico as Array<{ partido?: string }>).some((row) => row.partido === "XYZ"), true)
  assert.deepEqual(projectAuditedFinanceReadback(profile, [{ tipo: "substituir_historico", slug: profile.slug, antes_publico: [{ ...old, partido: "OTHER" }], depois: [after], source_revisions: [{ year: 2022 }] }]).applied, [])
})

test("recibo histórico comprova candidatura TSE sem cobrar mandato manual da fonte TSE", () => {
  const historyAsset = { ...asset, family: "historico_politico" as const, url: "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2022.zip" }
  const source = [{ SQ_CANDIDATO: "SQ-1", SG_UF: "SP", ANO_ELEICAO: "2022", DS_CARGO: "GOVERNADOR", SG_PARTIDO: "ABC", DS_SITUACAO_CANDIDATURA: "DEFERIDO", DS_SIT_TOT_TURNO: "ELEITO", NR_TURNO: "1" }]
  const profile = { id: candidate.id, slug: candidate.slug, historico: [
    { cargo: "Governador", cargo_canonico: "Governador", tipo_evento: "candidatura", periodo_inicio: 2022, partido: "ABC", estado: "SP", eleito_por: "ELEITO", observacoes: "Situação do registro: DEFERIDO. Resultado eleitoral: ELEITO", proveniencia: "tse" },
    { cargo: "Ministro", tipo_evento: "mandato", periodo_inicio: 2020, proveniencia: "manual" },
  ] }
  const { receipt, reason } = buildReceipt({ candidate, family: "historico_politico", assets: [historyAsset], sourceRowsByAsset: new Map([[`${historyAsset.family}|${historyAsset.year}|${historyAsset.path}`, source]]), checkedAt: "2026-09-25T00:00:00.000Z", readback: { slug: candidate.slug, candidato_id: candidate.id, family: "historico_politico", public_profile: profile } })
  assert.equal(reason, "ok")
  assert.equal(validCoverageSourceProof(profile, "historico_politico", { ...receipt, ...JSON.parse(String(receipt.detalhe)) }), true)
})

test("bem oficial positivo não confirma ano público marcado vazio", () => {
  const publicProfile = { id: candidate.id, slug: candidate.slug, patrimonio: [{ ano_eleicao: 2022, valor_total: 100, bens: [{ tipo: "IMOVEL", descricao: "", valor: 100 }] }], patrimonio_eleicoes: [{ ano: 2022, estado: "vazio_confirmado" }] }
  const { receipt } = buildReceipt({ candidate, family: "patrimonio", assets: [asset], sourceRowsByAsset: new Map([[`${asset.family}|${asset.year}|${asset.path}`, rows]]), checkedAt: "2026-09-25T00:00:00.000Z", readback: { slug: candidate.slug, candidato_id: candidate.id, family: "patrimonio", public_profile: publicProfile } })
  assert.equal(receipt.resultado, "indeterminado")
})

test("ano sem bens na série não invalida bens publicados em outro pleito", () => {
  const publicProfile = { id: candidate.id, slug: candidate.slug,
    patrimonio: [{ ano_eleicao: 2022, valor_total: 100, bens: [{ tipo: "IMOVEL", descricao: "", valor: 100 }] }],
    patrimonio_eleicoes: [{ ano: 2026, estado: "vazio_confirmado" }, { ano: 2022, estado: "publicado" }] }
  const { receipt } = buildReceipt({ candidate, family: "patrimonio", assets: [asset],
    sourceRowsByAsset: new Map([[`${asset.family}|${asset.year}|${asset.path}`, rows]]),
    checkedAt: "2026-09-25T00:00:00.000Z",
    readback: { slug: candidate.slug, candidato_id: candidate.id, family: "patrimonio", public_profile: publicProfile } })
  assert.equal(receipt.resultado, "encontrado")
})

test("cargo do contexto patrimonial exibido precisa coincidir com consulta_cand", () => {
  const profile = { id: candidate.id, slug: candidate.slug,
    patrimonio: [{ ano_eleicao: 2022, cargo_candidatura: "Senador", valor_total: 100, bens: [{ tipo: "IMOVEL", descricao: "", valor: 100 }] }],
    patrimonio_eleicoes: [{ ano: 2022, estado: "publicado" }] }
  const input = { candidate, family: "patrimonio" as const, assets: [asset],
    sourceRowsByAsset: new Map([[`${asset.family}|${asset.year}|${asset.path}`, rows]]),
    officialCargo: new Map([["2022|SQ-1|SP", "GOVERNADOR"]]), checkedAt: "2026-09-25T00:00:00.000Z",
    readback: { slug: candidate.slug, candidato_id: candidate.id, family: "patrimonio" as const, public_profile: profile } }
  assert.equal(buildReceipt(input).receipt.resultado, "indeterminado")
  assert.equal(buildReceipt({ ...input, officialCargo: new Map([["2022|SQ-1|SP", "SENADOR"]]) }).receipt.resultado, "encontrado")
})

test("histórico exige resultado oficial no texto exibido e ignora mandato de outra fonte", () => {
  const historyAsset = { ...asset, family: "historico_politico" as const, url: "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2022.zip" }
  const source = [{ SQ_CANDIDATO: "SQ-1", SG_UF: "SP", ANO_ELEICAO: "2022", DS_CARGO: "GOVERNADOR", SG_PARTIDO: "ABC", DS_SITUACAO_CANDIDATURA: "DEFERIDO", DS_SIT_TOT_TURNO: "NÃO ELEITO", NR_TURNO: "1" }]
  const candidature = { periodo_inicio: 2022, periodo_fim: 2022, cargo: "Governador", tipo_evento: "candidatura", partido: "ABC", estado: "SP", eleito_por: null, observacoes: "Candidatura: NÃO ELEITO (TSE 2022)", proveniencia: "tse" }
  const profile = { id: candidate.id, slug: candidate.slug, historico: [candidature, { periodo_inicio: 2020, cargo: "Ministro", tipo_evento: "mandato", proveniencia: "outra_fonte" }] }
  const input = { candidate, family: "historico_politico" as const, assets: [historyAsset], sourceRowsByAsset: new Map([[`historico_politico|2022|${historyAsset.path}`, source]]), checkedAt: "2026-09-25T00:00:00.000Z" }
  assert.equal(buildReceipt({ ...input, readback: { slug: candidate.slug, candidato_id: candidate.id, family: "historico_politico", public_profile: profile } }).receipt.resultado, "encontrado")
  const falseResult = { ...profile, historico: [{ ...candidature, observacoes: "Candidatura: ELEITO (TSE 2022)" }] }
  assert.equal(buildReceipt({ ...input, readback: { slug: candidate.slug, candidato_id: candidate.id, family: "historico_politico", public_profile: falseResult } }).receipt.resultado, "indeterminado")
})

test("financiamento só confirma categorias públicas exatamente iguais à fonte", () => {
  const financeAsset = { ...asset, family: "financiamento" as const }
  const source = [{ SQ_CANDIDATO: "SQ-1", SG_UF_CANDIDATURA: "SP", ANO_ELEICAO: "2022", VR_RECEITA: "100", DS_FONTE_RECEITA: "RECURSOS DE PESSOAS FÍSICAS", NM_DOADOR: "DOADOR FICTICIO", DS_TIPO_DOADOR: "PF" }]
  const financing = { ano_eleicao: 2022, total_arrecadado: 100, total_fundo_partidario: 0, total_fundo_eleitoral: 0, total_pessoa_fisica: 100, total_recursos_proprios: 0,
    categorias_origem: { fundo_eleitoral: 0, fundo_partidario: 0, outros_recursos: 100, nao_informado_pelo_tse: 0 }, maiores_doadores: [{ nome: "DOADOR FICTICIO", valor: 100, tipo: "PF" }] }
  const profile = { id: candidate.id, slug: candidate.slug, financiamento: [financing], financiamento_eleicoes: [{ ano: 2022, estado: "publicado" }] }
  const input = { candidate, family: "financiamento" as const, assets: [financeAsset], sourceRowsByAsset: new Map([[`financiamento|2022|${financeAsset.path}`, source]]), checkedAt: "2026-09-25T00:00:00.000Z" }
  assert.equal(buildReceipt({ ...input, readback: { slug: candidate.slug, candidato_id: candidate.id, family: "financiamento", public_profile: profile } }).receipt.resultado, "encontrado")
  const repeatedSource = [safeSourceRow({ ...source[0], SQ_RECEITA: "42", DT_GERACAO: "2026-09-26" }, 2022), safeSourceRow({ ...source[0], SQ_RECEITA: "42", DT_GERACAO: "2026-09-27" }, 2022)]
  assert.equal(buildReceipt({ ...input, sourceRowsByAsset: new Map([[`financiamento|2022|${financeAsset.path}`, repeatedSource]]), readback: { slug: candidate.slug, candidato_id: candidate.id, family: "financiamento", public_profile: profile } }).receipt.resultado, "encontrado")
  const internet = safeSourceRow({ ...source[0], DS_FONTE_RECEITA: "OUTROS RECURSOS", DS_ORIGEM_RECEITA: "Doações pela Internet", NR_CPF_CNPJ_DOADOR: "1".repeat(11) })
  const internetProfile = { ...profile, financiamento: [{ ...financing, total_pessoa_fisica: 0 }] }
  assert.equal(buildReceipt({ ...input, sourceRowsByAsset: new Map([[`financiamento|2022|${financeAsset.path}`, [internet]]]), readback: { slug: candidate.slug, candidato_id: candidate.id, family: "financiamento", public_profile: internetProfile } }).receipt.resultado, "encontrado")
  const withoutYear = source.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "ANO_ELEICAO")))
  assert.equal(buildReceipt({ ...input, sourceRowsByAsset: new Map([[`${financeAsset.family}|${financeAsset.year}|${financeAsset.path}`, withoutYear]]), readback: { slug: candidate.slug, candidato_id: candidate.id, family: "financiamento", public_profile: profile } }).receipt.resultado, "encontrado")
  const seriesWithUncollectedYear = { ...profile, financiamento_eleicoes: [...profile.financiamento_eleicoes, { ano: 2024, estado: "nao_coletado" }] }
  const seriesReceipt = buildReceipt({ ...input, readback: { slug: candidate.slug, candidato_id: candidate.id, family: "financiamento", public_profile: seriesWithUncollectedYear } }).receipt
  const seriesProof = { ...seriesReceipt, ...JSON.parse(String(seriesReceipt.detalhe)) }
  assert.equal(validCoverageSourceProof(seriesWithUncollectedYear, "financiamento", seriesProof), true)
  assert.equal(validCoverageSourceProof(seriesWithUncollectedYear, "financiamento", { ...seriesProof, coverage_proof: { ...seriesProof.coverage_proof, scope: undefined } }), false)
  const extra = { ...profile, financiamento: [{ ...financing, categorias_origem: { ...financing.categorias_origem, EXTRA: 0 } }] }
  assert.equal(buildReceipt({ ...input, readback: { slug: candidate.slug, candidato_id: candidate.id, family: "financiamento", public_profile: extra } }).receipt.resultado, "indeterminado")
})

test("marcador de receita 2026 confirma pleito futuro sem publicar falso zero", () => {
  const futureCandidate = { ...candidate, ids: { tse_sq_candidato: { "2026": "SQ-1" }, tse_uf_candidatura: { "2026": "SP" } } }
  const futureAsset = { ...asset, family: "financiamento" as const, year: 2026 }
  const marker = [{ SQ_CANDIDATO: "SQ-1", SG_UF_CANDIDATURA: "SP", SQ_RECEITA: "-1", VR_RECEITA: "0,00", NM_DOADOR: "#NULO#" }]
  const profile = { id: candidate.id, slug: candidate.slug, financiamento: [], financiamento_eleicoes: [{ ano: 2026, estado: "pleito_futuro" }] }
  const input = { candidate: futureCandidate, family: "financiamento" as const, assets: [futureAsset], sourceRowsByAsset: new Map([[`financiamento|2026|${futureAsset.path}`, marker]]), checkedAt: "2026-09-27T00:00:00.000Z" }
  assert.equal(buildReceipt({ ...input, readback: { slug: candidate.slug, candidato_id: candidate.id, family: "financiamento", public_profile: profile } }).receipt.resultado, "encontrado")
  const truncatedMarker = { ...input, sourceRowsByAsset: new Map([[`financiamento|2026|${futureAsset.path}`, [{ ...marker[0], NM_DOADOR: "#NULO" }]]]) }
  assert.equal(buildReceipt({ ...truncatedMarker, readback: { slug: candidate.slug, candidato_id: candidate.id, family: "financiamento", public_profile: profile } }).receipt.resultado, "encontrado")
  const outsideDisplayedSeries = { ...profile, financiamento_eleicoes: [{ ano: 2024, estado: "publicado" }] }
  assert.equal(buildReceipt({ ...truncatedMarker, readback: { slug: candidate.slug, candidato_id: candidate.id, family: "financiamento", public_profile: outsideDisplayedSeries } }).receipt.resultado, "encontrado")
  const wronglyDisplayed = { ...profile, financiamento_eleicoes: [{ ano: 2026, estado: "nao_coletado" }] }
  assert.equal(buildReceipt({ ...input, readback: { slug: candidate.slug, candidato_id: candidate.id, family: "financiamento", public_profile: wronglyDisplayed } }).receipt.resultado, "indeterminado")
  const falseZero = { ...profile, financiamento: [{ ano_eleicao: 2026, total_arrecadado: 0 }] }
  assert.equal(buildReceipt({ ...input, readback: { slug: candidate.slug, candidato_id: candidate.id, family: "financiamento", public_profile: falseZero } }).receipt.resultado, "indeterminado")
  const real = { SQ_CANDIDATO: "SQ-1", SG_UF_CANDIDATURA: "SP", SQ_RECEITA: "10", VR_RECEITA: "100,00", DS_FONTE_RECEITA: "RECURSOS DE PESSOAS FÍSICAS", NM_DOADOR: "Doadora Teste" }
  const published = { ...profile, financiamento: [{ ano_eleicao: 2026, total_arrecadado: 100, total_fundo_partidario: 0, total_fundo_eleitoral: 0, total_pessoa_fisica: 100, total_recursos_proprios: 0, maiores_doadores: [{ nome: "Doadora Teste", valor: 100, tipo: "PF" }] }], financiamento_eleicoes: [{ ano: 2026, estado: "publicado" }] }
  const mixed = { ...input, sourceRowsByAsset: new Map([[`financiamento|2026|${futureAsset.path}`, [...marker, real]]]) }
  assert.equal(buildReceipt({ ...mixed, readback: { slug: candidate.slug, candidato_id: candidate.id, family: "financiamento", public_profile: published } }).receipt.resultado, "encontrado")
})

test("partial TSE readback remains indeterminate", () => {
  const { receipt } = buildReceipt({ candidate, family: "patrimonio", assets: [asset], sourceRowsByAsset: new Map([[`${asset.family}|${asset.year}|${asset.path}`, rows]]), checkedAt: "2026-09-25T00:00:00.000Z" })
  assert.equal(receipt.resultado, "indeterminado")
  assert.equal(JSON.parse(String(receipt.detalhe)).coverage_proof.scope_complete, false)
})

test("financiamento legado exige sequencial e UF oficiais, sem join nominal", () => {
  const legacyAsset = { ...asset, family: "financiamento" as const, url: "https://cdn.tse.jus.br/estatistica/sead/odsele/prestacao_contas/prestacao_contas_2012.zip" }
  const legacyCandidate = { ...candidate, ids: { tse_sq_candidato: { "2012": "SQ-1" }, tse_uf_candidatura: { "2012": "SP" } } }
  const input = { candidate: legacyCandidate, family: "financiamento" as const, assets: [{ ...legacyAsset, year: 2012 }], checkedAt: "2026-09-25T00:00:00.000Z" }
  const sourceKey = `financiamento|2012|${legacyAsset.path}`
  const matched = buildReceipt({ ...input, sourceRowsByAsset: new Map([[sourceKey, [{ "Sequencial Candidato": "SQ-1", UF: "SP" }]]]) })
  assert.equal(JSON.parse(String(matched.receipt.detalhe)).identity_contract.matched_rows, 1)
  const withoutIdentity = buildReceipt({ ...input, sourceRowsByAsset: new Map([[sourceKey, [{ "Nome candidato": "Mesmo Nome", UF: "SP" }]]]) })
  assert.equal(JSON.parse(String(withoutIdentity.receipt.detalhe)).identity_contract.matched_rows, 0)
})

test("UF ausente só é aceita quando derivada de SQ e ano no pacote oficial", () => {
  const withoutUf = { ...candidate, ids: { tse_sq_candidato: candidate.ids.tse_sq_candidato } }
  const profile = { id: candidate.id, slug: candidate.slug, patrimonio: [{ ano_eleicao: 2022, valor_total: 100, bens: [{ tipo: "IMOVEL", descricao: "", valor: 100 }] }], patrimonio_eleicoes: [{ ano: 2022, estado: "publicado" }] }
  const input = { candidate: withoutUf, family: "patrimonio" as const, assets: [asset], sourceRowsByAsset: new Map([[`${asset.family}|${asset.year}|${asset.path}`, rows]]), checkedAt: "2026-09-25T00:00:00.000Z", readback: { slug: candidate.slug, candidato_id: candidate.id, family: "patrimonio" as const, public_profile: profile } }
  assert.equal(buildReceipt(input).receipt.resultado, "indeterminado")
  assert.equal(buildReceipt({ ...input, officialUf: new Map([["2022|SQ-1", "SP"]]) }).receipt.resultado, "encontrado")
})

test("UF oficial ambígua bloqueia recibo mesmo com UF no seed", () => {
  const profile = { id: candidate.id, slug: candidate.slug, patrimonio: [{ ano_eleicao: 2022, valor_total: 100, bens: [{ tipo: "IMOVEL", descricao: "", valor: 100 }] }], patrimonio_eleicoes: [{ ano: 2022, estado: "publicado" }] }
  const { receipt } = buildReceipt({ candidate, family: "patrimonio", assets: [asset], sourceRowsByAsset: new Map([[`${asset.family}|${asset.year}|${asset.path}`, rows]]), officialUf: new Map([["2022|SQ-1", null]]), checkedAt: "2026-09-25T00:00:00.000Z", readback: { slug: candidate.slug, candidato_id: candidate.id, family: "patrimonio", public_profile: profile } })
  assert.equal(receipt.resultado, "indeterminado")
})

test("UF de candidatura anterior no detalhe oficial resolve SQ antigo só com identidade única na UF", () => {
  const anchored = { ...candidate, ids: { ...candidate.ids, tse_divulga_prior_uf: { "2022": "SP" } } }
  const profile = { id: candidate.id, slug: candidate.slug, patrimonio: [{ ano_eleicao: 2022, valor_total: 100, bens: [{ tipo: "IMOVEL", descricao: "", valor: 100 }] }], patrimonio_eleicoes: [{ ano: 2022, estado: "publicado" }] }
  const row = { ...rows[0]!, SG_UE: "SP", NR_CANDIDATO: "123", DS_CARGO: "SENADOR", SG_PARTIDO: "X" }
  const input = { candidate: anchored, family: "patrimonio" as const, assets: [asset], officialUf: new Map([["2022|SQ-1", null]]), checkedAt: "2026-09-25T00:00:00.000Z", readback: { slug: candidate.slug, candidato_id: candidate.id, family: "patrimonio" as const, public_profile: profile } }
  const unique = buildReceipt({ ...input, sourceRowsByAsset: new Map([[`${asset.family}|${asset.year}|${asset.path}`, [row]]]) })
  assert.equal(unique.receipt.resultado, "encontrado")
  const duplicate = buildReceipt({ ...input, sourceRowsByAsset: new Map([[`${asset.family}|${asset.year}|${asset.path}`, [row, { ...row, NR_CANDIDATO: "456" }]]]) })
  assert.equal(duplicate.receipt.resultado, "indeterminado")
  assert.equal(JSON.parse(String(duplicate.receipt.detalhe)).identity_contract.matched_rows, 0)
})

test("perfil_atual cannot close without all core fields", () => {
  const profileAsset = { ...asset, family: "perfil_atual" as const, url: "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2022.zip" }
  const profileRows = [{ SQ_CANDIDATO: "SQ-1", SG_UF: "SP", ANO_ELEICAO: "2022", DS_CARGO: "SENADOR" }]
  const { receipt } = buildReceipt({ candidate, family: "perfil_atual", assets: [profileAsset], sourceRowsByAsset: new Map([[`${profileAsset.family}|${profileAsset.year}|${profileAsset.path}`, profileRows]]), checkedAt: "2026-09-25T00:00:00.000Z", readback: { slug: candidate.slug, candidato_id: candidate.id, family: "perfil_atual", public_profile: { id: candidate.id, slug: candidate.slug, partido_sigla: "X" }, core_fields: ["partido_sigla"] } })
  assert.equal(receipt.resultado, "indeterminado")
})

test("snapshot público reutilizado não inventa ID oficial nem aceita slug duplicado", () => {
  const dir = mkdtempSync(join(tmpdir(), "pf-tse-readback-"))
  const file = join(dir, "profiles.json")
  try {
    writeFileSync(file, JSON.stringify([{ id: candidate.id, slug: candidate.slug, patrimonio_eleicoes: [] }]))
    const rows = readbackFromPublicProfiles(file, [candidate])
    assert.equal(rows.get(`${candidate.slug}|patrimonio`)?.candidato_id, candidate.id)
    assert.equal(rows.get(`${candidate.slug}|patrimonio`)?.public_profile.ids, undefined)
    writeFileSync(file, JSON.stringify([{ id: candidate.id, slug: candidate.slug }, { id: candidate.id, slug: candidate.slug }]))
    assert.throws(() => readbackFromPublicProfiles(file, [candidate]), /duplicado/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

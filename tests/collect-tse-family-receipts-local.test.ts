import assert from "node:assert/strict"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { buildReceipt, money, readbackFromPublicProfiles, selectCsvMembers } from "../scripts/audit/collect-tse-family-receipts-local"

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

test("bem oficial positivo não confirma ano público marcado vazio", () => {
  const publicProfile = { id: candidate.id, slug: candidate.slug, patrimonio: [{ ano_eleicao: 2022, valor_total: 100, bens: [{ tipo: "IMOVEL", descricao: "", valor: 100 }] }], patrimonio_eleicoes: [{ ano: 2022, estado: "vazio_confirmado" }] }
  const { receipt } = buildReceipt({ candidate, family: "patrimonio", assets: [asset], sourceRowsByAsset: new Map([[`${asset.family}|${asset.year}|${asset.path}`, rows]]), checkedAt: "2026-09-25T00:00:00.000Z", readback: { slug: candidate.slug, candidato_id: candidate.id, family: "patrimonio", public_profile: publicProfile } })
  assert.equal(receipt.resultado, "indeterminado")
})

test("financiamento só confirma categorias públicas exatamente iguais à fonte", () => {
  const financeAsset = { ...asset, family: "financiamento" as const }
  const source = [{ SQ_CANDIDATO: "SQ-1", SG_UF_CANDIDATURA: "SP", ANO_ELEICAO: "2022", VR_RECEITA: "100", DS_FONTE_RECEITA: "DOACAO", NM_DOADOR: "DOADOR FICTICIO", DS_TIPO_DOADOR: "PF" }]
  const financing = { ano_eleicao: 2022, total_arrecadado: 100, categorias_origem: { DOACAO: 100 }, maiores_doadores: [{ nome: "DOADOR FICTICIO", valor: 100, tipo: "PF" }] }
  const profile = { id: candidate.id, slug: candidate.slug, financiamento: [financing], financiamento_eleicoes: [{ ano: 2022, estado: "publicado" }] }
  const input = { candidate, family: "financiamento" as const, assets: [financeAsset], sourceRowsByAsset: new Map([[`financiamento|2022|${financeAsset.path}`, source]]), checkedAt: "2026-09-25T00:00:00.000Z" }
  assert.equal(buildReceipt({ ...input, readback: { slug: candidate.slug, candidato_id: candidate.id, family: "financiamento", public_profile: profile } }).receipt.resultado, "encontrado")
  const extra = { ...profile, financiamento: [{ ...financing, categorias_origem: { DOACAO: 100, EXTRA: 0 } }] }
  assert.equal(buildReceipt({ ...input, readback: { slug: candidate.slug, candidato_id: candidate.id, family: "financiamento", public_profile: extra } }).receipt.resultado, "indeterminado")
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

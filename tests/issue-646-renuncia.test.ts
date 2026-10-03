import assert from "node:assert/strict"
import test from "node:test"
import identities from "../docs/operations/evidence/issue-646-20261002/identidades.json"
import sources from "../docs/operations/evidence/issue-646-20261002/fontes.json"
import { mapearJulgamento } from "../scripts/lib/tse-situacao-julgamento"
import { planCandidaturaSituacao, type SituacaoOficialCandidatura } from "../scripts/lib/candidatura-situacao-reconciliacao"
import { resolverSituacaoCandidaturaPublica } from "../src/lib/candidatura-situacao-evidencia"
import { buildCargoDisputadoProvenienceLabel, resolveCargoDisputadoProveniencia } from "../src/lib/candidatura-proveniencia"
import { observacaoComSituacaoVigente } from "../src/lib/candidatura-corrente-situacao"
import { candidaturaSituacaoFixture } from "./fixtures/visual/candidatura-situacao"
import { compareFichasTse } from "../scripts/lib/data-freshness/ficha-tse"
import { CandidateGeneralData } from "../src/components/CandidateGeneralData"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { readFileSync } from "node:fs"
import { SITUACAO_CANDIDATURA_DOMINIO } from "../src/lib/situacao-candidatura"

test("código 6 preserva Renúncia; desconhecidos e código/descrição contraditórios bloqueiam", () => {
  assert.deepEqual(mapearJulgamento({ sq: "1", codigo: "6", descricao: "RENÚNCIA" }), { ok: true, valor: "renuncia" })
  assert.equal(mapearJulgamento({ sq: "1", codigo: "99", descricao: "RENÚNCIA" }).ok, false)
  assert.equal(mapearJulgamento({ sq: "1", codigo: "2", descricao: "RENÚNCIA" }).ok, false)
})

for (const identity of identities) {
  test(`${identity.slug}: situação oficial e metadados independentes, regressão cinco + trio`, () => {
    const row = { ...identity, verificacao_campos: { unrelated: { verificado_em: "2026-08-05" } } }
    const plan = planCandidaturaSituacao(row, sources as SituacaoOficialCandidatura[])
    assert.equal(plan.status, "ready")
    const expected = ["150002551911", "260002551712", "70002553751"].includes(identity.sq_candidato_2026) ? "renuncia" : "indeferido"
    assert.equal(plan.after?.situacao_candidatura, expected)
    assert.deepEqual(plan.after?.verificacao_campos.unrelated, row.verificacao_campos.unrelated)
    assert.deepEqual(Object.keys(plan.after!).sort(), ["situacao_candidatura", "verificacao_campos"])
    const result = resolverSituacaoCandidaturaPublica(plan.after?.verificacao_campos.candidatura_situacao, expected, row.sq_candidato_2026, row.id)
    assert.equal(result.julgamento, expected === "renuncia" ? "Renúncia" : "Indeferido")
    assert.equal(result.recurso, "Desconhecido")
    if (expected === "renuncia") {
      const label = buildCargoDisputadoProvenienceLabel(resolveCargoDisputadoProveniencia({ ...row, situacao_candidatura: expected, chapa_2026: { tse_situacao_codigo: "Deferido" } }))
      assert.match(label, /Renúncia/)
      assert.match(observacaoComSituacaoVigente("Candidatura: deferido (TSE 2026)", expected)!, /Renúncia/)
    }
  })
}

test("fontes oficiais contraditórias ficam visíveis, sem escolher julgamento", () => {
  const row = { ...identities.find(x => x.slug === "pedro-coutinho")!, verificacao_campos: null }
  const evidence = sources.filter(x => x.sq === row.sq_candidato_2026) as SituacaoOficialCandidatura[]
  evidence[1] = { ...evidence[1], julgamento: { ...evidence[1].julgamento, valor: "deferido", descricao: "Deferido" } }
  const plan = planCandidaturaSituacao(row, evidence)
  assert.equal(plan.status, "review_required")
  assert.equal(plan.after?.situacao_candidatura, undefined)
  const result = resolverSituacaoCandidaturaPublica(plan.after?.verificacao_campos.candidatura_situacao, row.situacao_candidatura, row.sq_candidato_2026, row.id)
  assert.equal(result.julgamento, "Fontes oficiais divergentes")
})

test("auditoria distingue código não suportado de julgamento ausente", () => {
  const input = {
    fichas: [{ candidato_id: "a", slug: "a", sq_candidato: "1", office: "Senador", uf: "SP", partido_sigla: "ABC", situacao_candidatura: "deferido", numero_urna: "1", registro_nome_urna: "A" }],
    official: [{ sq_candidato: "1", cargo: "SENADOR", uf: "SP", nome_urna: "A", partido_sigla: "ABC", numero_urna: "1", sq_coligacao: "" }],
    sitesTse: null, publishedSites: null,
  }
  const unknown = compareFichasTse({ ...input, julgamentos: new Map([["1", { sq: "1", codigo: "99", descricao: "CASSADO" }]]) })
  assert.equal(unknown.fichas[0].checks.situacao, "nao_suportado")
  assert.ok(unknown.fichas[0].blocking.includes("situacao"))
  assert.equal(compareFichasTse({ ...input, julgamentos: new Map() }).fichas[0].checks.situacao, "ausente")
})

test("Renúncia é situação do registro, sem afirmar julgamento judicial", () => {
  const html = renderToStaticMarkup(createElement(CandidateGeneralData, { ficha: candidaturaSituacaoFixture("fixture-646-current-150002551911")! }))
  assert.match(html, /Situação do registro/)
  assert.doesNotMatch(html, /Julgamento do registro/)
})

test("retificação posterior remove Renúncia congelada da candidatura corrente", () => {
  const result = observacaoComSituacaoVigente("Candidatura: RENÚNCIA (TSE 2026)", "deferido")
  assert.doesNotMatch(result!, /ren[úu]ncia/i)
  assert.match(result!, /Situação do registro no TSE: deferido/)
})

test("readback vigente prova domínio completo, ACL e ausência de gravação dos probes", () => {
  const readback = readFileSync("supabase/readback/20261002180000_vocabulario_situacao_renuncia.readback.sql", "utf8")
  const expected = readback.split("esperado constant text[] := ARRAY[")[1].split("];")[0]
  assert.deepEqual([...expected.matchAll(/'([^']*)'/g)].map(match => match[1]), [...SITUACAO_CANDIDATURA_DOMINIO])
  assert.match(readback, /^BEGIN READ ONLY;/)
  assert.match(readback, /'RENUNCIA', '  renuncia  '/)
  assert.match(readback, /has_function_privilege\('public'/)
  assert.match(readback, /ARRAY\['anon', 'authenticated'\]/)
  assert.match(readback, /probe left rows behind/)
  assert.doesNotMatch(readback, /ARRAY\['renuncia', 'cancelado'/)
})

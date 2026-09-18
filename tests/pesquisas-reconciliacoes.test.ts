import "./helpers/server-only"

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { listarAlvosMonitoramento, obterContratoFonte } from "../scripts/lib/pesquisas-monitoramento"
import { parsePublicacaoMonitorada } from "../scripts/lib/pesquisas-monitoramento-adapters"
import { listarReconciliacoesMetadado, reconciliacaoMetadadoRevisada } from "../scripts/lib/pesquisas-monitoramento-reconciliacoes"

const CE_FIXTURE = "tests/fixtures/pesquisas-monitoramento/datafolha-estadual-amostra-intercalada.html"

test("a reconciliação revisada só vale para o par exato de registro, campo e valores", () => {
  const applied = reconciliacaoMetadadoRevisada({
    registration: "MG-00446/2026", field: "fim do campo", published: "2026-08-20", registered: "2026-08-21",
  })
  assert.ok(applied)
  assert.match(applied.quote, /18 a 20 de agosto de 2026/)

  // Outro registro não herda o recibo.
  assert.equal(reconciliacaoMetadadoRevisada({
    registration: "MG-01611/2026", field: "fim do campo", published: "2026-08-20", registered: "2026-08-21",
  }), null)
  // Outro campo do mesmo registro não é coberto.
  assert.equal(reconciliacaoMetadadoRevisada({
    registration: "MG-00446/2026", field: "início do campo", published: "2026-08-20", registered: "2026-08-21",
  }), null)
  // Valor publicado diferente reabre o conflito.
  assert.equal(reconciliacaoMetadadoRevisada({
    registration: "MG-00446/2026", field: "fim do campo", published: "2026-08-19", registered: "2026-08-21",
  }), null)
  // Valor registrado diferente reabre o conflito.
  assert.equal(reconciliacaoMetadadoRevisada({
    registration: "MG-00446/2026", field: "fim do campo", published: "2026-08-20", registered: "2026-08-22",
  }), null)
  // Amostra nunca foi reconciliada; o par de datas não se aplica a ela.
  assert.equal(reconciliacaoMetadadoRevisada({
    registration: "MG-00446/2026", field: "amostra", published: 1204, registered: 1205,
  }), null)
})

test("todo recibo de reconciliação carrega documento primário identificado", () => {
  const entries = listarReconciliacoesMetadado()
  assert.ok(entries.length > 0)
  for (const entry of entries) {
    assert.match(entry.registration, /^[A-Z]{2}-\d{5}\/2026$/)
    assert.match(entry.document_sha256, /^[a-f0-9]{64}$/)
    assert.match(entry.document_url, /^https:\/\//)
    assert.ok(entry.quote.length >= 20, `citação curta demais em ${entry.registration}`)
    assert.notEqual(entry.published, entry.registered)
  }
  // Um registro e campo não podem ter dois recibos concorrentes.
  const keys = entries.map((entry) => `${entry.registration}|${entry.field}`)
  assert.equal(new Set(keys).size, keys.length)
})

test("a amostra é lida mesmo com oração intercalada entre o sujeito e o verbo", () => {
  // "O levantamento, contratado pelo jornal O Povo, foi realizado ... com 1.022
  // eleitores" é a forma usada pela publicação do Ceará.
  const target = listarAlvosMonitoramento({ sourceId: "datafolha-folha-globo-estaduais-2026", uf: "CE" })[0]
  const html = readFileSync(CE_FIXTURE, "utf8")
  const evidence = parsePublicacaoMonitorada({
    html, observedAt: "2026-09-17T19:15:00.000Z", target, source: obterContratoFonte(target.source_id),
  })
  assert.equal(evidence.sample.size, 1022)
  assert.deepEqual(evidence.fieldwork, { start: "2026-08-10", end: "2026-08-12" })
})

test("o recibo revisado libera o fim do campo do Ceará sem liberar outro valor", () => {
  const target = listarAlvosMonitoramento({ sourceId: "datafolha-folha-globo-estaduais-2026", uf: "CE" })[0]
  const html = readFileSync(CE_FIXTURE, "utf8")
  const registry = {
    registration_id: "CE-04292/2026", office: "Governador", geography: "CEARÁ",
    field_start: "2026-08-10", field_end: "2026-08-13", sample_size: 1022, margin_error_pp: 3,
    institute: "CNPJ: 07630546000175 - DATAFOLHA INSTITUTO DE PESQUISAS LTDA.",
  }
  const registrySupplement = {
    registry, confidence_percent: 95, method: "Entrevistas presenciais em pontos de fluxo populacional",
    publication_date: "2026-08-13", source_url: "https://pesqele-divulgacao.tse.jus.br/app/pesquisa/listar.xhtml",
    observed_at: "2026-09-17T19:15:00.000Z", public_text: "",
  }
  const evidence = parsePublicacaoMonitorada({
    html, observedAt: "2026-09-17T19:15:00.000Z", target, source: obterContratoFonte(target.source_id),
    registrySupplement: registrySupplement as never,
  })
  assert.equal(evidence.fieldwork.end, "2026-08-12")

  // Controle negativo: um fim de campo registrado diferente do par revisado
  // volta a bloquear, em vez de herdar o recibo.
  assert.throws(() => parsePublicacaoMonitorada({
    html, observedAt: "2026-09-17T19:15:00.000Z", target, source: obterContratoFonte(target.source_id),
    registrySupplement: { ...registrySupplement, registry: { ...registry, field_end: "2026-08-14" } } as never,
  }), /metadados conflitantes/)
})

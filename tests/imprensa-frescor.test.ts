import "./helpers/server-only"
import test from "node:test"
import assert from "node:assert/strict"
import {
  buildMethodSourceRow,
  buildMethodSourceRows,
  computeMethodStateBoard,
  IMPRENSA_METHOD_SOURCES,
  METHOD_SITUACAO_LABELS,
  methodCadenceLabel,
  methodDeadlineLabel,
  type MethodStateRowInput,
} from "../src/lib/imprensa-frescor"
import { createImprensaMethodFreshnessLoader, getLatestSituacaoCheck } from "../src/lib/imprensa-frescor-server"

const source = IMPRENSA_METHOD_SOURCES.find((item) => item.id === "tse-current")!

test("fontes das fichas vêm do catálogo, com prazo, e incluem DJEN, CGU e TCU", () => {
  const ids = IMPRENSA_METHOD_SOURCES.map((item) => item.id)
  for (const id of ["tse-current", "processos-judiciais", "transparencia-sanctions", "tcu", "camara", "senado", "transparencia"]) {
    assert.ok(ids.includes(id), id)
  }
  for (const item of IMPRENSA_METHOD_SOURCES) {
    assert.ok(item.maxAgeHours !== null && item.maxAgeHours > 0, `${item.id} sem prazo`)
    assert.ok(item.receiptSources.length > 0, `${item.id} sem fonte de coleta`)
    assert.match(item.authorityUrl, /^https:\/\//)
  }
  assert.equal(source.maxAgeHours, 36)
  assert.ok(source.receiptSources.includes("tse-situacao"))
})

test("em dia até o prazo, atrasada depois, sem registro quando não há coleta", () => {
  const at = "2026-09-22T10:00:00.000Z"
  assert.equal(buildMethodSourceRow(source, at, "2026-09-23T22:00:00.000Z").situacao, "em_dia")
  assert.equal(buildMethodSourceRow(source, at, "2026-09-23T22:00:01.000Z").situacao, "atrasada")
  const none = buildMethodSourceRow(source, null, "2026-09-23T22:00:00.000Z")
  assert.deepEqual([none.situacao, none.ultimaColeta], ["sem_registro", null])
  assert.equal(buildMethodSourceRow(source, "não é data", at).situacao, "sem_registro")
  assert.equal(buildMethodSourceRow({ ...source, maxAgeHours: null }, at, at).situacao, "atrasada")
})

test("rótulos simples, sem horas quando o prazo é em dias", () => {
  assert.equal(methodDeadlineLabel(216), "Em dia até 9 dias depois da coleta.")
  assert.equal(methodDeadlineLabel(24), "Em dia até 1 dia depois da coleta.")
  assert.equal(methodDeadlineLabel(36), "Em dia até 36 horas depois da coleta.")
  assert.equal(methodDeadlineLabel(null), null)
  assert.equal(methodCadenceLabel("weekly"), "Semanal")
  assert.equal(methodCadenceLabel("desconhecido"), "Sem ritmo definido")
  for (const label of Object.values(METHOD_SITUACAO_LABELS)) assert.doesNotMatch(label, /[–—]/)
})

test("loader pergunta uma vez por fonte e monta as linhas", async () => {
  const asked: string[][] = []
  const load = createImprensaMethodFreshnessLoader(async (fontes) => {
    asked.push([...fontes])
    return fontes.includes("tcu") ? "2026-09-27T18:00:00.000Z" : null
  })
  const result = await load("2026-09-28T12:00:00.000Z")
  assert.equal(asked.length, IMPRENSA_METHOD_SOURCES.length)
  assert.equal(result.rows.find((row) => row.source.id === "tcu")?.situacao, "em_dia")
  assert.equal(result.rows.find((row) => row.source.id === "senado")?.situacao, "sem_registro")
  assert.deepEqual(
    buildMethodSourceRows({}, "2026-09-28T12:00:00.000Z").map((row) => row.situacao),
    IMPRENSA_METHOD_SOURCES.map(() => "sem_registro"),
  )
})

test("falha na consulta derruba a tabela inteira em vez de virar sem registro", async () => {
  const load = createImprensaMethodFreshnessLoader(async () => { throw new Error("timeout") })
  await assert.rejects(load("2026-09-28T12:00:00.000Z"))
  assert.equal(await getLatestSituacaoCheck(async () => { throw new Error("timeout") }), null)
  assert.equal(await getLatestSituacaoCheck(async (fontes) => (fontes[0] === "tse-situacao" ? "2026-09-24T17:22:25.641Z" : null)), "2026-09-24T17:22:25.641Z")
})

test("quadro conta cada estado nos quatro grupos e ignora o que não se aplica", () => {
  const row = (patrimonio: string, processos: string, sancoes: string, tcu: string, sites: string) =>
    ({ patrimonio: { estado: patrimonio }, processos: { estado: processos }, sancoes: { estado: sancoes }, tcu: { estado: tcu }, sites: { estado: sites } }) as unknown as MethodStateRowInput
  const board = computeMethodStateBoard([
    row("publicado", "indeterminado", "vazio-confirmado", "nao_aplicavel", "publicado"),
    row("sem_dado", "cobertura_parcial", "nao-verificado", "vazio_verificado", "vazio_confirmado"),
  ])
  const byId = Object.fromEntries(board.map((item) => [item.id, item.counts]))
  assert.deepEqual(byId.patrimonio, { publicado: 1, nada_consta: 0, parcial: 0, sem_confirmacao: 1 })
  assert.deepEqual(byId.processos, { publicado: 0, nada_consta: 0, parcial: 1, sem_confirmacao: 1 })
  assert.deepEqual(byId.tcu, { publicado: 0, nada_consta: 1, parcial: 0, sem_confirmacao: 0 })
  assert.deepEqual(byId.sites, { publicado: 1, nada_consta: 1, parcial: 0, sem_confirmacao: 0 })
})

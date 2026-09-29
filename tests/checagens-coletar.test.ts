import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { test } from "node:test"

const script = resolve("scripts/checagens-coletar.ts")
const reciboAntigo = {
  schema_version: "checagens-recibos-v1",
  candidate_id: "candidate-v1",
  candidate_slug: "candidate-v1",
  candidate_name: "Candidato de Teste",
  office: "deputado-estadual",
  uf: "SP",
  searched_at: "2026-09-26T00:00:00.000Z",
  result: "vazio_confirmado",
  leads: [],
  agencias: {},
  escopo: "fixture v1",
}

function executarNoDiretorio(temp: string, args: string[]) {
  return spawnSync(process.execPath, ["--conditions", "react-server", "--import", "tsx", script, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 15_000,
  })
}

test("--de-recibos recusa recibos internos sem a política atual", (t) => {
  const temp = mkdtempSync(join(tmpdir(), "checagens-policy-v1-"))
  t.after(() => rmSync(temp, { recursive: true, force: true }))
  const recibos = join(temp, "recibos.json")
  writeFileSync(recibos, JSON.stringify({ schema_version: "checagens-recibos-v1", receipts: [reciboAntigo] }))

  const resultado = executarNoDiretorio(temp, ["--de-recibos", recibos])

  assert.equal(resultado.status, 2)
  assert.match(resultado.stderr, /Política de recibos incompatível/)
  assert.match(resultado.stderr, /pf-checagens-v2/)
})

test("--retomar recusa recibos internos sem a política atual", (t) => {
  const temp = mkdtempSync(join(tmpdir(), "checagens-policy-v1-"))
  t.after(() => rmSync(temp, { recursive: true, force: true }))
  const recibos = join(temp, "recibos.json")
  writeFileSync(recibos, JSON.stringify({ schema_version: "checagens-recibos-v1", receipts: [reciboAntigo] }))

  const resultado = executarNoDiretorio(temp, ["--retomar", recibos, "--out", join(temp, "out")])

  assert.equal(resultado.status, 2)
  assert.match(resultado.stderr, /Política de recibos incompatível/)
  assert.match(resultado.stderr, /pf-checagens-v2/)
})

test("--de-recibos aceita política atual e avança para validar o cadastro", (t) => {
  const temp = mkdtempSync(join(tmpdir(), "checagens-policy-v2-"))
  t.after(() => rmSync(temp, { recursive: true, force: true }))
  const recibos = join(temp, "recibos.json")
  const roster = join(temp, "roster.json")
  writeFileSync(recibos, JSON.stringify({
    schema_version: "checagens-recibos-v1",
    receipts: [{ ...reciboAntigo, policy: "pf-checagens-v2" }],
  }))
  writeFileSync(roster, "[]\n")

  const resultado = executarNoDiretorio(temp, ["--de-recibos", recibos, "--roster", roster])

  assert.equal(resultado.status, 2)
  assert.doesNotMatch(resultado.stderr, /Política de recibos incompatível/)
  assert.match(resultado.stderr, /fora do cadastro da rodada/)
})

test("--de-recibos com --decisoes: reimportar o arquivo salvo com as mesmas decisões reproduz o catálogo", (t) => {
  const temp = mkdtempSync(join(tmpdir(), "checagens-decisoes-"))
  t.after(() => rmSync(temp, { recursive: true, force: true }))
  const agencias = ["lupa", "aos-fatos", "fato-ou-fake", "estadao-verifica", "uol-confere", "afp-checamos", "comprova"]
  const roster = [
    { id: "vera-sp", slug: "vera-sp", nome_urna: "Vera Lúcia", nome_completo: "Vera Lúcia Pereira", cargo_disputado: "Governador", estado: "SP" },
    { id: "vera-ce", slug: "vera-ce", nome_urna: "Vera Lúcia", nome_completo: "Vera Lucia da Silva", cargo_disputado: "Governador", estado: "CE" },
  ]
  const link = "https://exemplo.test/checagem/vera"
  const recibo = {
    schema_version: "checagens-recibos-v1", policy: "pf-checagens-v2",
    candidate_id: "vera-sp", candidate_slug: "vera-sp", candidate_name: "Vera Lúcia", office: "Governador", uf: "SP",
    searched_at: "2026-09-28T18:00:00.000Z", result: "nao_confirmado", leads: [],
    mesa: [{ agencia: "lupa", titulo: "Na sabatina, Vera Lúcia erra sobre dívidas", link, data_publicacao: null, motivo: "identidade_jev", noul_identidade: null }],
    agencias: Object.fromEntries(agencias.map((id) => [id, id === "lupa" ? { status: "ok", itens: 1, leads: 0, pendentes: 1 } : { status: "ok", itens: 0, leads: 0 }])),
    escopo: "fixture",
  }
  const arquivos = { recibos: join(temp, "recibos.json"), roster: join(temp, "roster.json"), decisoes: join(temp, "decisoes.json"), salvo: join(temp, "salvo.json"), c1: join(temp, "c1.json"), c2: join(temp, "c2.json") }
  writeFileSync(arquivos.recibos, JSON.stringify({ schema_version: "checagens-recibos-v1", receipts: [recibo] }))
  writeFileSync(arquivos.roster, JSON.stringify(roster))
  writeFileSync(arquivos.decisoes, JSON.stringify({ schema_version: "checagens-decisoes-v1", policy: "pf-checagens-v2", decisoes: [{ candidate_id: "vera-sp", candidate_slug: "vera-sp", link, decisao: "publicar", origem: "mesa" }] }))

  const primeira = executarNoDiretorio(temp, ["--de-recibos", arquivos.recibos, "--roster", arquivos.roster, "--decisoes", arquivos.decisoes, "--catalogo", arquivos.c1, "--salvar-recibos", arquivos.salvo])
  assert.equal(primeira.status, 0, primeira.stderr)
  const segunda = executarNoDiretorio(temp, ["--de-recibos", arquivos.salvo, "--roster", arquivos.roster, "--decisoes", arquivos.decisoes, "--catalogo", arquivos.c2])
  assert.equal(segunda.status, 0, segunda.stderr)
  const ler = (arquivo: string) => (JSON.parse(readFileSync(arquivo, "utf8")) as { receipts: Array<{ candidate_slug: string; result: string; leads: number }> }).receipts
  assert.deepEqual(ler(arquivos.c1).map((item) => [item.candidate_slug, item.result, item.leads]), [["vera-sp", "encontrado", 1]])
  assert.deepEqual(ler(arquivos.c2).map((item) => [item.candidate_slug, item.result, item.leads]), [["vera-sp", "encontrado", 1]])
})

test("trava do turno 1: antes de 05/10 roda; depois, só com o corte aplicado a Presidente ou Governador", async () => {
  const { motivoTravaTurno1 } = await import("../scripts/checagens-coletar")
  const { coorteAtualizacaoDe } = await import("../scripts/lib/coorte-atualizacao")
  const cadastro = [{ id: "g1", slug: "gov-a" }, { id: "p1", slug: "pres-b" }]
  const vazia = coorteAtualizacaoDe([], "banco")
  const encerrar = (candidato_id: string, slug: string) => ({ candidato_id, slug, fase_eleitoral: "nao_eleito", fase_turno: 1, atualizacao_encerrada_em: "2026-10-05T14:00:00Z" })
  // 04/10 às 23:30 em Brasília ainda é antes da trava (02:30 UTC de 05/10).
  assert.equal(motivoTravaTurno1(new Date("2026-10-05T02:30:00Z"), vazia, cadastro), null)
  const semApply = motivoTravaTurno1(new Date("2026-10-05T15:00:00Z"), vazia, cadastro)
  assert.match(semApply ?? "", /trava do turno 1: 2026-10-05.*turno-1 ainda não aplicado/)
  assert.match(motivoTravaTurno1(new Date("2026-10-05T15:00:00Z"), coorteAtualizacaoDe([encerrar("s1", "senador-c")], "banco"), cadastro) ?? "", /turno-1 ainda não aplicado/, "Senado encerrado não prova o corte de Presidente e Governador")
  assert.equal(motivoTravaTurno1(new Date("2026-10-05T15:00:00Z"), coorteAtualizacaoDe([encerrar("g1", "gov-a")], "banco"), cadastro), null)
  assert.match(motivoTravaTurno1(new Date("2026-10-12T15:00:00Z"), coorteAtualizacaoDe([], "tabela_ausente"), cadastro) ?? "", /view de fase eleitoral ausente/)
})

import assert from "node:assert/strict"
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

import { normalizarDespesas, type ResultadoNormalizacao } from "../scripts/lib/despesas-normalizar"
import { decidirAplicacao, planejarDespesas, shaDoPlanoDespesas, type CandidaturaColetada } from "../scripts/lib/despesas-plano"
import { main, salvarPrivado, SCHEMA_COLETA } from "../scripts/tse-despesas"
import { documentoPj } from "./fixtures/despesas/carregar"

function resultado(sq: string, ano: number, valor: number, totalOficial: number | null = valor): ResultadoNormalizacao {
  return normalizarDespesas(
    [{ tipo: "Publicidade por adesivos", valorCentavos: Math.round(valor * 100), documentoFornecedor: documentoPj(1), nomeFornecedor: "GRAFICA FICTICIA LTDA", descricao: null }],
    { origemTotalContratado: "oficial", total_despesas_contratadas: totalOficial, total_despesas_pagas: null, total_doacoes_a_terceiros_oficial: null, recursos_financeiros: null, recursos_estimaveis: null, divida_campanha: null, sobra_financeira: null },
    { ano_eleicao: ano, sq_candidato: sq, uf: "AP", municipio_codigo: null, cargo_candidatura: "Senador", prestacao_parcial: false, data_entrega: null, id_ultima_entrega: null, tipo_entrega: null, fonte: "teste", fonte_url: null, coletado_em: "2026-09-29T12:00:00.000Z" },
  )
}

function coleta(sq: string, ano: number, valor: number, totalOficial?: number | null): CandidaturaColetada {
  const r = resultado(sq, ano, valor, totalOficial === undefined ? valor : totalOficial)
  return { ano_eleicao: ano, sq_candidato: sq, resultado: r.divergencias.length ? "rejeitado" : "coletado", normalizado: r }
}

const vinculadas = [
  { candidato_id: "id-pessoa-b", slug: "pessoa-b", ano_eleicao: 2022, sq_candidato: "7000000102" },
  { candidato_id: "id-pessoa-b", slug: "pessoa-b", ano_eleicao: 2022, sq_candidato: "7000000103" },
  { candidato_id: "id-pessoa-a", slug: "pessoa-a", ano_eleicao: 2022, sq_candidato: "7000000101" },
  { candidato_id: "id-pessoa-x", slug: "pessoa-x", ano_eleicao: 2022, sq_candidato: "7000000300" },
  { candidato_id: "id-pessoa-y", slug: "pessoa-y", ano_eleicao: 2022, sq_candidato: "7000000300" },
]

test("colisão de candidatura: mesma pessoa, dois SQs no mesmo ano, duas linhas com chaves distintas", () => {
  const plano = planejarDespesas({ vinculadas, coletas: [coleta("7000000102", 2022, 10), coleta("7000000103", 2022, 20)] })
  assert.equal(plano.acoes.length, 2)
  const chaves = plano.acoes.map((a) => `${a.linha.candidato_id}|${a.linha.ano_eleicao}|${a.linha.sq_candidato}`)
  assert.deepEqual(chaves, ["id-pessoa-b|2022|7000000102", "id-pessoa-b|2022|7000000103"])
  assert.deepEqual(plano.acoes.map((a) => a.linha.total_despesas_contratadas), [10, 20])
})

test("só grava candidatura cujo SQ bate com a candidatura ligada; o resto vai para revisão", () => {
  const plano = planejarDespesas({
    vinculadas,
    coletas: [
      coleta("7000000101", 2022, 5),
      coleta("7000000199", 2022, 5),
      coleta("7000000101", 2018, 5),
      coleta("7000000300", 2022, 5),
      coleta("7000000102", 2022, 5, 6),
      { ano_eleicao: 2022, sq_candidato: "7000000103", resultado: "erro", motivo: "sq_ausente_do_pacote", normalizado: null },
    ],
  })
  assert.deepEqual(plano.acoes.map((a) => [a.slug, a.linha.sq_candidato]), [["pessoa-a", "7000000101"]])
  assert.deepEqual(plano.revisao.map((r) => [r.ano_eleicao, r.sq_candidato, r.motivo]), [
    [2018, "7000000101", "sq_sem_candidatura_vinculada"],
    [2022, "7000000102", "divergencia_de_conferencia"],
    [2022, "7000000103", "coleta_sem_resultado"],
    [2022, "7000000199", "sq_sem_candidatura_vinculada"],
    [2022, "7000000300", "sq_ligado_a_mais_de_um_candidato"],
  ])
  assert.equal(plano.resumo.revisao_por_motivo.divergencia_de_conferencia, 1)
})

test("coleta duplicada da mesma candidatura não grava nenhuma das duas", () => {
  const plano = planejarDespesas({ vinculadas, coletas: [coleta("7000000101", 2022, 5), coleta("7000000101", 2022, 6)] })
  assert.equal(plano.acoes.length, 0)
  assert.deepEqual(plano.revisao.map((r) => r.motivo), ["coleta_duplicada", "coleta_duplicada"])
})

test("SHA do plano é estável e muda quando uma linha muda", () => {
  const a = planejarDespesas({ vinculadas, coletas: [coleta("7000000101", 2022, 5)] })
  const b = planejarDespesas({ vinculadas, coletas: [coleta("7000000101", 2022, 5)] })
  const c = planejarDespesas({ vinculadas, coletas: [coleta("7000000101", 2022, 6)] })
  assert.equal(shaDoPlanoDespesas(a), shaDoPlanoDespesas(b))
  assert.notEqual(shaDoPlanoDespesas(a), shaDoPlanoDespesas(c))
})

test("escritor recusa --apply sem SHA ou com SHA diferente do plano", () => {
  const sha = "a".repeat(64)
  assert.deepEqual(decidirAplicacao({ aplicar: false, expectedPlanSha: null }, sha, 3), { aplicar: false, codigo: 0, motivo: "dry-run: nada gravado" })
  assert.equal(decidirAplicacao({ aplicar: true, expectedPlanSha: null }, sha, 3).codigo, 2)
  assert.equal(decidirAplicacao({ aplicar: true, expectedPlanSha: "xyz" }, sha, 3).codigo, 2)
  assert.equal(decidirAplicacao({ aplicar: true, expectedPlanSha: "b".repeat(64) }, sha, 3).codigo, 3)
  assert.equal(decidirAplicacao({ aplicar: true, expectedPlanSha: sha.toUpperCase() }, sha, 3).aplicar, true)
  assert.equal(decidirAplicacao({ aplicar: true, expectedPlanSha: sha }, sha, 0).aplicar, false)
})

test("CLI: --apply sem --expected-plan-sha sai com código 2 antes de ler o banco", async () => {
  const dir = mkdtempSync(join(tmpdir(), "despesas-cli-"))
  const erroOriginal = console.error
  try {
    const arquivo = join(dir, "coleta.json")
    writeFileSync(arquivo, JSON.stringify({ schema: SCHEMA_COLETA, gerado_em: "2026-09-29T12:00:00.000Z", origem: "historico", candidaturas: [] }))
    console.error = () => {}
    assert.equal(await main([`--coleta=${arquivo}`, "--apply", `--out=${dir}`]), 2)
  } finally {
    console.error = erroOriginal
    rmSync(dir, { recursive: true, force: true })
  }
})

test("plano e recibo ficam fora do repositório, modo 0600", () => {
  assert.throws(() => salvarPrivado(join(process.cwd(), "reports"), "plano.json", {}), /fora do repositório/)
  const dir = mkdtempSync(join(tmpdir(), "despesas-plano-"))
  try {
    const caminho = salvarPrivado(join(dir, "privado"), "plano.json", { ok: true })
    assert.equal(statSync(caminho).mode & 0o777, 0o600)
    assert.equal(statSync(join(dir, "privado")).mode & 0o777, 0o700)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

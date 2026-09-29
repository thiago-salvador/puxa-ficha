import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

import { assertEstadoSemDocumento, gravarEstadoJevDespesas, montarEstadoJevDespesas } from "../scripts/lib/despesas-jev"
import { normalizarDespesas } from "../scripts/lib/despesas-normalizar"
import { documentoPf, documentoPj } from "./fixtures/despesas/carregar"

const DOCUMENTOS = /\d{11,14}|\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/

function cenario() {
  const cpf = documentoPf(4)
  const cnpj = documentoPj(5)
  const cnpjPontuado = `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`
  const sqLongo = "2".repeat(12)
  const doacao = "Doações financeiras a outros candidatos/partidos"
  // O SQ usado aqui é o do teste (curto); o state nunca o carrega.
  return normalizarDespesas([
    { tipo: doacao, valorCentavos: 10000, documentoFornecedor: cnpj, nomeFornecedor: `ELEICAO 2026 FULANO FICTICIO ${cpf}`, descricao: null,
      destinatario: { sq: null, nome: `ELEICAO 2026 FULANO FICTICIO ${cpf}`, uf: null, cargo: null, partido: null, esferaPartidaria: null, contexto: `Direção Estadual ${cnpjPontuado} / DOADOR FICTICIO ${sqLongo}` } },
    { tipo: doacao, valorCentavos: 5000, documentoFornecedor: cpf, nomeFornecedor: "PESSOA FICTICIA PRIVADA", descricao: null },
    { tipo: "#NULO", valorCentavos: 700, documentoFornecedor: cnpj, nomeFornecedor: `SOM FICTICIO ${cpf}`, descricao: `Carro de som, recibo ${cnpj} e CPF ${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}` },
    { tipo: "", valorCentavos: 300, documentoFornecedor: cpf, nomeFornecedor: "PESSOA FICTICIA PRIVADA", descricao: "Panfletagem" },
  ], {
    origemTotalContratado: "oficial", total_despesas_contratadas: 160, total_despesas_pagas: null, total_doacoes_a_terceiros_oficial: 150,
    recursos_financeiros: null, recursos_estimaveis: null, divida_campanha: null, sobra_financeira: null,
  }, {
    ano_eleicao: 2026, sq_candidato: "9000000001", uf: "SP", municipio_codigo: null, cargo_candidatura: "Governador", prestacao_parcial: true,
    data_entrega: null, id_ultima_entrega: "7000000", tipo_entrega: null, fonte: "teste", fonte_url: null, coletado_em: "2026-09-29T12:00:00.000Z",
  })
}

test("state do Jev: só flags e texto sem documento, nenhum trecho de 11 ou 14 dígitos", () => {
  const resultado = cenario()
  assert.deepEqual(resultado.divergencias, [])
  const estado = montarEstadoJevDespesas([
    { ano_eleicao: 2026, sq_candidato: "2".repeat(12), resultado },
    { ano_eleicao: 2026, sq_candidato: "9000000001", resultado },
  ])
  const json = JSON.stringify(estado)
  assert.doesNotMatch(json, DOCUMENTOS)
  assert.ok(!json.includes("2".repeat(11)), "SQ longo não entra no state")
  const candidatura = estado.candidaturas[0]!
  assert.equal(candidatura.doacoes_sem_sq.length, 2)
  const pj = candidatura.doacoes_sem_sq.find((d) => d.flags.documento_fornecedor === "PJ")!
  assert.equal(pj.destinatario_nome, "ELEICAO 2026 FULANO FICTICIO")
  assert.equal(pj.destinatario_tipo_regra, "candidato")
  assert.equal(pj.flags.nome_parece_campanha, true)
  const pf = candidatura.doacoes_sem_sq.find((d) => d.flags.documento_fornecedor === "PF")!
  assert.equal(pf.destinatario_nome, null, "nome de pessoa física não vai ao Jev")
  assert.deepEqual(candidatura.categorias_nao_informadas.map((c) => [c.fornecedor_nome, c.flags.tipo_original]), [["SOM FICTICIO", "sentinela"], [null, "vazio"]])
  assert.ok(!json.includes("PESSOA FICTICIA PRIVADA"))
})

test("state com documento é recusado antes de gravar", () => {
  assert.throws(() => assertEstadoSemDocumento({ texto: `x ${documentoPf(1)}` }), /11 a 14 dígitos/)
})

test("state gravado fora do repositório, modo 0600", () => {
  const estado = montarEstadoJevDespesas([{ ano_eleicao: 2026, sq_candidato: "9000000001", resultado: cenario() }])
  assert.throws(() => gravarEstadoJevDespesas(join(process.cwd(), "tmp", "jev.json"), estado), /fora do repositório/)
  const dir = mkdtempSync(join(tmpdir(), "despesas-jev-"))
  try {
    const caminho = gravarEstadoJevDespesas(join(dir, "jev.json"), estado)
    assert.equal(statSync(caminho).mode & 0o777, 0o600)
    assert.doesNotMatch(readFileSync(caminho, "utf8"), DOCUMENTOS)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

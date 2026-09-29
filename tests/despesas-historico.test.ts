import assert from "node:assert/strict"
import { readdirSync } from "node:fs"
import { test } from "node:test"

import {
  centavosDoCsv,
  lerDespesasHistoricas,
  lerRegistrosCsv,
  normalizarCandidaturaHistorica,
} from "../scripts/lib/despesas-historico"
import { CATEGORIA_NAO_INFORMADA, textoTemDocumento } from "../scripts/lib/despesas-normalizar"
import { abrirMembroFixture, DIR_HISTORICO_2022 } from "./fixtures/despesas/carregar"

const SQ_A = "7000000101"
const SQ_B = "7000000102"
const SQ_C = "7000000103"
const SQ_AUSENTE = "7000000104"

async function lerFixture() {
  return lerDespesasHistoricas({
    ano: 2022,
    coorteSq: new Set([SQ_A, SQ_B, SQ_C, SQ_AUSENTE]),
    membros: readdirSync(DIR_HISTORICO_2022),
    abrirMembro: abrirMembroFixture,
  })
}

async function* pedacos(texto: string, tamanho = 3) {
  const bytes = Buffer.from(texto, "latin1")
  for (let i = 0; i < bytes.length; i += tamanho) yield bytes.subarray(i, i + tamanho)
}

test("CSV em fluxo: latin1, aspas, ponto e vírgula dentro de aspas e quebra de pedaço", async () => {
  const registros: string[][] = []
  for await (const r of lerRegistrosCsv(pedacos("\"A\";\"B\";C\r\n\"Doações; \"\"x\"\"\";12;-1\r\n\"\";#NULO;\"fim\""))) registros.push(r)
  assert.deepEqual(registros, [["A", "B", "C"], ["Doações; \"x\"", "12", "-1"], ["", "#NULO", "fim"]])
})

test("valores da fonte em centavos: vírgula decimal, sentinela e lixo", () => {
  assert.equal(centavosDoCsv("1500,5"), 150050)
  assert.equal(centavosDoCsv("1500,50"), 150050)
  assert.equal(centavosDoCsv("1.234,56"), 123456)
  assert.equal(centavosDoCsv("0.1"), 10)
  assert.equal(centavosDoCsv("-1"), null)
  assert.equal(centavosDoCsv("#NULO"), null)
  assert.equal(centavosDoCsv("abc"), null)
})

test("pagas: várias despesas do mesmo prestador contam o pagamento uma vez só", async () => {
  const r = await lerFixture()
  const a = r.candidaturas.find((c) => c.sq_candidato === SQ_A)!
  assert.equal(a.itens.length, 8)
  assert.deepEqual(a.prestadores, ["5000101"])
  assert.equal(a.total_pagas_centavos, 150050)
  const n = normalizarCandidaturaHistorica(a, 2022, "https://exemplo.invalid/pacote.zip", "2026-09-29T12:00:00.000Z")
  assert.deepEqual(n.divergencias, [])
  assert.equal(n.linha.total_despesas_contratadas, 5000)
  assert.equal(n.linha.total_despesas_pagas, 1500.5)
  assert.equal(n.linha.concentracao_despesas.reduce((s, c) => s + Math.round(c.valor * 100), 0), 500000)
  assert.equal(n.linha.estado_coleta, "declarado")
  assert.equal(n.linha.prestacao_parcial, false)
  assert.equal(n.linha.municipio_codigo, null)
})

test("prestador ligado a mais de uma candidatura fica isolado: pagas null, conservação de linhas e valores", async () => {
  const r = await lerFixture()
  const b = r.candidaturas.find((c) => c.sq_candidato === SQ_B)!
  assert.equal(b.pagas_isoladas, true)
  assert.equal(b.total_pagas_centavos, null)
  assert.deepEqual(r.ambiguos, [{ sq_prestador: "5000200", motivo: "prestador_com_varias_candidaturas" }])
  const n = normalizarCandidaturaHistorica(b, 2022, null, "2026-09-29T12:00:00.000Z")
  assert.equal(n.linha.total_despesas_pagas, null)
  assert.equal(n.linha.total_despesas_contratadas, 250)
  assert.deepEqual(r.conservacao_pagas, {
    linhas_lidas: 4, linhas_atribuidas: 3, linhas_isoladas: 1,
    centavos_lidos: 245050, centavos_atribuidos: 220050, centavos_isolados: 25000, linhas_invalidas: 0,
  })
})

test("mesma pessoa com duas candidaturas no ano: chaves separadas por SQ", async () => {
  const r = await lerFixture()
  const b = r.candidaturas.find((c) => c.sq_candidato === SQ_B)!
  const c = r.candidaturas.find((x) => x.sq_candidato === SQ_C)!
  assert.notEqual(b.cargo_candidatura, c.cargo_candidatura)
  assert.equal(c.total_pagas_centavos, 70000)
  assert.equal(c.itens.length, 1)
  assert.equal(b.itens.length, 1)
  assert.deepEqual(r.nao_encontradas, [SQ_AUSENTE])
})

test("receitas: natureza financeira e estimável (latin1) separadas; sem receita fica null", async () => {
  const r = await lerFixture()
  const a = r.candidaturas.find((c) => c.sq_candidato === SQ_A)!
  assert.equal(a.recursos_financeiros_centavos, 200000)
  assert.equal(a.recursos_estimaveis_centavos, 30000)
  const b = r.candidaturas.find((c) => c.sq_candidato === SQ_B)!
  assert.equal(b.recursos_financeiros_centavos, null)
  assert.equal(b.recursos_estimaveis_centavos, null)
})

test("histórico: doação com SQ oficial vira candidato; sem SQ, partido fica partido; sentinela vira 'Não informada'", async () => {
  const r = await lerFixture()
  const a = r.candidaturas.find((c) => c.sq_candidato === SQ_A)!
  const n = normalizarCandidaturaHistorica(a, 2022, null, "2026-09-29T12:00:00.000Z")
  assert.deepEqual(n.linha.doacoes_a_terceiros, [
    { destinatario_tipo: "candidato", destinatario_nome: "ELEICAO 2022 FULANO FICTICIO DEPUTADO ESTADUAL", uf: "AP", cargo: "Deputado Estadual", partido: "PFX", valor: 1000, candidato_slug: null },
    { destinatario_tipo: "partido", destinatario_nome: "DIRETORIO ESTADUAL PARTIDO FICTICIO", uf: null, cargo: null, partido: "PFX", valor: 600, candidato_slug: null },
  ])
  assert.equal(n.linha.total_doacoes_a_terceiros, 1600)
  assert.equal(n.pendencias_jev.doacoes_sem_sq.length, 1)
  const nao = n.linha.concentracao_despesas.find((c) => c.tipo === CATEGORIA_NAO_INFORMADA)
  assert.deepEqual(nao, { tipo: CATEGORIA_NAO_INFORMADA, quantidade: 1, valor: 300 })
  assert.equal(n.pendencias_jev.categorias_nao_informadas[0]!.descricao, "Servico de carro de som")
  const pf = n.linha.maiores_fornecedores.find((f) => f.tipo === "PF_agregado")
  assert.deepEqual(pf, { tipo: "PF_agregado", quantidade_prestadores: 2, quantidade: 3, valor: 1100 })
  const pj = n.linha.maiores_fornecedores.flatMap((f) => (f.tipo === "PJ" ? [[f.nome, f.valor]] : []))
  assert.deepEqual(pj, [["GRAFICA FICTICIA LTDA", 2000], ["ELEICAO 2022 FULANO FICTICIO DEPUTADO ESTADUAL", 1000], ["DIRETORIO ESTADUAL PARTIDO FICTICIO", 600], ["SOM AMBULANTE FICTICIO", 300]])
  assert.equal(textoTemDocumento([n.linha.concentracao_despesas, n.linha.maiores_fornecedores, n.linha.doacoes_a_terceiros, n.pendencias_jev]), false)
})

test("cabeçalho sem coluna exigida falha em vez de ler errado", async () => {
  await assert.rejects(lerDespesasHistoricas({
    ano: 2022,
    coorteSq: new Set([SQ_A]),
    membros: ["despesas_contratadas_candidatos_2022_AP.csv", "despesas_pagas_candidatos_2022_AP.csv"],
    abrirMembro: () => pedacos("\"SQ_CANDIDATO\";\"VR_DESPESA_CONTRATADA\"\r\n1;2\r\n"),
  }), /cabeçalho sem/)
})

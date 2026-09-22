import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { eixosDoTemaCanonico, eixosDoTexto } from "../scripts/lib/promessa-eixos"
import { posicoesForaDeQuarentena, type SnapshotEvidencias } from "../scripts/promessa-evidencia-coletar"
import { gerarPares, normalizarEvidencias, reciboPares } from "../scripts/promessa-evidencia-pares"
import { compromissosDoRegistro, type ProgramaCompromissos } from "../scripts/promessa-evidencia-programas"
import type { ProgramaGovernoRegistro } from "../src/lib/programa-governo"

const A = "00000000-0000-0000-0000-00000000000a"
const B = "00000000-0000-0000-0000-00000000000b"

const programas: ProgramaCompromissos[] = [
  {
    slug: "cand-a", programaChave: "2026:GOVERNADOR:SP:250000000001", cargo: "GOVERNADOR", uf: "SP",
    temas: [
      { temaId: "saude-publica", titulo: "Saúde pública", descricao: "Ampliar atendimento no SUS.", evidencias: [], frases: [] },
      { temaId: "sustentabilidade", titulo: "Sustentabilidade", descricao: "Metas de reciclagem.", evidencias: [], frases: [] },
    ],
  },
  {
    slug: "cand-b", programaChave: "2026:GOVERNADOR:RS:210000000002", cargo: "GOVERNADOR", uf: "RS",
    temas: [{ temaId: "seguranca", titulo: "Segurança", descricao: "Reforçar a polícia.", evidencias: [], frases: [] }],
  },
]

function snapshot(): SnapshotEvidencias {
  return {
    schema_version: "promessa-evidencia-snapshot-v1",
    coletado_em: "2026-09-22T00:00:00Z",
    candidatos: [{ id: A, slug: "cand-a", mandatoFederal: true }, { id: B, slug: "cand-b", mandatoFederal: false }],
    votos: [{
      id: "voto-1", candidato_id: A, voto: "sim", contradicao: false, contradicao_descricao: null,
      votacao: { id: "vc-1", titulo: "Piso da enfermagem", descricao: null, data_votacao: "2022-07-13", casa: "Câmara", tema: "direitos_sociais", proposicao_id: "1" },
    }],
    projetos: [
      { id: "pl-1", candidato_id: A, tipo: "PL", numero: "1", ano: 2023, ementa: "Cria programa de vacinação nas escolas.", tema: null, situacao: null, url_inteiro_teor: null },
      { id: "emc-1", candidato_id: A, tipo: "EMC", numero: "2", ano: 2023, ementa: "Emenda sobre hospitais.", tema: null, situacao: null, url_inteiro_teor: null },
      { id: "req-1", candidato_id: A, tipo: "REQ", numero: "3", ano: 2023, ementa: "Requer informações sobre o SUS.", tema: null, situacao: null, url_inteiro_teor: null },
    ],
    posicoes: [{ id: "pos-1", candidato_id: B, tema: "reforma_trabalhista", posicao: "contra", descricao: "Contra a reforma.", fonte: null, url_fonte: null }],
    contradicoes: [],
    falas: [{
      id: "fala-1", candidate_id: B, candidate_slug: "cand-b", quote_text: "Vamos colocar mais policiais nas ruas.", context: "Sabatina",
      article_url: "https://example.org/a", occurred_on: "2026-09-01", event_type: "sabatina",
    } as unknown as SnapshotEvidencias["falas"][number]],
  }
}

test("eixos casam palavra inteira quando a regra pede e nao confundem nomes proprios", () => {
  assert.ok(eixosDoTexto("Ampliar o SUS").has("saude"))
  assert.ok(!eixosDoTexto("Sustentabilidade da gestão").has("saude"))
  assert.ok(!eixosDoTexto("Obras em Porto Alegre").has("seguranca"))
  assert.ok(!eixosDoTexto("Armazém de grãos").has("seguranca"))
  assert.ok(eixosDoTexto("Controle de armas de fogo").has("seguranca"))
  assert.ok(eixosDoTexto("Educação em tempo integral").has("educacao"))
  assert.deepEqual([...eixosDoTemaCanonico("privatizacao_eletrobras")], ["estatais_privatizacao"])
  assert.deepEqual([...eixosDoTemaCanonico("tema_desconhecido")], [])
})

test("emendas e requerimentos nao viram evidencia; projeto autoral vira", () => {
  const refs = normalizarEvidencias(snapshot()).filter((e) => e.tipo === "projeto_lei").map((e) => e.ref)
  assert.deepEqual(refs, ["pl-1"])
})

test("pares so ligam compromisso e evidencia do mesmo candidato com eixo comum", () => {
  const pares = gerarPares(programas, snapshot())
  for (const par of pares) {
    const slugDaEvidencia = snapshot().candidatos.find((c) => c.id === par.evidencia.candidatoId)?.slug
    assert.equal(par.slug, slugDaEvidencia)
    assert.ok(par.eixosComuns.length > 0)
  }
  const chaves = pares.map((p) => `${p.slug}:${p.compromisso.temaId}:${p.evidencia.ref}`).sort()
  assert.deepEqual(chaves, [
    "cand-a:saude-publica:pl-1",
    "cand-a:saude-publica:voto-1",
    "cand-b:seguranca:fala-1",
  ])
  assert.equal(new Set(pares.map((p) => p.parId)).size, pares.length)
})

test("par tem id estavel e a ordem nao depende da entrada", () => {
  const primeiro = gerarPares(programas, snapshot()).map((p) => p.parId)
  const invertido = snapshot()
  invertido.projetos.reverse()
  invertido.votos.reverse()
  assert.deepEqual(gerarPares([...programas].reverse(), invertido).map((p) => p.parId), primeiro)
  assert.ok(primeiro.every((id) => /^[0-9a-f]{16}$/u.test(id)))
})

test("recibo conta governador sem mandato federal e so com fala ou posicao", () => {
  const snap = snapshot()
  const recibo = reciboPares(programas, snap, gerarPares(programas, snap))
  assert.equal(recibo.pares, 3)
  assert.equal(recibo.governadoresPublicos, 2)
  assert.equal(recibo.governadoresSemMandatoFederal, 1)
  assert.equal(recibo.governadoresSoFalaOuPosicao, 1)
  assert.deepEqual(recibo.paresPorTipo, { projeto_lei: 1, votacao_chave: 1, fala: 1 })
})

test("posicao em quarentena ativa nao vira evidencia", () => {
  const posicoes = [
    { candidato_id: A, tema: "previdencia", posicao: "a_favor", url_fonte: "https://x" },
    { candidato_id: A, tema: "previdencia", posicao: "contra", url_fonte: "https://y" },
  ]
  const soltas = posicoesForaDeQuarentena(posicoes, [{ candidato_id: A, tema: "previdencia", posicao: "a_favor", url_fonte: "https://x" }])
  assert.deepEqual(soltas.map((p) => p.posicao), ["contra"])
})

test("compromisso por tema traz as frases que citam a mesma evidencia do tema", () => {
  const registro = JSON.parse(readFileSync("src/data/programas-governo/presidencia-2026/lula.json", "utf8")) as ProgramaGovernoRegistro
  const compromissos = compromissosDoRegistro(registro)
  assert.ok(compromissos)
  assert.equal(compromissos.programaChave, "2026:PRESIDENTE:BR:280002542548")
  assert.equal(compromissos.temas.length, registro.resumo!.temas.length)
  const frasesLigadas = compromissos.temas.flatMap((t) => t.frases)
  assert.equal(new Set(frasesLigadas.map((f) => f.id)).size, frasesLigadas.length, "frase entra em no maximo um tema")
  for (const frase of frasesLigadas) {
    assert.ok(registro.resumo!.frases.some((original) => original.id === frase.id && original.texto === frase.texto))
  }
})

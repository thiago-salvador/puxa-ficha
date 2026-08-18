import test from "node:test"
import assert from "node:assert/strict"

import { enrichContradictions, normalizeContradictionText } from "../src/lib/contradiction-utils"
import type { PontoAtencao, VotoCandidato } from "../src/lib/types"

function voto(partial: Partial<VotoCandidato> & Pick<VotoCandidato, "id" | "votacao_id" | "voto">): VotoCandidato {
  return {
    id: partial.id,
    candidato_id: partial.candidato_id ?? "c1",
    votacao_id: partial.votacao_id,
    voto: partial.voto,
    contradicao: partial.contradicao ?? true,
    contradicao_descricao: partial.contradicao_descricao ?? null,
    votacao: partial.votacao,
  }
}

function ponto(partial: Partial<PontoAtencao> & Pick<PontoAtencao, "id" | "titulo">): PontoAtencao {
  return {
    id: partial.id,
    candidato_id: partial.candidato_id ?? "c1",
    categoria: partial.categoria ?? "contradição",
    titulo: partial.titulo,
    descricao: partial.descricao ?? "",
    fontes: partial.fontes ?? [],
    gravidade: partial.gravidade ?? "media",
    verificado: partial.verificado ?? true,
    gerado_por: partial.gerado_por ?? "curadoria",
    visivel: partial.visivel,
    data_referencia: partial.data_referencia,
  }
}

test("empty inputs yield empty enriched and empty unmatched", () => {
  const { enriched, unmatched } = enrichContradictions([], [])
  assert.deepEqual(enriched, [])
  assert.deepEqual(unmatched, [])
})

test("empty votos returns empty enriched and all pontos unmatched", () => {
  const pts = [ponto({ id: "p1", titulo: "x" })]
  const { enriched, unmatched } = enrichContradictions([], pts)
  assert.deepEqual(enriched, [])
  assert.equal(unmatched.length, 1)
  assert.equal(unmatched[0].id, "p1")
})

test("voto with contradiction and no ponto match → pontoAtencao null", () => {
  const votos = [
    voto({
      id: "v1",
      votacao_id: "t1",
      voto: "não",
      votacao: {
        id: "t1",
        titulo: "Tema Unico XYZ",
        descricao: "",
        data_votacao: "2020-01-01",
        casa: "Senado",
        tema: "x",
        impacto_popular: "y",
      },
    }),
  ]
  const { enriched, unmatched } = enrichContradictions(votos, [
    ponto({ id: "p1", titulo: "Outro assunto completamente diferente" }),
  ])
  assert.equal(enriched.length, 1)
  assert.equal(enriched[0].pontoAtencao, null)
  assert.equal(unmatched.length, 1)
})

test("match by title is case insensitive", () => {
  const votos = [
    voto({
      id: "v1",
      votacao_id: "t1",
      voto: "sim",
      votacao: {
        id: "t1",
        titulo: "REFORMA TRIBUTARIA",
        descricao: "",
        data_votacao: "2023-01-01",
        casa: "Câmara",
        tema: "eco",
        impacto_popular: "z",
      },
    }),
  ]
  const pts = [ponto({ id: "p1", titulo: "nota sobre reforma tributaria no plenario" })]
  const { enriched, unmatched } = enrichContradictions(votos, pts)
  assert.equal(enriched[0].pontoAtencao?.id, "p1")
  assert.equal(unmatched.length, 0)
})

test("accent folding: Tributária matches Tributaria", () => {
  const votos = [
    voto({
      id: "v1",
      votacao_id: "t1",
      voto: "não",
      votacao: {
        id: "t1",
        titulo: "Reforma Tributária (PEC)",
        descricao: "",
        data_votacao: "2023-01-01",
        casa: "Senado",
        tema: "e",
        impacto_popular: "i",
      },
    }),
  ]
  const pts = [ponto({ id: "p1", titulo: "Reforma Tributaria" })]
  const { enriched } = enrichContradictions(votos, pts)
  assert.equal(enriched[0].pontoAtencao?.id, "p1")
})

test("empty ponto title and description do not match every vote", () => {
  const votos = [
    voto({
      id: "v1",
      votacao_id: "t1",
      voto: "sim",
      votacao: {
        id: "t1",
        titulo: "Qualquer titulo",
        descricao: "",
        data_votacao: "2022-01-01",
        casa: "Senado",
        tema: "t",
        impacto_popular: "i",
      },
    }),
  ]
  const pts = [ponto({ id: "p1", titulo: "   ", descricao: "" })]
  const { enriched, unmatched } = enrichContradictions(votos, pts)
  assert.equal(enriched[0].pontoAtencao, null)
  assert.equal(unmatched.length, 1)
})

test("voto without votacao join → pontoAtencao null, no throw", () => {
  const votos = [voto({ id: "v1", votacao_id: "t1", voto: "sim", votacao: undefined })]
  const { enriched } = enrichContradictions(votos, [ponto({ id: "p1", titulo: "v1" })])
  assert.equal(enriched.length, 1)
  assert.equal(enriched[0].pontoAtencao, null)
})

test("votacao titulo empty after trim → no match, ponto stays unmatched", () => {
  const votos = [
    voto({
      id: "v1",
      votacao_id: "t1",
      voto: "sim",
      votacao: {
        id: "t1",
        titulo: "   ",
        descricao: "",
        data_votacao: "2022-01-01",
        casa: "Senado",
        tema: "t",
        impacto_popular: "i",
      },
    }),
  ]
  const pts = [ponto({ id: "p1", titulo: "qualquer" })]
  const { enriched, unmatched } = enrichContradictions(votos, pts)
  assert.equal(enriched[0].pontoAtencao, null)
  assert.equal(unmatched.length, 1)
})

test("many-to-one: one ponto attaches only to first vote (newest) that matches", () => {
  const shared = "reforma ampla"
  const votos = [
    voto({
      id: "v-new",
      votacao_id: "t2",
      voto: "não",
      votacao: {
        id: "t2",
        titulo: `${shared} — PEC 2`,
        descricao: "",
        data_votacao: "2024-06-01",
        casa: "Senado",
        tema: "e",
        impacto_popular: "i",
      },
    }),
    voto({
      id: "v-old",
      votacao_id: "t1",
      voto: "sim",
      votacao: {
        id: "t1",
        titulo: `${shared} — PEC 1`,
        descricao: "",
        data_votacao: "2020-06-01",
        casa: "Senado",
        tema: "e",
        impacto_popular: "i",
      },
    }),
  ]
  const pts = [ponto({ id: "p1", titulo: shared })]
  const { enriched, unmatched } = enrichContradictions(votos, pts)
  assert.equal(enriched.length, 2)
  const byId = Object.fromEntries(enriched.map((e) => [e.voto.id, e.pontoAtencao?.id ?? null]))
  assert.equal(byId["v-new"], "p1")
  assert.equal(byId["v-old"], null)
  assert.equal(unmatched.length, 0)
})

test("unmatched lists pontos that never matched", () => {
  const votos = [
    voto({
      id: "v1",
      votacao_id: "t1",
      voto: "sim",
      votacao: {
        id: "t1",
        titulo: "So este",
        descricao: "",
        data_votacao: "2021-01-01",
        casa: "Senado",
        tema: "t",
        impacto_popular: "i",
      },
    }),
  ]
  const pts = [
    ponto({ id: "p-match", titulo: "So este no jornal" }),
    ponto({ id: "p-orphan", titulo: "Sem overlap com votacao" }),
  ]
  const { unmatched } = enrichContradictions(votos, pts)
  assert.equal(unmatched.length, 1)
  assert.equal(unmatched[0].id, "p-orphan")
})

test("result order is by data_votacao descending", () => {
  const votos = [
    voto({
      id: "old",
      votacao_id: "t1",
      voto: "sim",
      votacao: {
        id: "t1",
        titulo: "A",
        descricao: "",
        data_votacao: "2019-01-01",
        casa: "Senado",
        tema: "t",
        impacto_popular: "i",
      },
    }),
    voto({
      id: "new",
      votacao_id: "t2",
      voto: "não",
      votacao: {
        id: "t2",
        titulo: "B",
        descricao: "",
        data_votacao: "2024-01-01",
        casa: "Senado",
        tema: "t",
        impacto_popular: "i",
      },
    }),
  ]
  const { enriched } = enrichContradictions(votos, [])
  assert.deepEqual(
    enriched.map((e) => e.voto.id),
    ["new", "old"],
  )
})

test("normalizeContradictionText strips accents", () => {
  assert.equal(normalizeContradictionText("  Tributária  "), "tributaria")
})

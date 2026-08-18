import test from "node:test"
import assert from "node:assert/strict"

import { sortVotosForPublicDisplay } from "../src/lib/votos-candidato-aggregate"
import type { VotoCandidato } from "../src/lib/types"

test("ordena votos por data_votacao descendente (mais recente primeiro)", () => {
  const votos: VotoCandidato[] = [
    {
      id: "1",
      candidato_id: "c1",
      votacao_id: "v1",
      voto: "sim",
      contradicao: false,
      contradicao_descricao: null,
      votacao: {
        id: "v1",
        titulo: "Votação antiga",
        descricao: "",
        data_votacao: "2020-01-01",
        casa: "Câmara",
        tema: "tema1",
        impacto_popular: "alto",
      },
    },
    {
      id: "2",
      candidato_id: "c1",
      votacao_id: "v2",
      voto: "sim",
      contradicao: false,
      contradicao_descricao: null,
      votacao: {
        id: "v2",
        titulo: "Votação recente",
        descricao: "",
        data_votacao: "2024-01-01",
        casa: "Câmara",
        tema: "tema2",
        impacto_popular: "alto",
      },
    },
  ]

  const sorted = sortVotosForPublicDisplay(votos)
  assert.equal(sorted[0].votacao?.data_votacao, "2024-01-01")
  assert.equal(sorted[1].votacao?.data_votacao, "2020-01-01")
})

test("usa fallback estável por titulo quando datas são iguais", () => {
  const votos: VotoCandidato[] = [
    {
      id: "1",
      candidato_id: "c1",
      votacao_id: "v2",
      voto: "sim",
      contradicao: false,
      contradicao_descricao: null,
      votacao: {
        id: "v2",
        titulo: "Zebra",
        descricao: "",
        data_votacao: "2024-01-01",
        casa: "Câmara",
        tema: "tema1",
        impacto_popular: "alto",
      },
    },
    {
      id: "2",
      candidato_id: "c1",
      votacao_id: "v1",
      voto: "sim",
      contradicao: false,
      contradicao_descricao: null,
      votacao: {
        id: "v1",
        titulo: "Alpha",
        descricao: "",
        data_votacao: "2024-01-01",
        casa: "Câmara",
        tema: "tema2",
        impacto_popular: "alto",
      },
    },
  ]

  const sorted = sortVotosForPublicDisplay(votos)
  assert.equal(sorted[0].votacao?.titulo, "Alpha")
  assert.equal(sorted[1].votacao?.titulo, "Zebra")
})

test("usa fallback final por votacao_id quando titulo e data são iguais", () => {
  const votos: VotoCandidato[] = [
    {
      id: "1",
      candidato_id: "c1",
      votacao_id: "v2",
      voto: "sim",
      contradicao: false,
      contradicao_descricao: null,
      votacao: {
        id: "v2",
        titulo: "Mesmo título",
        descricao: "",
        data_votacao: "2024-01-01",
        casa: "Câmara",
        tema: "tema1",
        impacto_popular: "alto",
      },
    },
    {
      id: "2",
      candidato_id: "c1",
      votacao_id: "v1",
      voto: "sim",
      contradicao: false,
      contradicao_descricao: null,
      votacao: {
        id: "v1",
        titulo: "Mesmo título",
        descricao: "",
        data_votacao: "2024-01-01",
        casa: "Câmara",
        tema: "tema2",
        impacto_popular: "alto",
      },
    },
  ]

  const sorted = sortVotosForPublicDisplay(votos)
  assert.equal(sorted[0].votacao_id, "v1")
  assert.equal(sorted[1].votacao_id, "v2")
})

test("trata data ausente como data mínima e coloca no final da lista", () => {
  const votos: VotoCandidato[] = [
    {
      id: "1",
      candidato_id: "c1",
      votacao_id: "v1",
      voto: "sim",
      contradicao: false,
      contradicao_descricao: null,
      votacao: {
        id: "v1",
        titulo: "Votação sem data",
        descricao: "",
        data_votacao: "",
        casa: "Câmara",
        tema: "tema1",
        impacto_popular: "alto",
      },
    },
    {
      id: "2",
      candidato_id: "c1",
      votacao_id: "v2",
      voto: "sim",
      contradicao: false,
      contradicao_descricao: null,
      votacao: {
        id: "v2",
        titulo: "Votação com data",
        descricao: "",
        data_votacao: "2024-01-01",
        casa: "Câmara",
        tema: "tema2",
        impacto_popular: "alto",
      },
    },
  ]

  const sorted = sortVotosForPublicDisplay(votos)
  assert.equal(sorted[0].votacao?.data_votacao, "2024-01-01")
  assert.equal(sorted[1].votacao?.data_votacao, "")
})

test("trata data inválida como data mínima e coloca no final da lista", () => {
  const votos: VotoCandidato[] = [
    {
      id: "1",
      candidato_id: "c1",
      votacao_id: "v1",
      voto: "sim",
      contradicao: false,
      contradicao_descricao: null,
      votacao: {
        id: "v1",
        titulo: "Votação com data inválida",
        descricao: "",
        data_votacao: "not-a-date",
        casa: "Câmara",
        tema: "tema1",
        impacto_popular: "alto",
      },
    },
    {
      id: "2",
      candidato_id: "c1",
      votacao_id: "v2",
      voto: "sim",
      contradicao: false,
      contradicao_descricao: null,
      votacao: {
        id: "v2",
        titulo: "Votação com data válida",
        descricao: "",
        data_votacao: "2024-01-01",
        casa: "Câmara",
        tema: "tema2",
        impacto_popular: "alto",
      },
    },
  ]

  const sorted = sortVotosForPublicDisplay(votos)
  assert.equal(sorted[0].votacao?.data_votacao, "2024-01-01")
  assert.equal(sorted[1].votacao?.data_votacao, "not-a-date")
})

test("trata votacao ausente como data mínima e coloca no final da lista", () => {
  const votos: VotoCandidato[] = [
    {
      id: "1",
      candidato_id: "c1",
      votacao_id: "v1",
      voto: "sim",
      contradicao: false,
      contradicao_descricao: null,
      votacao: undefined,
    },
    {
      id: "2",
      candidato_id: "c1",
      votacao_id: "v2",
      voto: "sim",
      contradicao: false,
      contradicao_descricao: null,
      votacao: {
        id: "v2",
        titulo: "Votação com data",
        descricao: "",
        data_votacao: "2024-01-01",
        casa: "Câmara",
        tema: "tema2",
        impacto_popular: "alto",
      },
    },
  ]

  const sorted = sortVotosForPublicDisplay(votos)
  assert.equal(sorted[0].votacao?.data_votacao, "2024-01-01")
  assert.equal(sorted[1].votacao, undefined)
})

test("retorna array vazio quando input é vazio", () => {
  const sorted = sortVotosForPublicDisplay([])
  assert.deepEqual(sorted, [])
})

test("não muta o array original", () => {
  const votos: VotoCandidato[] = [
    {
      id: "1",
      candidato_id: "c1",
      votacao_id: "v1",
      voto: "sim",
      contradicao: false,
      contradicao_descricao: null,
      votacao: {
        id: "v1",
        titulo: "Votação antiga",
        descricao: "",
        data_votacao: "2020-01-01",
        casa: "Câmara",
        tema: "tema1",
        impacto_popular: "alto",
      },
    },
  ]
  const originalOrder = votos.map((v) => v.votacao_id)
  sortVotosForPublicDisplay(votos)
  assert.deepEqual(votos.map((v) => v.votacao_id), originalOrder)
})

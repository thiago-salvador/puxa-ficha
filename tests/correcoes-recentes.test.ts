import "./helpers/server-only"
import assert from "node:assert/strict"
import test from "node:test"
import {
  __setCorrecoesRecentesDependenciesForTests,
  extrairResumo,
  getCorrecoesRecentes,
} from "../src/lib/correcoes-recentes"

test("extrairResumo só promove string em detalhe.resumo", () => {
  assert.equal(extrairResumo(null), null)
  assert.equal(extrairResumo("não é json"), null)
  assert.equal(extrairResumo(JSON.stringify({ antes: "x", depois: "y" })), null)
  assert.equal(extrairResumo(JSON.stringify({ resumo: 123 })), null)
  assert.equal(extrairResumo(JSON.stringify(["resumo", "array"])), null)
  assert.equal(extrairResumo(JSON.stringify({ resumo: "  Situação reconciliada.  " })), "Situação reconciliada.")
})

test("extrairResumo trunca resumos muito longos sem lançar", () => {
  const longo = "a".repeat(1000)
  const resumo = extrairResumo(JSON.stringify({ resumo: longo }))
  assert.equal(resumo?.length, 600)
})

test("monta correções, resolve candidato publicado e mantém anônimo o que não resolve", async () => {
  __setCorrecoesRecentesDependenciesForTests({
    loadWrites: async () => [
      {
        id: 3,
        executado_em: "2026-09-18T13:56:00.000Z",
        fonte: "divulgacand-detalhe-2026",
        alvo: "candidatos.situacao_candidatura",
        candidato_id: "cand-1",
        execucao: "migration:20260918120100",
        url: "https://divulgacandcontas.tse.jus.br/candidatura/1",
        detalhe: JSON.stringify({ resumo: "Situação reconciliada para indeferido." }),
      },
      {
        id: 2,
        executado_em: "2026-09-16T22:31:04.000Z",
        fonte: "tse-consulta-cand-complementar-2026",
        alvo: "candidatos.status",
        candidato_id: "cand-removido",
        execucao: "migration:20260916140000",
        url: null,
        detalhe: JSON.stringify({ antes: "candidato", depois: "removido" }),
      },
      {
        id: 1,
        executado_em: "2026-09-04T22:00:00.000Z",
        fonte: "profissao-tse-2026",
        alvo: "candidatos.profissao_declarada",
        candidato_id: null,
        execucao: "migration:20260904220000",
        url: "javascript:alert(1)",
        detalhe: null,
      },
    ],
    loadCandidatos: async (ids) => {
      assert.deepEqual([...ids].sort(), ["cand-1", "cand-removido"].sort())
      return [{ id: "cand-1", slug: "gustavo-henrique", nome_urna: "Gustavo Henrique" }]
    },
  })
  try {
    const correcoes = await getCorrecoesRecentes(50)
    assert.equal(correcoes.length, 3)
    assert.deepEqual(correcoes[0].candidato, { slug: "gustavo-henrique", nome: "Gustavo Henrique" })
    assert.equal(correcoes[0].resumo, "Situação reconciliada para indeferido.")
    assert.equal(correcoes[1].candidato, null, "candidato_id sem match em candidatos_publico fica anônimo")
    assert.equal(correcoes[1].resumo, null, "detalhe sem campo resumo em string não vira resumo")
    assert.equal(correcoes[2].candidato, null)
    assert.equal(correcoes[2].url, null, "esquema não-https é descartado")
  } finally {
    __setCorrecoesRecentesDependenciesForTests(null)
  }
})

test("não consulta candidatos_publico quando nenhuma linha tem candidato_id", async () => {
  let called = false
  __setCorrecoesRecentesDependenciesForTests({
    loadWrites: async () => [
      {
        id: 1,
        executado_em: "2026-09-04T22:00:00.000Z",
        fonte: "fonte-x",
        alvo: "candidatos.y",
        candidato_id: null,
        execucao: null,
        url: null,
        detalhe: null,
      },
    ],
    loadCandidatos: async (ids) => {
      called = true
      return ids.map(() => ({ id: "x", slug: "x", nome_urna: "X" }))
    },
  })
  try {
    await getCorrecoesRecentes(50)
    assert.equal(called, false)
  } finally {
    __setCorrecoesRecentesDependenciesForTests(null)
  }
})

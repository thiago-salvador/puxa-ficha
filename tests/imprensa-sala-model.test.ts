import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { buildSalaPromise, buildSalaUpdates, countSalaRecortes } from "../src/components/imprensa/sala/sala-model"
import type { VerifiedCandidateUpdate } from "../src/lib/verified-candidate-updates"

const DASHES = /[–—]/

describe("buildSalaPromise", () => {
  test("usa o total calculado e os cargos presentes, em ordem", () => {
    const text = buildSalaPromise(1234, ["Senador", "Governador", "Presidente"])
    assert.match(text, /sobre os 1\.234 candidatos a presidente, governador e Senado\./)
    assert.match(text, /link para a fonte oficial e data de coleta/)
    assert.doesNotMatch(text, DASHES)
  })

  test("sem contagem, a frase sai sem número e nunca com zero", () => {
    for (const total of [null, 0]) {
      const text = buildSalaPromise(total, ["Presidente", "Governador"])
      assert.match(text, /sobre os candidatos a presidente e governador\./)
      assert.doesNotMatch(text, /\d/)
    }
  })

  test("singular quando há um candidato", () => {
    assert.match(buildSalaPromise(1, ["Presidente"]), /sobre 1 candidato a presidente\./)
  })
})

describe("countSalaRecortes", () => {
  test("conta presidência e as 27 UFs a partir das linhas", () => {
    const { presidencia, ufs } = countSalaRecortes([
      { cargo: "Presidente", uf: null },
      { cargo: "Presidente", uf: null },
      { cargo: "Governador", uf: "BA" },
      { cargo: "Senador", uf: "ba" },
      { cargo: "Governador", uf: "SP" },
    ])
    assert.equal(presidencia, 2)
    assert.equal(ufs.length, 27)
    assert.equal(ufs.find((item) => item.uf === "BA")?.total, 2)
    assert.equal(ufs.find((item) => item.uf === "SP")?.total, 1)
    assert.equal(ufs.find((item) => item.uf === "AC")?.total, 0)
    assert.equal(ufs.reduce((sum, item) => sum + item.total, 0), 3)
  })
})

describe("buildSalaUpdates", () => {
  const base = {
    candidate_name: "Nome Qualquer",
    year: 2026,
    source_url: "https://divulgacandcontas.tse.jus.br/x",
  }
  const updates: VerifiedCandidateUpdate[] = [
    { ...base, id: "1", candidate_slug: "a", field: "situacao", before_value: "aguardando julgamento", after_value: "indeferido com recurso", detected_at: "2026-09-23T15:00:00Z" },
    { ...base, id: "2", candidate_slug: "fora-do-dataset", field: "patrimonio", before_value: "1000", after_value: "2500.5", detected_at: "2026-09-16T02:00:00Z" },
    { ...base, id: "3", candidate_slug: "b", field: "partido", before_value: "AAA", after_value: "BBB", detected_at: "2026-09-10T12:00:00Z" },
    { ...base, id: "4", candidate_slug: "b", field: "partido", before_value: "BBB", after_value: "CCC", detected_at: "2026-09-01T12:00:00Z" },
  ]
  const rows = [
    { slug: "a", cargo: "Governador", uf: "BA", fichaUrl: "/candidato/a" },
    { slug: "b", cargo: "Presidente", uf: null, fichaUrl: "/candidato/b" },
  ]

  test("mostra as três mais recentes, com cargo e UF quando existem, sem o nome", () => {
    const items = buildSalaUpdates(updates, rows)
    assert.deepEqual(items.map((item) => item.id), ["1", "2", "3"])
    assert.equal(items[0].context, "Governador · BA")
    assert.equal(items[0].change, "Situação da candidatura: de aguardando julgamento para indeferido com recurso")
    assert.equal(items[0].dateLabel, "23/09")
    assert.equal(items[0].fichaUrl, "/candidato/a")
    assert.equal(items[1].context, null)
    assert.equal(items[1].fichaUrl, null)
    assert.match(items[1].change, /^Patrimônio declarado em 2026: de R\$\s1\.000,00 para R\$\s2\.500,50$/)
    assert.equal(items[1].dateLabel, "15/09", "data no horário de Brasília")
    assert.equal(items[2].context, "Presidente")
    for (const item of items) {
      assert.doesNotMatch(JSON.stringify(item), /Nome Qualquer/)
      assert.doesNotMatch(item.change, DASHES)
    }
  })
})

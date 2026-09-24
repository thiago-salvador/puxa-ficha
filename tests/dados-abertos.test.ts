import "./helpers/server-only"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import {
  __setDadosAbertosDependenciesForTests,
  getDadosAbertosDataset,
  normalizeDadosAbertosFilters,
} from "../src/lib/dados-abertos"

test("normaliza filtros escalares, listas e UF", () => {
  assert.deepEqual(normalizeDadosAbertosFilters({ cargo: [" Governador ", "Deputado"], uf: " sp " }), {
    cargo: "Governador",
    uf: "SP",
  })
  assert.deepEqual(normalizeDadosAbertosFilters({ cargo: null, uf: "" }), { cargo: null, uf: null })
})

test("fonte paginada usa ordem estável antes de range", () => {
  const source = readFileSync(new URL("../src/lib/dados-abertos.ts", import.meta.url), "utf8")
  assert.match(source, /\.order\("slug", \{ ascending: true \}\)\s*\.range\(/)
})

test("monta coorte, respeita SENADO_ENABLED e preserva null em vez de zero", async () => {
  const previousSenado = process.env.SENADO_ENABLED
  delete process.env.SENADO_ENABLED
  __setDadosAbertosDependenciesForTests({
    loadSlugs: async () => [{ slug: "ana" }, { slug: "bruno" }, { slug: "senado" }],
    loadCandidates: async () => [
      {
        id: "1",
        slug: "ana",
        nome_urna: "Ana",
        nome_completo: "Ana Completa",
        cargo_disputado: "Governador",
        estado: "SP",
        partido_sigla: "ABC",
        situacao_candidatura: "deferido",
        numero_urna: "13",
        ultima_atualizacao: "2026-09-20T00:00:00.000Z",
        fonte_dados: ["tse-divulgacand"],
      },
      {
        id: "2",
        slug: "bruno",
        nome_urna: "Bruno",
        nome_completo: "Bruno Completo",
        cargo_disputado: "Governador",
        estado: "RJ",
        partido_sigla: null,
        situacao_candidatura: null,
        numero_urna: null,
        ultima_atualizacao: null,
        fonte_dados: null,
      },
      {
        id: "3",
        slug: "senado",
        nome_urna: "Senado",
        nome_completo: "Senado Completo",
        cargo_disputado: "Senador",
        estado: "SP",
        partido_sigla: "XYZ",
        situacao_candidatura: "deferido",
        numero_urna: "99",
        ultima_atualizacao: "2026-09-20T00:00:00.000Z",
        fonte_dados: [],
      },
    ],
  })
  try {
    const dataset = await getDadosAbertosDataset({ cargo: null, uf: null })
    assert.deepEqual(
      dataset.rows.map((row) => row.slug),
      ["ana", "bruno"],
    )
    assert.equal(dataset.rows[1].situacao, null)
    assert.equal(dataset.rows[1].partido, null)
    assert.deepEqual(dataset.rows[1].fontes, [])
    assert.equal(dataset.rows[0].fichaUrl, "/candidato/ana")
    assert.deepEqual(dataset.availableCargos, ["Governador"])

    const filtered = await getDadosAbertosDataset({ cargo: "Governador", uf: "SP" })
    assert.deepEqual(
      filtered.rows.map((row) => row.slug),
      ["ana"],
    )
  } finally {
    __setDadosAbertosDependenciesForTests(null)
    if (previousSenado === undefined) delete process.env.SENADO_ENABLED
    else process.env.SENADO_ENABLED = previousSenado
  }
})

test("coorte publicável vazia falha fechado", async () => {
  __setDadosAbertosDependenciesForTests({ loadSlugs: async () => [] })
  try {
    await assert.rejects(() => getDadosAbertosDataset({ cargo: null, uf: null }), /coorte pública vazia/)
  } finally {
    __setDadosAbertosDependenciesForTests(null)
  }
})

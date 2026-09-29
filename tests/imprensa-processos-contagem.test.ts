import "./helpers/server-only"
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { withProcessosContagem } from "../src/lib/imprensa-data"
import { getProcessosDisciplinaresContaveis } from "../src/lib/processos-justica-candidato"

// cspell:words rogerio

const base = { buscaEstado: "indeterminado" as const, quantidadeOmitida: 0, quantidadeEmConfirmacao: 0, ocorrencias: [] }

describe("contagem única de processos na /imprensa", () => {
  const slug = "marcos-rogerio"
  const disciplinares = getProcessosDisciplinaresContaveis(slug).length

  it("usa um candidato com processo disciplinar no dataset versionado", () => {
    assert.ok(disciplinares > 0)
  })

  it("sem quantidade judicial, o total é o da ficha: só os disciplinares", () => {
    const { contagem } = withProcessosContagem({ ...base, estado: "indeterminado", quantidade: null }, slug)
    assert.deepEqual(contagem, { judiciais: null, disciplinares, total: disciplinares })
  })

  it("com quantidade judicial, soma judiciais e disciplinares", () => {
    const { contagem } = withProcessosContagem({ ...base, estado: "publicado", buscaEstado: "encontrado", quantidade: 3 }, slug)
    assert.deepEqual(contagem, { judiciais: 3, disciplinares, total: 3 + disciplinares })
  })

  it("busca vazia conta zero judicial; sem nenhum dos dois o total fica vazio", () => {
    assert.equal(withProcessosContagem({ ...base, estado: "vazio_confirmado", quantidade: 0 }, "slug-sem-etica").contagem?.total, 0)
    assert.equal(withProcessosContagem({ ...base, estado: "indeterminado", quantidade: null }, "slug-sem-etica").contagem?.total, null)
  })
})

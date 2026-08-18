import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  classificarBuscaBloqueada,
  planejarRetomada,
  selecionarFichasSemBusca,
} from "../scripts/retry-judicial-djen-bloqueados"

describe("retry DJEN das fichas que nunca foram buscadas", () => {
  it("seleciona só bloqueios sem ocorrência e sem URL de busca", () => {
    const selecionadas = selecionarFichasSemBusca([
      { slug: "sem-busca", ocorrencias_ambiguas_total: 0, busca_url: "" },
      { slug: "com-url", ocorrencias_ambiguas_total: 0, busca_url: "https://djen.test/busca" },
      { slug: "com-ocorrencia", ocorrencias_ambiguas_total: 1, busca_url: "" },
    ])

    assert.deepEqual(selecionadas.map((item) => item.slug), ["sem-busca"])
  })

  it("mantém zero resultado como bloqueio editorial quando a identidade não está comprovada", () => {
    assert.deepEqual(classificarBuscaBloqueada({ total_api: 0, ocorrencias_nome_exato: 0 }), {
      resultado: "bloqueio_editorial",
      motivo: "busca executada sem ocorrencia exata; identidade oficial insuficiente impede confirmar ausencia judicial",
    })
  })

  it("mantém ocorrências por nome como bloqueio editorial, não como positivo", () => {
    assert.deepEqual(classificarBuscaBloqueada({ total_api: 136, ocorrencias_nome_exato: 12 }), {
      resultado: "bloqueio_editorial",
      motivo: "12 ocorrencia(s) por nome exato sem segundo identificador oficial; nenhuma atribuicao foi publicada",
    })
  })

  it("preserva falha de transporte como erro explícito", () => {
    assert.deepEqual(classificarBuscaBloqueada({ erro: "HTTP 503" }), {
      resultado: "erro",
      motivo: "HTTP 503",
    })
  })

  it("na retomada preserva sucessos e repete somente os erros", () => {
    const plano = planejarRetomada(
      [{ slug: "ok" }, { slug: "erro" }],
      [
        { slug: "ok", resultado: "bloqueio_editorial" },
        { slug: "erro", resultado: "erro" },
      ],
    )

    assert.deepEqual(plano.preservadas.map((item) => item.slug), ["ok"])
    assert.deepEqual(plano.reexecutar.map((item) => item.slug), ["erro"])
  })
})

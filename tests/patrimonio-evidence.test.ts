import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { semDescricoesDeBens } from "../scripts/lib/patrimonio-evidence"

describe("evidência de patrimônio", () => {
  it("preserva contagens e totais sem serializar descrições dos bens", () => {
    const celulas = semDescricoesDeBens([
      {
        slug: "candidato-teste",
        estado_atual: "tse_publicou",
        operacoes_planejadas: [
          {
            tabela: "patrimonio",
            operacao: "insert",
            n_bens: 1,
            valor_total: 10,
            bens: [{ descricao: "conta 123 e chassi ABC123456789", valor: 10 }],
          },
        ],
      },
    ])

    const serializado = JSON.stringify(celulas)
    assert.doesNotMatch(serializado, /conta 123|ABC123456789|"bens"/)
    assert.match(serializado, /"n_bens":1/)
    assert.match(serializado, /"valor_total":10/)
  })
})

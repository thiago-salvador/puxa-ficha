import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { gastoParlamentarExibivel } from "../src/lib/public-profile-dto"

/**
 * A cota da Câmara saiu do ar em 17/08 porque não reproduz na fonte oficial.
 *
 * O controle positivo falhou: o recibo de 16/08 registra `jhc 2019` com 355 documentos e
 * R$ 351.517,43; o `Ano-2019.csv.zip` do dia seguinte dá 140 documentos e R$ 221.848,77 para o
 * mesmo `ideCadastro`. Das 13 linhas de 2019 no banco, nenhuma reproduz por nenhuma das três
 * bases de agregação plausíveis, e o banco é sempre maior.
 *
 * Estes testes existem para que ninguém reabra a exibição por engano, e para que os rótulos
 * reais que existem em produção continuem cobertos quando alguém acrescentar um novo.
 */
describe("cota parlamentar: o que pode ir ao ar", () => {
  test("bloqueia todos os rótulos de origem Câmara que existem em produção", () => {
    // Os quatro rótulos medidos no banco em 17/08, com a contagem de linhas de cada um.
    const rotulosEmProducao = [
      "Camara", // 20 linhas, casadas por nome, o defeito original
      "Camara CEAP CSV", // 138 linhas, casadas por ID, e mesmo assim não reproduzem
      "Cota Parlamentar/Camara dadosabertos (onda-p-20260814)", // 6 linhas
      "Câmara (jan/2023) + Senado CEAPS (fev-dez/2023)", // 1 linha, mista: sai também
    ]
    for (const fonte of rotulosEmProducao) {
      assert.equal(gastoParlamentarExibivel(fonte), false, `deveria bloquear: ${fonte}`)
    }
  })

  test("não confia na acentuação nem na caixa do rótulo", () => {
    for (const fonte of ["câmara", "CÂMARA", "camara", "CAMARA", "Camara CEAP CSV"]) {
      assert.equal(gastoParlamentarExibivel(fonte), false, `deveria bloquear: ${fonte}`)
    }
  })

  test("mantém o Senado no ar, que é outra fonte e não foi contestada", () => {
    const senado = [
      "Senado CEAPS", // 101 linhas
      "CEAPS/Senado", // 4 linhas
      "https://www.senado.leg.br/transparencia/LAI/verba/despesa_ceaps_2023.csv",
      "Senado CEAPS | https://www.senado.leg.br/transparencia/LAI/verba/despesa_ceaps_2024.csv",
    ]
    for (const fonte of senado) {
      assert.equal(gastoParlamentarExibivel(fonte), true, `deveria exibir: ${fonte}`)
    }
  })

  test("linha sem fonte declarada continua exibível, porque o bloqueio é nominal", () => {
    // O bloqueio é sobre a Câmara, não sobre ausência de rótulo. Linha sem fonte é outro
    // problema, de proveniência, e não deve ser silenciada por este filtro.
    assert.equal(gastoParlamentarExibivel(null), true)
    assert.equal(gastoParlamentarExibivel(undefined), true)
    assert.equal(gastoParlamentarExibivel(""), true)
  })
})

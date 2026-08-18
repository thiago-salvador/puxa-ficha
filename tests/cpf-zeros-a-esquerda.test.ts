import { describe, it } from "node:test"
import assert from "node:assert/strict"

import { MINIMO_DIGITOS_CPF_TSE, cpfEhValido, normalizarCpfTse, somenteDigitos } from "../scripts/lib/cpf"

/**
 * Regressão do defeito medido em 2026-08-10.
 *
 * O publicador do TSE trata `NR_CPF_CANDIDATO` como número e come os zeros à
 * esquerda. Os três leitores de CPF do TSE exigiam 11 dígitos crus, então CPF
 * verdadeiro com zeros comidos era descartado em silêncio e a ficha ficava na
 * lista de "não consultáveis" da varredura de sanções.
 *
 * Caso real de regressão: `alex-pucineli`, que o `consulta_cand_2012` publica
 * como `690013167`. O CPF é `00690013167` e o dígito verificador fecha.
 */

/** CPF do caso real, como o TSE publica e como ele é de verdade. */
const PUCINELI_COMO_O_TSE_PUBLICA = "690013167"
const PUCINELI_REAL = "00690013167"

describe("normalizarCpfTse: zeros à esquerda comidos pela fonte", () => {
  it("regressão alex-pucineli: 9 dígitos do consulta_cand 2012 viram o CPF real de 11", () => {
    assert.equal(PUCINELI_COMO_O_TSE_PUBLICA.length, 9)
    assert.equal(normalizarCpfTse(PUCINELI_COMO_O_TSE_PUBLICA), PUCINELI_REAL)
    assert.equal(cpfEhValido(PUCINELI_REAL), true)
  })

  it("regressão alex-pucineli: o gate antigo (11 dígitos crus) descartava o CPF verdadeiro", () => {
    // Este é exatamente o teste que o código fazia antes da correção.
    assert.equal(somenteDigitos(PUCINELI_COMO_O_TSE_PUBLICA).length !== 11, true)
    assert.equal(cpfEhValido(PUCINELI_COMO_O_TSE_PUBLICA), false)
  })

  it("CPF de 10 dígitos (um zero comido) também é reconstruído", () => {
    // 01234567890 tem DV válido; o TSE publicaria como 1234567890.
    assert.equal(cpfEhValido("01234567890"), true)
    assert.equal(normalizarCpfTse("1234567890"), "01234567890")
  })

  it("CPF que já vem com 11 dígitos continua aceito e intacto", () => {
    assert.equal(normalizarCpfTse("52998224725"), "52998224725")
    assert.equal(normalizarCpfTse("529.982.247-25"), "52998224725")
  })
})

describe("normalizarCpfTse: o risco oposto, lixo curto não vira CPF", () => {
  it("piso é de 9 dígitos, e nada abaixo dele é reconstruído", () => {
    assert.equal(MINIMO_DIGITOS_CPF_TSE, 9)
    for (const curto of ["", "0", "12", "123", "1234", "12345", "123456", "1234567", "12345678"]) {
      assert.equal(normalizarCpfTse(curto), "", `não pode reconstruir CPF a partir de "${curto}"`)
    }
  })

  it("o piso é conservador de propósito: 6 a 8 dígitos ficam de fora mesmo com DV válido", () => {
    // A fonte danifica CPF até 6 dígitos, e esses valores são CPF de verdade
    // (medição de 2026-08-10 no consulta_cand_2012_MT). O piso em 9 abre mão
    // deles porque afrouxá-lo não fechou nenhum alvo a mais na medição, e o
    // teste existe para que a escolha seja explícita e não acidente.
    assert.equal(cpfEhValido("00060214171"), true)
    assert.equal(normalizarCpfTse("60214171"), "")
  })

  it("lixo curto que passaria no DV depois do padding continua recusado", () => {
    // Este é o caso que o piso existe para barrar. Sem ele, um campo de 3 ou 4
    // dígitos completado com zeros vira um número cujo dígito verificador
    // fecha, e o coletor aceitaria como CPF um valor que não era CPF nenhum.
    // Entre 0 e 9999 existem 99 valores assim; dois deles abaixo.
    assert.equal(cpfEhValido("00000000191"), true)
    assert.equal(cpfEhValido("00000001082"), true)
    assert.equal(normalizarCpfTse("191"), "")
    assert.equal(normalizarCpfTse("1082"), "")
  })

  it("valor com mais de 11 dígitos não é CPF danificado e não é adivinhado", () => {
    assert.equal(normalizarCpfTse("529982247250"), "")
    // CNPJ tem 14 dígitos e nunca pode virar CPF por corte ou padding.
    assert.equal(normalizarCpfTse("12345678000190"), "")
  })

  it("marcadores do CSV do TSE não viram CPF", () => {
    for (const marcador of ["#NULO#", "NAO DIVULGAVEL", "-1", null, undefined]) {
      assert.equal(normalizarCpfTse(marcador), "")
    }
  })
})

describe("normalizarCpfTse: dígito verificador manda na reconstrução", () => {
  it("9 dígitos cujo DV não fecha depois do padding é recusado", () => {
    // Mesmo prefixo do caso real com o último dígito trocado: 00690013168.
    assert.equal(cpfEhValido("00690013168"), false)
    assert.equal(normalizarCpfTse("690013168"), "")
  })

  it("10 dígitos cujo DV não fecha depois do padding é recusado", () => {
    assert.equal(cpfEhValido("01234567891"), false)
    assert.equal(normalizarCpfTse("1234567891"), "")
  })

  it("sequência repetida não sobrevive à reconstrução", () => {
    assert.equal(normalizarCpfTse("000000000"), "")
    assert.equal(normalizarCpfTse("11111111111"), "11111111111")
    // O valor de 11 dígitos volta como veio da fonte, mas o gate de validade
    // que cada chamador aplica em cima continua barrando a sequência.
    assert.equal(cpfEhValido(normalizarCpfTse("11111111111")), false)
  })
})

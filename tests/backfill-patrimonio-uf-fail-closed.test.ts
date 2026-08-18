import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { decidirPorUf, ufDaCelula } from "../scripts/gerar-backfill-patrimonio-tse"

/**
 * Regressão do achado de 10/08/2026, durante a entrada dos SQ de 2006 e 2008
 * do `cabo-daciolo` no seed.
 *
 * O SQ_CANDIDATO é sequencial POR UF até 2008: o mesmo número pertence a
 * pessoas diferentes em estados diferentes. O código pedia a UF para desempatar
 * e, quando ela faltava, PULAVA o filtro em vez de recusar a linha. Como
 * `estado` é nulo para presidenciáveis, um SQ pré-2010 no seed de um deles
 * fazia o casamento aceitar linha de qualquer estado, publicando bem de
 * terceiro como se fosse dele.
 */
describe("filtro de UF do backfill de patrimônio pré-2010", () => {
  it("recusa a linha quando o seed não tem UF, em vez de aceitar qualquer estado", () => {
    assert.equal(decidirPorUf(2008, "", "BA"), "recusa_sem_uf")
    assert.equal(decidirPorUf(2006, "", "RS"), "recusa_sem_uf")
    // Espaço em branco é ausência de UF, não UF.
    assert.equal(decidirPorUf(2008, "   ", "RJ"), "recusa_sem_uf")
  })

  it("aceita só a linha do estado do candidato quando a UF é conhecida", () => {
    assert.equal(decidirPorUf(2008, "RJ", "RJ"), "aceita")
    assert.equal(decidirPorUf(2008, "rj", " rj "), "aceita")
    assert.equal(decidirPorUf(2008, "RJ", "BA"), "recusa_uf_divergente")
  })

  it("não filtra por UF de 2010 em diante, quando o SQ deixa de colidir", () => {
    assert.equal(decidirPorUf(2010, "", "BA"), "aceita")
    assert.equal(decidirPorUf(2022, "RJ", "BA"), "aceita")
  })

  it("o caso concreto do cabo-daciolo: sem UF no seed, 2008 não casa com BA nem com RS", () => {
    // O seed traz `estado: null` para presidenciáveis, e o SQ 14144 de 2008
    // existe em mais de um estado.
    for (const ufDaLinha of ["BA", "RS", "SP", "RJ"]) {
      assert.equal(
        decidirPorUf(2008, "", ufDaLinha),
        "recusa_sem_uf",
        `linha de ${ufDaLinha} não pode ser aceita sem UF no seed`,
      )
    }
  })
})

describe("fonte de UF por candidatura, e não a UF atual do candidato", () => {
  it("a UF do ano vence a UF atual do candidato", () => {
    const mapa = new Map([
      ["fulano", "SP"],
      ["fulano|2006", "RJ"],
    ])
    assert.equal(ufDaCelula(mapa, "fulano", 2006), "RJ")
    assert.equal(ufDaCelula(mapa, "fulano", 2008), "")
    assert.equal(ufDaCelula(mapa, "fulano", 2010), "SP")
  })

  it("presidenciável sem UF atual resolve pela UF da candidatura daquele ano", () => {
    // `estado` é nulo para quem concorre a Presidente, então só a entrada por
    // ano salva o caso, e é exatamente o do cabo-daciolo.
    const mapa = new Map([
      ["cabo-daciolo|2006", "RJ"],
      ["cabo-daciolo|2008", "RJ"],
    ])
    assert.equal(ufDaCelula(mapa, "cabo-daciolo", 2006), "RJ")
    assert.equal(ufDaCelula(mapa, "cabo-daciolo", 2008), "RJ")
    assert.equal(decidirPorUf(2008, ufDaCelula(mapa, "cabo-daciolo", 2008), "BA"), "recusa_uf_divergente")
    assert.equal(decidirPorUf(2008, ufDaCelula(mapa, "cabo-daciolo", 2008), "RJ"), "aceita")
    // Ano sem entrada continua sem UF, e sem UF continua sendo recusa.
    assert.equal(ufDaCelula(mapa, "cabo-daciolo", 2004), "")
    assert.equal(decidirPorUf(2004, ufDaCelula(mapa, "cabo-daciolo", 2004), "RJ"), "recusa_sem_uf")
  })
})

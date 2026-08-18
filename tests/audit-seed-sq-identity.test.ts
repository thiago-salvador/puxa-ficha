/**
 * Heuristica de identidade do auditor de SQ_CANDIDATO.
 *
 * Os casos abaixo nao sao inventados: sao os que apareceram de verdade ao
 * confrontar o seed com o pacote consulta_cand do TSE em 26/07/2026. Metade
 * sao contaminacoes reais que o auditor tem de reprovar, e metade sao falsos
 * positivos que a primeira versao da heuristica gerou e que ela tem de
 * aprovar.
 *
 * O equilibrio entre os dois lados e o ponto: um auditor que reprova nome de
 * urna e nome de casada gera uma lista que ninguem le, e uma lista que ninguem
 * le e pior do que nao ter auditor.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  avaliarIdentidade,
  compararNomes,
  type RegistroTSE,
} from "../scripts/audit-seed-sq-identity"

// `nascimento` fica vazio de proposito: estes casos exercitam a heuristica de
// NOME (`avaliarIdentidade` / `compararNomes`), que nao le a data. O
// cruzamento por data de nascimento e outro mecanismo, testado em
// `inconsistenciasDeNascimento`, e nao entra aqui.
function registro(nome: string, urna = ""): RegistroTSE {
  return { nome, urna, cargo: "", partido: "", ue: "", uf: "", nascimento: "" }
}

describe("auditor de SQ: heuristica de identidade", () => {
  describe("reprova contaminacao real", () => {
    it("jeronimo x deputado estadual do MDB no Maranhao", () => {
      // O SQ 100001606606 estava no seed como sendo do governador da Bahia.
      // O CPF desta pessoa chegou a ser gravado no cadastro dele.
      //
      // Pelo nome sozinho isto e "parcial", nao "nenhum", porque o primeiro
      // nome coincide. O que fecha o caso e a UF (BA no seed, MA no TSE), e
      // esse desempate mora no `main`, nao aqui. O que a heuristica de nome
      // precisa garantir e nao carimbar como "forte".
      assert.notEqual(
        avaliarIdentidade(
          ["Jerônimo Rodrigues Souza", "Jeronimo"],
          registro("JERONIMO FERREIRA CAVALCANTE FILHO", "JERONIMO CAVALCANTE")
        ),
        "forte"
      )
    })

    it("jeronimo x vereador de Santo Amaro", () => {
      // SQ 50001165142, que estava no seed como candidatura dele em 2020.
      assert.notEqual(
        avaliarIdentidade(
          ["Jerônimo Rodrigues Souza", "Jeronimo"],
          registro("JERONIMO OLIVEIRA CAVALCANTE", "JERONIMO CAVALCANTE")
        ),
        "forte"
      )
    })

    it("nomes sem nenhum termo em comum", () => {
      assert.equal(compararNomes("Rafael Duda", "RAFAEL RIBEIRO DE AVILA"), "parcial")
      assert.equal(compararNomes("Maria Auxiliadora Seabra Rezende", "DORALICE DE SOUSA DANTAS"), "nenhum")
    })
  })

  describe("aprova o que so parece divergente", () => {
    it("aceita quando o nome de urna do TSE bate com o do seed", () => {
      // O seed guarda "Soldado Sampaio"; o TSE guarda o nome civil no campo
      // principal e o de urna no secundario.
      assert.equal(
        avaliarIdentidade(
          ["Soldado Sampaio", "Soldado Sampaio"],
          registro("FRANCISCO DOS SANTOS SAMPAIO", "SOLDADO SAMPAIO")
        ),
        "forte"
      )
    })

    it("aceita nome civil mais longo no TSE que no seed", () => {
      assert.equal(
        avaliarIdentidade(
          ["Janaina Riva", "Janaina Riva"],
          registro("JANAÍNA GREYCE RIVA FAGUNDES", "JANAINA RIVA")
        ),
        "forte"
      )
    })

    it("aceita o registro correto do jeronimo", () => {
      assert.equal(
        avaliarIdentidade(
          ["Jerônimo Rodrigues Souza", "Jeronimo"],
          registro("JERÔNIMO RODRIGUES SOUZA", "JERÔNIMO")
        ),
        "forte"
      )
    })

    it("ignora acento e particulas na comparacao", () => {
      assert.equal(compararNomes("Antônio de Souza da Silva", "ANTONIO SOUZA SILVA"), "forte")
    })
  })

  describe("o caso que exige olho humano", () => {
    it("nome de urna identico entre pessoas diferentes nao pode passar como forte pelo civil", () => {
      // Doralice de Sousa Dantas usa "Professora Dorinha" como nome de urna,
      // igual ao da candidata do site. Pelo nome civil, nada em comum.
      assert.equal(
        compararNomes("Maria Auxiliadora Seabra Rezende", "DORALICE DE SOUSA DANTAS"),
        "nenhum"
      )
      // Mas pelo nome de urna a coincidencia e total, e e por isso que este
      // caso so foi fechado indo ao TSE conferir municipio e data de
      // nascimento. O auditor sinaliza; quem decide e a pessoa.
      assert.equal(compararNomes("Professora Dorinha", "PROFESSORA DORINHA"), "forte")
    })
  })
})

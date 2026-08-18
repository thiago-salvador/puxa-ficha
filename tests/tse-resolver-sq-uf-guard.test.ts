/**
 * Guarda de UF no degrau de SQ_CANDIDATO do resolver.
 *
 * O caminho por NOME sempre teve essa guarda, com um comentario no codigo
 * dizendo que ela e "load-bearing for homonym prevention". O caminho por SQ
 * nao tinha, e e o degrau de MAIOR prioridade: ele nao degrada para o
 * proximo, ancora direto.
 *
 * Isso importa porque ate 2008 o SQ_CANDIDATO do TSE nao e chave global, e sim
 * sequencial POR UF. Valores curtos como "10354" existem em quase todos os
 * estados, apontando para pessoas diferentes. Um SQ curto no seed casava com a
 * primeira linha que tivesse aquele numero em qualquer UF.
 *
 * Descoberto em 2026-07-26 ao escrever o auditor de SQ: a primeira versao dele
 * tinha exatamente o mesmo defeito e acusou 40 falsos positivos, todos casando
 * com candidatos do Acre, primeiro arquivo em ordem alfabetica.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import { validatePreloadedSqRow } from "../scripts/lib/tse-resolver"

const resolver = readFileSync("scripts/lib/tse-resolver.ts", "utf-8")

/** Recorta o bloco do degrau de SQ dentro de `resolveRow`. */
function blocoDoDegrauSq(): string {
  const inicio = resolver.indexOf("const sq = (row.SQ_CANDIDATO")
  assert.notEqual(inicio, -1, "o degrau de SQ precisa existir em resolveRow")
  const fim = resolver.indexOf("const cpf = normalizeCPF", inicio)
  assert.notEqual(fim, -1, "o degrau de CPF deveria vir logo depois do de SQ")
  return resolver.slice(inicio, fim)
}

describe("tse-resolver: guarda de UF no degrau de SQ", () => {
  it("o indice de SQ conserva a configuracao completa do candidato", () => {
    assert.match(
      resolver,
      /sqToCandidato\s*=\s*new Map<string,\s*CandidatoConfig>/,
      "o validador precisa receber nome, UF, cargo esperado e overrides historicos",
    )
    assert.match(
      resolver,
      /sqToCandidato\.set\(sq, candidato\)/,
      "o indice nao pode reduzir a identidade ao slug",
    )
    assert.doesNotMatch(
      resolver,
      /sqToSlug/,
      "o mapa antigo, que guardava so o slug, nao pode voltar",
    )
  })

  it("a validacao exige identidade nominal, UF e cargo oficiais", () => {
    const candidato = {
      nome_completo: "Jose Renan Vasconcelos Calheiros Filho",
      nome_urna: "Renan Filho",
      estado: "AL",
    }
    const linha = {
      NM_CANDIDATO: "JOSE RENAN VASCONCELOS CALHEIROS FILHO",
      NM_URNA_CANDIDATO: "RENAN FILHO",
      SG_UF: "AL",
      DS_CARGO: "SENADOR",
    }

    assert.deepEqual(validatePreloadedSqRow(candidato, linha), { ok: true })
    assert.deepEqual(
      validatePreloadedSqRow(candidato, {
        ...linha,
        NM_CANDIDATO: "RENAN BEKEL DE MELO PACHECO",
        NM_URNA_CANDIDATO: "RENAN BEKEL",
      }),
      { ok: false, reason: "nome" },
    )
    assert.deepEqual(validatePreloadedSqRow(candidato, { ...linha, SG_UF: "RR" }), {
      ok: false,
      reason: "uf",
    })
    assert.deepEqual(validatePreloadedSqRow(candidato, { ...linha, DS_CARGO: "" }), {
      ok: false,
      reason: "cargo",
    })

    // Mudanca real de UF entre pleitos so passa quando o seed declara o mapa
    // historico; sem o override, a mesma linha continua recusada.
    assert.deepEqual(validatePreloadedSqRow(candidato, { ...linha, SG_UF: "SP" }), {
      ok: false,
      reason: "uf",
    })
    assert.deepEqual(validatePreloadedSqRow(candidato, { ...linha, SG_UF: "SP" }, "SP"), {
      ok: true,
    })
  })

  it("o degrau de SQ chama a validacao completa e falha fechado", () => {
    const bloco = blocoDoDegrauSq()

    const posGuarda = bloco.indexOf("validatePreloadedSqRow(")
    const posRetorno = bloco.indexOf('method: "sq-preloaded"')
    const posInvalido = bloco.indexOf("stats.sqPreloadedInvalido++")
    const posFailClosed = bloco.indexOf("return null", posInvalido)
    assert.notEqual(posGuarda, -1, "a guarda precisa existir")
    assert.notEqual(posRetorno, -1, "o retorno do degrau de SQ precisa existir")
    assert.notEqual(posInvalido, -1, "a recusa precisa ser contabilizada")
    assert.notEqual(posFailClosed, -1, "SQ invalido precisa encerrar o degrau")
    assert.ok(
      posGuarda < posRetorno,
      "nome, UF e cargo precisam ser validados antes de ancorar por SQ",
    )
    assert.match(
      bloco,
      /candidato\.ids\.tse_uf_candidatura\?\.\[String\(ano\)\]/,
      "o degrau precisa respeitar a UF eleitoral declarada para o pleito",
    )
    assert.ok(posRetorno < posInvalido && posInvalido < posFailClosed)
  })

  it("mantem a guarda de UF que o caminho por nome ja tinha", () => {
    // Protecao contra a regressao inversa: alguem 'simplificar' as duas.
    assert.match(
      resolver,
      /load-bearing for homonym prevention/,
      "a guarda do caminho por nome nao pode ser removida",
    )
  })
})

import assert from "node:assert/strict"
import { resolve } from "node:path"
import { describe, it } from "node:test"

import {
  auditarCpfVersionado,
  cpfEhSinteticoPermitido,
  MARCADOR_CPF_REMOVIDO,
  varrerTextoPorCpf,
} from "../scripts/audit/lib/cpf-versionado-gate"

const ROOT = resolve(import.meta.dirname, "..")

/**
 * Monta um CPF com DV válido a partir de 9 dígitos. O valor positivo do teste
 * nasce em tempo de execução para que este arquivo não carregue, ele mesmo,
 * um CPF válido fora da lista de sintéticos.
 */
function comDv(base: string): string {
  const n = [...base].map(Number)
  const dv = (len: number) => ((n.slice(0, len).reduce((s, x, i) => s + x * (len + 1 - i), 0) * 10) % 11) % 10
  n.push(dv(9))
  n.push(dv(10))
  return n.join("")
}

function formatado(cpf: string): string {
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`
}

const VALIDO_FORA_DA_LISTA = comDv("987123654")
const DV_ERRADO = `${VALIDO_FORA_DA_LISTA.slice(0, 10)}${(Number(VALIDO_FORA_DA_LISTA[10]) + 1) % 10}`

describe("gate de CPF versionado: casos que reprovam", () => {
  it("o valor montado para o teste é válido e não está na lista de sintéticos", () => {
    assert.equal(cpfEhSinteticoPermitido(VALIDO_FORA_DA_LISTA), false)
  })

  it("acusa CPF cru em chave JSON", () => {
    const achados = varrerTextoPorCpf(`{\n  "cpf": "${VALIDO_FORA_DA_LISTA}"\n}`, "x.json")
    assert.deepEqual(achados, [{ arquivo: "x.json", linha: 2, coluna: 11, contexto: "rotulo" }])
  })

  it("acusa CPF formatado em texto livre e em parâmetro de URL", () => {
    assert.equal(varrerTextoPorCpf(`detalhe: CPF ${formatado(VALIDO_FORA_DA_LISTA)} (SQ 1)`, "a.md").length, 1)
    assert.equal(varrerTextoPorCpf(`ceis?cpfCnpj=${VALIDO_FORA_DA_LISTA}`, "a.md").length, 1)
    assert.equal(varrerTextoPorCpf(`nr_cpf_candidato;${VALIDO_FORA_DA_LISTA}`, "a.csv").length, 1)
  })

  it("acusa o bloco NOME:CPF de assinatura digital extraída de PDF", () => {
    const texto = `Assinado de forma digital por FULANO DE\nTAL:${VALIDO_FORA_DA_LISTA}\nDados: 2026.08.14`
    assert.deepEqual(
      varrerTextoPorCpf(texto, "programa.json").map((achado) => achado.contexto),
      ["assinatura_digital"],
    )
  })
})

describe("gate de CPF versionado: casos que passam", () => {
  it("aceita o marcador de remoção e valores sintéticos declarados", () => {
    assert.deepEqual(varrerTextoPorCpf(`"cpf": "${MARCADOR_CPF_REMOVIDO}"`, "a.json"), [])
    assert.deepEqual(varrerTextoPorCpf(`"cpf": "52998224725"`, "a.json"), [])
    assert.deepEqual(varrerTextoPorCpf(`CPF 000.000.001-91`, "a.md"), [])
    // Faixa reservada de fixtures: 000.000.1XX-XX.
    assert.deepEqual(varrerTextoPorCpf(`"cpf": "${comDv("000000137")}"`, "a.json"), [])
  })

  it("não confunde SQ, DV errado, título, CNPJ nem pedaço de hash com CPF", () => {
    // SQ de 11 dígitos cujo DV fecha por acaso, com `cpf` descrevendo o método.
    assert.deepEqual(varrerTextoPorCpf(`{"sq":"${VALIDO_FORA_DA_LISTA}","method":"cpf"}`, "a.sql"), [])
    assert.deepEqual(varrerTextoPorCpf(`"cpf": "${DV_ERRADO}"`, "a.json"), [])
    assert.deepEqual(varrerTextoPorCpf(`"cpf": "${VALIDO_FORA_DA_LISTA}0"`, "a.json"), [])
    assert.deepEqual(varrerTextoPorCpf(`cpfCnpj=12.345.678/0001-90`, "a.md"), [])
    assert.deepEqual(varrerTextoPorCpf(`"cpf_sha": "ab${VALIDO_FORA_DA_LISTA}cd"`, "a.json"), [])
  })

  it("número válido sem rótulo nenhum não reprova (ruído de 1 em 100)", () => {
    assert.deepEqual(varrerTextoPorCpf(`"id": ${VALIDO_FORA_DA_LISTA},`, "a.json"), [])
  })
})

describe("gate de CPF versionado: repositório", () => {
  it("nenhum arquivo rastreado carrega CPF válido em contexto explícito", () => {
    const resultado = auditarCpfVersionado(ROOT)
    assert.ok(resultado.arquivosLidos >= 1000, `gate cego: só ${resultado.arquivosLidos} arquivo(s) lidos`)
    assert.deepEqual(
      resultado.achados.map((achado) => `${achado.arquivo}:${achado.linha} (${achado.contexto})`),
      [],
    )
  })
})

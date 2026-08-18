import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  collectHomonymSignals,
  extractCpfsFromObservacoes,
} from "../scripts/lib/historico-homonym-signals"

describe("historico-homonym-signals", () => {
  it("extractCpfsFromObservacoes encontra 11 dígitos", () => {
    assert.deepEqual(extractCpfsFromObservacoes("CPF 12345678901 na observação"), ["12345678901"])
    assert.deepEqual(extractCpfsFromObservacoes("CPF 123.456.789-01 na observação"), ["12345678901"])
    assert.deepEqual(extractCpfsFromObservacoes("CPF 123.456.789-01 e 12345678901"), ["12345678901"])
    assert.deepEqual(extractCpfsFromObservacoes("ID 00123456789012 não é CPF"), [])
    assert.deepEqual(extractCpfsFromObservacoes(null), [])
  })

  it("idade_minima_cargo quando idade no cargo é inferior ao mínimo", () => {
    const rows = [
      {
        id: "r1",
        cargo: "Presidente",
        cargo_canonico: null,
        periodo_inicio: 2002,
        estado: null,
        observacoes: null,
      },
    ]
    const meta = { slug: "x", birthYear: 1970, cpfDigits: null, estadoCoorte: null }
    const s = collectHomonymSignals(rows, meta)
    assert.equal(s.length, 1)
    assert.equal(s[0]!.code, "idade_minima_cargo")
  })

  it("cpf_obs_incompativel quando observação cita outro CPF", () => {
    const rows = [
      {
        id: "r1",
        cargo: "Vereador",
        cargo_canonico: null,
        periodo_inicio: 2016,
        estado: null,
        observacoes: "Ver CPF 12345678901",
      },
    ]
    const meta = { slug: "x", birthYear: 1980, cpfDigits: "00000000000", estadoCoorte: null }
    const s = collectHomonymSignals(rows, meta)
    assert.ok(s.some((x) => x.code === "cpf_obs_incompativel"))
  })

  it("deputado_estadual_uf_coorte", () => {
    const rows = [
      {
        id: "r1",
        cargo: "Deputado Estadual",
        cargo_canonico: null,
        periodo_inicio: 2018,
        estado: "SE",
        observacoes: null,
      },
    ]
    const meta = { slug: "x", birthYear: 1980, cpfDigits: null, estadoCoorte: "BA" }
    const s = collectHomonymSignals(rows, meta)
    assert.ok(s.some((x) => x.code === "deputado_estadual_uf_coorte"))
  })
})

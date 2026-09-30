import assert from "node:assert/strict"
import { test } from "node:test"
import { handleUfResultadoChange } from "../src/components/UfResultadoSelector"

const options = [
  { uf: "BA", label: "Bahia" },
  { uf: "SP", label: "São Paulo" },
]

test("seleção de UF navega pelo prefixo local esperado", () => {
  const paths: string[] = []

  handleUfResultadoChange("BA", options, (path) => paths.push(path))

  assert.deepEqual(paths, ["/uf/ba"])
})

test("valor DOM javascript ou adulterado não navega", () => {
  const paths: string[] = []

  handleUfResultadoChange("javascript:alert(1)", options, (path) => paths.push(path))
  handleUfResultadoChange("/uf/admin", options, (path) => paths.push(path))

  assert.deepEqual(paths, [])
})

test("UF fornecida com metacaracteres fica escapada no path", () => {
  const paths: string[] = []
  const hostileOptions = [{ uf: "BA/#?x", label: "Opção hostil" }]

  handleUfResultadoChange("BA/#?x", hostileOptions, (path) => paths.push(path))

  assert.deepEqual(paths, ["/uf/ba%2F%23%3Fx"])
})

import assert from "node:assert/strict"
import test from "node:test"
import { escritaBloqueadaPeloArquivo } from "../scripts/lib/arquivo-guard"

test("modo arquivo bloqueia escrita dos scripts sem liberação deliberada", () => {
  assert.equal(escritaBloqueadaPeloArquivo({}, true), true)
  assert.equal(escritaBloqueadaPeloArquivo({ PF_ARQUIVO_PERMITIR_ESCRITA: "true" }, true), true)
  assert.equal(escritaBloqueadaPeloArquivo({ PF_ARQUIVO_PERMITIR_ESCRITA: "1" }, true), false)
  assert.equal(escritaBloqueadaPeloArquivo({}, false), false)
  assert.equal(escritaBloqueadaPeloArquivo({}), true)
})

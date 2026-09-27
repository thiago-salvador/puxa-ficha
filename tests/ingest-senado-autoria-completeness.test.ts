import assert from "node:assert/strict"
import test from "node:test"
import { isCompleteSenadoAutoriaList, isSenadoPrincipalAutoria, withinSenadoUnpublishCaps } from "../scripts/lib/ingest-senado"

test("Senado: apenas autoria principal compõe o count público de proposições de autoria", () => {
  assert.equal(isSenadoPrincipalAutoria("Sim"), true)
  assert.equal(isSenadoPrincipalAutoria("Não"), false)
  assert.equal(isSenadoPrincipalAutoria(undefined), false)
})

test("Senado: lista vazia de resposta HTTP 200 não prova ausência completa", () => {
  assert.equal(isCompleteSenadoAutoriaList(635, { Codigo: 635 }, []), false)
  assert.equal(isCompleteSenadoAutoriaList(635, { Codigo: 635 }, [{ Materia: { Codigo: 1 } }]), true)
  assert.equal(isCompleteSenadoAutoriaList(635, { Codigo: 636 }, [{ Materia: { Codigo: 1 } }]), false)
})

test("Senado: limpeza de duplicatas respeita teto por candidato, razão e lote", () => {
  assert.equal(withinSenadoUnpublishCaps(1, 0, 10), true)
  assert.equal(withinSenadoUnpublishCaps(1, 0, 9), false)
  assert.equal(withinSenadoUnpublishCaps(6, 0, 100), false)
  assert.equal(withinSenadoUnpublishCaps(1, 100, 100), false)
})

import assert from "node:assert/strict"
import test from "node:test"

import { filtrarCandidatosPorBusca } from "@/components/CandidatoGrid"
import type { Candidato } from "@/lib/types"

const candidato = (slug: string, nome_urna: string, nome_completo: string, estado = "MG"): Candidato =>
  ({ id: slug, slug, nome_urna, nome_completo, partido_sigla: "PSDB", partido_atual: "PSDB", estado }) as unknown as Candidato

const lista = [
  candidato("um", "AÉCIO NEVES", "AÉCIO NEVES DA CUNHA"),
  candidato("dois", "JOÃO TESTE", "JOÃO DA SILVA TESTE", "SP"),
]

test("busca sem acento encontra nome acentuado", () => {
  assert.deepEqual(filtrarCandidatosPorBusca(lista, "aecio").map((c) => c.slug), ["um"])
  assert.deepEqual(filtrarCandidatosPorBusca(lista, "Joao da silva").map((c) => c.slug), ["dois"])
})

test("busca com acento continua encontrando e query vazia devolve tudo", () => {
  assert.deepEqual(filtrarCandidatosPorBusca(lista, "  Aécio ").map((c) => c.slug), ["um"])
  assert.equal(filtrarCandidatosPorBusca(lista, "   ").length, 2)
  assert.deepEqual(filtrarCandidatosPorBusca(lista, "sp").map((c) => c.slug), ["dois"])
})

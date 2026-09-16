import assert from "node:assert/strict"
import test from "node:test"
import { projectProcessosVerificacaoRow } from "../src/lib/processos-verificacao-public"

test("preserva detalhe, escopo e URLs oficiais de processos sem alterar indeterminado", () => {
  const projected = projectProcessosVerificacaoRow({
    fonte: "processos-curadoria",
    resultado: "indeterminado",
    executado_em: "2026-09-15T19:09:50.000Z",
    escopo: "candidato",
    url: "https://comunicaapi.pje.jus.br/api/v1/comunicacao?pagina=1",
    detalhe: "escopo DJEN; fonte https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip",
  })

  assert.equal(projected?.resultado, "indeterminado")
  assert.equal(projected?.escopo, "candidato")
  assert.match(projected?.detalhe ?? "", /escopo DJEN/)
  assert.deepEqual(projected?.source_urls, [
    "https://comunicaapi.pje.jus.br/api/v1/comunicacao?pagina=1",
    "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip",
  ])
})

test("não publica URL fora da allowlist nem parâmetro CPF e redige valor em detalhe", () => {
  const projected = projectProcessosVerificacaoRow({
    fonte: "processos-curadoria",
    resultado: "erro",
    executado_em: "2026-09-15T19:09:50.000Z",
    url: "https://example.test/processo?cpf=00000000000",
    detalhe: "CPF consultado: 000.000.000-00; fonte https://example.test/privada",
  })

  assert.equal(projected?.resultado, "erro")
  assert.equal(projected?.url, null)
  assert.deepEqual(projected?.source_urls, [])
  assert.match(projected?.detalhe ?? "", /CPF consultado: \[redigido\]/)
  assert.doesNotMatch(projected?.detalhe ?? "", /000\.000\.000-00/)
})

test("recusa linha de outra fonte ou timestamp inválido", () => {
  assert.equal(projectProcessosVerificacaoRow({ fonte: "sancoes", resultado: "encontrado", executado_em: "2026-09-15T00:00:00Z" }), null)
  assert.equal(projectProcessosVerificacaoRow({ fonte: "processos-curadoria", resultado: "encontrado", executado_em: "invalid" }), null)
})

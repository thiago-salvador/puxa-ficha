import assert from "node:assert/strict"
import test from "node:test"

import { mergeComparadorQueryString } from "@/lib/comparador-query"
import { COMPARADOR_EIXO_DEFAULT } from "@/lib/comparador-axis"

test("preserva o filtro de partido ao limpar uma comparação vazia", () => {
  assert.equal(
    mergeComparadorQueryString("partido=PT&c1=lula&eixo=patrimonio", [], COMPARADOR_EIXO_DEFAULT, null),
    "partido=PT",
  )
})

test("combina partido e candidatos selecionados sem perder parâmetros alheios", () => {
  assert.equal(
    mergeComparadorQueryString("partido=PT&tab=votos&c1=antigo", ["lula", "flavio-bolsonaro"], COMPARADOR_EIXO_DEFAULT, null),
    "partido=PT&tab=votos&c1=lula&c2=flavio-bolsonaro",
  )
})

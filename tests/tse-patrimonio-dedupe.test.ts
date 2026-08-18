import assert from "node:assert/strict"
import test from "node:test"

import { dedupeTsePatrimonioRows } from "@/lib/tse-patrimonio-dedupe"

test("dedupeTsePatrimonioRows remove duplicata cruzada entre arquivos BR e UF", () => {
  const out = dedupeTsePatrimonioRows([
    {
      slug: "aldo-rebelo",
      sourceKey: "bem_BR.csv",
      ordem: "",
      tipo: "Linha telefônica",
      descricao: "2808581",
      valor: 1263.09,
    },
    {
      slug: "aldo-rebelo",
      sourceKey: "bem_SP.csv",
      ordem: "",
      tipo: "Linha telefônica",
      descricao: "2808581",
      valor: 1263.09,
    },
  ])

  assert.equal(out.length, 1)
  assert.equal(out[0]?.sourceKey, "bem_BR.csv")
})

test("dedupeTsePatrimonioRows preserva linhas repetidas do mesmo arquivo", () => {
  const out = dedupeTsePatrimonioRows([
    {
      slug: "aldo-rebelo",
      sourceKey: "bem_BR.csv",
      ordem: "",
      tipo: "Depósito bancário em conta corrente no País",
      descricao: "BANCO DO BRASIL",
      valor: 0.37,
    },
    {
      slug: "aldo-rebelo",
      sourceKey: "bem_BR.csv",
      ordem: "",
      tipo: "Depósito bancário em conta corrente no País",
      descricao: "BANCO DO BRASIL",
      valor: 0.37,
    },
  ])

  assert.equal(out.length, 2)
})

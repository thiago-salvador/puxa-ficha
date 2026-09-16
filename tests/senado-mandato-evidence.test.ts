import assert from "node:assert/strict"
import { test } from "node:test"
import { deriveSenadoMandatoEvidence } from "../scripts/lib/senado-mandato-evidence"

test("Senado usa datas explícitas de Exercicios e preserva suplência", () => {
  const evidence = deriveSenadoMandatoEvidence({
    DescricaoParticipacao: "Suplente",
    Exercicios: { Exercicio: [
      { DataInicio: "01/02/2019", DataFim: "31/01/2023", SiglaPartido: "ABC" },
      { DataInicio: "01/02/2023", DataFim: "31/01/2027", SiglaPartido: "DEF" },
    ] },
  })
  assert.equal(evidence.elegivel, true)
  assert.equal(evidence.proveniencia, "senado")
  assert.equal(evidence.periodoInicio, 2019)
  assert.equal(evidence.periodoFim, 2027)
  assert.equal(evidence.eleitoPor, "suplencia")
  assert.equal(evidence.partido, "ABC")
})

test("legislatura sem Exercicios datados não prova mandato", () => {
  const evidence = deriveSenadoMandatoEvidence({
    PrimeiraLegislaturaDoMandato: { DataInicio: "2019-02-01", DataFim: "2027-01-31" },
    Exercicios: { Exercicio: [{ SiglaPartido: "ABC" }] },
  })
  assert.equal(evidence.elegivel, false)
  assert.equal(evidence.proveniencia, null)
  assert.match(evidence.motivo, /legislatura não prova exercício/i)
})

test("lacuna entre Exercicios preserva intervalos separados", () => {
  const evidence = deriveSenadoMandatoEvidence({
    Exercicios: { Exercicio: [
      { DataInicio: "2011-02-01", DataFim: "2012-01-31" },
      { DataInicio: "2015-02-01", DataFim: "2019-01-31" },
    ] },
  })
  assert.equal(evidence.elegivel, true)
  assert.equal(evidence.periodos.length, 2)
  assert.deepEqual(evidence.periodos.map((periodo) => [periodo.inicio, periodo.fim]), [[2011, 2012], [2015, 2019]])
  assert.match(evidence.motivo, /intervalos separados|licença/i)
})

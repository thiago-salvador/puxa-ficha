import assert from "node:assert/strict"
import test from "node:test"
import { senadoExpenseLegislatureForYear, senadoLegislatureRosterUrl, parseSenadoLegislatureRoster } from "../scripts/lib/senado-legislature-roster"

test("mapeia cada ano CEAPS à legislatura oficial correspondente", () => {
  assert.deepEqual([2008, 2010, 2011, 2014, 2015, 2018, 2019, 2022, 2023, 2026].map(senadoExpenseLegislatureForYear), [53, 53, 54, 54, 55, 55, 56, 56, 57, 57])
  assert.throws(() => senadoExpenseLegislatureForYear(2007), /sem legislatura mapeada/)
  assert.throws(() => senadoExpenseLegislatureForYear(2027), /sem legislatura mapeada/)
})

test("roster Senado precisa declarar escopo, IDs únicos e mandatos da legislatura", () => {
  const legislature = 55
  const roster = {
    ListaParlamentarLegislatura: {
      Metadados: { DescricaoDataSet: "Retorna a lista de Senadores de uma Legislatura." },
      Parlamentares: { Parlamentar: [{
        IdentificacaoParlamentar: { CodigoParlamentar: "123" },
        Mandatos: { Mandato: [{ PrimeiraLegislaturaDoMandato: { NumeroLegislatura: "55", DataInicio: "2015-02-01", DataFim: "2019-01-31" } }] },
      }] },
    },
  }
  const parsed = parseSenadoLegislatureRoster(Buffer.from(JSON.stringify(roster)), legislature)
  assert.deepEqual([...parsed.ids], ["123"])
  assert.equal(parsed.rows, 1)
  assert.equal(parsed.url, senadoLegislatureRosterUrl(55))
  const duplicate = structuredClone(roster)
  duplicate.ListaParlamentarLegislatura.Parlamentares.Parlamentar.push(duplicate.ListaParlamentarLegislatura.Parlamentares.Parlamentar[0]!)
  assert.throws(() => parseSenadoLegislatureRoster(Buffer.from(JSON.stringify(duplicate)), 55), /duplicado/)
  const wrongInterval = structuredClone(roster)
  wrongInterval.ListaParlamentarLegislatura.Parlamentares.Parlamentar[0]!.Mandatos.Mandato[0]!.PrimeiraLegislaturaDoMandato.DataInicio = "2014-02-01"
  assert.throws(() => parseSenadoLegislatureRoster(Buffer.from(JSON.stringify(wrongInterval)), 55), /intervalo verificável/)
})

import assert from "node:assert/strict"
import test from "node:test"
import { renderToStaticMarkup } from "react-dom/server"

import { CandidatoCard } from "@/components/CandidatoCard"
import { ordenarCandidatosGrid } from "@/components/CandidatoGrid"
import { PatrimonioEvolucaoAlerta } from "@/components/PatrimonioEvolucaoAlerta"
import {
  PATRIMONIO_ATIPICO_FATOR,
  PATRIMONIO_ATIPICO_ROTULO,
  patrimonioDeclaradoAtipico,
} from "@/lib/patrimonio-atipico"
import type { Candidato } from "@/lib/types"

// Fixture sintética: nenhum valor corresponde a candidato real.
const serie = (pares: Array<[number, number | null]>) =>
  pares.map(([ano_eleicao, valor_total]) => ({ ano_eleicao, valor_total }))

test("regra genérica: 2026 >= 100x o último total anterior positivo", () => {
  assert.equal(PATRIMONIO_ATIPICO_FATOR, 100)
  assert.deepEqual(patrimonioDeclaradoAtipico(serie([[2018, 1_000], [2022, 2_000], [2026, 200_000]])), {
    anoAnterior: 2022,
    valorAnterior: 2_000,
    anoAlvo: 2026,
    valorAlvo: 200_000,
    fator: 100,
  })
  // limite exato é atípico; logo abaixo não é
  assert.equal(patrimonioDeclaradoAtipico(serie([[2022, 2_000], [2026, 199_999]])), null)
})

test("pula anos anteriores com total zero ou nulo e usa o último positivo", () => {
  const r = patrimonioDeclaradoAtipico(serie([[2014, 500], [2018, 0], [2022, null], [2026, 50_000]]))
  assert.equal(r?.anoAnterior, 2014)
  assert.equal(r?.valorAnterior, 500)
})

test("sem 2026, sem histórico positivo ou com crescimento comum não marca", () => {
  assert.equal(patrimonioDeclaradoAtipico(serie([[2018, 1_000], [2022, 900_000]])), null)
  assert.equal(patrimonioDeclaradoAtipico(serie([[2026, 9_000_000]])), null)
  assert.equal(patrimonioDeclaradoAtipico(serie([[2022, 0], [2026, 9_000_000]])), null)
  assert.equal(patrimonioDeclaradoAtipico(serie([[2022, 100_000], [2026, 5_000_000]])), null)
  assert.equal(patrimonioDeclaradoAtipico([]), null)
})

test("ficha: alerta mostra aviso de valor atípico, mantém valores oficiais e fontes TSE", () => {
  const html = renderToStaticMarkup(
    <PatrimonioEvolucaoAlerta patrimonio={serie([[2022, 20_000], [2026, 3_000_000]])} />,
  )
  assert.match(html, new RegExp(PATRIMONIO_ATIPICO_ROTULO, "i"))
  assert.match(html, /data-pf-patrimonio-atipico="2026"/)
  assert.match(html, /dadosabertos\.tse\.jus\.br\/dataset\/candidatos-2022/)
  assert.match(html, /dadosabertos\.tse\.jus\.br\/dataset\/candidatos-2026/)
  assert.match(html, /R\$\s3\.000\.000/)
  assert.match(html, /R\$\s20\.000/)
})

test("ficha: aviso não promete exclusão de ordenação que as páginas ainda não aplicam", () => {
  const html = renderToStaticMarkup(
    <PatrimonioEvolucaoAlerta patrimonio={serie([[2022, 20_000], [2026, 3_000_000]])} />,
  )
  assert.match(html, /data-pf-patrimonio-atipico="2026"/)
  assert.doesNotMatch(html, /ordena/i)
})

test("ficha: crescimento grande porém não atípico mantém só o alerta de aumento", () => {
  const html = renderToStaticMarkup(
    <PatrimonioEvolucaoAlerta patrimonio={serie([[2022, 500_000], [2026, 2_000_000]])} />,
  )
  assert.doesNotMatch(html, /data-pf-patrimonio-atipico/)
  assert.match(html, /Aumento patrimonial expressivo/)
})

const candidato = (slug: string, nome: string): Candidato =>
  ({ id: slug, slug, nome_urna: nome, nome_completo: nome, partido_sigla: "PT", partido_atual: "PT", foto_url: null, cargo_disputado: "Senador", estado: "SP", redes_sociais: {} }) as unknown as Candidato

test("card: aviso aparece junto ao valor, que continua visível", () => {
  const html = renderToStaticMarkup(
    <CandidatoCard candidato={candidato("a", "Fulano Teste")} processos={1} patrimonio={3_000_000} patrimonioAtipico index={0} />,
  )
  assert.match(html, /3,0 mi|3\.000\.000|3 mi/)
  assert.match(html, new RegExp(PATRIMONIO_ATIPICO_ROTULO, "i"))
  const semAviso = renderToStaticMarkup(
    <CandidatoCard candidato={candidato("a", "Fulano Teste")} processos={1} patrimonio={3_000_000} index={0} />,
  )
  assert.doesNotMatch(semAviso, new RegExp(PATRIMONIO_ATIPICO_ROTULO, "i"))
})

test("grid: ordenação por patrimônio manda o atípico para o fim, depois dos sem dado", () => {
  const lista = [candidato("a", "Alfa"), candidato("b", "Beta"), candidato("c", "Gama"), candidato("d", "Delta")]
  const ordenados = ordenarCandidatosGrid(lista, "patrimonio", {
    patrimonios: { a: 1_000, b: 90_000_000, c: 50_000, d: null },
    processos: {},
    patrimoniosAtipicos: { b: true },
  })
  assert.deepEqual(ordenados.map((c) => c.slug), ["c", "a", "d", "b"])

  const porNome = ordenarCandidatosGrid(lista, "nome", {
    patrimonios: { b: 90_000_000 },
    processos: {},
    patrimoniosAtipicos: { b: true },
  })
  assert.deepEqual(porNome.map((c) => c.slug), ["a", "b", "d", "c"])
})

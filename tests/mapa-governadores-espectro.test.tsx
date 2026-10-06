import assert from "node:assert/strict"
import { test } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import { LegendaEspectroGovernadores } from "@/components/LegendaEspectroGovernadores"
import { coresGovernadoresPorUf, pinturaDoGovernador, pinturasPorUf } from "@/lib/mapa-governadores-espectro"
import { classificarEspectro } from "@/lib/espectro-eleitos"
import { getResultados1Turno, type Resultados1Turno } from "@/lib/resultados-1turno"

test("cada UF de governador sai com o eleito ou com o líder do 1º turno", () => {
  const data = getResultados1Turno()
  const cores = coresGovernadoresPorUf(data)
  const governador = data.disputas.filter((d) => d.cargo === "Governador")
  assert.ok(cores.length > 0)
  for (const cor of cores) {
    const disputa = governador.find((d) => d.uf.toUpperCase() === cor.uf)!
    const eleito = disputa.candidatos.find((c) => c.fase === "eleito")
    if (cor.situacao === "eleito") {
      assert.equal(eleito?.nome_urna, cor.nome)
    } else {
      assert.equal(eleito, undefined)
      const finalistas = disputa.candidatos.filter((c) => c.fase === "segundo_turno")
      assert.equal(Math.max(...finalistas.map((c) => c.votos)), finalistas.find((c) => c.nome_urna === cor.nome)!.votos)
    }
    assert.equal(cor.classe, classificarEspectro(cor.partido))
  }
})

test("eleito em cor cheia com sigla clara; 2º turno em tom claro com sigla escura", () => {
  const cheia = pinturaDoGovernador({ classe: "direita", situacao: "eleito" })!
  assert.equal(cheia.top, "var(--espectro-direita)")
  assert.equal(cheia.siglaEscura, false)
  const clara = pinturaDoGovernador({ classe: "esquerda", situacao: "lidera_2turno" })!
  assert.match(clara.top, /var\(--espectro-esquerda\) 32%, white/)
  assert.equal(clara.siglaEscura, true)
  assert.equal(pinturaDoGovernador({ classe: "sem_classificacao", situacao: "eleito" }), null)
})

test("partido sem classe e empate no 1º turno ficam com a cor da região", () => {
  const data = {
    disputas: [
      { cargo: "Governador", uf: "xx", candidatos: [{ nome_urna: "A", partido: "SEMCLASSE", votos: 10, fase: "eleito" }] },
      {
        cargo: "Governador",
        uf: "yy",
        candidatos: [
          { nome_urna: "B", partido: "PT", votos: 5, fase: "segundo_turno" },
          { nome_urna: "C", partido: "PL", votos: 5, fase: "segundo_turno" },
        ],
      },
    ],
  } as unknown as Resultados1Turno
  assert.deepEqual(pinturasPorUf(coresGovernadoresPorUf({ ...getResultados1Turno(), disputas: data.disputas })), {})
})

test("legenda só lista as classes presentes", () => {
  const html = renderToStaticMarkup(
    <LegendaEspectroGovernadores
      cores={[{ uf: "SP", classe: "direita", situacao: "eleito", nome: "X", partido: "PL", descricao: "" }]}
    />,
  )
  assert.match(html, /Eleito no 1º turno/)
  assert.match(html, /Direita/)
  assert.doesNotMatch(html, /Esquerda|2º turno, lado/)
  assert.equal(renderToStaticMarkup(<LegendaEspectroGovernadores cores={[]} />), "")
})

import "./helpers/server-only"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { describe, it } from "node:test"

// cspell:ignore cenario espontanea

const require = createRequire(import.meta.url)
const {
  listarPesquisasDoCandidato,
  listarRodadasRecentesDoCandidato,
  parsePesquisasEleitoraisJson,
} = require("../src/lib/pesquisas-eleitorais") as typeof import("@/lib/pesquisas-eleitorais")

type Catalogo = ReturnType<typeof parsePesquisasEleitoraisJson>

function catalogoPresidencial(): Catalogo {
  const catalogo = parsePesquisasEleitoraisJson(
    readFileSync("scripts/data/pesquisas-presidencia-2026.json", "utf8"),
    readFileSync("scripts/data/pesquisas-eleitorais-fontes.json", "utf8"),
  )
  catalogo.pesquisas = [catalogo.pesquisas[0]]
  return catalogo
}

function slugDe(catalogo: Catalogo): string {
  const slug = catalogo.pesquisas[0].cenarios[0].resultados.find((r) => r.matchStatus === "exact_alias")?.candidateSlug
  assert.ok(slug)
  return slug
}

function comNovaRodada(catalogo: Catalogo, id: string, publicacao: string) {
  const nova = structuredClone(catalogo.pesquisas[0])
  nova.id = id
  nova.publicationDate.value = publicacao
  nova.cenarios.forEach((cenario) => { cenario.id = `${cenario.id}-${id}` })
  catalogo.pesquisas.push(nova)
  return nova
}

describe("rodadas anteriores", () => {
  it("separa rodadas antigas do mesmo instituto sem misturar na visão principal", () => {
    const catalogo = catalogoPresidencial()
    const slug = slugDe(catalogo)
    const original = catalogo.pesquisas[0]
    const nova = comNovaRodada(catalogo, "rodada-mais-nova", "2099-01-01")
    const lista = listarPesquisasDoCandidato(catalogo, slug)
    const recentes = lista.filter((item) => item.grupo === "recente")
    const anteriores = lista.filter((item) => item.grupo === "anterior")
    assert.ok(recentes.length > 0 && recentes.every((item) => item.id === nova.id))
    assert.ok(anteriores.length > 0 && anteriores.every((item) => item.id === original.id))
    assert.deepEqual(
      listarRodadasRecentesDoCandidato(catalogo, slug).map((item) => item.id),
      recentes.map((item) => item.id),
    )
    // A visão principal vem primeiro; rodadas antigas depois, da mais nova para a mais antiga.
    assert.equal(lista.findIndex((item) => item.grupo === "anterior"), recentes.length)
  })

  it("exclui rodada antiga de fonte não aprovada ou sem alias exato", () => {
    const catalogo = catalogoPresidencial()
    const slug = slugDe(catalogo)
    comNovaRodada(catalogo, "rodada-mais-nova", "2099-01-01")
    const semAlias = comNovaRodada(catalogo, "antiga-sem-alias", "2000-01-01")
    semAlias.cenarios.forEach((cenario) => cenario.resultados.forEach((resultado) => {
      if (resultado.candidateSlug === slug) resultado.matchStatus = "indeterminado"
    }))
    const excluida = comNovaRodada(catalogo, "antiga-fonte-excluida", "2000-01-02")
    excluida.sourceStatus = "excluído"
    const ids = listarPesquisasDoCandidato(catalogo, slug).map((item) => item.id)
    assert.ok(!ids.includes(semAlias.id))
    assert.ok(!ids.includes(excluida.id))
  })
})

describe("outros cenários", () => {
  it("devolve segundo turno e espontânea em grupos próprios, com rótulo original", () => {
    const catalogo = catalogoPresidencial()
    const slug = slugDe(catalogo)
    const segundo = comNovaRodada(catalogo, "segundo-turno", "2099-01-02")
    segundo.cenarios.forEach((cenario) => {
      cenario.turn = 2
      cenario.labelRaw = "Segundo turno: confronto sintético"
      cenario.comparabilityKey = cenario.comparabilityKey.replace(/^2026\|Presidente\|BR\|1\|/, "2026|Presidente|BR|2|")
    })
    const espontanea = comNovaRodada(catalogo, "espontanea", "2099-01-03")
    espontanea.cenarios.forEach((cenario) => {
      cenario.labelRaw = "Pergunta espontânea sintética"
      cenario.comparabilityKey = cenario.comparabilityKey.replace(/\|estimulad[ao]\|/, "|espontanea|")
    })
    const lista = listarPesquisasDoCandidato(catalogo, slug)
    const doGrupo = (grupo: string) => lista.filter((item) => item.grupo === grupo)
    assert.ok(doGrupo("segundo_turno").length > 0)
    assert.ok(doGrupo("segundo_turno").every((item) => item.id === segundo.id && item.cenario.turn === 2 &&
      item.cenario.labelRaw === "Segundo turno: confronto sintético"))
    assert.ok(doGrupo("espontanea").length > 0)
    assert.ok(doGrupo("espontanea").every((item) => item.id === espontanea.id &&
      item.cenario.labelRaw === "Pergunta espontânea sintética"))
    // Nenhum dos dois entra na visão principal nem nas rodadas anteriores.
    assert.ok([...doGrupo("recente"), ...doGrupo("anterior")].every((item) =>
      item.id !== segundo.id && item.id !== espontanea.id))
    assert.ok(doGrupo("recente").every((item) => item.id === catalogo.pesquisas[0].id))
  })

  it("exclui segundo turno sem alias exato e formatos de pergunta não reconhecidos", () => {
    const catalogo = catalogoPresidencial()
    const slug = slugDe(catalogo)
    const semAlias = comNovaRodada(catalogo, "segundo-sem-alias", "2099-01-02")
    semAlias.cenarios.forEach((cenario) => {
      cenario.turn = 2
      cenario.resultados.forEach((resultado) => {
        if (resultado.candidateSlug === slug) resultado.matchStatus = "not_candidate"
      })
    })
    const outroFormato = comNovaRodada(catalogo, "formato-livre", "2099-01-03")
    outroFormato.cenarios.forEach((cenario) => {
      cenario.comparabilityKey = cenario.comparabilityKey.replace(/\|estimulad[ao]\|/, "|lista-livre|")
    })
    const ids = listarPesquisasDoCandidato(catalogo, slug).map((item) => item.id)
    assert.ok(!ids.includes(semAlias.id))
    assert.ok(!ids.includes(outroFormato.id))
  })
})

describe("integração na ficha", () => {
  const viewSource = readFileSync("src/app/(site)/candidato/[slug]/CandidatoFichaView.tsx", "utf8")

  it("a ficha não carrega pesquisas do Senado: sem aba, o selo do hero é só de Presidente e Governador", () => {
    assert.doesNotMatch(viewSource, /listarPesquisasSenadoPorSlug|senadoComPesquisas/)
    assert.match(viewSource, /pesquisasEnabled && <PesquisasPresidenciaisHero/)
  })
})

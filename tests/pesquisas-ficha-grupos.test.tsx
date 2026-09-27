import "./helpers/server-only"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { describe, it } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

// cspell:ignore cenario espontanea

const require = createRequire(import.meta.url)
const {
  listarPesquisasDoCandidato,
  listarRodadasRecentesDoCandidato,
  parsePesquisasEleitoraisJson,
} = require("../src/lib/pesquisas-eleitorais") as typeof import("@/lib/pesquisas-eleitorais")
const {
  carregarPesquisasSenado,
  listarPesquisasSenadoPorSlug,
  selecionarSenadoPolls,
} = require("../src/lib/senado-polls") as typeof import("@/lib/senado-polls")
const { PesquisasPresidenciaisTab } = require(
  "../src/components/PesquisasPresidenciaisSection",
) as typeof import("@/components/PesquisasPresidenciaisSection")

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

function senadoComResultado() {
  for (const [uf, catalogo] of carregarPesquisasSenado()) {
    for (const pesquisa of selecionarSenadoPolls(catalogo, uf)) {
      const resultado = pesquisa.scenario.resultados.find((r) => r.matchStatus === "exact_alias" && r.candidateSlug)
      if (pesquisa.state === "publicado" && resultado) return { uf, catalogo, slug: resultado.candidateSlug! }
    }
  }
  assert.fail("catálogo do Senado sem resultado publicado com alias exato")
}

describe("pesquisas do Senado na ficha", () => {
  it("usa o mesmo catálogo e a mesma seleção da página da UF, só com alias exato", () => {
    let naPagina = 0
    let naFicha = 0
    for (const [uf, catalogo] of carregarPesquisasSenado()) {
      const slugs = new Set<string>()
      for (const pesquisa of selecionarSenadoPolls(catalogo, uf)) {
        if (pesquisa.state !== "publicado") continue
        for (const resultado of pesquisa.scenario.resultados) {
          if (resultado.matchStatus !== "exact_alias" || !resultado.candidateSlug) continue
          naPagina += 1
          slugs.add(resultado.candidateSlug)
        }
      }
      for (const slug of slugs) {
        const lista = listarPesquisasSenadoPorSlug(slug, uf, catalogo)
        naFicha += lista.length
        for (const item of lista) {
          assert.equal(item.office, "Senador")
          assert.equal(item.geography.code, uf)
          assert.equal(item.resultado.matchStatus, "exact_alias")
          assert.equal(item.resultado.candidateSlug, slug)
          assert.ok(item.grupo === "recente" || item.grupo === "anterior")
        }
      }
    }
    assert.ok(naPagina > 0)
    assert.equal(naFicha, naPagina)
  })

  it("aceita UF em minúsculas e não cruza para outra UF", () => {
    const { uf, slug } = senadoComResultado()
    assert.ok(listarPesquisasSenadoPorSlug(slug, uf.toLowerCase()).length > 0)
    const outraUf = uf === "SP" ? "RJ" : "SP"
    assert.deepEqual(listarPesquisasSenadoPorSlug(slug, outraUf), [])
    assert.deepEqual(listarPesquisasSenadoPorSlug("", uf), [])
  })

  it("exclui fonte não aprovada, registro não publicado, rodada não publicada e vínculo sem alias exato", () => {
    const { uf, catalogo, slug } = senadoComResultado()
    const base = listarPesquisasSenadoPorSlug(slug, uf, catalogo)
    const alvo = base[0]
    const variantes: [string, (poll: Catalogo["pesquisas"][number]) => void][] = [
      ["fonte", (poll) => { poll.sourceStatus = "excluído" }],
      ["registro", (poll) => { poll.registration.code.status = "indeterminado" }],
      ["estado", (poll) => { poll.state = "indeterminado" }],
      ["alias", (poll) => {
        poll.cenarios.forEach((cenario) => cenario.resultados.forEach((resultado) => {
          if (resultado.candidateSlug === slug) resultado.matchStatus = "indeterminado"
        }))
      }],
    ]
    for (const [nome, alterar] of variantes) {
      const copia = structuredClone(catalogo)
      copia.pesquisas.filter((poll) => poll.id === alvo.id).forEach(alterar)
      const lista = listarPesquisasSenadoPorSlug(slug, uf, copia)
      assert.ok(lista.every((item) => item.id !== alvo.id), nome)
    }
  })

  it("mostra turno único, a data da rodada e a nota dos dois votos", () => {
    const { uf, slug } = senadoComResultado()
    const html = renderToStaticMarkup(<PesquisasPresidenciaisTab pesquisas={listarPesquisasSenadoPorSlug(slug, uf)} />)
    assert.match(html, /Turno único/)
    assert.doesNotMatch(html, /1º turno|2º turno/)
    assert.match(html, /Divulgada em \d{2}\/\d{2}\/\d{4}/)
    assert.match(html, /cada eleitor tem dois votos/)
  })
})

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

  it("renderiza as rodadas antigas num bloco recolhido, fora da grade de cartões", () => {
    const catalogo = catalogoPresidencial()
    const slug = slugDe(catalogo)
    const original = catalogo.pesquisas[0]
    comNovaRodada(catalogo, "rodada-mais-nova", "2099-01-01")
    const lista = listarPesquisasDoCandidato(catalogo, slug)
    const html = renderToStaticMarkup(<PesquisasPresidenciaisTab pesquisas={lista} />)
    const anteriores = lista.filter((item) => item.grupo === "anterior")
    assert.equal((html.match(/data-pf-pesquisa-card=/g) ?? []).length, lista.length - anteriores.length)
    assert.match(html, new RegExp(`<details[^>]*data-pf-pesquisas-bloco="anterior"`))
    assert.match(html, new RegExp(`Rodadas anteriores \\(${anteriores.length}\\)`))
    assert.match(html, /data-pf-pesquisas-bloco="anterior"[\s\S]*Divulgada em 01\/01\/2099|Divulgada em 01\/01\/2099[\s\S]*data-pf-pesquisas-bloco="anterior"/)
    const bloco = html.slice(html.indexOf('data-pf-pesquisas-bloco="anterior"'))
    assert.ok(original.registration.code.value && bloco.includes(original.registration.code.value))
    assert.equal((bloco.match(/data-pf-pesquisa-linha=/g) ?? []).length, anteriores.length)
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

    const html = renderToStaticMarkup(<PesquisasPresidenciaisTab pesquisas={lista} />)
    const grade = html.slice(0, html.indexOf("data-pf-pesquisas-bloco="))
    assert.doesNotMatch(grade, /confronto sintético|espontânea sintética/)
    assert.match(html, /data-pf-pesquisas-bloco="segundo_turno"[\s\S]*confronto sintético · 2º turno/)
    assert.match(html, /data-pf-pesquisas-bloco="espontanea"[\s\S]*espontânea sintética · 1º turno · pergunta espontânea/)
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

  it("habilita a aba para Senador com o catálogo do Senado e sem destaque no topo", () => {
    assert.match(viewSource, /ficha\.cargo_disputado === "Senador" && isSenadoEnabled\(\)/)
    assert.match(viewSource, /pesquisasSenadoSemDerrubarFicha\(slug, ficha\.estado\)/)
    // Catálogo inválido esconde a aba do Senado em vez de derrubar a ficha.
    assert.match(viewSource, /try \{\s+return listarPesquisasSenadoPorSlug\(slug, uf\)\s+\} catch/)
    assert.match(viewSource, /pesquisasEnabled && !senadoComPesquisas && <PesquisasPresidenciaisHero/)
  })
})

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
const { ordenarPesquisasDoCard, rotulosDosCenariosDoCard } = require("../src/lib/pesquisas-card") as typeof import("@/lib/pesquisas-card")
const { PollIntentionCard } = require(
  "../src/components/PollIntentionCard",
) as typeof import("@/components/PollIntentionCard")

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

  it("mostra turno único no card da visão geral", () => {
    const { uf, slug } = senadoComResultado()
    const html = renderToStaticMarkup(<PollIntentionCard pesquisas={listarPesquisasSenadoPorSlug(slug, uf)} />)
    assert.match(html, /Turno único/)
    assert.doesNotMatch(html, /1º turno|2º turno/)
  })

  it("identifica a pesquisa anterior do Senado depois do resultado oficial", () => {
    const { uf, slug } = senadoComResultado()
    const html = renderToStaticMarkup(<PollIntentionCard pesquisas={listarPesquisasSenadoPorSlug(slug, uf)} resultadoEleitoralPublicado />)
    assert.match(html, /pesquisa do 1º turno/)
  })
})

describe("card Intenção de voto", () => {
  function catalogoComSegundoTurno() {
    const catalogo = catalogoPresidencial()
    const slug = slugDe(catalogo)
    const recente = comNovaRodada(catalogo, "rodada-recente", "2099-02-01")
    const segundo = comNovaRodada(catalogo, "segundo-mesma-data", "2099-02-01")
    segundo.cenarios.forEach((cenario) => {
      cenario.turn = 2
      cenario.labelRaw = "Segundo turno: confronto sintético"
      cenario.comparabilityKey = cenario.comparabilityKey.replace(/^2026\|Presidente\|BR\|1\|/, "2026|Presidente|BR|2|")
    })
    return { lista: listarPesquisasDoCandidato(catalogo, slug), recente, segundo, original: catalogo.pesquisas[0] }
  }

  it("ordena da divulgação mais recente para a mais antiga, com 1º turno antes do 2º na mesma data", () => {
    const { lista, recente, segundo, original } = catalogoComSegundoTurno()
    const ordem = ordenarPesquisasDoCard(lista)
    assert.equal(ordem.length, lista.length)
    const ids = ordem.map((item) => item.id)
    const primeiroDoSegundo = ids.indexOf(segundo.id)
    assert.ok(primeiroDoSegundo > 0)
    assert.ok(ids.slice(0, primeiroDoSegundo).every((id) => id === recente.id))
    assert.ok(ids.indexOf(original.id) > ids.lastIndexOf(segundo.id))
    for (let i = 1; i < ordem.length; i += 1) {
      const anterior = ordem[i - 1].publicationDate.value ?? ""
      const atual = ordem[i].publicationDate.value ?? ""
      assert.ok(anterior >= atual, "data decrescente")
      if (anterior === atual) assert.ok(ordem[i - 1].cenario.turn <= ordem[i].cenario.turn, "1º turno antes do 2º")
    }
  })

  it("renderiza uma pesquisa por vez com contador, setas acessíveis e o cenário de 2º turno na navegação", () => {
    const { lista } = catalogoComSegundoTurno()
    const html = renderToStaticMarkup(<PollIntentionCard pesquisas={lista} />)
    const primeira = ordenarPesquisasDoCard(lista)[0]
    assert.equal((html.match(/data-pf-pesquisa-card=/g) ?? []).length, 1)
    assert.match(html, /Intenção de voto/)
    assert.match(html, />1º turno</)
    assert.ok(html.includes(primeira.instituto.value!))
    assert.ok(html.includes(primeira.cenario.labelRaw))
    assert.match(html, new RegExp(`aria-live="polite"[^>]*>1 de ${lista.length}<`))
    assert.match(html, /aria-label="Pesquisa anterior"/)
    assert.match(html, /aria-label="Próxima pesquisa"/)
    assert.match(html, /Fonte pública/)
    assert.match(html, /Fotografia do período das entrevistas, não uma previsão eleitoral\./)
    assert.match(html, /Período[\s\S]*Amostra[\s\S]*Margem de erro/)
    assert.ok(lista.some((item) => item.grupo === "segundo_turno"))
  })

  it("não aparece sem pesquisa", () => {
    assert.equal(renderToStaticMarkup(<PollIntentionCard pesquisas={[]} />), "")
  })

  it("põe o adversário no rótulo do 2º turno e numera cenários que ainda repetem o texto", () => {
    const { lista } = catalogoComSegundoTurno()
    const segundo = lista.find((item) => item.cenario.turn === 2)
    assert.ok(segundo)
    const comAdversario = (id: string, labelRaw: string, adversarios: string[]) => ({
      ...segundo,
      cenario: { ...segundo.cenario, id, labelRaw },
      adversarios,
    })
    const rotulos = rotulosDosCenariosDoCard([
      comAdversario("a", "Intenção de voto no 2º turno", ["Lula"]),
      comAdversario("b", "Intenção de voto no 2º turno", ["Lula"]),
      comAdversario("c", "Intenção de voto no 2º turno: Fulano e Lula", ["Lula"]),
      comAdversario("d", "Intenção de voto no 2º turno", ["Ciro Gomes"]),
    ])
    assert.deepEqual(rotulos, [
      "Intenção de voto no 2º turno · vs. Lula · cenário 1/2",
      "Intenção de voto no 2º turno · vs. Lula · cenário 2/2",
      "Intenção de voto no 2º turno: Fulano e Lula",
      "Intenção de voto no 2º turno · vs. Ciro Gomes",
    ])
  })

  it("no acervo real, nenhum candidato vê dois cenários com o mesmo rótulo na mesma divulgação", () => {
    const catalogo = parsePesquisasEleitoraisJson(
      readFileSync("scripts/data/pesquisas-presidencia-2026.json", "utf8"),
      readFileSync("scripts/data/pesquisas-eleitorais-fontes.json", "utf8"),
    )
    const slugs = new Set(
      catalogo.pesquisas.flatMap((poll) =>
        poll.cenarios.flatMap((cenario) =>
          cenario.resultados.flatMap((r) => (r.matchStatus === "exact_alias" && r.candidateSlug ? [r.candidateSlug] : [])),
        ),
      ),
    )
    let segundosTurnos = 0
    for (const slug of slugs) {
      const ordem = ordenarPesquisasDoCard(listarPesquisasDoCandidato(catalogo, slug))
      const rotulos = rotulosDosCenariosDoCard(ordem)
      const vistos = new Set<string>()
      ordem.forEach((item, indice) => {
        if (item.cenario.turn === 2) {
          segundosTurnos += 1
          assert.ok((item.adversarios ?? []).length > 0, `${slug}: 2º turno sem adversário identificado`)
        }
        const chave = `${item.instituto.value}|${item.publicationDate.value}|${item.cenario.turn}|${rotulos[indice]}`
        assert.ok(!vistos.has(chave), `${slug}: rótulo repetido ${chave}`)
        vistos.add(chave)
      })
    }
    assert.ok(segundosTurnos > 0)
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

  it("o selo do hero continua só de Presidente e Governador; o card recebe também o Senado", () => {
    assert.match(viewSource, /ficha\.cargo_disputado === "Senador" && isSenadoEnabled\(\)/)
    assert.match(viewSource, /pesquisasSenadoSemDerrubarFicha\(slug, ficha\.estado\)/)
    // Catálogo inválido esconde o card do Senado em vez de derrubar a ficha.
    assert.match(viewSource, /try \{\s+return listarPesquisasSenadoPorSlug\(slug, uf\)\s+\} catch/)
    assert.match(viewSource, /const pesquisasEnabled =\s+\(ficha\.cargo_disputado === "Presidente" \|\| ficha\.cargo_disputado === "Governador"\)/)
    // A prop de resultado só acompanha uma fase já publicada; sem fase, o
    // mesmo hero é mantido sem marcação nem nó adicional.
    assert.match(viewSource, /ficha\.fase_eleitoral_2026\?\.fase_eleitoral && ficha\.fase_eleitoral_2026\.fase_eleitoral !== "em_disputa"\s+\? <PesquisasPresidenciaisHero pesquisas=\{pesquisas\} resultadoEleitoralPublicado \/>\s+: <PesquisasPresidenciaisHero pesquisas=\{pesquisas\} \/>/)
    assert.match(viewSource, /pesquisas=\{pesquisas\}/)
  })

  it("o card abre a coluna da direita da visão geral", () => {
    const overviewSource = readFileSync("src/components/ProfileOverview.tsx", "utf8")
    const profileSource = readFileSync("src/components/CandidatoProfile.tsx", "utf8")
    assert.match(overviewSource, /const rightColumn: React\.ReactNode\[\] = \[\s+pollCard,\s+factChecksCard,/)
    // Presidente, Governador e Senado continuam usando o mesmo card; a
    // prop editorial é condicional e não cria markup extra no caso nulo.
    assert.match(profileSource, /pollCard=\{pesquisas\.length > 0[\s\S]*?<PollIntentionCard pesquisas=\{pesquisas\} resultadoEleitoralPublicado \/>[\s\S]*?<PollIntentionCard pesquisas=\{pesquisas\} \/>[\s\S]*?: undefined\}/)
  })
})

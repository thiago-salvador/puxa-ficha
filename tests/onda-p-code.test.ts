import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"
import { puxaFichaNextConfig } from "../next.config"
import { getEspectroPartidario } from "../src/data/quiz/espectro-partidario"

type RedirectRule = {
  source: string
  destination: string
  permanent: boolean
}

const expectedSpectra = [
  ["PCB", 1, 2],
  ["AGIR", 7, 8],
  ["MOBILIZA", 6, 6],
  ["DEMOCRATA", 6, 6],
  ["PRD", 7, 8],
] as const

describe("Onda P", () => {
  it("publica os cinco pares editoriais definidos pela coordenacao", () => {
    for (const [sigla, eixoEconomico, eixoSocial] of expectedSpectra) {
      const espectro = getEspectroPartidario(sigla)

      assert.ok(espectro, `espectro ausente para ${sigla}`)
      assert.equal(espectro.eixo_economico, eixoEconomico)
      assert.equal(espectro.eixo_social, eixoSocial)
      assert.equal(espectro.fonte, "curadoria")
      assert.match(espectro.notas ?? "", /DADOS 2023 \(survey 2018/)
      assert.match(espectro.notas ?? "", /espectro-partidos\.json onda-p 14\/08/)
    }
  })

  it("resolve o espectro do partido 35 pela sigla oficial e pelo legado D35", () => {
    const oficial = getEspectroPartidario("DEMOCRATA")
    const legado = getEspectroPartidario("D35")

    assert.ok(oficial)
    assert.ok(legado)
    assert.equal(oficial.partido_sigla, "DEMOCRATA")
    assert.deepEqual(legado, oficial)
  })

  it("resolve o espectro pelas grafias oficiais e legadas de UNIÃO, MISSÃO e PODE", () => {
    const pairs = [
      ["UNIÃO", "UNIAO"],
      ["MISSÃO", "MISSAO"],
      ["PODE", "PODEMOS"],
    ] as const

    for (const [officialSigla, legacySigla] of pairs) {
      const official = getEspectroPartidario(officialSigla)
      const legacy = getEspectroPartidario(legacySigla)

      assert.ok(official)
      assert.ok(legacy)
      assert.equal(official.partido_sigla, officialSigla)
      assert.deepEqual(legacy, official)
    }
  })

  it("instala os 37 redirects permanentes sem incluir as decisoes retidas", async () => {
    assert.ok(puxaFichaNextConfig.redirects)
    const redirects = (await puxaFichaNextConfig.redirects()) as RedirectRule[]
    const ondaP = redirects.filter((redirect) => redirect.source.startsWith("/candidato/"))
    const sources = new Set(ondaP.map((redirect) => redirect.source))

    assert.equal(ondaP.length, 37)
    assert.equal(sources.size, 37)
    assert.equal(ondaP.filter((redirect) => redirect.destination === "/").length, 11)
    assert.equal(ondaP.filter((redirect) => redirect.destination !== "/").length, 26)
    assert.equal(ondaP.every((redirect) => redirect.permanent), true)
    assert.deepEqual(
      ondaP.find((redirect) => redirect.source === "/candidato/geraldo-alckmin"),
      {
        source: "/candidato/geraldo-alckmin",
        destination: "/candidato/lula",
        permanent: true,
      },
    )
    assert.equal(sources.has("/candidato/laudicerio-aguiar"), false)
    assert.equal(sources.has("/candidato/pedro-brito"), false)
  })

  it("invalida todas as chaves de cache que serializam o universo de candidatos", () => {
    const api = readFileSync(join(process.cwd(), "src", "lib", "api.ts"), "utf8")
    const cacheHeads = [
      "public-candidatos-resource",
      "public-candidato-nav-resource",
      "global-search-index",
      "public-candidato-slugs-static",
      "public-candidato-metadata-resource",
      "public-candidato-ficha-resource",
      "public-candidatos-resumo-resource",
      "public-candidatos-comparaveis-resource",
      "ranking-data-resource-public-copy-20260521",
      "quiz-alignment-dataset-resource",
    ]

    for (const head of cacheHeads) {
      const cacheKey = api.match(new RegExp(`\\[\\s*"${head}"[^\\]]*\\]`))
      assert.ok(cacheKey, `cache ${head} nao encontrado`)
      assert.match(cacheKey[0], /"onda-p-20260814"/, `cache ${head} sem bust da Onda P`)
    }
  })
})

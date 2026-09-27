import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"
import { parseBuscaNativa } from "../scripts/lib/checagens-coleta"

/** GET /wp-json/wp/v2/search?search=Lula nas duas agências em 27/09/2026;
 * respostas reais reduzidas a duas linhas e aos campos id, title, url e _links. */
const fixture = (name: string) => readFileSync(new URL(`./fixtures/checagens-coleta/${name}`, import.meta.url), "utf8")

describe("CI hermético e amostras reais de busca WordPress", () => {
  it("usa listagens reais mínimas de Lupa e Comprova no mesmo parser do coletor", () => {
    const lupa = parseBuscaNativa(fixture("lupa-wp-search.json"))
    const comprova = parseBuscaNativa(fixture("comprova-wp-search.json"))
    assert.equal(lupa.length, 2)
    assert.equal(comprova.length, 2)
    assert.ok(lupa.every((item) => new URL(item.link).hostname === "www.agencialupa.org"))
    assert.ok(comprova.every((item) => new URL(item.link).hostname === "projetocomprova.com.br"))
    assert.match(lupa[0].titulo, /Lula/)
    assert.match(comprova[0].titulo, /Lula/)
  })

  it("mantém as sondas externas fora do CI obrigatório", () => {
    const ci = readFileSync(".github/workflows/ci.yml", "utf8")
    const smoke = readFileSync(".github/workflows/checagens-rotas-smoke.yml", "utf8")
    assert.doesNotMatch(ci, /checagens-rotas-smoke\.ts/)
    assert.match(smoke, /workflow_dispatch:/)
    assert.match(smoke, /schedule:/)
    assert.match(smoke, /continue-on-error: true/)
    assert.match(smoke, /checagens-rotas-smoke\.ts/)
  })
})

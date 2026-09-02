import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { getPartyLogoUrl } from "@/lib/utils"

describe("getPartyLogoUrl", () => {
  it("keeps local static logos for existing party assets", () => {
    assert.equal(getPartyLogoUrl("PT"), "/partidos/pt.webp")
    assert.equal(getPartyLogoUrl("AVANTE"), "/partidos/avante.webp")
  })

  it("serve local os logos que antes vinham da Wikimedia (G5-09)", () => {
    assert.equal(getPartyLogoUrl("MOBILIZA"), "/partidos/mobiliza.webp")
    assert.equal(getPartyLogoUrl("PMN"), "/partidos/mobiliza.webp")
    assert.equal(getPartyLogoUrl("PCB"), "/partidos/pcb.webp")
    assert.equal(getPartyLogoUrl("PODE"), "/partidos/pode.webp")
  })

  it("nenhum logo de partido depende de host de terceiro", () => {
    for (const sigla of ["MOBILIZA", "PMN", "PCB", "PODE", "PT", "NOVO", "PSTU"]) {
      const url = getPartyLogoUrl(sigla)
      assert.ok(url && url.startsWith("/partidos/"), `${sigla} -> ${url}`)
    }
  })

  it("keeps unknown parties logo-less instead of inventing an asset", () => {
    assert.equal(getPartyLogoUrl("SEM LOGO"), null)
  })

  it("normaliza diacríticos nas siglas canônicas e preserva grafias legadas", () => {
    assert.equal(getPartyLogoUrl("UNIÃO"), "/partidos/uniao.webp")
    assert.equal(getPartyLogoUrl("UNIAO"), "/partidos/uniao.webp")
    assert.equal(getPartyLogoUrl("MISSÃO"), "/partidos/missao.webp")
    assert.equal(getPartyLogoUrl("MISSAO"), "/partidos/missao.webp")
    assert.equal(getPartyLogoUrl("PODEMOS"), "/partidos/pode.webp")
    assert.equal(getPartyLogoUrl("PMN"), "/partidos/mobiliza.webp")
  })

  it("resolve os oito partidos adicionados pelo PFIX", () => {
    const esperados = [
      "DEMOCRATA",
      "PRTB",
      "AGIR",
      "CIDADANIA",
      "PV",
      "SOLIDARIEDADE",
      "REDE",
      "PRD",
    ]
    for (const sigla of esperados) {
      assert.ok(getPartyLogoUrl(sigla), sigla)
    }
  })
})

export const LOGO_EXCECOES_DOCUMENTADAS: ReadonlyArray<{ sigla: string; motivo: string }> = []

describe("gate estrutural de logos oficiais", () => {
  it("todo partido da referência resolve para um asset local existente", () => {
    const raiz = join(import.meta.dirname, "..")
    const referencia = JSON.parse(
      readFileSync(join(raiz, "data", "referencia-tse-partidos-2026-08-14.json"), "utf8"),
    ) as { partidos: Array<{ sigla: string }> }
    const excecoes = new Map(LOGO_EXCECOES_DOCUMENTADAS.map((item) => [item.sigla, item.motivo]))

    for (const { sigla } of referencia.partidos) {
      const motivo = excecoes.get(sigla)
      if (motivo) {
        assert.ok(motivo.trim().length >= 10, `${sigla}: exceção precisa de motivo rastreável`)
        continue
      }
      const url = getPartyLogoUrl(sigla)
      assert.ok(url, `${sigla}: lookup não resolveu`)
      assert.ok(existsSync(join(raiz, "public", url!.replace(/^\//, ""))), `${sigla}: ${url} ausente`)
    }
  })
})

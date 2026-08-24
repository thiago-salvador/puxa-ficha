import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"

import { PartyLogoMark } from "@/components/PartyLogoMark"

describe("PartyLogoMark", () => {
  it("renderiza o logo local sem duplicar o nome acessível do partido", () => {
    const html = renderToStaticMarkup(<PartyLogoMark sigla="PT" priority />)

    assert.match(html, /data-pf-party-logo="PT"/)
    assert.match(html, /src="\/partidos\/pt\.png"/)
    assert.match(html, /aria-hidden="true"/)
    assert.match(html, /alt=""/)
    assert.match(html, /loading="eager"/)
  })

  it("não reserva espaço quando a sigla não possui logo conhecido", () => {
    assert.equal(renderToStaticMarkup(<PartyLogoMark sigla="PARTIDO-TESTE" />), "")
    assert.equal(renderToStaticMarkup(<PartyLogoMark sigla={null} />), "")
  })

  it("renderiza todas as siglas canônicas da referência do TSE", () => {
    const referencia = JSON.parse(
      readFileSync(
        join(import.meta.dirname, "..", "data", "referencia-tse-partidos-2026-08-14.json"),
        "utf8",
      ),
    ) as { partidos: Array<{ sigla: string }> }

    assert.ok(referencia.partidos.length > 0)
    for (const { sigla } of referencia.partidos) {
      const html = renderToStaticMarkup(<PartyLogoMark sigla={sigla} />)
      assert.match(html, /data-pf-party-logo=/, sigla)
      assert.match(html, /src="\/partidos\/[a-z0-9-]+\.png"/, sigla)
    }
  })
})

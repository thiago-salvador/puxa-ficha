import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { sanitizeTemplateText } from "../scripts/lib/ptbr-sanitize"

describe("sanitizeTemplateText", () => {
  it("fixes TSE contexto template", () => {
    assert.equal(
      sanitizeTemplateText("mudanca observada entre eleicoes TSE (2018)"),
      "Mudança observada entre eleições TSE (2018)"
    )
  })

  it("fixes NAO ELEITO from old TSE data", () => {
    assert.equal(
      sanitizeTemplateText("Candidatura: NAO ELEITO (TSE 1994)"),
      "Candidatura: NÃO ELEITO (TSE 1994)"
    )
  })

  it("fixes Filiacao/atualizacao anchor template (with latestMudanca)", () => {
    assert.equal(
      sanitizeTemplateText(
        "Filiacao atual observada na atualizacao do perfil em 31/03/2026; data exata da mudanca anterior ainda nao determinada."
      ),
      "Filiação atual observada na atualização do perfil em 31/03/2026; data exata da mudança anterior ainda não determinada."
    )
  })

  it("fixes Filiacao/atualizacao anchor template (without latestMudanca)", () => {
    assert.equal(
      sanitizeTemplateText(
        "Filiacao atual observada na atualizacao do perfil em 31/03/2026; historico partidario anterior ainda nao determinado."
      ),
      "Filiação atual observada na atualização do perfil em 31/03/2026; histórico partidário anterior ainda não determinado."
    )
  })

  it("fixes current-anchor observacoes template", () => {
    assert.equal(
      sanitizeTemplateText(
        "Cargo atual confirmado na atualizacao do perfil em 31/03/2026; inicio do mandato ainda nao determinado."
      ),
      "Cargo atual confirmado na atualização do perfil em 31/03/2026; início do mandato ainda não determinado."
    )
  })

  it("fixes enrich-wiki-historico template", () => {
    assert.equal(
      sanitizeTemplateText("Cargo identificado via categorias da Wikipedia. Periodo nao determinado."),
      "Cargo identificado via categorias da Wikipedia. Período não determinado."
    )
  })

  it("fixes filiacao curada template", () => {
    assert.equal(
      sanitizeTemplateText("filiacao atual curada (PSD MA 2026-01-19)"),
      "filiação atual curada (PSD MA 2026-01-19)"
    )
  })

  it("is idempotent on already-correct text", () => {
    const correct = "Mudança observada entre eleições TSE (2022)"
    assert.equal(sanitizeTemplateText(correct), correct)
  })

  it("does not alter editorial free text", () => {
    const editorial = "Migrou para o PSD antes de disputar a reeleição em 2026"
    assert.equal(sanitizeTemplateText(editorial), editorial)
  })

  it("does not alter Wikidata template (already correct)", () => {
    const wikidata = "Importado automaticamente de Wikidata P39 em 2026-04-06"
    assert.equal(sanitizeTemplateText(wikidata), wikidata)
  })
})

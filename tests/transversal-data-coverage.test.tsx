import assert from "node:assert/strict"
import { test } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import { DataCoverageDetails } from "../src/components/DataCoverageDetails"
import { estadoDaFonte, type FonteDeDestaque } from "../src/lib/destaques-ficha"
import { publicDataState, patrimonioWithoutValueLabel } from "../src/lib/public-data-vocabulary"

test("public vocabulary preserves absence, failure, limited search and unknown", () => {
  const receipt = { executado_em: "2026-09-08", resultado: "erro" as const }
  assert.equal(publicDataState(estadoDaFonte(false, receipt)), "unavailable")
  assert.equal(publicDataState(estadoDaFonte(false, { ...receipt, resultado: "vazio_confirmado" })), "confirmedEmpty")
  assert.equal(publicDataState(estadoDaFonte(false, { ...receipt, resultado: "sem_achado_no_escopo" })), "notLocated")
  assert.equal(publicDataState(estadoDaFonte(false, { ...receipt, resultado: "encontrado" })), "underReview")
  assert.equal(publicDataState(estadoDaFonte(false, null)), "unverified")
  assert.equal(publicDataState(estadoDaFonte(true, receipt)), "published")
})

test("coverage shows receipt scope and date without a candidate score or invented dates", () => {
  const source: FonteDeDestaque = { chave: "processos", rotulo: "Processos", categoria: "factual", estado: { tipo: "vazio_confirmado", verificadoEm: "2026-09-08" }, proveniencia: { fonte: "Fonte de teste", detalhe: "Recorte de teste de 2024", url: "https://example.org/fonte" } }
  const html = renderToStaticMarkup(<DataCoverageDetails fontes={[source]} verifications={{ processos: { resultado: "vazio_confirmado", executado_em: "2026-09-08" } }} />)
  assert.match(html, /Ausência confirmada no escopo/)
  assert.match(html, /Recorte de teste de 2024/)
  assert.match(html, /08\/09\/2026/)
  assert.match(html, /não avalia a candidatura/)
  assert.doesNotMatch(html, /role="progressbar"/)
  const fromState = renderToStaticMarkup(<DataCoverageDetails fontes={[source]} verifications={{}} />)
  assert.match(fromState, /Última consulta: 08\/09\/2026/)
  assert.doesNotMatch(fromState, /data não informada/)
  const unknown = renderToStaticMarkup(<DataCoverageDetails fontes={[{ ...source, estado: { tipo: "nunca_verificado" }, proveniencia: undefined }]} verifications={{}} />)
  assert.match(unknown, /data não informada/)
  assert.match(unknown, /Fonte da consulta não informada/)
})

test("missing patrimônio value preserves the latest election state without extending old absence", () => {
  const confirmed = { ano: 2022, estado: "vazio_confirmado" as const, fonte_url: null, verificado_em: "2026-09-08" }
  assert.equal(patrimonioWithoutValueLabel([confirmed]), "Sem bens declarados ao TSE em 2022")
  assert.equal(patrimonioWithoutValueLabel([confirmed, { ...confirmed, ano: 2026, estado: "nao_coletado" }]), "Ainda não verificado")
})

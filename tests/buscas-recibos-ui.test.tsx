import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"

import falasReceipts from "../scripts/data/falas-recibos.json"
import { AttributedFactChecks } from "../src/components/AttributedFactChecks"
import { CandidateDebatesBentoCard, hasCandidateFalasCard } from "../src/components/CandidateDebatesBentoCard"
import {
  formatarDataBusca,
  selecionarReciboChecagens,
  selecionarReciboFalas,
  type ReciboChecagensVisivel,
} from "../src/lib/buscas-recibos"
import { auditarRodadaFalas } from "../scripts/lib/falas-rodada"
import { consolidarRecibosFalas } from "../scripts/lib/falas-recibos-publicos"
import type { CandidatoFalas } from "../scripts/lib/falas-monitoramento"

const identity = { candidate_id: "cand-a", candidate_slug: "cand-a" }
const catalog = (receipts: unknown[]) => ({ schema_version: "checagens-recibos-v1", agencias: ["Lupa", "Aos Fatos"], receipts })
const agencias = ["Lupa", "Aos Fatos", "Fato ou Fake", "Estadão Verifica", "UOL Confere", "AFP Checamos", "Comprova"]

describe("recibos de busca no site", () => {
  it("lê recibo válido e falha fechado em qualquer defeito", () => {
    const valid = { ...identity, searched_at: "2026-09-25T12:00:00Z", result: "vazio_confirmado", leads: 0 }
    assert.deepEqual(selecionarReciboChecagens(catalog([valid]), identity), { searchedAt: valid.searched_at, result: "vazio_confirmado", leads: 0, agencias: ["Lupa", "Aos Fatos"] })
    assert.deepEqual(selecionarReciboChecagens(catalog([{ ...valid, agencias: ["Lupa"] }]), identity)?.agencias, ["Lupa"])
    assert.equal(selecionarReciboChecagens(catalog([{ ...valid, agencias: [] }]), identity), null)
    assert.equal(selecionarReciboChecagens(catalog([{ ...valid, result: "erro" }]), identity), null)
    assert.equal(selecionarReciboChecagens(catalog([{ ...valid, result: "encontrado", leads: 0 }]), identity), null)
    assert.equal(selecionarReciboChecagens(catalog([{ ...valid, searched_at: "ontem" }]), identity), null)
    assert.equal(selecionarReciboChecagens(catalog([{ ...valid, candidate_slug: "outro-slug" }]), identity), null)
    assert.equal(selecionarReciboChecagens({ ...catalog([valid]), schema_version: "v0" }, identity), null)
    assert.equal(selecionarReciboFalas({ schema_version: "falas-recibos-v1", receipts: [{ ...identity, searched_at: "2026-09-24T08:00:00Z", window_from: "2026-09-10", window_to: "2026-09-24", result: "bloqueada" }] }, identity), null)
  })

  it("data da busca sai no fuso de Brasília", () => {
    assert.equal(formatarDataBusca("2026-09-25T01:30:00Z"), "24/09/2026")
    assert.equal(formatarDataBusca("2026-09-10"), "10/09/2026")
  })
})

describe("aba Checagens com recibo", () => {
  const render = (searchReceipt: ReciboChecagensVisivel | null, slug = "sem-checagem") => renderToStaticMarkup(
    <AttributedFactChecks candidateId={`id-${slug}`} candidateSlug={slug} office="Governador" uf="SP" searchReceipt={searchReceipt} />,
  )

  it("diz que a busca foi feita e nada foi encontrado", () => {
    const html = render({ searchedAt: "2026-09-25T15:00:00Z", result: "vazio_confirmado", leads: 0, agencias })
    assert.match(html, /data-pf-checagens-busca="vazio_confirmado"/)
    assert.match(html, /Busca feita em 25\/09\/2026 em Lupa, Aos Fatos, Fato ou Fake, Estadão Verifica, UOL Confere, AFP Checamos e Comprova: nenhuma checagem com o nome deste candidato no título\./)
    assert.doesNotMatch(html, /data-pf-attributed-check-id/)
  })

  it("com leads em conferência não afirma ausência nas agências", () => {
    const html = render({ searchedAt: "2026-09-25T15:00:00Z", result: "encontrado", leads: 3, agencias })
    assert.match(html, /3 matérias citam o nome deste candidato no título\. Nenhuma checagem de fala dele foi conferida e publicada aqui até agora\./)
    assert.doesNotMatch(html, /nenhuma checagem com o nome/)
  })

  it("sem recibo e sem checagem não renderiza nada", () => {
    assert.equal(render(null), "")
  })
})

describe("card de Falas com recibo", () => {
  it("mostra busca vazia só com recibo válido e sem aspa", () => {
    const html = renderToStaticMarkup(<CandidateDebatesBentoCard candidateSlug="leonardo-avalanche" candidateId="11aeff6f-ce8d-45bb-a4d1-a798b160e2fe" />)
    assert.match(html, /data-pf-falas-busca-vazia="2026-09-24T08:33:51.000Z"/)
    assert.match(html, /Busca feita em 24\/09\/2026, cobrindo 10\/09\/2026 a 24\/09\/2026: nenhuma fala com aspas conferida para esta ficha\./)
    assert.equal(hasCandidateFalasCard("leonardo-avalanche", "11aeff6f-ce8d-45bb-a4d1-a798b160e2fe"), true)
  })

  it("nunca afirma busca para quem não tem recibo", () => {
    assert.equal(renderToStaticMarkup(<CandidateDebatesBentoCard candidateSlug="senador-sem-busca" candidateId="id-inexistente" />), "")
    assert.equal(hasCandidateFalasCard("senador-sem-busca", "id-inexistente"), false)
  })

  it("recibo versionado cobre a rodada inteira sem identidade repetida", () => {
    assert.equal(falasReceipts.schema_version, "falas-recibos-v1")
    assert.equal(new Set(falasReceipts.receipts.map((receipt) => receipt.candidate_id)).size, falasReceipts.receipts.length)
    assert.ok(falasReceipts.receipts.length >= 204)
  })
})

describe("auditoria da rodada confere found contra aspa publicada", () => {
  const ana: CandidatoFalas = { id: "ana-id", slug: "ana-silva", nome_urna: "Ana Silva", nome_completo: "Ana Silva Souza", cargo_disputado: "Governador", estado: "SP" }
  const bia: CandidatoFalas = { id: "bia-id", slug: "bia-souza", nome_urna: "Bia Souza", nome_completo: "Bia Souza Lima", cargo_disputado: "Presidente", estado: null }
  const found = (candidate: CandidatoFalas) => ({
    candidate_id: candidate.id, candidate_slug: candidate.slug, provider: "google", query: "busca", observed_at: "2026-09-20T10:00:00Z", status: "executed",
    individual_response: { candidate_id: candidate.id, candidate_slug: candidate.slug, result: "found", response_excerpt: "Aspa na fonte" },
  })

  it("aponta found sem aspa na janela e exporta sem_fala", () => {
    const audit = auditarRodadaFalas({
      roster: [ana, bia], roundStart: "2026-09-20T00:00:00Z", now: "2026-09-21T00:00:00Z", receipts: [found(ana), found(bia)],
      catalog: { quotes: [{ candidate_id: ana.id, candidate_slug: ana.slug, occurred_on: "2026-09-12" }, { candidate_id: bia.id, candidate_slug: bia.slug, occurred_on: "2026-08-01" }] },
    })
    assert.equal(audit.quote_window_from, "2026-09-06")
    assert.equal(audit.found, 2)
    assert.equal(audit.found_without_quote, 1)
    assert.deepEqual(audit.found_without_quote_names, ["Bia Souza"])
    const exported = consolidarRecibosFalas(null, audit, new Date("2026-09-21T00:00:00Z"))
    assert.deepEqual(exported.receipts.map((receipt) => [receipt.candidate_slug, receipt.result, receipt.searched_at]), [
      ["ana-silva", "com_fala", "2026-09-20T10:00:00.000Z"],
      ["bia-souza", "sem_fala", "2026-09-20T10:00:00.000Z"],
    ])
  })

  it("busca não feita não vira recibo público", () => {
    const audit = auditarRodadaFalas({ roster: [ana], roundStart: "2026-09-20T00:00:00Z", now: "2026-09-21T00:00:00Z", receipts: [] })
    assert.equal(consolidarRecibosFalas(null, audit, new Date()).receipts.length, 0)
  })
})

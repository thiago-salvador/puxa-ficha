// cspell:words variacao partidario camara ceaps filiacao
import test from "node:test"
import assert from "node:assert/strict"
import {
  BOX_CARD_KINDS,
  buildCandidateBoxCard,
  buildComparatorBoxCard,
} from "@/lib/box-card-model"
import { formatBRL, formatCompact } from "@/lib/utils"
import { formatFinanciamentoPleitoPublicLabelForRow } from "@/lib/financiamento-pleito-public-label"
import { formatVoteBadgeLabel } from "@/lib/ui-labels"
import { formatVotoCasaQuando } from "@/lib/vote-badge"
import { formatPartyTransitionLabel } from "@/lib/party-switches"
import * as historicoDisplay from "@/lib/historico-display"
import { makeBoxCardCandidate, makeBoxCardComparables } from "./fixtures/box-card"

test("the approved set contains nine public box kinds", () => {
  assert.deepEqual(BOX_CARD_KINDS, [
    "patrimonio-resumo", "evolucao-patrimonial-resumo", "financiamento-resumo",
    "despesas-campanha", "cota-resumo", "votacoes-resumo", "cargos-mandatos",
    "historico-partidario", "comparador",
  ])
})

test("candidate projections preserve the public UI formatting and ordering", () => {
  const ficha = makeBoxCardCandidate()
  const patrimoine = buildCandidateBoxCard("patrimonio-resumo", ficha)!
  assert.equal(patrimoine.key, "fixture-boxes")
  assert.equal(patrimoine.identity, "Candidata Exemplo · PX · Deputado Federal · SP")
  const withoutUf = buildCandidateBoxCard("patrimonio-resumo", makeBoxCardCandidate({ estado: null }))!
  assert.equal(withoutUf.identity, "Candidata Exemplo · PX · Deputado Federal")
  assert.equal(patrimoine.rows[0]?.value, formatCompact(125000))
  assert.equal(patrimoine.deepLink, "/candidato/fixture-boxes?tab=geral#box-patrimonio-resumo")

  const evolution = buildCandidateBoxCard("evolucao-patrimonial-resumo", ficha)!
  // Mais recente primeiro: se o card cortar linhas, some o ano mais antigo, nunca o atual.
  assert.deepEqual(evolution.rows.map(({ label }) => label), ["2026", "2022"])
  assert.deepEqual(evolution.rows.map(({ value }) => value), [formatCompact(125000), formatCompact(100000)])
  assert.equal(evolution.rows[0]?.detail, "↑ 25% entre 2022 e 2026")
  assert.deepEqual(evolution.subjects, [{ name: ficha.nome_urna, meta: "PX · Deputado Federal · SP", photoUrl: ficha.foto_url ?? null }])

  const financing = buildCandidateBoxCard("financiamento-resumo", ficha)!
  assert.equal(financing.rows[0]?.label, formatFinanciamentoPleitoPublicLabelForRow(ficha.financiamento[0]!, ficha.historico))
  assert.equal(financing.rows[0]?.value, formatCompact(12500))
  assert.match(financing.rows[0]?.detail ?? "", /Fundo Eleitoral/)

  const expenses = buildCandidateBoxCard("despesas-campanha", ficha)!
  assert.equal(expenses.rows[0]?.value, formatBRL(4200))
  assert.deepEqual(expenses.rows[1], { label: "Publicidade · 2", value: formatBRL(4200) })
  assert.equal(expenses.warnings[0], "Prestação parcial. Os valores abaixo vêm da prestação de contas entregue até 02/01/2026 e podem mudar nas próximas entregas.")
  assert.equal(expenses.sources[0]?.url, "https://example.test/tse/despesas")
  assert.equal(expenses.sources[0]?.collectedAt, "2026-01-02T00:00:00.000Z")
  assert.equal(expenses.deepLink, "/candidato/fixture-boxes?tab=dinheiro#box-despesas-campanha")

  const cotaFicha = makeBoxCardCandidate({
    gastos_parlamentares: [
      { ...ficha.gastos_parlamentares[0]!, detalhamento: [{ categoria: "Publicidade", valor: 1000 }, { categoria: "Transporte", valor: 4000 }] },
      { ...ficha.gastos_parlamentares[0]!, id: "older-ceap", ano: 2024, total_gasto: 9000, coletado_em: "2025-12-20T00:00:00.000Z" },
    ],
  })
  const cota = buildCandidateBoxCard("cota-resumo", cotaFicha)!
  assert.equal(cota.rows[0]?.value, formatCompact(5000))
  assert.equal(cota.rows[0]?.label, "Total em 2025")
  assert.deepEqual(cota.rows.slice(1, 3).map(({ label }) => label), ["Transporte", "Publicidade"])
  assert.equal(cota.sources[0]?.label, "Câmara: cota parlamentar (2025)")
  assert.equal(cota.sources[0]?.url, "https://www.camara.leg.br/cotas/Ano-2025.csv.zip")
  assert.equal(cota.sources[0]?.collectedAt, "2026-01-02T00:00:00.000Z")
  const asPublicCota = (row: typeof ficha.gastos_parlamentares[number], casa: "camara" | "senado") => {
    const publicRow = { ...row, casa } as typeof row & { casa: string }
    delete (publicRow as unknown as Record<string, unknown>).fonte
    return publicRow as typeof row
  }
  const publicCamaraCard = buildCandidateBoxCard("cota-resumo", makeBoxCardCandidate({
    gastos_parlamentares: [asPublicCota(ficha.gastos_parlamentares[0]!, "camara")],
  }))!
  assert.equal(publicCamaraCard.revision, buildCandidateBoxCard("cota-resumo", ficha)?.revision)
  assert.equal(publicCamaraCard.sources[0]?.label, "Câmara: cota parlamentar (2025)")
  assert.equal(publicCamaraCard.sources[0]?.collectedAt, "2026-01-02T00:00:00.000Z")
  const rawSenadoFicha = makeBoxCardCandidate({ gastos_parlamentares: [{ ...ficha.gastos_parlamentares[0]!, fonte: "Senado Federal" }] })
  const rawSenadoCard = buildCandidateBoxCard("cota-resumo", rawSenadoFicha)!
  const publicCeapsCard = buildCandidateBoxCard("cota-resumo", makeBoxCardCandidate({
    gastos_parlamentares: [asPublicCota(rawSenadoFicha.gastos_parlamentares[0]!, "senado")],
  }))!
  assert.equal(publicCeapsCard.revision, rawSenadoCard.revision)
  assert.equal(publicCeapsCard.sources[0]?.label, "Senado: cota parlamentar")
  assert.equal(publicCeapsCard.sources[0]?.collectedAt, "2026-01-02T00:00:00.000Z")
  const cotaWithoutCollectionDate = buildCandidateBoxCard("cota-resumo", makeBoxCardCandidate({
    gastos_parlamentares: [{ ...ficha.gastos_parlamentares[0]!, coletado_em: null }],
  }))!
  assert.equal(cotaWithoutCollectionDate.sources[0]?.collectedAt, null)

  const voteFicha = makeBoxCardCandidate({ votos: [
    ...ficha.votos,
    { ...ficha.votos[0]!, id: "vote-second", votacao_id: "vote-second", voto: "não", votacao: { ...ficha.votos[0]!.votacao!, id: "vote-second", titulo: "Votação posterior", data_votacao: "2026-05-02", proposicao_id: "fixture-proposicao-2", votacao_id_api: "fixture-votacao-2" } },
  ] })
  const votes = buildCandidateBoxCard("votacoes-resumo", voteFicha)!
  assert.deepEqual(votes.rows.map(({ label }) => label), ["Projeto de teste", "Votação posterior"])
  assert.equal(votes.rows[0]?.label, ficha.votos[0]?.votacao?.titulo)
  assert.equal(votes.rows[0]?.value, formatVoteBadgeLabel("sim"))
  assert.equal(votes.rows[1]?.value, formatVoteBadgeLabel("não"))
  assert.equal(votes.rows[0]?.detail, formatVotoCasaQuando(ficha.votos[0]?.votacao))
  assert.equal(votes.sources[0]?.label, "Câmara · votação nominal: Projeto de teste")
  assert.equal(votes.sources[0]?.url, "https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=fixture-proposicao")
  assert.equal(votes.sources[0]?.collectedAt, null)

  const careers = buildCandidateBoxCard("cargos-mandatos", ficha)!
  assert.equal(careers.rows[0]?.value, historicoDisplay.formatHistoricoCargoTituloPublico(ficha.historico[0]!))
  assert.equal(careers.deepLink, "/candidato/fixture-boxes?tab=trajetoria#box-cargos-mandatos")

  const parties = buildCandidateBoxCard("historico-partidario", ficha)!
  assert.equal(parties.rows[0]?.value, formatPartyTransitionLabel(ficha.mudancas_partido[0]!))
})

test("comparator output follows selected slug order, keeps zero, and labels missing values", () => {
  const candidates = makeBoxCardComparables()
  const card = buildComparatorBoxCard(candidates, {
    slugs: ["fixture-beta", "fixture-alfa", "fixture-delta"],
    axis: "patrimonio",
    uf: "SP",
    cargo: "Deputado Federal",
  })!
  assert.equal(card.key, "fixture-beta~fixture-alfa~fixture-delta")
  assert.equal(card.identity, "Candidatura BETA × Candidatura ALFA × Candidatura DELTA")
  assert.equal(card.rows[0]?.value, formatCompact(1000))
  assert.equal(card.rows[1]?.value, formatCompact(0))
  assert.equal(card.rows[2]?.value, "Ainda não verificado")
  const search = new URLSearchParams(card.deepLink.split("?")[1]?.split("#")[0])
  assert.deepEqual([search.get("c1"), search.get("c2"), search.get("c3")], ["fixture-beta", "fixture-alfa", "fixture-delta"])
  assert.equal(search.get("eixo"), "patrimonio")
  assert.equal(search.get("cargo"), "Deputado Federal")
  assert.equal(search.get("uf"), "SP")
  assert.equal(card.deepLink.endsWith("#box-comparador"), true)
  assert.equal(card.sources[0]?.collectedAt, null)
  assert.match(card.sources[0]?.url ?? "", /dadosabertos\.tse\.jus\.br\/dataset\/candidatos-2026$/)
  const gastoAxis = buildComparatorBoxCard(candidates, {
    slugs: ["fixture-alfa", "fixture-beta"], axis: "gastos",
  })!
  assert.deepEqual(gastoAxis.sources.map(({ label }) => label), ["Câmara dos Deputados: cota parlamentar", "Senado: cota parlamentar"])
  assert.ok(gastoAxis.sources.every((source) => source.collectedAt === null))
})

test("party uncertainty and structural conflict never expose transition rows", () => {
  const unverified = makeBoxCardCandidate({ filiacao_verificacao: null, mudancas_partido: [] })
  const card = buildCandidateBoxCard("historico-partidario", unverified)!
  assert.equal(card.rows.length, 1)
  assert.match(card.rows[0]!.value, /^Partido declarado na candidatura:/)
  assert.match(card.warnings[0]!, /contagem de trocas fica em aberto/)

  const contradictory = makeBoxCardCandidate({ mudancas_partido: [
    { id: "a", candidato_id: "fixture-boxes-id", partido_anterior: "PT", partido_novo: "PL", ano: 2024, data_mudanca: null, contexto: null },
    { id: "b", candidato_id: "fixture-boxes-id", partido_anterior: "PL", partido_novo: "PT", ano: 2024, data_mudanca: null, contexto: null },
  ] })
  const blocked = buildCandidateBoxCard("historico-partidario", contradictory)
  assert.equal(blocked, null)
})

test("candidate and comparator cards never serialize donor or supplier names", () => {
  const candidate = makeBoxCardCandidate()
  for (const kind of BOX_CARD_KINDS.filter((item) => item !== "comparador")) {
    const card = buildCandidateBoxCard(kind, candidate)
    if (card) {
      const output = JSON.stringify(card)
      assert.equal(output.includes("NOME DE DOADOR QUE NÃO PODE SER PUBLICADO"), false)
      assert.equal(output.includes("FORNECEDOR DE TESTE NÃO PUBLICÁVEL"), false)
    }
  }
})

test("missing, failed, or noncomparable inputs return null and revisions are deterministic", () => {
  const emptyFicha = makeBoxCardCandidate({
    patrimonio: [], patrimonio_eleicoes: [], financiamento: [], financiamento_despesas: null,
    financiamento_despesas_status: "indisponivel", gastos_parlamentares: [], votos: [],
    historico: [], mudancas_partido: [], partido_sigla: "", partido_atual: "",
  })
  for (const kind of BOX_CARD_KINDS.filter((item) => item !== "comparador")) {
    assert.equal(buildCandidateBoxCard(kind, emptyFicha), null, `${kind} should be absent without usable data`)
  }
  assert.equal(buildCandidateBoxCard("despesas-campanha", makeBoxCardCandidate({ financiamento_despesas_status: "indisponivel" })), null)
  assert.equal(buildCandidateBoxCard("evolucao-patrimonial-resumo", makeBoxCardCandidate({ patrimonio: [
    { id: "zero", candidato_id: "fixture-boxes-id", ano_eleicao: 2022, valor_total: 0, bens: [] },
    { id: "one", candidato_id: "fixture-boxes-id", ano_eleicao: 2026, valor_total: 100, bens: [] },
  ] })), null)
  const fixture = makeBoxCardCandidate()
  assert.equal(buildCandidateBoxCard("patrimonio-resumo", fixture)?.revision, buildCandidateBoxCard("patrimonio-resumo", fixture)?.revision)
  assert.equal(buildComparatorBoxCard(makeBoxCardComparables(), { slugs: ["fixture-alfa"] }), null)
})

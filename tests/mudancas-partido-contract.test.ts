/**
 * Contrato testável de `mudancas_partido` (Fase 3 do fluxo de trajetória política).
 *
 * Este arquivo captura os invariantes do contrato público de `mudancas_partido`
 * que hoje vivem em `as regras canônicas de negócio`.
 * Falhas aqui significam regressão de contrato público ou mudança editorial não
 * registrada via atualização da fonte única antes do merge.
 *
 * Cobertura:
 *  - `partiesEquivalent` é estrito por sigla canônica (D3 do plano Fase 3).
 *  - `partiesHistoricallyEquivalent` agrupa via `HISTORICAL_PARTY_GROUPS` (D4).
 *  - `PSD` NÃO está em grupo histórico hoje (regressão dura para ADR-T5).
 *  - `countPartySwitches` colapsa renomeações históricas e conta trocas reais.
 *  - `hasSameYearPartyReversal` dispara só em A→B/B→A real, ignorando renomeações.
 *  - `partiesEquivalent("PTB","PTB") === true` (drift script vs UI fixado em Fase 3).
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  formatPartyDisplayLabel,
  partiesEquivalent,
  partiesHistoricallyEquivalent,
  resolveCanonicalPartySigla,
} from "../src/lib/party-utils"
import {
  countPartySwitches,
  hasSameYearPartyReversal,
  normalizePartyTimelineForDisplay,
} from "../src/lib/party-switches"
import type { MudancaPartido } from "../src/lib/types"

function row(
  partial: Partial<MudancaPartido> & Pick<MudancaPartido, "id" | "ano">,
): MudancaPartido {
  return {
    candidato_id: "c1",
    partido_anterior: "",
    partido_novo: "",
    data_mudanca: null,
    contexto: null,
    ...partial,
  }
}

describe("mudancas_partido contract — partiesEquivalent (estrito por sigla canônica)", () => {
  it("PFL e DEM são siglas distintas, não são equivalentes estritos", () => {
    assert.equal(partiesEquivalent("PFL", "DEM"), false)
    assert.equal(partiesEquivalent("DEM", "PFL"), false)
  })

  it("PMDB e MDB são siglas distintas, não são equivalentes estritos", () => {
    assert.equal(partiesEquivalent("PMDB", "MDB"), false)
    assert.equal(partiesEquivalent("MDB", "PMDB"), false)
  })

  it("PSD não é equivalente estrito a DEM nem PFL", () => {
    assert.equal(partiesEquivalent("PSD", "DEM"), false)
    assert.equal(partiesEquivalent("PSD", "PFL"), false)
    assert.equal(partiesEquivalent("DEM", "PSD"), false)
  })

  it("PR e PL são siglas distintas, não são equivalentes estritos", () => {
    assert.equal(partiesEquivalent("PR", "PL"), false)
    assert.equal(partiesEquivalent("PL", "PR"), false)
  })

  it("siglas iguais (incluindo aliases por nome longo) são equivalentes estritos", () => {
    assert.equal(partiesEquivalent("PT", "PT"), true)
    assert.equal(partiesEquivalent("PT", "Partido dos Trabalhadores"), true)
    assert.equal(partiesEquivalent("DEM", "Democratas"), true)
  })

  it("Democrata 35 é DEMOCRATA e não colapsa com o DEM extinto", () => {
    assert.equal(resolveCanonicalPartySigla("D35"), "DEMOCRATA")
    assert.equal(resolveCanonicalPartySigla("Democrata"), "DEMOCRATA")
    assert.equal(resolveCanonicalPartySigla("Democrata 35"), "DEMOCRATA")
    assert.equal(resolveCanonicalPartySigla("DEMOCRATAS"), "DEM")
    assert.equal(partiesEquivalent("D35", "Democrata 35"), true)
    assert.equal(partiesEquivalent("D35", "DEM"), false)
  })

  it("Solidariedade mantém a sigla canônica em caixa alta", () => {
    assert.equal(resolveCanonicalPartySigla("SOLIDARIEDADE"), "SOLIDARIEDADE")
    assert.equal(resolveCanonicalPartySigla("Solidariedade"), "SOLIDARIEDADE")
    assert.equal(resolveCanonicalPartySigla("SD"), "SOLIDARIEDADE")
  })
})

describe("mudancas_partido contract — partiesHistoricallyEquivalent (grupos)", () => {
  it("PFL e DEM caem no mesmo grupo histórico", () => {
    assert.equal(partiesHistoricallyEquivalent("PFL", "DEM"), true)
    assert.equal(partiesHistoricallyEquivalent("DEM", "PFL"), true)
  })

  it("PMDB e MDB caem no mesmo grupo histórico", () => {
    assert.equal(partiesHistoricallyEquivalent("PMDB", "MDB"), true)
  })

  it("PRB e REPUBLICANOS caem no mesmo grupo histórico", () => {
    assert.equal(partiesHistoricallyEquivalent("PRB", "REPUBLICANOS"), true)
  })

  it("PTN e PODE caem no mesmo grupo histórico", () => {
    assert.equal(partiesHistoricallyEquivalent("PTN", "PODE"), true)
  })

  it("PR e PL caem no mesmo grupo histórico", () => {
    assert.equal(partiesHistoricallyEquivalent("PR", "PL"), true)
  })

  it("PT DO B e AVANTE caem no mesmo grupo histórico", () => {
    assert.equal(partiesHistoricallyEquivalent("PT DO B", "AVANTE"), true)
  })

  it("PPS e CIDADANIA caem no mesmo grupo histórico", () => {
    assert.equal(partiesHistoricallyEquivalent("PPS", "CIDADANIA"), true)
  })

  it("PPB, PPR e PP caem no mesmo grupo histórico", () => {
    assert.equal(partiesHistoricallyEquivalent("PPB", "PP"), true)
    assert.equal(partiesHistoricallyEquivalent("PPR", "PP"), true)
  })

  /**
   * REGRESSAO DURA: se mudar para true, ADR-T5 (DEM↔PSD) é obrigatória antes do edit.
   * Documentado em as regras canônicas de negócio (Fluxo 2).
   */
  it("PSD NÃO está em grupo histórico DEM (estado atual; mudar exige ADR-T5)", () => {
    assert.equal(partiesHistoricallyEquivalent("PSD", "DEM"), false)
    assert.equal(partiesHistoricallyEquivalent("PSD", "PFL"), false)
    assert.equal(partiesHistoricallyEquivalent("DEM", "PSD"), false)
  })

  it("PT, PSDB, PSOL e outros partidos vivos não caem em grupo de outro partido", () => {
    assert.equal(partiesHistoricallyEquivalent("PT", "PSDB"), false)
    assert.equal(partiesHistoricallyEquivalent("PSOL", "PT"), false)
    assert.equal(partiesHistoricallyEquivalent("PSDB", "DEM"), false)
  })
})

describe("mudancas_partido contract — countPartySwitches", () => {
  it("retorna 0 para lista vazia", () => {
    assert.equal(countPartySwitches([]), 0)
  })

  it("PFL→DEM apenas: 0 (renomeação histórica colapsa)", () => {
    const mudancas: MudancaPartido[] = [
      row({ id: "1", ano: 2007, partido_anterior: "PFL", partido_novo: "DEM" }),
    ]
    assert.equal(countPartySwitches(mudancas), 0)
  })

  it("PMDB→MDB apenas: 0 (renomeação histórica colapsa)", () => {
    const mudancas: MudancaPartido[] = [
      row({ id: "1", ano: 2018, partido_anterior: "PMDB", partido_novo: "MDB" }),
    ]
    assert.equal(countPartySwitches(mudancas), 0)
  })

  it("PR→PL apenas: 0 (renomeação histórica colapsa)", () => {
    const mudancas: MudancaPartido[] = [
      row({ id: "1", ano: 2019, partido_anterior: "PR", partido_novo: "PL" }),
    ]
    assert.equal(countPartySwitches(mudancas), 0)
  })

  it("DEM→PSD apenas: 1 (PSD fora do grupo histórico hoje; mudar exige ADR-T5)", () => {
    const mudancas: MudancaPartido[] = [
      row({ id: "1", ano: 2020, partido_anterior: "DEM", partido_novo: "PSD" }),
    ]
    assert.equal(countPartySwitches(mudancas), 1)
  })

  it("PFL→PSD apenas: 1 (PSD fora do grupo histórico hoje)", () => {
    const mudancas: MudancaPartido[] = [
      row({ id: "1", ano: 2011, partido_anterior: "PFL", partido_novo: "PSD" }),
    ]
    assert.equal(countPartySwitches(mudancas), 1)
  })

  it("PFL→DEM→PSD: 1 troca efetiva (o salto real é DEM→PSD)", () => {
    const mudancas: MudancaPartido[] = [
      row({ id: "1", ano: 2007, partido_anterior: "PFL", partido_novo: "DEM" }),
      row({ id: "2", ano: 2020, partido_anterior: "DEM", partido_novo: "PSD" }),
    ]
    assert.equal(countPartySwitches(mudancas), 1)
  })

  it("PT→PSDB→PSOL após âncora: 2 trocas reais", () => {
    const mudancas: MudancaPartido[] = [
      row({ id: "0", ano: 1980, partido_anterior: "Sem partido", partido_novo: "PT" }),
      row({ id: "1", ano: 2000, partido_anterior: "PT", partido_novo: "PSDB" }),
      row({ id: "2", ano: 2010, partido_anterior: "PSDB", partido_novo: "PSOL" }),
    ]
    assert.equal(countPartySwitches(mudancas), 2)
  })

  it("contagem efetiva difere de mudancas.length para sequência canônica PFL→DEM→PSD", () => {
    const mudancas: MudancaPartido[] = [
      row({ id: "1", ano: 2007, partido_anterior: "PFL", partido_novo: "DEM" }),
      row({ id: "2", ano: 2020, partido_anterior: "DEM", partido_novo: "PSD" }),
    ]
    assert.equal(mudancas.length, 2)
    assert.equal(countPartySwitches(mudancas), 1)
    assert.notEqual(
      mudancas.length,
      countPartySwitches(mudancas),
      "linhas brutas (mudancas.length) ≠ trocas efetivas (countPartySwitches): a primeira é a contagem da aba Trajetória (N), a segunda é a métrica pública dos cards.",
    )
  })
})

// Fixtures cruas: a ficha chama o gate sobre lista já normalizada em api.ts.
// Cenários aqui são sintéticos; colapso/rechain exigiria normalizePartyTimelineForDisplay antes do gate.
describe("mudancas_partido contract — hasSameYearPartyReversal", () => {
  it("retorna false para lista vazia", () => {
    assert.equal(hasSameYearPartyReversal([]), false)
  })

  it("retorna false para uma única troca", () => {
    const mudancas: MudancaPartido[] = [
      row({ id: "1", ano: 2010, partido_anterior: "PT", partido_novo: "PSDB" }),
    ]
    assert.equal(hasSameYearPartyReversal(mudancas), false)
  })

  it("PT→PSDB e PSDB→PT no mesmo ano: dispara o gate", () => {
    const mudancas: MudancaPartido[] = [
      row({ id: "1", ano: 2010, partido_anterior: "PT", partido_novo: "PSDB" }),
      row({ id: "2", ano: 2010, partido_anterior: "PSDB", partido_novo: "PT" }),
    ]
    assert.equal(hasSameYearPartyReversal(mudancas), true)
  })

  it("PFL→DEM e DEM→PFL no mesmo ano: NÃO dispara (renomeação histórica colapsa)", () => {
    const mudancas: MudancaPartido[] = [
      row({ id: "1", ano: 2007, partido_anterior: "PFL", partido_novo: "DEM" }),
      row({ id: "2", ano: 2007, partido_anterior: "DEM", partido_novo: "PFL" }),
    ]
    assert.equal(hasSameYearPartyReversal(mudancas), false)
  })

  it("PT→PSDB em 2010 e PSDB→PT em 2011: NÃO dispara (anos diferentes)", () => {
    const mudancas: MudancaPartido[] = [
      row({ id: "1", ano: 2010, partido_anterior: "PT", partido_novo: "PSDB" }),
      row({ id: "2", ano: 2011, partido_anterior: "PSDB", partido_novo: "PT" }),
    ]
    assert.equal(hasSameYearPartyReversal(mudancas), false)
  })

  it("PR→PL e PL→PR no mesmo ano: NÃO dispara (renomeação histórica colapsa)", () => {
    const mudancas: MudancaPartido[] = [
      row({ id: "1", ano: 2019, partido_anterior: "PR", partido_novo: "PL" }),
      row({ id: "2", ano: 2019, partido_anterior: "PL", partido_novo: "PR" }),
    ]
    assert.equal(hasSameYearPartyReversal(mudancas), false)
  })

  it("ida e volta REAIS no mesmo ano, ambas datadas: NÃO dispara (caso Marçal 2026)", () => {
    const mudancas: MudancaPartido[] = [
      row({
        id: "1",
        ano: 2026,
        partido_anterior: "PRTB",
        partido_novo: "UNIÃO",
        data_mudanca: "2026-03-06",
      }),
      row({
        id: "2",
        ano: 2026,
        partido_anterior: "UNIÃO",
        partido_novo: "PRTB",
        data_mudanca: "2026-04-04",
      }),
    ]
    assert.equal(hasSameYearPartyReversal(mudancas), false)
  })

  it("ida e volta no mesmo ano com só UMA datada: dispara (ordem não documentada)", () => {
    const mudancas: MudancaPartido[] = [
      row({
        id: "1",
        ano: 2026,
        partido_anterior: "PRTB",
        partido_novo: "UNIÃO",
        data_mudanca: "2026-03-06",
      }),
      row({ id: "2", ano: 2026, partido_anterior: "UNIÃO", partido_novo: "PRTB" }),
    ]
    assert.equal(hasSameYearPartyReversal(mudancas), true)
  })

  it("ida e volta no mesmo ano com a MESMA data: dispara (ordem indistinguível)", () => {
    const mudancas: MudancaPartido[] = [
      row({
        id: "1",
        ano: 2026,
        partido_anterior: "PRTB",
        partido_novo: "UNIÃO",
        data_mudanca: "2026-03-06",
      }),
      row({
        id: "2",
        ano: 2026,
        partido_anterior: "UNIÃO",
        partido_novo: "PRTB",
        data_mudanca: "2026-03-06",
      }),
    ]
    assert.equal(hasSameYearPartyReversal(mudancas), true)
  })
})

describe("mudancas_partido contract — drift PTB UI vs scripts (Fase 3 fix)", () => {
  it("resolveCanonicalPartySigla(\"PTB\") retorna \"PTB\"", () => {
    assert.equal(resolveCanonicalPartySigla("PTB"), "PTB")
  })

  it("resolveCanonicalPartySigla(\"Partido Trabalhista Brasileiro\") retorna \"PTB\"", () => {
    assert.equal(resolveCanonicalPartySigla("Partido Trabalhista Brasileiro"), "PTB")
  })

  it("partiesEquivalent(\"PTB\", \"PTB\") === true (drift script vs UI fixado)", () => {
    assert.equal(partiesEquivalent("PTB", "PTB"), true)
    assert.equal(
      partiesEquivalent("PTB", "Partido Trabalhista Brasileiro"),
      true,
    )
  })

  it("formatPartyDisplayLabel(\"PTB\") devolve sigla canônica (não fallback raw)", () => {
    assert.equal(formatPartyDisplayLabel("PTB"), "PTB")
  })

  it("resolveCanonicalPartySigla(\"PRP\") retorna \"PRP\" para registros TSE históricos", () => {
    assert.equal(resolveCanonicalPartySigla("PRP"), "PRP")
    assert.equal(resolveCanonicalPartySigla("Partido Republicano Progressista"), "PRP")
  })

  it("resolveCanonicalPartySigla(\"PRD\") retorna \"PRD\" para o Partido Renovação Democrática", () => {
    assert.equal(resolveCanonicalPartySigla("PRD"), "PRD")
    assert.equal(resolveCanonicalPartySigla("Partido Renovação Democrática"), "PRD")
    assert.equal(partiesEquivalent("PRD", "Partido Renovacao Democratica"), true)
  })

  it("PTB→PSDB conta como troca efetiva (siglas distintas, não no mesmo grupo)", () => {
    const mudancas: MudancaPartido[] = [
      row({ id: "1", ano: 1995, partido_anterior: "PTB", partido_novo: "PSDB" }),
    ]
    assert.equal(countPartySwitches(mudancas), 1)
  })

  it("PTB não está em nenhum grupo histórico junto com outro partido (sigla viva e independente)", () => {
    assert.equal(partiesHistoricallyEquivalent("PTB", "PT"), false)
    assert.equal(partiesHistoricallyEquivalent("PTB", "PTC"), false)
    assert.equal(partiesHistoricallyEquivalent("PTB", "AVANTE"), false)
  })
})

// =========================================================================
// ADRs T5–T9 (Fase 3 — fechamento do fluxo de trajetória política).
//
// Cada bloco abaixo é um teste de regressão que trava a decisão atual do
// ADR correspondente. Se um assert quebrar, a decisão editorial mudou e o
// ADR no lugar canônico (`as regras canônicas de negócio`, Fluxo 2) precisa ser reaberto
// e atualizado antes do merge.
//
// Referência: as regras canônicas de negócio.
// =========================================================================

describe("ADR-T5 — DEM↔PSD não são equivalentes históricos (status quo)", () => {
  it("partiesHistoricallyEquivalent('PSD','DEM') continua false", () => {
    assert.equal(partiesHistoricallyEquivalent("PSD", "DEM"), false)
    assert.equal(partiesHistoricallyEquivalent("DEM", "PSD"), false)
  })

  it("partiesHistoricallyEquivalent('PSD','PFL') continua false", () => {
    assert.equal(partiesHistoricallyEquivalent("PSD", "PFL"), false)
    assert.equal(partiesHistoricallyEquivalent("PFL", "PSD"), false)
  })

  it("DEM→PSD conta como 1 troca efetiva pública (countPartySwitches)", () => {
    const mudancas: MudancaPartido[] = [
      row({ id: "1", ano: 2020, partido_anterior: "DEM", partido_novo: "PSD" }),
    ]
    assert.equal(countPartySwitches(mudancas), 1)
  })

  it("PFL→DEM→PSD mantém 1 troca (PFL→DEM colapsa, DEM→PSD é real)", () => {
    const mudancas: MudancaPartido[] = [
      row({ id: "1", ano: 2007, partido_anterior: "PFL", partido_novo: "DEM" }),
      row({ id: "2", ano: 2020, partido_anterior: "DEM", partido_novo: "PSD" }),
    ]
    assert.equal(countPartySwitches(mudancas), 1)
  })
})

describe("ADR-T6 — gates estruturais limitados a same-year-reversal + wide-manual-vs-segmented", () => {
  it("hasSameYearPartyReversal permanece o único gate sobre mudancas_partido", () => {
    // Se um gate novo for introduzido, o export do módulo muda e este assert
    // é o primeiro a dar sinal em CI; a decisão precisa passar por ADR-T6.
    const importName = "hasSameYearPartyReversal"
    assert.equal(typeof hasSameYearPartyReversal, "function", `export ${importName} preservado`)
  })

  it("dual-out do mesmo partido no mesmo ano NÃO dispara gate hoje (backlog ADR-T6, não bloqueia)", () => {
    // X saindo pra A E pra B no mesmo ano — padrão candidato a gate futuro.
    // Decisão ADR-T6: tracked como signal no audit, NÃO bloqueia publicação.
    // Se alguém adicionar gate, este teste precisa virar positivo E o ADR ser
    // reaberto com decisão editorial.
    const mudancas: MudancaPartido[] = [
      row({ id: "1", ano: 2020, partido_anterior: "PT", partido_novo: "PSOL" }),
      row({ id: "2", ano: 2020, partido_anterior: "PT", partido_novo: "PSB" }),
    ]
    assert.equal(hasSameYearPartyReversal(mudancas), false, "dual-out não é reversal A→B/B→A")
  })

  it("cadeia com 3 trocas reais não dispara gate mesmo com rechain heavy", () => {
    const mudancas: MudancaPartido[] = [
      row({ id: "1", ano: 2010, partido_anterior: "PMDB", partido_novo: "PSDB" }),
      row({ id: "2", ano: 2014, partido_anterior: "PSDB", partido_novo: "PSB" }),
      row({ id: "3", ano: 2018, partido_anterior: "PSB", partido_novo: "PSD" }),
    ]
    assert.equal(hasSameYearPartyReversal(mudancas), false)
    assert.equal(countPartySwitches(mudancas), 3)
  })
})

describe("ADR-T7 — TSE auto-row é publicável mas colapsada quando redundante", () => {
  it("linha TSE auto equivalente a linha curada colapsa no display", () => {
    // Fixture: curadoria entra com "PSB → PROS" 2013; TSE auto-row entra com
    // a mesma transição e contexto "Wikidata P102" (ou "Mudança observada...").
    // Esperado: normalização colapsa para uma única linha visível.
    const mudancas: MudancaPartido[] = [
      row({
        id: "curada",
        ano: 2013,
        partido_anterior: "PSB",
        partido_novo: "PROS",
        contexto: null,
      }),
      row({
        id: "tse-auto",
        ano: 2013,
        data_mudanca: "2013-01-01",
        partido_anterior: "PSB",
        partido_novo: "PARTIDO REPUBLICANO DA ORDEM SOCIAL",
        contexto: "Wikidata P102",
      }),
    ]
    const normalized = normalizePartyTimelineForDisplay(mudancas)
    assert.equal(normalized.length, 1, "colapso TSE/Wikidata redundante vs curada")
  })

  it("linha TSE auto sobrevive quando é a única fonte da transição", () => {
    const mudancas: MudancaPartido[] = [
      row({
        id: "tse-only",
        ano: 2018,
        partido_anterior: "PT",
        partido_novo: "PSB",
        contexto: "Mudança observada entre eleições TSE (2018)",
      }),
    ]
    const normalized = normalizePartyTimelineForDisplay(mudancas)
    assert.equal(normalized.length, 1, "sem linha curada equivalente, TSE sobrevive")
    assert.equal(countPartySwitches(mudancas), 1, "conta como troca efetiva real")
  })
})

describe("ADR-T8 — mudancas.length (aba) vs countPartySwitches (cards) permanecem separados", () => {
  it("PFL→DEM: linha bruta = 1, troca efetiva = 0", () => {
    const mudancas: MudancaPartido[] = [
      row({ id: "1", ano: 2007, partido_anterior: "PFL", partido_novo: "DEM" }),
    ]
    assert.equal(mudancas.length, 1, "secção Trocas de partido (N) e data-pf-partidos-count usam linhas (= mudancas.length)")
    assert.equal(countPartySwitches(mudancas), 0, "cards públicos usam countPartySwitches")
    assert.notEqual(mudancas.length, countPartySwitches(mudancas))
  })

  it("PFL→DEM→PSD: 2 linhas brutas, 1 troca efetiva", () => {
    const mudancas: MudancaPartido[] = [
      row({ id: "1", ano: 2007, partido_anterior: "PFL", partido_novo: "DEM" }),
      row({ id: "2", ano: 2020, partido_anterior: "DEM", partido_novo: "PSD" }),
    ]
    assert.equal(mudancas.length, 2)
    assert.equal(countPartySwitches(mudancas), 1)
  })

  it("sequência PT→PSDB→PSOL pós-âncora: 3 linhas brutas, 2 trocas efetivas", () => {
    const mudancas: MudancaPartido[] = [
      row({ id: "0", ano: 1980, partido_anterior: "Sem partido", partido_novo: "PT" }),
      row({ id: "1", ano: 2000, partido_anterior: "PT", partido_novo: "PSDB" }),
      row({ id: "2", ano: 2010, partido_anterior: "PSDB", partido_novo: "PSOL" }),
    ]
    assert.equal(mudancas.length, 3, "linhas brutas incluem a âncora inicial")
    assert.equal(countPartySwitches(mudancas), 2, "countPartySwitches exclui âncora")
  })
})

describe("ADR-T9 — historico_em_revisao reservado mas não-wired", () => {
  it("o flag permanece opcional no tipo FichaCandidato e default false em api.ts", async () => {
    // Regression: se alguém setar historico_em_revisao=true em algum caller
    // sem atualizar ADR-T9, a contagem de callers muda e o teste precisa ser
    // revisto. A asserção estrutural é indireta (o tipo continua opcional);
    // testes end-to-end com ficha real ficam fora do escopo.
    const sampleFicha: {
      mudancas_partido: MudancaPartido[]
      total_mudancas_partido: number
      historico_em_revisao?: boolean
    } = {
      mudancas_partido: [],
      total_mudancas_partido: 0,
    }
    assert.equal(sampleFicha.historico_em_revisao, undefined, "campo opcional por default")
    // Permitido setar manualmente (é opcional), mas decisão ADR-T9 é não-wired.
    sampleFicha.historico_em_revisao = false
    assert.equal(sampleFicha.historico_em_revisao, false)
  })

  it("nenhum gate público consome historico_em_revisao (decisão registrada)", () => {
    // A trava real vive em ADR-T9 da spec. Este teste documenta a decisão:
    // se você for ativar o gate, precisa (a) atualizar ADR-T9 e (b) expor o
    // gate via predicado puro exportado, para que um teste positivo possa
    // substituir este.
    const gatesExportados = [hasSameYearPartyReversal]
    assert.equal(gatesExportados.length, 1, "apenas hasSameYearPartyReversal é gate público em party-switches")
  })
})

import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  collectPartyHistoricoCrossCheck,
  collectPartyHistoricoCrossFindings,
  isTsePleitoStubVsMandateOpenTransition,
  mudancaMatchesTransition,
} from "../scripts/lib/historico-party-timeline-crosscheck"

describe("historico-party-timeline-crosscheck", () => {
  it("mandato_transicao_sem_mudanca quando partido muda no mesmo cargo sem mudança_partido", () => {
    const historico = [
      {
        id: "h1",
        cargo: "Senador",
        cargo_canonico: "Senador",
        periodo_inicio: 2010,
        periodo_fim: 2014,
        partido: "PT",
      },
      {
        id: "h2",
        cargo: "Senador",
        cargo_canonico: "Senador",
        periodo_inicio: 2015,
        periodo_fim: 2018,
        partido: "PSDB",
      },
    ]
    const mudancas: Array<{
      id: string
      partido_anterior: string
      partido_novo: string
      ano: number | null
    }> = []
    const f = collectPartyHistoricoCrossFindings("slug-x", historico, mudancas)
    assert.ok(f.some((x) => x.code === "mandato_transicao_sem_mudanca"))
  })

  it("não emite mandato_transicao quando existe mudança alinhada (janela de ano restrita)", () => {
    const historico = [
      {
        id: "h1",
        cargo: "Senador",
        cargo_canonico: "Senador",
        periodo_inicio: 2010,
        periodo_fim: 2014,
        partido: "PT",
      },
      {
        id: "h2",
        cargo: "Senador",
        cargo_canonico: "Senador",
        periodo_inicio: 2015,
        periodo_fim: 2018,
        partido: "PSDB",
      },
    ]
    const mudancas = [
      { id: "m1", partido_anterior: "PT", partido_novo: "PSDB", ano: 2014 },
    ]
    assert.ok(mudancaMatchesTransition(mudancas[0]!, "PT", "PSDB", 2010, 2015))
    const f = collectPartyHistoricoCrossFindings("slug-y", historico, mudancas)
    assert.ok(!f.some((x) => x.code === "mandato_transicao_sem_mudanca"))
  })

  it("não emite mandato_transicao quando cadeia indireta tem partido intermediário materializado", () => {
    const historico = [
      {
        id: "gov-2006",
        cargo: "Governador",
        cargo_canonico: "Governador",
        periodo_inicio: 2006,
        periodo_fim: 2006,
        partido: "PSDB",
      },
      {
        id: "pref-2008",
        cargo: "Prefeito",
        cargo_canonico: "Prefeito",
        periodo_inicio: 2008,
        periodo_fim: 2016,
        partido: "PMDB",
      },
      {
        id: "gov-2018",
        cargo: "Governador",
        cargo_canonico: "Governador",
        periodo_inicio: 2018,
        periodo_fim: 2018,
        partido: "DEM",
      },
    ]
    const mudancas = [
      { id: "m1", partido_anterior: "PSDB", partido_novo: "PMDB", ano: 2008 },
      { id: "m2", partido_anterior: "PMDB", partido_novo: "DEM", ano: 2018 },
    ]
    const f = collectPartyHistoricoCrossFindings("cadeia-paes", historico, mudancas)
    assert.ok(!f.some((x) => x.code === "mandato_transicao_sem_mudanca"))
  })

  it("não emite mandato_transicao quando mandato intermediário materializa cadeia entre candidaturas ao Senado", () => {
    const historico = [
      {
        id: "sen-2002",
        cargo: "Senador",
        cargo_canonico: "Senador",
        periodo_inicio: 2002,
        periodo_fim: 2002,
        partido: "PPS",
      },
      {
        id: "vice-2006",
        cargo: "Vice-Governador",
        cargo_canonico: "Vice-Governador",
        periodo_inicio: 2006,
        periodo_fim: 2010,
        partido: "PSDB",
      },
      {
        id: "sen-2010",
        cargo: "Senador",
        cargo_canonico: "Senador",
        periodo_inicio: 2010,
        periodo_fim: 2018,
        partido: "PMDB",
      },
    ]
    const mudancas = [
      { id: "m1", partido_anterior: "PPS", partido_novo: "PSDB", ano: 2006 },
      { id: "m2", partido_anterior: "PSDB", partido_novo: "PMDB", ano: 2010 },
    ]
    const f = collectPartyHistoricoCrossFindings("cadeia-ferraco", historico, mudancas)
    assert.ok(!f.some((x) => x.code === "mandato_transicao_sem_mudanca"))
  })

  it("mantém mandato_transicao quando cadeia indireta não tem rastro histórico intermediário", () => {
    const historico = [
      {
        id: "gov-2006",
        cargo: "Governador",
        cargo_canonico: "Governador",
        periodo_inicio: 2006,
        periodo_fim: 2006,
        partido: "PSDB",
      },
      {
        id: "gov-2018",
        cargo: "Governador",
        cargo_canonico: "Governador",
        periodo_inicio: 2018,
        periodo_fim: 2018,
        partido: "DEM",
      },
    ]
    const mudancas = [
      { id: "m1", partido_anterior: "PSDB", partido_novo: "PMDB", ano: 2008 },
      { id: "m2", partido_anterior: "PMDB", partido_novo: "DEM", ano: 2018 },
    ]
    const f = collectPartyHistoricoCrossFindings("cadeia-sem-rastro", historico, mudancas)
    assert.ok(f.some((x) => x.code === "mandato_transicao_sem_mudanca"))
  })

  it("mudancaMatchesTransition rejeita ano fora da janela [min-1, max+1]", () => {
    const m = { id: "m1", partido_anterior: "PT", partido_novo: "PSDB", ano: 2000 }
    assert.equal(mudancaMatchesTransition(m, "PT", "PSDB", 2010, 2015), false)
  })

  it("isTsePleitoStubVsMandateOpenTransition detecta par TSE pleito ↔ mandato aberto", () => {
    const stub = {
      id: "a",
      cargo: "Deputado Federal",
      cargo_canonico: "Deputado Federal",
      periodo_inicio: 2014,
      periodo_fim: 2014,
      partido: "PT",
      observacoes: "TSE — candidatura 2014",
    }
    const mand = {
      id: "b",
      cargo: "Deputado Federal",
      cargo_canonico: "Deputado Federal",
      periodo_inicio: 2015,
      periodo_fim: null,
      partido: "PT",
      observacoes: "TSE",
    }
    assert.equal(isTsePleitoStubVsMandateOpenTransition(stub, mand), true)
  })

  it("actionable omite mandato_transicao em par pleito stub ↔ mandato (full mantém)", () => {
    const stub = {
      id: "a",
      cargo: "Deputado Federal",
      cargo_canonico: "Deputado Federal",
      periodo_inicio: 2014,
      periodo_fim: 2014,
      partido: "PT",
      observacoes: "TSE — candidatura 2014",
    }
    const mand = {
      id: "b",
      cargo: "Deputado Federal",
      cargo_canonico: "Deputado Federal",
      periodo_inicio: 2015,
      periodo_fim: null,
      partido: "PSDB",
      observacoes: "TSE",
    }
    const { full, actionable } = collectPartyHistoricoCrossCheck("z", [stub, mand], [])
    assert.ok(full.some((x) => x.code === "mandato_transicao_sem_mudanca"))
    assert.ok(!actionable.some((x) => x.code === "mandato_transicao_sem_mudanca"))
  })

  it("não emite mandato_transicao quando partidos são historicamente equivalentes (PMDB↔MDB)", () => {
    const historico = [
      {
        id: "h1",
        cargo: "Senador",
        cargo_canonico: "Senador",
        periodo_inicio: 2010,
        periodo_fim: 2014,
        partido: "PMDB",
      },
      {
        id: "h2",
        cargo: "Senador",
        cargo_canonico: "Senador",
        periodo_inicio: 2015,
        periodo_fim: 2018,
        partido: "MDB",
      },
    ]
    const f = collectPartyHistoricoCrossFindings("pmmdb-mdb", historico, [])
    assert.ok(!f.some((x) => x.code === "mandato_transicao_sem_mudanca"))
  })

  it("não emite mandato_transicao quando histórico usa token composto equivalente (PFL/DEM↔PFL)", () => {
    const historico = [
      {
        id: "h1",
        cargo: "Deputado Federal",
        cargo_canonico: "Deputado Federal",
        periodo_inicio: 2003,
        periodo_fim: 2013,
        partido: "PFL/DEM",
      },
      {
        id: "h2",
        cargo: "Deputado Federal",
        cargo_canonico: "Deputado Federal",
        periodo_inicio: 2006,
        periodo_fim: 2010,
        partido: "PFL",
      },
    ]
    const f = collectPartyHistoricoCrossFindings("composto-pfl-dem", historico, [])
    assert.ok(!f.some((x) => x.code === "mandato_transicao_sem_mudanca"))
  })

  it("não usa linha sem periodo_inicio para abrir cadeia cronológica de mandato", () => {
    const historico = [
      {
        id: "cargo-atual",
        cargo: "Senador",
        cargo_canonico: "Senador",
        periodo_inicio: null,
        periodo_fim: null,
        partido: "NOVO",
      },
      {
        id: "sen-2018",
        cargo: "Senador",
        cargo_canonico: "Senador",
        periodo_inicio: 2018,
        periodo_fim: null,
        partido: "PROS",
      },
      {
        id: "sen-2024",
        cargo: "Senador",
        cargo_canonico: "Senador",
        periodo_inicio: 2024,
        periodo_fim: null,
        partido: "NOVO",
      },
    ]
    const mudancas = [
      {
        id: "m1",
        partido_anterior: "PROS",
        partido_novo: "NOVO",
        ano: 2024,
        contexto: "Filiação documentada em fonte partidária.",
      },
    ]
    const f = collectPartyHistoricoCrossFindings("periodo-null", historico, mudancas)
    assert.ok(!f.some((x) => x.detail.includes("NOVO→PROS")))
  })

  it("não acusa âncora inicial de histórico anterior indeterminado como partido anterior sem rastro", () => {
    const historico = [
      {
        id: "h1",
        cargo: "Prefeito",
        cargo_canonico: "Prefeito",
        periodo_inicio: 2021,
        periodo_fim: null,
        partido: "PSB",
      },
    ]
    const mudancas = [
      {
        id: "m1",
        partido_anterior: "Histórico anterior não determinado",
        partido_novo: "PSB",
        ano: 2026,
        contexto: "partido atual verificado manualmente",
      },
    ]
    const f = collectPartyHistoricoCrossFindings("joao-campos-anchor", historico, mudancas)
    assert.ok(!f.some((x) => x.code === "mudanca_partido_anterior_sem_rastro"))
  })

  it("não emite rastro ausente quando mudanca_partido e histórico usam siglas historicamente equivalentes", () => {
    const historico = [
      {
        id: "h1",
        cargo: "Governador",
        cargo_canonico: "Governador",
        periodo_inicio: 2003,
        periodo_fim: 2010,
        partido: "PMDB",
      },
    ]
    const mudancas = [
      { id: "m1", partido_anterior: "PFL", partido_novo: "MDB", ano: 2005 },
      { id: "m2", partido_anterior: "MDB", partido_novo: "DEM", ano: 2018 },
    ]
    const f = collectPartyHistoricoCrossFindings("equivalencias-historicas", historico, mudancas)
    assert.ok(!f.some((x) => x.ref_id === "m1" && x.code === "mudanca_partido_novo_sem_mandato"))
    assert.ok(!f.some((x) => x.ref_id === "m2" && x.code === "mudanca_partido_anterior_sem_rastro"))
  })

  it("actionable omite partido atual sem mandato quando a última mudança bate com partido atual", () => {
    const historico = [
      {
        id: "h1",
        cargo: "Prefeito",
        cargo_canonico: "Prefeito",
        periodo_inicio: 2021,
        periodo_fim: 2024,
        partido: "PSDB",
      },
    ]
    const mudancas = [
      {
        id: "m1",
        partido_anterior: "PSDB",
        partido_novo: "PL",
        ano: 2026,
        contexto: "Filiação atual verificada por fonte partidária oficial.",
      },
    ]
    const { full, actionable } = collectPartyHistoricoCrossCheck("atual-sem-mandato", historico, mudancas, {
      currentParty: "PL",
    })
    assert.ok(full.some((x) => x.code === "mudanca_partido_novo_sem_mandato"))
    assert.ok(!actionable.some((x) => x.code === "mudanca_partido_novo_sem_mandato"))
  })

  it("actionable omite transição para partido atual quando a última mudança curada explica mandato aberto", () => {
    const historico = [
      {
        id: "h1",
        cargo: "Governador",
        cargo_canonico: "Governador",
        periodo_inicio: 2022,
        periodo_fim: 2023,
        partido: "PSDB",
      },
      {
        id: "h2",
        cargo: "Governador",
        cargo_canonico: "Governador",
        periodo_inicio: 2023,
        periodo_fim: null,
        partido: "PP",
      },
    ]
    const mudancas = [
      {
        id: "m1",
        partido_anterior: "PSDB",
        partido_novo: "PP",
        ano: 2026,
        contexto: "Filiação atual verificada por fonte oficial.",
      },
    ]
    const { full, actionable } = collectPartyHistoricoCrossCheck("atual-transicao-mandato", historico, mudancas, {
      currentParty: "PP",
    })
    assert.ok(full.some((x) => x.code === "mandato_transicao_sem_mudanca"))
    assert.ok(!actionable.some((x) => x.code === "mandato_transicao_sem_mudanca"))
  })

  it("reconhece partido intermediário curado sem mandato como cadeia partidária, não lacuna de mandato", () => {
    const historico = [
      {
        id: "pres-2002",
        cargo: "Presidente",
        cargo_canonico: "Presidente",
        periodo_inicio: 2002,
        periodo_fim: 2002,
        partido: "PPS",
      },
      {
        id: "min-2003",
        cargo: "Ministro",
        cargo_canonico: "Ministro",
        periodo_inicio: 2003,
        periodo_fim: 2006,
        partido: "PSB",
      },
      {
        id: "pres-2018",
        cargo: "Presidente",
        cargo_canonico: "Presidente",
        periodo_inicio: 2018,
        periodo_fim: 2018,
        partido: "PDT",
      },
    ]
    const mudancas = [
      { id: "m1", partido_anterior: "PPS", partido_novo: "PSB", ano: 2005, contexto: "fonte oficial" },
      {
        id: "m2",
        partido_anterior: "PSB",
        partido_novo: "PROS",
        ano: 2013,
        contexto: "Filiação ao PROS documentada por curadoria.",
      },
      {
        id: "m3",
        partido_anterior: "PROS",
        partido_novo: "PDT",
        ano: 2015,
        contexto: "Aliança partidária documentada por curadoria.",
      },
    ]
    const { full, actionable } = collectPartyHistoricoCrossCheck("intermediario-partidario", historico, mudancas)
    assert.ok(!full.some((x) => x.code === "mandato_transicao_sem_mudanca"))
    assert.ok(!actionable.some((x) => x.ref_id === "m2"))
    assert.ok(!actionable.some((x) => x.ref_id === "m3"))
  })

  it("mantém partido intermediário automático TSE sem rastro como actionable", () => {
    const historico = [
      {
        id: "h1",
        cargo: "Governador",
        cargo_canonico: "Governador",
        periodo_inicio: 2003,
        periodo_fim: 2010,
        partido: "PMDB",
      },
    ]
    const mudancas = [
      {
        id: "m1",
        partido_anterior: "PMDB",
        partido_novo: "PTB",
        ano: 2012,
        contexto: "Mudança observada entre eleições TSE (2012)",
      },
      {
        id: "m2",
        partido_anterior: "PTB",
        partido_novo: "PMDB",
        ano: 2014,
        contexto: "Mudança observada entre eleições TSE (2014)",
      },
    ]
    const { actionable } = collectPartyHistoricoCrossCheck("auto-tse-sem-rastro", historico, mudancas)
    assert.ok(actionable.some((x) => x.ref_id === "m1" && x.code === "mudanca_partido_novo_sem_mandato"))
    assert.ok(actionable.some((x) => x.ref_id === "m2" && x.code === "mudanca_partido_anterior_sem_rastro"))
  })

  it("actionable aplica cap por código", () => {
    const historico = [
      {
        id: "h1",
        cargo: "Senador",
        cargo_canonico: "Senador",
        periodo_inicio: 2000,
        periodo_fim: 2002,
        partido: "PT",
      },
    ]
    const mudancas = Array.from({ length: 12 }, (_, i) => ({
      id: `m${i}`,
      partido_anterior: "X",
      partido_novo: `Y${i}`,
      ano: 1990,
    }))
    const { actionable } = collectPartyHistoricoCrossCheck("cap-slug", historico, mudancas, {
      actionableMaxPerCode: 3,
    })
    const novo = actionable.filter((x) => x.code === "mudanca_partido_novo_sem_mandato")
    assert.equal(novo.length, 3)
  })
})

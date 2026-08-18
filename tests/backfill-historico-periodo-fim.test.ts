import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  runBackfillHistoricoPeriodoFim,
  createBackfillDepsFromClient,
  isAutoSource,
  closesMandate,
  candidaturaClosesMandate,
  isBackfillTarget,
  resolvePeriodoFim,
  type HistoricoRow,
} from "../scripts/backfill-historico-periodo-fim"
import { HistoricoChainFixture } from "./helpers/historico-chain-fixture"

// --- Helper factory ---

let idCounter = 0
function row(
  overrides: Partial<HistoricoRow> & Pick<HistoricoRow, "candidato_id" | "cargo_canonico" | "periodo_inicio">
): HistoricoRow {
  idCounter++
  return {
    id: `hp-${idCounter}`,
    slug: overrides.slug ?? `slug-${overrides.candidato_id}`,
    periodo_fim: null,
    observacoes: "(TSE 2022)",
    ...overrides,
  }
}

function noop() {}

// --- Unit: isAutoSource ---

describe("isAutoSource", () => {
  it("recognizes TSE source", () => {
    assert.equal(isAutoSource("(TSE 2022) eleito"), true)
  })
  it("recognizes Wikidata source", () => {
    assert.equal(isAutoSource("Wikidata mandato"), true)
  })
  it("rejects null/empty/manual", () => {
    assert.equal(isAutoSource(null), false)
    assert.equal(isAutoSource(""), false)
    assert.equal(isAutoSource("curadoria editorial"), false)
  })
})

// --- Unit: closesMandate ---

describe("closesMandate", () => {
  it("same cargo closes itself", () => {
    assert.equal(closesMandate("Senador", "Senador"), true)
  })
  it("Presidente closes Deputado Federal", () => {
    assert.equal(closesMandate("Presidente", "Deputado Federal"), true)
  })
  it("Vereador does not close Deputado Federal", () => {
    assert.equal(closesMandate("Vereador", "Deputado Federal"), false)
  })
  it("Governador closes Prefeito", () => {
    assert.equal(closesMandate("Governador", "Prefeito"), true)
  })
})

// --- Unit: candidaturaClosesMandate / isBackfillTarget ---

describe("candidaturaClosesMandate (CF art. 14 par. 6)", () => {
  it("Prefeito que disputa outro cargo renuncia", () => {
    assert.equal(candidaturaClosesMandate("Prefeito", "Deputado Federal"), true)
  })
  it("Governador que disputa outro cargo renuncia", () => {
    assert.equal(candidaturaClosesMandate("Governador", "Senador"), true)
  })
  it("reeleicao no mesmo cargo nao encerra o mandato", () => {
    assert.equal(candidaturaClosesMandate("Prefeito", "Prefeito"), false)
  })
  it("legislador nao renuncia para disputar outro cargo", () => {
    assert.equal(candidaturaClosesMandate("Deputado Estadual", "Prefeito"), false)
    assert.equal(candidaturaClosesMandate("Vereador", "Deputado Estadual"), false)
  })
  it("vice nao esta na regra de renuncia", () => {
    assert.equal(candidaturaClosesMandate("Vice-Prefeito", "Deputado Federal"), false)
    assert.equal(candidaturaClosesMandate("Vice-Governador", "Governador"), false)
  })
  it("candidatura sem cargo nao fecha nada", () => {
    assert.equal(candidaturaClosesMandate("Prefeito", null), false)
  })
})

describe("isBackfillTarget", () => {
  it("mandato e alvo", () => {
    assert.equal(isBackfillTarget({ tipo_evento: "mandato" }), true)
  })
  it("tipo_evento ausente ou null conta como mandato", () => {
    assert.equal(isBackfillTarget({ tipo_evento: null }), true)
    assert.equal(isBackfillTarget({}), true)
  })
  it("candidatura nunca e alvo", () => {
    assert.equal(isBackfillTarget({ tipo_evento: "candidatura" }), false)
  })
})

// --- Regressao do bug V4: o teto de duracao vence a proximidade ---

describe("bug V4: MAX_DURATION vence o fechamento por proximidade", () => {
  it("mandato seguinte do mesmo cargo distante nao estica o anterior", () => {
    // Caso cicero-lucena: Prefeito 2000 com proximo Prefeito so em 2020.
    // Antes da correcao virava 2000-2020, vinte anos num cargo de quatro.
    const record = row({ candidato_id: "c1", cargo_canonico: "Prefeito", periodo_inicio: 2000 })
    const later = row({ candidato_id: "c1", cargo_canonico: "Prefeito", periodo_inicio: 2020 })
    const resolved = resolvePeriodoFim(record, [record, later])
    assert.equal(resolved?.ano, 2004)
    assert.match(resolved!.reason, /cap/)
  })

  it("cargo incompativel distante tambem respeita o teto", () => {
    // Caso daniel-vilela: Deputado Federal 2014 fechado por Vice-Governador 2022.
    const record = row({ candidato_id: "c1", cargo_canonico: "Deputado Federal", periodo_inicio: 2014 })
    const later = row({ candidato_id: "c1", cargo_canonico: "Vice-Governador", periodo_inicio: 2022 })
    const resolved = resolvePeriodoFim(record, [record, later])
    assert.equal(resolved?.ano, 2018)
  })

  it("fechamento dentro do teto continua vencendo o teto", () => {
    // Nao-regressao: quando a proximidade cabe no teto, ela manda.
    const record = row({ candidato_id: "c1", cargo_canonico: "Deputado Estadual", periodo_inicio: 2006 })
    const later = row({ candidato_id: "c1", cargo_canonico: "Prefeito", periodo_inicio: 2009 })
    const resolved = resolvePeriodoFim(record, [record, later])
    assert.equal(resolved?.ano, 2009)
    assert.doesNotMatch(resolved!.reason, /cap/)
  })

  it("Senador usa teto de 8 anos, nao de 4", () => {
    const record = row({ candidato_id: "c1", cargo_canonico: "Senador", periodo_inicio: 2006 })
    const later = row({ candidato_id: "c1", cargo_canonico: "Senador", periodo_inicio: 2020 })
    const resolved = resolvePeriodoFim(record, [record, later])
    assert.equal(resolved?.ano, 2014)
  })

  it("mandato que pode estar em curso continua aberto", () => {
    const record = row({ candidato_id: "c1", cargo_canonico: "Prefeito", periodo_inicio: 2024 })
    assert.equal(resolvePeriodoFim(record, [record]), null)
  })

  it("nenhuma proposta pode estourar o teto do cargo", () => {
    const cargos = ["Prefeito", "Vereador", "Deputado Federal", "Deputado Estadual", "Governador", "Senador"]
    for (const cargo of cargos) {
      const record = row({ candidato_id: "c1", cargo_canonico: cargo, periodo_inicio: 1996 })
      const later = row({ candidato_id: "c1", cargo_canonico: cargo, periodo_inicio: 2018 })
      const resolved = resolvePeriodoFim(record, [record, later])
      const max = cargo === "Senador" ? 8 : 4
      assert.ok(resolved !== null, `${cargo} deveria fechar`)
      assert.ok(resolved!.ano - 1996 <= max, `${cargo} estourou o teto: ${resolved!.ano}`)
    }
  })
})

describe("bug V4: visibilidade de candidatura e de tipo_evento NULL", () => {
  it("candidatura a outro cargo encerra mandato de Prefeito", () => {
    // Caso teresa-surita: Prefeito 2004 com candidatura a Senador em 2006.
    const record = row({ candidato_id: "c1", cargo_canonico: "Prefeito", periodo_inicio: 2004 })
    const cand = row({ candidato_id: "c1", cargo_canonico: "Senador", periodo_inicio: 2006, tipo_evento: "candidatura" })
    const resolved = resolvePeriodoFim(record, [record, cand])
    assert.equal(resolved?.ano, 2006)
    assert.match(resolved!.reason, /desincompatibilizacao/)
  })

  it("candidatura perdida de deputado nao encerra o mandato dele", () => {
    const record = row({ candidato_id: "c1", cargo_canonico: "Deputado Estadual", periodo_inicio: 2018 })
    const cand = row({ candidato_id: "c1", cargo_canonico: "Prefeito", periodo_inicio: 2020, tipo_evento: "candidatura" })
    const resolved = resolvePeriodoFim(record, [record, cand])
    assert.equal(resolved?.ano, 2022, "fecha pelo teto de 4 anos, nao pela candidatura de 2020")
  })

  it("linha com tipo_evento NULL continua visivel como fechamento", () => {
    const record = row({ candidato_id: "c1", cargo_canonico: "Deputado Federal", periodo_inicio: 2014 })
    const later = row({ candidato_id: "c1", cargo_canonico: "Deputado Federal", periodo_inicio: 2018, tipo_evento: null })
    const resolved = resolvePeriodoFim(record, [record, later])
    assert.equal(resolved?.ano, 2018)
  })
})

// --- Integration: runBackfillHistoricoPeriodoFim ---

describe("backfill-historico-periodo-fim", () => {
  it("Rule A: fechador do mesmo cargo alem do teto capa em inicio+MAX_DURATION (dry-run)", async () => {
    idCounter = 0
    const rows: HistoricoRow[] = [
      row({ candidato_id: "c1", cargo_canonico: "Deputado Federal", periodo_inicio: 2014 }),
      row({ candidato_id: "c1", cargo_canonico: "Deputado Federal", periodo_inicio: 2022 }),
    ]

    const result = await runBackfillHistoricoPeriodoFim({
      apply: false,
      fetchRows: async () => rows,
      updateRow: async () => { throw new Error("should not write in dry-run") },
      log: noop,
      warn: noop,
    })

    assert.equal(result.changes.length, 1)
    assert.equal(result.changes[0].id, "hp-1")
    assert.equal(result.changes[0].newFim, 2018)
    assert.match(result.changes[0].reason, /max duration 4yr cap/)
    assert.equal(result.applied, 0)
  })

  it("Rule B: cargo incompativel alem do teto tambem capa", async () => {
    idCounter = 0
    const rows: HistoricoRow[] = [
      row({ candidato_id: "c1", cargo_canonico: "Vereador", periodo_inicio: 2016 }),
      row({ candidato_id: "c1", cargo_canonico: "Deputado Estadual", periodo_inicio: 2022 }),
    ]

    const result = await runBackfillHistoricoPeriodoFim({
      apply: false,
      fetchRows: async () => rows,
      updateRow: async () => {},
      log: noop,
      warn: noop,
    })

    assert.equal(result.changes.length, 1)
    assert.equal(result.changes[0].id, "hp-1")
    assert.equal(result.changes[0].newFim, 2020)
    assert.match(result.changes[0].reason, /max duration 4yr cap/)
  })

  it("Rule C: max duration fallback for old mandatos", async () => {
    idCounter = 0
    const rows: HistoricoRow[] = [
      row({ candidato_id: "c1", cargo_canonico: "Deputado Federal", periodo_inicio: 2010 }),
    ]

    const result = await runBackfillHistoricoPeriodoFim({
      apply: false,
      fetchRows: async () => rows,
      updateRow: async () => {},
      log: noop,
      warn: noop,
    })

    assert.equal(result.changes.length, 1)
    assert.equal(result.changes[0].newFim, 2014) // 2010 + 4
    assert.match(result.changes[0].reason, /max duration 4yr/)
  })

  it("Rule C: Senador gets 8yr max duration", async () => {
    idCounter = 0
    const rows: HistoricoRow[] = [
      row({ candidato_id: "c1", cargo_canonico: "Senador", periodo_inicio: 2010 }),
    ]

    const result = await runBackfillHistoricoPeriodoFim({
      apply: false,
      fetchRows: async () => rows,
      updateRow: async () => {},
      log: noop,
      warn: noop,
    })

    assert.equal(result.changes.length, 1)
    assert.equal(result.changes[0].newFim, 2018)
    assert.match(result.changes[0].reason, /max duration 8yr/)
  })

  it("manual source rows go to CSV queue, not auto processing", async () => {
    idCounter = 0
    const rows: HistoricoRow[] = [
      row({ candidato_id: "c1", cargo_canonico: "Vereador", periodo_inicio: 2008, observacoes: "curadoria editorial" }),
    ]

    const result = await runBackfillHistoricoPeriodoFim({
      apply: false,
      fetchRows: async () => rows,
      updateRow: async () => {},
      log: noop,
      warn: noop,
    })

    assert.equal(result.autoQueueSize, 0)
    assert.equal(result.manualQueueSize, 1)
    assert.equal(result.changes.length, 0, "manual rows should not generate auto changes")
    assert.ok(result.manualCsvRows.length > 1, "CSV should have header + data")
    assert.match(result.manualCsvRows[1], /curadoria editorial/)
  })

  it("already closed rows are skipped", async () => {
    idCounter = 0
    const rows: HistoricoRow[] = [
      row({ candidato_id: "c1", cargo_canonico: "Deputado Federal", periodo_inicio: 2014, periodo_fim: 2018 }),
    ]

    const result = await runBackfillHistoricoPeriodoFim({
      apply: false,
      fetchRows: async () => rows,
      updateRow: async () => {},
      log: noop,
      warn: noop,
    })

    assert.equal(result.openRows, 0)
    assert.equal(result.changes.length, 0)
  })

  it("apply mode writes and counts correctly", async () => {
    idCounter = 0
    const rows: HistoricoRow[] = [
      row({ candidato_id: "c1", cargo_canonico: "Deputado Federal", periodo_inicio: 2014 }),
      row({ candidato_id: "c1", cargo_canonico: "Deputado Federal", periodo_inicio: 2022 }),
    ]
    const updates: Array<{ id: string; periodoFim: number }> = []

    const result = await runBackfillHistoricoPeriodoFim({
      apply: true,
      fetchRows: async () => rows,
      updateRow: async (id, periodoFim) => { updates.push({ id, periodoFim }) },
      log: noop,
      warn: noop,
    })

    assert.equal(result.applied, 1)
    assert.equal(result.errors, 0)
    assert.equal(updates.length, 1)
    assert.equal(updates[0].id, "hp-1")
    assert.equal(updates[0].periodoFim, 2018)
  })

  it("apply mode counts errors from updateRow failures", async () => {
    idCounter = 0
    const rows: HistoricoRow[] = [
      row({ candidato_id: "c1", cargo_canonico: "Deputado Federal", periodo_inicio: 2010 }),
    ]

    const result = await runBackfillHistoricoPeriodoFim({
      apply: true,
      fetchRows: async () => rows,
      updateRow: async () => { throw new Error("DB write failed") },
      log: noop,
      warn: noop,
    })

    assert.equal(result.applied, 0)
    assert.equal(result.errors, 1)
  })
})

// --- Chain-level: exercises the real SELECT/UPDATE Supabase chain via createBackfillDepsFromClient ---

describe("backfill-historico-periodo-fim (chain-level DB I/O)", () => {
  it("SELECT chain does NOT filter tipo_evento (candidatura vira contexto), excludes null periodo_inicio, orders by periodo_inicio", async () => {
    const fixture = new HistoricoChainFixture([
      {
        id: "hp-100",
        candidato_id: "c1",
        cargo_canonico: "Deputado Federal",
        periodo_inicio: 2018,
        periodo_fim: null,
        observacoes: "(TSE 2018)",
        tipo_evento: "mandato",
        candidatos: { slug: "fulano" },
      },
      {
        id: "hp-101",
        candidato_id: "c1",
        cargo_canonico: "Deputado Federal",
        periodo_inicio: 2022,
        periodo_fim: null,
        observacoes: "(TSE 2022)",
        tipo_evento: "mandato",
        candidatos: { slug: "fulano" },
      },
      // Buscada (serve de contexto), mas nunca recebe periodo_fim
      {
        id: "hp-102",
        candidato_id: "c1",
        cargo_canonico: "Deputado Federal",
        periodo_inicio: 2014,
        periodo_fim: null,
        observacoes: "(TSE 2014)",
        tipo_evento: "candidatura",
        candidatos: { slug: "fulano" },
      },
      // Should be filtered out: periodo_inicio is null
      {
        id: "hp-103",
        candidato_id: "c2",
        cargo_canonico: "Senador",
        periodo_inicio: null as unknown as number,
        periodo_fim: null,
        observacoes: "Wikidata",
        tipo_evento: "mandato",
        candidatos: { slug: "ciclano" },
      },
    ])

    const deps = createBackfillDepsFromClient(fixture.createClient(), { apply: false })
    const result = await runBackfillHistoricoPeriodoFim(deps)

    // 3 linhas com periodo_inicio nao nulo: 2 mandatos + 1 candidatura
    assert.equal(result.totalRows, 3)
    // A candidatura nao entra na fila de abertos nem recebe periodo_fim
    assert.equal(result.openRows, 2)
    assert.ok(!result.changes.some((c) => c.id === "hp-102"), "candidatura nunca recebe periodo_fim")
    // hp-100 (2018) fechado por hp-101 (2022): 4 anos, dentro do teto do cargo
    assert.equal(result.changes.length, 1)
    assert.equal(result.changes[0].id, "hp-100")
    assert.equal(result.changes[0].newFim, 2022)

    // Verify the SELECT chain was built correctly
    assert.ok(fixture.queryLog.includes("from(historico_politico)"))
    assert.ok(
      !fixture.queryLog.some((l) => l.includes("eq(tipo_evento,mandato)")),
      "o filtro por tipo_evento escondia candidaturas e linhas com tipo NULL; nao pode voltar"
    )
    assert.ok(fixture.queryLog.some((l) => l.includes("tipo_evento")), "tipo_evento precisa vir na projecao")
    assert.ok(fixture.queryLog.some((l) => l.includes("not(periodo_inicio,is,null)")))
    assert.ok(fixture.queryLog.some((l) => l.includes("order(periodo_inicio,asc=true)")))
  })

  it("UPDATE chain writes periodo_fim via from().update().eq() in apply mode", async () => {
    const fixture = new HistoricoChainFixture([
      {
        id: "hp-200",
        candidato_id: "c1",
        cargo_canonico: "Vereador",
        periodo_inicio: 2016,
        periodo_fim: null,
        observacoes: "(TSE 2016)",
        tipo_evento: "mandato",
        candidatos: { slug: "beltrano" },
      },
      {
        id: "hp-201",
        candidato_id: "c1",
        cargo_canonico: "Deputado Estadual",
        periodo_inicio: 2022,
        periodo_fim: null,
        observacoes: "(TSE 2022)",
        tipo_evento: "mandato",
        candidatos: { slug: "beltrano" },
      },
    ])

    const cliente = fixture.createClient()
    const deps = createBackfillDepsFromClient(cliente, {
      apply: true,
      // O script de produção só escreve dentro de escreverAuditado(), em main().
      // Aqui a cadeia de UPDATE é do teste, contra o cliente de fixture, que é
      // justamente o que este bloco existe para conferir.
      updateRow: async (id, periodoFim) => {
        const { error } = await cliente
          .from("historico_politico")
          .update({ periodo_fim: periodoFim })
          .eq("id", id)
        if (error) throw new Error("fixture: update falhou")
      },
    })
    const result = await runBackfillHistoricoPeriodoFim(deps)

    // Vereador 2016 com fechador em 2022: capa no teto de 4 anos, 2020
    assert.equal(result.applied, 1)
    assert.equal(result.errors, 0)
    assert.equal(fixture.updates.length, 1)
    assert.equal(fixture.updates[0].id, "hp-200")
    assert.deepEqual(fixture.updates[0].payload, { periodo_fim: 2020 })

    // Verify the UPDATE chain was built correctly
    const updateLogs = fixture.queryLog.filter((l) => l.startsWith("update("))
    assert.equal(updateLogs.length, 1)
    assert.ok(updateLogs[0].includes('"periodo_fim":2020'))
  })

  it("candidatos!inner(slug) join shape: slug is extracted from nested candidatos object", async () => {
    const fixture = new HistoricoChainFixture([
      {
        id: "hp-300",
        candidato_id: "c1",
        cargo_canonico: "Senador",
        periodo_inicio: 2010,
        periodo_fim: null,
        observacoes: "(TSE 2010)",
        tipo_evento: "mandato",
        candidatos: { slug: "specific-slug" },
      },
    ])

    const deps = createBackfillDepsFromClient(fixture.createClient(), { apply: false })
    const result = await runBackfillHistoricoPeriodoFim(deps)

    // Slug is extracted from the candidatos join
    assert.equal(result.changes[0].slug, "specific-slug")
    // Verify column projection includes the join
    assert.ok(fixture.queryLog.some((l) => l.includes("candidatos!inner(slug)")))
  })

  it("full cycle: apply mutates fixture DB state and final row values match expected", async () => {
    // Scenario: 3 candidates with various rules
    // c1: Deputado Federal 2014 (open, auto) -> 2022 (open, auto) => teto de 4 anos fecha em 2018, 2022 fica aberto
    // c2: Vereador 2016 (open, auto) -> Governador 2022 (open, auto) => teto de 4 anos fecha em 2020
    // c3: Senador 2010 (open, auto) => Rule C: max 8yr => fim=2018
    // c4: Deputado Federal 2008 (open, manual/curadoria) => NOT auto-processed (manual queue)
    const fixture = new HistoricoChainFixture([
      { id: "h1", candidato_id: "c1", cargo_canonico: "Deputado Federal", periodo_inicio: 2014, periodo_fim: null, observacoes: "(TSE 2014)", tipo_evento: "mandato", candidatos: { slug: "alice" } },
      { id: "h2", candidato_id: "c1", cargo_canonico: "Deputado Federal", periodo_inicio: 2022, periodo_fim: null, observacoes: "(TSE 2022)", tipo_evento: "mandato", candidatos: { slug: "alice" } },
      { id: "h3", candidato_id: "c2", cargo_canonico: "Vereador", periodo_inicio: 2016, periodo_fim: null, observacoes: "Wikidata mandato", tipo_evento: "mandato", candidatos: { slug: "bob" } },
      { id: "h4", candidato_id: "c2", cargo_canonico: "Governador", periodo_inicio: 2022, periodo_fim: null, observacoes: "(TSE 2022)", tipo_evento: "mandato", candidatos: { slug: "bob" } },
      { id: "h5", candidato_id: "c3", cargo_canonico: "Senador", periodo_inicio: 2010, periodo_fim: null, observacoes: "(TSE 2010)", tipo_evento: "mandato", candidatos: { slug: "carol" } },
      { id: "h6", candidato_id: "c4", cargo_canonico: "Deputado Federal", periodo_inicio: 2008, periodo_fim: null, observacoes: "curadoria editorial", tipo_evento: "mandato", candidatos: { slug: "dave" } },
    ])

    const cliente = fixture.createClient()
    const deps = createBackfillDepsFromClient(cliente, {
      apply: true,
      // O script de produção só escreve dentro de escreverAuditado(), em main().
      // Aqui a cadeia de UPDATE é do teste, contra o cliente de fixture, que é
      // justamente o que este bloco existe para conferir.
      updateRow: async (id, periodoFim) => {
        const { error } = await cliente
          .from("historico_politico")
          .update({ periodo_fim: periodoFim })
          .eq("id", id)
        if (error) throw new Error("fixture: update falhou")
      },
    })
    const result = await runBackfillHistoricoPeriodoFim(deps)

    // Verify business logic results
    assert.equal(result.changes.length, 3, "3 changes: Rule A + Rule B + Rule C")
    assert.equal(result.applied, 3)
    assert.equal(result.errors, 0)
    assert.equal(result.manualQueueSize, 1, "c4 is manual")

    // --- KEY ASSERTION: verify final DB state in the fixture ---
    const rows = fixture.getRows()
    const byId = new Map(rows.map((r) => [r.id, r]))

    // h1: fechador (h2, 2022) esta alem do teto de 4 anos do cargo; capa em 2018
    assert.equal(byId.get("h1")!.periodo_fim, 2018, "h1 capped by MAX_DURATION, nao esticado ate 2022")

    // h2: stays open (no later same cargo, no incompatible, 2022 >= 2022 so no Rule C)
    assert.equal(byId.get("h2")!.periodo_fim, null, "h2 stays open")

    // h3: Governador (h4, 2022) esta alem do teto de 4 anos do Vereador; capa em 2020
    assert.equal(byId.get("h3")!.periodo_fim, 2020, "h3 Vereador capped by MAX_DURATION")

    // h4: stays open (Governador 2022, no incompatible closer, no Rule C for 2022+)
    assert.equal(byId.get("h4")!.periodo_fim, null, "h4 Governador stays open")

    // h5: Rule C max 8yr (2010 + 8 = 2018)
    assert.equal(byId.get("h5")!.periodo_fim, 2018, "h5 Senador max duration 8yr")

    // h6: manual source, NOT auto-processed, stays open
    assert.equal(byId.get("h6")!.periodo_fim, null, "h6 manual queue untouched")

    // Verify updates array tracks all DB writes
    assert.equal(fixture.updates.length, 3)
    const updateIds = new Set(fixture.updates.map((u) => u.id))
    assert.ok(updateIds.has("h1"))
    assert.ok(updateIds.has("h3"))
    assert.ok(updateIds.has("h5"))
    assert.ok(!updateIds.has("h6"), "manual row not updated")
  })
})

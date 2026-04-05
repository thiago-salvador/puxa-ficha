import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { FichaCandidato } from "../src/lib/types"
import {
  buildTimelineEvents,
  clampTimeWindow,
  computeProcessYearFallback,
  getTimelineRange,
  type TimelineEvent,
} from "../src/lib/timeline-utils"

function fichaStub(partial: Partial<FichaCandidato> = {}): FichaCandidato {
  const base: FichaCandidato = {
    id: "1",
    nome_completo: "Test",
    nome_urna: "Test",
    slug: "test",
    data_nascimento: null,
    idade: 40,
    naturalidade: null,
    formacao: null,
    profissao_declarada: null,
    partido_atual: "PT",
    partido_sigla: "PT",
    cargo_atual: null,
    cargo_disputado: "Presidente",
    estado: null,
    status: "candidato",
    foto_url: null,
    site_campanha: null,
    redes_sociais: {},
    fonte_dados: [],
    ultima_atualizacao: "2026-01-01",
    historico: [],
    mudancas_partido: [],
    patrimonio: [],
    financiamento: [],
    votos: [],
    processos: [],
    pontos_atencao: [],
    projetos_lei: [],
    gastos_parlamentares: [],
    sancoes_administrativas: [],
    noticias: [],
    total_processos: 0,
    processos_criminais: 0,
    total_mudancas_partido: 0,
    total_pontos_atencao: 0,
    pontos_criticos: 0,
    total_sancoes: 0,
    ...partial,
  }
  return base
}

describe("timeline-utils", () => {
  it("computeProcessYearFallback uses non-process sources", () => {
    const y = computeProcessYearFallback(
      fichaStub({
        historico: [
          {
            id: "h1",
            candidato_id: "1",
            cargo: "Dep",
            periodo_inicio: 2010,
            periodo_fim: 2014,
            partido: "PT",
            estado: "SP",
            eleito_por: "SP",
            observacoes: null,
          },
        ],
        processos: [],
      }),
    )
    assert.equal(y, 2010)
  })

  it("computeProcessYearFallback returns 2000 when no temporal data", () => {
    assert.equal(computeProcessYearFallback(fichaStub()), 2000)
  })

  it("buildTimelineEvents skips vote without votacao join", () => {
    const ev = buildTimelineEvents(
      fichaStub({
        votos: [
          {
            id: "v1",
            candidato_id: "1",
            votacao_id: "x",
            voto: "sim",
            contradicao: false,
            contradicao_descricao: null,
          },
        ],
      }),
    )
    assert.equal(ev.filter((e) => e.type === "votacao").length, 0)
  })

  it("buildTimelineEvents skips projeto_lei without ano", () => {
    const ev = buildTimelineEvents(
      fichaStub({
        projetos_lei: [
          {
            id: "p1",
            candidato_id: "1",
            tipo: "PL",
            numero: "1",
            ano: null,
            ementa: "x",
            tema: null,
            situacao: null,
            url_inteiro_teor: null,
            destaque: false,
            destaque_motivo: null,
            fonte: "t",
          },
        ],
      }),
    )
    assert.equal(ev.filter((e) => e.type === "projeto_lei").length, 0)
  })

  it("processo without data_inicio uses fallback and date_unknown", () => {
    const ev = buildTimelineEvents(
      fichaStub({
        historico: [
          {
            id: "h1",
            candidato_id: "1",
            cargo: "Dep",
            periodo_inicio: 2005,
            periodo_fim: null,
            partido: "PT",
            estado: "SP",
            eleito_por: "SP",
            observacoes: null,
          },
        ],
        processos: [
          {
            id: "pr1",
            candidato_id: "1",
            tipo: "civil",
            tribunal: "TJ",
            numero_processo: null,
            descricao: "Teste",
            status: "em_andamento",
            data_inicio: null,
            data_decisao: null,
            gravidade: "media",
          },
        ],
      }),
    )
    const p = ev.find((e) => e.type === "processo") as TimelineEvent | undefined
    assert.ok(p)
    assert.equal(p.year_start, 2005)
    assert.equal(p.date_unknown, true)
  })

  it("getTimelineRange spans events and current year", () => {
    const r = getTimelineRange([
      { id: "a", type: "cargo", label: "x", year_start: 2010, year_end: 2015 },
    ] as TimelineEvent[])
    assert.ok(r.year_max >= new Date().getFullYear())
    assert.equal(r.year_min, 2010)
  })

  it("cargo label falls back to partido_sigla when partido is blank", () => {
    const ev = buildTimelineEvents(
      fichaStub({
        partido_sigla: "PSOL",
        historico: [
          {
            id: "h1",
            candidato_id: "1",
            cargo: "Senador",
            periodo_inicio: 2011,
            periodo_fim: 2018,
            partido: "   ",
            estado: "CE",
            eleito_por: "CE",
            observacoes: null,
          },
        ],
      }),
    )
    const c = ev.find((e) => e.type === "cargo")
    assert.ok(c?.label.includes("PSOL"))
  })

  it("buildTimelineEvents includes mudanca_partido", () => {
    const ev = buildTimelineEvents(
      fichaStub({
        mudancas_partido: [
          {
            id: "m1",
            candidato_id: "1",
            partido_anterior: "PSB",
            partido_novo: "PL",
            data_mudanca: null,
            ano: 2022,
            contexto: "Fusao",
          },
        ],
      }),
    )
    const m = ev.find((e) => e.type === "mudanca_partido")
    assert.ok(m)
    assert.equal(m?.year_start, 2022)
    assert.ok(m?.label.includes("PL"))
  })

  it("gastos include top category in description", () => {
    const ev = buildTimelineEvents(
      fichaStub({
        gastos_parlamentares: [
          {
            id: "g1",
            candidato_id: "1",
            ano: 2023,
            total_gasto: 1000,
            detalhamento: [
              { categoria: "Divulgacao", valor: 600 },
              { categoria: "Passagens", valor: 400 },
            ],
            gastos_destaque: [],
          },
        ],
      }),
    )
    const g = ev.find((e) => e.type === "gasto_parlamentar")
    assert.ok(g?.description?.includes("Divulgacao"))
    assert.ok(g?.description?.includes("60"))
  })

  it("cargo with periodo_fim null has no year_end on event", () => {
    const ev = buildTimelineEvents(
      fichaStub({
        historico: [
          {
            id: "h1",
            candidato_id: "1",
            cargo: "Dep",
            periodo_inicio: 2015,
            periodo_fim: null,
            partido: "PT",
            estado: "SP",
            eleito_por: "SP",
            observacoes: null,
          },
        ],
      }),
    )
    const c = ev.find((e) => e.type === "cargo")
    assert.ok(c)
    assert.equal(c?.year_end, undefined)
  })

  it("sorts by year_start then date then id", () => {
    const ev = buildTimelineEvents(
      fichaStub({
        patrimonio: [
          {
            id: "p2",
            candidato_id: "1",
            ano_eleicao: 2018,
            valor_total: 2,
            bens: [],
          },
          {
            id: "p1",
            candidato_id: "1",
            ano_eleicao: 2014,
            valor_total: 1,
            bens: [],
          },
        ],
      }),
    )
    const pat = ev.filter((e) => e.type === "patrimonio")
    assert.equal(pat[0].year_start, 2014)
    assert.equal(pat[1].year_start, 2018)
  })

  it("clampTimeWindow keeps window inside extent", () => {
    const c = clampTimeWindow(2005, 2015, 2000, 2020)
    assert.ok(c.min >= 2000)
    assert.ok(c.max <= 2020)
    assert.ok(c.max > c.min)
  })

  it("clampTimeWindow shifts back when overflowing past extentMax", () => {
    const c = clampTimeWindow(2015, 2030, 2000, 2020)
    assert.equal(c.max, 2020)
    assert.ok(c.min >= 2000)
  })

  it("clampTimeWindow uses full extent when requested span is wider", () => {
    const c = clampTimeWindow(1990, 2050, 2010, 2012)
    assert.equal(c.min, 2010)
    assert.equal(c.max, 2012)
  })

  it("clampTimeWindow returns extent point when min equals max", () => {
    const c = clampTimeWindow(2020, 2025, 2020, 2020)
    assert.equal(c.min, 2020)
    assert.equal(c.max, 2020)
  })
})

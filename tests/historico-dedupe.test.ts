import assert from "node:assert/strict"
import { test } from "node:test"
import {
  countHistoricoSemanticOverlaps,
  dedupeHistoricoPoliticoForDisplay,
  ensureCurrentCandidacyInHistory,
  hasWideManualOverlappingSegmentedMandates,
  normalizeHistoricoPoliticoForDisplay,
  splitBrasilPresidenteTwoOpenLongGap,
} from "@/lib/historico-dedupe"
import { formatHistoricoPeriodoDisplay } from "@/lib/historico-display"
import type { Candidato, HistoricoPolitico } from "@/lib/types"

function row(partial: Partial<HistoricoPolitico> & Pick<HistoricoPolitico, "id">): HistoricoPolitico {
  return {
    candidato_id: "c1",
    cargo: "Deputado Federal",
    cargo_canonico: "Deputado Federal",
    periodo_inicio: 2018,
    periodo_fim: 2022,
    partido: "PT",
    estado: "SP",
    observacoes: null,
    fonte: null,
    ...partial,
  } as HistoricoPolitico
}

const currentCandidate = {
  id: "well-macedo-id",
  cargo_disputado: "Governador",
  partido_sigla: "PSTU",
  estado: "PA",
  status: "candidato",
  fonte_dados: ["TSE consulta_cand 2026"],
} satisfies Pick<Candidato, "id" | "cargo_disputado" | "partido_sigla" | "estado" | "status" | "fonte_dados">

test("projeta candidatura atual ausente sem apagar o histórico anterior", () => {
  const out = ensureCurrentCandidacyInHistory(currentCandidate, [
    row({ id: "well-2022", periodo_inicio: 2022, periodo_fim: 2022, tipo_evento: "candidatura" }),
  ])

  assert.equal(out.length, 2)
  assert.deepEqual(
    out.find((item) => item.periodo_inicio === 2026),
    {
      id: "perfil-atual-well-macedo-id-2026",
      candidato_id: "well-macedo-id",
      cargo: "Governador",
      cargo_canonico: "Governador",
      tipo_evento: "candidatura",
      periodo_inicio: 2026,
      periodo_fim: 2026,
      partido: "PSTU",
      estado: "PA",
      eleito_por: "",
      observacoes: null,
      proveniencia: "tse",
    },
  )
})

test("preserva mandato atual e adiciona candidatura do mesmo cargo no mesmo ano", () => {
  const mandato = row({
    id: "mandato-2026",
    cargo: "Governador",
    cargo_canonico: "Governador",
    periodo_inicio: 2026,
    periodo_fim: null,
    tipo_evento: "mandato",
  })
  const out = ensureCurrentCandidacyInHistory(currentCandidate, [mandato])

  assert.equal(out.length, 2)
  assert.equal(out.filter((item) => item.tipo_evento === "mandato").length, 1)
  assert.equal(out.filter((item) => item.tipo_evento === "candidatura").length, 1)
})

test("não duplica variante textual já existente da candidatura atual", () => {
  const candidatura = row({
    id: "candidatura-2026",
    cargo: "Pré-candidatura ao Governo do Pará",
    cargo_canonico: "Pré-candidatura ao Governo do Pará",
    periodo_inicio: 2026,
    periodo_fim: 2026,
    tipo_evento: "candidatura",
  })

  assert.deepEqual(ensureCurrentCandidacyInHistory(currentCandidate, [candidatura]), [candidatura])
})

test("dedupeHistoricoPoliticoForDisplay colapsa mesmo cargo canónico e período", () => {
  const a = row({ id: "a", observacoes: "foo" })
  const b = row({ id: "b", observacoes: "foo bar baz" })
  const out = dedupeHistoricoPoliticoForDisplay([a, b])
  assert.equal(out.length, 1)
  assert.equal(out[0]!.id, "b")
})

test("dedupeHistoricoPoliticoForDisplay mantém linhas com período distinto", () => {
  const a = row({ id: "a", periodo_inicio: 2014, periodo_fim: 2018 })
  const b = row({ id: "b", periodo_inicio: 2018, periodo_fim: 2022 })
  const out = dedupeHistoricoPoliticoForDisplay([a, b])
  assert.equal(out.length, 2)
})

test("splitBrasilPresidenteTwoOpenLongGap parte 2002 aberto + 2022 aberto em 2002–2006 e 2006–2010", () => {
  const a = row({
    id: "h2002",
    cargo: "Presidente da República",
    cargo_canonico: "Presidente",
    periodo_inicio: 2002,
    periodo_fim: null,
    estado: "BR",
    eleito_por: "",
  })
  const b = row({
    id: "h2022",
    cargo: "Presidente da República",
    cargo_canonico: "Presidente",
    periodo_inicio: 2022,
    periodo_fim: null,
    estado: "BR",
    eleito_por: "",
  })
  const out = splitBrasilPresidenteTwoOpenLongGap([a, b])
  assert.equal(out.length, 3)
  const t1 = out.find((r) => r.id === "h2002-pf-s1")
  const t2 = out.find((r) => r.id === "h2002-pf-s2")
  const open = out.find((r) => r.id === "h2022")
  assert.ok(t1 && t2 && open)
  assert.equal(t1.periodo_fim, 2006)
  assert.equal(t2.periodo_inicio, 2006)
  assert.equal(t2.periodo_fim, 2010)
  assert.equal(open.periodo_fim, null)
})

test("normalizeHistoricoPoliticoForDisplay aplica dedupe e split", () => {
  const a = row({
    id: "h2002",
    cargo: "Presidente da República",
    cargo_canonico: "Presidente",
    periodo_inicio: 2002,
    periodo_fim: null,
    estado: "BR",
    eleito_por: "",
  })
  const b = row({
    id: "h2022",
    cargo: "Presidente da República",
    cargo_canonico: "Presidente",
    periodo_inicio: 2022,
    periodo_fim: null,
    estado: "BR",
    eleito_por: "",
  })
  const out = normalizeHistoricoPoliticoForDisplay([a, b])
  assert.equal(out.length, 3)
})

test("normalizeHistoricoPoliticoForDisplay colapsa par TSE 2022/2023 do mesmo mandato e exibe a eleição como candidatura", () => {
  const governadorEleicao = row({
    id: "gov-2022",
    cargo: "Governador de Sao Paulo",
    cargo_canonico: "Governador",
    periodo_inicio: 2022,
    periodo_fim: null,
    partido: "REPUBLICANOS",
    estado: "SP",
    observacoes: "ELEITO (TSE 2022)",
    tipo_evento: "mandato",
  })
  const governadorPosse = row({
    id: "gov-2023",
    cargo: "Governador de São Paulo",
    cargo_canonico: "Governador",
    periodo_inicio: 2023,
    periodo_fim: null,
    partido: "REPUBLICANOS",
    estado: "SP",
    observacoes: "Mandato desde 1º de janeiro de 2023 (TSE + curadoria 17.csv)",
    tipo_evento: "mandato",
  })
  const ministro = row({
    id: "min-2019",
    cargo: "Ministro da Infraestrutura",
    cargo_canonico: "Ministro da Infraestrutura",
    periodo_inicio: 2019,
    periodo_fim: 2022,
    partido: "REPUBLICANOS",
    estado: "",
    observacoes: "Governo Bolsonaro",
    tipo_evento: "mandato",
  })

  const out = normalizeHistoricoPoliticoForDisplay([governadorEleicao, governadorPosse, ministro])

  assert.equal(out.length, 3)
  assert.equal(out.filter((item) => item.cargo_canonico === "Governador").length, 2)
  const eleicaoVisivel = out.find((item) => item.id === "gov-2022")
  assert.ok(eleicaoVisivel)
  assert.equal(eleicaoVisivel.tipo_evento, "candidatura")
  assert.equal(eleicaoVisivel.periodo_inicio, 2022)
  assert.equal(eleicaoVisivel.periodo_fim, 2022)
  const governador = out.find((item) => item.id === "gov-2023")
  assert.ok(governador)
  assert.equal(governador.tipo_evento, "mandato")
  assert.equal(formatHistoricoPeriodoDisplay(governador, out), "2023 - atual")
})

test("normalizeHistoricoPoliticoForDisplay descarta linha nula redundante quando já existe o mesmo cargo com período válido", () => {
  const governadorAtual = row({
    id: "gov-2023",
    cargo: "Governador de São Paulo",
    cargo_canonico: "Governador",
    periodo_inicio: 2023,
    periodo_fim: null,
    partido: "REPUBLICANOS",
    estado: "SP",
    observacoes: null,
    tipo_evento: "mandato",
  })
  const governadorSemPeriodo = row({
    id: "gov-null",
    cargo: "Governador de São Paulo",
    cargo_canonico: "Governador",
    periodo_inicio: null,
    periodo_fim: null,
    partido: "REPUBLICANOS",
    estado: "",
    observacoes: "Cargo atual confirmado na atualização do perfil em 01/04/2026; inicio do mandato ainda não determinado.",
    tipo_evento: "mandato",
  })
  const ministro = row({
    id: "min-2019",
    cargo: "Ministro da Infraestrutura",
    cargo_canonico: "Ministro da Infraestrutura",
    periodo_inicio: 2019,
    periodo_fim: 2022,
    partido: "sem partido",
    estado: "",
    observacoes: "Governo Bolsonaro",
    tipo_evento: "mandato",
  })

  const out = normalizeHistoricoPoliticoForDisplay([governadorSemPeriodo, governadorAtual, ministro])

  assert.equal(out.length, 2)
  assert.equal(out.some((item) => item.id === "gov-null"), false)
  assert.equal(out.some((item) => item.id === "gov-2023"), true)
})

test("normalizeHistoricoPoliticoForDisplay descarta variante territorial sem período quando o cargo canônico já está datado", () => {
  const governadorAtual = row({
    id: "gov-2022",
    cargo: "Governador",
    cargo_canonico: "Governador",
    periodo_inicio: 2022,
    periodo_fim: null,
    partido: "PSD",
    estado: "GO",
    observacoes: null,
    tipo_evento: "mandato",
  })
  const governadorAliasSemPeriodo = row({
    id: "gov-goias-null",
    cargo: "Governador de Goiás",
    cargo_canonico: "Governador",
    periodo_inicio: null,
    periodo_fim: null,
    partido: "PSD",
    estado: "",
    observacoes: "Cargo atual confirmado na atualização do perfil em 01/04/2026; inicio do mandato ainda não determinado.",
    tipo_evento: "mandato",
  })

  const out = normalizeHistoricoPoliticoForDisplay([governadorAliasSemPeriodo, governadorAtual])

  assert.equal(out.length, 1)
  assert.equal(out[0]?.id, "gov-2022")
})

test("normalizeHistoricoPoliticoForDisplay colapsa par eleição/posse com partido TSE divergente da curadoria do mandato", () => {
  const eleicao = row({
    id: "pref-2020-dem",
    cargo: "Prefeito do Rio de Janeiro",
    cargo_canonico: "Prefeito",
    periodo_inicio: 2020,
    periodo_fim: 2025,
    partido: "DEM",
    estado: "RJ",
    observacoes: "ELEITO (TSE 2020)",
    tipo_evento: "mandato",
  })
  const posse = row({
    id: "pref-2021-psd",
    cargo: "Prefeito do Rio de Janeiro",
    cargo_canonico: "Prefeito",
    periodo_inicio: 2021,
    periodo_fim: null,
    partido: "PSD",
    estado: "RJ",
    observacoes: "Mandato atual na Prefeitura (Prefeitura + G1 2026)",
    tipo_evento: "mandato",
  })
  const out = normalizeHistoricoPoliticoForDisplay([eleicao, posse])
  assert.equal(out.length, 2)
  assert.equal(out.some((item) => item.id === "pref-2021-psd"), true)
  const candidatura = out.find((item) => item.id === "pref-2020-dem")
  assert.ok(candidatura)
  assert.equal(candidatura.tipo_evento, "candidatura")
  assert.equal(candidatura.periodo_inicio, 2020)
  assert.equal(candidatura.periodo_fim, 2020)
})

test("normalizeHistoricoPoliticoForDisplay colapsa par eleição/posse mesmo com estado textual vs sigla divergentes", () => {
  const eleicao = row({
    id: "pref-2020-eleito",
    cargo: "Prefeito do Rio de Janeiro",
    cargo_canonico: "Prefeito",
    periodo_inicio: 2020,
    periodo_fim: 2025,
    partido: "PSD",
    estado: "RJ",
    observacoes: "ELEITO (TSE 2020)",
    tipo_evento: "mandato",
  })
  const posse = row({
    id: "pref-2021-mandato",
    cargo: "Prefeito do Rio de Janeiro",
    cargo_canonico: "Prefeito",
    periodo_inicio: 2021,
    periodo_fim: null,
    partido: "PSD",
    estado: "Rio de Janeiro",
    observacoes: "Mandato atual na Prefeitura (curadoria)",
    tipo_evento: "mandato",
  })
  const out = normalizeHistoricoPoliticoForDisplay([eleicao, posse])
  assert.equal(out.length, 2)
  assert.equal(out.some((item) => item.id === "pref-2021-mandato"), true)
  const candidatura = out.find((item) => item.id === "pref-2020-eleito")
  assert.ok(candidatura)
  assert.equal(candidatura.tipo_evento, "candidatura")
  assert.equal(candidatura.periodo_inicio, 2020)
  assert.equal(candidatura.periodo_fim, 2020)
})

test("normalizeHistoricoPoliticoForDisplay não colapsa quando estados textuais conflitam (ex.: Rio de Janeiro vs São Paulo)", () => {
  const rj = row({
    id: "gov-rj-eleito",
    cargo: "Governador",
    cargo_canonico: "Governador",
    periodo_inicio: 2018,
    periodo_fim: 2022,
    partido: "PSDB",
    estado: "Rio de Janeiro",
    observacoes: "ELEITO (TSE 2018)",
    tipo_evento: "mandato",
  })
  const sp = row({
    id: "gov-sp-2019",
    cargo: "Governador",
    cargo_canonico: "Governador",
    periodo_inicio: 2019,
    periodo_fim: 2022,
    partido: "PSDB",
    estado: "São Paulo",
    observacoes: null,
    tipo_evento: "mandato",
  })
  const out = normalizeHistoricoPoliticoForDisplay([rj, sp])
  assert.equal(out.length, 2)
})

test("normalizeHistoricoPoliticoForDisplay mantém eleição TSE como candidatura quando já existe o mandato correto do cargo", () => {
  const governadorEleito = row({
    id: "gov-2018-eleito",
    cargo: "Governador do Rio Grande do Sul",
    cargo_canonico: "Governador",
    periodo_inicio: 2018,
    periodo_fim: 2022,
    partido: "PSDB",
    estado: "RS",
    observacoes: "ELEITO (TSE 2018)",
    tipo_evento: "mandato",
  })
  const governadorMandato = row({
    id: "gov-2019-mandato",
    cargo: "Governador do Rio Grande do Sul",
    cargo_canonico: "Governador",
    periodo_inicio: 2019,
    periodo_fim: 2022,
    partido: "PSDB",
    estado: "RS",
    observacoes: null,
    tipo_evento: "mandato",
  })
  const prefeitoEleito = row({
    id: "pref-2012-eleito",
    cargo: "Prefeito de Pelotas",
    cargo_canonico: "Prefeito",
    periodo_inicio: 2012,
    periodo_fim: 2018,
    partido: "PSDB",
    estado: "RS",
    observacoes: "ELEITO (TSE 2012)",
    tipo_evento: "mandato",
  })
  const prefeitoMandato = row({
    id: "pref-2013-mandato",
    cargo: "Prefeito de Pelotas",
    cargo_canonico: "Prefeito",
    periodo_inicio: 2013,
    periodo_fim: 2016,
    partido: "PSDB",
    estado: "RS",
    observacoes: null,
    tipo_evento: "mandato",
  })

  const out = normalizeHistoricoPoliticoForDisplay([
    governadorEleito,
    governadorMandato,
    prefeitoEleito,
    prefeitoMandato,
  ])

  assert.equal(out.length, 4)
  const govEleito = out.find((item) => item.id === "gov-2018-eleito")
  assert.ok(govEleito)
  assert.equal(govEleito.tipo_evento, "candidatura")
  assert.equal(govEleito.periodo_fim, 2018)
  const prefEleito = out.find((item) => item.id === "pref-2012-eleito")
  assert.ok(prefEleito)
  assert.equal(prefEleito.tipo_evento, "candidatura")
  assert.equal(prefEleito.periodo_fim, 2012)
  assert.equal(out.some((item) => item.id === "gov-2019-mandato"), true)
  assert.equal(out.some((item) => item.id === "pref-2013-mandato"), true)
})

test("normalizeHistoricoPoliticoForDisplay exibe candidatura colapsada com mandato parcial de outra proveniência", () => {
  const senadorEleito = row({
    id: "sen-2014-eleito",
    cargo: "Senador",
    cargo_canonico: "Senador",
    periodo_inicio: 2014,
    periodo_fim: null,
    partido: "DEM",
    estado: "GO",
    observacoes: "ELEITO (TSE 2014)",
    tipo_evento: "mandato",
  })
  const senadorWikidata = row({
    id: "sen-2015-wiki",
    cargo: "Senador",
    cargo_canonico: "Senador",
    periodo_inicio: 2015,
    periodo_fim: 2019,
    partido: "",
    estado: "",
    observacoes: "Importado automaticamente de Wikidata P39 em 2026-08-05",
    tipo_evento: "mandato",
  })

  const out = normalizeHistoricoPoliticoForDisplay([senadorEleito, senadorWikidata])

  assert.equal(out.some((item) => item.id === "sen-2015-wiki"), true)
  const candidatura = out.find((item) => item.id === "sen-2014-eleito")
  assert.ok(candidatura)
  assert.equal(candidatura.tipo_evento, "candidatura")
  assert.equal(candidatura.periodo_inicio, 2014)
  assert.equal(candidatura.periodo_fim, 2014)
})

test("normalizeHistoricoPoliticoForDisplay trunca mandato anterior quando troca de partido gera sobreposição", () => {
  const depPP = row({
    id: "dep-2014-pp",
    cargo: "Deputado Estadual",
    cargo_canonico: "Deputado Estadual",
    periodo_inicio: 2014,
    periodo_fim: 2018,
    partido: "PP",
    estado: "RJ",
    observacoes: null,
    tipo_evento: "mandato",
  })
  const depPSC = row({
    id: "dep-2016-psc",
    cargo: "Deputado Estadual",
    cargo_canonico: "Deputado Estadual",
    periodo_inicio: 2016,
    periodo_fim: 2019,
    partido: "PSC",
    estado: "RJ",
    observacoes: null,
    tipo_evento: "mandato",
  })
  const out = normalizeHistoricoPoliticoForDisplay([depPP, depPSC])
  assert.equal(out.length, 2)
  const ppRow = out.find((r) => r.partido === "PP")
  const pscRow = out.find((r) => r.partido === "PSC")
  assert.ok(ppRow && pscRow)
  assert.equal(ppRow.periodo_inicio, 2014)
  assert.equal(ppRow.periodo_fim, 2016, "PP mandate should be truncated to where PSC starts")
  assert.equal(pscRow.periodo_inicio, 2016)
  assert.equal(pscRow.periodo_fim, 2019)
})

test("normalizeHistoricoPoliticoForDisplay does not truncate same-party overlaps", () => {
  const dep1 = row({
    id: "dep-2014",
    cargo: "Deputado Federal",
    cargo_canonico: "Deputado Federal",
    periodo_inicio: 2014,
    periodo_fim: 2018,
    partido: "PT",
    estado: "SP",
    tipo_evento: "mandato",
  })
  const dep2 = row({
    id: "dep-2016",
    cargo: "Deputado Federal",
    cargo_canonico: "Deputado Federal",
    periodo_inicio: 2016,
    periodo_fim: 2020,
    partido: "PT",
    estado: "SP",
    tipo_evento: "mandato",
  })
  const out = normalizeHistoricoPoliticoForDisplay([dep1, dep2])
  const first = out.find((r) => r.id === "dep-2014")
  assert.ok(first)
  assert.equal(first.periodo_fim, 2018, "Same-party overlap should not be truncated")
})

test("countHistoricoSemanticOverlaps counts overlapping same-cargo different-party pairs", () => {
  const rows = [
    row({ id: "a", cargo_canonico: "Deputado Estadual", periodo_inicio: 2014, periodo_fim: 2018, partido: "PP" }),
    row({ id: "b", cargo_canonico: "Deputado Estadual", periodo_inicio: 2016, periodo_fim: 2019, partido: "PSC" }),
    row({ id: "c", cargo_canonico: "Senador", periodo_inicio: 2019, periodo_fim: null, partido: "PL" }),
  ]
  assert.equal(countHistoricoSemanticOverlaps(rows), 1)
})

test("countHistoricoSemanticOverlaps returns 0 for non-overlapping periods", () => {
  const rows = [
    row({ id: "a", cargo_canonico: "Deputado Estadual", periodo_inicio: 2014, periodo_fim: 2016, partido: "PP" }),
    row({ id: "b", cargo_canonico: "Deputado Estadual", periodo_inicio: 2016, periodo_fim: 2019, partido: "PSC" }),
  ]
  assert.equal(countHistoricoSemanticOverlaps(rows), 0)
})

test("countHistoricoSemanticOverlaps ignores same-party overlaps", () => {
  const rows = [
    row({ id: "a", cargo_canonico: "Deputado Federal", periodo_inicio: 2014, periodo_fim: 2018, partido: "PT" }),
    row({ id: "b", cargo_canonico: "Deputado Federal", periodo_inicio: 2016, periodo_fim: 2020, partido: "PT" }),
  ]
  assert.equal(countHistoricoSemanticOverlaps(rows), 0)
})

test("hasWideManualOverlappingSegmentedMandates returns false for empty list", () => {
  assert.equal(hasWideManualOverlappingSegmentedMandates([]), false)
})

test("hasWideManualOverlappingSegmentedMandates returns false for short consecutive mandates", () => {
  const rows = [
    row({ id: "a", cargo_canonico: "Deputado Federal", periodo_inicio: 2014, periodo_fim: 2018, partido: "PT" }),
    row({ id: "b", cargo_canonico: "Deputado Federal", periodo_inicio: 2018, periodo_fim: 2022, partido: "PT" }),
    row({ id: "c", cargo_canonico: "Deputado Federal", periodo_inicio: 2022, periodo_fim: 2026, partido: "PT" }),
  ]
  assert.equal(hasWideManualOverlappingSegmentedMandates(rows), false)
})

test("hasWideManualOverlappingSegmentedMandates detects aldo-rebelo wide row + 5 segmented mandates", () => {
  const rows = [
    row({ id: "wide", cargo_canonico: "Deputado Federal", periodo_inicio: 1991, periodo_fim: 2015, partido: "PCdoB" }),
    row({ id: "s1", cargo_canonico: "Deputado Federal", periodo_inicio: 1994, periodo_fim: 1998, partido: "PCdoB" }),
    row({ id: "s2", cargo_canonico: "Deputado Federal", periodo_inicio: 1998, periodo_fim: 2002, partido: "PCdoB" }),
    row({ id: "s3", cargo_canonico: "Deputado Federal", periodo_inicio: 2002, periodo_fim: 2006, partido: "PCdoB" }),
    row({ id: "s4", cargo_canonico: "Deputado Federal", periodo_inicio: 2006, periodo_fim: 2010, partido: "PCdoB" }),
    row({ id: "s5", cargo_canonico: "Deputado Federal", periodo_inicio: 2010, periodo_fim: 2014, partido: "PCdoB" }),
  ]
  assert.equal(hasWideManualOverlappingSegmentedMandates(rows), true)
})

test("hasWideManualOverlappingSegmentedMandates detects with minimum 2 inner segments", () => {
  const rows = [
    row({ id: "wide", cargo_canonico: "Deputado Federal", periodo_inicio: 1991, periodo_fim: 2010, partido: "PCdoB" }),
    row({ id: "s1", cargo_canonico: "Deputado Federal", periodo_inicio: 1994, periodo_fim: 1998, partido: "PCdoB" }),
    row({ id: "s2", cargo_canonico: "Deputado Federal", periodo_inicio: 1998, periodo_fim: 2002, partido: "PCdoB" }),
  ]
  assert.equal(hasWideManualOverlappingSegmentedMandates(rows), true)
})

test("hasWideManualOverlappingSegmentedMandates does NOT trigger with only 1 inner segment", () => {
  const rows = [
    row({ id: "wide", cargo_canonico: "Deputado Federal", periodo_inicio: 1991, periodo_fim: 2010, partido: "PCdoB" }),
    row({ id: "s1", cargo_canonico: "Deputado Federal", periodo_inicio: 1994, periodo_fim: 1998, partido: "PCdoB" }),
  ]
  assert.equal(hasWideManualOverlappingSegmentedMandates(rows), false)
})

test("hasWideManualOverlappingSegmentedMandates ignores rows with null period bounds", () => {
  const rows = [
    row({ id: "open", cargo_canonico: "Deputado Federal", periodo_inicio: 2014, periodo_fim: null, partido: "PT" }),
    row({ id: "closed", cargo_canonico: "Deputado Federal", periodo_inicio: 2010, periodo_fim: 2014, partido: "PT" }),
    row({ id: "closed2", cargo_canonico: "Deputado Federal", periodo_inicio: 2014, periodo_fim: 2018, partido: "PT" }),
  ]
  assert.equal(hasWideManualOverlappingSegmentedMandates(rows), false)
})

test("hasWideManualOverlappingSegmentedMandates ignores candidatura rows", () => {
  const rows = [
    row({ id: "wide", cargo_canonico: "Deputado Federal", periodo_inicio: 1991, periodo_fim: 2015, partido: "PCdoB" }),
    row({ id: "cand1", cargo_canonico: "Deputado Federal", periodo_inicio: 2000, periodo_fim: 2000, tipo_evento: "candidatura", observacoes: "TSE 2000" }),
    row({ id: "cand2", cargo_canonico: "Deputado Federal", periodo_inicio: 2004, periodo_fim: 2004, tipo_evento: "candidatura", observacoes: "TSE 2004" }),
  ]
  // Wide row exists but inner rows are candidaturas (excluded). No wide+segmented pattern.
  assert.equal(hasWideManualOverlappingSegmentedMandates(rows), false)
})

test("hasWideManualOverlappingSegmentedMandates ignores rows below 12-year threshold", () => {
  const rows = [
    row({ id: "medium", cargo_canonico: "Deputado Federal", periodo_inicio: 2010, periodo_fim: 2018, partido: "PT" }),
    row({ id: "s1", cargo_canonico: "Deputado Federal", periodo_inicio: 2010, periodo_fim: 2014, partido: "PT" }),
    row({ id: "s2", cargo_canonico: "Deputado Federal", periodo_inicio: 2014, periodo_fim: 2018, partido: "PT" }),
  ]
  // medium row has span=8 years, below 12-year threshold
  assert.equal(hasWideManualOverlappingSegmentedMandates(rows), false)
})

test("hasWideManualOverlappingSegmentedMandates does not match across different cargo canons", () => {
  const rows = [
    row({ id: "wide", cargo_canonico: "Deputado Federal", periodo_inicio: 1991, periodo_fim: 2015, partido: "PCdoB" }),
    row({ id: "min1", cargo_canonico: "Ministro do Esporte", periodo_inicio: 2011, periodo_fim: 2014, partido: "PCdoB" }),
    row({ id: "min2", cargo_canonico: "Ministro da Defesa", periodo_inicio: 2015, periodo_fim: 2016, partido: "PCdoB" }),
  ]
  // Wide row alone in its canon group; ministers are different canons. No pattern.
  assert.equal(hasWideManualOverlappingSegmentedMandates(rows), false)
})

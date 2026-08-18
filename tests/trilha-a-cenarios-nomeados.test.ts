import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  formatHistoricoCargoTituloPublico,
  formatHistoricoObservacaoPublica,
  formatHistoricoPeriodoDisplay,
} from "@/lib/historico-display"
import { tipoDePleitoDoCargo } from "@/lib/calendario-eleitoral"
import { ehCargoNaoEletivo } from "@/lib/cargo-nao-eletivo"
import { classificarSobreposicoes } from "@/lib/mandato-precedencia"
import { sanitizeFontePublica, sanitizeObservacaoPublica } from "@/lib/observacao-publica"
import { buildPatrimonioEleicoes, toPublicCandidatoProfileDto } from "@/lib/public-profile-dto"
import { buildTimelineEvents } from "@/lib/timeline-utils"
import {
  buildPublicHistoricoPoliticoDisplayListFromRaw,
  prepareHistoricoPoliticoPublicDisplayList,
  profileTrajetoriaTabBadgeCount,
} from "@/lib/trajetoria-public-display"
import { normalizeHistoricoPoliticoForDisplay } from "@/lib/historico-dedupe"
import type { FichaCandidato, HistoricoPolitico } from "@/lib/types"

/**
 * Os cinco cenários nomeados da nota "PF Ajustes", pelo pipeline REAL de
 * exibição, com as linhas copiadas do banco de produção. O harness que gerou
 * estas expectativas foi conferido contra o DOM ao vivo de
 * puxaficha.com.br/candidato/flavio-bolsonaro e contra o payload de
 * /api/candidato-profile/<slug>.
 */

function linha(over: Partial<HistoricoPolitico> & { id: string }): HistoricoPolitico {
  return {
    candidato_id: "c",
    cargo: "",
    cargo_canonico: null,
    tipo_evento: null,
    periodo_inicio: null,
    periodo_fim: null,
    partido: "",
    estado: "",
    eleito_por: "",
    observacoes: null,
    proveniencia: null,
    ...over,
  } as HistoricoPolitico
}

const CIRO_ID = "2df15aa1-0bd3-4bab-89bf-13d780645e54"
const AMELIO_ID = "75d2da17-ddd3-45f2-9bde-07ed8655034a"
const DAVID_ID = "edddfd43-0528-41eb-977a-feacdbbbe8fc"

function render(rows: HistoricoPolitico[]): Map<string, string> {
  const lista = buildPublicHistoricoPoliticoDisplayListFromRaw(rows)
  return new Map(
    lista.map((item) => [
      `${formatHistoricoCargoTituloPublico(item)}@${item.periodo_inicio}`,
      formatHistoricoPeriodoDisplay(item, lista),
    ]),
  )
}

describe("item 12 — Lula: candidatura indeferida não é derrota, e 2002/2022 não são derrota", () => {
  const lula = [
    linha({ id: "l-1989", cargo: "Presidente", tipo_evento: "candidatura", periodo_inicio: 1989, periodo_fim: 1989, eleito_por: "nao eleito", observacoes: "Candidatura: NÃO ELEITO (TSE 1989).", proveniencia: "tse" }),
    linha({ id: "l-2002", cargo: "Presidente", tipo_evento: "mandato", periodo_inicio: 2002, periodo_fim: null, eleito_por: "voto direto", observacoes: "ELEITO (TSE 2002)", proveniencia: "tse" }),
    linha({ id: "l-2003", cargo: "Presidente da República", tipo_evento: "mandato", periodo_inicio: 2003, periodo_fim: 2006, observacoes: "Importado automaticamente de Wikidata P39", proveniencia: "manual" }),
    linha({ id: "l-2018", cargo: "Presidente", tipo_evento: "candidatura", periodo_inicio: 2018, periodo_fim: 2018, eleito_por: "nao eleito", observacoes: "Candidatura: registro INDEFERIDO pelo TSE (divulgacandcontas 2018, SQ_CANDIDATO 280000625869). Não participou da votação.", proveniencia: "tse" }),
    linha({ id: "l-2022", cargo: "Presidente", tipo_evento: "mandato", periodo_inicio: 2022, periodo_fim: null, eleito_por: "voto direto", observacoes: "ELEITO (TSE 2022)", proveniencia: "tse" }),
    linha({ id: "l-2023", cargo: "Presidente da República", tipo_evento: "mandato", periodo_inicio: 2023, periodo_fim: null, eleito_por: "voto direto", observacoes: "Mandato atual (Planalto + TSE)", proveniencia: "manual" }),
  ]

  it("2018 vira estado próprio de registro indeferido", () => {
    assert.equal(render(lula).get("Candidatura: Presidente@2018"), "2018 - Registro indeferido")
  })

  it("2002 e 2022 deixam de dizer Não Eleito", () => {
    const r = render(lula)
    assert.equal(r.get("Candidatura: Presidente@2002"), "2002 - Eleito")
    assert.equal(r.get("Candidatura: Presidente@2022"), "2022 - Eleito")
  })

  it("1989 continua sendo derrota, porque foi", () => {
    assert.equal(render(lula).get("Candidatura: Presidente@1989"), "1989 - Não Eleito")
  })

  it("o motivo do indeferimento deixa de ser escondido do leitor", () => {
    const obs = formatHistoricoObservacaoPublica(lula[3].observacoes)
    assert.ok(obs?.includes("INDEFERIDO"), "a ficha precisa dizer por quê")
    assert.ok(!obs?.startsWith("Candidatura:"), "prefixo interno não vaza")
  })

  it("observação que só repete o rótulo continua oculta", () => {
    assert.equal(formatHistoricoObservacaoPublica("Candidatura: NÃO ELEITO (TSE 1994)"), null)
    assert.equal(formatHistoricoObservacaoPublica("candidatura: NÃO ELEITO (TSE 1994)"), null)
  })
})

describe("itens 5 e 10 — eleito por QP e ELEITO no raw", () => {
  it("Daciolo 2014: mandato com ELEITO POR QP não é Não Eleito", () => {
    const daciolo = [
      linha({ id: "d-2014", cargo: "Deputado Federal", tipo_evento: "mandato", periodo_inicio: 2014, periodo_fim: 2014, eleito_por: "voto direto", observacoes: "ELEITO POR QP (TSE 2014)", proveniencia: "tse" }),
      linha({ id: "d-2015", cargo: "Deputado Federal", tipo_evento: "mandato", periodo_inicio: 2015, periodo_fim: 2019, eleito_por: "voto direto", observacoes: "Mandato na 55a Legislatura; Camara Dados Abertos id 178938 registra fim de mandato em 31/01/2019.", proveniencia: "manual" }),
    ]
    assert.equal(render(daciolo).get("Deputado Federal@2014"), "2014 - Eleito")
  })

  it("Flávio 2018: o pleito que virou mandato de senador", () => {
    const flavio = [
      linha({ id: "f-2018", cargo: "Senador", tipo_evento: "mandato", periodo_inicio: 2018, periodo_fim: null, eleito_por: "voto direto", observacoes: "ELEITO (TSE 2018)", proveniencia: "tse" }),
      linha({ id: "f-2019", cargo: "Senador", tipo_evento: "mandato", periodo_inicio: 2019, periodo_fim: null, eleito_por: "voto direto", observacoes: "Mandato federal; posse no Senado (Senado Dados Abertos)", proveniencia: "manual" }),
    ]
    const r = render(flavio)
    assert.equal(r.get("Candidatura: Senador@2018"), "2018 - Eleito")
    assert.equal(r.get("Senador@2019"), "2019 - atual")
  })
})

describe("item 13 — cargo de direção partidária", () => {
  const renan = [
    linha({ id: "n-2025", cargo: "Presidente Nacional do Partido Missão", cargo_canonico: "Presidente Nacional do Partido Missão", tipo_evento: "mandato", periodo_inicio: 2025, periodo_fim: null, observacoes: "TSE lista o Partido Missão e Renan como presidente nacional.", proveniencia: "tse" }),
  ]

  it("continua visível na ficha, marcado como não eletivo", () => {
    const titulo = formatHistoricoCargoTituloPublico(renan[0])
    assert.equal(titulo, "Presidente Nacional do Partido Missão · cargo não eletivo")
    assert.ok(!titulo.startsWith("Candidatura:"), "não é pleito")
  })

  it("deixa de inventar uma eleição de 2025 no patrimônio", () => {
    assert.deepEqual(buildPatrimonioEleicoes([], [], renan), [])
  })
})

describe("item 15 — Zema e o ano de posse virando eleição", () => {
  const zema = [
    linha({ id: "z-2018", cargo: "Governador", tipo_evento: "mandato", periodo_inicio: 2018, periodo_fim: null, eleito_por: "voto direto", observacoes: "ELEITO (TSE 2018)", proveniencia: "tse" }),
    linha({ id: "z-2019", cargo: "Governador de Minas Gerais", tipo_evento: "mandato", periodo_inicio: 2019, periodo_fim: 2022, eleito_por: "voto direto", observacoes: "Mandato desde 2019.", proveniencia: "manual" }),
    linha({ id: "z-2022", cargo: "Governador", tipo_evento: "mandato", periodo_inicio: 2022, periodo_fim: null, eleito_por: "voto direto", observacoes: "ELEITO (TSE 2022)", proveniencia: "tse" }),
    linha({ id: "z-2023", cargo: "Governador", tipo_evento: "mandato", periodo_inicio: 2023, periodo_fim: null, eleito_por: "voto direto", observacoes: "ELEITO (TSE 2022); periodo_inicio corrigido 2022->2023 (posse do 2o mandato)", proveniencia: "tse" }),
  ]

  it("2023 sai de Eleições sem dado publicado; 2018 e 2022 ficam", () => {
    const anos = buildPatrimonioEleicoes([], [], zema).map((e) => e.ano)
    assert.deepEqual(anos, [2022, 2018])
    assert.ok(!anos.includes(2023), "não houve eleição em 2023")
  })

  it("as duas eleições vencidas deixam de aparecer como derrota", () => {
    const r = render(zema)
    assert.equal(r.get("Candidatura: Governador@2018"), "2018 - Eleito")
    assert.equal(r.get("Candidatura: Governador@2022"), "2022 - Eleito")
  })
})

describe("posse em ano sem eleição não recebe desfecho (ratinho-junior)", () => {
  it("2003 imprime só o ano, porque a eleição foi em 2002", () => {
    const rows = [
      linha({ id: "r-2003", cargo: "Deputado Estadual", tipo_evento: "mandato", periodo_inicio: 2003, periodo_fim: 2003, eleito_por: "voto direto", observacoes: "Eleito deputado estadual em 2002 pelo PSB (TSE consulta_cand_2002_PR).", proveniencia: "tse" }),
    ]
    assert.equal(render(rows).get("Deputado Estadual@2003"), "2003")
  })
})

/**
 * Regressões da revisão que bloqueou 94ba890. Cada caso real vem acompanhado do
 * sintético equivalente: o caso nomeado prova que aquela ficha ficou certa, o
 * sintético prova que a regra é geral e não um remendo por slug.
 */
describe("regressão: presidência de casa legislativa não é pleito presidencial", () => {
  const pacheco = [
    linha({ id: "p-sen-2018", cargo: "Senador", cargo_canonico: "Senador", tipo_evento: "mandato", periodo_inicio: 2018, periodo_fim: null, estado: "MG", eleito_por: "voto direto", observacoes: "ELEITO (TSE 2018)" }),
    linha({ id: "p-sen-2021", cargo: "Senador", cargo_canonico: "Senador", tipo_evento: "mandato", periodo_inicio: 2021, periodo_fim: null, estado: "MG", eleito_por: "voto direto", observacoes: "Mandato de senador por Minas Gerais; filiação ao PSD em 2021", proveniencia: "manual" }),
    linha({ id: "p-pres-2021", cargo: "Presidente do Senado Federal", cargo_canonico: "Presidente do Senado Federal", tipo_evento: "mandato", periodo_inicio: 2021, periodo_fim: 2023, eleito_por: "", observacoes: "Importado automaticamente de Wikidata P39", proveniencia: "wikidata" }),
  ]

  it("Rodrigo Pacheco: a presidência do Senado não vira pleito presidencial", () => {
    assert.equal(tipoDePleitoDoCargo("Presidente do Senado Federal"), null)
    assert.ok(ehCargoNaoEletivo("Presidente do Senado Federal"))
  })

  it("e por isso não conflita com o mandato de senador que ele exercia", () => {
    const pares = classificarSobreposicoes(pacheco)
    const conflitos = pares.filter((p) => p.classe === "C4_conflito")
    assert.deepEqual(conflitos, [], "presidir o Senado é o mesmo mandato, não um segundo cargo eletivo")
    const lista = buildPublicHistoricoPoliticoDisplayListFromRaw(pacheco)
    for (const item of lista) {
      assert.doesNotMatch(formatHistoricoPeriodoDisplay(item, lista), /período em conferência/)
    }
  })

  it("sintético: as demais casas legislativas seguem a mesma regra", () => {
    for (const cargo of [
      "Presidente da Câmara dos Deputados",
      "Presidente da Assembleia Legislativa do Ceará",
      "Presidente da Alerj",
      "Presidente da Assembleia Legislativa de Roraima",
      "Presidente da Câmara Municipal de Sorocaba",
    ]) {
      assert.equal(tipoDePleitoDoCargo(cargo), null, cargo)
      assert.ok(ehCargoNaoEletivo(cargo), cargo)
    }
  })

  it("sintético: a Presidência da República continua sendo pleito presidencial", () => {
    assert.equal(tipoDePleitoDoCargo("Presidente da República"), "presidencial")
    assert.equal(tipoDePleitoDoCargo("Presidente"), "presidencial")
    assert.equal(tipoDePleitoDoCargo("Vice-Presidente"), "presidencial")
    assert.ok(!ehCargoNaoEletivo("Presidente da República"))
    assert.ok(!ehCargoNaoEletivo("Presidente"))
  })
})

describe("regressão: C1 elimina a duplicata na saída renderizada", () => {
  const ciro = [
    linha({ id: "c-min-fazenda", candidato_id: "2df15aa1-0bd3-4bab-89bf-13d780645e54", cargo: "Ministro da Fazenda", cargo_canonico: "Ministro da Fazenda", tipo_evento: "mandato", periodo_inicio: 1994, periodo_fim: 1995, estado: "", eleito_por: "nomeacao", observacoes: "Governo Itamar Franco", proveniencia: "manual" }),
    linha({ id: "c-min-generico", candidato_id: "2df15aa1-0bd3-4bab-89bf-13d780645e54", cargo: "Ministro", cargo_canonico: "Ministro", tipo_evento: "mandato", periodo_inicio: 1994, periodo_fim: 1995, estado: "", eleito_por: "", observacoes: "Importado automaticamente de Wikidata P39", proveniencia: "wikidata" }),
  ]

  it("Ciro Gomes: só uma das duas linhas sobrevive na ficha", () => {
    const lista = buildPublicHistoricoPoliticoDisplayListFromRaw(ciro)
    const cargos = lista.map((r) => r.cargo)
    assert.deepEqual(cargos, ["Ministro da Fazenda"], "a duplicata tem de sair, não só ser classificada")
  })

  it("a retenção é determinística: fica o cargo mais específico, em qualquer ordem de entrada", () => {
    const direta = buildPublicHistoricoPoliticoDisplayListFromRaw(ciro).map((r) => r.id)
    const invertida = buildPublicHistoricoPoliticoDisplayListFromRaw([...ciro].reverse()).map((r) => r.id)
    assert.deepEqual(direta, ["c-min-fazenda"])
    assert.deepEqual(invertida, direta, "ordem de entrada não pode decidir quem fica")
  })

  it("sintético: par fora da tabela curada NÃO é fundido", () => {
    const naoCurado = [
      linha({ id: "x-a", cargo: "Ministro", tipo_evento: "mandato", periodo_inicio: 2003, periodo_fim: 2006, eleito_por: "nomeacao" }),
      linha({ id: "x-b", cargo: "Ministro da Integração Nacional", tipo_evento: "mandato", periodo_inicio: 2003, periodo_fim: 2006, eleito_por: "nomeacao" }),
    ]
    assert.equal(buildPublicHistoricoPoliticoDisplayListFromRaw(naoCurado).length, 2)
  })
})

describe("regressão: sucessão constitucional não vira eleição patrimonial", () => {
  const edilson = [
    linha({ id: "e-vice", cargo: "Vice-Governador", cargo_canonico: "Vice-Governador", tipo_evento: "mandato", periodo_inicio: 2022, periodo_fim: null, estado: "RR", eleito_por: "voto direto", observacoes: "ELEITO (TSE 2022)", proveniencia: "tse" }),
    linha({ id: "e-gov", cargo: "Governador", cargo_canonico: "Governador", tipo_evento: "mandato", periodo_inicio: 2026, periodo_fim: 2026, estado: "RR", eleito_por: "sucessao constitucional", observacoes: "Exercício encerrado em 2026 após decisão do TSE que cassou a chapa.", proveniencia: "tse" }),
  ]

  it("Edilson Damião: 2026 não entra como eleição dele", () => {
    const anos = buildPatrimonioEleicoes([], [], edilson).map((e) => e.ano)
    assert.deepEqual(anos, [2022], "assumiu por sucessão; 2026 ser ano de eleição não faz dele candidato")
  })

  it("sintético: nomeação e eleição interna também ficam fora", () => {
    for (const eleito_por of ["nomeacao", "eleicao interna", "mesa diretora", "sucessao"]) {
      const anos = buildPatrimonioEleicoes([], [], [
        linha({ id: `s-${eleito_por}`, cargo: "Governador", tipo_evento: "mandato", periodo_inicio: 2022, periodo_fim: null, eleito_por, observacoes: "assumiu no curso do mandato", proveniencia: "tse" }),
      ]).map((e) => e.ano)
      assert.deepEqual(anos, [], eleito_por)
    }
  })

  it("sintético: quem foi eleito de verdade continua ancorando o ano", () => {
    const anos = buildPatrimonioEleicoes([], [], [
      linha({ id: "s-ok", cargo: "Governador", tipo_evento: "mandato", periodo_inicio: 2022, periodo_fim: null, eleito_por: "voto direto", observacoes: "ELEITO (TSE 2022)", proveniencia: "tse" }),
    ]).map((e) => e.ano)
    assert.deepEqual(anos, [2022])
  })
})

describe("regressão: situação do registro vence o atalho do ano corrente", () => {
  it("candidatura de 2026 com registro indeferido não é 'Candidato'", () => {
    const rows = [
      linha({ id: "f-2026", cargo: "Governador", tipo_evento: "candidatura", periodo_inicio: 2026, periodo_fim: 2026, eleito_por: "", observacoes: "Candidatura: registro INDEFERIDO pelo TSE em 2026.", proveniencia: "tse" }),
    ]
    assert.equal(render(rows).get("Candidatura: Governador@2026"), "2026 - Registro indeferido")
  })

  it("sintético: cancelado e inapto seguem a mesma regra", () => {
    for (const [obs, esperado] of [
      ["Registro cancelado pelo TSE em 2026.", "Registro cancelado"],
      ["TSE registra situacao INAPTO para 2026.", "Registro inapto"],
    ] as const) {
      const rows = [linha({ id: `g-${esperado}`, cargo: "Senador", tipo_evento: "candidatura", periodo_inicio: 2026, periodo_fim: 2026, observacoes: obs, proveniencia: "tse" })]
      assert.equal(render(rows).get("Candidatura: Senador@2026"), `2026 - ${esperado}`)
    }
  })

  it("pré-candidatura sem situação adversa vira Candidato (pós-prazo, 16/08)", () => {
    const rows = [
      linha({ id: "h-2026", cargo: "Presidente", tipo_evento: "candidatura", periodo_inicio: 2026, periodo_fim: null, observacoes: "pré-candidatura à Presidência em 2026", proveniencia: "manual" }),
    ]
    assert.equal(render(rows).get("Candidatura: Presidente@2026"), "Candidato")
  })
})

describe("contrato: sanitização pública única das observações", () => {
  // Observação REAL da linha do Lula 2018, copiada do banco. Ela passou a ser
  // EXIBIDA na ficha (antes ficava escondida), então o identificador interno
  // que vinha nela deixou de ser invisível.
  const OBS_LULA_2018 =
    "Candidatura: registro INDEFERIDO pelo TSE (divulgacandcontas 2018, SQ_CANDIDATO 280000625869, nome de urna LULA, número 13). Não participou da votação."

  it("tira o rótulo E o valor do SQ_CANDIDATO", () => {
    const limpo = sanitizeObservacaoPublica(OBS_LULA_2018) ?? ""
    assert.doesNotMatch(limpo, /280000625869/, "o número do SQ não pode sobreviver")
    assert.doesNotMatch(limpo, /SQ_CANDIDATO/i, "o rótulo interno também sai")
    assert.match(limpo, /identificador oficial do TSE/)
    assert.match(limpo, /INDEFERIDO/, "o motivo, que é o que interessa, permanece")
  })

  it("a mesma limpeza vale no DOM, não só no DTO", () => {
    const publico = formatHistoricoObservacaoPublica(OBS_LULA_2018) ?? ""
    assert.doesNotMatch(publico, /280000625869/)
    assert.doesNotMatch(publico, /SQ_CANDIDATO/i)
  })

  it("sintético: as outras formas do identificador na base", () => {
    for (const bruto of [
      "Candidatura: INDEFERIDO (TSE 2012). SQ 90000012450; fonte consulta_cand_2012.",
      "TSE 2022 SQ_CANDIDATO: 130001701690 confirma reeleicao",
      "identificador oficial do TSE 280000625869 (forma já meio traduzida)",
    ]) {
      const limpo = sanitizeObservacaoPublica(bruto) ?? ""
      assert.doesNotMatch(limpo, /\d{6,}/, `número sobreviveu em: ${limpo}`)
    }
  })

  it("não come número que não é identificador", () => {
    const limpo = sanitizeObservacaoPublica("1º turno: 11.622.321 votos em 1989") ?? ""
    assert.match(limpo, /1989/, "ano tem de ficar")
    assert.match(limpo, /11\.622\.321/, "votação tem de ficar")
  })
})

describe("contrato: timeline agregada usa o mesmo rótulo da ficha", () => {
  function fichaCom(historico: HistoricoPolitico[]): FichaCandidato {
    return { historico } as unknown as FichaCandidato
  }

  it("cargo partidário recebe · cargo não eletivo também na timeline", () => {
    const eventos = buildTimelineEvents(
      fichaCom([
        linha({ id: "t-1", cargo: "Presidente Nacional do Partido Missão", tipo_evento: "mandato", periodo_inicio: 2025, periodo_fim: null }),
      ]),
    ).filter((e) => e.type === "cargo")
    assert.equal(eventos[0].label, "Presidente Nacional do Partido Missão · cargo não eletivo")
  })

  it("presidência interna de casa legislativa também", () => {
    const eventos = buildTimelineEvents(
      fichaCom([
        linha({ id: "t-2", cargo: "Presidente do Senado Federal", tipo_evento: "mandato", periodo_inicio: 2021, periodo_fim: 2023 }),
      ]),
    ).filter((e) => e.type === "cargo")
    assert.equal(eventos[0].label, "Presidente do Senado Federal · cargo não eletivo")
  })

  it("candidatura continua com o prefixo Candidatura:, sem gaguejar", () => {
    const eventos = buildTimelineEvents(
      fichaCom([
        linha({ id: "t-3", cargo: "Candidatura a Vereador", tipo_evento: "candidatura", periodo_inicio: 2020, periodo_fim: 2020, observacoes: "Candidatura: NÃO ELEITO (TSE 2020)" }),
      ]),
    ).filter((e) => e.type === "cargo")
    assert.equal(eventos[0].label, "Candidatura: Vereador")
  })

  it("a timeline não republica o identificador interno na descrição", () => {
    const eventos = buildTimelineEvents(
      fichaCom([
        linha({ id: "t-4", cargo: "Presidente", tipo_evento: "candidatura", periodo_inicio: 2018, periodo_fim: 2018, observacoes: "Candidatura: registro INDEFERIDO pelo TSE (SQ_CANDIDATO 280000625869)." }),
      ]),
    ).filter((e) => e.type === "cargo")
    assert.doesNotMatch(eventos[0].description ?? "", /280000625869/)
  })
})

describe("contrato: API, badge, timeline e DOM mostram as mesmas linhas", () => {
  /**
   * Caminho REAL da página, e não um atalho: o banco entrega linhas cruas, a
   * `api.ts` normaliza, e `prepareHistoricoPoliticoPublicDisplayList` é o
   * contrato único que produz a lista pública. DTO, badge, SSR, overview e aba
   * Trajetória passam por ele; nenhum deles deduplica por conta própria.
   */
  function superficies(raw: HistoricoPolitico[]) {
    const normalizado = normalizeHistoricoPoliticoForDisplay(raw)
    const dom = prepareHistoricoPoliticoPublicDisplayList(normalizado)
    const api = toPublicCandidatoProfileDto({
      historico: normalizado,
    } as unknown as FichaCandidato).historico
    const timeline = buildTimelineEvents({ historico: raw } as unknown as FichaCandidato).filter(
      (e) => e.type === "cargo",
    )
    const badge = profileTrajetoriaTabBadgeCount(normalizado, [])
    return { dom, api, timeline, badge }
  }

  function esperar(nome: string, raw: HistoricoPolitico[], n: number) {
    it(`${nome}: ${n}/${n}/${n}/${n} em API, DOM, timeline e badge`, () => {
      const { dom, api, timeline, badge } = superficies(raw)
      assert.equal(api.length, n, "API")
      assert.equal(dom.length, n, "DOM")
      assert.equal(timeline.length, n, "timeline")
      assert.equal(badge, n, "badge")
      assert.deepEqual(
        api.map((r: { cargo: string }) => r.cargo),
        dom.map((r) => r.cargo),
        "as mesmas linhas, não só a mesma contagem",
      )
    })
  }

  // Ciro Gomes: 11 linhas cruas, uma delas a duplicata "Ministro" que C1 remove.
  const ciro = [
    ...Array.from({ length: 8 }, (_, i) =>
      linha({ id: `ciro-${i}`, candidato_id: CIRO_ID, cargo: `Cargo ${i}`, tipo_evento: "mandato", periodo_inicio: 1960 + i * 2, periodo_fim: 1961 + i * 2 }),
    ),
    linha({ id: "ciro-min-fazenda", candidato_id: CIRO_ID, cargo: "Ministro da Fazenda", tipo_evento: "mandato", periodo_inicio: 1994, periodo_fim: 1995, estado: "", eleito_por: "nomeacao", proveniencia: "manual" }),
    linha({ id: "ciro-min-generico", candidato_id: CIRO_ID, cargo: "Ministro", tipo_evento: "mandato", periodo_inicio: 1994, periodo_fim: 1995, estado: "", proveniencia: "wikidata" }),
    linha({ id: "ciro-dep", candidato_id: CIRO_ID, cargo: "Deputado Federal", tipo_evento: "mandato", periodo_inicio: 2006, periodo_fim: 2010, estado: "CE", eleito_por: "voto direto", observacoes: "ELEITO (TSE 2006)", proveniencia: "tse" }),
  ]
  esperar("Ciro Gomes", ciro, 10)

  // Amélio Cayres: a duplicata é a presidência da ALETO com as duas grafias.
  const amelio = [
    ...Array.from({ length: 8 }, (_, i) =>
      linha({ id: `am-${i}`, candidato_id: AMELIO_ID, cargo: `Cargo ${i}`, tipo_evento: "mandato", periodo_inicio: 1960 + i * 2, periodo_fim: 1961 + i * 2 }),
    ),
    linha({ id: "am-a", candidato_id: AMELIO_ID, cargo: "Presidente da Assembleia Legislativa do Tocantins", tipo_evento: "mandato", periodo_inicio: 2023, periodo_fim: 2025, estado: "" }),
    linha({ id: "am-b", candidato_id: AMELIO_ID, cargo: "presidente da Assembléia Legislativa do Tocantins", tipo_evento: "mandato", periodo_inicio: 2023, periodo_fim: 2025, estado: "" }),
    linha({ id: "am-dep", candidato_id: AMELIO_ID, cargo: "Deputado Estadual", tipo_evento: "mandato", periodo_inicio: 2022, periodo_fim: null, estado: "TO", eleito_por: "voto direto", observacoes: "ELEITO (TSE 2022)" }),
  ]
  esperar("Amélio Cayres", amelio, 10)

  // David Almeida com as linhas REAIS do banco: 12 cruas, e a duplicata é a
  // presidência da ALEAM registrada duas vezes pelo Wikidata, com e sem acento.
  // A fixture genérica anterior tinha 11 cargos inventados e nenhuma duplicata,
  // então provava contagem e não provava deduplicação.
  const david = [
    linha({ id: "dv-1", candidato_id: DAVID_ID, cargo: "Vereador", cargo_canonico: "Vereador", tipo_evento: "candidatura", periodo_inicio: 2004, periodo_fim: 2004, estado: "AM", observacoes: "Candidatura: SUPLENTE (TSE 2004)", proveniencia: "tse" }),
    linha({ id: "dv-2", candidato_id: DAVID_ID, cargo: "Deputado Estadual", cargo_canonico: "Deputado Estadual", tipo_evento: "mandato", periodo_inicio: 2006, periodo_fim: 2010, estado: "AM", eleito_por: "voto direto", observacoes: "ELEITO (TSE 2006)", proveniencia: "tse" }),
    linha({ id: "dv-3", candidato_id: DAVID_ID, cargo: "Deputado Estadual", cargo_canonico: "Deputado Estadual", tipo_evento: "mandato", periodo_inicio: 2010, periodo_fim: 2014, estado: "AM", eleito_por: "voto direto", observacoes: "ELEITO (TSE 2010)", proveniencia: "tse" }),
    linha({ id: "dv-4", candidato_id: DAVID_ID, cargo: "Deputado Estadual", cargo_canonico: "Deputado Estadual", tipo_evento: "mandato", periodo_inicio: 2014, periodo_fim: 2018, estado: "AM", eleito_por: "voto direto", observacoes: "ELEITO POR QP (TSE 2014)", proveniencia: "tse" }),
    linha({ id: "dv-5", candidato_id: DAVID_ID, cargo: "Presidente da Assembleia Legislativa do Amazonas", cargo_canonico: "Presidente da Assembleia Legislativa do Amazonas", tipo_evento: "mandato", periodo_inicio: 2017, periodo_fim: 2019, estado: "AM", observacoes: "Importado automaticamente de Wikidata P39 em 2026-04-06", proveniencia: "wikidata" }),
    linha({ id: "dv-6", candidato_id: DAVID_ID, cargo: "presidente da Assembléia Legislativa do Amazonas", cargo_canonico: "presidente da Assembléia Legislativa do Amazonas", tipo_evento: "mandato", periodo_inicio: 2017, periodo_fim: 2019, estado: "AM", observacoes: "Importado automaticamente de Wikidata P39 em 2026-08-05", proveniencia: "wikidata" }),
    linha({ id: "dv-7", candidato_id: DAVID_ID, cargo: "Governador", cargo_canonico: "Governador", tipo_evento: "candidatura", periodo_inicio: 2018, periodo_fim: 2018, estado: "AM", observacoes: "Candidatura: NÃO ELEITO (TSE 2018)", proveniencia: "tse" }),
    linha({ id: "dv-8", candidato_id: DAVID_ID, cargo: "Prefeito", cargo_canonico: "Prefeito", tipo_evento: "mandato", periodo_inicio: 2020, periodo_fim: 2021, estado: "AM", eleito_por: "voto direto", observacoes: "ELEITO (TSE 2020)", proveniencia: "tse" }),
    linha({ id: "dv-9", candidato_id: DAVID_ID, cargo: "Vereador", cargo_canonico: "Vereador", tipo_evento: "candidatura", periodo_inicio: 2020, periodo_fim: 2020, estado: "PE", observacoes: "Candidatura: SUPLENTE (TSE 2020)", proveniencia: "tse" }),
    linha({ id: "dv-10", candidato_id: DAVID_ID, cargo: "Prefeito", cargo_canonico: "Prefeito", tipo_evento: "mandato", periodo_inicio: 2021, periodo_fim: 2026, estado: "AM", eleito_por: "voto direto", observacoes: "Renunciou à Prefeitura de Manaus em 31/03/2026.", proveniencia: "manual" }),
    linha({ id: "dv-11", candidato_id: DAVID_ID, cargo: "Prefeito", cargo_canonico: "Prefeito", tipo_evento: "mandato", periodo_inicio: 2024, periodo_fim: null, estado: "AM", eleito_por: "voto direto", observacoes: "ELEITO (TSE 2024)", proveniencia: "tse" }),
    linha({ id: "dv-12", candidato_id: DAVID_ID, cargo: "Prefeito", cargo_canonico: "Prefeito", tipo_evento: "mandato", periodo_inicio: 2025, periodo_fim: 2028, observacoes: "Importado automaticamente de Wikidata P39 em 2026-08-05", proveniencia: "wikidata" }),
  ]
  esperar("David Almeida", david, 11)

  it("David Almeida: a duplicata removida é a da ALEAM, e é a única removida", () => {
    const normalizado = normalizeHistoricoPoliticoForDisplay(david)
    const publica = prepareHistoricoPoliticoPublicDisplayList(normalizado)
    const removidos = normalizado
      .filter((r) => !publica.some((p) => p.id === r.id))
      .map((r) => r.cargo)
    assert.deepEqual(removidos, ["presidente da Assembléia Legislativa do Amazonas"])
    assert.ok(
      publica.some((r) => r.cargo === "Presidente da Assembleia Legislativa do Amazonas"),
      "o lado que fica é o de grafia canónica",
    )
  })
})

describe("contrato: URL de fonte sobrevive byte a byte", () => {
  // A primeira versão preservava só o caso de 12 dígitos, que foi o que testei.
  // Estes três quebravam em silêncio: a máscara de CPF/CNPJ casa 11 e 14
  // dígitos, e a query `SQ_CANDIDATO=` casava a regra de rótulo com valor.
  const URLS = [
    "https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2022/BR/2040602022/candidato/28000160782",
    "https://x.tse.jus.br/c/280001607829",
    "https://x.tse.jus.br/c/28000160782912",
    "https://x.tse.jus.br/api?SQ_CANDIDATO=280000625869&ano=2018",
  ]

  for (const url of URLS) {
    it(`preserva ${url.slice(0, 52)}…`, () => {
      const texto = `Registro indeferido. SQ_CANDIDATO 280000625869. Fonte: ${url}`
      const limpo = sanitizeObservacaoPublica(texto) ?? ""
      assert.ok(limpo.includes(url), "a URL tem de sair idêntica")
      assert.doesNotMatch(
        limpo.replace(url, ""),
        /280000625869|SQ_CANDIDATO/,
        "e o identificador FORA da URL tem de sumir",
      )
    })
  }

  it("preserva várias URLs no mesmo texto, na ordem certa", () => {
    const texto = `a ${URLS[0]} b ${URLS[1]} c ${URLS[2]} d ${URLS[3]} e`
    assert.equal(sanitizeObservacaoPublica(texto), texto)
  })

  it("id solto fora de URL sai, inclusive em fonte_dados", () => {
    assert.doesNotMatch(
      sanitizeFontePublica("TSE DivulgaCandContas 2022 id 270001654140") ?? "",
      /270001654140/,
    )
    assert.equal(
      sanitizeFontePublica(URLS[1]),
      URLS[1],
      "fonte que é só URL não pode ser tocada",
    )
  })
})

describe("contrato: C1 é vinculada à ficha, não ao par de rótulos", () => {
  const parDoCiro = (candidatoId: string) => [
    linha({ id: "a", candidato_id: candidatoId, cargo: "Ministro da Fazenda", tipo_evento: "mandato", periodo_inicio: 1994, periodo_fim: 1995, estado: "" }),
    linha({ id: "b", candidato_id: candidatoId, cargo: "Ministro", tipo_evento: "mandato", periodo_inicio: 1994, periodo_fim: 1995, estado: "" }),
  ]

  it("funde na ficha onde a equivalência foi comprovada", () => {
    const pares = classificarSobreposicoes(parDoCiro("2df15aa1-0bd3-4bab-89bf-13d780645e54"))
    assert.equal(pares[0]?.classe, "C1_duplicata")
  })

  it("FALHA FECHADO: mesmo cargo e mesmo período em OUTRA ficha não deduplica", () => {
    const outra = parDoCiro("00000000-0000-0000-0000-000000000000")
    const pares = classificarSobreposicoes(outra)
    assert.equal(
      pares[0]?.classe,
      "C6_nao_classificada",
      "sem dois cargos eletivos, ausência de regra positiva não prova conflito",
    )
    assert.equal(
      buildPublicHistoricoPoliticoDisplayListFromRaw(outra).length,
      2,
      "e as duas linhas continuam na ficha",
    )
  })

  it("linhas de candidatos diferentes nunca formam par", () => {
    const misto = [
      linha({ id: "x", candidato_id: "aaa", cargo: "Ministro da Fazenda", tipo_evento: "mandato", periodo_inicio: 1994, periodo_fim: 1995 }),
      linha({ id: "y", candidato_id: "bbb", cargo: "Ministro", tipo_evento: "mandato", periodo_inicio: 1994, periodo_fim: 1995 }),
    ]
    assert.notEqual(classificarSobreposicoes(misto)[0]?.classe, "C1_duplicata")
  })
})

describe("contrato: André Kamai e os diacríticos", () => {
  it("direção partidária sem a palavra 'partido' é acumulação, não conflito", () => {
    const kamai = [
      linha({ id: "k-pt", candidato_id: "k", cargo: "Presidente estadual do PT-AC", tipo_evento: "mandato", periodo_inicio: 2025, periodo_fim: null, observacoes: "eleicao para a presidencia estadual do PT no Acre", eleito_por: "eleicao partidaria" }),
      linha({ id: "k-ver", candidato_id: "k", cargo: "Vereador", tipo_evento: "mandato", periodo_inicio: 2025, periodo_fim: null, eleito_por: "voto direto", observacoes: "ELEITO (TSE 2024)" }),
    ]
    assert.equal(classificarSobreposicoes(kamai)[0]?.classe, "C5_acumulacao_permitida")
    const lista = buildPublicHistoricoPoliticoDisplayListFromRaw(kamai)
    for (const item of lista) {
      assert.doesNotMatch(formatHistoricoPeriodoDisplay(item, lista), /período em conferência/)
    }
  })

  it("Assembleia e Assembléia são a mesma casa", () => {
    for (const cargo of [
      "Presidente da Assembleia Legislativa do Tocantins",
      "presidente da Assembléia Legislativa do Tocantins",
    ]) {
      const par = [
        linha({ id: `d-${cargo}`, candidato_id: "z", cargo, tipo_evento: "mandato", periodo_inicio: 2023, periodo_fim: 2025 }),
        linha({ id: "d-dep", candidato_id: "z", cargo: "Deputado Estadual", tipo_evento: "mandato", periodo_inicio: 2022, periodo_fim: null, eleito_por: "voto direto", observacoes: "ELEITO (TSE 2022)" }),
      ]
      assert.equal(classificarSobreposicoes(par)[0]?.classe, "C5_acumulacao_permitida", cargo)
    }
  })
})

describe("item 10 — precedência entre mandatos sobrepostos", () => {
  it("C1: equivalência comprovada linha a linha funde a duplicata", () => {
    const pares = classificarSobreposicoes([
      linha({ id: "m-a", candidato_id: "2df15aa1-0bd3-4bab-89bf-13d780645e54", cargo: "Ministro", periodo_inicio: 1994, periodo_fim: 1995, tipo_evento: "mandato", eleito_por: "nomeacao" }),
      linha({ id: "m-b", candidato_id: "2df15aa1-0bd3-4bab-89bf-13d780645e54", cargo: "Ministro da Fazenda", periodo_inicio: 1994, periodo_fim: 1995, tipo_evento: "mandato", eleito_por: "nomeacao" }),
    ])
    assert.equal(pares.length, 1)
    assert.equal(pares[0].classe, "C1_duplicata")
  })

  it("relação genérica entre cargos NÃO autoriza merge: cai em conflito", () => {
    const pares = classificarSobreposicoes([
      linha({ id: "g-a", cargo: "Deputado Federal", periodo_inicio: 2010, periodo_fim: 2018, tipo_evento: "mandato", eleito_por: "voto direto" }),
      linha({ id: "g-b", cargo: "Deputado Federal", periodo_inicio: 2014, periodo_fim: 2018, tipo_evento: "mandato", eleito_por: "voto direto" }),
    ])
    assert.equal(pares[0].classe, "C4_conflito")
  })

  it("C4: dois cargos eletivos sobrepostos permanecem como trechos, sem selo interno", () => {
    const rows = [
      linha({ id: "t-a", cargo: "Prefeito", periodo_inicio: 2012, periodo_fim: 2016, tipo_evento: "mandato", eleito_por: "voto direto" }),
      linha({ id: "t-b", cargo: "Deputado Federal", periodo_inicio: 2010, periodo_fim: 2014, tipo_evento: "mandato", eleito_por: "voto direto" }),
    ]
    assert.equal(classificarSobreposicoes(rows)[0].classe, "C4_conflito")
    const lista = buildPublicHistoricoPoliticoDisplayListFromRaw(rows)
    assert.equal(lista.length, 2)
    for (const item of lista) {
      assert.doesNotMatch(formatHistoricoPeriodoDisplay(item, lista), /conferência|curadoria/i)
    }
  })

  it("C5: eletivo com cargo nomeado é acumulação permitida, não defeito", () => {
    const pares = classificarSobreposicoes([
      linha({ id: "a-a", cargo: "Deputado Federal", periodo_inicio: 2014, periodo_fim: 2018, tipo_evento: "mandato", eleito_por: "voto direto" }),
      linha({ id: "a-b", cargo: "Chefe de Gabinete do Governo de Pernambuco", periodo_inicio: 2016, periodo_fim: 2018, tipo_evento: "mandato", eleito_por: "nomeacao" }),
    ])
    assert.equal(pares[0].classe, "C5_acumulacao_permitida")
  })

  it("encosto de fronteira não é sobreposição", () => {
    assert.deepEqual(
      classificarSobreposicoes([
        linha({ id: "b-a", cargo: "Deputado Estadual", periodo_inicio: 2014, periodo_fim: 2018, tipo_evento: "mandato", eleito_por: "voto direto" }),
        linha({ id: "b-b", cargo: "Deputado Estadual", periodo_inicio: 2018, periodo_fim: 2022, tipo_evento: "mandato", eleito_por: "voto direto" }),
      ]),
      [],
    )
  })

  it("trava anti-invenção: a classificação não escreve data nenhuma", () => {
    const rows = [
      linha({ id: "i-a", cargo: "Prefeito", periodo_inicio: 2012, periodo_fim: 2016, tipo_evento: "mandato", eleito_por: "voto direto" }),
      linha({ id: "i-b", cargo: "Deputado Federal", periodo_inicio: 2010, periodo_fim: 2014, tipo_evento: "mandato", eleito_por: "voto direto" }),
    ]
    const antes = rows.map((r) => `${r.id}:${r.periodo_inicio}:${r.periodo_fim}`)
    classificarSobreposicoes(rows)
    assert.deepEqual(rows.map((r) => `${r.id}:${r.periodo_inicio}:${r.periodo_fim}`), antes)
  })
})

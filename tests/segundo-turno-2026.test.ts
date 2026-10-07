// cspell:ignore flavio cury celulas comparavel
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import type { CandidatoResultado1Turno, DisputaResultado1Turno } from "../src/lib/resultados-1turno"
import type { StatePollScenario } from "../src/lib/state-polls"
import {
  diasAte2Turno,
  finalistasDaDisputa,
  formatarDataPesquisa,
  montarLadoALado,
  montarLadoALadoExtra,
  rotuloContagem2Turno,
  minutosAte2Turno,
  rotuloContagemRegressiva2Turno,
  selecionarPesquisasDoConfronto,
  SEM_DADO,
  SEM_DADO_VERIFICADO,
  slugsDoSegundoTurno,
  type FichaLadoALadoExtra,
} from "../src/lib/segundo-turno-2026"
import { COMPARADOR_NAO_SE_APLICA } from "../src/lib/comparador-display"
import { PATRIMONIO_ATIPICO_ROTULO } from "../src/lib/patrimonio-atipico"

function candidato(parcial: Partial<CandidatoResultado1Turno> & Pick<CandidatoResultado1Turno, "sq" | "nome_urna">): CandidatoResultado1Turno {
  return {
    numero: "10",
    nome: parcial.nome_urna,
    partido: "ABC",
    votos: 1000,
    percentual_validos: 40,
    posicao: 1,
    situacao_tse: "2º turno",
    destinacao: "Válido",
    fase: "segundo_turno",
    slug: parcial.nome_urna.toLowerCase(),
    companheiros: [],
    ...parcial,
  }
}

function disputa(candidatos: CandidatoResultado1Turno[]): DisputaResultado1Turno {
  return { candidatos } as unknown as DisputaResultado1Turno
}

function poll(id: string, data: string, resultados: Array<[string, string | null, number | null]>, turn: 1 | 2 = 2): StatePollScenario {
  return {
    id,
    instituto: { value: "Instituto X", status: "publicado" },
    sourceStatus: "aprovado",
    state: "publicado",
    publicationDate: { value: data, status: "publicado" },
    fieldwork: { start: { value: data, status: "publicado" }, end: { value: data, status: "publicado" } },
    marginErrorPp: { value: 1.8, status: "publicado" },
    contratante: { value: null, status: "publicado" },
    sample: { size: { value: 2000, status: "publicado" }, population: { value: "eleitores", status: "publicado" } },
    confidencePercent: { value: 95, status: "publicado" },
    method: { value: "presencial", status: "publicado" },
    registration: { code: { value: "BR-00000/2026", status: "publicado" }, url: { value: null, status: "publicado" } },
    provenance: { resultUrl: `https://exemplo.org/${id}` },
    scenario: {
      id: `${id}-c`,
      turn,
      question: { value: null, status: "publicado" },
      resultados: resultados.map(([rawLabel, candidateSlug, valuePercent]) => ({
        rawLabel,
        candidateSlug,
        valuePercent,
        matchStatus: candidateSlug ? "exact_alias" : "not_candidate",
        status: "publicado",
      })),
    },
  } as unknown as StatePollScenario
}

describe("contagem até o 2º turno", () => {
  it("conta dias de calendário de Brasília, inclusive na virada do dia em UTC", () => {
    assert.equal(diasAte2Turno("2026-10-05T12:00:00Z"), 20)
    // 01:30 UTC de 06/10 ainda é 05/10 em Brasília.
    assert.equal(diasAte2Turno("2026-10-06T01:30:00Z"), 20)
    assert.equal(diasAte2Turno("2026-10-25T03:00:00Z"), 0)
    assert.equal(diasAte2Turno("2026-10-27T12:00:00Z"), -2)
    assert.equal(diasAte2Turno("não é data"), null)
  })

  it("rótulo singular, plural, dia da votação e some depois", () => {
    assert.equal(rotuloContagem2Turno(20), "Faltam 20 dias")
    assert.equal(rotuloContagem2Turno(1), "Falta 1 dia")
    assert.equal(rotuloContagem2Turno(0), "É hoje")
    assert.equal(rotuloContagem2Turno(-1), null)
    assert.equal(rotuloContagem2Turno(null), null)
  })

  it("minutos até a abertura das seções, 8h de Brasília em 25/10", () => {
    // 05/10 12:00 em Brasília: 19 dias e 20 horas até 25/10 8:00.
    assert.equal(minutosAte2Turno("2026-10-05T15:00:00Z"), 19 * 1440 + 20 * 60)
    assert.equal(minutosAte2Turno("2026-10-25T10:59:30Z"), 1)
    assert.equal(minutosAte2Turno("2026-10-25T11:00:00Z"), 0)
    assert.ok((minutosAte2Turno("2026-10-25T15:00:00Z") ?? 0) < 0)
    assert.equal(minutosAte2Turno("não é data"), null)
  })

  it("contagem regressiva longa e curta, singular, dia da votação e some depois", () => {
    const m = (d: number, h: number, min: number) => d * 1440 + h * 60 + min
    assert.equal(rotuloContagemRegressiva2Turno(m(18, 4, 32), 18), "Faltam 18 dias, 4 horas e 32 minutos")
    assert.equal(rotuloContagemRegressiva2Turno(m(1, 1, 1), 1), "Faltam 1 dia, 1 hora e 1 minuto")
    assert.equal(rotuloContagemRegressiva2Turno(m(2, 0, 5), 2), "Faltam 2 dias, 0 horas e 5 minutos")
    assert.equal(rotuloContagemRegressiva2Turno(m(0, 3, 0), 0), "Faltam 3 horas e 0 minutos")
    assert.equal(rotuloContagemRegressiva2Turno(1, 0), "Falta 1 minuto")
    assert.equal(rotuloContagemRegressiva2Turno(m(18, 4, 2), 18, true), "18d 04h 02m")
    assert.equal(rotuloContagemRegressiva2Turno(m(0, 3, 7), 0, true), "3h 07m")
    assert.equal(rotuloContagemRegressiva2Turno(9, 0, true), "9m")
    assert.equal(rotuloContagemRegressiva2Turno(0, 0), "É hoje")
    assert.equal(rotuloContagemRegressiva2Turno(-120, 0, true), "Hoje")
    assert.equal(rotuloContagemRegressiva2Turno(-1440, -1), null)
    assert.equal(rotuloContagemRegressiva2Turno(null, null), null)
  })

  it("o componente lê o relógio do servidor na hidratação e não chama new Date() no render", () => {
    const fonte = readFileSync("src/components/ContagemSegundoTurno.tsx", "utf8")
    assert.match(fonte, /useSyncExternalStore\(/)
    assert.match(fonte, /\(\) => diasAte2Turno\(referenceNow\)/)
    assert.match(fonte, /\(\) => minutosAte2Turno\(referenceNow\)/)
    assert.doesNotMatch(fonte, /new Date\(\)/)
  })
})

describe("lado a lado dos finalistas", () => {
  const a = candidato({ sq: "1", nome_urna: "Alfa", companheiros: [{ tipo: "v", nome: "Vice Alfa", partido: "DEF" }] })
  const b = candidato({ sq: "2", nome_urna: "Beta", percentual_validos: 35, votos: 900, numero: "22" })

  it("só monta com exatamente dois finalistas", () => {
    assert.deepEqual(finalistasDaDisputa(disputa([a, b])), [a, b])
    assert.equal(finalistasDaDisputa(disputa([a])), null)
    assert.equal(finalistasDaDisputa(null), null)
  })

  it("linhas alinhadas, sem dado explícito e nada inventado", () => {
    const linhas = montarLadoALado([a, b], [
      { patrimonio: 1234.5, patrimonioAtipico: true, processos: 3, pontosAtencao: 0 },
      undefined,
    ])
    assert.deepEqual(linhas.map((l) => l.id), ["resultado", "partido", "vice", "patrimonio", "processos", "pontos"])
    const porId = Object.fromEntries(linhas.map((l) => [l.id, l.celulas]))
    assert.equal(porId.resultado[0].valor, "40,00%")
    assert.equal(porId.resultado[1].detalhe, "900 votos")
    assert.equal(porId.vice[0].valor, "Vice Alfa")
    assert.equal(porId.vice[0].detalhe, "DEF")
    assert.equal(porId.vice[1].valor, SEM_DADO)
    assert.equal(porId.vice[1].semDado, true)
    assert.match(porId.patrimonio[0].valor, /^R\$\s1\.235$/)
    assert.equal(porId.patrimonio[0].detalhe, PATRIMONIO_ATIPICO_ROTULO)
    assert.equal(porId.patrimonio[1].valor, SEM_DADO)
    assert.equal(porId.processos[0].valor, "3")
    assert.equal(porId.processos[1].semDado, true)
    assert.equal(porId.pontos[0].valor, "0")
    assert.equal(porId.pontos[0].detalhe, "nenhum publicado na ficha")
    assert.equal(porId.pontos[1].valor, SEM_DADO)
  })

  it("processo disciplinar entra no total com a legenda por partes, como na grade", () => {
    const [, , , , processos] = montarLadoALado([a, b], [
      {
        patrimonio: null,
        patrimonioAtipico: false,
        processos: 7,
        processosContagem: { judiciais: 1, disciplinaresSenado: 6, disciplinaresCamara: 0, disciplinares: 6, total: 7 },
        pontosAtencao: 2,
      },
      { patrimonio: null, patrimonioAtipico: false, processos: 0, pontosAtencao: 1 },
    ])
    assert.equal(processos.celulas[0].valor, "7")
    assert.equal(processos.celulas[0].detalhe, "1 judicial · 6 disciplinares no Senado")
    // Zero sem recibo de busca segue a régua da grade: traço, nunca "0".
    assert.equal(processos.celulas[1].valor, "—")
  })
})

describe("mais informações do lado a lado", () => {
  type Comparavel = NonNullable<FichaLadoALadoExtra["comparavel"]>
  const comparavel = (parcial: Partial<Comparavel> = {}): Comparavel => ({
    cargo_atual: "Senador",
    idade: 45,
    formacao: "SUPERIOR COMPLETO",
    formacao_instituicao: null,
    evolucao_patrimonial_pct: 12.4,
    mudancas_partido: 3,
    mudancas_partido_verificado: true,
    total_gasto_parlamentar: 1_500_000,
    tem_historico_legislativo: true,
    ...parcial,
  })
  const porId = (fichas: [FichaLadoALadoExtra, FichaLadoALadoExtra]) =>
    Object.fromEntries(montarLadoALadoExtra(fichas).map((l) => [l.id, l.celulas]))

  it("monta as linhas com as regras do comparador e da ficha, na ordem dos finalistas", () => {
    const linhas = montarLadoALadoExtra([
      { slug: "alfa", comparavel: comparavel(), profissaoDeclarada: "ADVOGADO" },
      { slug: "beta", comparavel: comparavel({ cargo_atual: null, idade: 70, evolucao_patrimonial_pct: -3.6, total_gasto_parlamentar: null, tem_historico_legislativo: false }), profissaoDeclarada: null },
    ])
    assert.deepEqual(linhas.map((l) => l.id), ["cargo-atual", "idade", "formacao", "profissao", "evolucao", "trocas", "ceap", "congresso"])
    const c = Object.fromEntries(linhas.map((l) => [l.id, l.celulas]))
    assert.equal(c["cargo-atual"][0].valor, "Senador")
    assert.equal(c["cargo-atual"][1].valor, SEM_DADO)
    assert.equal(c["cargo-atual"][1].semDado, true)
    assert.equal(c.idade[1].valor, "70 anos")
    assert.equal(c.formacao[0].valor, "Superior completo")
    // Profissão passa pelo mesmo sanitizador da ficha: caixa alta vira frase.
    assert.equal(c.profissao[0].valor, "Advogado")
    assert.equal(c.profissao[1].valor, SEM_DADO)
    assert.equal(c.evolucao[0].valor, "+12%")
    assert.equal(c.evolucao[1].valor, "-4%")
    assert.equal(c.trocas[0].valor, "3")
    assert.match(c.ceap[0].valor, /^R\$\s1\.500\.000$/)
    assert.equal(c.ceap[0].detalhe, "soma da cota no Congresso")
    // Sem gasto, a régua do comparador: não se aplica, nunca zero.
    assert.equal(c.ceap[1].valor, COMPARADOR_NAO_SE_APLICA)
    assert.equal(c.ceap[1].semDado, true)
    assert.equal(c.congresso[0].valor, "Sim")
    assert.equal(c.congresso[1].valor, SEM_DADO)
  })

  it("troca de partido sem verificação não vira número", () => {
    const c = porId([
      { slug: "alfa", comparavel: comparavel({ mudancas_partido: 0, mudancas_partido_verificado: false }) },
      { slug: "beta", comparavel: comparavel({ mudancas_partido: 2, mudancas_partido_verificado: undefined }) },
    ])
    for (const celula of c.trocas) {
      assert.equal(celula.valor, SEM_DADO_VERIFICADO)
      assert.equal(celula.semDado, true)
      assert.equal(celula.detalhe, undefined)
    }
  })

  it("sem a linha do comparador tudo vira sem dado, e a cota parlamentar some", () => {
    const linhas = montarLadoALadoExtra([{ slug: "alfa" }, { slug: null }])
    assert.deepEqual(linhas.map((l) => l.id), ["cargo-atual", "idade", "formacao", "profissao", "evolucao", "trocas"])
    for (const linha of linhas) {
      for (const celula of linha.celulas) {
        assert.equal(celula.semDado, true, linha.id)
        assert.doesNotMatch(celula.valor, /^0|R\$/, linha.id)
      }
    }
  })

  it("idade zero, texto vazio, QID cru e evolução nula não aparecem como dado", () => {
    const c = porId([
      { slug: "alfa", comparavel: comparavel({ idade: 0, cargo_atual: "   ", formacao: null, evolucao_patrimonial_pct: null }), profissaoDeclarada: "Q42" },
      { slug: "beta", comparavel: comparavel({ evolucao_patrimonial_pct: Number.NaN }), profissaoDeclarada: "  " },
    ])
    assert.equal(c.idade[0].valor, SEM_DADO)
    assert.equal(c["cargo-atual"][0].valor, SEM_DADO)
    assert.equal(c.formacao[0].valor, SEM_DADO)
    assert.equal(c.profissao[0].valor, SEM_DADO)
    assert.equal(c.profissao[1].valor, SEM_DADO)
    assert.equal(c.evolucao[0].valor, SEM_DADO)
    assert.equal(c.evolucao[1].valor, SEM_DADO)
  })

  it("cota parlamentar diz quais anos em revisão ficaram fora do total", () => {
    const c = porId([
      { slug: "dr-daniel", comparavel: comparavel({ total_gasto_parlamentar: 10 }) },
      { slug: "beta", comparavel: comparavel({ total_gasto_parlamentar: null, tem_historico_legislativo: false }) },
    ])
    assert.equal(c.ceap[0].detalhe, "fora do total, em revisão: 2023, 2024, 2025")
  })
})

describe("finalistas ainda na disputa", () => {
  it("lê Presidente e governadores do snapshot, sem repetir e sem slug vazio", () => {
    const data = {
      disputas: [
        disputa([candidato({ sq: "1", nome_urna: "lula" }), candidato({ sq: "2", nome_urna: "flavio" }), candidato({ sq: "3", nome_urna: "outro", fase: "nao_eleito" })]),
        disputa([candidato({ sq: "4", nome_urna: "gov-a" }), candidato({ sq: "5", nome_urna: "gov-b", slug: null })]),
        disputa([candidato({ sq: "6", nome_urna: "eleito", fase: "eleito" })]),
        // Três em segundo_turno não é um duelo válido: fica de fora.
        disputa([candidato({ sq: "7", nome_urna: "x" }), candidato({ sq: "8", nome_urna: "y" }), candidato({ sq: "9", nome_urna: "z" })]),
      ],
    }
    assert.deepEqual(slugsDoSegundoTurno(data), ["flavio", "gov-a", "lula"])
    assert.deepEqual(slugsDoSegundoTurno(null), [])
    assert.deepEqual(slugsDoSegundoTurno({ disputas: [] }), [])
  })
})

describe("pesquisas do confronto", () => {
  const slugs: [string, string] = ["flavio", "lula"]

  it("só cenários de 2º turno com exatamente os dois finalistas, mais recente primeiro, no máximo o limite", () => {
    const polls = [
      poll("p1", "2026-10-07", [["Flávio", "flavio", 45], ["Lula", "lula", 44], ["Branco", null, 8]]),
      poll("p2", "2026-10-12", [["Lula", "lula", 44], ["Flávio", "flavio", 46]]),
      poll("p3", "2026-10-13", [["Cury", "cury", 45], ["Lula", "lula", 42]]),
      poll("p4", "2026-10-14", [["Flávio", "flavio", 30], ["Lula", "lula", 29], ["Cury", "cury", 20]], 1),
      poll("p5", "2026-10-09", [["Flávio", "flavio", null], ["Lula", "lula", 45]]),
      poll("p6", "2026-10-05", [["Flávio", "flavio", 44], ["Lula", "lula", 45]]),
    ]
    const linhas = selecionarPesquisasDoConfronto(polls, slugs, 2)
    assert.deepEqual(linhas.map((l) => l.id), ["p2", "p1"])
    // Percentuais seguem a ordem dos finalistas, não a da fonte.
    assert.deepEqual(linhas[0].percentuais, [46, 44])
    assert.equal(linhas[0].margem, 1.8)
    assert.equal(selecionarPesquisasDoConfronto(polls, slugs).length, 3)
  })

  it("descarta fonte sem https e repete o cenário só uma vez por pesquisa", () => {
    const http = poll("h", "2026-10-16", [["Flávio", "flavio", 45], ["Lula", "lula", 44]])
    ;(http.provenance as { resultUrl: string }).resultUrl = "http://inseguro.org"
    const dup = poll("d", "2026-10-15", [["Flávio", "flavio", 45], ["Lula", "lula", 44]])
    assert.deepEqual(selecionarPesquisasDoConfronto([http, dup, dup], slugs).map((l) => l.id), ["d"])
  })

    it("recusa cenário colhido até o 1º turno e pesquisa ou valor não publicados", () => {
    const antes = poll("antes", "2026-09-16", [["Flávio", "flavio", 45], ["Lula", "lula", 44]])
    const noDia = poll("dia", "2026-10-04", [["Flávio", "flavio", 45], ["Lula", "lula", 44]])
    const rascunho = poll("rasc", "2026-10-10", [["Flávio", "flavio", 45], ["Lula", "lula", 44]])
    ;(rascunho as { state: string }).state = "em_revisao"
    const valorPendente = poll("pend", "2026-10-11", [["Flávio", "flavio", 45], ["Lula", "lula", 44]])
    ;(valorPendente.scenario.resultados[0] as { status: string }).status = "em_revisao"
    const ok = poll("ok", "2026-10-08", [["Flávio", "flavio", 45], ["Lula", "lula", 44]])
    assert.deepEqual(selecionarPesquisasDoConfronto([antes, noDia, rascunho, valorPendente, ok], slugs).map((l) => l.id), ["ok"])
  })

it("data curta em pt-BR e sem dado quando a fonte não publicou", () => {
    assert.match(formatarDataPesquisa("2026-09-17"), /^17 de set\.?$/)
    assert.equal(formatarDataPesquisa(null), SEM_DADO)
  })
})

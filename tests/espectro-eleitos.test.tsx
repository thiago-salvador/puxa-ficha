import assert from "node:assert/strict"
import { test } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import { EspectroEleitos1Turno } from "@/components/EspectroEleitos1Turno"
import { ArcoSenado } from "@/components/EspectroGraficos"
import { Resultado1TurnoBrasil } from "@/components/Resultado1TurnoBrasil"
import { getEspectroPartidario } from "@/data/quiz/espectro-partidario"
import { classeDaMedia, classificarEspectro, contarEspectroEleitos } from "@/lib/espectro-eleitos"
import type {
  BancadaResultado1Turno,
  CandidatoResultado1Turno,
  DisputaResultado1Turno,
  Resultados1Turno,
} from "@/lib/resultados-1turno"

const TOTAIS = {
  secoes: 10,
  secoes_totalizadas: 10,
  eleitorado: 1000,
  comparecimento: 800,
  percentual_comparecimento: 80,
  abstencao: 200,
  percentual_abstencao: 20,
  votos_validos: 700,
  brancos: 50,
  percentual_brancos: 6,
  nulos: 50,
  percentual_nulos: 6,
}

const FONTE = { url: "https://resultados.tse.jus.br/fixture/dados.json", sha256: "0".repeat(64), gerado_tse: "04/10/2026 23:59:59" }

function cand(sq: string, partido: string, fase: CandidatoResultado1Turno["fase"]): CandidatoResultado1Turno {
  return {
    sq,
    numero: "10",
    nome: `Nome ${sq}`,
    nome_urna: `URNA ${sq}`,
    partido,
    votos: 100,
    percentual_validos: 50,
    posicao: 1,
    situacao_tse: "",
    destinacao: "Válido",
    fase,
    slug: null,
    companheiros: [],
  }
}

function disputa(cargo: DisputaResultado1Turno["cargo"], uf: string, vagas: number, candidatos: CandidatoResultado1Turno[], oficial = true): DisputaResultado1Turno {
  return { cargo, uf, vagas, fechamento_oficial: oficial, fase_calculada: false, fonte: FONTE, totais: TOTAIS, candidatos }
}

function bancada(cargo: BancadaResultado1Turno["cargo"], uf: string, vagas: number, partidos: string[], oficial = true): BancadaResultado1Turno {
  return {
    cargo,
    uf,
    vagas,
    fechamento_oficial: oficial,
    fonte: FONTE,
    eleitos: partidos.map((partido, i) => ({ sq: `${cargo}-${uf}-${i}`, nome_urna: `DEP ${i}`, partido })),
  }
}

function dados(parcial: Partial<Resultados1Turno> = {}): Resultados1Turno {
  return {
    versao: 1,
    turno: 1,
    status: "final",
    gerado_em: "2026-10-04T23:59:59.000Z",
    ciclo: "2026",
    eleicoes: { federal: "1", estadual: "2" },
    disputas: [
      // Presidente eleito no fixture só para provar que não entra na conta.
      disputa("Presidente", "BR", 1, [cand("p1", "PT", "eleito")]),
      disputa("Governador", "SP", 1, [cand("g1", "PSOL", "eleito"), cand("g2", "PL", "nao_eleito")]),
      disputa("Governador", "RJ", 1, [cand("g3", "PL", "segundo_turno"), cand("g4", "PT", "segundo_turno")], false),
      disputa("Senador", "SP", 2, [cand("s1", "UNIÃO", "eleito"), cand("s2", "PODE", "eleito")]),
    ],
    bancadas: [
      bancada("Deputado Federal", "SP", 3, ["PL", "PT", "XYZ"]),
      bancada("Deputado Estadual", "SP", 2, ["PSOL", "PRD"]),
      bancada("Deputado Distrital", "DF", 2, ["PC do B"], false),
    ],
    ...parcial,
  }
}

test("limites da classe: abaixo de 4,5 esquerda, 4,5 a 5,5 centro, acima de 5,5 direita", () => {
  assert.equal(classeDaMedia(4.49), "esquerda")
  assert.equal(classeDaMedia(4.5), "centro")
  assert.equal(classeDaMedia(5), "centro")
  assert.equal(classeDaMedia(5.5), "centro")
  assert.equal(classeDaMedia(5.51), "direita")
})

test("siglas do TSE resolvem pelo mapa editorial e classificam", () => {
  const esperado: Record<string, string> = {
    PODE: "centro", // 6 e 5 = 5,5
    UNIÃO: "direita", // 7 e 5
    PCDOB: "esquerda",
    "PC do B": "esquerda",
    REPUBLICANOS: "direita",
    SOLIDARIEDADE: "esquerda", // 5 e 2
    MOBILIZA: "direita", // 6 e 6
    PRD: "direita",
    AGIR: "direita",
    DC: "direita", // 6 e 8
    CIDADANIA: "centro", // 5 e 4 = 4,5
  }
  for (const [sigla, classe] of Object.entries(esperado)) {
    assert.ok(getEspectroPartidario(sigla), `${sigla} deve estar no mapa`)
    assert.equal(classificarEspectro(sigla), classe, sigla)
  }
})

test("partido fora do mapa e sigla vazia ficam sem classificação", () => {
  assert.equal(classificarEspectro("XYZ"), "sem_classificacao")
  assert.equal(classificarEspectro(""), "sem_classificacao")
  assert.equal(classificarEspectro(null), "sem_classificacao")
})

test("conta só eleitos, exclui Presidente e fecha o Total com a soma das linhas", () => {
  const e = contarEspectroEleitos(dados())
  const por = Object.fromEntries(e.linhas.map((l) => [l.cargo, l]))

  // Governador: só SP eleito; RJ foi ao 2º turno e não conta.
  assert.equal(por["Governador"].eleitos, 1)
  assert.equal(por["Governador"].vagas, 2)
  assert.equal(por["Governador"].esquerda, 1)
  assert.equal(por["Senador"].eleitos, 2)
  assert.equal(por["Senador"].direita, 1)
  assert.equal(por["Senador"].centro, 1)
  assert.equal(por["Deputado Federal"].eleitos, 3)
  assert.equal(por["Deputado Federal"].sem_classificacao, 1)
  assert.equal(por["Deputado Estadual e Distrital"].eleitos, 3)
  assert.equal(por["Deputado Estadual e Distrital"].vagas, 4)

  for (const campo of ["eleitos", "vagas", "esquerda", "centro", "direita", "sem_classificacao"] as const) {
    assert.equal(
      e.total[campo],
      e.linhas.reduce((s, l) => s + l[campo], 0),
      `Total.${campo}`,
    )
  }
  assert.equal(e.total.eleitos, 9)
  assert.equal(e.total.eleitos, e.total.esquerda + e.total.centro + e.total.direita + e.total.sem_classificacao)
  // Presidente (PT eleito no fixture) não entra: PT só aparece uma vez, na bancada federal.
  assert.equal(e.total.partidos.find((p) => p.sigla === "PT")?.eleitos, 1)
  assert.equal(e.total.partidos.reduce((s, p) => s + p.eleitos, 0), e.total.eleitos)
})

test("lista as UFs sem todos os eleitos", () => {
  const e = contarEspectroEleitos(dados())
  assert.deepEqual(e.pendencias, [
    { cargo: "Governador", motivo: "segundo_turno", ufs: ["RJ"] },
    { cargo: "Governador", motivo: "sem_fechamento", ufs: ["RJ"] },
    { cargo: "Deputado Estadual e Distrital", motivo: "sem_eleitos", ufs: ["DF"] },
    { cargo: "Deputado Estadual e Distrital", motivo: "sem_fechamento", ufs: ["DF"] },
  ])

  const completo = contarEspectroEleitos(
    dados({
      disputas: [disputa("Governador", "SP", 1, [cand("g1", "PSOL", "eleito")])],
      bancadas: [bancada("Deputado Federal", "SP", 1, ["PL"])],
    }),
  )
  assert.deepEqual(completo.pendencias, [])

  // Menos eleitos que vagas sinaliza pendência mesmo com fechamento oficial.
  const faltando = contarEspectroEleitos(dados({ disputas: [], bancadas: [bancada("Deputado Federal", "AC", 8, ["PL"], true)] }))
  assert.deepEqual(faltando.pendencias, [{ cargo: "Deputado Federal", motivo: "sem_eleitos", ufs: ["AC"] }])
})

test("metodologia conta partidos com os dois eixos documentados e com curadoria, a partir do mapa", () => {
  const e = contarEspectroEleitos(dados())
  const m = e.metodologia
  assert.equal(m.partidos, m.fonte_nos_dois_eixos + m.com_curadoria)
  const classificados = e.total.partidos.filter((p) => getEspectroPartidario(p.sigla))
  assert.equal(m.partidos, classificados.length)
  const documentados = classificados.filter((p) => {
    const x = getEspectroPartidario(p.sigla)!
    return x.fonte_economico.tipo !== "curadoria" && x.fonte_social.tipo !== "curadoria"
  })
  assert.equal(m.fonte_nos_dois_eixos, documentados.length)
})

test("componente mostra os blocos por órgão, a nota de pendência e o link da metodologia", () => {
  const html = renderToStaticMarkup(<EspectroEleitos1Turno data={dados()} />)
  assert.match(html, /id="espectro"/)
  assert.match(html, /Como ficou o poder/)
  assert.match(html, /Sem classificação/)
  assert.match(html, /Decidido no 2º turno, em 25\/10: Governador \(RJ\)\./)
  assert.match(html, /Sem fechamento oficial do TSE: Governador \(RJ\); Deputado Estadual e Distrital \(DF\)\./)
  assert.match(html, /Ainda sem todos os eleitos no TSE: Deputado Estadual e Distrital \(DF\)\./)
  assert.match(html, /href="\/quiz\/metodologia"/)
  assert.match(html, /Como classificamos os partidos/)
  assert.match(html, /Por partido/)
  // Câmara em pontos, Senado em arco, governadores por campo e barra das assembleias.
  assert.match(html, /data-pf-espectro-hemiciclo="espectro-senado"/)
  assert.match(html, /data-pf-espectro-hemiciclo="espectro-camara"/)
  assert.match(html, /data-pf-espectro-governadores/)
  assert.match(html, /data-pf-espectro-barra="espectro-assembleias"/)
  assert.match(html, /Presidente vai ao 2º turno/)
  assert.doesNotMatch(html, /—|–/)
})

test("sem partido fora do mapa a coluna Sem classificação não aparece", () => {
  const html = renderToStaticMarkup(
    <EspectroEleitos1Turno
      data={dados({ bancadas: [bancada("Deputado Federal", "SP", 1, ["PL"])] })}
    />,
  )
  assert.doesNotMatch(html, />Sem classificação</)
  assert.doesNotMatch(html, /Ainda sem todos os eleitos no TSE: Deputado/)
})

test("não renderiza nada sem resultado", () => {
  const vazio = dados({ status: "vazio", disputas: [], bancadas: undefined })
  assert.equal(renderToStaticMarkup(<EspectroEleitos1Turno data={vazio} />), "")
})

test("a página do Brasil traz a seção depois de Por estado", () => {
  const html = renderToStaticMarkup(<Resultado1TurnoBrasil data={dados()} />)
  assert.ok(html.indexOf('id="estados"') !== -1)
  assert.ok(html.indexOf('id="espectro"') > html.indexOf('id="estados"'))
  assert.match(html, /href="#espectro"/)
})

test("legenda dos governadores só diz 2º turno quando a pendência tem candidatura nessa fase", () => {
  const segundo = renderToStaticMarkup(
    <EspectroEleitos1Turno
      data={dados({ disputas: [disputa("Governador", "RJ", 1, [cand("g1", "PL", "segundo_turno"), cand("g2", "PSD", "segundo_turno")])], bancadas: [] })}
    />,
  )
  assert.match(segundo, /\(2º turno\)/)
  const semEleito = renderToStaticMarkup(
    <EspectroEleitos1Turno data={dados({ disputas: [disputa("Governador", "RJ", 1, [cand("g1", "PL", "nao_eleito")])], bancadas: [] })} />,
  )
  assert.doesNotMatch(semEleito, /\(2º turno\)/)
  assert.match(semEleito, /Rio de Janeiro: sem eleito definido/)
})

test("arco do Senado: sem classificação e vaga pendente aparecem com contorno, nunca branco sobre branco", () => {
  const html = renderToStaticMarkup(
    <ArcoSenado id="t" linha={{ cargo: "Senador", eleitos: 52, vagas: 54, esquerda: 20, centro: 10, direita: 20, sem_classificacao: 2, partidos: [] }} />,
  )
  const sem = html.match(/<g data-pf-arco-classe="sem_classificacao">(.*?)<\/g>/)?.[1] ?? ""
  assert.match(sem, /stroke="var\(--gray-600\)"/)
  assert.match(sem, /stroke="url\(#t-hachura\)"/)
  assert.doesNotMatch(sem, /stroke="#ffffff"/)
  const pendente = html.match(/<g data-pf-arco-classe="pendente">(.*?)<\/g>/)?.[1] ?? ""
  assert.match(pendente, /stroke="var\(--gray-400\)"/)
})

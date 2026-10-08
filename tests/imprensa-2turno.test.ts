import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { buildSalaPromise2Turno } from "../src/components/imprensa/sala/sala-model"
import {
  aplicarRecorteTurno,
  rotuloUfs,
  datasetDoTurno,
  nomeExportTurno,
  opcoesMesa2Turno,
  segundoTurnoImprensa,
  separarPorTurno,
  statusUfImprensa,
} from "../src/lib/imprensa-2turno"
import { getResultados1Turno, type CandidatoResultado1Turno, type DisputaResultado1Turno } from "../src/lib/resultados-1turno"

const DASHES = /[–—]/

function candidato(slug: string | null, fase: CandidatoResultado1Turno["fase"], posicao: number): CandidatoResultado1Turno {
  return {
    sq: `sq-${slug ?? posicao}`,
    numero: String(posicao),
    nome: slug ?? "sem ficha",
    nome_urna: (slug ?? "sem ficha").toUpperCase(),
    partido: "PX",
    votos: 1000 - posicao,
    percentual_validos: 50 - posicao,
    posicao,
    situacao_tse: "",
    destinacao: "Válido",
    fase,
    slug,
    companheiros: [],
  }
}

function disputa(cargo: DisputaResultado1Turno["cargo"], uf: string, candidatos: CandidatoResultado1Turno[]): DisputaResultado1Turno {
  return {
    cargo,
    uf,
    vagas: cargo === "Senador" ? 2 : 1,
    fechamento_oficial: true,
    fase_calculada: false,
    fonte: { url: "https://resultados.tse.jus.br/x.json", sha256: "0".repeat(64), gerado_tse: "2026-10-05" },
    totais: {
      secoes: null, secoes_totalizadas: null, eleitorado: null, comparecimento: null, percentual_comparecimento: null,
      abstencao: null, percentual_abstencao: null, votos_validos: null, brancos: null, percentual_brancos: null,
      nulos: null, percentual_nulos: null,
    },
    candidatos,
  }
}

const FIXTURE = {
  disputas: [
    disputa("Presidente", "BR", [candidato("pres-a", "segundo_turno", 1), candidato("pres-b", "segundo_turno", 2), candidato("pres-c", "nao_eleito", 3)]),
    disputa("Governador", "RJ", [candidato("gov-rj-a", "segundo_turno", 1), candidato("gov-rj-b", "segundo_turno", 2), candidato("gov-rj-c", "nao_eleito", 3)]),
    disputa("Governador", "AC", [candidato("gov-ac-a", "segundo_turno", 1), candidato(null, "segundo_turno", 2)]),
    disputa("Governador", "SP", [candidato("gov-sp-a", "eleito", 1), candidato("gov-sp-b", "nao_eleito", 2)]),
    disputa("Senador", "SP", [candidato("sen-sp-a", "eleito", 1), candidato("sen-sp-b", "eleito", 2), candidato("sen-sp-c", "nao_eleito", 3)]),
  ],
}

describe("segundoTurnoImprensa", () => {
  test("separa finalistas, duelos e governadores eleitos a partir do snapshot", () => {
    const segundo = segundoTurnoImprensa(FIXTURE)
    assert.deepEqual(segundo.presidencia?.map((c) => c.slug), ["pres-a", "pres-b"])
    assert.deepEqual(segundo.duelos.map((d) => d.uf), ["AC", "RJ"], "duelos em ordem alfabética de UF")
    assert.equal(segundo.governadorEleito.get("SP")?.slug, "gov-sp-a")
    // Finalista sem ficha não entra no conjunto de slugs; Senado nunca entra.
    assert.deepEqual([...segundo.slugs].sort(), ["gov-ac-a", "gov-rj-a", "gov-rj-b", "pres-a", "pres-b"])
  })

  test("status por UF: 2º turno, eleito no 1º turno ou sem resultado", () => {
    const segundo = segundoTurnoImprensa(FIXTURE)
    assert.equal(statusUfImprensa(segundo, "rj").kind, "segundo_turno")
    const sp = statusUfImprensa(segundo, "SP")
    assert.equal(sp.kind, "eleito_1turno")
    assert.equal(sp.kind === "eleito_1turno" ? sp.eleito.slug : null, "gov-sp-a")
    assert.equal(statusUfImprensa(segundo, "MG").kind, "sem_resultado")
  })

  test("snapshot oficial: dois finalistas a presidente e todo finalista com ficha", () => {
    const data = getResultados1Turno()
    const segundo = segundoTurnoImprensa(data)
    assert.equal(segundo.presidencia?.length, 2)
    const finalistas = data.disputas
      .filter((d) => d.cargo !== "Senador")
      .flatMap((d) => d.candidatos.filter((c) => c.fase === "segundo_turno"))
    assert.equal(segundo.slugs.size, finalistas.length, "cada finalista do snapshot tem ficha vinculada")
    for (const duelo of segundo.duelos) assert.equal(segundo.governadorEleito.has(duelo.uf), false)
  })
})

describe("recorte das linhas", () => {
  const rows = [{ slug: "pres-a" }, { slug: "pres-c" }, { slug: "gov-rj-b" }, { slug: "sen-sp-a" }]
  const slugs = segundoTurnoImprensa(FIXTURE).slugs

  test("separarPorTurno preserva a ordem nos dois grupos", () => {
    const { segundoTurno, historico } = separarPorTurno(rows, slugs)
    assert.deepEqual(segundoTurno.map((r) => r.slug), ["pres-a", "gov-rj-b"])
    assert.deepEqual(historico.map((r) => r.slug), ["pres-c", "sen-sp-a"])
  })

  test("sem recorte de turno, nada sai; com turno 2, só finalistas", () => {
    assert.equal(aplicarRecorteTurno(rows, null, slugs).length, rows.length)
    assert.deepEqual(aplicarRecorteTurno(rows, 2, slugs).map((r) => r.slug), ["pres-a", "gov-rj-b"])
    const dataset = { generatedAt: "2026-10-07T12:00:00Z", rows }
    assert.equal(datasetDoTurno(dataset, null, slugs), dataset, "sem recorte, o mesmo objeto")
    const recortado = datasetDoTurno(dataset, 2, slugs)
    assert.equal(recortado.generatedAt, dataset.generatedAt)
    assert.equal(recortado.rows.length, 2)
  })

  test("o arquivo do 2º turno ganha sufixo próprio", () => {
    assert.equal(nomeExportTurno("puxa-ficha-imprensa.csv", 2), "puxa-ficha-imprensa-2turno.csv")
    assert.equal(nomeExportTurno("puxa-ficha-imprensa-processos.json", 2), "puxa-ficha-imprensa-processos-2turno.json")
    assert.equal(nomeExportTurno("puxa-ficha-imprensa.csv", null), "puxa-ficha-imprensa.csv")
  })
})

describe("buildSalaPromise2Turno", () => {
  test("usa a contagem do dataset e lista as UFs com governador no 2º turno", () => {
    const text = buildSalaPromise2Turno(16, true, ["AC", "AM", "RJ"])
    assert.match(text, /sobre os 16 finalistas do 2º turno: presidente e governador em AC, AM e RJ\./)
    assert.match(text, /link para a fonte oficial e data de coleta/)
    assert.doesNotMatch(text, DASHES)
  })

  test("sem contagem, não afirma número nem zero", () => {
    for (const total of [null, 0]) {
      const text = buildSalaPromise2Turno(total, true, [])
      assert.match(text, /sobre os finalistas do 2º turno: presidente\./)
      assert.doesNotMatch(text.replaceAll("2º turno", ""), /\d/)
    }
  })
})

describe("rotuloUfs", () => {
  test("o DF entra pelo nome, nunca como estado", () => {
    assert.equal(rotuloUfs(["AC", "AM", "DF", "ES", "RJ", "RN", "TO"]), "6 estados e o Distrito Federal")
    assert.equal(rotuloUfs(["SP", "MG"]), "2 estados")
    assert.equal(rotuloUfs(["SP"]), "1 estado")
    assert.equal(rotuloUfs(["DF"]), "o Distrito Federal")
    assert.equal(rotuloUfs(["DF", "GO"]), "1 estado e o Distrito Federal")
  })
})

describe("Mesa e export no 2º turno", () => {
  test("opções de cargo e UF vêm do snapshot, independentes do filtro", () => {
    assert.deepEqual(opcoesMesa2Turno(segundoTurnoImprensa(FIXTURE)), { cargos: ["Governador", "Presidente"], ufs: ["AC", "RJ"] })
  })

  test("o recorte entra em filters.turno sem perder cargo e UF", () => {
    const slugs = segundoTurnoImprensa(FIXTURE).slugs
    const dataset = { generatedAt: "2026-10-07T12:00:00Z", filters: { cargo: "Governador", uf: "RJ" }, rows: [{ slug: "gov-rj-a" }, { slug: "gov-rj-c" }] }
    const recortado = datasetDoTurno(dataset, 2, slugs)
    assert.deepEqual(recortado.filters, { cargo: "Governador", uf: "RJ", turno: 2 })
    assert.deepEqual(recortado.rows.map((r) => r.slug), ["gov-rj-a"])
    assert.equal(datasetDoTurno(dataset, null, slugs).filters, dataset.filters)
  })
})

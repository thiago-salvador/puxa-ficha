import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import {
  faseDoSnapshot1Turno,
  getResultadoDoCandidato1Turno,
  hasResultados1Turno,
  href1Turno,
  mesclarFaseComSnapshot,
  rotuloRegistroForaDoResultado,
  votoValido,
  type DisputaResultado1Turno,
  type Resultados1Turno,
} from "../src/lib/resultados-1turno"
import { alvosDasBancadas, alvosDoSnapshot, lerBancada, montarSnapshot } from "../scripts/lib/resultados-snapshot"
import { UFS_RESULTADO, type ArquivoLido, type CandidaturaCoorte, type EleicoesDoTurno } from "../scripts/lib/resultados-tse"

const ELEICOES: EleicoesDoTurno = { ciclo: "ele2026", turno: 1, data: "2026-10-04", federal: "700", estadual: "702" }

function disputa(cargo: DisputaResultado1Turno["cargo"], uf: string, fases: Array<[string | null, DisputaResultado1Turno["candidatos"][number]["fase"]]>): DisputaResultado1Turno {
  return {
    cargo, uf, vagas: cargo === "Senador" ? 2 : 1, fechamento_oficial: true, fase_calculada: false,
    fonte: { url: "https://resultados.tse.jus.br/oficial/x", sha256: "a".repeat(64), gerado_tse: "05/10/2026 01:02:03" },
    totais: { secoes: 1, secoes_totalizadas: 1, eleitorado: 1, comparecimento: 1, percentual_comparecimento: 1, abstencao: 0, percentual_abstencao: 0, votos_validos: 1, brancos: 0, percentual_brancos: 0, nulos: 0, percentual_nulos: 0 },
    candidatos: fases.map(([slug, fase], i) => ({
      sq: String(100000 + i), numero: String(10 + i), nome: `N${i}`, nome_urna: `U${i}`, partido: "PX", votos: 100 - i,
      percentual_validos: 10, posicao: i + 1, situacao_tse: "", destinacao: "Válido", fase, slug, companheiros: [],
    })),
  }
}

const FINAL: Resultados1Turno = {
  versao: 1, turno: 1, status: "final", gerado_em: "2026-10-05T03:00:00.000Z", ciclo: "ele2026", eleicoes: { federal: "700", estadual: "702" },
  disputas: [
    disputa("Presidente", "BR", [["pres-a", "segundo_turno"], ["pres-b", "segundo_turno"], ["pres-c", "nao_eleito"]]),
    disputa("Governador", "SP", [["gov-a", "eleito"], [null, "nao_eleito"]]),
  ],
}

describe("resultados 1º turno: arquivo commitado", () => {
  const commitado = JSON.parse(readFileSync(new URL("../src/data/resultados-1turno-2026.json", import.meta.url), "utf8")) as Resultados1Turno

  it("nunca é prévia (leitura parcial só existe localmente)", () => {
    assert.notEqual(commitado.status, "previa")
    assert.ok(commitado.status === "vazio" || commitado.status === "final")
  })

  it("vazio não traz número; final traz as 55 disputas fechadas, com fonte e ordem por votos", () => {
    if (commitado.status === "vazio") {
      assert.deepEqual(commitado.disputas, [])
      return
    }
    assert.equal(commitado.disputas.length, alvosDoSnapshot().length)
    for (const d of commitado.disputas) {
      assert.match(d.fonte.url, /^https:\/\/resultados\.tse\.jus\.br\/oficial\//)
      assert.match(d.fonte.sha256, /^[0-9a-f]{64}$/)
      assert.equal(d.totais.secoes_totalizadas, d.totais.secoes, `${d.cargo}:${d.uf} sem totalização completa`)
      const validos = d.candidatos.filter((c) => c.posicao !== null)
      assert.ok(validos.every((c, i) => c.posicao === i + 1 && (i === 0 || validos[i - 1].votos >= c.votos)), `${d.cargo}:${d.uf} fora de ordem`)
      assert.ok(d.candidatos.slice(validos.length).every((c) => c.posicao === null && c.percentual_validos === null), `${d.cargo}:${d.uf}: voto não válido fora do fim ou com %`)
      // Fase coerente com a ordem dos válidos: eleitos e finalistas são os mais votados.
      const topo = validos.filter((c) => c.fase === "eleito" || c.fase === "segundo_turno")
      assert.deepEqual(topo.map((c) => c.posicao), topo.map((_, i) => i + 1), `${d.cargo}:${d.uf}: eleito/2º turno não são os mais votados`)
      assert.ok(d.candidatos.every((c) => c.fase !== "em_apuracao"), `${d.cargo}:${d.uf} com candidato em apuração`)
      const eleitos = d.candidatos.filter((c) => c.fase === "eleito").length
      const segundo = d.candidatos.filter((c) => c.fase === "segundo_turno").length
      if (d.cargo === "Senador") assert.equal(eleitos, d.vagas, `${d.uf}: eleitos ao Senado`)
      else assert.ok((eleitos === 1 && segundo === 0) || (eleitos === 0 && segundo === 2), `${d.cargo}:${d.uf}: ${eleitos} eleito(s), ${segundo} no 2º turno`)
      // O TSE calcula o % com um total que inclui voto "anulado sub judice": com ele na disputa, os válidos somam menos de 100.
      const somaValidos = validos.reduce((n, c) => n + (c.percentual_validos ?? 0), 0)
      const temAnulado = validos.length < d.candidatos.length
      if (temAnulado) assert.ok(somaValidos < 100.05, `${d.cargo}:${d.uf}: % válidos soma ${somaValidos}`)
      else assert.ok(Math.abs(somaValidos - 100) < 0.05, `${d.cargo}:${d.uf}: % válidos soma ${somaValidos}`)
    }
  })
})

describe("resultados 1º turno: leitura pelo site", () => {
  it("vazio não tem resultado; prévia e final têm", () => {
    assert.equal(hasResultados1Turno({ ...FINAL, status: "vazio", disputas: [] }), false)
    assert.equal(hasResultados1Turno(FINAL), true)
    assert.equal(hasResultados1Turno({ ...FINAL, status: "previa" }), true)
  })

  it("acha a posição e os vizinhos do candidato", () => {
    const r = getResultadoDoCandidato1Turno("pres-b", FINAL)
    assert.deepEqual([r?.candidato.posicao, r?.total, r?.anterior?.slug, r?.proximo?.slug], [2, 3, "pres-a", "pres-c"])
    assert.equal(getResultadoDoCandidato1Turno("nao-existe", FINAL), null)
  })

  it("voto anulado não tem posição nem vizinhos; o válido abaixo dele não é comparado com ele", () => {
    const comAnulado: Resultados1Turno = { ...FINAL, disputas: [{ ...FINAL.disputas[0], candidatos: [
      ...FINAL.disputas[0].candidatos,
      { ...FINAL.disputas[0].candidatos[2], sq: "999999", slug: "anulado", posicao: null, percentual_validos: null, destinacao: "Anulado sub judice", fase: "fora_da_disputa" },
    ] }] }
    const r = getResultadoDoCandidato1Turno("anulado", comAnulado)
    assert.deepEqual([r?.candidato.posicao, r?.total, r?.anterior, r?.proximo], [null, 3, null, null])
    assert.equal(getResultadoDoCandidato1Turno("pres-c", comAnulado)?.proximo, null)
  })

  it("registro deferido ou ausente não vira frase de 'não aparece no resultado'", () => {
    assert.equal(rotuloRegistroForaDoResultado("deferido"), null)
    assert.equal(rotuloRegistroForaDoResultado(null), null)
    assert.equal(rotuloRegistroForaDoResultado("renuncia"), "renúncia")
    assert.equal(rotuloRegistroForaDoResultado("indeferido com recurso"), "indeferido com recurso")
    assert.equal(votoValido("Válido"), true)
    assert.equal(votoValido("Anulado sub judice"), false)
  })

  it("fase do banco vence; snapshot cobre ausência e em_disputa; cargo diferente não casa", () => {
    const banco = { fase_eleitoral: "nao_eleito" as const, fase_turno: 1 as const, atualizacao_encerrada_em: "2026-10-05" }
    assert.equal(mesclarFaseComSnapshot("pres-a", "Presidente", banco, FINAL), banco)
    assert.deepEqual(mesclarFaseComSnapshot("pres-a", "Presidente", null, FINAL), { fase_eleitoral: "segundo_turno", fase_turno: 1, atualizacao_encerrada_em: null })
    assert.deepEqual(mesclarFaseComSnapshot("gov-a", "Governador", { fase_eleitoral: "em_disputa", fase_turno: 1, atualizacao_encerrada_em: null }, FINAL)?.fase_eleitoral, "eleito")
    assert.equal(faseDoSnapshot1Turno("gov-a", "Senador", FINAL), null)
    assert.equal(mesclarFaseComSnapshot("pres-a", "Presidente", null, { ...FINAL, status: "vazio", disputas: [] }), null)
  })

  it("link do 1º turno leva a UF em minúscula e Brasil para a raiz", () => {
    assert.equal(href1Turno("SP"), "/1o-turno/sp")
    assert.equal(href1Turno("BR"), "/")
    assert.equal(href1Turno(null), "/")
  })
})

describe("resultados 1º turno: snapshot", () => {
  function leitura(cargo: "Presidente" | "Governador" | "Senador", uf: string, final = true): ArquivoLido {
    const abrangencia = cargo === "Presidente" ? "BR" : uf
    const vagas = cargo === "Senador" ? 2 : 1
    const sts = cargo === "Senador" ? ["Eleito", "Eleito", "Não eleito"] : cargo === "Presidente" ? ["2º turno", "2º turno", "Não eleito"] : ["Eleito", "Não eleito", "Não eleito"]
    return {
      ok: true, final, faseCalculada: false, vagas, sha256: "b".repeat(64), geradoEm: "05/10/2026 01:02:03",
      alvo: { chave: `${cargo}:${abrangencia}`, cargo, abrangencia, eleicao: cargo === "Presidente" ? "700" : "702", url: `https://resultados.tse.jus.br/oficial/${cargo}-${abrangencia}` },
      totais: { secoes: 1, secoesTotalizadas: 1, percentualSecoesTotalizadas: 100, eleitorado: 10, comparecimento: 8, percentualComparecimento: 80, abstencao: 2, percentualAbstencao: 20, votosValidos: 6, brancos: 1, percentualBrancos: 12.5, nulos: 1, percentualNulos: 12.5 },
      candidatos: sts.map((st, i) => ({
        sq: `${abrangencia === "BR" ? "28" : "25"}${uf}${i}`.replace(/\D/g, "").padEnd(8, String(i)), numero: String(10 + i), nome: `N${i}`, nomeUrna: `U${i}`, partido: "PX",
        eleito: st === "Eleito", situacao: st, destinacao: "Válido", votos: 3 - i, percentualValidos: 50 - i * 25, posicao: i + 1, companheiros: [],
      })),
    }
  }
  const todas = () => [leitura("Presidente", "BR"), ...UFS_RESULTADO.flatMap((uf) => [leitura("Governador", uf), leitura("Senador", uf)])]
  const coorte = (): CandidaturaCoorte[] => {
    const l = leitura("Presidente", "BR")
    return [
      { id: "1", slug: "pres-0", cargo_disputado: "Presidente", estado: null, sq_candidato_2026: l.candidatos[0].sq, fase_eleitoral: "em_disputa", atualizacao_encerrada_em: null },
      { id: "2", slug: "fora-do-tse", cargo_disputado: "Governador", estado: "SP", sq_candidato_2026: "999999999", fase_eleitoral: "em_disputa", atualizacao_encerrada_em: null },
    ]
  }

  it("grava final só com os 55 arquivos fechados; liga ficha por SQ e relata quem não casou", () => {
    const { snapshot, relatorio } = montarSnapshot({ eleicoes: ELEICOES, leituras: todas(), coorte: coorte(), agora: new Date("2026-10-05T03:00:00Z"), previa: false })
    assert.equal(snapshot?.status, "final")
    assert.equal(snapshot?.disputas.length, 55)
    assert.equal(snapshot?.disputas[0].cargo, "Presidente")
    assert.deepEqual(snapshot?.disputas[0].candidatos.map((c) => [c.slug, c.fase, c.posicao]), [["pres-0", "segundo_turno", 1], [null, "segundo_turno", 2], [null, "nao_eleito", 3]])
    assert.deepEqual(relatorio.fichas_fora_do_tse.map((f) => f.slug), ["fora-do-tse"])
    assert.equal(relatorio.com_ficha, 1)
  })

  it("voto anulado vai ao fim, sem posição nem %, mesmo com mais votos que válidos", () => {
    const leituras = todas()
    const gov = leituras[1]
    leituras[1] = { ...gov, candidatos: [{ ...gov.candidatos[0], sq: "77777777", votos: 999, destinacao: "Anulado sub judice", situacao: "Não eleito", eleito: false }, ...gov.candidatos] }
    const { snapshot } = montarSnapshot({ eleicoes: ELEICOES, leituras, coorte: [], agora: new Date(), previa: false })
    const d = snapshot?.disputas.find((x) => x.cargo === "Governador" && x.uf === gov.alvo.abrangencia)
    assert.deepEqual(d?.candidatos.map((c) => [c.sq, c.posicao, c.percentual_validos === null, c.fase]).at(-1), ["77777777", null, true, "fora_da_disputa"])
    assert.deepEqual(d?.candidatos.slice(0, 3).map((c) => c.posicao), [1, 2, 3])
  })

  it("não grava nada com arquivo recusado, salvo em prévia; 100% sem tf entra marcado", () => {
    const comRecusa = [...todas().slice(1), { ok: false as const, alvo: leitura("Presidente", "BR").alvo, motivo: "HTTP 404" }]
    assert.equal(montarSnapshot({ eleicoes: ELEICOES, leituras: comRecusa, coorte: [], agora: new Date(), previa: false }).snapshot, null)
    // Leitura a 100% das seções sem tf (já validada pelo leitor) entra, marcada e relatada.
    const semTf = todas().map((l, i) => (i === 0 ? { ...l, final: false, faseCalculada: true } : l))
    const r = montarSnapshot({ eleicoes: ELEICOES, leituras: semTf, coorte: [], agora: new Date(), previa: false })
    assert.equal(r.snapshot?.status, "final")
    assert.deepEqual([r.snapshot?.disputas[0].fechamento_oficial, r.snapshot?.disputas[0].fase_calculada], [false, true])
    assert.deepEqual(r.relatorio.sem_fechamento_oficial, ["Presidente:BR"])
    assert.equal(montarSnapshot({ eleicoes: ELEICOES, leituras: comRecusa, coorte: [], agora: new Date(), previa: true }).snapshot?.status, "previa")
  })
})

describe("resultados 1º turno: bancadas proporcionais", () => {
  it("54 arquivos: federal nas 27 UFs, estadual em 26 e distrital no DF", () => {
    const alvos = alvosDasBancadas(ELEICOES)
    assert.equal(alvos.length, 54)
    assert.equal(alvos.filter((a) => a.cargo === "Deputado Distrital").map((a) => a.uf).join(), "DF")
    assert.match(alvos[0].url, /\/ele2026\/702\/dados\/ac\/ac-c0006-e000702-u\.json$/)
  })

  it("conta só quem o TSE marcou como eleito e guarda o fechamento oficial", () => {
    const alvo = alvosDasBancadas(ELEICOES).find((a) => a.cargo === "Deputado Federal" && a.uf === "SP")!
    const corpo = JSON.stringify({ cdabr: "sp", f: "o", tf: "n", dg: "05/10/2026", hg: "01:00:00", carg: [{ cd: "6", nv: "3", agr: [{ par: [
      { sg: "PT", cand: [{ sqcand: "1", nmu: "A", e: "s", st: "Eleito por QP" }, { sqcand: "2", nmu: "B", e: "n", st: "Suplente" }] },
      { sg: "PL", cand: [{ sqcand: "3", nmu: "C", e: "s", st: "Eleito por média" }] },
    ] }] }] })
    const b = lerBancada(alvo, corpo)
    assert.notEqual(typeof b, "string")
    if (typeof b === "string") return
    assert.deepEqual([b.vagas, b.fechamento_oficial, b.eleitos.map((e) => `${e.partido}:${e.nome_urna}`)], [3, false, ["PL:C", "PT:A"]])
  })

  it("recusa mais eleitos que vagas", () => {
    const alvo = alvosDasBancadas(ELEICOES)[0]
    const corpo = JSON.stringify({ cdabr: "ac", f: "o", tf: "s", carg: [{ cd: "6", nv: "1", agr: [{ par: [{ sg: "PT", cand: [
      { sqcand: "1", nmu: "A", e: "s", st: "Eleito" }, { sqcand: "2", nmu: "B", e: "s", st: "Eleito" },
    ] }] }] }] })
    assert.match(String(lerBancada(alvo, corpo)), /2 eleitos para 1 vagas/)
  })
})

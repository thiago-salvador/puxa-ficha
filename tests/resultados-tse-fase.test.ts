import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  arquivosDoTurno,
  arquivosNecessariosDoTurno,
  candidaturasDoTurno,
  checarSanidade,
  classificarCandidato,
  descobrirEleicoes,
  lerArquivoResultado,
  montarPlano,
  situacaoPorCalculo,
  urlResultado,
  type ArquivoAlvo,
  type CandidatoResultado,
  type CandidaturaCoorte,
  type EleicoesDoTurno,
} from "../scripts/lib/resultados-tse"
import { gerarArquivosFase } from "../scripts/lib/fase-eleitoral-migration"

const ELEICOES: EleicoesDoTurno = { ciclo: "ele2026", turno: 1, data: "2026-10-04", federal: "700", estadual: "702" }

function config(ciclo = "ele2026") {
  return {
    c: ciclo,
    pl: [
      { cd: "500", dt: "04/10/2026", e: [
        { cd: "700", cdt2: "701", t: "1", abr: [{ cd: "br", cp: [{ cd: "1", ds: "Presidente" }] }] },
        { cd: "702", cdt2: "703", t: "1", abr: [{ cd: "sp", cp: [{ cd: "3", ds: "Governador" }, { cd: "5", ds: "Senador" }, { cd: "6", ds: "Deputado Federal" }] }] },
      ] },
      { cd: "501", dt: "25/10/2026", e: [
        { cd: "701", t: "2", abr: [{ cd: "br", cp: [{ cd: "1" }] }] },
        { cd: "703", t: "2", abr: [{ cd: "sp", cp: [{ cd: "3" }] }] },
      ] },
    ],
  }
}

function alvo(cargo: "Presidente" | "Governador" | "Senador", abrangencia: string, eleicao = cargo === "Presidente" ? "700" : "702"): ArquivoAlvo {
  return { chave: `${cargo}:${abrangencia}`, cargo, abrangencia, eleicao, url: urlResultado("ele2026", eleicao, abrangencia, cargo) }
}

type Cand = { sqcand: string; e: string; st: string; dvt?: string; vap?: string; pvapn?: string }
/** Arquivo no formato de 2026 (dados/<uf>/...-u.json). `extra` mexe na raiz, exceto st/carper/nv. */
function arquivo(a: ArquivoAlvo, cands: Cand[], extra: Record<string, string> = {}): string {
  const codigo = { Presidente: "1", Governador: "3", Senador: "5" }[a.cargo]
  const { st, carper, nv, ...raiz } = extra
  return JSON.stringify({
    ele: a.eleicao, cdabr: a.abrangencia === "BR" ? "br" : a.abrangencia.toLowerCase(), t: "1", f: "o", tf: "s",
    dg: "05/10/2026", hg: "01:02:03",
    s: { ts: "1000", st: st ?? "1000", pst: "100,00", pstn: "100" },
    e: { te: "2000", c: "1600", pc: "80,00", pcn: "80", a: "400", pa: "20,00", pan: "20" },
    v: { vv: "1500", vb: "40", pvb: "2,50", pvbn: "2.5", tvn: "60", ptvn: "3,75", ptvnn: "3.75" },
    carg: [{
      cd: carper ?? codigo, nv: nv ?? (a.cargo === "Senador" ? "2" : "1"),
      agr: [{ n: "1", par: [{ sg: "PX", cand: cands.map((c, i) => ({
        seq: String(i + 1), sqcand: c.sqcand, n: String(10 + i), nm: `NOME ${i}`, nmu: `URNA ${i}`, e: c.e, st: c.st,
        dvt: c.dvt ?? "Válido", vap: c.vap ?? String(100 - i), pvapn: c.pvapn ?? "10,5",
        vs: [{ tp: a.cargo === "Senador" ? "s1" : "v", sqcand: "1", nm: `COMPANHEIRO ${i}`, nmu: `COMP ${i}`, sgp: "PY" }],
      })) }] }],
    }],
    ...raiz,
  })
}

function cr(parcial: Partial<CandidatoResultado> & Pick<CandidatoResultado, "situacao" | "eleito">): CandidatoResultado {
  return { sq: "1", numero: "", nome: "", nomeUrna: "", partido: "", destinacao: "Válido", votos: 1, percentualValidos: 1, posicao: 1, companheiros: [], ...parcial }
}

const senadoSP = alvo("Senador", "SP")
const governoSP = alvo("Governador", "SP")
const presidente = alvo("Presidente", "BR")

function coorte(): CandidaturaCoorte[] {
  const c = (id: string, slug: string, cargo: string, estado: string | null, sq: string, fase = "em_disputa"): CandidaturaCoorte =>
    ({ id, slug, cargo_disputado: cargo, estado, sq_candidato_2026: sq, fase_eleitoral: fase, atualizacao_encerrada_em: null })
  return [
    c("00000000-0000-4000-8000-000000000001", "sen-eleito", "Senador", "SP", "250000000001"),
    c("00000000-0000-4000-8000-000000000002", "sen-perdeu", "Senador", "SP", "250000000002"),
    c("00000000-0000-4000-8000-000000000003", "gov-2t-a", "Governador", "SP", "250000000003"),
    c("00000000-0000-4000-8000-000000000004", "gov-2t-b", "Governador", "SP", "250000000004"),
    c("00000000-0000-4000-8000-000000000005", "gov-fora", "Governador", "SP", "250000000005"),
    c("00000000-0000-4000-8000-000000000006", "pres-eleito", "Presidente", null, "280000000006"),
    c("00000000-0000-4000-8000-000000000007", "pres-perdeu", "Presidente", null, "280000000007"),
  ]
}

const leiturasOk = () => [
  lerArquivoResultado(senadoSP, 1, arquivo(senadoSP, [
    { sqcand: "250000000001", e: "s", st: "Eleito" },
    { sqcand: "250000000002", e: "n", st: "Não eleito" },
    { sqcand: "250000000008", e: "s", st: "Eleito" },
  ])),
  lerArquivoResultado(governoSP, 1, arquivo(governoSP, [
    { sqcand: "250000000003", e: "s", st: "2º turno" },
    { sqcand: "250000000004", e: "s", st: "2º turno" },
    { sqcand: "250000000005", e: "n", st: "Não eleito", dvt: "Anulado" },
  ])),
  lerArquivoResultado(presidente, 1, arquivo(presidente, [
    { sqcand: "280000000006", e: "s", st: "Eleito" },
    { sqcand: "280000000007", e: "n", st: "Não eleito" },
  ])),
]

describe("resultados TSE: descoberta e URL", () => {
  it("acha as eleições federal e estadual do turno no ele-c.json", () => {
    assert.deepEqual(descobrirEleicoes(config(), { ciclo: "ele2026", turno: 1, dataIso: "2026-10-04" }),
      { ciclo: "ele2026", turno: 1, data: "2026-10-04", federal: "700", estadual: "702" })
    assert.equal(descobrirEleicoes(config(), { ciclo: "ele2026", turno: 2, dataIso: "2026-10-25" }).estadual, "703")
  })

  it("recusa config de outro ciclo (o ele-c.json ainda está em ele2024)", () => {
    assert.throws(() => descobrirEleicoes(config("ele2024"), { ciclo: "ele2026", turno: 1, dataIso: "2026-10-04" }), /ciclo publicado é ele2024/)
  })

  it("aceita o ele-c.json de 2026, que não publica o ciclo na raiz", () => {
    const semCiclo = { pl: config().pl }
    assert.equal(descobrirEleicoes(semCiclo, { ciclo: "ele2026", turno: 1, dataIso: "2026-10-04" }).federal, "700")
  })

  it("monta a URL no formato de 2026 (dados/<uf>/...-u.json)", () => {
    assert.equal(urlResultado("ele2026", "6259", "SP", "Senador"),
      "https://resultados.tse.jus.br/oficial/ele2026/6259/dados/sp/sp-c0005-e006259-u.json")
    assert.equal(urlResultado("ele2026", "6257", "BR", "Presidente"),
      "https://resultados.tse.jus.br/oficial/ele2026/6257/dados/br/br-c0001-e006257-u.json")
  })

  it("no 2º turno não pede arquivo de Senado", () => {
    const alvos = arquivosDoTurno({ ...ELEICOES, turno: 2, federal: "701", estadual: "703" }, [{ cargo: "Senador", uf: "SP" }, { cargo: "Governador", uf: "SP" }])
    assert.deepEqual(alvos.map((a) => a.chave), ["Governador:SP"])
  })

  it("turno 2 descobre eleição só estadual quando não há segundo turno presidencial", () => {
    const semPresidente = config()
    semPresidente.pl[1].e = semPresidente.pl[1].e.filter((e) => e.cd !== "701")
    assert.deepEqual(descobrirEleicoes(semPresidente, { ciclo: "ele2026", turno: 2, dataIso: "2026-10-25" }),
      { ciclo: "ele2026", turno: 2, data: "2026-10-25", federal: "", estadual: "703" })
    semPresidente.pl[1].e = semPresidente.pl[1].e.filter((e) => e.cd !== "703")
    assert.deepEqual(descobrirEleicoes(semPresidente, { ciclo: "ele2026", turno: 2, dataIso: "2026-10-25" }),
      { ciclo: "ele2026", turno: 2, data: "2026-10-25", federal: "", estadual: "" })
  })

  it("lista arquivos de 2º turno somente para cargos e estados ainda em segundo_turno", () => {
    const candidatos = coorte().map((c) => {
      if (c.slug === "gov-2t-a") return { ...c, estado: "SP", fase_eleitoral: "segundo_turno" }
      if (c.slug === "gov-2t-b") return { ...c, estado: "RJ", fase_eleitoral: "segundo_turno" }
      if (c.slug === "pres-eleito") return { ...c, fase_eleitoral: "segundo_turno" }
      return { ...c, fase_eleitoral: "nao_eleito", atualizacao_encerrada_em: "2026-10-05" }
    })
    const alvos = arquivosNecessariosDoTurno({ ...ELEICOES, turno: 2, federal: "701", estadual: "703" }, candidatos)
    assert.deepEqual(alvos.map((a) => [a.chave, a.eleicao]), [["Governador:RJ", "703"], ["Governador:SP", "703"], ["Presidente:BR", "701"]])
  })
})

describe("resultados TSE: leitura fail-closed", () => {
  it("aceita arquivo oficial com totalização final", () => {
    const l = lerArquivoResultado(senadoSP, 1, arquivo(senadoSP, [
      { sqcand: "250000000001", e: "s", st: "Eleito" },
      { sqcand: "250000000008", e: "s", st: "Eleito" },
    ]))
    assert.equal(l.ok, true)
  })

  for (const [rotulo, extra, motivo] of [
    ["não oficial", { f: "s" }, /não oficial/],
    ["totalização aberta", { tf: "n" }, /não finalizada/],
    ["seções faltando", { st: "999" }, /seções totalizadas/],
    ["turno errado", { t: "2" }, /turno/],
    ["cargo errado", { carper: "3" }, /cargo/],
    ["UF errada", { cdabr: "rj" }, /abrangência/],
  ] as const) {
    it(`recusa ${rotulo}`, () => {
      const l = lerArquivoResultado(senadoSP, 1, arquivo(senadoSP, [
        { sqcand: "250000000001", e: "s", st: "Eleito" },
        { sqcand: "250000000008", e: "s", st: "Eleito" },
      ], extra))
      assert.equal(l.ok, false)
      assert.match(l.ok ? "" : l.motivo, motivo)
    })
  }

  it("recusa JSON inválido (corpo de erro 403 em HTML)", () => {
    const l = lerArquivoResultado(senadoSP, 1, "<html>403 Forbidden</html>")
    assert.equal(l.ok, false)
  })

  it("recusa situação não reconhecida (resultado ainda parcial)", () => {
    const l = lerArquivoResultado(senadoSP, 1, arquivo(senadoSP, [{ sqcand: "250000000001", e: "n", st: "Concorrendo" }]))
    assert.equal(l.ok, false)
  })

  it("sanidade: governador com três no 2º turno é recusado", () => {
    const fases = [{ e: "s", st: "2º turno" }, { e: "s", st: "2º turno" }, { e: "s", st: "2º turno" }]
    assert.match(checarSanidade("Governador", 1, fases.map((f, i) => cr({ sq: String(i), eleito: true, situacao: f.st }))) ?? "", /3 no 2º turno/)
  })

  it("Senado usa as vagas do arquivo (nv) e recusa número diferente de 2", () => {
    const l = lerArquivoResultado(senadoSP, 1, arquivo(senadoSP, [
      { sqcand: "250000000001", e: "s", st: "Eleito" },
      { sqcand: "250000000008", e: "s", st: "Eleito" },
    ], { nv: "3" }))
    assert.equal(l.ok, false)
    assert.match(l.ok ? "" : l.motivo, /3 vagas/)
  })

  it("recusa candidato sem votos apurados", () => {
    const l = lerArquivoResultado(governoSP, 1, arquivo(governoSP, [
      { sqcand: "250000000003", e: "s", st: "Eleito", vap: "" },
      { sqcand: "250000000004", e: "n", st: "Não eleito" },
    ]))
    assert.equal(l.ok, false)
    assert.match(l.ok ? "" : l.motivo, /vap/)
  })

  it("classifica anulado como fora da disputa e não chuta situação desconhecida", () => {
    assert.equal(classificarCandidato(cr({ eleito: false, situacao: "Não eleito", destinacao: "Anulado sub judice" }), 1), "fora_da_disputa")
    assert.equal(classificarCandidato(cr({ eleito: false, situacao: "#" }), 1), null)
  })
})

describe("resultados TSE: votos e totais (formato 2026)", () => {
  it("lê votos, % dos válidos, partido, nome de urna, vice/suplente e totais; ordena por votos", () => {
    const l = lerArquivoResultado(governoSP, 1, arquivo(governoSP, [
      { sqcand: "250000000005", e: "n", st: "Não eleito", vap: "120", pvapn: "8,000000000" },
      { sqcand: "250000000003", e: "s", st: "Eleito", vap: "900", pvapn: "60,123456789" },
      { sqcand: "250000000004", e: "n", st: "Não eleito", vap: "480", pvapn: "31,876543211" },
    ]))
    assert.equal(l.ok, true)
    if (!l.ok) return
    assert.deepEqual(l.candidatos.map((c) => [c.sq, c.votos, c.percentualValidos]), [
      ["250000000003", 900, 60.123456789], ["250000000004", 480, 31.876543211], ["250000000005", 120, 8],
    ])
    assert.deepEqual([l.candidatos[0].partido, l.candidatos[0].nomeUrna, l.candidatos[0].companheiros], ["PX", "URNA 1", [{ tipo: "v", nome: "COMP 1", partido: "PY" }]])
    assert.equal(l.vagas, 1)
    assert.equal(l.final, true)
    assert.deepEqual(l.totais, {
      secoes: 1000, secoesTotalizadas: 1000, percentualSecoesTotalizadas: 100, eleitorado: 2000, comparecimento: 1600,
      percentualComparecimento: 80, abstencao: 400, percentualAbstencao: 20, votosValidos: 1500, brancos: 40,
      percentualBrancos: 2.5, nulos: 60, percentualNulos: 3.75,
    })
  })

  it("prévia aceita apuração em andamento e situação vazia, sem virar leitura final", () => {
    const corpo = arquivo(governoSP, [{ sqcand: "250000000003", e: "n", st: "" }], { tf: "n", st: "500" })
    assert.equal(lerArquivoResultado(governoSP, 1, corpo).ok, false)
    const previa = lerArquivoResultado(governoSP, 1, corpo, { previa: true })
    assert.equal(previa.ok, true)
    assert.equal(previa.ok && previa.final, false)
  })
})

describe("resultados TSE: plano", () => {
  it("1º turno completo aplica a regra do dono", () => {
    const plano = montarPlano({ turno: 1, eleicoes: ELEICOES, coorte: coorte(), leituras: leiturasOk(), agora: new Date("2026-10-05T12:00:00Z") })
    assert.equal(plano.status, "completo")
    const por = Object.fromEntries(plano.mudancas.map((m) => [m.slug, [m.fase_depois, m.encerra_atualizacao]]))
    assert.deepEqual(por, {
      "sen-eleito": ["eleito", true],
      "sen-perdeu": ["nao_eleito", true],
      "gov-2t-a": ["segundo_turno", false],
      "gov-2t-b": ["segundo_turno", false],
      "gov-fora": ["fora_da_disputa", true],
      "pres-eleito": ["eleito", true],
      "pres-perdeu": ["nao_eleito", true],
    })
  })

  it("403 apenas no Senado ainda gera saídas sem claim e mantém plano aplicável", () => {
    const leituras = leiturasOk()
    leituras[0] = { ok: false, alvo: senadoSP, motivo: "HTTP 403" }
    const plano = montarPlano({ turno: 1, eleicoes: ELEICOES, coorte: coorte(), leituras, agora: new Date() })
    assert.equal(plano.status, "completo")
    assert.deepEqual(plano.mudancas.filter((m) => m.cargo === "Senador").map((m) => [m.fase_depois, m.fonte, m.situacao_tse]), [
      ["fora_da_disputa", null, null], ["fora_da_disputa", null, null],
    ])
    assert.equal(plano.sem_resultado.filter((p) => p.cargo === "Senador").length, 2)
    assert.equal(plano.pendentes.some((p) => p.cargo === "Senador"), false)
    const generated = gerarArquivosFase({ plano, version: "20261005120000", predecessor: { version: "20260927050000", name: "candidaturas_fase_2026_schema" } })
    assert.match(generated.migration, /escrita esperada=7/)
  })

  it("senador sem SQ deixa a coorte como fora da disputa sem claim individual", () => {
    const c = coorte()
    c[0] = { ...c[0], sq_candidato_2026: "250099999999" }
    const plano = montarPlano({ turno: 1, eleicoes: ELEICOES, coorte: c, leituras: leiturasOk(), agora: new Date() })
    const fallback = plano.mudancas.find((m) => m.slug === "sen-eleito")
    assert.deepEqual([fallback?.fase_depois, fallback?.sq, fallback?.fonte, fallback?.situacao_tse], ["fora_da_disputa", "250099999999", null, null])
    assert.deepEqual(plano.sem_resultado.map((p) => [p.slug, p.motivo]), [["sen-eleito", "SQ ausente do resultado oficial"]])
    assert.deepEqual(plano.pendentes, [])
    const generated = gerarArquivosFase({ plano, version: "20261005120000", predecessor: { version: "20260927050000", name: "candidaturas_fase_2026_schema" } })
    assert.match(generated.migration, /'sen-eleito', '250099999999', '250099999999', 'Senador', 'em_disputa', 'fora_da_disputa'[\s\S]*NULL, NULL, NULL/)
  })

  it("senador com SQ inválido sai mesmo quando o arquivo não contém a candidatura", () => {
    const c = coorte()
    c[0] = { ...c[0], sq_candidato_2026: " " }
    const plano = montarPlano({ turno: 1, eleicoes: ELEICOES, coorte: c, leituras: leiturasOk(), agora: new Date() })
    const fallback = plano.mudancas.find((m) => m.slug === "sen-eleito")
    assert.deepEqual([fallback?.fase_depois, fallback?.sq, fallback?.sq_antes, fallback?.fonte, fallback?.situacao_tse], ["fora_da_disputa", null, " ", null, null])
    assert.equal(plano.sem_resultado[0]?.motivo, "ficha sem sq_candidato_2026")
    const generated = gerarArquivosFase({ plano, version: "20261005120000", predecessor: { version: "20260927050000", name: "candidaturas_fase_2026_schema" } })
    assert.match(generated.migration, /'sen-eleito', NULL, ' ', 'Senador', 'em_disputa', 'fora_da_disputa'[\s\S]*NULL, NULL, NULL/)
    assert.match(generated.readback, /IS DISTINCT FROM linha->'after'/)
    assert.match(generated.rollbackReadback, /IS DISTINCT FROM linha->'before'/)
  })

  it("2º turno só resolve quem foi para o 2º turno e encerra os dois finalistas", () => {
    const c = coorte().map((x) => x.slug.startsWith("gov-2t") ? { ...x, fase_eleitoral: "segundo_turno" } : { ...x, fase_eleitoral: "nao_eleito", atualizacao_encerrada_em: "2026-10-05" })
    assert.deepEqual(candidaturasDoTurno(2, c).map((x) => x.slug), ["gov-2t-a", "gov-2t-b"])
    const eleicoes2 = { ...ELEICOES, turno: 2 as const, federal: "701", estadual: "703" }
    const alvos = arquivosNecessariosDoTurno(eleicoes2, c)
    assert.deepEqual(alvos.map((a) => a.chave), ["Governador:SP"])
    const gov2 = alvos[0]
    const corpo = JSON.parse(arquivo(gov2, [{ sqcand: "250000000003", e: "s", st: "Eleito" }, { sqcand: "250000000004", e: "n", st: "Não eleito" }]))
    corpo.t = "2"
    const plano = montarPlano({ turno: 2, eleicoes: eleicoes2, coorte: c,
      leituras: [lerArquivoResultado(gov2, 2, JSON.stringify(corpo))], agora: new Date() })
    assert.deepEqual(plano.mudancas.map((m) => [m.slug, m.fase_depois, m.encerra_atualizacao]), [["gov-2t-a", "eleito", true], ["gov-2t-b", "nao_eleito", true]])
  })

  it("pendência executiva impede gerar qualquer marcação de resultado", () => {
    const c = coorte()
    c[2] = { ...c[2], sq_candidato_2026: "999999999999" }
    const plano = montarPlano({ turno: 1, eleicoes: ELEICOES, coorte: c, leituras: leiturasOk(), agora: new Date() })
    assert.equal(plano.status, "parcial")
    assert.deepEqual(plano.pendentes, [{ slug: "gov-2t-a", cargo: "Governador", abrangencia: "SP", motivo: "SQ ausente do resultado oficial" }])
    assert.equal(plano.mudancas.some((m) => m.slug === "gov-2t-b"), true)
    assert.throws(() => gerarArquivosFase({ plano, version: "20261005120000", predecessor: { version: "20260927050000", name: "candidaturas_fase_2026_schema" } }), /plano incompleto/)
  })
})

describe("migration de resultado gerada", () => {
  const plano = () => montarPlano({ turno: 1, eleicoes: ELEICOES, coorte: coorte(), leituras: leiturasOk(), agora: new Date("2026-10-05T12:00:00Z") })
  const predecessor = { version: "20260927050000", name: "candidaturas_fase_2026_schema" }

  it("recusa todas as mudanças de um plano parcial", () => {
    const p = plano()
    p.status = "parcial"
    p.pendentes = [{ slug: "pres-nao-resolvido", cargo: "Presidente", abrangencia: "BR", motivo: "SQ ausente do resultado oficial" }]
    assert.throws(() => gerarArquivosFase({ plano: p, version: "20261005120000", predecessor }), /plano incompleto/)
  })

  it("recusa versão anterior ao predecessor", () => {
    assert.throws(() => gerarArquivosFase({ plano: plano(), version: "20260901000000", predecessor }), /posterior/)
  })

  it("gera migration com guards, CAS, recibo, allowlist e manifesto", () => {
    const a = gerarArquivosFase({ plano: plano(), version: "20261005120000", predecessor })
    assert.equal(a.nome, "20261005120000_fase_eleitoral_turno_1")
    assert.match(a.migration, /current_setting\('pf\.replay', true\) = 'true'/)
    assert.match(a.migration, /IF NOT EXISTS \(SELECT 1 FROM public\.candidatos\) THEN/)
    assert.match(a.migration, /escrita esperada=7/)
    assert.match(a.migration, /candidatura já tem fase gravada/)
    assert.match(a.migration, /-- @write tabela=candidaturas_fase_2026 ref=fase-turno-1-20261005120000/)
    assert.match(a.migration, /-- @write tabela=coleta_log ref=migration:20261005120000/)
    assert.equal((a.migration.match(/^BEGIN;$/gm) ?? []).length, 1)
    assert.equal((a.migration.match(/^COMMIT;$/gm) ?? []).length, 1)
    assert.match(a.rollback, /IS DISTINCT FROM '20261005120000'/)
    assert.deepEqual(a.manifesto, { conjunto: "turno-1", base_version: "20260927050000", base_name: "candidaturas_fase_2026_schema",
      migrations: [{ version: "20261005120000", name: "fase_eleitoral_turno_1" }], plano_sha256: a.manifesto.plano_sha256 })
    assert.deepEqual((a.allowlist.referencias as Array<{ ref: string }>).map((r) => r.ref), ["fase-turno-1-20261005120000", "migration:20261005120000"])
    assert.deepEqual(a.recorte, { nome: "fase-eleitoral-turno-1-20261005", desde: "20261005120000", ate: "20261005120000",
      allowlist: "scripts/audit/allowlist-fase-eleitoral-turno-1-20261005.json", divida: null })
  })
})

describe("resultados TSE: 100% das seções sem fechamento oficial (decisão de 05/10/2026)", () => {
  const semSituacao = (cands: Array<{ sqcand: string; vap: string; dvt?: string }>) =>
    cands.map((c) => ({ sqcand: c.sqcand, e: "n", st: "", vap: c.vap, dvt: c.dvt }))

  it("sem a opção, tf = n continua recusado mesmo a 100%", () => {
    const corpo = arquivo(presidente, semSituacao([{ sqcand: "280000000006", vap: "470" }, { sqcand: "280000000007", vap: "450" }, { sqcand: "280000000009", vap: "80" }]), { tf: "n" })
    assert.equal(lerArquivoResultado(presidente, 1, corpo).ok, false)
  })

  it("com a opção, calcula 2º turno entre os dois mais votados e marca faseCalculada", () => {
    const corpo = arquivo(presidente, semSituacao([{ sqcand: "280000000006", vap: "470" }, { sqcand: "280000000007", vap: "450" }, { sqcand: "280000000009", vap: "80" }]), { tf: "n" })
    const l = lerArquivoResultado(presidente, 1, corpo, { aceitarTotalizado: true })
    assert.equal(l.ok, true)
    if (!l.ok) return
    assert.deepEqual([l.final, l.faseCalculada], [false, true])
    assert.deepEqual(l.candidatos.map((c) => [c.sq, classificarCandidato(c, 1)]), [
      ["280000000006", "segundo_turno"], ["280000000007", "segundo_turno"], ["280000000009", "nao_eleito"],
    ])
  })

  it("com a opção, mas seções faltando, recusa", () => {
    const corpo = arquivo(presidente, semSituacao([{ sqcand: "280000000006", vap: "470" }, { sqcand: "280000000007", vap: "450" }]), { tf: "n", st: "999" })
    assert.equal(lerArquivoResultado(presidente, 1, corpo, { aceitarTotalizado: true }).ok, false)
  })

  it("maioria absoluta dos válidos elege no 1º turno", () => {
    const r = situacaoPorCalculo("Governador", [cr({ sq: "1", eleito: false, situacao: "", votos: 510 }), cr({ sq: "2", eleito: false, situacao: "", votos: 490 })], 1)
    assert.deepEqual(r?.map((c) => [c.sq, c.situacao, c.eleito]), [["1", "Eleito", true], ["2", "Não eleito", false]])
  })

  it("Senado elege os dois mais votados; voto anulado fica fora", () => {
    const r = situacaoPorCalculo("Senador", [
      cr({ sq: "1", eleito: false, situacao: "", votos: 300 }), cr({ sq: "2", eleito: false, situacao: "", votos: 200 }),
      cr({ sq: "3", eleito: false, situacao: "", votos: 100 }), cr({ sq: "4", eleito: false, situacao: "", votos: 50, destinacao: "Anulado sub judice" }),
    ], 2)
    assert.deepEqual(r?.map((c) => c.situacao), ["Eleito", "Eleito", "Não eleito", "Não eleito"])
  })

  it("recusa quando voto sub judice, se voltar a valer, muda o desfecho", () => {
    const r = situacaoPorCalculo("Senador", [
      cr({ sq: "1", eleito: false, situacao: "", votos: 300 }), cr({ sq: "2", eleito: false, situacao: "", votos: 200 }),
      cr({ sq: "4", eleito: false, situacao: "", votos: 250, destinacao: "Anulado sub judice" }),
    ], 2)
    assert.equal(r, null)
  })

  it("recusa empate na disputa pelo 2º lugar", () => {
    const r = situacaoPorCalculo("Presidente", [
      cr({ sq: "1", eleito: false, situacao: "", votos: 400 }), cr({ sq: "2", eleito: false, situacao: "", votos: 300 }), cr({ sq: "3", eleito: false, situacao: "", votos: 300 }),
    ], 1)
    assert.equal(r, null)
  })
})

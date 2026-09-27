import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  arquivosDoTurno,
  candidaturasDoTurno,
  checarSanidade,
  classificarCandidato,
  descobrirEleicoes,
  lerArquivoResultado,
  montarPlano,
  urlResultado,
  type ArquivoAlvo,
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

type Cand = { sqcand: string; e: string; st: string; dvt?: string }
function arquivo(a: ArquivoAlvo, cands: Cand[], extra: Record<string, string> = {}): string {
  const codigo = { Presidente: "1", Governador: "3", Senador: "5" }[a.cargo]
  return JSON.stringify({
    ele: a.eleicao, carper: codigo, cdabr: a.abrangencia === "BR" ? "br" : a.abrangencia, t: "1", f: "o", tf: "s",
    s: "1000", st: "1000", dg: "05/10/2026", hg: "01:02:03",
    cand: cands.map((c, i) => ({ seq: String(i + 1), sqcand: c.sqcand, n: String(10 + i), nm: `NOME ${i}`, e: c.e, st: c.st, dvt: c.dvt ?? "Válido", vap: "1" })),
    ...extra,
  })
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

  it("monta a URL no formato de 2022", () => {
    assert.equal(urlResultado("ele2022", "546", "SP", "Senador"),
      "https://resultados.tse.jus.br/oficial/ele2022/546/dados-simplificados/sp/sp-c0005-e000546-r.json")
    assert.equal(urlResultado("ele2022", "544", "BR", "Presidente"),
      "https://resultados.tse.jus.br/oficial/ele2022/544/dados-simplificados/br/br-c0001-e000544-r.json")
  })

  it("no 2º turno não pede arquivo de Senado", () => {
    const alvos = arquivosDoTurno({ ...ELEICOES, turno: 2, federal: "701", estadual: "703" }, [{ cargo: "Senador", uf: "SP" }, { cargo: "Governador", uf: "SP" }])
    assert.deepEqual(alvos.map((a) => a.chave), ["Governador:SP"])
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
    assert.match(checarSanidade("Governador", 1, fases.map((f, i) => ({ sq: String(i), numero: "", nome: "", eleito: true, situacao: f.st, destinacao: "Válido" }))) ?? "", /3 no 2º turno/)
  })

  it("classifica anulado como fora da disputa e não chuta situação desconhecida", () => {
    assert.equal(classificarCandidato({ sq: "1", numero: "", nome: "", eleito: false, situacao: "Não eleito", destinacao: "Anulado sub judice" }, 1), "fora_da_disputa")
    assert.equal(classificarCandidato({ sq: "1", numero: "", nome: "", eleito: false, situacao: "#", destinacao: "Válido" }, 1), null)
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

  it("403 num arquivo não marca ninguém daquele arquivo e deixa o plano parcial", () => {
    const leituras = leiturasOk()
    leituras[0] = { ok: false, alvo: senadoSP, motivo: "HTTP 403" }
    const plano = montarPlano({ turno: 1, eleicoes: ELEICOES, coorte: coorte(), leituras, agora: new Date() })
    assert.equal(plano.status, "parcial")
    assert.equal(plano.mudancas.some((m) => m.cargo === "Senador"), false)
    assert.deepEqual(plano.pendentes.filter((p) => p.cargo === "Senador").map((p) => p.motivo), ["arquivo recusado: HTTP 403", "arquivo recusado: HTTP 403"])
  })

  it("SQ ausente do resultado fica pendente, nunca marcado", () => {
    const c = coorte()
    c[0] = { ...c[0], sq_candidato_2026: "250099999999" }
    const plano = montarPlano({ turno: 1, eleicoes: ELEICOES, coorte: c, leituras: leiturasOk(), agora: new Date() })
    assert.deepEqual(plano.pendentes.map((p) => [p.slug, p.motivo]), [["sen-eleito", "SQ ausente do resultado oficial"]])
  })

  it("2º turno só resolve quem foi para o 2º turno e encerra os dois finalistas", () => {
    const c = coorte().map((x) => x.slug.startsWith("gov-2t") ? { ...x, fase_eleitoral: "segundo_turno" } : { ...x, fase_eleitoral: "nao_eleito", atualizacao_encerrada_em: "2026-10-05" })
    assert.deepEqual(candidaturasDoTurno(2, c).map((x) => x.slug), ["gov-2t-a", "gov-2t-b"])
    const gov2 = { ...governoSP, eleicao: "703", url: urlResultado("ele2026", "703", "SP", "Governador") }
    const corpo = JSON.parse(arquivo(gov2, [{ sqcand: "250000000003", e: "s", st: "Eleito" }, { sqcand: "250000000004", e: "n", st: "Não eleito" }]))
    corpo.t = "2"
    const plano = montarPlano({ turno: 2, eleicoes: { ...ELEICOES, turno: 2, federal: "701", estadual: "703" }, coorte: c,
      leituras: [lerArquivoResultado(gov2, 2, JSON.stringify(corpo))], agora: new Date() })
    assert.deepEqual(plano.mudancas.map((m) => [m.slug, m.fase_depois, m.encerra_atualizacao]), [["gov-2t-a", "eleito", true], ["gov-2t-b", "nao_eleito", true]])
  })
})

describe("migration de resultado gerada", () => {
  const plano = () => montarPlano({ turno: 1, eleicoes: ELEICOES, coorte: coorte(), leituras: leiturasOk(), agora: new Date("2026-10-05T12:00:00Z") })
  const predecessor = { version: "20260927030000", name: "candidaturas_fase_2026_schema" }

  it("recusa plano parcial sem exceção", () => {
    const p = plano()
    p.status = "parcial"
    assert.throws(() => gerarArquivosFase({ plano: p, version: "20261005120000", predecessor }), /plano parcial/)
    assert.throws(() => gerarArquivosFase({ plano: p, version: "20261005120000", predecessor, aceitarParcial: true } as unknown as Parameters<typeof gerarArquivosFase>[0]), /plano parcial/)
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
    assert.deepEqual(a.manifesto, { conjunto: "turno-1", base_version: "20260927030000", base_name: "candidaturas_fase_2026_schema",
      migrations: [{ version: "20261005120000", name: "fase_eleitoral_turno_1" }], plano_sha256: a.manifesto.plano_sha256 })
    assert.deepEqual((a.allowlist.referencias as Array<{ ref: string }>).map((r) => r.ref), ["fase-turno-1-20261005120000", "migration:20261005120000"])
    assert.deepEqual(a.recorte, { nome: "fase-eleitoral-turno-1-20261005", desde: "20261005120000", ate: "20261005120000",
      allowlist: "scripts/audit/allowlist-fase-eleitoral-turno-1-20261005.json", divida: null })
  })
})

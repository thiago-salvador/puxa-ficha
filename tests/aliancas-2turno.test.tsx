// cspell:ignore liberou cappelli garotinho zema flavio cury
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"

import {
  apoiosGovernador,
  barraEliminados,
  formatarColeta,
  formatarDiaDeclaracao,
  getAliancas2Turno,
  montarMeuCandidatoSaiu,
  normalizarNomeUrna,
  ressalvaSubJudice,
  rotuloPosicao,
  textoRessalvaSubJudice,
  validarAliancas,
} from "@/lib/aliancas-2turno"
import { getDisputa1Turno, getResultados1Turno, type CandidatoResultado1Turno, type DisputaResultado1Turno } from "@/lib/resultados-1turno"
import { Aliancas2TurnoSecao } from "@/components/Aliancas2Turno"
import { Governadores2Turno } from "@/components/SegundoTurnoGovernadores"
import { RessalvaSubJudice } from "@/components/RessalvaSubJudice"

const data = getResultados1Turno()
const bruto = JSON.parse(readFileSync("src/data/aliancas-2turno-2026.json", "utf8")) as { itens: Array<Record<string, unknown>> } & Record<string, unknown>
const copia = () => JSON.parse(JSON.stringify(bruto)) as typeof bruto
const presidente = getDisputa1Turno("Presidente", "BR", data)!

function comItem(mudar: (itens: Array<Record<string, unknown>>) => void) {
  const c = copia()
  mudar(c.itens)
  return validarAliancas(c, data)
}

const indice = (quem: string) => bruto.itens.findIndex((i) => i.quem === quem)

describe("alianças do 2º turno: carregador estrito", () => {
  it("o arquivo do repositório passa e casa todos os candidatos com o snapshot", () => {
    const a = getAliancas2Turno(data)
    assert.ok(a)
    assert.equal(a.itens.length, bruto.itens.length)
    assert.deepEqual(a.itens.filter((i) => i.fora_do_resultado).map((i) => i.quem), [])
    const zema = a.itens.find((i) => i.quem === "ZEMA")!
    assert.equal(zema.apoia_nome_urna, "FLAVIO BOLSONARO", "acento do arquivo não impede o casamento")
  })

  it("normaliza acento, caixa e pontuação", () => {
    assert.equal(normalizarNomeUrna("  Flávio   Bolsonaro "), "FLAVIO BOLSONARO")
    assert.equal(normalizarNomeUrna("DR.LUISINHO"), "DR LUISINHO")
  })

  it("falha fechado: posição fora do enum, apoio sem alvo, alvo que não é finalista", () => {
    assert.equal(comItem((it) => { it[0].posicao = "talvez" }), null)
    assert.equal(comItem((it) => { it[indice("ZEMA")].apoia = null }), null, "apoio sem apoia")
    assert.equal(comItem((it) => { it[0].apoia = "LULA" }), null, "apoia com posição neutro")
    assert.equal(comItem((it) => { it[indice("ZEMA")].apoia = "RONALDO CAIADO" }), null, "apoia quem não está no 2º turno")
    assert.equal(comItem((it) => { it[0].tipo = "pessoa" }), null)
    assert.equal(comItem((it) => { it[0].disputa = "Senador" }), null)
    assert.equal(comItem((it) => { it[0].data_declaracao = "04/10/2026" }), null)
  })

  it("falha fechado: posição declarada sem fonte https com trecho", () => {
    assert.equal(comItem((it) => { it[0].fontes = [] }), null)
    assert.equal(comItem((it) => { (it[0].fontes as Array<Record<string, unknown>>).forEach((f) => { f.trecho = "" }) }), null)
    assert.equal(comItem((it) => { (it[0].fontes as Array<Record<string, unknown>>)[0].url = "http://g1.globo.com/x" }), null)
    // Sem declaração não exige fonte.
    assert.ok(comItem((it) => { it[indice("SAMARA")].fontes = [] }))
  })

  it("falha fechado: item repetido e arquivo sem cabeçalho", () => {
    assert.equal(comItem((it) => { it.push({ ...it[0] }) }), null)
    assert.equal(validarAliancas({ ...copia(), versao: 2 }, data), null)
    assert.equal(validarAliancas({ ...copia(), coletado_em: "ontem" }, data), null)
    assert.equal(validarAliancas(null, data), null)
  })

  it("candidato sem par no resultado fica marcado e fora da conta de votos", () => {
    const a = comItem((it) => { it[indice("ZEMA")].quem = "FULANO DE TAL" })!
    const fulano = a.itens.find((i) => i.quem === "FULANO DE TAL")!
    assert.equal(fulano.fora_do_resultado, true)
    const barra = barraEliminados(a, presidente)!
    assert.equal(barra.segmentos.find((s) => s.chave === "a")!.votos, 0, "o apoio de quem não casou não pinta a barra")
  })

  it("casa nome curto do TSE com o nome completo do arquivo só no mesmo partido", () => {
    const a = getAliancas2Turno(data)!
    const cappelli = a.itens.find((i) => i.quem === "RICARDO CAPPELLI")!
    assert.ok(cappelli.sq)
    const outroPartido = comItem((it) => { it[indice("RICARDO CAPPELLI")].partido = "PT" })!
    assert.equal(outroPartido.itens.find((i) => i.quem === "RICARDO CAPPELLI")!.fora_do_resultado, true)
  })
})

describe("barra dos votos dos eliminados", () => {
  it("soma os votos dos 10 eliminados sobre os válidos do snapshot, por posição declarada", () => {
    const a = getAliancas2Turno(data)!
    const barra = barraEliminados(a, presidente)!
    const eliminados = presidente.candidatos.filter((c) => c.fase === "nao_eleito")
    const soma = eliminados.reduce((n, c) => n + c.votos, 0)
    assert.equal(barra.votos, soma)
    assert.equal(barra.percentual, (soma / presidente.totais.votos_validos!) * 100)
    assert.equal(barra.percentual.toFixed(2), "7.81")
    const por = Object.fromEntries(barra.segmentos.map((s) => [s.chave, s]))
    assert.deepEqual(por.a.nomes, ["Zema"])
    assert.equal(por.b.votos, 0)
    assert.deepEqual(por.neutro.nomes, ["Escritor Augusto Cury", "Renan Santos"])
    assert.equal(por.sem.nomes.length, 7)
    assert.equal(barra.segmentos.reduce((n, s) => n + s.votos, 0), soma)
  })

  it("sem finalistas ou sem eliminados não há barra", () => {
    const a = getAliancas2Turno(data)!
    const sem2Turno: DisputaResultado1Turno = { ...presidente, candidatos: presidente.candidatos.map((c) => ({ ...c, fase: c.fase === "segundo_turno" ? "eleito" : c.fase })) }
    assert.equal(barraEliminados(a, sem2Turno), null)
    assert.equal(barraEliminados(a, null), null)
  })
})

describe("formatos e rótulos", () => {
  it("coleta em horário de Brasília e dia da declaração", () => {
    assert.equal(formatarColeta("2026-10-05T21:50:00-03:00"), "05/10, 21h50")
    assert.equal(formatarColeta("2026-10-06T00:50:00Z"), "05/10, 21h50")
    assert.equal(formatarDiaDeclaracao("2026-10-04"), "04/10")
    assert.equal(formatarDiaDeclaracao(null), null)
  })

  it("rótulo da posição", () => {
    assert.equal(rotuloPosicao({ posicao: "apoio", apoia: "FLÁVIO BOLSONARO", apoia_nome_urna: "FLAVIO BOLSONARO" }), "Apoia Flavio Bolsonaro")
    assert.equal(rotuloPosicao({ posicao: "liberou", apoia: null, apoia_nome_urna: null }), "Liberou o voto")
    assert.equal(rotuloPosicao({ posicao: "voto_nulo", apoia: null, apoia_nome_urna: null }), "Defende voto nulo")
    assert.equal(rotuloPosicao(null), "Sem declaração")
  })
})

describe("Meu candidato saiu: dados do seletor", () => {
  const a = getAliancas2Turno(data)!
  const dados = montarMeuCandidatoSaiu(a, data)!

  it("Presidente primeiro, depois só os governos com 2º turno, sem finalistas na lista", () => {
    assert.equal(dados.coleta, "05/10, 21h50")
    const grupos = [...new Set(dados.opcoes.map((o) => o.grupo))]
    assert.equal(grupos[0], "Presidente")
    assert.deepEqual(grupos.slice(1), ["Governador, Acre", "Governador, Amazonas", "Governador, Distrito Federal", "Governador, Espírito Santo", "Governador, Rio de Janeiro", "Governador, Rio Grande do Norte", "Governador, Tocantins"])
    assert.equal(dados.opcoes.filter((o) => o.grupo === "Presidente").length, 10)
    const nomes = dados.opcoes.map((o) => o.nome)
    for (const finalista of ["Flavio Bolsonaro", "Lula", "Douglas Ruas", "Eduardo Paes"]) assert.ok(!nomes.includes(finalista))
    assert.ok(!dados.opcoes.some((o) => o.nome === "Garotinho"), "anulado sub judice não é eliminado com voto válido")
  })

  it("governador eliminado entra com 0,5% ou mais, ou quando está no arquivo", () => {
    const ac = dados.opcoes.filter((o) => o.grupo === "Governador, Acre").map((o) => o.nome)
    assert.deepEqual(ac, ["Tião Bocalom", "Thor Dantas"], "Eudo Raffael (0,16%) e Dr.luisinho ficam fora")
    const am = dados.opcoes.filter((o) => o.grupo === "Governador, Amazonas").map((o) => o.nome)
    assert.ok(am.includes("Isael Munduruku"), "0,55% passa do piso")
  })

  it("opção com apoio declarado traz fonte, data e confronto; sem declaração traz o horário da coleta", () => {
    const zema = dados.opcoes.find((o) => o.nome === "Zema")!
    assert.equal(zema.posicao.rotulo, "Apoia Flavio Bolsonaro")
    assert.equal(zema.posicao.data, "05/10")
    assert.match(zema.posicao.fonte?.url ?? "", /^https:\/\//)
    assert.ok(zema.posicao.fonte?.trecho)
    assert.equal(zema.confronto.href, "#lado-a-lado")
    assert.deepEqual(zema.finalistas.map((f) => f.slug), ["flavio-bolsonaro", "lula"])
    const zemaNoSnapshot = presidente.candidatos.find((c) => c.nome_urna === "ZEMA")!
    assert.equal(zema.percentual, "0,27%")
    assert.equal(zema.votos, new Intl.NumberFormat("pt-BR").format(zemaNoSnapshot.votos))

    const siri = dados.opcoes.find((o) => o.nome === "William Siri")!
    assert.equal(siri.posicao.declarada, false)
    assert.equal(siri.posicao.rotulo, "Sem declaração pública até 05/10, 21h50")
    assert.equal(siri.posicao.fonte, null)
    // Quem não está no levantamento não ganha "sem declaração pública": ninguém procurou.
    const foraDoLevantamento = dados.opcoes.find((o) => o.nome === "Coronel Busnello")!
    assert.equal(foraDoLevantamento.posicao.declarada, false)
    assert.equal(foraDoLevantamento.posicao.rotulo, "Posição não levantada pelo Puxa Ficha")
    assert.equal(siri.confronto.href, "/1o-turno/rj")
    assert.equal(siri.confronto.rotulo, "Governador Rio de Janeiro: Douglas Ruas x Eduardo Paes")
  })

  it("é serializável e some sem alianças válidas", () => {
    assert.deepEqual(JSON.parse(JSON.stringify(dados)), dados)
    assert.equal(montarMeuCandidatoSaiu(null, data), null)
  })
})

function cand(p: Partial<CandidatoResultado1Turno> & Pick<CandidatoResultado1Turno, "sq" | "nome_urna" | "votos">): CandidatoResultado1Turno {
  return { numero: "1", nome: p.nome_urna, partido: "ABC", percentual_validos: null, posicao: null, situacao_tse: "", destinacao: "Válido", fase: "nao_eleito", slug: null, companheiros: [], ...p }
}

describe("ressalva de votos anulados sub judice", () => {
  it("RJ real: Douglas Ruas passa de 50% sem os votos de Garotinho", () => {
    const rj = getDisputa1Turno("Governador", "RJ", data)!
    const r = ressalvaSubJudice(rj)!
    const ruas = rj.candidatos.find((c) => c.nome_urna === "DOUGLAS RUAS")!
    const garotinho = rj.candidatos.find((c) => c.nome_urna === "GAROTINHO")!
    assert.equal(r.votosAnulados, garotinho.votos)
    assert.equal(r.percentualSemAnulados, (ruas.votos / rj.totais.votos_validos!) * 100)
    assert.equal(r.percentualSemAnulados.toFixed(2), "50.88")
    assert.equal(
      textoRessalvaSubJudice(r),
      `O TSE ainda conta no cálculo os ${new Intl.NumberFormat("pt-BR").format(garotinho.votos)} votos de Garotinho, anulados sub judice. Sem eles, Douglas Ruas teria 50,88% dos válidos: se a anulação for confirmada, a disputa pode terminar no 1º turno.`,
    )
  })

  it("só o RJ tem a ressalva entre as disputas do snapshot (DF tem anulados, mas fica abaixo de 50%)", () => {
    const com = data.disputas.filter((d) => ressalvaSubJudice(d)).map((d) => `${d.cargo}:${d.uf}`)
    assert.deepEqual(com, ["Governador:RJ"])
  })

  it("caso sintético sem ressalva: sem anulados, líder abaixo de 50% ou % do TSE incoerente", () => {
    const base = (anuladoVotos: number, liderVotos: number, liderPct: number): DisputaResultado1Turno => ({
      ...getDisputa1Turno("Governador", "RJ", data)!,
      totais: { ...getDisputa1Turno("Governador", "RJ", data)!.totais, votos_validos: 1000 },
      candidatos: [
        cand({ sq: "1", nome_urna: "A", votos: liderVotos, percentual_validos: liderPct, fase: "segundo_turno" }),
        cand({ sq: "2", nome_urna: "B", votos: 1000 - liderVotos, percentual_validos: 10, fase: "segundo_turno" }),
        cand({ sq: "3", nome_urna: "C", votos: anuladoVotos, destinacao: "Anulado sub judice", fase: "fora_da_disputa" }),
      ],
    })
    assert.ok(ressalvaSubJudice(base(100, 510, (510 / 1100) * 100)), "controle: 51% sem os anulados")
    assert.equal(ressalvaSubJudice(base(0, 510, 51)), null, "sem votos anulados")
    assert.equal(ressalvaSubJudice(base(100, 480, (480 / 1100) * 100)), null, "48% mesmo sem os anulados")
    assert.equal(ressalvaSubJudice(base(100, 510, 51)), null, "% do TSE não inclui os anulados: não afirma nada")
    assert.equal(ressalvaSubJudice(null), null)
  })
})

describe("renderização", () => {
  it("seção agrupa os eliminados pela posição, com o % de cada grupo e o aviso de que apoio não transfere votos", () => {
    const html = renderToStaticMarkup(<Aliancas2TurnoSecao aliancas={getAliancas2Turno(data)!} disputa={presidente} data={data} />)
    assert.match(html, /Quem apoia quem/)
    assert.match(html, /Apoio declarado não transfere votos\./)
    assert.match(html, /Sem declaração encontrada não significa neutralidade\./)
    assert.equal((html.match(/data-pf-eliminado=/g) ?? []).length, 10)
    const grupos = [...html.matchAll(/data-pf-grupo="(\w+)"/g)].map((m) => m[1])
    assert.deepEqual(grupos, ["a", "neutro", "b", "sem"])
    const pcts = [...html.matchAll(/data-pf-grupo-percentual="true">([\d,]+%)/g)].map((m) => m[1])
    const somaGrupos = pcts.reduce((n, p) => n + Number(p.replace("%", "").replace(",", ".")), 0)
    assert.ok(Math.abs(somaGrupos - 7.81) < 0.03, `soma dos grupos ${somaGrupos}`)
    assert.match(html, /Consulta em 05\/10, 21h50/)
    assert.match(html, /data-pf-meu-candidato-saiu/)
    assert.doesNotMatch(html, /vão para|migram|transferem para/i)
  })

  it("duelo de governador ganha a linha de apoio só no DF e a ressalva só no RJ", () => {
    const html = renderToStaticMarkup(<Governadores2Turno candidatos={[]} data={data} aliancas={getAliancas2Turno(data)} />)
    assert.deepEqual([...html.matchAll(/data-pf-apoio-governador="(\w+)"/g)].map((m) => m[1]), ["DF"])
    assert.match(html, /Apoio declarado: <span[^>]*>Ricardo Cappelli<\/span> \(PSB\) a <span[^>]*>Leandro Grass<\/span>/)
    assert.equal((html.match(/data-pf-ressalva-sub-judice/g) ?? []).length, 1)
    const semAliancas = renderToStaticMarkup(<Governadores2Turno candidatos={[]} data={data} aliancas={null} />)
    assert.doesNotMatch(semAliancas, /data-pf-apoio-governador/)
  })

  it("ressalva não renderiza nada fora do caso", () => {
    assert.equal(renderToStaticMarkup(<RessalvaSubJudice disputa={getDisputa1Turno("Governador", "DF", data)} />), "")
  })

  it("apoios por UF vêm só de candidatos com apoio declarado", () => {
    const a = getAliancas2Turno(data)
    assert.deepEqual(apoiosGovernador(a, "df").map((i) => i.quem), ["RICARDO CAPPELLI"])
    assert.deepEqual(apoiosGovernador(a, "RJ"), [])
    assert.deepEqual(apoiosGovernador(null, "DF"), [])
  })
})

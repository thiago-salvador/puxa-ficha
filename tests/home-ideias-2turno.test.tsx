import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { describe, it } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import { alvosPresidentePorUf, finalistasDoBrasil, lerPresidenteUf } from "../scripts/lib/resultados-snapshot"
import { lerHistoricoTotalizacao2022 } from "../scripts/lib/referencia-2022-presidente"
import { deltaPontos, formatarDeltaPontos, getReferencia2022 } from "@/lib/referencia-2022"
import { numerosHero1Turno } from "@/lib/home-eleicao-2026"
import {
  escalarSerie,
  formatarDataEixo,
  formatarVantagem,
  serieDasPesquisas,
  vantagemNoDuelo,
  type Pesquisa2TurnoLinha,
} from "@/lib/segundo-turno-2026"
import { formatarMargem, montarMapaPresidente } from "@/lib/mapa-presidente-uf"
import { MEU_ESTADO_CHAVE, lerUfSalva, ordenarComMeuEstado, salvarUf } from "@/lib/meu-estado"
import { modoCompartilhar, nomeLegivel, textoDoDuelo } from "@/lib/compartilhar-duelo"
import { COR_ESPECTRO_HEX, coresDosFinalistas } from "@/lib/cores-finalistas"
import { getResultados1Turno, type CandidatoResultado1Turno, type DisputaResultado1Turno, type PresidenteUf1Turno, type Resultados1Turno } from "@/lib/resultados-1turno"
import { MapaPresidente1Turno } from "@/components/MapaPresidente1Turno"
import { Pesquisas2Turno } from "@/components/SegundoTurnoPresidente"
import { Governadores2Turno } from "@/components/SegundoTurnoGovernadores"
import { HomeHero2026 } from "@/components/HomeHero2026"
import { FaixaFixa2Turno } from "@/components/FaixaFixa2Turno"

const ELEICOES = { ciclo: "ele2026", turno: 1 as const, data: "2026-10-04", federal: "6257", estadual: "6259" }

function arquivoUf(uf: string, opcoes: { st?: string; tf?: string; votosA?: string; votosB?: string; semFinalista?: boolean } = {}): string {
  const cand = (sq: string, nmu: string, vap: string, pvapn: string) => ({ n: "1", sqcand: sq, nm: nmu, nmu, dvt: "Válido", seq: "1", e: "s", st: "2º turno", vap, pvapn })
  return JSON.stringify({
    ele: "6257", t: "1", f: "o", cdabr: uf.toLowerCase(), dg: "05/10/2026", hg: "12:51:40", tf: opcoes.tf ?? "s",
    s: { ts: "10", st: opcoes.st ?? "10" },
    e: { te: "100", c: "80", a: "20" },
    v: { vv: "70", vb: "5", tvn: "5" },
    carg: [{
      cd: "1", nv: "1",
      agr: [
        { par: [{ sg: "PL", cand: [cand("280000000001", "FINALISTA A", opcoes.votosA ?? "40", opcoes.votosA === "30" ? "42,857142857" : "57,142857143")] }] },
        { par: [{ sg: "PT", cand: opcoes.semFinalista ? [] : [cand("280000000002", "FINALISTA B", opcoes.votosB ?? "25", opcoes.votosB === "35" ? "50,000000000" : "35,714285714")] }] },
        { par: [{ sg: "XYZ", cand: [cand("280000000003", "TERCEIRO", "5", "7,142857143")] }] },
      ],
    }],
  })
}

describe("snapshot: Presidente por UF", () => {
  it("27 arquivos da eleição federal, um por UF, sem o exterior", () => {
    const alvos = alvosPresidentePorUf(ELEICOES)
    assert.equal(alvos.length, 27)
    assert.ok(!alvos.some((a) => a.abrangencia === "ZZ"))
    assert.equal(alvos.find((a) => a.abrangencia === "SP")?.url, "https://resultados.tse.jus.br/oficial/ele2026/6257/dados/sp/sp-c0001-e006257-u.json")
  })

  it("guarda votos e % dos dois finalistas, o mais votado, a margem, o fechamento e a fonte com sha256", () => {
    const alvo = alvosPresidentePorUf(ELEICOES).find((a) => a.abrangencia === "AP")!
    const corpo = arquivoUf("AP")
    const r = lerPresidenteUf(alvo, corpo, ["280000000001", "280000000002"])
    assert.ok(typeof r !== "string", String(r))
    assert.equal(r.uf, "AP")
    assert.deepEqual(r.finalistas.map((f) => [f.nome_urna, f.partido, f.votos]), [["FINALISTA A", "PL", 40], ["FINALISTA B", "PT", 25]])
    assert.equal(r.vencedor.sq, "280000000001")
    assert.equal(r.margem_pp, 21.428571)
    assert.equal(r.fechamento_oficial, true)
    assert.equal(r.fonte.sha256, createHash("sha256").update(corpo).digest("hex"))
    assert.equal(r.fonte.gerado_tse, "05/10/2026 12:51:40")
  })

  it("a ordem dos finalistas é a do Brasil, mesmo quando o segundo vence na UF", () => {
    const alvo = alvosPresidentePorUf(ELEICOES).find((a) => a.abrangencia === "BA")!
    const r = lerPresidenteUf(alvo, arquivoUf("BA", { votosA: "30", votosB: "35" }), ["280000000001", "280000000002"])
    assert.ok(typeof r !== "string")
    assert.equal(r.finalistas[0].sq, "280000000001")
    assert.equal(r.vencedor.sq, "280000000002")
  })

  it("recusa totalização incompleta, abrangência trocada e finalista ausente", () => {
    const alvo = alvosPresidentePorUf(ELEICOES).find((a) => a.abrangencia === "AC")!
    assert.match(String(lerPresidenteUf(alvo, arquivoUf("AC", { st: "9", tf: "n" }), ["280000000001", "280000000002"])), /seções totalizadas 9 de 10/)
    assert.match(String(lerPresidenteUf(alvo, arquivoUf("AL"), ["280000000001", "280000000002"])), /abrangência/)
    assert.match(String(lerPresidenteUf(alvo, arquivoUf("AC", { semFinalista: true }), ["280000000001", "280000000002"])), /finalista do Brasil ausente/)
  })

  it("finalistas do Brasil saem da disputa nacional; sem dois, null", () => {
    const br = { cargo: "Presidente", uf: "BR", candidatos: [{ sq: "1", fase: "segundo_turno" }, { sq: "2", fase: "segundo_turno" }, { sq: "3", fase: "nao_eleito" }] }
    assert.deepEqual(finalistasDoBrasil({ disputas: [br] as unknown as DisputaResultado1Turno[] }), ["1", "2"])
    assert.equal(finalistasDoBrasil({ disputas: [] }), null)
  })

  it("contrato do arquivo commitado: 27 UFs com fonte do TSE, margem coerente e finalistas iguais aos do Brasil", () => {
    const data = getResultados1Turno()
    const porUf = data.presidente_por_uf ?? []
    assert.equal(porUf.length, 27)
    const finalistas = finalistasDoBrasil(data)
    assert.ok(finalistas)
    for (const u of porUf) {
      assert.match(u.fonte.url, new RegExp(`^https://resultados\\.tse\\.jus\\.br/oficial/ele2026/6257/dados/${u.uf.toLowerCase()}/${u.uf.toLowerCase()}-c0001-e006257-u\\.json$`))
      assert.match(u.fonte.sha256, /^[0-9a-f]{64}$/)
      assert.equal(u.secoes, u.secoes_totalizadas, `${u.uf}: totalização incompleta`)
      assert.deepEqual(u.finalistas.map((f) => f.sq), finalistas)
      assert.ok(u.margem_pp >= 0)
      const vencedorFinalista = u.finalistas.find((f) => f.sq === u.vencedor.sq)
      if (vencedorFinalista) {
        const outro = u.finalistas.find((f) => f.sq !== u.vencedor.sq)!
        assert.ok(Math.abs(u.margem_pp - ((u.vencedor.percentual_validos ?? 0) - (outro.percentual_validos ?? 0))) < 1e-5, `${u.uf}: margem`)
      }
    }
  })
})

const CSV_2022 = [
  "DT_TOTALIZACAO     ;QT_SECOES_TOTAL;QT_APTOS_TOTAL;QT_SECOES_TOT;QT_SECOES_TOT_ACUMULADO;PE_SECOES_TOT_ACUMULADO   ;QT_VOTOS_TOTAL_ACUMULADO;BRANCO_QT_VOTOS_TOT_ACUMULADO;BRANCO_PE_VOTOS_TOT_ACUMULADO;NULO_QT_VOTOS_TOT_ACUMULADO;NULO_PE_VOTOS_TOT_ACUMULADO",
  "02/10/2022 17:30:00;10;1000;5;5;0,500000;400;10;0,025000;20;0,050000",
  "02/10/2022 23:00:00;10;1000;5;10;1,000000;800;16;0,020000;40;0,050000",
].join("\r\n")

describe("referência 2022", () => {
  it("lê a última linha com 100% das seções e calcula na base do arquivo de 2026", () => {
    const r = lerHistoricoTotalizacao2022(CSV_2022)
    assert.deepEqual(
      [r.eleitorado, r.comparecimento, r.abstencao, r.percentual_comparecimento, r.percentual_abstencao, r.percentual_brancos, r.percentual_nulos, r.totalizacao_tse],
      [1000, 800, 200, 80, 20, 2, 5, "02/10/2022 23:00:00"],
    )
  })

  it("recusa coluna ausente, totalização incompleta e percentual divergente", () => {
    assert.throws(() => lerHistoricoTotalizacao2022(CSV_2022.replace("NULO_PE_VOTOS_TOT_ACUMULADO", "X")), /colunas ausentes/)
    assert.throws(() => lerHistoricoTotalizacao2022(CSV_2022.split("\r\n").slice(0, 2).join("\n")), /100% das seções/)
    assert.throws(() => lerHistoricoTotalizacao2022(CSV_2022.replace(";0,020000;", ";0,090000;")), /diverge/)
  })

  it("arquivo commitado: fonte oficial com sha256 e totais coerentes", () => {
    const ref = getReferencia2022()
    assert.match(ref.fonte.url, /^https:\/\/cdn\.tse\.jus\.br\/estatistica\/sead\/eleicoes\/eleicoes2022\//)
    assert.match(ref.fonte.pagina, /^https:\/\/dadosabertos\.tse\.jus\.br\//)
    assert.match(ref.fonte.sha256, /^[0-9a-f]{64}$/)
    assert.match(ref.fonte.sha256_arquivo, /^[0-9a-f]{64}$/)
    const t = ref.totais
    assert.equal(t.comparecimento + t.abstencao, t.eleitorado)
    assert.ok(Math.abs(t.percentual_comparecimento + t.percentual_abstencao - 100) < 1e-6)
  })

  it("delta em pontos com uma casa, sinal tipográfico e zero sem sinal", () => {
    assert.equal(deltaPontos(78.916, 79.054), -0.1)
    assert.equal(deltaPontos(21.084, 20.946), 0.1)
    assert.equal(deltaPontos(50.02, 50.0), 0)
    assert.equal(deltaPontos(null, 1), null)
    assert.equal(formatarDeltaPontos(1.24), "+1,2 p.p.")
    assert.equal(formatarDeltaPontos(-0.8), "−0,8 p.p.")
    assert.equal(formatarDeltaPontos(0), "igual")
  })

  it("números do hero ganham a comparação só em comparecimento e abstenção, calculada dos dois arquivos", () => {
    const data = getResultados1Turno()
    const numeros = numerosHero1Turno(data, getReferencia2022())
    const br = data.disputas.find((d) => d.cargo === "Presidente")!.totais
    const ref = getReferencia2022().totais
    const comp = numeros.find((n) => n.id === "comparecimento")!
    const abst = numeros.find((n) => n.id === "abstencao")!
    assert.equal(comp.comparacao?.texto, `${formatarDeltaPontos(deltaPontos(br.percentual_comparecimento, ref.percentual_comparecimento)!)} vs 2022`)
    assert.equal(abst.comparacao?.texto, `${formatarDeltaPontos(deltaPontos(br.percentual_abstencao, ref.percentual_abstencao)!)} vs 2022`)
    assert.ok(numeros.filter((n) => n.id !== "comparecimento" && n.id !== "abstencao").every((n) => !n.comparacao))
    assert.ok(numerosHero1Turno(data).every((n) => !n.comparacao), "sem referência, sem comparação")
  })
})

const linha = (id: string, data: string | null, a: number, b: number): Pesquisa2TurnoLinha => ({ id, instituto: "Inst", data, percentuais: [a, b], margem: 2, url: "https://exemplo.org" })

describe("tendência das pesquisas do 2º turno", () => {
  it("da mais antiga para a mais recente, sem data inválida; com menos de duas, vazio", () => {
    const serie = serieDasPesquisas([linha("c", "2026-09-17", 46, 44), linha("x", null, 1, 1), linha("a", "2026-07-30", 43, 46), linha("b", "2026-08-27", 44, 45)])
    assert.deepEqual(serie.map((p) => p.id), ["a", "b", "c"])
    assert.deepEqual(serieDasPesquisas([linha("a", "2026-07-30", 43, 46)]), [])
  })

  it("x proporcional à data e eixo de 2 em 2 pontos que cobre todos os valores", () => {
    const serie = serieDasPesquisas([linha("a", "2026-09-01", 43, 46), linha("b", "2026-09-03", 44, 45), linha("c", "2026-09-11", 47, 44)])
    const { pontos, marcas } = escalarSerie(serie, { largura: 120, altura: 100, margemX: 10, margemY: 10 })
    assert.deepEqual(pontos.map((p) => p.x), [10, 30, 110])
    assert.deepEqual(marcas.map((m) => m.valor), [42, 44, 46, 48])
    assert.equal(pontos[0].y[1] < pontos[0].y[0], true, "46% fica acima de 43%")
  })

  it("eixo usa data curta", () => {
    assert.equal(formatarDataEixo("2026-07-30"), "30/7")
    assert.equal(formatarDataEixo("sem data"), "sem data")
  })

  it("renderiza as duas linhas nas cores do lado de cada partido, com resumo em texto, e mantém a lista", () => {
    const linhas = [linha("a", "2026-07-30", 43, 46), linha("b", "2026-09-17", 46, 44)]
    const html = renderToStaticMarkup(<Pesquisas2Turno linhas={linhas} nomes={["A", "B"]} partidos={["PL", "PT"]} />)
    assert.match(html, /data-pf-tendencia-2turno/)
    assert.match(html, /stroke="var\(--espectro-direita\)"/)
    assert.match(html, /stroke="var\(--espectro-esquerda\)"/)
    assert.match(html, /A foi de 43% a 46%; B foi de 46% a 44%/)
    assert.match(html, /data-pf-pesquisas-2turno/)
  })

  it("com uma pesquisa só, sem tendência, mas a lista continua", () => {
    const html = renderToStaticMarkup(<Pesquisas2Turno linhas={[linha("a", "2026-07-30", 43, 46)]} nomes={["A", "B"]} />)
    assert.doesNotMatch(html, /data-pf-tendencia-2turno/)
    assert.match(html, /data-pf-pesquisas-2turno/)
  })
})

describe("duelos de governador: vantagem e meu estado", () => {
  it("vantagem em pontos com uma casa; líder pelo valor cheio", () => {
    assert.deepEqual(vantagemNoDuelo(49.27, 42.76), { lider: 0, pp: 6.5 })
    assert.deepEqual(vantagemNoDuelo(36.16, 36.94), { lider: 1, pp: 0.8 })
    assert.deepEqual(vantagemNoDuelo(45.71, 45.69), { lider: 0, pp: 0 })
    assert.deepEqual(vantagemNoDuelo(40, 40), { lider: null, pp: 0 })
    assert.deepEqual(vantagemNoDuelo(null, 40), { lider: null, pp: null })
    assert.equal(formatarVantagem(2.4), "+2,4 p.p.")
    assert.equal(formatarVantagem(0), "menos de 0,1 p.p.")
  })

  it("UF salva: lê, grava, valida e tolera armazenamento bloqueado", () => {
    const mapa = new Map<string, string>()
    const storage = { getItem: (k: string) => mapa.get(k) ?? null, setItem: (k: string, v: string) => void mapa.set(k, v), removeItem: (k: string) => void mapa.delete(k) }
    assert.equal(lerUfSalva(storage), null)
    assert.equal(salvarUf(storage, "rj"), true)
    assert.equal(mapa.get(MEU_ESTADO_CHAVE), "RJ")
    assert.equal(lerUfSalva(storage), "RJ")
    assert.equal(salvarUf(storage, "XX"), false)
    assert.equal(lerUfSalva(storage), "RJ")
    mapa.set(MEU_ESTADO_CHAVE, "lixo")
    assert.equal(lerUfSalva(storage), null)
    assert.equal(salvarUf(storage, null), true)
    const bloqueado = { getItem: () => { throw new Error("SecurityError") }, setItem: () => { throw new Error("QuotaExceeded") }, removeItem: () => { throw new Error("x") } }
    assert.equal(lerUfSalva(bloqueado), null)
    assert.equal(salvarUf(bloqueado, "RJ"), false)
    assert.equal(lerUfSalva(null), null)
  })

  it("a UF escolhida vai para o topo e o resto mantém a ordem", () => {
    const itens = [{ uf: "AC" }, { uf: "AM" }, { uf: "RJ" }]
    assert.deepEqual(ordenarComMeuEstado(itens, "RJ").map((i) => i.uf), ["RJ", "AC", "AM"])
    assert.deepEqual(ordenarComMeuEstado(itens, null).map((i) => i.uf), ["AC", "AM", "RJ"])
    assert.deepEqual(ordenarComMeuEstado(itens, "SP").map((i) => i.uf), ["AC", "AM", "RJ"])
  })

  it("cada duelo mostra a vantagem do líder; no servidor nenhum estado vem escolhido", () => {
    const cand = (p: Partial<CandidatoResultado1Turno> & Pick<CandidatoResultado1Turno, "sq" | "nome_urna">): CandidatoResultado1Turno => ({
      numero: "10", nome: p.nome_urna, partido: "ABC", votos: 0, percentual_validos: 0, posicao: 1, situacao_tse: "", destinacao: "Válido", fase: "segundo_turno", slug: null, companheiros: [], ...p,
    })
    const data = {
      versao: 1, turno: 1, status: "final", gerado_em: null, ciclo: "x", eleicoes: null,
      disputas: [{
        cargo: "Governador", uf: "RJ", vagas: 1, fechamento_oficial: true, fase_calculada: false,
        fonte: { url: "https://x", sha256: "0".repeat(64), gerado_tse: "" }, totais: {} as DisputaResultado1Turno["totais"],
        candidatos: [cand({ sq: "1", nome_urna: "GOV A", percentual_validos: 49.27 }), cand({ sq: "2", nome_urna: "GOV B", percentual_validos: 42.76 })],
      }],
    } as unknown as Resultados1Turno
    const html = renderToStaticMarkup(<Governadores2Turno candidatos={[]} data={data} />)
    assert.match(html, /data-pf-duelo-vantagem="\+6,5 p\.p\."/)
    assert.match(html, /GOV A à frente por 6,5 p\.p\./)
    assert.match(html, /data-pf-meu-estado=""/)
    assert.doesNotMatch(html, /data-pf-meu-estado-item/)
    assert.match(html, /<option value="RJ">Rio de Janeiro<\/option>/)
  })
})

function uf(sigla: string, vencedor: 0 | 1, margem: number): PresidenteUf1Turno {
  const f = [
    { sq: "a", nome_urna: "AZUL", partido: "PL", votos: 10, percentual_validos: vencedor === 0 ? 50 + margem / 2 : 50 - margem / 2 },
    { sq: "b", nome_urna: "VERMELHO", partido: "PT", votos: 9, percentual_validos: vencedor === 1 ? 50 + margem / 2 : 50 - margem / 2 },
  ] as PresidenteUf1Turno["finalistas"]
  return { uf: sigla, fechamento_oficial: true, secoes: 1, secoes_totalizadas: 1, fonte: { url: "https://x", sha256: "0".repeat(64), gerado_tse: "" }, finalistas: f, vencedor: f[vencedor], margem_pp: margem }
}

describe("mapa do 1º turno por UF", () => {
  it("27 linhas, cor pelo partido do mais votado, contagem por candidato e sem dado explícito", () => {
    const mapa = montarMapaPresidente({ presidente_por_uf: [uf("SP", 0, 13.7), uf("BA", 1, 37.6), uf("AP", 1, 0.04)] })!
    assert.equal(mapa.linhas.length, 27)
    assert.equal(mapa.semDado, 24)
    assert.deepEqual(mapa.contagem.map((c) => [c.nome_urna, c.ufs]), [["VERMELHO", 2], ["AZUL", 1]])
    assert.equal(mapa.linhas.find((l) => l.uf === "SP")?.cor?.cor, "var(--espectro-direita)")
    assert.equal(mapa.linhas.find((l) => l.uf === "BA")?.cor?.cor, "var(--espectro-esquerda)")
    assert.equal(mapa.linhas.find((l) => l.uf === "MG")?.descricao, "Minas Gerais: sem dado")
    assert.match(mapa.linhas.find((l) => l.uf === "AP")!.descricao, /VERMELHO venceu por menos de 0,1 p\.p\./)
    assert.equal(montarMapaPresidente({}), null)
    assert.equal(formatarMargem(2.44), "2,4 p.p.")
  })

  it("renderiza 27 UFs com rótulo e tooltip, tabela recolhida e nenhum número fora do snapshot", () => {
    const html = renderToStaticMarkup(<MapaPresidente1Turno data={getResultados1Turno()} />)
    assert.equal((html.match(/data-pf-mapa-uf=/g) ?? []).length, 27)
    assert.equal((html.match(/<title>/g) ?? []).length, 27)
    assert.match(html, /data-pf-mapa-tabela/)
    assert.match(html, /aria-expanded="false"[^>]*data-pf-mapa-ver-todas/)
    assert.equal((html.match(/data-pf-mapa-linha=/g) ?? []).length, 27)
    assert.equal((html.match(/<tr class="(?!hidden)[^"]*"[^>]*data-pf-mapa-linha=/g) ?? []).length, 8, "lista curta: 8 maiores eleitorados")
    assert.match(html, /data-pf-mapa-detalhe="SP"/)
    assert.match(html, /data-pf-mapa-destaque="SP"/)
    assert.match(html, /href="\/1o-turno\/sp"/)
    const porUf = getResultados1Turno().presidente_por_uf ?? []
    const venceu = (nome: string) => porUf.filter((u) => u.vencedor.nome_urna === nome).length
    for (const nome of new Set(porUf.map((u) => u.vencedor.nome_urna))) {
      assert.match(html, new RegExp(`mais votado em ${venceu(nome)} UF`))
    }
  })

  it("sem dado por UF, o mapa some", () => {
    assert.equal(renderToStaticMarkup(<MapaPresidente1Turno data={{}} />), "")
  })
})

describe("cores do lado do partido", () => {
  it("hexadecimal do card bate com os tokens do CSS", () => {
    const css = readFileSync("src/app/globals.css", "utf8")
    for (const classe of ["esquerda", "centro", "direita"] as const) {
      assert.match(css, new RegExp(`--espectro-${classe}: ${COR_ESPECTRO_HEX[classe]};`))
    }
    assert.equal(coresDosFinalistas("PL", "PL"), null)
    assert.equal(coresDosFinalistas("PL", "PT")?.a.classe, "direita")
  })
})

describe("compartilhar o duelo", () => {
  const par = [{ nome_urna: "FLAVIO BOLSONARO", percentual_validos: 47.027 }, { nome_urna: "LULA", percentual_validos: 45.16 }] as const
  it("texto sai dos nomes e % do snapshot e da contagem", () => {
    assert.equal(textoDoDuelo(par, 20), "Flavio Bolsonaro 47,03% x Lula 45,16% no 1º turno. Faltam 20 dias para o 2º turno.")
    assert.equal(textoDoDuelo(par, 0), "Flavio Bolsonaro 47,03% x Lula 45,16% no 1º turno. O 2º turno é hoje.")
    assert.equal(textoDoDuelo(par, -1), "Flavio Bolsonaro 47,03% x Lula 45,16% no 1º turno.")
    assert.equal(nomeLegivel("PROFESSORA MARIA DO CARMO"), "Professora Maria do Carmo")
  })

  it("Web Share quando existe, senão copiar, senão nenhum", () => {
    assert.equal(modoCompartilhar({ share: () => undefined }), "nativo")
    assert.equal(modoCompartilhar({ clipboard: { writeText: () => undefined } }), "copiar")
    assert.equal(modoCompartilhar({}), "nenhum")
    assert.equal(modoCompartilhar(null), "nenhum")
  })

  it("home aponta Open Graph e Twitter para o card do duelo, e a rota existe", () => {
    const pagina = readFileSync("src/app/(site)/page.tsx", "utf8")
    assert.match(pagina, /images: \[\{ url: IMAGEM_DUELO_PATH/)
    assert.match(pagina, /buildTwitterMetadata\(\{ title, description, image: IMAGEM_DUELO_PATH \}\)/)
    assert.ok(existsSync("src/app/(site)/og/segundo-turno/route.tsx"))
    const rota = readFileSync("src/app/(site)/og/segundo-turno/route.tsx", "utf8")
    assert.match(rota, /getResultados1Turno/)
    assert.match(rota, /buildEditorialOg/, "sem finalistas, cai no card editorial")
    assert.match(readFileSync("src/lib/og.tsx", "utf8"), /s-maxage=3600/)
  })
})

describe("hero: compartilhar, comparação com 2022, celular e faixa fixa", () => {
  const data = getResultados1Turno()
  const presidente = data.disputas.find((d) => d.cargo === "Presidente")!
  const base = {
    imagem: { src: "/images/hero-dossie.webp", alt: "" },
    temResultado: true,
    presidente,
    fotos: {},
    pesquisa: null,
    metricas: { totalCandidatos: null, totalPatrimonio: null, totalProcessos: null, totalProcessosDisciplinares: null },
    ufs: [],
    referenceNow: "2026-10-05T15:00:00.000Z",
    compararHref: "#lado-a-lado",
  }

  it("com referência: deltas e nota da fonte; números recolhidos só no celular, fechados no HTML do servidor", () => {
    const html = renderToStaticMarkup(
      <HomeHero2026 {...base} numeros={numerosHero1Turno(data, getReferencia2022())} compartilhar={{ url: "https://puxaficha.com.br/" }} fonte2022={{ pagina: getReferencia2022().fonte.pagina }} />,
    )
    assert.equal((html.match(/data-pf-hero-comparacao-2022=/g) ?? []).length, 2)
    assert.match(html, /data-pf-hero-fonte-2022/)
    assert.match(html, /href="https:\/\/dadosabertos\.tse\.jus\.br\//)
    assert.match(html, /data-pf-recolhivel-celular="fechado"/)
    assert.match(html, /aria-expanded="false"/)
    assert.match(html, /Ver números do 1º turno/)
    assert.match(html, /class="max-sm:hidden"/)
    assert.match(html, /data-pf-compartilhar-duelo/)
    assert.match(html, /href="\/og\/segundo-turno" download=/)
  })

  it("sem fonte de 2022 nem compartilhar, nada disso aparece", () => {
    const html = renderToStaticMarkup(<HomeHero2026 {...base} numeros={numerosHero1Turno(data, getReferencia2022())} />)
    assert.doesNotMatch(html, /data-pf-hero-comparacao-2022/)
    assert.doesNotMatch(html, /data-pf-compartilhar-duelo/)
  })

  it("faixa fixa nasce oculta e inerte, abaixo da navegação, com o placar formatado no servidor", () => {
    const html = renderToStaticMarkup(
      <FaixaFixa2Turno finalistas={[{ nome: "A", percentual: "47,03%" }, { nome: "B", percentual: "45,16%" }]} referenceNow="2026-10-05T15:00:00.000Z" href="#lado-a-lado" />,
    )
    assert.match(html, /data-pf-faixa-fixa="oculta"/)
    assert.match(html, /aria-hidden="true"/)
    assert.match(html, /inert=""/)
    assert.match(html, /top-16 z-header/)
    assert.match(html, /motion-reduce:transition-none/)
    assert.match(html, /A 47,03%/)
  })
})

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import { HomeHero2026, type HomeHero2026Props } from "@/components/HomeHero2026"
import { LadoALado2Turno } from "@/components/SegundoTurnoPresidente"
import { Governadores2Turno } from "@/components/SegundoTurnoGovernadores"
import { DivisaoVotos } from "@/components/Resultado1TurnoDestaques"
import type { Candidato, CandidatoComparavel } from "@/lib/types"
import { numerosHero1Turno } from "@/lib/home-eleicao-2026"
import type { CandidatoResultado1Turno, DisputaResultado1Turno, Resultados1Turno } from "@/lib/resultados-1turno"
import type { Pesquisa2TurnoLinha } from "@/lib/segundo-turno-2026"
import SegundoTurnoPage from "@/app/(site)/2o-turno/page"

const TOTAIS: DisputaResultado1Turno["totais"] = {
  secoes: 10,
  secoes_totalizadas: 10,
  eleitorado: 1_000,
  comparecimento: 812,
  percentual_comparecimento: 81.234,
  abstencao: 188,
  percentual_abstencao: 18.766,
  votos_validos: 780,
  brancos: 12,
  percentual_brancos: 1.4,
  nulos: 20,
  percentual_nulos: 2.4,
}

const FONTE = { url: "https://resultados.tse.jus.br/fixture.json", sha256: "0".repeat(64), gerado_tse: "04/10/2026 23:59:59" }

function candidato(parcial: Partial<CandidatoResultado1Turno> & Pick<CandidatoResultado1Turno, "sq" | "nome_urna">): CandidatoResultado1Turno {
  return {
    numero: "10",
    nome: parcial.nome_urna,
    partido: "ABC",
    votos: 0,
    percentual_validos: 0,
    posicao: 1,
    situacao_tse: "",
    destinacao: "Válido",
    fase: "nao_eleito",
    slug: null,
    companheiros: [],
    ...parcial,
  }
}

function disputa(cargo: DisputaResultado1Turno["cargo"], uf: string, candidatos: CandidatoResultado1Turno[], totais = TOTAIS): DisputaResultado1Turno {
  return { cargo, uf, vagas: cargo === "Senador" ? 2 : 1, fechamento_oficial: true, fase_calculada: false, fonte: FONTE, totais, candidatos }
}

const presidente = disputa("Presidente", "BR", [
  candidato({ sq: "p1", nome_urna: "NOME MUITO LONGO DA SILVA", partido: "AAA", votos: 400, percentual_validos: 47.5, fase: "segundo_turno", slug: "nome-longo" }),
  candidato({ sq: "p2", nome_urna: "BIA", partido: "BBB", votos: 350, percentual_validos: 44.25, fase: "segundo_turno", slug: "bia" }),
  candidato({ sq: "p3", nome_urna: "CAIO", votos: 30, percentual_validos: 8.25 }),
])

const final: Resultados1Turno = {
  versao: 1,
  turno: 1,
  status: "final",
  gerado_em: "2026-10-05T03:00:00Z",
  ciclo: "2026",
  eleicoes: { federal: "1", estadual: "2" },
  disputas: [
    presidente,
    disputa("Governador", "SP", [candidato({ sq: "g1", nome_urna: "GOV ELEITO", fase: "eleito" })]),
    disputa("Governador", "RJ", [
      candidato({ sq: "g2", nome_urna: "GOV A", fase: "segundo_turno" }),
      candidato({ sq: "g3", nome_urna: "GOV B", fase: "segundo_turno" }),
    ]),
    disputa("Governador", "AM", [
      candidato({ sq: "g4", nome_urna: "GOV C", fase: "segundo_turno" }),
      candidato({ sq: "g5", nome_urna: "GOV D", fase: "segundo_turno" }),
    ]),
    disputa("Senador", "SP", [candidato({ sq: "s1", nome_urna: "SEN 1", fase: "eleito" }), candidato({ sq: "s2", nome_urna: "SEN 2", fase: "eleito" })]),
    disputa("Senador", "RJ", [candidato({ sq: "s3", nome_urna: "SEN 3", fase: "eleito" }), candidato({ sq: "s4", nome_urna: "SEN 4", fase: "nao_eleito" })]),
  ],
} as Resultados1Turno

const vazio: Resultados1Turno = { ...final, status: "vazio", disputas: [] }

const pesquisa: Pesquisa2TurnoLinha = {
  id: "inst-2026-10-02",
  instituto: "Instituto Fixture",
  data: "2026-10-02",
  percentuais: [46, 44],
  margem: 2.5,
  url: "https://exemplo.org/pesquisa",
}

function props(parcial: Partial<HomeHero2026Props> = {}): HomeHero2026Props {
  return {
    imagem: { src: "/images/hero-dossie.webp", alt: "" },
    temResultado: true,
    presidente,
    fotos: {},
    pesquisa,
    numeros: numerosHero1Turno(final),
    metricas: { totalCandidatos: 321, totalPatrimonio: 5_000_000, totalProcessos: 42, totalProcessosDisciplinares: 3 },
    ufs: [{ uf: "RJ", label: "Rio de Janeiro" }],
    referenceNow: "2026-10-05T15:00:00.000Z",
    compararHref: "#lado-a-lado",
    ...parcial,
  }
}

function texto(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ")
}

describe("números do 1º turno no hero da home", () => {
  it("saem do snapshot: comparecimento e abstenção do Presidente, UFs com 2º turno para governador e senadores eleitos", () => {
    assert.deepEqual(numerosHero1Turno(final), [
      { id: "comparecimento", valor: "81,23%", rotulo: "comparecimento" },
      { id: "abstencao", valor: "18,77%", rotulo: "abstenção" },
      { id: "governadores-2turno", valor: "2", rotulo: "estados com 2º turno para governador" },
      { id: "senadores-eleitos", valor: "3", rotulo: "senadores eleitos" },
    ])
  })

  it("item sem dado some; sem resultado não há número nenhum", () => {
    const semTotais = {
      ...final,
      disputas: [
        disputa("Presidente", "BR", presidente.candidatos, { ...TOTAIS, percentual_comparecimento: null, percentual_abstencao: null }),
        ...final.disputas.filter((d) => d.cargo === "Senador").map((d) => ({ ...d, candidatos: d.candidatos.map((c) => ({ ...c, fase: "em_apuracao" as const })) })),
      ],
    }
    assert.deepEqual(numerosHero1Turno(semTotais), [])
    assert.deepEqual(numerosHero1Turno(vazio), [])
    const umEstado = { ...final, disputas: final.disputas.filter((d) => d.uf !== "AM") }
    assert.equal(numerosHero1Turno(umEstado).find((n) => n.id === "governadores-2turno")?.rotulo, "estado com 2º turno para governador")
  })
})

describe("hero da home", () => {
  it("com resultado: data e contagem do 2º turno, duelo, última pesquisa, números e seletor de UF", () => {
    const html = renderToStaticMarkup(<HomeHero2026 {...props()} />)
    const visivel = texto(html)
    assert.match(html, /data-pf-home-hero="resultado"/)
    assert.match(html, /<h1[^>]*>Puxa Ficha<\/h1>/)
    assert.match(visivel, /2º turno em 25 de outubro/)
    assert.match(html, /data-pf-contagem-2turno="20"/)
    assert.match(visivel, /Faltam 20 dias/)
    assert.match(html, /data-pf-hero-duelo="Presidente"/)
    // Mesmo duelo do topo do 1º turno, com a barra dos votos válidos, e a faixa horizontal abaixo dela.
    assert.match(html, /data-pf-duelo-1turno="Presidente"/)
    // No hero a barra fica direto sobre o fundo preto, sem o painel claro da página do 1º turno.
    assert.match(html, /data-pf-divisao-votos="escuro"/)
    const classeBarra = /<figure class="([^"]*)" data-pf-divisao-votos="escuro"/.exec(html)?.[1]
    assert.ok(classeBarra !== undefined, "figura da barra escura não encontrada")
    assert.doesNotMatch(classeBarra, /gray-50|border-border|rounded/)
    // Partidos sem classe no mapa editorial: a barra volta ao branco e cinza, sem cor de espectro.
    assert.doesNotMatch(html, /var\(--espectro-/)
    assert.match(html, /data-pf-hero-faixa/)
    assert.doesNotMatch(visivel, /Vão ao 2º turno em 25 de outubro/)
    assert.match(visivel, /NOME MUITO LONGO DA SILVA AAA · nº 10 47,50% 400 votos/)
    assert.match(visivel, /BIA BBB · nº 10 44,25% 350 votos/)
    assert.match(html, /href="\/candidato\/nome-longo"/)
    assert.match(html, /href="\/candidato\/bia"/)
    // Link explícito para a ficha de quem segue na disputa, com o nome no nome acessível.
    assert.match(html, /<a[^>]*aria-label="Ficha completa de BIA"[^>]*href="\/candidato\/bia"[^>]*>Ficha completa/)
    assert.match(html, /aria-label="Ficha completa de NOME MUITO LONGO DA SILVA"/)
    assert.doesNotMatch(visivel, /Ver ficha/)
    assert.match(html, /href="#lado-a-lado"[^>]*>Comparar lado a lado/)
    assert.match(html, /data-pf-hero-pesquisa/)
    assert.match(visivel, /46%/)
    assert.match(visivel, /44%/)
    assert.match(visivel, /Instituto Fixture · 02 de out\. · margem 2,5 p\.p\./)
    assert.match(html, /href="https:\/\/exemplo\.org\/pesquisa"[^>]*target="_blank"/)
    assert.match(html, /data-pf-hero-numero="comparecimento"[\s\S]*?81,23%/)
    assert.match(html, /data-pf-hero-numero="senadores-eleitos"[\s\S]*?>3</)
    assert.match(visivel, /Seu estado tem 2º turno\?/)
    assert.match(html, /<option value="RJ">Rio de Janeiro<\/option>/)
    // Os números das fichas ficam para quando não há resultado.
    assert.doesNotMatch(html, /candidatos mapeados/)
  })

  it("sem fechamento oficial do TSE, a legenda do duelo avisa que a ida ao 2º turno foi calculada", () => {
    const oficial = renderToStaticMarkup(<HomeHero2026 {...props()} />)
    assert.doesNotMatch(oficial, /data-pf-hero-fechamento-pendente/)
    const calculada = renderToStaticMarkup(
      <HomeHero2026 {...props({ presidente: { ...presidente, fechamento_oficial: false, fase_calculada: true } })} />,
    )
    assert.match(calculada, /data-pf-hero-fechamento-pendente/)
    assert.match(calculada, /ainda não publicou o fechamento oficial/)
  })

  it("sem pesquisa do confronto, a linha da pesquisa some", () => {
    const html = renderToStaticMarkup(<HomeHero2026 {...props({ pesquisa: null })} />)
    assert.doesNotMatch(html, /data-pf-hero-pesquisa/)
    assert.doesNotMatch(html, /Última pesquisa do 2º turno/)
    assert.match(html, /data-pf-hero-duelo="Presidente"/)
  })

  it("sem resultado publicado volta aos números das fichas, sem número de eleição vazio", () => {
    const html = renderToStaticMarkup(
      <HomeHero2026 {...props({ temResultado: false, presidente: null, pesquisa: null, numeros: numerosHero1Turno(vazio) })} />,
    )
    const visivel = texto(html)
    assert.match(html, /data-pf-home-hero="fichas"/)
    assert.match(html, /<h1[^>]*>Puxa Ficha<\/h1>/)
    assert.match(visivel, /321 candidatos mapeados/)
    assert.match(html, /data-pf-hero-processos="42"/)
    assert.match(html, /data-pf-hero-processos-disciplinares="3"/)
    for (const ausente of [/data-pf-hero-duelo/, /data-pf-hero-numeros/, /data-pf-hero-pesquisa/, /2º turno em 25 de outubro/, /<select/, /sem dado/]) {
      assert.doesNotMatch(html, ausente)
    }
  })

  it("resultado sem os dois finalistas à Presidência esconde o duelo e o botão, mantendo números e seletor", () => {
    const eleito = disputa("Presidente", "BR", [candidato({ sq: "p1", nome_urna: "ELEITA", fase: "eleito", percentual_validos: 55 })])
    const html = renderToStaticMarkup(<HomeHero2026 {...props({ presidente: eleito, compararHref: null })} />)
    assert.doesNotMatch(html, /data-pf-hero-duelo/)
    assert.doesNotMatch(html, /Comparar lado a lado/)
    assert.doesNotMatch(html, /data-pf-hero-pesquisa/)
    assert.match(html, /data-pf-hero-numeros/)
    assert.match(html, /<select/)
  })
})

describe("lado a lado e duelos estaduais: ficha completa e mais informações", () => {
  const comparavel = (slug: string, parcial: Partial<CandidatoComparavel> = {}): CandidatoComparavel => ({
    id: slug,
    nome_urna: slug,
    slug,
    partido_sigla: "AAA",
    cargo_disputado: "Presidente",
    cargo_atual: "Senador",
    estado: null,
    foto_url: null,
    idade: 45,
    formacao: "Superior completo",
    total_processos: 0,
    mudancas_partido: 2,
    mudancas_partido_verificado: true,
    alertas_graves: 0,
    patrimonio_declarado: 100,
    evolucao_patrimonial_pct: 10,
    total_gasto_parlamentar: null,
    tem_historico_legislativo: false,
    ...parcial,
  })
  const lado = (comparaveis: CandidatoComparavel[]) =>
    renderToStaticMarkup(
      <LadoALado2Turno
        disputa={presidente}
        processos={{ "nome-longo": 1, bia: 0 }}
        processosContagem={{}}
        patrimonios={{ "nome-longo": 100, bia: null }}
        patrimoniosAtipicos={{}}
        pontosAtencao={{ "nome-longo": 0, bia: 1 }}
        compararHref={null}
        comparaveis={comparaveis}
        profissoes={{ "nome-longo": "MEDICO", bia: null }}
      />,
    )

  it("cabeçalho do lado a lado tem Ficha completa para os dois finalistas", () => {
    const html = lado([])
    assert.match(html, /<a[^>]*aria-label="Ficha completa de NOME MUITO LONGO DA SILVA"[^>]*href="\/candidato\/nome-longo"[^>]*>Ficha completa/)
    assert.match(html, /<a[^>]*aria-label="Ficha completa de BIA"[^>]*href="\/candidato\/bia"[^>]*>Ficha completa/)
    // As seis linhas de antes continuam na tabela principal.
    for (const id of ["resultado", "partido", "vice", "patrimonio", "processos", "pontos"]) {
      assert.match(html, new RegExp(`data-pf-lado-a-lado-linha="${id}"`))
    }
  })

  it("Mais informações é um details nativo fechado, com as linhas extras do comparador", () => {
    const html = lado([comparavel("nome-longo"), comparavel("bia", { mudancas_partido: 0, mudancas_partido_verificado: false, cargo_atual: null })])
    assert.match(html, /<details[^>]*data-pf-lado-a-lado-mais/)
    assert.doesNotMatch(html, /<details[^>]*\sopen/)
    assert.match(html, /<summary[^>]*>Mais informações/)
    assert.match(html, /role="table" aria-label="Presidente: mais informações dos dois finalistas"/)
    for (const id of ["cargo-atual", "idade", "formacao", "profissao", "evolucao", "trocas"]) {
      assert.match(html, new RegExp(`data-pf-lado-a-lado-extra="${id}"`))
    }
    // Sem gasto nem mandato no Congresso em nenhum dos dois, a cota parlamentar não entra.
    assert.doesNotMatch(html, /data-pf-lado-a-lado-extra="ceap"/)
    const trocas = html.match(/data-pf-lado-a-lado-extra="trocas"[\s\S]*?(?=data-pf-lado-a-lado-extra=|<\/div><p)/)?.[0] ?? ""
    assert.match(texto(trocas), /Trocas de partido 2 /)
    assert.match(texto(trocas), /sem dado verificado/)
    assert.match(texto(html), /Médico|Medico/)
  })

  it("sem a lista do comparador, as linhas extras ficam em sem dado", () => {
    const html = lado([])
    const extra = html.slice(html.indexOf("data-pf-lado-a-lado-extra-tabela"))
    assert.doesNotMatch(texto(extra), /\d+ anos|Senador/)
    assert.match(texto(extra), /sem dado verificado/)
  })

  it("cada duelo de governador tem Ficha completa por finalista", () => {
    const rj = disputa("Governador", "RJ", [
      candidato({ sq: "g2", nome_urna: "GOV A", fase: "segundo_turno", slug: "gov-a", percentual_validos: 40 }),
      candidato({ sq: "g3", nome_urna: "GOV B", fase: "segundo_turno", slug: "gov-b", percentual_validos: 35 }),
    ])
    const data = { ...final, disputas: [presidente, rj] } as Resultados1Turno
    const html = renderToStaticMarkup(<Governadores2Turno candidatos={[] as Candidato[]} data={data} />)
    const linha = html.slice(html.indexOf('data-pf-duelo-2turno-uf="rj"'))
    assert.match(linha, /data-pf-duelo-2turno-fichas/)
    assert.match(linha, /<a[^>]*aria-label="Ficha completa de GOV A"[^>]*href="\/candidato\/gov-a"[^>]*>Ficha completa/)
    assert.match(linha, /<a[^>]*aria-label="Ficha completa de GOV B"[^>]*href="\/candidato\/gov-b"[^>]*>Ficha completa/)
    assert.match(linha, /min-h-11/)
  })
})

describe("home do 2º turno: blocos e recortes", () => {
  const home = readFileSync("src/app/(site)/page.tsx", "utf8")
  const secoes = readFileSync("src/components/PresidentialElectionSections.tsx", "utf8")
  const lado = readFileSync("src/components/SegundoTurnoPresidente.tsx", "utf8")

  it("programas só dos dois finalistas; todos só sem o par publicado", () => {
    assert.match(home, /const candidatosProgramas = slugsFinalistas\s*\?\s*candidatos\.filter\(\(candidato\) => slugsFinalistas\.includes\(candidato\.slug\)\)\s*:\s*candidatos/)
    assert.match(home, /<PresidentialElectionSections candidates=\{candidatosProgramas\.map\(/)
  })

  it("sem \"A evolução da disputa\" na home; o componente mantém o padrão nas outras chamadas", () => {
    assert.match(home, /<PresidentialElectionSections[\s\S]*?mostrarPesquisas=\{false\} \/>/)
    assert.match(secoes, /mostrarPesquisas = true/)
    assert.match(secoes, /\{mostrarPesquisas && <>[\s\S]*?<StatePolls/)
    // O atalho para o bloco removido também sai.
    assert.doesNotMatch(lado, /href="#pesquisas"/)
  })

  it("sem o Comparador no fim da home; o lado a lado usa a mesma lista do comparador", () => {
    assert.doesNotMatch(home, /ComparadorPanel/)
    assert.doesNotMatch(home, /\{\/\* Comparador \*\/\}/)
    assert.match(home, /getCandidatosComparaveisResource\("Presidente"\)/)
    assert.match(home, /<LadoALado2Turno[\s\S]*?comparaveis=\{comparaveis\}[\s\S]*?\/>/)
  })

  it("atualizações recentes só dos finalistas, lidos do snapshot", () => {
    assert.match(home, /const slugsSegundoTurno = temResultado \? slugsDoSegundoTurno\(resultados\) : \[\]/)
    assert.match(home, /<HomeRecentUpdatesData slugs=\{slugsSegundoTurno\.length > 0 \? slugsSegundoTurno : undefined\} \/>/)
  })
})

describe("rotas da eleição", () => {
  it("/2o-turno tem redirect temporário na config: a página estática sozinha devolveria 200 com meta refresh", () => {
    const config = readFileSync("next.config.ts", "utf8")
    assert.match(config, /source: "\/2o-turno",\s*destination: "\/",[^}]*permanent: false/)
  })

  it("/2o-turno redireciona para a home sem 308, que ficaria preso no cache do navegador", () => {
    assert.throws(
      () => SegundoTurnoPage(),
      (erro: unknown) => {
        const digest = String((erro as { digest?: unknown }).digest ?? "")
        assert.match(digest, /^NEXT_REDIRECT;[a-z]+;\/;307;/)
        return true
      },
    )
  })

  it("/1o-turno é o arquivo do 1º turno com título e canonical próprios; a home não tem faixa de turnos", () => {
    // Composição do arquivo (home antiga, fotos em PB) em tests/arquivo-1turno.test.tsx.
    const primeiro = readFileSync("src/app/(site)/1o-turno/page.tsx", "utf8")
    assert.doesNotMatch(primeiro, /permanentRedirect/)
    assert.match(primeiro, /title = "Arquivo do 1º turno das eleições 2026 \| Puxa Ficha"/)
    assert.match(primeiro, /canonical: "\/1o-turno"/)

    const home = readFileSync("src/app/(site)/page.tsx", "utf8")
    assert.match(home, /canonical: "\/"/)
    assert.match(home, /title = "Puxa Ficha \| 2º turno das eleições 2026"/)
    assert.doesNotMatch(home, /NavTurnos/)
    assert.match(home, /href="\/1o-turno"[\s\S]*?Arquivo do 1º turno/)
    assert.doesNotMatch(home, /Resultado completo do 1º turno/)
    // Os duelos estaduais vêm de Governadores2Turno; o bloco do 1º turno entra sem os duelos para não repetir.
    assert.match(home, /<Resultado1TurnoEstados[^>]*blocos=\{\["eleitos", "sem-dado"\]\}/)
    assert.match(home, /<Resultado1TurnoEstados[^>]*blocos=\{\["senado"\]\}/)
  })
})

describe("barra dos votos do hero nas cores do espectro", () => {
  const plXpt = disputa("Presidente", "BR", [
    candidato({ sq: "d1", nome_urna: "DIREITA", partido: "PL", votos: 470, percentual_validos: 47, fase: "segundo_turno" }),
    candidato({ sq: "e1", nome_urna: "ESQUERDA", partido: "PT", votos: 450, percentual_validos: 45, fase: "segundo_turno" }),
    candidato({ sq: "x1", nome_urna: "OUTRO", votos: 80, percentual_validos: 8 }),
  ])

  it("tom escuro pinta cada finalista com a cor do lado do partido e escreve o lado", () => {
    const html = renderToStaticMarkup(<DivisaoVotos disputa={plXpt} tom="escuro" />)
    const direita = html.indexOf("var(--espectro-direita)")
    const esquerda = html.indexOf("var(--espectro-esquerda)")
    assert.ok(direita !== -1 && esquerda !== -1, "as duas cores do espectro aparecem")
    assert.ok(direita < esquerda, "o primeiro finalista (PL) vem antes, à esquerda da barra")
    assert.match(html, />Direita</)
    assert.match(html, />Esquerda</)
  })

  it("tom claro, da página do 1º turno, continua preto e cinza", () => {
    const html = renderToStaticMarkup(<DivisaoVotos disputa={plXpt} />)
    assert.doesNotMatch(html, /var\(--espectro-/)
  })
})

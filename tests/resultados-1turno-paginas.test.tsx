import assert from "node:assert/strict"
import { test } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import { Resultado1TurnoBrasil } from "@/components/Resultado1TurnoBrasil"
import { Resultado1TurnoUf } from "@/components/Resultado1TurnoUf"
import { ResultadoNoPrimeiroTurno } from "@/components/ResultadoNoPrimeiroTurno"
import { handleUfResultadoChange } from "@/components/UfResultadoSelector"
import type {
  CandidatoResultado1Turno,
  DisputaResultado1Turno,
  Resultados1Turno,
} from "@/lib/resultados-1turno"

const TOTAIS = {
  secoes: 1000,
  secoes_totalizadas: 1000,
  eleitorado: 5_000_000,
  comparecimento: 4_000_000,
  percentual_comparecimento: 80,
  abstencao: 1_000_000,
  percentual_abstencao: 20,
  votos_validos: 3_700_000,
  brancos: 150_000,
  percentual_brancos: 3.75,
  nulos: 150_000,
  percentual_nulos: 3.75,
}

const FONTE = {
  url: "https://resultados.tse.jus.br/fixture/dados.json",
  sha256: "0".repeat(64),
  gerado_tse: "04/10/2026 23:59:59",
}

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

const presidente: DisputaResultado1Turno = {
  cargo: "Presidente",
  fechamento_oficial: true,
  fase_calculada: false,
  uf: "BR",
  vagas: 1,
  fonte: FONTE,
  totais: TOTAIS,
  candidatos: [
    candidato({
      sq: "1",
      nome_urna: "ANA PRIMEIRA",
      votos: 1_234_567,
      percentual_validos: 45.5,
      posicao: 1,
      fase: "segundo_turno",
      slug: "ana-primeira",
      companheiros: [{ tipo: "v", nome: "VICE UM", partido: "ABC" }],
    }),
    candidato({
      sq: "2",
      nome_urna: "BRUNO SEGUNDO",
      votos: 1_000_000,
      percentual_validos: 40.25,
      posicao: 2,
      fase: "segundo_turno",
      slug: "bruno-segundo",
    }),
    candidato({
      sq: "3",
      nome_urna: "CARLA SEM FICHA",
      votos: 500_000,
      percentual_validos: 14.25,
      posicao: 3,
      fase: "nao_eleito",
      slug: null,
    }),
  ],
}

const governadorSp: DisputaResultado1Turno = {
  cargo: "Governador",
  fechamento_oficial: true,
  fase_calculada: false,
  uf: "SP",
  vagas: 1,
  fonte: FONTE,
  totais: TOTAIS,
  candidatos: [
    candidato({ sq: "10", nome_urna: "DIEGO GOV", votos: 2_000_000, percentual_validos: 55, posicao: 1, fase: "eleito", slug: "diego-gov" }),
    candidato({ sq: "11", nome_urna: "ELIANA GOV", votos: 1_000_000, percentual_validos: 30, posicao: 2, fase: "nao_eleito", slug: "eliana-gov" }),
  ],
}

const senadoSp: DisputaResultado1Turno = {
  cargo: "Senador",
  fechamento_oficial: true,
  fase_calculada: false,
  uf: "SP",
  vagas: 2,
  fonte: FONTE,
  totais: TOTAIS,
  candidatos: [
    candidato({
      sq: "20",
      nome_urna: "FABIO SENADO",
      votos: 3_000_000,
      percentual_validos: 40,
      posicao: 1,
      fase: "eleito",
      slug: "fabio-senado",
      companheiros: [
        { tipo: "s1", nome: "SUPLENTE UM", partido: "ABC" },
        { tipo: "s2", nome: "SUPLENTE DOIS", partido: "ABC" },
      ],
    }),
    candidato({ sq: "21", nome_urna: "GISELE SENADO", votos: 2_000_000, percentual_validos: 20, posicao: 2, fase: "eleito", slug: "gisele-senado" }),
  ],
}

const final: Resultados1Turno = {
  versao: 1,
  turno: 1,
  status: "final",
  gerado_em: "2026-10-04T23:59:59.000Z",
  ciclo: "2026",
  eleicoes: { federal: "1", estadual: "2" },
  disputas: [presidente, governadorSp, senadoSp],
}

const vazio: Resultados1Turno = {
  versao: 1,
  turno: 1,
  status: "vazio",
  gerado_em: null,
  ciclo: "2026",
  eleicoes: null,
  disputas: [],
}

const previa: Resultados1Turno = { ...final, status: "previa" }

function texto(html: string): string {
  return html.replace(/<[^>]*>/g, " ")
}

test("sem totalização, Brasil e UF mostram só o estado vazio, sem número de resultado", () => {
  for (const html of [
    renderToStaticMarkup(<Resultado1TurnoBrasil data={vazio} />),
    renderToStaticMarkup(<Resultado1TurnoUf uf="sp" data={vazio} />),
  ]) {
    assert.match(html, /O TSE ainda não concluiu a totalização\. O resultado oficial aparece aqui assim que a apuração terminar\./)
    // "1º", "2º" (faixa de turnos) e o ano do ciclo são rótulos fixos, não número de resultado.
    const visivel = texto(html).replace(/[12]º/g, "").replace(/Eleições 2026/g, "")
    assert.doesNotMatch(visivel, /\d/, "estado vazio não pode exibir dígitos de resultado")
    assert.doesNotMatch(html, /Prévia local/)
  }
})

test("Brasil com snapshot final formata votos e percentual em pt-BR e linka as fichas", () => {
  const html = renderToStaticMarkup(<Resultado1TurnoBrasil data={final} />)
  assert.match(html, /<h1[^>]*><span class="sr-only">Resultado do <\/span>1º Turno<\/h1>/)
  assert.match(html, /Fonte: TSE, resultado oficial/)
  assert.match(html, /href="https:\/\/resultados\.tse\.jus\.br\/fixture\/dados\.json"/)
  assert.match(html, /04\/10\/2026 23:59:59/)
  assert.match(html, /1\.234\.567/)
  assert.match(html, /45,50%/)
  assert.match(html, /40,25%/)
  assert.match(html, /href="\/candidato\/ana-primeira"/)
  assert.match(html, /href="\/candidato\/bruno-segundo"/)
  assert.match(html, /Vai ao 2º turno/)
  assert.match(html, /Vice:<\/span> VICE UM/)
  assert.match(html, /id="presidente"/)
  assert.match(html, /id="estados"/)
  assert.match(html, /href="\/1o-turno\/sp"/)
  // Governador eleito aparece na linha da UF; os dois senadores, no bloco do Senado por estado.
  assert.match(html, /data-pf-uf-1turno="sp"[\s\S]*?Eleito: <\/span>[^<]*<a[^>]*>DIEGO GOV<\/a>/)
  assert.match(html, /data-pf-senado-uf="sp"[\s\S]*?FABIO SENADO[\s\S]*?GISELE SENADO/)
  assert.doesNotMatch(html, /Prévia local/)
  assert.equal((html.match(/data-pf-uf-1turno=/g) ?? []).length, 27)
})

test("candidato sem slug aparece sem link", () => {
  const html = renderToStaticMarkup(<Resultado1TurnoBrasil data={final} />)
  assert.match(html, /CARLA SEM FICHA/)
  assert.doesNotMatch(html, /<a [^>]*>CARLA SEM FICHA<\/a>/)
  assert.doesNotMatch(html, /\/candidato\/null/)
})

test("prévia mostra o aviso visível", () => {
  const html = renderToStaticMarkup(<Resultado1TurnoBrasil data={previa} />)
  assert.match(html, /Prévia local: apuração em andamento, números parciais/)
})

function comSenado<T>(ligado: boolean, render: () => T): T {
  const antes = process.env.SENADO_ENABLED
  process.env.SENADO_ENABLED = ligado ? "true" : "false"
  try {
    return render()
  } finally {
    if (antes === undefined) delete process.env.SENADO_ENABLED
    else process.env.SENADO_ENABLED = antes
  }
}

test("senador só ganha link para a ficha com o Senado ligado (nunca link para 404)", () => {
  const desligado = comSenado(false, () => renderToStaticMarkup(<Resultado1TurnoUf uf="sp" data={final} />))
  assert.doesNotMatch(desligado, /href="\/candidato\/gisele-senado"/)
  assert.match(desligado, /href="\/candidato\/diego-gov"/)
})

test("página da UF mostra Governador, Senado com suplentes e os links de volta", () => {
  const html = comSenado(true, () => renderToStaticMarkup(<Resultado1TurnoUf uf="sp" data={final} />))
  assert.match(html, /<h1[^>]*>1º turno em São Paulo<\/h1>/)
  assert.match(html, /href="\/"/)
  assert.match(html, /href="\/uf\/sp"[^>]*>Finalistas e fichas de SP</)
  assert.match(html, /2 vagas/)
  assert.match(html, /1º suplente:<\/span> SUPLENTE UM/)
  assert.match(html, /2º suplente:<\/span> SUPLENTE DOIS/)
  assert.match(html, /href="\/candidato\/diego-gov"/)
  assert.match(html, /href="\/candidato\/gisele-senado"/)
  assert.match(html, /3\.000\.000/)
  assert.match(html, /55,00%/)
  // O link para as fichas de finalistas fica só no contexto de Governador.
  assert.equal((html.match(/Finalistas e fichas de SP/g) ?? []).length, 1)
})

test("seletor de UF navega para a base informada e mantém /uf como padrão", () => {
  const opcoes = [{ uf: "SP", label: "São Paulo" }]
  const destinos: string[] = []
  handleUfResultadoChange("SP", opcoes, (p) => destinos.push(p), "/1o-turno")
  handleUfResultadoChange("SP", opcoes, (p) => destinos.push(p))
  assert.deepEqual(destinos, ["/1o-turno/sp", "/uf/sp"])
})

test("ficha: bloco mostra posição, diferenças, vice e link para o resultado completo", () => {
  const html = renderToStaticMarkup(<ResultadoNoPrimeiroTurno slug="bruno-segundo" cargo="Presidente" data={final} />)
  assert.match(html, /Resultado no 1º turno/)
  assert.match(html, /1\.000\.000/)
  assert.match(html, /40,25%/)
  assert.match(html, /2º de 3/)
  assert.match(html, /Vai ao 2º turno/)
  // 1.234.567 - 1.000.000 votos e 45,50 - 40,25 pontos.
  assert.match(html, /faltaram\s+234\.567 votos e 5,25 pontos percentuais/)
  // 1.000.000 - 500.000 votos e 40,25 - 14,25 pontos.
  assert.match(html, /por\s+500\.000 votos e 26,00 pontos percentuais/)
  assert.match(html, /href="\/"[^>]*>Ver resultado completo</)
  assert.match(html, /Fonte: TSE, resultado oficial/)
})

test("ficha de Governador linka para a página da UF e Senador lista suplentes", () => {
  const gov = renderToStaticMarkup(<ResultadoNoPrimeiroTurno slug="eliana-gov" cargo="Governador" data={final} />)
  assert.match(gov, /href="\/1o-turno\/sp"[^>]*>Ver resultado completo</)
  const sen = renderToStaticMarkup(<ResultadoNoPrimeiroTurno slug="fabio-senado" cargo="Senador" data={final} />)
  assert.match(sen, /1º suplente: SUPLENTE UM/)
  assert.match(sen, /Eleito senador/)
})

test("ficha: registro deferido ou sem registro, fora do snapshot, não afirma nada", () => {
  assert.equal(renderToStaticMarkup(<ResultadoNoPrimeiroTurno slug="fora-do-resultado" cargo="Governador" situacaoCandidatura="deferido" data={final} />), "")
  assert.equal(renderToStaticMarkup(<ResultadoNoPrimeiroTurno slug="fora-do-resultado" cargo="Governador" data={final} />), "")
})

test("ficha: slug ausente de um snapshot final diz que não aparece no resultado do TSE", () => {
  const html = renderToStaticMarkup(<ResultadoNoPrimeiroTurno slug="fora-do-resultado" cargo="Governador" situacaoCandidatura="renuncia" data={final} />)
  assert.match(html, /Esta candidatura não aparece no resultado oficial do TSE do 1º turno\./)
  assert.match(html, /Situação do registro na Justiça\s+Eleitoral: renúncia\./)
  assert.doesNotMatch(html, /Ver resultado completo/)
})

test("ficha: sem resultado, cargo fora do escopo ou sem cargo, não renderiza nada", () => {
  assert.equal(renderToStaticMarkup(<ResultadoNoPrimeiroTurno slug="ana-primeira" cargo="Presidente" data={vazio} />), "")
  assert.equal(renderToStaticMarkup(<ResultadoNoPrimeiroTurno slug="ana-primeira" cargo="Deputado Federal" data={final} />), "")
  assert.equal(renderToStaticMarkup(<ResultadoNoPrimeiroTurno slug="ana-primeira" cargo={null} data={final} />), "")
})

import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { pesquisarCandidato } from "../scripts/curadoria-processos-lote"

/**
 * Invariantes de identidade do coletor judicial, verificadas por tabela
 * combinatória sobre o fluxo inteiro (`pesquisarCandidato`), não sobre uma
 * função isolada:
 * 1. Item com ao menos uma menção ao nome sem CPF divergente provado nunca
 *    gera `vazio_confirmado`.
 * 2. Papel não-parte perto do nome nunca gera `encontrado`.
 * Cada eixo que já escapou em revisão (tags HTML, entidade, ordem do nome,
 * destinatários homônimos, papéis em lista, distância do rótulo, polo) entra
 * como dimensão da tabela.
 */

const CPF = "52998224725"
const CPF_FMT = "529.982.247-25"
const OUTRO = "111.444.777-35"
const NOME = "Carlos da Silva Teste"
const NOME_UP = "CARLOS DA SILVA TESTE"
const CNJ = "5001754-50.2024.8.13.0441"

const candidato = {
  id: "id", slug: "carlos", nome_completo: NOME, nome_urna: "Carlos",
  cargo_disputado: "Senador", cargo_atual: null, estado: "MG", partido_sigla: "PSD", biografia: null,
}
const ficha = { slug: "carlos", nome_urna: "Carlos", cargo_disputado: "Senador", processos: 0 }

type Item = { id: number; texto: string; destinatarios: Array<{ nome: string; polo: string }> }

async function pesquisar(itens: Item[]) {
  return pesquisarCandidato(candidato, ficha, undefined, new Map(), ["TJMG"], "/cache-nao-usado", {
    confirmarIdentidade: async () => ({ status: "confirmada", metodo: "tse-sq-candidato", nome: NOME, cpf: CPF }),
    buscarDjen: async (consulta: string) => ({
      schema_version: 2 as const,
      url: "https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&nomeParte=x&pagina=1",
      query_nome: consulta, consultado_em: "2026-09-26T18:00:00Z", total: itens.length,
      itens: itens.map((i) => ({
        ...i, siglaTribunal: "TJMG", numeroprocessocommascara: CNJ,
        // O cache guarda o texto com o CPF apagado; o bruto vai só em memória.
        texto: i.texto.replace(/\d{3}\.\d{3}\.\d{3}-\d{2}/g, "[cpf omitido]"),
      })),
      paginas: 1, completo: true as const,
      textosBrutos: new Map(itens.map((i) => [i.id, i.texto])),
    }),
  })
}

/** Formas do nome que já confundiram a leitura: tags, entidade, caixa, ordem invertida. */
const RENDERIZACOES: Record<string, string> = {
  simples: NOME_UP,
  negrito: "CARLOS DA <b>SILVA</b> TESTE",
  quebra: "CARLOS DA SILVA<br>TESTE",
  paragrafo: "<p>CARLOS DA SILVA TESTE</p>",
  entidade: "CARLOS&nbsp;DA SILVA&nbsp;TESTE",
  caixa: NOME,
  invertida: "TESTE, CARLOS DA SILVA",
  // Entidade desconhecida: só a outra normalização a troca por espaço.
  entidadeDesconhecida: "CARLOS DA SILVA&zwj;TESTE",
}

const produto = <A, B>(as: A[], bs: B[]): Array<[A, B]> => as.flatMap((a) => bs.map((b) => [a, b] as [A, B]))

describe("invariante 1: menção sem CPF divergente provado nunca gera vazio_confirmado", () => {
  const segundaMencao = ["REU: {n}", "Terceiro interessado {n}", "\n{n}", "Intime-se {n}, brasileiro, casado"]
  const destinatarios = [0, 1, 2]
  const casos = produto(produto(Object.entries(RENDERIZACOES), Object.entries(RENDERIZACOES)), produto(segundaMencao, destinatarios))

  it(`${casos.length} combinações num só item: divergente + outra menção sem CPF`, async () => {
    for (const [[[rotA, a], [rotB, b]], [molde, nDest]] of casos) {
      for (const ordem of ["divergente-primeiro", "divergente-depois"]) {
        const divergente = `REU: ${a}, CPF ${OUTRO}`
        const outra = molde.replace("{n}", b)
        const texto = ordem === "divergente-primeiro" ? `${divergente}. ${outra}` : `${outra}. ${divergente}`
        const r = await pesquisar([{ id: 1, texto, destinatarios: Array.from({ length: nDest }, () => ({ nome: NOME_UP, polo: "P" })) }])
        assert.notEqual(r.classificacao, "vazio_confirmado", JSON.stringify({ rotA, rotB, molde, nDest, ordem, texto }))
      }
    }
  })

  it("homônimos entre os destinatários: uma menção divergente não basta para dois", async () => {
    for (const [rot, n] of Object.entries(RENDERIZACOES)) {
      const r = await pesquisar([{ id: 1, texto: `REU: ${n}, CPF ${OUTRO}`, destinatarios: [{ nome: NOME_UP, polo: "P" }, { nome: NOME_UP, polo: "A" }] }])
      assert.notEqual(r.classificacao, "vazio_confirmado", rot)
    }
  })

  it("descarte de uma comunicação não apaga outra do mesmo processo, em qualquer renderização", async () => {
    for (const [rot, n] of Object.entries(RENDERIZACOES)) {
      const r = await pesquisar([
        { id: 1, texto: `REU: ${NOME_UP}, CPF ${OUTRO}`, destinatarios: [{ nome: NOME_UP, polo: "P" }] },
        { id: 2, texto: `Intime-se o terceiro interessado ${n}.`, destinatarios: [{ nome: "OUTRA PESSOA", polo: "P" }] },
      ])
      assert.notEqual(r.classificacao, "vazio_confirmado", rot)
      assert.deepEqual(r.ocorrencias_ambiguas.map((o) => o.numero_cnj), [CNJ], rot)
    }
  })

  it("controle: com toda menção divergente o homônimo ainda é descartado (a tabela não é vazia de sentido)", async () => {
    for (const texto of [
      `REU: ${NOME_UP}, CPF ${OUTRO}`,
      `REU: ${NOME_UP}, CPF ${OUTRO}. AUTOR: ${NOME_UP}, CPF ${OUTRO}`,
      `REU: CARLOS DA <b>SILVA</b> TESTE, CPF ${OUTRO}`,
    ]) {
      const r = await pesquisar([{ id: 1, texto, destinatarios: [{ nome: NOME_UP, polo: "P" }] }])
      assert.equal(r.classificacao, "vazio_confirmado", texto)
      assert.equal(r.homonimos_descartados.length, 1, texto)
    }
  })
})

describe("invariante 2: papel não-parte perto do nome nunca gera encontrado", () => {
  const rotulos = [
    "TESTEMUNHA:", "TESTEMUNHAS: FULANO DE TAL, CPF 111.444.777-35;", "ROL DE TESTEMUNHAS\n1)", "Intima-se a TESTEMUNHA",
    "ADV.", "Adv:", "Advogada Dra.", "Defensor dativo", "Curador especial", "Nomeio perito", "Perita:",
    "Nomeio como administrador judicial", "Juiz de Direito", "VITIMA:", "Patrono", "Procurador:",
  ]
  const recheio = [
    "",
    " ARROLADA PELA DEFESA E QUALIFICADA NOS AUTOS, ",
    " ARROLADA PELA DEFESA, QUALIFICADA NOS AUTOS; RESIDENTE NA COMARCA,\n INTIMADA POR CARTA COM AVISO DE RECEBIMENTO NOS TERMOS DA LEI, ",
  ]
  const nomes = ["simples", "negrito", "quebra", "entidade", "caixa"]
  const destinatarios: Array<Item["destinatarios"]> = [[], [{ nome: NOME_UP, polo: "P" }], [{ nome: NOME_UP, polo: "" }], [{ nome: NOME_UP, polo: "A" }]]
  const cpfs = [CPF_FMT, CPF]

  it("rótulo antes do nome, a qualquer distância dentro da frase, com qualquer polo", async () => {
    let n = 0
    for (const rotulo of rotulos) for (const pad of recheio) for (const rot of nomes) for (const dest of destinatarios) for (const cpf of cpfs) {
      const texto = `${rotulo}${pad} ${RENDERIZACOES[rot]}, CPF ${cpf}`
      const r = await pesquisar([{ id: 1, texto, destinatarios: dest }])
      assert.notEqual(r.classificacao, "encontrado", JSON.stringify({ rotulo, pad, rot, dest, cpf }))
      n += 1
    }
    assert.ok(n >= 1000, `${n} combinações`)
  })

  it("qualificação não-parte depois do nome", async () => {
    for (const depois of [", CPF {c}, OAB/MG 12345", ", advogado, CPF {c}", ", perito judicial, CPF {c}", " (testemunha), CPF {c}", " - CPF: {c} (ADVOGADO), FULANO - CPF: 111.444.777-35 (AGRAVADO)"]) {
      for (const dest of destinatarios) {
        const texto = `REU: ${NOME_UP}${depois.replace("{c}", CPF_FMT)}`
        const r = await pesquisar([{ id: 1, texto, destinatarios: dest }])
        assert.notEqual(r.classificacao, "encontrado", texto)
      }
    }
  })

  it("controle: parte com CPF é encontrada, inclusive depois de advogado da outra parte em frase anterior", async () => {
    for (const texto of [
      `REU: ${NOME_UP}, CPF ${CPF_FMT}`,
      `AUTOR: JOAO X, OAB/MG 123. REU: ${NOME_UP}, CPF ${CPF_FMT}`,
      `AUTOR: JOAO X; ADVOGADO: FULANO, OAB/MG 1. REU: ${NOME_UP}, CPF ${CPF_FMT}`,
      // Rótulo de parte na mesma frase encerra a herança do papel anterior.
      `ADVOGADO: FULANO, OAB/MG 1; REU: ${NOME_UP}, CPF ${CPF_FMT}`,
      `Polo passivo: ${NOME_UP} e outros ${NOME_UP} (CPF: ${CPF_FMT}); JOAO PEREIRA (CPF: ${OUTRO})`,
      `REU: CARLOS DA <b>SILVA</b> TESTE, CPF ${CPF_FMT}`,
      // Padrões reais do DJEN: parte que advoga em causa própria e executada fiel depositária.
      `RECORRIDO: ${NOME_UP}, CPF ${CPF_FMT} ADVOGADO(A): ${NOME_UP} (OAB/MG 8142) RECORRIDO: MUNICIPIO X`,
      `EXECUTADO: ${NOME_UP}, CPF ${CPF_FMT}. FIEL DEPOSITARIO: ${NOME_UP}. ULTIMA AVALIACAO: R$ 1,00`,
      // "&" solto (vindo de &amp;) nunca apaga o nome do trecho salvo.
      `AUTOR: PALHARES &amp; CIA LTDA, REU: ${NOME_UP}, CPF ${CPF_FMT}; ADVOGADO: FULANO`,
      `AUTOR: PALHARES & CIA LTDA, REU: ${NOME_UP}, Senador; ADVOGADO: FULANO`,
      // Lista com papel entre parênteses depois de cada pessoa (TJMT).
      `PARTE(S): [FULANO DE TAL - CPF: ${OUTRO} (ADVOGADO), ${NOME_UP} - CPF: ${CPF_FMT} (AGRAVADO), BELTRANO - CPF: 000.000.001-91 (ADVOGADO)]`,
      // Entidades acentuadas e rótulo colado (TJGO), depois do cabeçalho do gabinete do juiz.
      `GABINETE DO JUIZ FERNANDO TAL CENTRAL DE CUMPRIMENTO DE SENTEN&CCEDIL;A C&IACUTE;VELAUTOR(A): ${NOME_UP} (CPF/CNPJ N.&ordm; ${CPF_FMT})R&EACUTE;(U): FULANO LTDA`,
      // Rótulo de parte com entidade acentuada encerra a herança da testemunha anterior.
      `TESTEMUNHA: FULANO DE TAL; R&Eacute;U: ${NOME_UP}, CPF ${CPF_FMT}`,
      // Abreviação de parte depois da lista de advogados (TJMS).
      `ADVOGADOS: FULANO DE TAL (OAB 17733/MS), BELTRANO (OAB 20136/MS) - EXEQTE: CENTRO GRAFICO X - EXECTDO: ${NOME_UP}, CPF ${CPF_FMT}`,
      // Edital com vários processos: o cabeçalho do processo encerra a herança do anterior.
      `ADVOGADOS: FULANO DE TAL (OAB 17733/MS) PROCESSO 0830146-17.2019.8.12.0001 - CUMPRIMENTO DE SENTENCA - ${NOME_UP}, CPF ${CPF_FMT}`,
      // Campo seguinte com papel ("RELATOR(A): DESEMBARGADOR") não é qualificação da parte.
      `AGRAVADO: ${NOME_UP}, CPF ${CPF_FMT}, PREFEITO DO MUNICIPIO DE BELEM RELATOR(A): DESEMBARGADOR JOSE MARIA`,
    ]) {
      const r = await pesquisar([{ id: 1, texto, destinatarios: [{ nome: NOME_UP, polo: "P" }] }])
      assert.equal(r.classificacao, "encontrado", texto)
      // O aplicador exige o nome no trecho salvo: todo achado o traz.
      for (const p of r.processos) assert.match(String(p.contexto_identidade), /CARLOS DA SILVA TESTE/, texto)
    }
  })
})

describe("polo: só destinatário de polo A ou P usa prova sem CPF", () => {
  it("cargo junto ao nome atribui para polo P e não para polo vazio ou terceiro", async () => {
    const texto = `Intime-se ${NOME_UP}, Senador, para ciência.`
    const parte = await pesquisar([{ id: 1, texto, destinatarios: [{ nome: NOME_UP, polo: "P" }] }])
    assert.equal(parte.classificacao, "encontrado")
    for (const polo of ["", "T", "X"]) {
      const r = await pesquisar([{ id: 1, texto, destinatarios: [{ nome: NOME_UP, polo }] }])
      assert.notEqual(r.classificacao, "encontrado", polo)
      assert.notEqual(r.classificacao, "vazio_confirmado", polo)
    }
  })
})

describe("a prova vale só na menção que a carrega", () => {
  it("CPF numa menção de testemunha não atribui, mesmo com outra menção livre sem prova", async () => {
    for (const dest of [[], [{ nome: NOME_UP, polo: "P" }]]) {
      const r = await pesquisar([{ id: 1, texto: `REU: FULANO. TESTEMUNHA: ${NOME_UP}, CPF ${CPF_FMT}. Cite-se ${NOME_UP}.`, destinatarios: dest }])
      assert.notEqual(r.classificacao, "encontrado", JSON.stringify(dest))
    }
  })
})

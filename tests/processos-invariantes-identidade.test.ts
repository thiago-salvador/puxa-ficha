import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import {
  contextoPolitico,
  contextoPorCpfNoTexto,
  cpfCompativelNoTexto,
  cpfDivergenteNoTexto,
  decodificarEntidadesHtml,
  mencionaNomeNoTexto,
  normalizarTextoJudicial,
  pesquisarCandidato,
} from "../scripts/curadoria-processos-lote"

/**
 * Invariantes de identidade do coletor judicial, verificadas por tabela
 * combinatória sobre o fluxo inteiro (`pesquisarCandidato`), não sobre uma
 * função isolada:
 * 1. Item com ao menos uma menção ao nome sem CPF divergente provado nunca
 *    gera `vazio_confirmado`.
 * 2. Papel não-parte perto do nome nunca gera `encontrado`.
 * 3. Nome da candidata presente no texto em qualquer forma normalizada: o item
 *    nunca some (atribuído, ambíguo ou descartado com prova).
 * Cada eixo que já escapou em revisão entra como dimensão: tags HTML,
 * entidades (nomeadas, decimais, hexadecimais, dupla codificação), largura
 * zero, hífen condicional, hifenização em quebra de linha, ordem do nome,
 * destinatários homônimos, papéis em lista, "ADVOGADO DO/DA …", distância do
 * rótulo, polo e formato do CPF. Os números de casos saem do produto das
 * dimensões, no nome de cada teste.
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

/** Formas do nome que já confundiram a leitura. */
const RENDERIZACOES: Record<string, string> = {
  simples: NOME_UP,
  negrito: "CARLOS DA <b>SILVA</b> TESTE",
  quebra: "CARLOS DA SILVA<br>TESTE",
  paragrafo: "<p>CARLOS DA SILVA TESTE</p>",
  entidade: "CARLOS&nbsp;DA SILVA&nbsp;TESTE",
  caixa: NOME,
  invertida: "TESTE, CARLOS DA SILVA",
  entidadeDesconhecida: "CARLOS DA SILVA&zwj;TESTE",
  acentoNomeado: "C&Aacute;RLOS DA SILVA TESTE",
  acentoDecimal: "CARLOS DA S&#205;LVA TESTE",
  acentoHexadecimal: "CARLOS DA SILVA T&#x00C9;STE",
  letraDecimal: "CARLOS DA SILVA TES&#84;E",
  larguraZero: "CARLOS DA SIL​VA TESTE",
  hifenCondicional: "CARLOS DA SIL&shy;VA TESTE",
  hifenizacao: "CARLOS DA SIL-\nVA TESTE",
  duplaCodificacao: "CARLOS&amp;nbsp;DA SILVA TESTE",
}

const produto = <A, B>(as: A[], bs: B[]): Array<[A, B]> => as.flatMap((a) => bs.map((b) => [a, b] as [A, B]))

describe("normalização única", () => {
  it("todo caminho de menção, busca, descarte e contexto usa normalizarTextoJudicial", () => {
    const fonte = readFileSync(new URL("../scripts/curadoria-processos-lote.ts", import.meta.url), "utf8")
    const inicio = fonte.indexOf("export function normalizarTextoJudicial(")
    const fim = fonte.indexOf("\n}\n", inicio)
    assert.ok(inicio >= 0 && fim > inicio)
    const corpo = fonte.slice(inicio, fim)
    // `chaveDatajud` lê a página de documentação da API, não texto judicial.
    const iDatajud = fonte.indexOf("export async function chaveDatajud(")
    const fDatajud = fonte.indexOf("\n}\n", iDatajud)
    const fora = (fonte.slice(0, inicio) + fonte.slice(fim)).replace(fonte.slice(iDatajud, fDatajud), "")
    // Nenhuma normalização paralela: caixa alta e decomposição de acento só na função única.
    assert.equal((fora.match(/\.to(?:Locale)?UpperCase\(/g) ?? []).length, 0, "caixa alta fora da normalização única")
    assert.equal((fora.match(/\.normalize\(/g) ?? []).length, 0, "normalize() fora da normalização única")
    // Nenhuma outra retirada de acento, de tag ou decodificação de entidade.
    assert.equal((fora.match(/stripAccents\(/g) ?? []).length, 0, "stripAccents fora da normalização única")
    assert.equal((corpo.match(/stripAccents\(/g) ?? []).length, 1)
    assert.equal((fora.match(/<\[\^>\]\*?\+?>/g) ?? []).length, 0, "retirada de tag fora da normalização única")
    assert.equal((fora.match(/decodificarEntidadesHtml\(/g) ?? []).length, 1, "só a definição fica fora")
    assert.doesNotMatch(fora, /semiNormalizar|&#\?\[a-z0-9\]/)
    // `normalizar` é a mesma base, sem pontuação.
    const normalizar = fonte.slice(fonte.indexOf("function normalizar(valor: unknown): string {"), fonte.indexOf("\n}\n", fonte.indexOf("function normalizar(valor: unknown): string {")))
    assert.match(normalizar, /normalizarTextoJudicial\(valor\)/)
  })

  it("o aplicador confere a prova com a mesma normalização", () => {
    const fonte = readFileSync(new URL("../scripts/aplicar-evidencia-processos-curadoria.ts", import.meta.url), "utf8")
    const i = fonte.indexOf("function normalizarProva(")
    const corpo = fonte.slice(i, fonte.indexOf("\n}\n", i))
    assert.match(corpo, /normalizarTextoJudicial\(valor\)/)
    assert.doesNotMatch(corpo, /stripAccents|UpperCase|normalize\(/)
  })

  it("entidade numérica fora do Unicode fica crua e não lança erro", () => {
    for (const e of ["&#xFFFFFF;", "&#x110000;", "&#1114112;", "&#9999999;"]) {
      assert.equal(decodificarEntidadesHtml(`A${e}B`), `A${e}B`, e)
      assert.doesNotThrow(() => normalizarTextoJudicial(`REU: ${e} CARLOS`), e)
    }
    assert.equal(decodificarEntidadesHtml("&#x10FFFF;").codePointAt(0), 0x10FFFF)
  })

  it("todas as renderizações normalizam para o nome", () => {
    for (const [rot, n] of Object.entries(RENDERIZACOES)) {
      if (rot === "invertida" || rot === "entidadeDesconhecida") continue
      assert.match(normalizarTextoJudicial(n).replace(/\s+/g, " ").trim(), /^CARLOS DA SILVA TESTE$/, rot)
    }
  })

  it("os caminhos concordam: menção, rótulo de CPF, CPF no texto e cargo veem a mesma menção", () => {
    for (const [rot, n] of Object.entries(RENDERIZACOES)) {
      if (rot === "entidadeDesconhecida") continue
      const item = { id: 1, texto: `Intime-se ${n}.`, destinatarios: [] }
      assert.equal(mencionaNomeNoTexto(item as never, NOME_UP), true, rot)
      if (rot === "invertida") continue
      assert.equal(cpfCompativelNoTexto(`REU: ${n}, CPF ${CPF_FMT}`, NOME, CPF), true, rot)
      assert.notEqual(contextoPorCpfNoTexto(`REU: ${n}, CPF ${CPF_FMT}`, NOME, CPF), null, rot)
      assert.notEqual(contextoPolitico(candidato as never, ficha as never, `REU: ${n}, Senador`, NOME, { cpf: CPF }), null, rot)
    }
  })
})

describe("invariante 1: menção sem CPF divergente provado nunca gera vazio_confirmado", () => {
  const segundaMencao = ["REU: {n}", "Terceiro interessado {n}", "\n{n}", "Intime-se {n}, brasileiro, casado"]
  const destinatarios = [0, 1, 2]
  const ordens = ["divergente-primeiro", "divergente-depois"]
  const nomes = Object.entries(RENDERIZACOES)
  const total = nomes.length * nomes.length * segundaMencao.length * destinatarios.length * ordens.length

  it(`${total} combinações num só item: divergente + outra menção sem CPF`, async () => {
    for (const [[[rotA, a], [rotB, b]], [molde, nDest]] of produto(produto(nomes, nomes), produto(segundaMencao, destinatarios))) {
      for (const ordem of ordens) {
        const divergente = `REU: ${a}, CPF ${OUTRO}`
        const outra = molde.replace("{n}", b)
        const texto = ordem === "divergente-primeiro" ? `${divergente}. ${outra}` : `${outra}. ${divergente}`
        const r = await pesquisar([{ id: 1, texto, destinatarios: Array.from({ length: nDest }, () => ({ nome: NOME_UP, polo: "P" })) }])
        assert.notEqual(r.classificacao, "vazio_confirmado", JSON.stringify({ rotA, rotB, molde, nDest, ordem, texto }))
      }
    }
  })

  it(`${nomes.length} renderizações: homônimos entre os destinatários, uma menção divergente não basta para dois`, async () => {
    for (const [rot, n] of nomes) {
      const r = await pesquisar([{ id: 1, texto: `REU: ${n}, CPF ${OUTRO}`, destinatarios: [{ nome: NOME_UP, polo: "P" }, { nome: NOME_UP, polo: "A" }] }])
      assert.notEqual(r.classificacao, "vazio_confirmado", rot)
    }
  })

  it(`${nomes.length} renderizações: descarte de uma comunicação não apaga outra do mesmo processo`, async () => {
    for (const [rot, n] of nomes) {
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
      `REU: C&Aacute;RLOS DA SILVA TESTE, CPF ${OUTRO}`,
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
    // Família "papel DO/DA parte": a palavra de parte é objeto do papel.
    "ADVOGADO DO AUTOR:", "Advogado(s) do reclamante:", "Advogado da parte autora:", "PROCURADOR DO REU:",
    "Defensora da ré:", "ADVOGADOS DOS REQUERIDOS:", "Advogada do(a) exequente:",
    // Objeto com mais de uma palavra, até o ":" do rótulo.
    "ADVOGADO DO SEGUNDO REU:", "ADVOGADO DO 1º REU:", "PROCURADOR DO MUNICIPIO REU:", "ADVOGADOS DOS RECORRENTES E RECORRIDOS:",
    // "CONTRA" fora da forma verbal não apresenta parte.
    "INTIME-SE A TESTEMUNHA, ENTREGANDO-LHE A CONTRA-FE,", "NOMEIO PERITO, NA ACAO CONTRA O MUNICIPIO,",
  ]
  const recheio = [
    "",
    " ARROLADA PELA DEFESA E QUALIFICADA NOS AUTOS, ",
    " ARROLADA PELA DEFESA, QUALIFICADA NOS AUTOS; RESIDENTE NA COMARCA,\n INTIMADA POR CARTA COM AVISO DE RECEBIMENTO NOS TERMOS DA LEI, ",
  ]
  const nomes = ["simples", "negrito", "quebra", "entidade", "caixa", "acentoNomeado", "letraDecimal", "larguraZero", "hifenizacao", "duplaCodificacao"]
  const destinatarios: Array<Item["destinatarios"]> = [[], [{ nome: NOME_UP, polo: "P" }], [{ nome: NOME_UP, polo: "" }], [{ nome: NOME_UP, polo: "A" }]]
  const provas = [`CPF ${CPF_FMT}`, `CPF ${CPF}`, "Senador"]
  const total = rotulos.length * recheio.length * nomes.length * destinatarios.length * provas.length

  it(`${total} combinações: rótulo antes do nome, a qualquer distância na frase, com qualquer polo, prova por CPF ou cargo`, async () => {
    for (const rotulo of rotulos) for (const pad of recheio) for (const rot of nomes) for (const dest of destinatarios) for (const prova of provas) {
      const texto = `${rotulo}${pad} ${RENDERIZACOES[rot]}, ${prova}`
      const r = await pesquisar([{ id: 1, texto, destinatarios: dest }])
      assert.notEqual(r.classificacao, "encontrado", JSON.stringify({ rotulo, pad, rot, dest, prova }))
    }
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

  it("a prova vale só na menção que a carrega (CPF e cargo)", async () => {
    for (const prova of [`CPF ${CPF_FMT}`, "Senador"]) {
      for (const dest of [[], [{ nome: NOME_UP, polo: "P" }]]) {
        const texto = `REU: FULANO. TESTEMUNHA: ${NOME_UP}, ${prova}. Cite-se ${NOME_UP}.`
        const r = await pesquisar([{ id: 1, texto, destinatarios: dest }])
        assert.notEqual(r.classificacao, "encontrado", JSON.stringify({ prova, dest }))
      }
    }
  })

  it("nome mais longo de destinatário e sufixo de outra pessoa não carregam a prova de cargo", async () => {
    for (const [texto, dest] of [
      [`REU: JOAO ${NOME_UP}, Prefeito`, [{ nome: NOME_UP, polo: "P" }, { nome: `JOAO ${NOME_UP}`, polo: "P" }]],
      [`REU: Prefeito ${NOME_UP} JUNIOR, residente na comarca`, [{ nome: NOME_UP, polo: "P" }]],
    ] as Array<[string, Item["destinatarios"]]>) {
      const r = await pesquisar([{ id: 1, texto, destinatarios: dest }])
      assert.notEqual(r.classificacao, "encontrado", texto)
    }
  })

  it("controle: parte com CPF ou cargo é encontrada nos formatos reais", async () => {
    for (const texto of [
      `REU: ${NOME_UP}, CPF ${CPF_FMT}`,
      `AUTOR: JOAO X, OAB/MG 123. REU: ${NOME_UP}, CPF ${CPF_FMT}`,
      `AUTOR: JOAO X; ADVOGADO: FULANO, OAB/MG 1. REU: ${NOME_UP}, CPF ${CPF_FMT}`,
      `ADVOGADO: FULANO, OAB/MG 1; REU: ${NOME_UP}, CPF ${CPF_FMT}`,
      `ADVOGADO DO AUTOR: FULANO, OAB/MG 1. REU: ${NOME_UP}, CPF ${CPF_FMT}`,
      `Polo passivo: ${NOME_UP} e outros ${NOME_UP} (CPF: ${CPF_FMT}); JOAO PEREIRA (CPF: ${OUTRO})`,
      `REU: CARLOS DA <b>SILVA</b> TESTE, CPF ${CPF_FMT}`,
      `REU: C&Aacute;RLOS DA SILVA TES&#84;E, CPF ${CPF_FMT}`,
      `RECORRIDO: ${NOME_UP}, CPF ${CPF_FMT} ADVOGADO(A): ${NOME_UP} (OAB/MG 8142) RECORRIDO: MUNICIPIO X`,
      `EXECUTADO: ${NOME_UP}, CPF ${CPF_FMT}. FIEL DEPOSITARIO: ${NOME_UP}. ULTIMA AVALIACAO: R$ 1,00`,
      `AUTOR: PALHARES &amp; CIA LTDA, REU: ${NOME_UP}, CPF ${CPF_FMT}; ADVOGADO: FULANO`,
      `AUTOR: PALHARES & CIA LTDA, REU: ${NOME_UP}, Senador; ADVOGADO: FULANO`,
      `PARTE(S): [FULANO DE TAL - CPF: ${OUTRO} (ADVOGADO), ${NOME_UP} - CPF: ${CPF_FMT} (AGRAVADO), BELTRANO - CPF: 000.000.001-91 (ADVOGADO)]`,
      `GABINETE DO JUIZ FERNANDO TAL CENTRAL DE CUMPRIMENTO DE SENTEN&CCEDIL;A C&IACUTE;VELAUTOR(A): ${NOME_UP} (CPF/CNPJ N.&ordm; ${CPF_FMT})R&EACUTE;(U): FULANO LTDA`,
      `TESTEMUNHA: FULANO DE TAL; R&Eacute;U: ${NOME_UP}, CPF ${CPF_FMT}`,
      `RECORRIDOS: FULANO. ADVOGADOS: BELTRANO OAB/RO 1, SICRANO OAB/RO 2 DECISAO TRATA-SE DE ACAO POPULAR AJUIZADA POR JOAO EM FACE DO MUNICIPIO X, DO ENTAO PREFEITO ${NOME_UP}, E OUTROS`,
      `ADVOGADOS: FULANO DE TAL (OAB 17733/MS), BELTRANO (OAB 20136/MS) - EXEQTE: CENTRO GRAFICO X - EXECTDO: ${NOME_UP}, CPF ${CPF_FMT}`,
      `ADVOGADOS: FULANO DE TAL (OAB 17733/MS) PROCESSO 0830146-17.2019.8.12.0001 - CUMPRIMENTO DE SENTENCA - ${NOME_UP}, CPF ${CPF_FMT}`,
      `AGRAVADO: ${NOME_UP}, CPF ${CPF_FMT}, PREFEITO DO MUNICIPIO DE BELEM RELATOR(A): DESEMBARGADOR JOSE MARIA`,
      // Autor apresentado em prosa depois do cabeçalho com advogados (TJGO).
      `ADVOGADOS: BELTRANO OAB/GO 1, SICRANO OAB/GO 2 TRATA-SE DE ACAO DE INDENIZACAO AJUIZADA POR ${NOME_UP}, Senador, EM RAZAO DE DANOS`,
      // Denúncia em prosa depois do cabeçalho com o advogado do investigado (TRF3).
      `INVESTIGADO: ${NOME_UP} ADVOGADO DO(A) INVESTIGADO: RUFO X - MS18103 D E C I S A O O MINISTERIO PUBLICO FEDERAL OFERECE DENUNCIA CONTRA ${NOME_UP}, SENADOR, DANDO-O COMO INCURSO`,
    ]) {
      const r = await pesquisar([{ id: 1, texto, destinatarios: [{ nome: NOME_UP, polo: "P" }] }])
      assert.equal(r.classificacao, "encontrado", texto)
      // O aplicador exige o nome no trecho salvo: todo achado o traz.
      for (const p of r.processos) assert.match(String(p.contexto_identidade), /CARLOS DA SILVA TESTE/, texto)
    }
  })
})

describe("descarte com parcial do nome invertida", () => {
  it("sobra do nome em ordem invertida (\"SILVA TESTE, CARLOS D.\") impede o descarte", () => {
    for (const sobra of ["SILVA TESTE, CARLOS D.", "TESTE, CARLOS DA S.", "Sr. TESTE, CARLOS"]) {
      const texto = `REU: ${NOME_UP}, CPF ${OUTRO}. Intime-se ${sobra}, residente na comarca`
      assert.equal(cpfDivergenteNoTexto(texto, NOME, CPF, [NOME_UP]), false, sobra)
    }
    // Controle: sem a sobra, o divergente completo descarta.
    assert.equal(cpfDivergenteNoTexto(`REU: ${NOME_UP}, CPF ${OUTRO}. Intime-se o reu, residente na comarca`, NOME, CPF, [NOME_UP]), true)
  })
})

describe("invariante 3: nome presente em qualquer forma normalizada, o item nunca some", () => {
  const nomes = Object.entries(RENDERIZACOES)
  const moldes = ["Intime-se {n}.", "Parte: {n}", "{n}, brasileiro", "Vistos. {n} requer."]
  const destinatarios: Array<Item["destinatarios"]> = [[], [{ nome: "OUTRA PESSOA", polo: "P" }], [{ nome: NOME_UP, polo: "" }], [{ nome: NOME_UP, polo: "P" }]]
  const total = nomes.length * moldes.length * destinatarios.length

  it(`${total} combinações: o item vira achado, ambíguo ou homônimo com prova, nunca desaparece`, async () => {
    for (const [rot, n] of nomes) for (const molde of moldes) for (const dest of destinatarios) {
      const r = await pesquisar([{ id: 1, texto: molde.replace("{n}", n), destinatarios: dest }])
      const contado = r.processos.some((p) => p.numero_cnj === CNJ)
        || r.ocorrencias_ambiguas.some((o) => o.numero_cnj === CNJ)
        || r.homonimos_descartados.some((o) => o.numero_cnj === CNJ)
      assert.ok(contado, JSON.stringify({ rot, molde, dest }))
      assert.notEqual(r.classificacao, "vazio_confirmado", JSON.stringify({ rot, molde, dest }))
    }
  })

  it("item devolvido pela busca sem o nome legível também não some", async () => {
    const r = await pesquisar([{ id: 1, texto: "Intime-se C4RL0S D4 S1LV4 T3ST3.", destinatarios: [] }])
    assert.deepEqual(r.ocorrencias_ambiguas.map((o) => o.numero_cnj), [CNJ])
    assert.notEqual(r.classificacao, "vazio_confirmado")
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

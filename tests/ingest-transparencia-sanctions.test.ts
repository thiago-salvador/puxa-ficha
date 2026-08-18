import assert from "node:assert/strict"
import test from "node:test"

import {
  coletarSancoesDoCandidato,
  conferirDocumento,
  cpfEhValido,
  normalizarRegistros,
  parseDataBR,
  type ColetaDeps,
  type SancaoTipo,
} from "../scripts/lib/ingest-transparencia-sanctions"

// Regressao do falso positivo em massa de 2026-08-04.
//
// O modulo consultava `?cpfCnpj=<cpf>`, parametro que nao existe em nenhum
// endpoint de sancao do Portal da Transparencia. A API ignora parametro
// desconhecido em silencio e devolve a pagina 1 da lista nacional, entao cada
// candidato recebia os mesmos 15 registros de gente e empresa sem relacao
// nenhuma com ele. Em 27 candidatos, 729 linhas falsas com vinculo "direto".
//
// Os dois invariantes que nao podem voltar a quebrar:
//   1. Candidato sem CPF (ou com CPF invalido) nao gera consulta nem linha.
//   2. Registro cujo documento nao casa com o CPF consultado e descartado,
//      mesmo quando a API afirma ter filtrado.

// CPFs de teste com digitos verificadores validos, sem relacao com pessoa real.
const CPF_CANDIDATO = "52998224725"
const CPF_TERCEIRO = "11144477735"

const NOME_CANDIDATO = "Fulana de Tal Candidata"

/** Registro CEIS/CNEP no formato real da API (v3/api-docs, 2026-08-04). */
function registroCeis(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 351345,
    dataInicioSancao: "27/05/2025",
    dataFimSancao: "27/05/2027",
    tipoSancao: {
      descricaoResumida: "Impedimento/proibição de contratar com prazo determinado",
      descricaoPortal: "Impedimento/proibição de contratar com prazo determinado",
    },
    orgaoSancionador: { nome: "UNIVERSIDADE FEDERAL DO RIO DE JANEIRO", siglaUf: "RJ" },
    sancionado: { nome: "EMPRESA GENERICA LTDA", codigoFormatado: "55.417.969/0001-54" },
    pessoa: {
      cpfFormatado: "",
      cnpjFormatado: "55.417.969/0001-54",
      nome: "EMPRESA GENERICA LTDA",
      tipo: "Entidades Empresariais Privadas",
    },
    fundamentacao: [{ codigo: "LEI 14133 - ART. 156, III", descricao: "LEI 14133 - ART. 156, III" }],
    numeroProcesso: "23079.123456/2025-01",
    ...overrides,
  }
}

/** Registro CEAF no formato real: o CPF vem mascarado pela API. */
function registroCeaf(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 141911,
    dataPublicacao: "21/07/2021",
    punicao: {
      cpfPunidoFormatado: "***.982.247-**",
      nomePunido: "PESSOA SEM RELACAO COM O CANDIDATO",
      processo: "08620.153919/2015-02",
    },
    tipoPunicao: { descricao: "Demissão" },
    pessoa: {
      cpfFormatado: "***.982.247-**",
      cnpjFormatado: "",
      nome: "PESSOA SEM RELACAO COM O CANDIDATO",
      tipo: "Pessoa Física",
    },
    orgaoLotacao: { nome: "MINISTÉRIO DA JUSTIÇA E SEGURANÇA PÚBLICA" },
    fundamentacao: [{ codigo: "ART. 132, II", descricao: "ABANDONO DE CARGO" }],
    ...overrides,
  }
}

/** Deps que registram cada consulta, para provar que o guard nao consultou. */
function depsEspiao(resposta: (tipo: SancaoTipo) => unknown[] = () => []): {
  deps: ColetaDeps
  chamadas: { tipo: SancaoTipo; param: string; documento: string }[]
} {
  const chamadas: { tipo: SancaoTipo; param: string; documento: string }[] = []
  return {
    chamadas,
    deps: {
      async buscar(endpoint, documento) {
        chamadas.push({
          tipo: endpoint.tipo,
          param: endpoint.paramDocumento,
          documento,
        })
        return { ok: true, registros: resposta(endpoint.tipo) }
      },
    },
  }
}

// ---------------------------------------------------------------------------
// Invariante 1: sem CPF, nao consulta e nao grava
// ---------------------------------------------------------------------------

test("candidato sem CPF nao gera sanção nem chega a consultar a API", async () => {
  for (const cpfVazio of [null, undefined, "", "   "]) {
    const { deps, chamadas } = depsEspiao(() => [registroCeis(), registroCeaf()])
    const coleta = await coletarSancoesDoCandidato(cpfVazio, NOME_CANDIDATO, deps)

    assert.equal(coleta.consultou, false, `CPF ${JSON.stringify(cpfVazio)} deveria barrar a consulta`)
    assert.equal(coleta.motivoSkip, "sem CPF")
    assert.deepEqual(coleta.sancoes, [], "sem CPF nao pode produzir nenhuma sanção")
    assert.equal(chamadas.length, 0, "guard tem que barrar antes de qualquer requisição")
  }
})

test("CPF invalido (mascarado, curto ou com digito verificador errado) nao consulta", async () => {
  for (const cpfRuim of ["***.435.151-**", "1234567890", "00000000000", "52998224724"]) {
    const { deps, chamadas } = depsEspiao(() => [registroCeis()])
    const coleta = await coletarSancoesDoCandidato(cpfRuim, NOME_CANDIDATO, deps)

    assert.equal(coleta.consultou, false, `CPF ${cpfRuim} deveria ser recusado`)
    assert.equal(coleta.motivoSkip, "CPF invalido")
    assert.deepEqual(coleta.sancoes, [])
    assert.equal(chamadas.length, 0)
  }
})

test("cpfEhValido: aceita CPF real, recusa repetido e digito verificador errado", () => {
  assert.equal(cpfEhValido(CPF_CANDIDATO), true)
  assert.equal(cpfEhValido("529.982.247-25"), true)
  assert.equal(cpfEhValido("52998224724"), false)
  assert.equal(cpfEhValido("11111111111"), false)
  assert.equal(cpfEhValido(null), false)
})

// ---------------------------------------------------------------------------
// Invariante 2: retorno sem match de CPF e descartado
// ---------------------------------------------------------------------------

test("retorno sem match de CPF e descartado (lista nacional inteira, incidente 2026-08-04)", async () => {
  // Reproduz o payload do incidente: a API ignorou o filtro e devolveu a pagina
  // 1 da lista nacional, com empresas e pessoas sem relacao com o candidato.
  const paginaNacional = [
    registroCeis({ id: 1 }),
    registroCeis({
      id: 2,
      orgaoSancionador: { nome: "Prefeitura Municipal de Gravataí/RS" },
      sancionado: { nome: "OUTRA EMPRESA LTDA", codigoFormatado: "11.222.333/0001-44" },
      pessoa: { cpfFormatado: "", cnpjFormatado: "11.222.333/0001-44", nome: "OUTRA EMPRESA LTDA" },
    }),
    registroCeis({
      id: 3,
      orgaoSancionador: { nome: "CAMARA DOS DEPUTADOS" },
      sancionado: { nome: "TERCEIRO QUALQUER", codigoFormatado: CPF_TERCEIRO },
      pessoa: { cpfFormatado: "111.444.777-35", cnpjFormatado: "", nome: "TERCEIRO QUALQUER" },
    }),
  ]

  const { deps, chamadas } = depsEspiao((tipo) => (tipo === "CEIS" ? paginaNacional : []))
  const coleta = await coletarSancoesDoCandidato(CPF_CANDIDATO, NOME_CANDIDATO, deps)

  assert.equal(coleta.consultou, true)
  assert.deepEqual(coleta.sancoes, [], "nenhum registro da lista nacional pode virar sanção")
  assert.equal(coleta.descartes.length, 3, "todos os registros tem que aparecer como descarte")
  assert.ok(chamadas.length > 0)
})

test("filtro vai na querystring com o nome de parametro que a API documenta", async () => {
  const { deps, chamadas } = depsEspiao()
  await coletarSancoesDoCandidato(CPF_CANDIDATO, NOME_CANDIDATO, deps)

  const porTipo = new Map(chamadas.map((c) => [c.tipo, c]))
  // `cpfCnpj` (o parametro da versao quebrada) nao existe no swagger: a API
  // ignora em silencio e devolve a lista inteira.
  assert.equal(porTipo.get("CEIS")?.param, "codigoSancionado")
  assert.equal(porTipo.get("CNEP")?.param, "codigoSancionado")
  assert.equal(porTipo.get("CEAF")?.param, "cpfSancionado")
  for (const chamada of chamadas) {
    assert.equal(chamada.documento, CPF_CANDIDATO, "consulta sempre leva o CPF do candidato")
  }
  // CEPIM saiu: so filtra por CNPJ e so devolve pessoa juridica, entao o CPF de
  // um candidato jamais casaria.
  assert.equal(
    chamadas.some((c) => (c.tipo as string) === "CEPIM"),
    false
  )
})

test("CNPJ devolvido nunca casa com o CPF do candidato", () => {
  const { aceitas, descartes } = normalizarRegistros(
    "CEIS",
    [registroCeis()],
    { cpf: CPF_CANDIDATO, nome: NOME_CANDIDATO }
  )
  assert.deepEqual(aceitas, [])
  assert.equal(descartes.length, 1)
})

test("CEAF: CPF mascarado sem nome batendo e descartado", () => {
  // A mascara ***.982.247-** casa com os 6 digitos do meio de 52998224725, mas
  // o nome e de outra pessoa: 6 digitos nao bastam para acusar alguem.
  const { aceitas, descartes } = normalizarRegistros(
    "CEAF",
    [registroCeaf()],
    { cpf: CPF_CANDIDATO, nome: NOME_CANDIDATO }
  )
  assert.deepEqual(aceitas, [])
  assert.match(descartes[0], /nome do sancionado nao confere/)
})

// ---------------------------------------------------------------------------
// Contraprova: o guard nao rejeita tudo
// ---------------------------------------------------------------------------

test("registro do proprio candidato (CPF exato) e aceito e normalizado", async () => {
  const doCandidato = registroCeis({
    sancionado: { nome: NOME_CANDIDATO.toUpperCase(), codigoFormatado: "529.982.247-25" },
    pessoa: {
      cpfFormatado: "529.982.247-25",
      cnpjFormatado: "",
      nome: NOME_CANDIDATO.toUpperCase(),
      tipo: "Pessoa Física",
    },
  })

  const { deps } = depsEspiao((tipo) => (tipo === "CNEP" ? [doCandidato] : []))
  const coleta = await coletarSancoesDoCandidato(
    CPF_CANDIDATO,
    NOME_CANDIDATO,
    deps,
    new Date("2026-08-04T12:00:00Z")
  )

  assert.equal(coleta.descartes.length, 0)
  assert.equal(coleta.sancoes.length, 1)
  const sancao = coleta.sancoes[0]
  assert.equal(sancao.tipo, "CNEP")
  assert.equal(sancao.conferencia, "exato")
  assert.equal(sancao.descricao, "Impedimento/proibição de contratar com prazo determinado")
  assert.equal(sancao.orgaoSancionador, "UNIVERSIDADE FEDERAL DO RIO DE JANEIRO")
  // Datas do Portal vem em DD/MM/AAAA e a coluna e DATE: sem conversao, o
  // INSERT gravaria data errada ou seria recusado.
  assert.equal(sancao.dataInicio, "2025-05-27")
  assert.equal(sancao.dataFim, "2027-05-27")
  assert.equal(sancao.numeroProcesso, "23079.123456/2025-01")
  assert.equal(sancao.ativo, true)
})

test("CEAF do proprio candidato (mascara + nome batendo) e aceito", () => {
  const { aceitas, descartes } = normalizarRegistros(
    "CEAF",
    [
      registroCeaf({
        punicao: {
          cpfPunidoFormatado: "***.982.247-**",
          nomePunido: "FULANA DE TAL CANDIDATA",
          processo: "08620.153919/2015-02",
        },
        pessoa: {
          cpfFormatado: "***.982.247-**",
          cnpjFormatado: "",
          nome: "FULANA DE TAL CANDIDATA",
        },
      }),
    ],
    { cpf: CPF_CANDIDATO, nome: NOME_CANDIDATO }
  )

  assert.deepEqual(descartes, [])
  assert.equal(aceitas.length, 1)
  assert.equal(aceitas[0].conferencia, "mascarado")
  assert.equal(aceitas[0].descricao, "Demissão")
  assert.equal(aceitas[0].dataInicio, "2021-07-21")
  assert.equal(aceitas[0].numeroProcesso, "08620.153919/2015-02")
})

test("sanção com data de fim no passado entra como inativa", () => {
  const { aceitas } = normalizarRegistros(
    "CEIS",
    [
      registroCeis({
        dataFimSancao: "01/01/2020",
        pessoa: { cpfFormatado: "529.982.247-25", cnpjFormatado: "", nome: NOME_CANDIDATO },
        sancionado: { nome: NOME_CANDIDATO, codigoFormatado: "529.982.247-25" },
      }),
    ],
    { cpf: CPF_CANDIDATO, nome: NOME_CANDIDATO },
    new Date("2026-08-04T12:00:00Z")
  )
  assert.equal(aceitas.length, 1)
  assert.equal(aceitas[0].ativo, false)
})

// ---------------------------------------------------------------------------
// Unidades de apoio
// ---------------------------------------------------------------------------

test("conferirDocumento: exato, mascarado, CNPJ e ausente", () => {
  assert.equal(conferirDocumento(CPF_CANDIDATO, "529.982.247-25"), "exato")
  assert.equal(conferirDocumento(CPF_CANDIDATO, "52998224725"), "exato")
  assert.equal(conferirDocumento(CPF_CANDIDATO, "***.982.247-**"), "mascarado")
  assert.equal(conferirDocumento(CPF_CANDIDATO, "***.435.151-**"), "nao-confere")
  assert.equal(conferirDocumento(CPF_CANDIDATO, "55.417.969/0001-54"), "nao-confere")
  assert.equal(conferirDocumento(CPF_CANDIDATO, ""), "nao-confere")
  assert.equal(conferirDocumento(CPF_CANDIDATO, null), "nao-confere")
  assert.equal(conferirDocumento(CPF_CANDIDATO, "Sem informação"), "nao-confere")
  assert.equal(conferirDocumento("", "529.982.247-25"), "nao-confere")
})

// ---------------------------------------------------------------------------
// Invariante 3: cadastro que nao respondeu nao vira zero
// ---------------------------------------------------------------------------
//
// O `coleta_log` so pode gravar `vazio_confirmado` quando todos os cadastros
// responderam. Se a falha voltasse como lista vazia, um HTTP 500 no CEIS viraria
// "candidato sem sancao" no relatorio publico, que e a mesma classe de erro do
// falso positivo, so que na direcao contraria.

test("cadastro que falha entra em falhas e nao se confunde com cadastro vazio", async () => {
  const coleta = await coletarSancoesDoCandidato(CPF_CANDIDATO, NOME_CANDIDATO, {
    async buscar(endpoint) {
      if (endpoint.tipo === "CEIS") return { ok: false, erro: "ceis: HTTP 500" }
      return { ok: true, registros: [] }
    },
  })

  assert.equal(coleta.consultou, true)
  assert.deepEqual(coleta.sancoes, [], "falha de cadastro nao pode inventar sancao")
  assert.deepEqual(coleta.falhas, ["ceis: HTTP 500"])
})

test("todos os cadastros respondendo vazio deixa falhas vazio (o zero e afirmavel)", async () => {
  const { deps } = depsEspiao(() => [])
  const coleta = await coletarSancoesDoCandidato(CPF_CANDIDATO, NOME_CANDIDATO, deps)

  assert.equal(coleta.consultou, true)
  assert.deepEqual(coleta.falhas, [])
})

test("guard de CPF barra antes da rede e nao reporta falha de cadastro", async () => {
  const coleta = await coletarSancoesDoCandidato(null, NOME_CANDIDATO, {
    async buscar() {
      throw new Error("nao deveria ter consultado")
    },
  })

  assert.equal(coleta.consultou, false)
  assert.deepEqual(coleta.falhas, [], "sem consulta nao ha cadastro a culpar")
})

test("parseDataBR: DD/MM/AAAA vira ISO, resto vira null", () => {
  assert.equal(parseDataBR("27/05/2025"), "2025-05-27")
  assert.equal(parseDataBR("Sem informação"), null)
  assert.equal(parseDataBR(""), null)
  assert.equal(parseDataBR(null), null)
  assert.equal(parseDataBR("2025-05-27"), null)
})

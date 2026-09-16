import assert from "node:assert/strict"
import test from "node:test"

import {
  fetchTCUCadirreg,
  fetchTCUInabilitados,
  fontePublicaTCU,
  registroTCUIdentidadeCompativel,
  descreverRegistrosTCU,
  montarLinhaPontoAtencaoTCU,
  validarRegistrosTCU,
} from "../scripts/lib/ingest-tcu"

test("TCU consulta inabilitados na Plataforma de Certidões por POST", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = []
  const fetchImpl: typeof fetch = async (url, init) => {
    requests.push({ url: String(url), init })
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  }

  assert.deepEqual(await fetchTCUInabilitados("00000000000", fetchImpl), [])
  assert.equal(requests.length, 1)
  const request = requests[0]
  assert.equal(
    request.url,
    "https://certidoes.apps.tcu.gov.br/api/publico/responsaveis-inabilitados",
  )
  assert.equal(request.init?.method, "POST")
  assert.deepEqual(JSON.parse(String(request.init?.body)), { cpf: "00000000000" })
})

test("TCU não converte payload inválido em lista vazia", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify({ erro: "indisponível" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })

  assert.equal(await fetchTCUInabilitados("00000000000", fetchImpl), null)
})

test("TCU recusa item positivo sem esquema mínimo", () => {
  assert.equal(validarRegistrosTCU([{ nome: "Pessoa sem processo" }]), null)
  assert.equal(validarRegistrosTCU([{ numeroRegistro: "123" }]), null)
  assert.equal(validarRegistrosTCU([{ nome: "Pessoa", numeroRegistro: "123" }])?.length, 1)
})

test("TCU recusa identidade positiva divergente do candidato consultado", () => {
  const registro = { nome: "Maria de Outra Silva", numeroProcessoFormatado: "123/2026" }
  assert.equal(registroTCUIdentidadeCompativel(registro, ["João da Silva", "João Silva"]), false)
  assert.equal(registroTCUIdentidadeCompativel({ ...registro, nome: "João da Silva" }, ["João da Silva"]), true)
})

test("TCU consulta contas irregulares na Plataforma de Certidões por POST", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = []
  const fetchImpl: typeof fetch = async (url, init) => {
    requests.push({ url: String(url), init })
    return new Response(JSON.stringify([]), { status: 200 })
  }

  assert.deepEqual(await fetchTCUCadirreg("00000000000", fetchImpl), [])
  assert.equal(requests.length, 1)
  assert.equal(
    requests[0]?.url,
    "https://certidoes.apps.tcu.gov.br/api/publico/responsaveis-contas-irregulares",
  )
  assert.equal(requests[0]?.init?.method, "POST")
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), { cpf: "00000000000" })
})

test("TCU publica somente link oficial de processo sem CPF", () => {
  const fontes = fontePublicaTCU(
    {
      linkAcompanhamentoProcesso: "https://conecta-tcu.apps.tcu.gov.br/tvp/42733993",
      linkDeliberacoesProcesso:
        "https://contas.tcu.gov.br/pesquisaJurisprudencia/#/resultado/acordao-completo/01568820076.PROC",
    },
    "TCU — processo",
    new Date("2026-08-28T00:00:00Z"),
  )

  assert.deepEqual(fontes, [
    {
      titulo: "TCU — processo",
      url: "https://conecta-tcu.apps.tcu.gov.br/tvp/42733993",
      data: "2026-08-28",
    },
  ])
  assert.equal(JSON.stringify(fontes).includes("00000000000"), false)
})

test("TCU aceita acompanhamento com p1/p2/p3 do processo e recusa query adulterada", () => {
  const registro = { numeroProcessoFormatado: "250.384/1997-3", linkAcompanhamentoProcesso: "https://contas.tcu.gov.br/etcu/AcompanharProcesso?p1=250384&p2=1997&p3=3" }
  assert.equal(fontePublicaTCU(registro, "TCU — processo").length, 1)
  assert.deepEqual(
    fontePublicaTCU(
      { ...registro, linkAcompanhamentoProcesso: `${registro.linkAcompanhamentoProcesso}&cpf=00000000000` },
      "TCU — processo",
    ),
    [],
  )
  assert.deepEqual(
    fontePublicaTCU(
      { ...registro, linkAcompanhamentoProcesso: "https://contas.tcu.gov.br/etcu/AcompanharProcesso?p1=250384&p2=1997&p3=4" },
      "TCU — processo",
    ),
    [],
  )
})

test("TCU recusa host externo e raiz genérica como evidência", () => {
  assert.deepEqual(
    fontePublicaTCU(
      { linkAcompanhamentoProcesso: "https://example.com/tvp/42733993" },
      "TCU — processo",
    ),
    [],
  )
  assert.deepEqual(
    fontePublicaTCU(
      { linkAcompanhamentoProcesso: "https://conecta-tcu.apps.tcu.gov.br/" },
      "TCU — processo",
    ),
    [],
  )
  assert.deepEqual(
    fontePublicaTCU(
      { linkAcompanhamentoProcesso: "https://contas.tcu.gov.br/etcu/AcompanharProcesso" },
      "TCU — processo",
    ),
    [],
  )
  assert.deepEqual(
    fontePublicaTCU(
      { linkAcompanhamentoProcesso: "https://conecta-tcu.apps.tcu.gov.br/tvp/42733993?cpf=00000000000" },
      "TCU — processo",
    ),
    [],
  )
})

test("TCU preserva todos os itens no ponto agregador", () => {
  const registros = Array.from({ length: 5 }, (_, index) => ({
    nome: "Pessoa",
    numeroProcessoFormatado: `PROC-${index + 1}`,
    numeroRegistro: "identificador-pessoal-nao-publicar",
  }))
  const descricao = descreverRegistrosTCU(registros)
  assert.equal((descricao.match(/Registro \d/g) ?? []).length, 5)
  assert.match(descricao, /PROC-1/)
  assert.match(descricao, /PROC-5/)
  assert.doesNotMatch(descricao, /Registro:/)
  assert.doesNotMatch(descricao, /identificador-pessoal/)
  const linha = montarLinhaPontoAtencaoTCU(
    "candidato-1",
    "Contas irregulares no TCU",
    descricao,
    [],
    { id: "ponto-1", descricao: "Texto curado", fontes: [], verificado: false },
  )
  assert.match(linha.descricao, /Texto curado/)
  assert.match(linha.descricao, /PROC-1/)
  assert.match(linha.descricao, /PROC-5/)
})

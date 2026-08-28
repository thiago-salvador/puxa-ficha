import assert from "node:assert/strict"
import test from "node:test"

import {
  fetchTCUCadirreg,
  fetchTCUInabilitados,
  fontePublicaTCU,
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
      { linkAcompanhamentoProcesso: "https://conecta-tcu.apps.tcu.gov.br/tvp/42733993?cpf=00000000000" },
      "TCU — processo",
    ),
    [],
  )
})

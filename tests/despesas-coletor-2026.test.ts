import assert from "node:assert/strict"
import { test } from "node:test"

import { ELEICAO_SINTETICA } from "../scripts/lib/despesas-sanitizar-fixture"
import type { TseChromeClient } from "../scripts/tse-local/chrome-fetch"
import type { FinancingIdentity } from "../scripts/tse-local/divulga-financing"
import { coletarDespesas2026ParaCliente, consultaUrl, despesasUrl, validarEntrega } from "../scripts/tse-local/divulga-despesas"
import { carregarFixture2026 } from "./fixtures/despesas/carregar"

function cenario(nome = "2026-governador-minima") {
  const fixture = carregarFixture2026(nome)
  const conta = fixture.consulta
  const identity: FinancingIdentity = {
    uf: String(conta.sgUe),
    sqCandidato: String(conta.idCandidato),
    cargoCodigo: 3,
    partidoNumero: conta.nrPartido as number,
    numeroCandidato: conta.nrCandidato as number,
  }
  return { fixture, conta, identity }
}

function clienteFalso(respostas: (url: string, chamada: number) => unknown): TseChromeClient & { urls: string[] } {
  const urls: string[] = []
  return {
    urls,
    async getJson(url: string) {
      urls.push(url)
      const resposta = respostas(url, urls.length)
      if (resposta instanceof Error) throw resposta
      return structuredClone(resposta)
    },
    async downloadZip() { throw new Error("coletor de despesas não baixa zip") },
  }
}

test("coleta 2026: consulta, lista da última entrega e reconfirmação da entrega", async () => {
  const { fixture, conta, identity } = cenario()
  const lista = despesasUrl(ELEICAO_SINTETICA, String(conta.idPrestador), String(conta.idUltimaEntrega))
  const client = clienteFalso((url) => (url === lista ? fixture.itens : conta))
  const coleta = await coletarDespesas2026ParaCliente(client, identity, ELEICAO_SINTETICA, { agora: () => new Date("2026-09-29T12:00:00Z") })
  assert.equal(coleta.resultado, "coletado")
  assert.deepEqual(client.urls, [consultaUrl(identity, ELEICAO_SINTETICA), lista, consultaUrl(identity, ELEICAO_SINTETICA)])
  assert.equal(coleta.normalizado!.linha.id_ultima_entrega, conta.idUltimaEntrega)
  assert.equal(coleta.normalizado!.linha.tipo_entrega, "Entrega Parcial - Oficial")
  assert.equal(coleta.normalizado!.linha.coletado_em, "2026-09-29T12:00:00.000Z")
  assert.equal(coleta.normalizado!.linha.cargo_candidatura, "Governador")
})

test("coleta 2026 rejeita lista e consulta de entregas diferentes", async () => {
  const { fixture, conta, identity } = cenario()
  const lista = despesasUrl(ELEICAO_SINTETICA, String(conta.idPrestador), String(conta.idUltimaEntrega))
  const nova = { ...conta, idUltimaEntrega: "7000001", historicoEntregas: [{ idEntrega: "7000001", tipo: "Relatório Financeiro", dataEntrega: "29/09/2026 09:00" }, ...(conta.historicoEntregas as unknown[])] }
  const client = clienteFalso((url, chamada) => (url === lista ? fixture.itens : chamada === 1 ? conta : nova))
  const coleta = await coletarDespesas2026ParaCliente(client, identity, ELEICAO_SINTETICA)
  assert.equal(coleta.resultado, "rejeitado")
  assert.equal(coleta.motivo, "entrega_divergente")
  assert.equal(coleta.normalizado, null)
})

test("coleta 2026 rejeita consulta cuja idUltimaEntrega não é a entrega mais recente", async () => {
  const { conta, identity } = cenario()
  const antiga = { ...conta, idUltimaEntrega: (conta.historicoEntregas as Array<{ idEntrega: string }>)[1]!.idEntrega }
  assert.equal(validarEntrega(antiga), null)
  const client = clienteFalso(() => antiga)
  const coleta = await coletarDespesas2026ParaCliente(client, identity, ELEICAO_SINTETICA)
  assert.equal(coleta.motivo, "entrega_divergente")
  assert.equal(client.urls.length, 1, "a lista nem é pedida")
})

test("coleta 2026 aplica as guardas de identidade do coletor de receitas", async () => {
  const { conta, identity } = cenario()
  for (const divergente of [
    { ...conta, idCandidato: "9000000999" },
    { ...conta, nrPartido: (conta.nrPartido as number) + 1 },
    { ...conta, nrCandidato: (conta.nrCandidato as number) + 1 },
    { ...conta, sgUe: "SP" },
    { ...conta, idEleicao: "1111" },
    { ...conta, ano: 2022 },
  ]) {
    const client = clienteFalso(() => divergente)
    const coleta = await coletarDespesas2026ParaCliente(client, identity, ELEICAO_SINTETICA)
    assert.equal(coleta.motivo, "conta_oficial_divergente")
    assert.equal(client.urls.length, 1)
  }
})

test("coleta 2026: falha de rede é erro, nunca zero", async () => {
  const { identity } = cenario()
  const coleta = await coletarDespesas2026ParaCliente(clienteFalso(() => new Error("403")), identity, ELEICAO_SINTETICA)
  assert.equal(coleta.resultado, "erro")
  assert.equal(coleta.motivo, "fonte_indisponivel")
  assert.equal(coleta.normalizado, null)
})

test("coleta 2026: candidatura sem prestação fica com totais null", async () => {
  const { fixture, conta, identity } = cenario("2026-governador-sem-prestacao")
  const lista = despesasUrl(ELEICAO_SINTETICA, String(conta.idPrestador), String(conta.idUltimaEntrega))
  const client = clienteFalso((url) => (url === lista ? fixture.itens : conta))
  const coleta = await coletarDespesas2026ParaCliente(client, identity, ELEICAO_SINTETICA)
  assert.equal(coleta.resultado, "sem_prestacao")
  assert.equal(coleta.normalizado!.linha.total_despesas_contratadas, null)
  assert.equal(coleta.normalizado!.linha.total_despesas_pagas, null)
})

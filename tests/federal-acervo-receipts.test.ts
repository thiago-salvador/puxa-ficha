import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  parseFederalAcervoReceiptDetail,
  projectFederalAcervoReceipts,
} from "../src/lib/federal-acervo-receipts"

function receipt(source: "camara" | "senado" | "ceaps-senado" | "jarbas") {
  const chamber = source === "camara" || source === "jarbas"
  return {
    fonte: source,
    resultado: "nao_aplicavel",
    executado_em: "2026-09-15T21:00:09.736Z",
    verificado_em: "2026-09-15T12:51:37.617Z",
    detalhe: "Nenhum vínculo nominal retornado no escopo oficial.",
    escopo: "registro nominal atual e histórico retornado pelas listas oficiais",
    source_ids: chamber
      ? ["camara-parliamentarian-registry-all-legislatures", "camara-parliamentarian-registry-scope-control"]
      : ["senado-parliamentarian-registry-all-legislatures", "senado-parliamentarian-registry-scope-control"],
    source_urls: chamber
      ? ["https://www.camara.leg.br/deputados/quem-sao", "https://dadosabertos.camara.leg.br/api/v2/deputados"]
      : ["https://www25.senado.leg.br/web/senadores/pesquisa", "https://legis.senado.leg.br/dadosabertos/senador/lista/legislatura/1/57"],
  }
}

describe("recibos federais estruturados", () => {
  it("projeta as quatro famílias somente com prova oficial completa", () => {
    const projected = projectFederalAcervoReceipts({
      camara: receipt("camara"),
      senado: receipt("senado"),
      "ceaps-senado": receipt("ceaps-senado"),
      jarbas: receipt("jarbas"),
      gastos_parlamentares_aplicabilidade: { status: "not_applicable" },
    })
    assert.deepEqual(Object.keys(projected ?? {}).sort(), ["camara", "ceaps-senado", "jarbas", "senado"])
  })

  it("usa a chave canônica como fonte quando o JSON histórico não repetiu fonte", () => {
    const historical = { ...receipt("camara"), fonte: undefined }
    assert.equal(projectFederalAcervoReceipts({ camara: historical })?.camara?.fonte, "camara")
  })

  it("rejeita fonte sem domínio oficial, ID obrigatório ou cronologia válida", () => {
    const invalidHost = { ...receipt("camara"), source_urls: ["https://example.org/deputados", "https://dadosabertos.camara.leg.br/api/v2/deputados"] }
    const missingId = { ...receipt("senado"), source_ids: ["senado-parliamentarian-registry-all-legislatures"] }
    const futureProof = { ...receipt("jarbas"), verificado_em: "2026-09-16T00:00:00.000Z" }
    const mixedTypes = { ...receipt("ceaps-senado"), source_ids: [...receipt("ceaps-senado").source_ids, 7] }
    const projected = projectFederalAcervoReceipts({ camara: invalidHost, senado: missingId, jarbas: futureProof, "ceaps-senado": mixedTypes })
    assert.equal(projected, null)
  })

  it("não converte prosa livre em recibo canônico", () => {
    assert.equal(parseFederalAcervoReceiptDetail(
      "Nenhum vínculo encontrado após consulta dos diretórios oficiais.",
      "2026-09-15T21:00:09.736Z",
    ), null)
  })

  it("mantém compatibilidade com a serialização canônica do materializador", () => {
    const parsed = parseFederalAcervoReceiptDetail(
      "Nenhum vínculo. Escopo: registro nominal. Fontes camara-parliamentarian-registry-all-legislatures, camara-parliamentarian-registry-scope-control; verificado em 2026-09-15T12:51:37.617Z; URLs: https://www.camara.leg.br/deputados/quem-sao | https://dadosabertos.camara.leg.br/api/v2/deputados. Readback obrigatório: concluído.",
      "2026-09-15T21:00:09.736Z",
    )
    assert.equal(parsed?.escopo, "registro nominal")
    assert.deepEqual(parsed?.source_ids, [
      "camara-parliamentarian-registry-all-legislatures",
      "camara-parliamentarian-registry-scope-control",
    ])
    assert.deepEqual(parsed?.source_urls, [
      "https://www.camara.leg.br/deputados/quem-sao",
      "https://dadosabertos.camara.leg.br/api/v2/deputados",
    ])
  })
})

import assert from "node:assert/strict"
import { it } from "node:test"

import { assertCompleteAssets } from "../scripts/audit/fetch-tse-family-sources-local"

it("reprova download sem nenhum pacote apesar do manifesto ter sido escrito", () => {
  assert.throws(() => assertCompleteAssets([], [{ family: "historico_politico", year: 2026, catalog_url: "https://dadosabertos.tse.jus.br", reason: "HTTP 403" }]), /0 asset\(s\), 1 pendente/)
  assert.throws(() => assertCompleteAssets([], []), /0 asset\(s\), 0 pendente/)
})

it("aceita somente rodada sem pendências", () => {
  const asset = {
    family: "historico_politico" as const,
    year: 2026,
    path: "/tmp/consulta_cand_2026.zip",
    url: "https://cdn.tse.jus.br/consulta_cand_2026.zip",
    sha256: "a".repeat(64),
    bytes: 1,
    catalog_url: "https://dadosabertos.tse.jus.br",
    catalog_revision: null,
  }
  assert.doesNotThrow(() => assertCompleteAssets([asset], []))
  assert.throws(() => assertCompleteAssets([asset], [{ family: "historico_politico", year: 2024, catalog_url: asset.catalog_url, reason: "HTTP 403" }]), /1 pendente/)
})

it("nomeia a família e o ano que faltam no erro", () => {
  assert.throws(
    () => assertCompleteAssets([], [
      { family: "historico_politico", year: 2024, catalog_url: "https://dadosabertos.tse.jus.br", reason: "HTTP 403" },
      { family: "financiamento", year: 2018, catalog_url: "https://dadosabertos.tse.jus.br", reason: "catálogo oficial indisponível" },
    ]),
    /2 pendente\(s\): historico_politico\/2024 \(HTTP 403\); financiamento\/2018 \(catálogo oficial indisponível\)/,
  )
})

import assert from "node:assert/strict"
import { test } from "node:test"

import { resolverRecursos } from "../scripts/audit/fetch-tse-fontes-2026"

test("downloader oficial pode ser importado no runtime CommonJS do repo", () => {
  const recursos = resolverRecursos({
    resources: [
      { name: "Candidatos", url: "https://example.test/candidatos.zip" },
      {
        name: "Candidatos - Informações complementares",
        url: "https://example.test/complementares.zip",
      },
      {
        name: "Redes sociais de candidatos",
        url: "https://example.test/redes.zip",
      },
    ],
  })

  assert.deepEqual(
    recursos.map(({ arquivo }) => arquivo),
    [
      "consulta_cand_2026.zip",
      "consulta_cand_complementar_2026.zip",
      "rede_social_candidato_2026.zip",
    ],
  )
})

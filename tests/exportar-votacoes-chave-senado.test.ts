import assert from "node:assert/strict"
import test from "node:test"
import { idsVotacoesChaveSenado } from "../scripts/audit/exportar-votacoes-chave-senado"

test("exporta IDs Senado distintos e ignora casas/fontes e IDs inválidos", () => {
  assert.deepEqual(idsVotacoesChaveSenado([
    { casa: "Senado", fonte: "senado", votacao_id_api: "6377" },
    { casa: "Senado", fonte: "senado", votacao_id_api: 6046 },
    { casa: "Senado", fonte: "senado", votacao_id_api: "6377" },
    { casa: "Câmara", fonte: "camara", votacao_id_api: "2122076-348" },
    { casa: "Senado", fonte: "camara", votacao_id_api: "123" },
    { casa: "Senado", fonte: "senado", votacao_id_api: "6046-1" },
    { casa: "Senado", fonte: "senado", votacao_id_api: null },
  ]), ["6046", "6377"])
})

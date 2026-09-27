import assert from "node:assert/strict"
import { test } from "node:test"
import { decidirChaveOcupada, type LinhaNaChave } from "../scripts/lib/gastos-chave-anual"

const senado = (fonte: string | null) => fonte === "Senado"
const linha = (over: Partial<LinhaNaChave>): LinhaNaChave => ({ id: "l1", fonte: "Senado", total_gasto: 10, despublicado_em: "2026-09-25T00:00:00Z", ...over })

test("chave livre insere", () => {
  assert.deepEqual(decidirChaveOcupada(null, senado, { aceitaPublicada: false }), { acao: "inserir" })
})

test("linha despublicada da mesma Casa é substituída no lugar", () => {
  const ocupante = linha({})
  assert.deepEqual(decidirChaveOcupada(ocupante, senado, { aceitaPublicada: false }), { acao: "substituir", linha: ocupante })
})

test("linha de outra fonte segue em revisão, publicada ou não", () => {
  assert.equal(decidirChaveOcupada(linha({ fonte: "Camara" }), senado, { aceitaPublicada: true }).acao, "revisao")
  assert.equal(decidirChaveOcupada(linha({ fonte: null }), senado, { aceitaPublicada: true }).acao, "revisao")
})

test("linha publicada só é substituída quando o coletor aceita", () => {
  const publicada = linha({ despublicado_em: null })
  assert.equal(decidirChaveOcupada(publicada, senado, { aceitaPublicada: false }).acao, "revisao")
  assert.equal(decidirChaveOcupada(publicada, senado, { aceitaPublicada: true }).acao, "substituir")
})

test("carga antiga da cota da Câmara conta como a mesma Casa só pelo rótulo exato", async () => {
  const { fonteCotaCamaraLegada } = await import("../scripts/lib/ingest-camara-cota-csv")
  assert.equal(fonteCotaCamaraLegada("Cota Parlamentar/Camara dadosabertos (onda-p-20260814)"), true)
  assert.equal(fonteCotaCamaraLegada("Cota Parlamentar/Camara dadosabertos"), true)
  assert.equal(fonteCotaCamaraLegada("Cota Parlamentar/Senado"), false)
  assert.equal(fonteCotaCamaraLegada(null), false)
})

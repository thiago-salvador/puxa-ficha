import assert from "node:assert/strict"
import test from "node:test"
import { classifyPhoto, classifySource, classifyVerification, type CloseoutEvidence } from "../scripts/lib/senado-closeout-status"

const candidate = { id: "candidate-1", verificacao_campos: null }
const evidence = (extra: Partial<CloseoutEvidence> = {}): CloseoutEvidence => ({
  selected: true,
  candidate,
  receipts: [],
  ...extra,
})

test("seleção e zero linhas sem recibo não produzem vazio", () => {
  const result = classifySource(evidence(), "tcu", false)
  assert.equal(result.status, "pendente")
  assert.notEqual(result.status, "vazio_confirmado")
})

test("seleção não prova consulta ao TCU", () => {
  assert.equal(classifySource(evidence(), "tcu").status, "pendente")
})

test("recibo que declara nenhuma consulta não prova ausência", () => {
  const result = classifySource(evidence({
    receipts: [{ fonte: "tcu", escopo: "candidato", alvo: "candidate-1", candidato_id: "candidate-1", executado_em: "2026-09-15T00:00:00Z", resultado: "vazio_confirmado", volume: 0, detalhe: "nenhuma consulta foi realizada", url: "https://example.test/tcu" }],
  }), "tcu")
  assert.equal(result.status, "pendente")
})

test("recibo TCU antigo sem referência rastreável não prova coleta", () => {
  const result = classifySource(evidence({
    receipts: [{ fonte: "tcu", escopo: "candidato", alvo: "candidate-1", candidato_id: "candidate-1", executado_em: "2026-09-15T00:00:00Z", resultado: "encontrado", volume: 1, detalhe: "candidatos", url: null }],
  }), "tcu")
  assert.equal(result.status, "pendente")
})

test("verificação em erro não prova coleta", () => {
  const result = classifyVerification(evidence({
    candidate: { id: "candidate-1", verificacao_campos: { candidate_registration: { estado: "erro", fontes_consultadas: [{ url: "https://example.test" }] } } },
  }), "candidate_registration")
  assert.notEqual(result.status, "coletado")
})

test("dados presentes sem recibo não implicam coleção completa", () => {
  const result = classifySource(evidence(), "tcu", true)
  assert.equal(result.status, "dados_presentes_cobertura_nao_verificada")
})

test("existência do perfil sem proveniência não prova coleta completa", () => {
  const result = classifyVerification(evidence(), "candidate_registration")
  assert.equal(result.status, "dados_presentes_cobertura_nao_verificada")
})

test("chave de foto presente sem recibo fotográfico válido não prova coleta", () => {
  const result = classifyPhoto(evidence({ photoReceipt: {} }))
  assert.equal(result.status, "pendente")
})

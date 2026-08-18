import test from "node:test"
import assert from "node:assert/strict"
import {
  observacaoHistoricoRequerRevisao,
  observacoesHistoricoProblematicas,
} from "../scripts/lib/historico-observacoes"

test("observacoesHistoricoProblematicas: vazio ou null não conta", () => {
  assert.equal(observacoesHistoricoProblematicas(null), false)
  assert.equal(observacoesHistoricoProblematicas(""), false)
  assert.equal(observacoesHistoricoProblematicas("   "), false)
})

test("observacoesHistoricoProblematicas: indeferido, NULO, cassado, falecido", () => {
  assert.equal(observacoesHistoricoProblematicas("Candidatura INDEFERIDA pelo TSE"), true)
  assert.equal(observacoesHistoricoProblematicas("Cargo #NULO#"), true)
  assert.equal(observacoesHistoricoProblematicas("Mandato cassado"), true)
  assert.equal(observacoesHistoricoProblematicas("Registro — falecido"), true)
})

test("observacoesHistoricoProblematicas: renúncia de terceiro (sucessão) não bloqueia", () => {
  assert.equal(
    observacoesHistoricoProblematicas("Governadora após a renúncia de Gladson Cameli"),
    false
  )
  assert.equal(observacoesHistoricoProblematicas("Posse após renúncia de João Silva"), false)
})

test("observacoesHistoricoProblematicas: renúncia do próprio mandato/cargo ainda bloqueia", () => {
  assert.equal(observacoesHistoricoProblematicas("Renúncia do mandato em 2020"), true)
  assert.equal(observacoesHistoricoProblematicas("Renúncia ao cargo"), true)
  assert.equal(observacoesHistoricoProblematicas("Renúncia da candidatura"), true)
})

test("observacaoHistoricoRequerRevisao aceita estado oficial de candidatura e mandato encerrado", () => {
  assert.equal(
    observacaoHistoricoRequerRevisao({
      observacoes: "Registro indeferido pelo TSE",
      tipo_evento: "candidatura",
      periodo_fim: 2018,
    }, 2026),
    false,
  )
  assert.equal(
    observacaoHistoricoRequerRevisao({
      observacoes: "Renúncia ao mandato em abril de 2026",
      tipo_evento: "mandato",
      periodo_fim: 2026,
    }, 2026),
    false,
  )
})

test("observacaoHistoricoRequerRevisao mantém marcador cru e mandato aberto como bloqueios", () => {
  assert.equal(
    observacaoHistoricoRequerRevisao({ observacoes: "Cargo #NULO#", periodo_fim: 2020 }, 2026),
    true,
  )
  assert.equal(
    observacaoHistoricoRequerRevisao({ observacoes: "Mandato cassado", periodo_fim: null }, 2026),
    true,
  )
})

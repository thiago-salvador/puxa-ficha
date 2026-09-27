import assert from "node:assert/strict"
import test from "node:test"
import { IMPRENSA_UFS, chapaSummary, getImprensaUfName, isImprensaUf, labelState, rowGaps, verifiedUpdatesLabel } from "@/lib/imprensa-uf-pack"

test("pacotes cobrem exatamente as 27 UFs e normalizam códigos em minúsculas", () => {
  assert.equal(IMPRENSA_UFS.length, 27)
  assert.equal(new Set(IMPRENSA_UFS).size, 27)
  assert.ok(isImprensaUf("sp"))
  assert.ok(!isImprensaUf("br"))
  assert.ok(!isImprensaUf("XX"))
})

test("lacunas preservam revisão de vínculo e estados não conclusivos", () => {
  const row = {
    cargo: "Governador",
    chapa: { estado: "vinculo_em_revisao", suplentesEstado: "nao_aplicavel" },
    sites: { estado: "sem_dado" },
    processos: { estado: "indeterminado" },
  } as Parameters<typeof rowGaps>[0]
  assert.deepEqual(rowGaps(row), ["vínculo do vice em revisão", "sites sem dado publicado", "processos: Indeterminado"])
  assert.equal(chapaSummary(row), "Vínculo do vice em revisão")
  assert.equal(chapaSummary({ ...row, chapa: { ...row.chapa, estado: "estado_novo" } } as unknown as Parameters<typeof chapaSummary>[0]), "Composição da chapa exige conferência")
  assert.deepEqual(rowGaps({ ...row, processos: { ...row.processos, estado: "cobertura_parcial" } }), ["vínculo do vice em revisão", "sites sem dado publicado", "processos: Cobertura parcial"])
})

test("rótulos de estado, nome da UF e plural de atualizações são legíveis", () => {
  assert.equal(labelState("nao_buscado"), "Não buscado")
  assert.equal(labelState("valor_novo"), "Exige conferência")
  assert.equal(getImprensaUfName("SP"), "São Paulo")
  assert.equal(verifiedUpdatesLabel(1), "1 registro verificado")
  assert.equal(verifiedUpdatesLabel(2), "2 registros verificados")
})

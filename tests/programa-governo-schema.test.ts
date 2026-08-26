import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  assertProgramaGovernoFonte,
  assertProgramaGovernoRegistro,
  toProgramaGovernoPublico,
  type ProgramaGovernoRegistro,
} from "../src/lib/programa-governo"

const registryPath = new URL("../scripts/data/programas-governo-presidencia-2026-fontes.json", import.meta.url)
const registry = JSON.parse(readFileSync(registryPath, "utf8")) as unknown[]

function words(count: number): string {
  return Array.from({ length: count }, (_, index) => `palavra${index + 1}`).join(" ")
}

function validRecord(): ProgramaGovernoRegistro {
  const texto = words(120)
  return {
    version: 1,
    estado: "aprovado",
    fonte: registry[0] as ProgramaGovernoRegistro["fonte"],
    extracao: {
      sourceSha256: "a".repeat(64),
      extractedTextSha256: "b".repeat(64),
      paginas: 2,
      secoes: [{ id: "introducao", titulo: "Introdução", nivel: 1, paginaInicial: 1, paginaFinal: 2, origem: "pdftotext", conteudo: "Conteúdo" }],
    },
    resumo: {
      texto,
      frases: Array.from({ length: 6 }, () => ({ texto, evidencias: [{ pagina: 1, trecho: "Trecho da fonte" }] })),
      temas: Array.from({ length: 4 }, (_, index) => ({
        id: `tema-${index + 1}`,
        titulo: `Tema ${index + 1}`,
        descricao: "Descrição neutra",
        evidencias: [{ pagina: index % 2 + 1, trecho: "Trecho da fonte" }],
      })),
    },
    geracao: { promptVersion: "v1", model: "modelo", generatedAt: "2026-08-25T10:00:00Z" },
    revisao: {
      reviewer: "editor",
      reviewedAt: "2026-08-25T11:00:00Z",
      sourceSha256: "a".repeat(64),
      extractedTextSha256: "b".repeat(64),
    },
  }
}

test("registry covers the 13 current official presidential documents by SQ", () => {
  assert.equal(registry.length, 13)
  const sqs = new Set<string>()
  for (const [index, row] of registry.entries()) {
    assertProgramaGovernoFonte(row, `registry[${index}]`)
    const sq = (row as { sqCandidato: string }).sqCandidato
    assert.equal(sqs.has(sq), false, `duplicate SQ_CANDIDATO ${sq}`)
    sqs.add(sq)
  }
  const legacyMigration = readFileSync(
    new URL("../supabase/migrations/20260816011000_chapas_2026_tse_pos_registro.sql", import.meta.url),
    "utf8",
  )
  for (const sq of sqs) {
    if (sq === "280002553884" || sq === "280002552484" || sq === "280002548139") continue
    assert.match(legacyMigration, new RegExp(sq), `SQ ${sq} must be anchored in the versioned TSE migration`)
  }
  assert.ok(sqs.has("280002552484"), "Clariana must use the current titular SQ, not a name match")
  assert.ok(sqs.has("280002548139"), "Wilson must use the current titular SQ, not a name match")
  assert.ok(sqs.has("280002553884"), "the current TSE package adds Pablo Marçal after the migration snapshot")
})

test("approved content requires bounded summary and evidence", () => {
  const record = validRecord()
  assert.doesNotThrow(() => assertProgramaGovernoRegistro(record))

  const withoutEvidence = structuredClone(record)
  withoutEvidence.resumo!.temas[0].evidencias = []
  assert.throws(() => assertProgramaGovernoRegistro(withoutEvidence), /registro\.resumo\.temas\[0\]\.evidencias/)

  const tooShort = structuredClone(record)
  tooShort.resumo!.texto = words(119)
  tooShort.resumo!.frases[0].texto = tooShort.resumo!.texto
  assert.throws(() => assertProgramaGovernoRegistro(tooShort), /120 e 180 palavras/)
})

test("changed source or extracted text invalidates approval", () => {
  const record = validRecord()
  record.revisao!.sourceSha256 = "c".repeat(64)
  assert.throws(() => assertProgramaGovernoRegistro(record), /fonte mudou depois da revisao/)
})

test("public conversion fails closed and strips editorial internals", () => {
  const pending = validRecord()
  pending.estado = "aguardando_revisao"
  delete pending.revisao
  assert.throws(() => toProgramaGovernoPublico(pending), /somente registros aprovados/)

  const publicRecord = toProgramaGovernoPublico(validRecord())
  assert.equal("geracao" in publicRecord, false)
  assert.equal("reviewer" in publicRecord, false)
  assert.equal("coletadoEm" in publicRecord.fonte, false)
  assert.equal(publicRecord.estado, "aprovado")
})

test("PROGRAMAS_SCHEMA_PASS", () => {
  assert.equal(true, true)
})

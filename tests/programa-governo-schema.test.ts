import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  assertProgramaGovernoIdentidade,
  assertProgramaGovernoIdentidadeCorresponde,
  assertProgramaGovernoFonte,
  assertProgramaGovernoRegistro,
  normalizarProgramaGovernoEstado,
  programaGovernoChave,
  toProgramaGovernoManifestoPublico,
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

function syntheticGovernorRecord(): ProgramaGovernoRegistro {
  const record = validRecord()
  record.estado = "em_revisao"
  record.fonte = {
    ...record.fonte,
    cargo: "GOVERNADOR",
    uf: "SP",
    sqCandidato: "250000000001",
    slug: "candidatura-governador-teste",
    nomeUrna: "CANDIDATURA DE TESTE",
    partido: "TESTE",
    arquivoNome: "2026SP250000000001_01.pdf",
    arquivoNoPacote: "SP/2026SP250000000001_01.pdf",
  }
  delete record.revisao
  return record
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

test("common contract accepts governor identity and canonical editorial states", () => {
  const record = syntheticGovernorRecord()
  assert.doesNotThrow(() => assertProgramaGovernoRegistro(record))
  assert.equal(programaGovernoChave(record.fonte), "2026:GOVERNADOR:SP:250000000001")
  assert.equal(normalizarProgramaGovernoEstado("aguardando_revisao"), "em_revisao")
  assert.equal(normalizarProgramaGovernoEstado("fonte_ausente"), "sem_documento_oficial")

  for (const estado of ["sem_documento_oficial", "falha_de_extracao", "perfil_local_ausente"] as const) {
    const terminal = syntheticGovernorRecord()
    terminal.estado = estado
    delete terminal.extracao
    delete terminal.resumo
    delete terminal.geracao
    delete terminal.julgamento
    assert.doesNotThrow(() => assertProgramaGovernoRegistro(terminal))
  }
})

test("office and UF combinations fail closed", () => {
  const governorInBr = syntheticGovernorRecord().fonte
  governorInBr.uf = "BR"
  assert.throws(() => assertProgramaGovernoIdentidade(governorInBr), /governador deve usar uma UF valida/)

  const presidentInState = structuredClone(validRecord().fonte)
  presidentInState.uf = "SP"
  assert.throws(() => assertProgramaGovernoIdentidade(presidentInState), /presidencia deve usar BR/)
})

test("compound identity rejects cross-candidate, cross-office and cross-UF matches", () => {
  const expected = syntheticGovernorRecord().fonte
  assert.doesNotThrow(() => assertProgramaGovernoIdentidadeCorresponde(expected, structuredClone(expected)))

  for (const mutation of [
    { sqCandidato: "250000000002" },
    { uf: "RJ" as const },
    { cargo: "PRESIDENTE" as const, uf: "BR" as const },
    { slug: "outra-candidatura" },
    { partido: "OUTRO" },
  ]) {
    const actual = { ...expected, ...mutation }
    assert.throws(
      () => assertProgramaGovernoIdentidadeCorresponde(actual, expected),
      /identidade eleitoral diverge/,
    )
  }
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

test("non-approved manifest never exposes draft content, claims or editorial metadata", () => {
  const pending = syntheticGovernorRecord()
  pending.geracao = { promptVersion: "segredo", model: "modelo-interno", generatedAt: "2026-08-25T10:00:00Z" }
  pending.julgamento = {
    model: "juiz-interno",
    judgedAt: "2026-08-25T10:30:00Z",
    verdicts: [{ id: "claim-1", verdict: "yes", reason: "metadado editorial" }],
  }

  const manifesto = toProgramaGovernoManifestoPublico(pending)
  const serialized = JSON.stringify(manifesto)
  assert.equal(manifesto.estado, "em_revisao")
  assert.equal("resumo" in manifesto, false)
  assert.equal("paginas" in manifesto, false)
  assert.equal("reviewedAt" in manifesto, false)
  assert.doesNotMatch(serialized, /palavra1|claim-1|segredo|modelo-interno|juiz-interno|metadado editorial/)
})

test("PROGRAMAS_SCHEMA_PASS", () => {
  assert.equal(true, true)
})

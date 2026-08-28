import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { compareCandidacies } from "../scripts/lib/data-freshness/candidaturas"
import { parseOfficialCandidaciesZip } from "../scripts/lib/data-freshness/tse-source"
import type { CandidacyRecord, RelevantOffice } from "../scripts/lib/data-freshness/types"

function record(sq: string, cargo: RelevantOffice, overrides: Partial<CandidacyRecord> = {}): CandidacyRecord {
  return {
    sq_candidato: sq,
    cargo,
    uf: cargo.includes("PRESIDENTE") ? null : "AC",
    sq_coligacao: "10001800116",
    nome_urna: `PESSOA ${sq}`,
    partido_sigla: "TESTE",
    situacao_codigo: "-3",
    situacao_descricao: "CADASTRADO",
    perfil_slug: `pessoa-${sq}`,
    ...overrides,
  }
}

test("universo contabiliza os quatro cargos relevantes", () => {
  const offices: RelevantOffice[] = ["PRESIDENTE", "VICE PRESIDENTE", "GOVERNADOR", "VICE GOVERNADOR"]
  const records = offices.map((office, index) => record(String(index + 1), office, { sq_coligacao: String(index + 1) }))
  const result = compareCandidacies(records, records)
  assert.equal(result.official_count, 4)
  assert.equal(result.published_count, 4)
  assert.equal(result.status, "ok")
})

test("classifica inclusão, remoção, substituição, situação, identidade e ficha ausente", () => {
  const official = [
    record("1", "GOVERNADOR"),
    record("2", "VICE GOVERNADOR", { sq_coligacao: "B" }),
    record("3", "GOVERNADOR", { sq_coligacao: "C", situacao_codigo: "12" }),
    record("4", "GOVERNADOR", { sq_coligacao: "D", nome_urna: "NOME OFICIAL" }),
    record("5", "GOVERNADOR", { sq_coligacao: "E" }),
  ]
  const published = [
    record("old", "GOVERNADOR"),
    record("gone", "VICE GOVERNADOR", { sq_coligacao: "G" }),
    record("3", "GOVERNADOR", { sq_coligacao: "C", situacao_codigo: "-3" }),
    record("4", "GOVERNADOR", { sq_coligacao: "D", nome_urna: "NOME ERRADO" }),
    record("5", "GOVERNADOR", { sq_coligacao: "E", perfil_slug: null }),
  ]
  const result = compareCandidacies(official, published)
  assert.deepEqual(result.counts, {
    inclusion: 1,
    removal: 1,
    replacement: 1,
    status_change: 1,
    identity_mismatch: 1,
    missing_profile: 1,
  })
  assert.equal(result.status, "review_required")
})

test("ficha própria é obrigatória para titular, mas não para vice", () => {
  const official = [
    record("1", "GOVERNADOR", { sq_coligacao: "A" }),
    record("2", "VICE GOVERNADOR", { sq_coligacao: "A" }),
  ]
  const published = official.map((item) => ({ ...item, perfil_slug: null }))
  const result = compareCandidacies(official, published)
  assert.equal(result.counts.missing_profile, 1)
  assert.equal(result.changes.find((change) => change.kind === "missing_profile")?.official?.cargo, "GOVERNADOR")
})

test("parser do ZIP oficial limita o universo aos quatro cargos e ao primeiro turno", async () => {
  const work = mkdtempSync(join(tmpdir(), "tse-source-test-"))
  try {
    const csv = join(work, "consulta_cand_2026_AC.csv")
    const zip = join(work, "consulta_cand_2026.zip")
    const header = [
      "DS_CARGO", "NR_TURNO", "SQ_CANDIDATO", "SG_UF", "SQ_COLIGACAO",
      "NM_URNA_CANDIDATO", "NM_CANDIDATO", "SG_PARTIDO",
      "CD_SITUACAO_CANDIDATURA", "DS_SITUACAO_CANDIDATURA",
    ].join(";")
    const row = (cargo: string, turn: string, sq: string) =>
      [cargo, turn, sq, "AC", `COL-${sq}`, `NOME ${sq}`, `NOME COMPLETO ${sq}`, "PTESTE", "-3", "CADASTRADO"].join(";")
    const contents = [
      header,
      row("PRESIDENTE", "1", "1"),
      row("VICE-PRESIDENTE", "1", "2"),
      row("GOVERNADOR", "1", "3"),
      row("VICE-GOVERNADOR", "1", "4"),
      row("SENADOR", "1", "5"),
      row("GOVERNADOR", "2", "6"),
    ].join("\n")
    writeFileSync(csv, Buffer.from(contents, "latin1"))
    execFileSync("zip", ["-q", "-j", zip, csv])
    const records = await parseOfficialCandidaciesZip(readFileSync(zip))
    assert.deepEqual(records.map((item) => item.cargo).sort(), [
      "GOVERNADOR",
      "PRESIDENTE",
      "VICE GOVERNADOR",
      "VICE PRESIDENTE",
    ])
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
})

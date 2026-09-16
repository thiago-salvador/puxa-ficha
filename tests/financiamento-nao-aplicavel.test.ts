import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import type { SupabaseClient } from "@supabase/supabase-js"
import { fetchAll, validateEvidence, type ScanEvidence } from "../scripts/apply-financiamento-nao-aplicavel"

test("paginação respeita limite menor do servidor e termina somente na página vazia", async () => {
  const data = Array.from({ length: 5 }, (_, id) => ({ id }))
  const offsets: number[] = []
  const query = {
    select() { return this }, order() { return this },
    async range(offset: number) { offsets.push(offset); return { data: data.slice(offset, offset + 2), error: null } },
  }
  const client = { from() { return query } } as unknown as SupabaseClient
  assert.deepEqual(await fetchAll(client, "table", "id", ["id"]), data)
  assert.deepEqual(offsets, [0, 2, 4, 5])
})

test("paginação rejeita chave repetida em vez de validar inventário parcial", async () => {
  const query = { select() { return this }, order() { return this }, async range() { return { data: [{ id: 1 }], error: null } } }
  await assert.rejects(fetchAll({ from() { return query } } as unknown as SupabaseClient, "table", "id", ["id"]), /chave repetida/)
})

test("evidência recusa ausência sem âncora, pacote inválido, universo incompleto ou hash divergente", () => {
  const dir = mkdtempSync(join(tmpdir(), "pf-money-evidence-test-"))
  const file = join(dir, "source")
  writeFileSync(file, "source-fixture")
  const hash = createHash("sha256").update("source-fixture").digest("hex")
  const source = (ano: number) => ({ ano, source_url: `https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_${ano}.zip`, artifact_path: file, sha256: hash, national_member: `consulta_cand_${ano}_BRASIL.csv`, national_complete: true, cpf_header_present: true, zip_integrity_checked: true, csv_parser_ok: true, national_rows_scanned: 1, uf_members: [] })
  const base: ScanEvidence = {
    schema_version: "senado-financiamento-nao-aplicavel-scan-v1", generated_at: new Date().toISOString(), years: [2022],
    anchor: { year: 2026, field: "NR_CPF_CANDIDATO", method: "igualdade em memória", valid_anchor_count: 1, anchored_sqs: ["123"], rows_scanned: 1 },
    source_proof_2026: source(2026), source_proof: { "2022": source(2022) },
    coverage: { "2022": { rows_scanned: 1, cpf_matches: 0, unique_matches: 0, ambiguous_matches: 0 } },
    zero_sqs_by_year: { "2022": ["123"] }, ambiguous_sqs_by_year: { "2022": [] },
  }
  try {
    assert.doesNotThrow(() => validateEvidence(base))
    const missingAnchor = structuredClone(base); missingAnchor.zero_sqs_by_year[2022] = ["456"]
    assert.throws(() => validateEvidence(missingAnchor), /sem âncora/)
    const failedParse = structuredClone(base); failedParse.source_proof[2022].csv_parser_ok = false
    assert.throws(() => validateEvidence(failedParse), /prova inválida/)
    const incomplete = structuredClone(base); incomplete.zero_sqs_by_year[2022] = []
    assert.throws(() => validateEvidence(incomplete), /universo incompleto/)
    const wrongDate = structuredClone(base); wrongDate.generated_at = "invalid"
    assert.throws(() => validateEvidence(wrongDate), /data/)
    writeFileSync(file, "altered")
    assert.throws(() => validateEvidence(base), /hash/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

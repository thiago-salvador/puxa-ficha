import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, resolve } from "node:path"
import test from "node:test"
import { buildPreflightManifest, runPreflight } from "../scripts/pesquisas-atualizacao-agendada/preflight"

test("preflight reaproveita captura íntegra sem promover resumo ou esconder arquivo ausente", () => {
  const root = mkdtempSync(resolve(tmpdir(), "poll-preflight-"))
  const write = (path: string, value: string) => { mkdirSync(dirname(resolve(root, path)), { recursive: true }); writeFileSync(resolve(root, path), value) }
  try {
    write("src/lib/pesquisas-eleitorais.ts", "parser")
    write("scripts/data/pesquisas-buscas-alternativas.json", "{}")
    write("data/candidate-roster-active-20260905.json", "{}")
    write("scripts/data/pesquisas-eleitorais-fontes.json", "{}")
    write("scripts/data/pesquisas-governadores-fontes.json", "{}")
    write("evidence/literal.txt", "fonte literal")
    write("evidence/summary.txt", "resumo anterior")
    const poll = (id: string, path: string, format: string, body: string) => ({ id, source_status: "condicional", office: "Governador", geography: { code: "AC" }, registration: { code: { value: id } }, cenarios: [{ resultados: [{ value_percent: 20 }] }], provenance: { result_url: `https://example.org/${id}`, capture: { path, format, sha256: createHash("sha256").update(body).digest("hex") } } })
    const records = [poll("literal", "evidence/literal.txt", "text", "fonte literal"), poll("summary", "evidence/summary.txt", "structured_summary", "resumo anterior"), poll("missing", "evidence/missing.txt", "text", "ausente")]
    write("scripts/data/pesquisas-presidencia-2026.json", JSON.stringify({ pesquisas: [] }))
    write("scripts/data/pesquisas-governadores-2026.json", JSON.stringify({ datasets: [{ pesquisas: records }] }))
    const manifest = buildPreflightManifest(root, resolve(root, "evidence"))
    assert.equal(manifest.documents.length, 3)
    assert.deepEqual(manifest.documents.map(row => row.evidence_kind), ["literal", "summary", "summary"])
    const first = runPreflight(root, resolve(root, "evidence"), resolve(root, "state"))
    assert.equal(first.failed, 1)
    assert.equal(first.queued, 3)
    const second = runPreflight(root, resolve(root, "evidence"), resolve(root, "state"))
    assert.equal(second.queued, 3, "pendências não desaparecem por repetição")
    const queue = JSON.parse(readFileSync(second.queue, "utf8"))
    assert.equal(queue.queue.find((row: { id: string }) => row.id === "literal").reason, "unresolved")
    records[0].cenarios[0].resultados[0].value_percent = 21
    write("scripts/data/pesquisas-governadores-2026.json", JSON.stringify({ datasets: [{ pesquisas: records }] }))
    const updated = buildPreflightManifest(root, resolve(root, "evidence"))
    assert.notEqual(updated.documents[0].extraction_sha256, manifest.documents[0].extraction_sha256)
    write("scripts/data/pesquisas-governadores-fontes.json", '{"policy":"changed"}')
    assert.notEqual(buildPreflightManifest(root, resolve(root, "evidence")).documents[0].policy_version, manifest.documents[0].policy_version)
    write("evidence/literal.txt", "fonte modificada")
    const mismatch = buildPreflightManifest(root, resolve(root, "evidence"))
    assert.ok(mismatch.warnings.some(row => row.id === "literal" && row.reason === "capture_hash_mismatch_or_missing"))
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test("preflight rejeita folha malformada em vez de fabricar identidade", () => {
  const root = mkdtempSync(resolve(tmpdir(), "poll-preflight-invalid-"))
  const write = (path: string, value: string) => { mkdirSync(dirname(resolve(root, path)), { recursive: true }); writeFileSync(resolve(root, path), value) }
  const base = {
    id: "poll-invalid",
    source_status: "condicional",
    office: "Governador",
    geography: { code: "AC" },
    registration: { code: { value: "AC-00001/2026" } },
    cenarios: [],
    provenance: { result_url: "https://example.org/poll-invalid", capture: { format: "text" } },
  }
  const writeCatalog = (poll: unknown) => {
    write("scripts/data/pesquisas-presidencia-2026.json", JSON.stringify({ pesquisas: [] }))
    write("scripts/data/pesquisas-governadores-2026.json", JSON.stringify({ datasets: [{ pesquisas: [poll] }] }))
  }
  try {
    write("src/lib/pesquisas-eleitorais.ts", "parser")
    write("scripts/data/pesquisas-buscas-alternativas.json", "{}")
    write("data/candidate-roster-active-20260905.json", "{}")
    write("scripts/data/pesquisas-eleitorais-fontes.json", "{}")
    write("scripts/data/pesquisas-governadores-fontes.json", "{}")
    writeCatalog({ ...base, id: undefined })
    assert.throws(() => buildPreflightManifest(root, resolve(root, "evidence")), /poll\.id ausente ou inválido/)
    writeCatalog({ ...base, provenance: { ...base.provenance, result_url: "example.org/relative" } })
    assert.throws(() => buildPreflightManifest(root, resolve(root, "evidence")), /result_url deve ser URL absoluta HTTP\(S\)/)
    writeCatalog({ ...base, office: "Presidente", geography: { code: "AC" } })
    assert.throws(() => buildPreflightManifest(root, resolve(root, "evidence")), /deve ser BR para Presidente/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

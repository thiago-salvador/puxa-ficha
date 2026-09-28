import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { applyPatrimonioWritersAuditadas } from "../scripts/audit/apply-patrimonio-writers-local"
import { applyHistoricalFinanceAudited } from "../scripts/audit/apply-financiamento-historico-local"
import { hashPatrimonioPreimage } from "../scripts/audit/plan-patrimonio-writers-local"

test("batch index and run id keep both writers' final receipts without overwrite", async () => {
  for (const kind of ["patrimonio", "financiamento"] as const) {
    const root = mkdtempSync(join(tmpdir(), `pf-${kind}-receipts-`))
    try {
      if (kind === "patrimonio") {
        const plan = { acoes: [] }
        const expectedPlanSha = createHash("sha256").update('{"acoes":[]}').digest("hex")
        await applyPatrimonioWritersAuditadas(plan, { apply: true, expectedPlanSha, evidenceDir: root, batchIndex: 0, runId: "first" })
        await applyPatrimonioWritersAuditadas(plan, { apply: true, expectedPlanSha, evidenceDir: root, batchIndex: 1, runId: "second" })
      } else {
        const plan = { acoes: [], plano_sha256: createHash("sha256").update("[]").digest("hex") }
        await applyHistoricalFinanceAudited(plan, { apply: true, expectedPlanSha: plan.plano_sha256, evidenceDir: root, batchIndex: 0, runId: "first" })
        await applyHistoricalFinanceAudited(plan, { apply: true, expectedPlanSha: plan.plano_sha256, evidenceDir: root, batchIndex: 1, runId: "second" })
      }
      const files = readdirSync(root).filter((name) => name.includes("final"))
      assert.equal(files.length, 2, kind)
      assert.ok(files.some((name) => name.includes("first") && name.includes("batch-0")), kind)
      assert.ok(files.some((name) => name.includes("second") && name.includes("batch-1")), kind)
      assert.deepEqual(files.map((name) => JSON.parse(readFileSync(join(root, name), "utf8")).batch_index).sort(), [0, 1])
    } finally { rmSync(root, { recursive: true, force: true }) }
  }
})

test("patrimony write rejection leaves an interrupted receipt with restore check", async () => {
  const root = mkdtempSync(join(tmpdir(), "pf-patrimonio-write-error-"))
  try {
    const action = { tipo: "substituir_patrimonio" as const, match_mode: "insert" as const,
      slug: "candidate", candidato_id: "00000000-0000-4000-8000-000000000001", ano_eleicao: 2022,
      antes_publico: [], antes_sha256: hashPatrimonioPreimage([]),
      depois: { ano_eleicao: 2022, bens: [], valor_total: 1 }, serie: {},
      fonte_url: "https://cdn.tse.jus.br/bem_candidato_2022.zip", pacote_sha256: "a".repeat(64), pacote_bytes: 1,
      sq_candidato: "123", uf_candidatura: "SP", source_complete: true }
    const plan = { acoes: [action] }
    const stable = (v: unknown): string => Array.isArray(v) ? `[${v.map(stable).join(",")}]` : v && typeof v === "object"
      ? `{${Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => `${JSON.stringify(k)}:${stable(x)}`).join(",")}}` : JSON.stringify(v) ?? "null"
    const expectedPlanSha = createHash("sha256").update(stable(plan)).digest("hex")
    const query = { select() { return this }, eq() { return this }, then(resolve: (value: unknown) => void) { resolve({ data: [], error: null }) } }
    await assert.rejects(() => applyPatrimonioWritersAuditadas(plan, { apply: true, expectedPlanSha, evidenceDir: root,
      client: { from: () => query } as never, auditWrite: (async () => { throw new Error("write rejected") }) as never }), /write rejected/)
    const name = readdirSync(root).find((file) => file.endsWith("-interrupted.json"))!
    const receipt = JSON.parse(readFileSync(join(root, name), "utf8"))
    assert.equal(receipt.status, "interrompido")
    assert.equal(receipt.attempted, 1)
    assert.equal(receipt.restore_attempt, "preimage_intact")
  } finally { rmSync(root, { recursive: true, force: true }) }
})

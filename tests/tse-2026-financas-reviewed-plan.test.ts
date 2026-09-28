import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { lerArgs } from "../scripts/tse-2026-financas"

test("--reviewed-plan branch enforces file SHA, age and one-time consumption", async () => {
  const root = mkdtempSync(join(tmpdir(), "pf-finance-reviewed-"))
  try {
    const path = join(root, "plan.json")
    const planSha = createHash("sha256").update("[]").digest("hex")
    const plan = { generated_at: new Date().toISOString(), plano_sha256: planSha, acoes: [], recibos: [], revisao: [], resumo: {} }
    writeFileSync(path, JSON.stringify(plan))
    const fileSha = createHash("sha256").update(readFileSync(path)).digest("hex")
    const opts = lerArgs(["--apply", `--reviewed-plan=${path}`, `--expected-plan-file-sha=${fileSha}`])
    assert.equal(opts.reviewedPlan, path)
    const writer = await import("../scripts/tse-2026-financas")
    assert.equal(writer.readReviewedPlan(path, fileSha).plano_sha256, planSha)
    assert.throws(() => writer.readReviewedPlan(path, "0".repeat(64)), /SHA-256/)
    writer.consumeReviewedPlan(planSha, join(root, "consumed"))
    assert.throws(() => writer.consumeReviewedPlan(planSha, join(root, "consumed")), /consumido/)
    writeFileSync(path, JSON.stringify({ ...plan, generated_at: new Date(Date.now() - 25 * 3600_000).toISOString() }))
    assert.throws(() => writer.readReviewedPlan(path, createHash("sha256").update(readFileSync(path)).digest("hex")), /24 h|expirado/)
    assert.match(readFileSync(new URL("../scripts/tse-2026-financas.ts", import.meta.url), "utf8"), /opts\.reviewedPlan[^?]*\? await[\s\S]*readReviewedPlan\(/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

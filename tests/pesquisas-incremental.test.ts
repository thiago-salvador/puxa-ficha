import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import {
  acknowledgeIncremental,
  type IncrementalManifest,
  type IncrementalReceipt,
  type IncrementalState,
  scanIncremental,
} from "../scripts/pesquisas-atualizacao-agendada/incremental"

function state(): IncrementalState {
  return { schema_version: "pesquisas-incremental-v1", documents: {}, receipts: [] }
}

function manifest(evidencePath: string, overrides: Partial<IncrementalManifest["documents"][number]> = {}): IncrementalManifest {
  return {
    documents: [{
      id: "poll-1",
      registry: "BR-00001/2026",
      office: "Presidente",
      geography: "BR",
      source_url: "https://source.example/poll-1",
      evidence_path: evidencePath,
      evidence_kind: "literal",
      parser_version: "parser-1",
      policy_version: "policy-1",
      extraction_sha256: "e".repeat(64),
      context_sha256: "c".repeat(64),
      ...overrides,
    }],
  }
}

function completeAll(currentManifest: IncrementalManifest, currentState: IncrementalState, manifestPath: string): IncrementalState {
  let next = currentState
  const first = scanIncremental(currentManifest, next, manifestPath).digest.queue[0]
  assert.ok(first)
  const contentSha256 = first.content_sha256
  for (const receipt of [
    { stage: "capture", status: "completed", content_sha256: contentSha256, judge_identity: "collector:test" },
    { stage: "extract", status: "completed", content_sha256: contentSha256, judge_identity: "parser:test" },
    {
      stage: "review", status: "completed", content_sha256: contentSha256,
      judge_identity: "judge:test", extraction_sha256: "e".repeat(64), context_sha256: "c".repeat(64),
    },
  ] as const) {
    const result = acknowledgeIncremental(currentManifest, next, {
      identity: first.identity,
      fingerprint: first.fingerprint,
      ...receipt,
    } as IncrementalReceipt, first.fingerprint, manifestPath)
    next = result.state
  }
  return next
}

test("repetição só vira no-op depois de recibos de todas as etapas", () => {
  const dir = mkdtempSync(join(tmpdir(), "pesquisas-incremental-"))
  const evidence = join(dir, "poll.txt")
  writeFileSync(evidence, "literal poll evidence")
  const currentManifest = manifest(evidence)
  const first = scanIncremental(currentManifest, state(), dir)
  assert.equal(first.digest.summary.queued, 1)
  assert.deepEqual(first.digest.queue[0].pending_stages, ["capture", "extract", "review"])
  assert.doesNotMatch(JSON.stringify(first.digest), /literal poll evidence/)

  const complete = completeAll(currentManifest, first.state, dir)
  const second = scanIncremental(currentManifest, complete, dir)
  assert.equal(second.digest.summary.queued, 0)
  assert.equal(second.digest.summary.unchanged, 1)
})

test("mudança no arquivo ou na versão reabre todas as etapas", () => {
  const dir = mkdtempSync(join(tmpdir(), "pesquisas-incremental-"))
  const evidence = join(dir, "poll.txt")
  writeFileSync(evidence, "literal poll evidence")
  const currentManifest = manifest(evidence)
  const first = scanIncremental(currentManifest, state(), dir)
  const complete = completeAll(currentManifest, first.state, dir)

  writeFileSync(evidence, "literal poll evidence changed")
  const changedFile = scanIncremental(currentManifest, complete, dir)
  assert.equal(changedFile.digest.queue[0]?.reason, "changed")
  assert.deepEqual(changedFile.digest.queue[0]?.pending_stages, ["capture", "extract", "review"])

  writeFileSync(evidence, "literal poll evidence")
  const changedVersion = scanIncremental(manifest(evidence, { policy_version: "policy-2" }), complete, dir)
  assert.equal(changedVersion.digest.queue[0]?.reason, "changed")
})

test("recibo com fingerprint antigo é rejeitado", () => {
  const dir = mkdtempSync(join(tmpdir(), "pesquisas-incremental-"))
  const evidence = join(dir, "poll.txt")
  writeFileSync(evidence, "before")
  const currentManifest = manifest(evidence)
  const first = scanIncremental(currentManifest, state(), dir)
  const staleFingerprint = first.digest.queue[0]!.fingerprint
  writeFileSync(evidence, "after")
  assert.throws(() => acknowledgeIncremental(currentManifest, first.state, {
    identity: first.digest.queue[0]!.identity, fingerprint: staleFingerprint, stage: "capture", status: "completed",
  }, staleFingerprint, dir), /stale receipt/)
})

test("reabrir etapa upstream invalida recibos downstream antigos", () => {
  const dir = mkdtempSync(join(tmpdir(), "pesquisas-incremental-"))
  const evidence = join(dir, "poll.txt")
  writeFileSync(evidence, "literal")
  const currentManifest = manifest(evidence)
  const first = scanIncremental(currentManifest, state(), dir)
  const complete = completeAll(currentManifest, first.state, dir)
  const item = first.digest.queue[0]!
  const reopened = acknowledgeIncremental(currentManifest, complete, {
    identity: item.identity, fingerprint: item.fingerprint, stage: "capture", status: "unresolved",
  }, item.fingerprint, dir)
  const repaired = acknowledgeIncremental(currentManifest, reopened.state, {
    identity: item.identity, fingerprint: item.fingerprint, stage: "capture", status: "completed",
    content_sha256: item.content_sha256, judge_identity: "collector:repair",
  }, item.fingerprint, dir)
  assert.deepEqual(repaired.result.pending_stages, ["extract", "review"])
})

test("versão explícita divergente no recibo é stale", () => {
  const dir = mkdtempSync(join(tmpdir(), "pesquisas-incremental-"))
  const evidence = join(dir, "poll.txt")
  writeFileSync(evidence, "literal")
  const currentManifest = manifest(evidence)
  const first = scanIncremental(currentManifest, state(), dir)
  const item = first.digest.queue[0]!
  assert.throws(() => acknowledgeIncremental(currentManifest, first.state, {
    identity: item.identity, fingerprint: item.fingerprint, stage: "capture", status: "completed",
    content_sha256: item.content_sha256, judge_identity: "collector:test", parser_version: "parser-old",
  }, item.fingerprint, dir), /versão divergente/)
})

test("registros iguais em URLs diferentes permanecem distintos", () => {
  const dir = mkdtempSync(join(tmpdir(), "pesquisas-incremental-"))
  const firstPath = join(dir, "first.txt")
  const secondPath = join(dir, "second.txt")
  writeFileSync(firstPath, "same registry, source one")
  writeFileSync(secondPath, "same registry, source two")
  const base = manifest(firstPath).documents[0]
  const currentManifest: IncrementalManifest = { documents: [
    base,
    { ...base, id: "poll-2", source_url: "https://other.example/poll-2", evidence_path: secondPath },
  ] }
  const result = scanIncremental(currentManifest, state(), dir)
  assert.equal(result.digest.summary.queued, 2)
  assert.equal(new Set(result.digest.queue.map((item) => item.identity)).size, 2)
  assert.deepEqual(result.digest.queue.map((item) => item.registry), ["BR-00001/2026", "BR-00001/2026"])
})

test("summary permanece explicitamente summary e não pode concluir review", () => {
  const dir = mkdtempSync(join(tmpdir(), "pesquisas-incremental-"))
  const evidence = join(dir, "summary.txt")
  writeFileSync(evidence, "summary only")
  const currentManifest = manifest(evidence, { evidence_kind: "summary" })
  const first = scanIncremental(currentManifest, state(), dir)
  const item = first.digest.queue[0]!
  assert.equal(item.evidence_kind, "summary")
  assert.throws(() => acknowledgeIncremental(currentManifest, first.state, {
    identity: item.identity, fingerprint: item.fingerprint, stage: "review", status: "completed",
    content_sha256: item.content_sha256, judge_identity: "judge:test", extraction_sha256: "e".repeat(64), context_sha256: "c".repeat(64),
  }, item.fingerprint, dir), /literal/)
})

test("arquivo ausente produz falha observável e nunca no-op", () => {
  const dir = mkdtempSync(join(tmpdir(), "pesquisas-incremental-"))
  const missing = join(dir, "missing.txt")
  const currentManifest = manifest(missing)
  const result = scanIncremental(currentManifest, state(), dir)
  assert.equal(result.digest.summary.failed, 1)
  assert.equal(result.digest.queue[0]?.reason, "failed")
  assert.equal(result.digest.failures[0]?.error, "evidence_missing")
  assert.deepEqual(result.digest.queue[0]?.pending_stages, ["capture", "extract", "review"])
})

test("fingerprint muda quando payload extraído muda", () => {
  const dir = mkdtempSync(join(tmpdir(), "pesquisas-incremental-"))
  const evidence = join(dir, "poll.txt")
  writeFileSync(evidence, "literal")
  const currentManifest = manifest(evidence)
  const first = scanIncremental(currentManifest, state(), dir)
  const updated = scanIncremental(manifest(evidence, { extraction_sha256: createHash("sha256").update("new extraction").digest("hex") }), first.state, dir)
  assert.equal(updated.digest.queue[0]?.reason, "changed")
  assert.notEqual(updated.digest.queue[0]?.fingerprint, first.digest.queue[0]?.fingerprint)
})

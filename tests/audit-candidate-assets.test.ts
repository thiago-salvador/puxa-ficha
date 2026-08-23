import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"
import test from "node:test"

import {
  classifyAsset,
  type ReferenceEvidence,
} from "../scripts/audit-candidate-assets"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const auditScript = join(repoRoot, "scripts/audit-candidate-assets.ts")
const tsxImport = createRequire(import.meta.url).resolve("tsx")
const candidatePath = "public/candidates/example.jpg"
const runtimeManifestPath = "data/candidate-runtime-asset-references.json"

const literal: ReferenceEvidence = {
  file: "supabase/migrations/example.sql",
  line: 4,
  excerpt: "'/candidates/example.jpg'",
  kind: "literal",
}

function git(root: string, args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim()
}

function fixture(
  source = "export const ok = true\n",
  baselineRuntimeReferences?: string[],
) {
  const root = mkdtempSync(join(tmpdir(), "pf21-audit-"))
  git(root, ["init", "-q"])
  git(root, ["config", "user.name", "Thiago Salvador"])
  git(root, ["config", "user.email", "contato.thiagosalvador@gmail.com"])
  mkdirSync(join(root, "public/candidates"), { recursive: true })
  writeFileSync(join(root, candidatePath), "asset")
  writeFileSync(join(root, "source.ts"), source)
  if (baselineRuntimeReferences) {
    mkdirSync(join(root, "data"), { recursive: true })
    writeFileSync(join(root, runtimeManifestPath), `${JSON.stringify({
      schemaVersion: 1,
      references: baselineRuntimeReferences,
    }, null, 2)}\n`)
  }
  git(root, ["add", "."])
  git(root, ["commit", "-qm", "base"])
  return { root, baseline: git(root, ["rev-parse", "HEAD"]) }
}

function runtimeManifest(root: string, references: string[] = [candidatePath], schemaVersion = 1) {
  mkdirSync(join(root, "data"), { recursive: true })
  writeFileSync(join(root, runtimeManifestPath), `${JSON.stringify({ schemaVersion, references }, null, 2)}\n`)
  git(root, ["add", runtimeManifestPath])
  return runtimeManifestPath
}

function runAudit(root: string, args: string[]) {
  return spawnSync(process.execPath, ["--import", tsxImport, auditScript, ...args], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  })
}

function removeFixture(root: string) {
  rmSync(root, { recursive: true, force: true })
}

test("referência literal prevalece", () => {
  assert.deepEqual(
    classifyAsset({ file: "example.jpg", literalReferences: [literal], runtimeReferences: new Set() }),
    { status: "referenced", runtimeReferences: [] },
  )
})

test("manifesto runtime é autoridade sem depender da sintaxe geradora", () => {
  const result = classifyAsset({
    file: "example.jpg",
    literalReferences: [],
    runtimeReferences: new Set([candidatePath]),
    runtimeSource: "runtime.json",
  })
  assert.equal(result.status, "referenced")
  assert.equal(result.runtimeReferences[0]?.kind, "runtime")
})

test("asset ausente do manifesto explícito fica unreferenced", () => {
  assert.deepEqual(
    classifyAsset({ file: "dead.jpg", literalReferences: [], runtimeReferences: new Set() }),
    { status: "unreferenced", runtimeReferences: [] },
  )
})

test("sem fonte runtime o resultado é indeterminate", () => {
  assert.deepEqual(
    classifyAsset({ file: "unknown.jpg", literalReferences: [] }),
    { status: "indeterminate", runtimeReferences: [] },
  )
})

test("verify-removals falha fechado sem fonte runtime", () => {
  const { root, baseline } = fixture()
  try {
    git(root, ["rm", "-q", candidatePath])
    const result = runAudit(root, ["--verify-removals", "--baseline", baseline])
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /--runtime-references/)
  } finally {
    removeFixture(root)
  }
})

test("baseline mutável ou abreviado é rejeitado", () => {
  const { root } = fixture()
  try {
    const manifest = runtimeManifest(root)
    const result = runAudit(root, [
      "--verify-removals",
      "--baseline", "HEAD",
      "--runtime-references", manifest,
    ])
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /SHA completo de 40 caracteres/)
  } finally {
    removeFixture(root)
  }
})

test("índice Git diferencia rename somente de caixa", () => {
  const { root, baseline } = fixture()
  try {
    const manifest = runtimeManifest(root)
    git(root, ["mv", candidatePath, "public/candidates/case-hop.jpg"])
    git(root, ["mv", "public/candidates/case-hop.jpg", "public/candidates/Example.jpg"])
    const result = runAudit(root, [
      "--verify-removals",
      "--baseline", baseline,
      "--runtime-references", manifest,
    ])
    assert.equal(result.status, 1)
    const inventory = JSON.parse(result.stdout) as { assets: CandidateAssetAuditForTest[] }
    const original = inventory.assets.find((asset) => asset.path === candidatePath)
    assert.deepEqual({ present: original?.present, status: original?.status }, {
      present: false,
      status: "referenced",
    })
  } finally {
    removeFixture(root)
  }
})

interface CandidateAssetAuditForTest {
  path: string
  present: boolean
  status: string
}

test("concatenação em código não enfraquece a referência runtime", () => {
  const { root, baseline } = fixture('const foto = "/candidates/" + slug + ".jpg"\n')
  try {
    const manifest = runtimeManifest(root)
    git(root, ["rm", "-q", candidatePath])
    const result = runAudit(root, [
      "--verify-removals",
      "--baseline", baseline,
      "--runtime-references", manifest,
    ])
    assert.equal(result.status, 1)
    assert.match(result.stderr, /PF21_UNSAFE_REMOVAL example\.jpg referenced/)
  } finally {
    removeFixture(root)
  }
})

test("remoção simultânea da foto e da referência runtime do baseline falha fechado", () => {
  const { root, baseline } = fixture(
    'const foto = "/candidates/" + slug + ".jpg"\n',
    [candidatePath],
  )
  try {
    const manifest = runtimeManifest(root, [])
    git(root, ["rm", "-q", candidatePath])
    const result = runAudit(root, [
      "--verify-removals",
      "--baseline", baseline,
      "--runtime-references", manifest,
    ])
    assert.equal(result.status, 1)
    assert.match(
      result.stderr,
      /PF21_RUNTIME_REFERENCE_REMOVAL_REQUIRES_INDEPENDENT_PROOF public\/candidates\/example\.jpg/,
    )
    const inventory = JSON.parse(result.stdout) as {
      runtimeReferences: { baseline: { removedReferences: string[] } }
      assets: Array<CandidateAssetAuditForTest & { runtimeReferences: ReferenceEvidence[] }>
    }
    assert.deepEqual(inventory.runtimeReferences.baseline.removedReferences, [candidatePath])
    const removed = inventory.assets.find((asset) => asset.path === candidatePath)
    assert.equal(removed?.status, "referenced")
    assert.match(removed?.runtimeReferences[0]?.file ?? "", new RegExp(`^${baseline}:`))
  } finally {
    removeFixture(root)
  }
})

test("bootstrap sem manifesto no baseline exige path canônico rastreado", () => {
  const { root, baseline } = fixture()
  try {
    const manifest = runtimeManifest(root)
    const accepted = runAudit(root, [
      "--verify-removals",
      "--baseline", baseline,
      "--runtime-references", manifest,
    ])
    assert.equal(accepted.status, 0)
    const inventory = JSON.parse(accepted.stdout) as {
      runtimeReferences: { baseline: { bootstrap: boolean } }
    }
    assert.equal(inventory.runtimeReferences.baseline.bootstrap, true)

    writeFileSync(join(root, "runtime.json"), JSON.stringify({
      schemaVersion: 1,
      references: [candidatePath],
    }))
    git(root, ["add", "runtime.json"])
    const rejected = runAudit(root, [
      "--verify-removals",
      "--baseline", baseline,
      "--runtime-references", "runtime.json",
    ])
    assert.notEqual(rejected.status, 0)
    assert.match(rejected.stderr, /manifesto runtime canonico/)
  } finally {
    removeFixture(root)
  }
})

test("formato runtime desconhecido falha fechado", () => {
  const { root, baseline } = fixture()
  try {
    const manifest = runtimeManifest(root, [candidatePath], 2)
    const result = runAudit(root, [
      "--verify-removals",
      "--baseline", baseline,
      "--runtime-references", manifest,
    ])
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /formato runtime desconhecido/)
  } finally {
    removeFixture(root)
  }
})

test("campo runtime desconhecido falha fechado", () => {
  const { root, baseline } = fixture()
  try {
    mkdirSync(join(root, "data"), { recursive: true })
    writeFileSync(join(root, runtimeManifestPath), JSON.stringify({
      schemaVersion: 1,
      references: [candidatePath],
      detector: "template-literal",
    }))
    git(root, ["add", runtimeManifestPath])
    const result = runAudit(root, [
      "--verify-removals",
      "--baseline", baseline,
      "--runtime-references", runtimeManifestPath,
    ])
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /formato runtime desconhecido/)
  } finally {
    removeFixture(root)
  }
})

test("walker rejeita symlink rastreado antes da leitura", () => {
  const { root, baseline } = fixture()
  try {
    const manifest = runtimeManifest(root, [])
    writeFileSync(join(root, "outside.txt"), "outside")
    symlinkSync(join(root, "outside.txt"), join(root, "linked-source.ts"))
    git(root, ["add", "outside.txt", "linked-source.ts"])
    const result = runAudit(root, ["--baseline", baseline, "--runtime-references", manifest])
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /symlink rejeitado/)
  } finally {
    removeFixture(root)
  }
})

test("fonte runtime com traversal é rejeitada", () => {
  const { root, baseline } = fixture()
  const outside = join(dirname(root), `runtime-${baseline}.json`)
  try {
    writeFileSync(outside, '{"schemaVersion":1,"references":[]}\n')
    const result = runAudit(root, [
      "--baseline", baseline,
      "--runtime-references", `../${outside.split("/").at(-1)}`,
    ])
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /path de repositorio invalido/)
  } finally {
    rmSync(outside, { force: true })
    removeFixture(root)
  }
})

test("walker limita arquivo rastreado excessivo", () => {
  const { root, baseline } = fixture()
  try {
    const manifest = runtimeManifest(root, [])
    writeFileSync(join(root, "oversized.txt"), Buffer.alloc(8 * 1024 * 1024 + 1, 97))
    git(root, ["add", "oversized.txt"])
    const result = runAudit(root, ["--baseline", baseline, "--runtime-references", manifest])
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /excede limite/)
  } finally {
    removeFixture(root)
  }
})

test("CLI preserva stdout como JSON e aceita baseline completo", () => {
  const { root, baseline } = fixture()
  try {
    const manifest = runtimeManifest(root, [candidatePath])
    const result = runAudit(root, [
      "--verify-removals",
      "--baseline", baseline,
      "--runtime-references", manifest,
    ])
    assert.equal(result.status, 0)
    assert.doesNotThrow(() => JSON.parse(result.stdout))
    assert.match(result.stderr, /PF21_REMOVALS_SAFE removed=0/)
  } finally {
    removeFixture(root)
  }
})

test("package e CI expõem gate offline com SHA explícito", () => {
  const packageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
    scripts: Record<string, string>
  }
  const command = packageJson.scripts["audit:candidate-assets:gate"]
  assert.match(command, /PF_CANDIDATE_ASSET_BASELINE_SHA/)
  assert.match(command, /--runtime-references data\/candidate-runtime-asset-references\.json/)
  assert.doesNotMatch(command, /origin\/main/)
  const workflow = readFileSync(join(repoRoot, ".github/workflows/ci.yml"), "utf8")
  assert.match(
    workflow,
    /actions\/checkout@[^\n]+\n\s+with:\n\s+persist-credentials: false\n(?:\s+#.*\n){2}\s+fetch-depth: 0/,
  )
  assert.match(workflow, /PF_CANDIDATE_ASSET_BASELINE_SHA:/)
  assert.match(workflow, /github\.event\.pull_request\.base\.sha/)
  assert.match(workflow, /npm run audit:candidate-assets:gate/)
  assert.doesNotMatch(workflow, /--baseline\s+(?:origin\/main|main)\b/)
})

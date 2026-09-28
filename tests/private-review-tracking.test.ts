import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import test from "node:test"

test("tracked files contain no private review material", () => {
  const paths = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean)
  const forbiddenPath = /^(?:codex|plans|outputs|projections|revisoes)\//i
  const allowedPreexistingPathNames = new Set<string>([])
  assert.deepEqual(paths.filter((path) => forbiddenPath.test(path) && !allowedPreexistingPathNames.has(path)), [])
  const privatePath = new RegExp([["/", "Users", "/"].join(""), ["evidencias", "-privadas"].join("")].join("|"))
  const birthReview = new RegExp(["data_nascimento", ".*", "19[0-9]{2}"].join(""), "i")
  // Historical evidence carries local paths. Pin the exact pre-existing marker lines;
  // any added or changed marker in any tracked file fails this gate.
  const legacyMarkerHashes: Record<string, string> = {
    "GATES.md": "2d3393ed2ea555066b33420ac16011f8b5f5a8ca7104c1a0684956cb889db214",
    "QA/2026-08-10-base-lancamento.md": "558744f1a399c1d1d9ff5793cf2397b10986da8aca6e2516e45d85bc2a7d8034",
    "QA/evidencias/2026-08-09-trilha-b/manifesto-patrimonio-20260807-nao-publicados.json": "8ac67a2dac856f31b64c0c526762f49a4d3e0cc0889ca7a3abd2d2df80f9a980",
    "QA/evidencias/2026-08-30-strict-all-review-funnel/coverage-snapshot-readonly.json": "bf9cd6bce9d0258ac1ccfac12f9b983af057fcb998fee347b84317db894b7993",
    "QA/evidencias/2026-08-30-strict-all-review-funnel/p0.html": "1a7b82045b7142a70e774eb9c21c693ae9a80776c4d391c9178654ee6eb7c874",
    "QA/evidencias/2026-08-30-strict-all-review-funnel/p2.html": "f5c90805e8a4373658559a57ef4dcc595b6435f6a2ec336718b140ea7e6b8737",
    "QA/evidencias/2026-08-30-strict-all-review-funnel/profiles-current.json": "36b17d7d2274e39295f0185c398cd6b96f6f68cf08623cf6d9e492cc4c8686d3",
    "QA/evidencias/2026-08-30-strict-all-review-funnel/queue.json": "5e8f1d733196a7b83ae4ed49f552040e95729441063af77a956cda70c6c4c112",
    "QA/evidencias/2026-09-17-pesquisas/remaining19-resume.json": "288f110bde908404250cd6f2ea14b5658b4a9e4a128030d583fb9fa93c5613db",
    "Settings/EXPECTED_BEHAVIOR.md": "202e55716c118a9ea3658ed826121483cbd6b962946dadcc287ecb56f32a038d",
    "Settings/STATUS.md": "73807281a78df9a8d47abaa205200629371c3c0fa5bc3707dc5427124a1a63df",
    "docs/operations/data-freshness-workflow/GATES.md": "e750160efc5bf66bacb4418f09d8128dffc38aefd6b87a8b2a6969c0f95ffc86",
    "docs/operations/pesquisas-s0/GATES.md": "d0c0e67c7b869a50b34da1fc412698df43ab6a278062ae17f1ee74ec8dddec5c",
    "docs/plans/2026-08-25-programa-governo-presidencia-implementation.md": "cce61ec8f52e0e2733c9956021c1cbd2613d566129665d725bbc27dbf831733e",
    "docs/threads-lacunas-2026-08-04.md": "f9ce057d8a1d8865024a47a29ef4f2c0aa6d598eca870b31b6b98cd457d0007e",
    "gates/node-1.1.md": "4bda8ce5e7eb9172c6b3e4bdf0f7969c138576a5cf5e80a367af012c6a9cd84a",
    "gates/node-1.3.md": "b9883ecdbfcee23fcf217053a16cda4b3a9a85326ce0ef889712aa90af4fb80b",
    "scripts/curate-contradictions-evidence.mjs": "8407ca3c089d6b7151d3b0476a7f766c56c42d7b5c4a2119ed2cc7eef5f4e773",
    "scripts/data/checagens-atribuidas.json": "d9c4a0fbede273e838ff1ec4346bea76984fd0ffb97eedd55591ddad1619b61b",
    "src/lib/gastos-parlamentares-em-revisao.ts": "141371d3462558ea6b31e281475ef3092ad74757214759a4b16c19d6061ea2a0",
    "tests/programa-governo-runners.test.ts": "ecaa29a27ffb9f782dfcc91cfb2148adf68712a6965a0f66a2f92492e55a28a7",
  }
  const leaked = paths.filter((path) => {
    const content = readFileSync(path, "utf8")
    if (path.endsWith(".json") && /revis|review/i.test(path) && birthReview.test(content)) return true
    const lines = content.split("\n").filter((line) => privatePath.test(line))
    if (!lines.length) return false
    const digest = createHash("sha256").update(`${lines.join("\n")}\n`).digest("hex")
    return legacyMarkerHashes[path] !== digest
  })
  assert.deepEqual(leaked, [])
})

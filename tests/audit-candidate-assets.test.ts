import assert from "node:assert/strict"
import test from "node:test"

import {
  classifyAsset,
  type ReferenceEvidence,
} from "../scripts/audit-candidate-assets"

const literal: ReferenceEvidence = {
  file: "supabase/migrations/example.sql",
  line: 4,
  excerpt: "'/candidates/example.jpg'",
  kind: "literal",
}
const generator: ReferenceEvidence = {
  file: "scripts/ingest-fotos-oficiais.ts",
  line: 325,
  excerpt: "path: `/candidates/${slug}.jpg`",
  kind: "dynamic-generator",
}
const input: ReferenceEvidence = {
  file: "data/fotos-oficiais-2026.json",
  line: 7,
  excerpt: '"slug": "example"',
  kind: "dynamic-input",
}

function dynamic(slugs: string[]) {
  return {
    generatedJpgSlugs: new Set(slugs),
    generatorEvidence: [generator],
    inputEvidenceBySlug: new Map([["example", [input]]]),
  }
}

test("referência literal prevalece e classifica o asset como referenced", () => {
  assert.deepEqual(
    classifyAsset({ file: "example.jpg", literalReferences: [literal], dynamicContext: dynamic(["example"]) }),
    { status: "referenced", dynamicReferences: [] },
  )
})

test("jpg sem referência literal mas coberto por gerador e input fica ambiguous", () => {
  const result = classifyAsset({
    file: "example.jpg",
    literalReferences: [],
    dynamicContext: dynamic(["example"]),
  })
  assert.equal(result.status, "ambiguous")
  assert.deepEqual(result.dynamicReferences, [generator, input])
})

test("slug fora do manifesto dinâmico fica unreferenced", () => {
  assert.deepEqual(
    classifyAsset({ file: "dead.jpg", literalReferences: [], dynamicContext: dynamic(["example"]) }),
    { status: "unreferenced", dynamicReferences: [] },
  )
})

test("extensão que o gerador não produz não ganha ambiguidade por slug", () => {
  assert.deepEqual(
    classifyAsset({ file: "example.webp", literalReferences: [], dynamicContext: dynamic(["example"]) }),
    { status: "unreferenced", dynamicReferences: [] },
  )
})

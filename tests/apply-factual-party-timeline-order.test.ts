/**
 * Invariante §15.6 — guard de rechainer após writes curados na timeline.
 */

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, it } from "node:test"
import { shouldSkipPartyTimelineRechainAfterCuratedTimelineWrites } from "../scripts/lib/apply-factual-party-timeline-order"

describe("apply-factual-party-timeline-order — shouldSkipPartyTimelineRechainAfterCuratedTimelineWrites", () => {
  it("retorna false quando não há ensureTimelineRows nem ensureCurrentPartyTimeline", () => {
    assert.equal(
      shouldSkipPartyTimelineRechainAfterCuratedTimelineWrites({}),
      false,
    )
    assert.equal(
      shouldSkipPartyTimelineRechainAfterCuratedTimelineWrites({
        ensureTimelineRows: [],
      }),
      false,
    )
  })

  it("retorna true quando ensureTimelineRows tem pelo menos uma linha", () => {
    assert.equal(
      shouldSkipPartyTimelineRechainAfterCuratedTimelineWrites({
        ensureTimelineRows: [{}],
      }),
      true,
    )
  })

  it("retorna true quando ensureCurrentPartyTimeline é true", () => {
    assert.equal(
      shouldSkipPartyTimelineRechainAfterCuratedTimelineWrites({
        ensureCurrentPartyTimeline: true,
      }),
      true,
    )
  })

  it("ensureCurrentPartyTimeline false não força skip sozinho", () => {
    assert.equal(
      shouldSkipPartyTimelineRechainAfterCuratedTimelineWrites({
        ensureCurrentPartyTimeline: false,
      }),
      false,
    )
  })
})

describe("apply-current-factual-fixes — invariante estrutural §15.6", () => {
  // O guard só protege a timeline curada se o apply-chain delegar o rechainer
  // ao helper. Se alguém importar fixCandidatePartyTimelineConsistency direto
  // em scripts/apply-current-factual-fixes.ts, o invariante §15.6 é violado
  // sem que o predicate test ou o CI integration pegue.
  // fileURLToPath, e nao .pathname: pathname devolve a URL percent-encoded, e
  // qualquer espaco no caminho do repositorio vira %20 e quebra o readFileSync.
  const APPLY_PATH = path.resolve(
    fileURLToPath(new URL("..", import.meta.url)),
    "scripts/apply-current-factual-fixes.ts",
  )
  const APPLY_SOURCE = readFileSync(APPLY_PATH, "utf8")

  it("delega rechainer via runAfterCuratedPartyTimelineWrites", () => {
    assert.match(
      APPLY_SOURCE,
      /runAfterCuratedPartyTimelineWrites/,
      "apply-current-factual-fixes deve importar e usar runAfterCuratedPartyTimelineWrites (§15.6 guard).",
    )
  })

  it("não importa fix-party-timeline-consistency diretamente (rechainer só corre via guard)", () => {
    assert.doesNotMatch(
      APPLY_SOURCE,
      /from\s+["']\.\/fix-party-timeline-consistency["']/m,
      "apply-current-factual-fixes NÃO deve importar fix-party-timeline-consistency diretamente; o rechainer só corre via runAfterCuratedPartyTimelineWrites (§15.6).",
    )
    assert.doesNotMatch(
      APPLY_SOURCE,
      /\bfixCandidatePartyTimelineConsistency\s*\(/,
      "apply-current-factual-fixes NÃO deve chamar fixCandidatePartyTimelineConsistency direto; usar runAfterCuratedPartyTimelineWrites (§15.6).",
    )
  })
})

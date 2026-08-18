import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"
import {
  ANALYTICS_EVENTS,
  SENSITIVE_ANALYTICS_PROP_KEY_RE,
} from "../src/lib/analytics-events"

function readSource(file: string): string {
  return readFileSync(file, "utf-8")
}

function launchTrackCallBlocks(source: string): string[] {
  const lines = source.split("\n")
  const blocks: string[] = []

  lines.forEach((line, index) => {
    if (!line.includes("trackLaunchEvent(ANALYTICS_EVENTS.")) return
    blocks.push(lines.slice(index, index + 8).join("\n"))
  })

  return blocks
}

describe("analytics D1 instrumentation", () => {
  it("declara os cinco eventos mínimos de lançamento", () => {
    assert.deepEqual(Object.values(ANALYTICS_EVENTS), [
      "Candidate Click",
      "Comparison Start",
      "Quiz Complete",
      "External Source Click",
      "Search Zero Results",
    ])
  })

  it("instrumenta candidato, comparação, quiz, fonte externa e busca sem resultado", () => {
    const checks = [
      ["src/components/CandidatoGrid.tsx", "ANALYTICS_EVENTS.candidateClick"],
      ["src/components/GlobalSearchProvider.tsx", "ANALYTICS_EVENTS.candidateClick"],
      ["src/components/ComparadorPanel.tsx", "ANALYTICS_EVENTS.comparisonStart"],
      ["src/components/quiz/QuizContainer.tsx", "ANALYTICS_EVENTS.quizComplete"],
      ["src/components/TrackedExternalSourceLink.tsx", "ANALYTICS_EVENTS.externalSourceClick"],
      ["src/components/GlobalSearchProvider.tsx", "ANALYTICS_EVENTS.searchZeroResults"],
    ] as const

    for (const [file, marker] of checks) {
      assert.ok(readSource(file).includes(marker), `${file} must include ${marker}`)
    }
  })

  it("não envia identificadores brutos nos payloads de analytics", () => {
    const files = [
      "src/components/CandidatoGrid.tsx",
      "src/components/ComparadorPanel.tsx",
      "src/components/GlobalSearchProvider.tsx",
      "src/components/TrackedExternalSourceLink.tsx",
      "src/components/quiz/QuizContainer.tsx",
    ]

    for (const file of files) {
      for (const call of launchTrackCallBlocks(readSource(file))) {
        const propertyKeys = Array.from(call.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*:/g)).map(
          (match) => match[1]
        )
        for (const key of propertyKeys) {
          assert.equal(
            SENSITIVE_ANALYTICS_PROP_KEY_RE.test(key),
            false,
            `${file} analytics payload uses sensitive key ${key}`
          )
        }
      }
    }
  })
})

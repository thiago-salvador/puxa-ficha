import assert from "node:assert/strict"
import test from "node:test"

import {
  parseRetencaoArgs,
  runRetencaoOperacional,
} from "../scripts/retencao-operacional"

test("retenção operacional é dry-run por padrão e não apaga", async () => {
  let apagou = false
  const result = await runRetencaoOperacional({
    apply: false,
    now: new Date("2026-08-15T12:00:00.000Z"),
    contarShortLinksExpirados: async () => 7,
    apagarShortLinksExpirados: async () => {
      apagou = true
      return 7
    },
  })

  assert.equal(apagou, false)
  assert.deepEqual(result, {
    mode: "dry-run",
    cutoff: "2026-08-15T12:00:00.000Z",
    tables: [
      {
        table: "quiz_result_short_links",
        policy: "expires_at < now",
        eligible: 7,
        deleted: 0,
      },
    ],
  })
})

test("--apply apaga apenas o conjunto contado e reporta o volume confirmado", async () => {
  const cutoffs: string[] = []
  const result = await runRetencaoOperacional({
    apply: true,
    now: new Date("2026-08-15T12:00:00.000Z"),
    contarShortLinksExpirados: async (cutoff) => {
      cutoffs.push(cutoff)
      return 3
    },
    apagarShortLinksExpirados: async (cutoff) => {
      cutoffs.push(cutoff)
      return 3
    },
  })

  assert.deepEqual(cutoffs, ["2026-08-15T12:00:00.000Z", "2026-08-15T12:00:00.000Z"])
  assert.equal(result.mode, "apply")
  assert.equal(result.tables[0]?.eligible, 3)
  assert.equal(result.tables[0]?.deleted, 3)
})

test("parser exige --apply explícito e rejeita flags ambíguas", () => {
  assert.deepEqual(parseRetencaoArgs([]), { apply: false })
  assert.deepEqual(parseRetencaoArgs(["--dry-run"]), { apply: false })
  assert.deepEqual(parseRetencaoArgs(["--apply"]), { apply: true })
  assert.throws(() => parseRetencaoArgs(["--apply", "--dry-run"]), /nunca os dois/)
  assert.throws(() => parseRetencaoArgs(["--force"]), /desconhecido/)
})

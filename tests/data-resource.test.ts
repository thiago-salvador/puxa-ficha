import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import {
  degradedResource,
  liveResource,
  mergeSourceMessages,
  mergeSourceStatuses,
} from "../src/lib/data-resource"

describe("data-resource helpers", () => {
  it("builds live and degraded resources without changing the public shape", () => {
    assert.deepStrictEqual(liveResource(["ok"], "fonte atualizada"), {
      data: ["ok"],
      sourceStatus: "live",
      sourceMessage: "fonte atualizada",
    })

    assert.deepStrictEqual(degradedResource([], "fonte indisponível"), {
      data: [],
      sourceStatus: "degraded",
      sourceMessage: "fonte indisponível",
    })
  })

  it("keeps the fallback degraded message used by public surfaces", () => {
    assert.deepStrictEqual(degradedResource(null), {
      data: null,
      sourceStatus: "degraded",
      sourceMessage:
        "Algumas fontes públicas não responderam. O conteúdo abaixo pode estar incompleto.",
    })
  })

  it("merges source status and message deterministically", () => {
    assert.equal(mergeSourceStatuses("live", undefined, "live"), "live")
    assert.equal(mergeSourceStatuses("live", "degraded"), "degraded")

    assert.equal(mergeSourceMessages(null, undefined, "primeira", "segunda"), "primeira")
    assert.equal(mergeSourceMessages(null, undefined), null)
  })

  it("preserves the existing api.ts re-export contract without importing server-only code", () => {
    const apiSource = readFileSync("src/lib/api.ts", "utf8")

    assert.match(
      apiSource,
      /export \{ mergeSourceMessages, mergeSourceStatuses \} from "@\/lib\/data-resource"/
    )
  })
})

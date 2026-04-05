import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { logAlertsApiExit, logAlertsEvent } from "../src/lib/alerts-log"

describe("alerts-log", () => {
  it("logAlertsEvent emits a single JSON line with required fields", () => {
    const lines: string[] = []
    const orig = console.info
    console.info = (msg: unknown) => {
      lines.push(String(msg))
    }
    try {
      logAlertsEvent({
        route: "test",
        event: "sample",
        detail: { foo: 1 },
      })
    } finally {
      console.info = orig
    }
    assert.equal(lines.length, 1)
    const parsed = JSON.parse(lines[0]!) as Record<string, unknown>
    assert.equal(parsed.service, "pf-alerts")
    assert.equal(parsed.route, "test")
    assert.equal(parsed.event, "sample")
    assert.ok(typeof parsed.ts === "string")
    assert.deepEqual(parsed.detail, { foo: 1 })
  })

  it("logAlertsApiExit includes http_exit reason and status", () => {
    const lines: string[] = []
    const orig = console.warn
    console.warn = (msg: unknown) => {
      lines.push(String(msg))
    }
    try {
      logAlertsApiExit("me", 403, "subscriber_not_found")
    } finally {
      console.warn = orig
    }
    assert.equal(lines.length, 1)
    const parsed = JSON.parse(lines[0]!) as Record<string, unknown>
    assert.equal(parsed.event, "http_exit")
    assert.equal(parsed.httpStatus, 403)
    const detail = parsed.detail as Record<string, unknown>
    assert.equal(detail.reason, "subscriber_not_found")
  })
})

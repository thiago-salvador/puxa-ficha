import assert from "node:assert/strict"
import { test } from "node:test"
import { ANALYTICS_EVENTS, isAnalyticsEventName, sanitizeColinhaSharePayload } from "../src/lib/analytics-events"

test("Colinha Share aceita só formato e descarta escolhas e identificadores", () => {
  assert.equal(isAnalyticsEventName(ANALYTICS_EVENTS.colinhaShare), true)
  assert.deepEqual(sanitizeColinhaSharePayload({
    format: "story", uf: "SP", df: "123", s1: "456", partido: "ABC", proof_id: "abc123456",
  }), { format: "story" })
  assert.equal(sanitizeColinhaSharePayload({ format: "unknown", uf: "SP" }), null)
})

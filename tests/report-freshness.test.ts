import assert from "node:assert/strict"
import { test } from "node:test"
import {
  assertFreshReport,
  getMaxReportAgeMs,
} from "../scripts/lib/report-freshness"

test("assertFreshReport accepts a report generated inside the allowed window", () => {
  assert.doesNotThrow(() =>
    assertFreshReport("2026-07-11T12:00:00.000Z", "report", Date.parse("2026-07-11T12:30:00.000Z"), 3_600_000),
  )
})

test("assertFreshReport rejects stale, invalid and future reports", () => {
  assert.throws(
    () => assertFreshReport("2026-07-11T10:00:00.000Z", "report", Date.parse("2026-07-11T12:30:00.000Z"), 3_600_000),
    /stale/,
  )
  assert.throws(() => assertFreshReport("invalid", "report"), /timestamp valido/)
  assert.throws(
    () => assertFreshReport("2026-07-11T13:00:00.000Z", "report", Date.parse("2026-07-11T12:00:00.000Z")),
    /timestamp no futuro/,
  )
})

test("getMaxReportAgeMs rejects unsafe configuration", () => {
  assert.equal(getMaxReportAgeMs("60000"), 60_000)
  assert.throws(() => getMaxReportAgeMs("0"), /invalido/)
})

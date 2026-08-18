import test from "node:test"
import assert from "node:assert/strict"
import { safeJsonLdStringify } from "../src/lib/json-ld"

test("safeJsonLdStringify escapes HTML-breaking characters", () => {
  const payload = {
    title: "</script><script>alert(1)</script>",
    amp: "A&B",
  }

  const serialized = safeJsonLdStringify(payload)

  assert.equal(serialized.includes("</script>"), false)
  assert.equal(serialized.includes("\\u003c/script\\u003e"), true)
  assert.equal(serialized.includes("\\u0026"), true)
})

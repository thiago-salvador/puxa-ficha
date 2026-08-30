import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { isAlertsEmailFeatureEnabled } from "../src/lib/alerts-feature"

test("flag de alertas habilita somente com true literal", () => {
  assert.equal(isAlertsEmailFeatureEnabled({ NEXT_PUBLIC_ALERTS_EMAIL_ENABLED: "true" }), true)
  for (const value of [undefined, "", "false", "1", "TRUE"]) {
    assert.equal(isAlertsEmailFeatureEnabled({ NEXT_PUBLIC_ALERTS_EMAIL_ENABLED: value }), false)
  }
})

test("subscribe e digest aplicam a mesma flag no servidor", () => {
  const subscribe = readFileSync("src/app/api/alerts/subscribe/route.ts", "utf8")
  const digest = readFileSync("src/app/api/alerts/send-digest/route.ts", "utf8")
  for (const route of [subscribe, digest]) {
    assert.match(route, /isAlertsEmailFeatureEnabled\(\)/)
    assert.match(route, /applyAlertsNoStoreHeaders/)
  }
  assert.match(subscribe, /Alerts email feature disabled/)
  assert.match(digest, /disabled: true/)
})

test("produção não reutiliza o salt de quiz para hash de IP de alertas", () => {
  const shared = readFileSync("src/lib/alerts-shared.ts", "utf8")
  const validation = readFileSync("src/lib/production-env.ts", "utf8")
  assert.match(shared, /Missing PF_ALERTS_IP_SALT \(required in production\)/)
  assert.match(validation, /missing\.push\("PF_ALERTS_IP_SALT"\)/)
  assert.doesNotMatch(validation, /PF_ALERTS_IP_SALT ou PF_QUIZ_SHORT_LINK_SALT/)
})

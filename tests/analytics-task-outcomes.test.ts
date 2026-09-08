import assert from "node:assert/strict"
import { test } from "node:test"
import { sanitizeAnalyticsPayload, summarizeAnalyticsTasks } from "../src/lib/analytics-events"
import { observeAnalyticsResult } from "../src/lib/analytics-visibility"
import { readProofIdFromUrl, trackLaunchEvent } from "../src/lib/analytics-client"

test("separates comparison selection from a visible result without changing legacy meaning", () => {
  assert.deepEqual(summarizeAnalyticsTasks([
    { event_name: "Candidate Click", payload: { slug: "never-kept" } },
    { event_name: "External Source Click" },
    { event_name: "Comparison Start" },
    { event_name: "Comparison Start", payload: { stage: "ready" } },
    { event_name: "Comparison Start", payload: { stage: "viewed" } },
    { event_name: "Other" },
  ]), { candidateOpened: 1, sourceOpened: 1, comparisonReady: 2, comparisonViewed: 1 })
})

test("rejects free queries, political preference and arbitrary stage values", () => {
  assert.deepEqual(sanitizeAnalyticsPayload({ query: "secret", political_preference: "secret", stage: "secret" }), {})
  assert.deepEqual(sanitizeAnalyticsPayload({ stage: "viewed" }), { stage: "viewed" })
})

test("reports only a visible result, once, and disconnects observation", () => {
  const original = globalThis.IntersectionObserver
  let callback: IntersectionObserverCallback = () => {}
  let disconnects = 0
  let views = 0
  globalThis.IntersectionObserver = class {
    constructor(cb: IntersectionObserverCallback) { callback = cb }
    observe() {}
    disconnect() { disconnects++ }
  } as unknown as typeof IntersectionObserver
  try {
    const cleanup = observeAnalyticsResult({} as Element, () => views++)
    const emit = (isIntersecting: boolean) => callback([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver)
    emit(false)
    assert.equal(views, 0)
    emit(true)
    emit(true)
    assert.equal(views, 1)
    assert.equal(disconnects, 1)
    cleanup()
    assert.equal(disconnects, 2)
    const cancel = observeAnalyticsResult({} as Element, () => views++)
    cancel()
    emit(true)
    assert.equal(views, 1, "a callback queued before cleanup must not report")
  } finally {
    globalThis.IntersectionObserver = original
  }
})

test("a page proof survives URL normalization before a delayed comparison view", async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window")
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator")
  const previousObserver = globalThis.IntersectionObserver
  const page = { location: { href: "https://puxaficha.com.br/comparar?pf_analytics_proof=proof123456" } }
  const bodies: Blob[] = []
  let callback: IntersectionObserverCallback = () => {}
  Object.defineProperty(globalThis, "window", { value: page, configurable: true })
  Object.defineProperty(globalThis, "navigator", {
    value: { sendBeacon: (_url: string, body: Blob) => { bodies.push(body); return true } },
    configurable: true,
  })
  globalThis.IntersectionObserver = class {
    constructor(cb: IntersectionObserverCallback) { callback = cb }
    observe() {}
    disconnect() {}
  } as unknown as typeof IntersectionObserver
  try {
    const proofId = readProofIdFromUrl()
    assert.equal(proofId, "proof123456")
    trackLaunchEvent("Comparison Start", { stage: "ready", proof_id: proofId })
    const cleanup = observeAnalyticsResult({} as Element, () => {
      trackLaunchEvent("Comparison Start", { stage: "viewed", proof_id: proofId })
    })
    page.location.href = "https://puxaficha.com.br/comparar?c=a,b"
    assert.equal(readProofIdFromUrl(), null)
    callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
    cleanup()
    const events = await Promise.all(bodies.map(async (body) => JSON.parse(await body.text())))
    assert.deepEqual(events.map((event) => event.payload), [
      { stage: "ready", proof_id: "proof123456" },
      { stage: "viewed", proof_id: "proof123456" },
    ])
    // A new page lifecycle does not inherit the previous proof; invalid input is rejected.
    page.location.href = "https://puxaficha.com.br/comparar?pf_analytics_proof=invalid%20proof"
    assert.equal(readProofIdFromUrl(), null)
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow)
    else Reflect.deleteProperty(globalThis, "window")
    if (previousNavigator) Object.defineProperty(globalThis, "navigator", previousNavigator)
    else Reflect.deleteProperty(globalThis, "navigator")
    globalThis.IntersectionObserver = previousObserver
  }
})

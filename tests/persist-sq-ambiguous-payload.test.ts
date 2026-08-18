import assert from "node:assert/strict"
import test from "node:test"

import {
  buildAmbiguousPayload,
  type AmbiguousEvent,
} from "../scripts/persist-sq-candidato"

test("buildAmbiguousPayload retorna estrutura vazia para lista vazia", () => {
  const payload = buildAmbiguousPayload([], "2026-04-14T17:00:00.000Z")
  assert.equal(payload.generated_at, "2026-04-14T17:00:00.000Z")
  assert.equal(payload.source, "persist-sq-candidato")
  assert.equal(payload.total_events, 0)
  assert.deepEqual(payload.distinct_slugs, [])
  assert.deepEqual(payload.events, [])
})

test("buildAmbiguousPayload preserva motivo e sq_removed por evento", () => {
  const events: AmbiguousEvent[] = [
    { slug: "joao-silva", ano: 2022, motivo: "ambiguous-caller-removed", sq_removed: "12345" },
    { slug: "pedro-costa", ano: 2022, motivo: "ambiguous-caller-blocked", sq_removed: null },
    { slug: "maria-santos", ano: 2020, motivo: "ambiguous-resolver-skipped", sq_removed: null },
  ]
  const payload = buildAmbiguousPayload(events, "2026-04-14T17:00:00.000Z")
  assert.equal(payload.total_events, 3)
  assert.deepEqual(payload.distinct_slugs, ["joao-silva", "maria-santos", "pedro-costa"])
  const eventsBySlug = Object.fromEntries(payload.events.map((e) => [e.slug, e]))
  assert.equal(eventsBySlug["joao-silva"].sq_removed, "12345")
  assert.equal(eventsBySlug["joao-silva"].motivo, "ambiguous-caller-removed")
  assert.equal(eventsBySlug["pedro-costa"].sq_removed, null)
  assert.equal(eventsBySlug["pedro-costa"].motivo, "ambiguous-caller-blocked")
  assert.equal(eventsBySlug["maria-santos"].sq_removed, null)
  assert.equal(eventsBySlug["maria-santos"].motivo, "ambiguous-resolver-skipped")
})

test("buildAmbiguousPayload invariante: ambiguous-caller-removed sempre tem sq_removed não-null", () => {
  const events: AmbiguousEvent[] = [
    { slug: "a", ano: 2020, motivo: "ambiguous-caller-removed", sq_removed: "111" },
    { slug: "b", ano: 2022, motivo: "ambiguous-caller-blocked", sq_removed: null },
    { slug: "c", ano: 2022, motivo: "ambiguous-resolver-skipped", sq_removed: null },
  ]
  const payload = buildAmbiguousPayload(events, "2026-04-14T17:00:00.000Z")
  for (const event of payload.events) {
    if (event.motivo === "ambiguous-caller-removed") {
      assert.ok(
        event.sq_removed !== null && event.sq_removed !== "",
        `ambiguous-caller-removed deve ter sq_removed não-null: ${JSON.stringify(event)}`
      )
    }
    if (event.motivo === "ambiguous-caller-blocked" || event.motivo === "ambiguous-resolver-skipped") {
      assert.equal(
        event.sq_removed,
        null,
        `${event.motivo} deve ter sq_removed=null: ${JSON.stringify(event)}`
      )
    }
  }
})

test("buildAmbiguousPayload ordena eventos por ano, slug e motivo", () => {
  const events: AmbiguousEvent[] = [
    { slug: "z", ano: 2022, motivo: "ambiguous-caller-removed", sq_removed: "1" },
    { slug: "a", ano: 2022, motivo: "ambiguous-resolver-skipped", sq_removed: null },
    { slug: "a", ano: 2020, motivo: "ambiguous-caller-removed", sq_removed: "2" },
    { slug: "a", ano: 2020, motivo: "ambiguous-resolver-skipped", sq_removed: null },
  ]
  const payload = buildAmbiguousPayload(events, "2026-04-14T17:00:00.000Z")
  assert.deepEqual(
    payload.events.map((e) => `${e.ano}/${e.slug}/${e.motivo}`),
    [
      "2020/a/ambiguous-caller-removed",
      "2020/a/ambiguous-resolver-skipped",
      "2022/a/ambiguous-resolver-skipped",
      "2022/z/ambiguous-caller-removed",
    ]
  )
})

test("buildAmbiguousPayload dedupe distinct_slugs mantendo ordem alfabética", () => {
  const events: AmbiguousEvent[] = [
    { slug: "carlos", ano: 2022, motivo: "ambiguous-caller-removed", sq_removed: "1" },
    { slug: "ana", ano: 2022, motivo: "ambiguous-resolver-skipped", sq_removed: null },
    { slug: "ana", ano: 2020, motivo: "ambiguous-caller-removed", sq_removed: "2" },
    { slug: "bruno", ano: 2022, motivo: "ambiguous-resolver-skipped", sq_removed: null },
  ]
  const payload = buildAmbiguousPayload(events, "2026-04-14T17:00:00.000Z")
  assert.deepEqual(payload.distinct_slugs, ["ana", "bruno", "carlos"])
  assert.equal(payload.total_events, 4)
})

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"
import {
  isMissingQuotaRpc,
  readQuotaRpcId,
  readQuotaRpcStatus,
} from "@/lib/quota-rpc"

type ReservationStatus = "inserted" | "quota_exceeded"

interface Deferred {
  promise: Promise<void>
  resolve: () => void
}

function deferred(): Deferred {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

/**
 * Executable model of the migration contract: requests with the same quota key
 * enter one critical section at a time, then count and write atomically.
 */
class AtomicQuotaModel {
  private readonly counts = new Map<string, number>()
  private readonly tails = new Map<string, Promise<void>>()
  private readonly locked = new Set<string>()
  private readonly queued = new Map<string, number>()

  queuedFor(key: string): number {
    return this.queued.get(key) ?? 0
  }

  countFor(key: string): number {
    return this.counts.get(key) ?? 0
  }

  async reserve(
    key: string,
    max: number,
    options: { inside?: () => Promise<void>; fail?: boolean } = {},
  ): Promise<ReservationStatus> {
    if (!Number.isInteger(max) || max < 1) {
      throw new Error("p_max must be >= 1")
    }

    const previous = this.tails.get(key) ?? Promise.resolve()
    const release = deferred()
    const tail = previous.then(() => release.promise)
    this.tails.set(key, tail)

    const wasQueued = this.locked.has(key)
    if (wasQueued) this.queued.set(key, this.queuedFor(key) + 1)
    await previous
    if (wasQueued) this.queued.set(key, this.queuedFor(key) - 1)

    assert.equal(this.locked.has(key), false, `critical section overlapped for ${key}`)
    this.locked.add(key)
    try {
      await options.inside?.()
      if (options.fail) throw new Error("simulated write failure")

      const count = this.countFor(key)
      if (count >= max) return "quota_exceeded"
      this.counts.set(key, count + 1)
      return "inserted"
    } finally {
      this.locked.delete(key)
      release.resolve()
      if (this.tails.get(key) === tail) this.tails.delete(key)
    }
  }
}

function analyticsQuotaRpcBody(): string {
  const migration = readFileSync(
    join(process.cwd(), "supabase/migrations/20260821010000_reserve_ip_quotas_atomicas.sql"),
    "utf8",
  )
  const start = migration.indexOf(
    "CREATE OR REPLACE FUNCTION public.insert_analytics_launch_event_under_ip_quota(",
  )
  const end = migration.indexOf("$$;", start)
  assert.notEqual(start, -1, "analytics quota RPC missing")
  assert.notEqual(end, -1, "analytics quota RPC body is incomplete")
  return migration.slice(start, end)
}

describe("quota RPC response contract", () => {
  it("reads success, limit and id payloads returned by PostgREST", () => {
    assert.equal(readQuotaRpcStatus("inserted"), "inserted")
    assert.equal(readQuotaRpcStatus({ status: "inserted" }), "inserted")
    assert.equal(readQuotaRpcStatus({ status: "quota_exceeded" }), "quota_exceeded")
    assert.equal(readQuotaRpcId({ id: "subscriber-123" }), "subscriber-123")
  })

  it("rejects malformed status and id payloads", () => {
    for (const payload of [null, undefined, 42, true, [], {}, { status: 42 }]) {
      assert.equal(readQuotaRpcStatus(payload), null)
    }
    for (const payload of [null, "subscriber-123", {}, { id: "" }, { id: 42 }]) {
      assert.equal(readQuotaRpcId(payload), null)
    }
  })

  it("classifies missing RPC errors without hiding unrelated failures", () => {
    assert.equal(isMissingQuotaRpc({ code: "PGRST202" }), true)
    assert.equal(isMissingQuotaRpc({ code: "42883" }), true)
    assert.equal(
      isMissingQuotaRpc({ message: "Could not find the function public.reserve_ip_quota" }),
      true,
    )
    assert.equal(
      isMissingQuotaRpc({ message: "function public.reserve_ip_quota does not exist" }),
      true,
    )
    assert.equal(isMissingQuotaRpc({ code: "42501", message: "permission denied" }), false)
    assert.equal(isMissingQuotaRpc({ code: "57014", message: "statement timeout" }), false)
    assert.equal(isMissingQuotaRpc(null), false)
  })
})

describe("quota RPC atomic contract", () => {
  it("anchors the model to lock, count, limit, write and success order in SQL", () => {
    const body = analyticsQuotaRpcBody()
    const orderedClauses = [
      "p_max must be >= 1",
      "pg_advisory_xact_lock",
      "SELECT COUNT(*)::integer INTO v_count",
      "IF v_count >= p_max THEN",
      "INSERT INTO public.analytics_launch_events",
      "RETURN jsonb_build_object('status', 'inserted')",
    ]

    let previous = -1
    for (const clause of orderedClauses) {
      const current = body.indexOf(clause)
      assert.ok(current > previous, `${clause} is missing or out of contract order`)
      previous = current
    }
  })

  it("serializes real async contention and admits exactly the quota maximum", async () => {
    const model = new AtomicQuotaModel()
    const firstInside = deferred()
    const releaseFirst = deferred()
    const first = model.reserve("analytics-event:ip-a", 3, {
      inside: async () => {
        firstInside.resolve()
        await releaseFirst.promise
      },
    })
    await firstInside.promise

    const contenders = Array.from({ length: 7 }, () =>
      model.reserve("analytics-event:ip-a", 3),
    )
    assert.equal(model.queuedFor("analytics-event:ip-a"), contenders.length)

    releaseFirst.resolve()
    const results = await Promise.all([first, ...contenders])
    assert.equal(results.filter((status) => status === "inserted").length, 3)
    assert.equal(results.filter((status) => status === "quota_exceeded").length, 5)
    assert.equal(model.countFor("analytics-event:ip-a"), 3)
    assert.equal(model.queuedFor("analytics-event:ip-a"), 0)
  })

  it("does not serialize independent quota keys behind each other", async () => {
    const model = new AtomicQuotaModel()
    const firstInside = deferred()
    const releaseFirst = deferred()
    const blockedKey = model.reserve("analytics-event:ip-a", 1, {
      inside: async () => {
        firstInside.resolve()
        await releaseFirst.promise
      },
    })
    await firstInside.promise

    assert.equal(await model.reserve("analytics-event:ip-b", 1), "inserted")
    assert.equal(model.countFor("analytics-event:ip-b"), 1)
    releaseFirst.resolve()
    assert.equal(await blockedKey, "inserted")
  })

  it("releases the key after errors so the next reservation can succeed", async () => {
    const model = new AtomicQuotaModel()
    const firstInside = deferred()
    const releaseFirst = deferred()
    const failing = model.reserve("analytics-event:ip-error", 1, {
      fail: true,
      inside: async () => {
        firstInside.resolve()
        await releaseFirst.promise
      },
    })
    await firstInside.promise
    const next = model.reserve("analytics-event:ip-error", 1)
    assert.equal(model.queuedFor("analytics-event:ip-error"), 1)

    releaseFirst.resolve()
    await assert.rejects(failing, /simulated write failure/)
    assert.equal(await next, "inserted")
    assert.equal(model.countFor("analytics-event:ip-error"), 1)
    assert.equal(model.queuedFor("analytics-event:ip-error"), 0)
    await assert.rejects(model.reserve("analytics-event:invalid", 0), /p_max must be >= 1/)
  })
})

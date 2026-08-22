import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  isMissingQuotaRpc,
  readQuotaRpcId,
  readQuotaRpcStatus,
  type QuotaRpcFunctionName,
} from "@/lib/quota-rpc"

const QUIZ_RPC: QuotaRpcFunctionName = "insert_quiz_short_link_under_ip_quota"

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

  it("requires the expected quota function in missing-RPC errors", () => {
    assert.equal(
      isMissingQuotaRpc(
        {
          code: "PGRST202",
          message:
            "Could not find the function public.insert_quiz_short_link_under_ip_quota(p_max) in the schema cache",
        },
        QUIZ_RPC,
      ),
      true,
    )
    assert.equal(
      isMissingQuotaRpc(
        {
          code: "42883",
          message: "function public.insert_quiz_short_link_under_ip_quota(text) does not exist",
        },
        QUIZ_RPC,
      ),
      true,
    )
    assert.equal(
      isMissingQuotaRpc(
        {
          message: 'function "public"."insert_quiz_short_link_under_ip_quota" does not exist',
        },
        QUIZ_RPC,
      ),
      true,
    )
  })

  it("fails closed when an internal function or a different RPC is missing", () => {
    assert.equal(isMissingQuotaRpc({ code: "PGRST202" }, QUIZ_RPC), false)
    assert.equal(isMissingQuotaRpc({ code: "42883" }, QUIZ_RPC), false)
    assert.equal(
      isMissingQuotaRpc(
        {
          code: "42883",
          message: "function extensions.digest(text, text) does not exist",
        },
        QUIZ_RPC,
      ),
      false,
    )
    assert.equal(
      isMissingQuotaRpc(
        {
          code: "PGRST202",
          message:
            "Could not find the function public.insert_analytics_launch_event_under_ip_quota in the schema cache",
        },
        QUIZ_RPC,
      ),
      false,
    )
    assert.equal(
      isMissingQuotaRpc(
        {
          code: "42883",
          message:
            "trigger failed because function public.refresh_quota_projection() does not exist",
        },
        QUIZ_RPC,
      ),
      false,
    )
    assert.equal(
      isMissingQuotaRpc(
        {
          code: "42883",
          message:
            "function extensions.digest(text, text) does not exist while executing function public.insert_quiz_short_link_under_ip_quota",
        },
        QUIZ_RPC,
      ),
      false,
    )
  })

  it("does not hide unrelated database failures", () => {
    assert.equal(
      isMissingQuotaRpc(
        {
          code: "42501",
          message: "permission denied for function insert_quiz_short_link_under_ip_quota",
        },
        QUIZ_RPC,
      ),
      false,
    )
    assert.equal(
      isMissingQuotaRpc(
        {
          code: "57014",
          message: "statement timeout in insert_quiz_short_link_under_ip_quota",
        },
        QUIZ_RPC,
      ),
      false,
    )
    assert.equal(isMissingQuotaRpc(null, QUIZ_RPC), false)
  })
})

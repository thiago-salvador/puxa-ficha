import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { NextResponse } from "next/server"
import {
  ALERT_MANAGE_TOKEN_COOKIE_NAME,
  clearAlertManageTokenCookie,
  resolveAlertManageToken,
  setAlertManageTokenCookie,
} from "../src/lib/alerts-session"

describe("alerts-session", () => {
  it("resolveAlertManageToken returns the first valid token", () => {
    const token = resolveAlertManageToken(["", "invalid token", "AbCdEfGhIjKlMnOp", "later"])
    assert.equal(token, "AbCdEfGhIjKlMnOp")
  })

  it("setAlertManageTokenCookie stores an HttpOnly cookie", () => {
    const response = setAlertManageTokenCookie(NextResponse.json({ ok: true }), "AbCdEfGhIjKlMnOp")
    const cookie = response.cookies.get(ALERT_MANAGE_TOKEN_COOKIE_NAME)
    assert.ok(cookie)
    assert.equal(cookie?.value, "AbCdEfGhIjKlMnOp")
  })

  it("clearAlertManageTokenCookie expires the session cookie", () => {
    const response = clearAlertManageTokenCookie(NextResponse.json({ ok: true }))
    const cookie = response.cookies.get(ALERT_MANAGE_TOKEN_COOKIE_NAME)
    assert.ok(cookie)
    assert.equal(cookie?.value, "")
  })
})

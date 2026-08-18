import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { isSupabaseNoRowError } from "../src/lib/supabase-errors"

describe("isSupabaseNoRowError", () => {
  it("retorna true para PGRST116 (no rows returned)", () => {
    assert.equal(isSupabaseNoRowError({ code: "PGRST116" }), true)
  })

  it("retorna false para outros codigos PostgREST", () => {
    assert.equal(isSupabaseNoRowError({ code: "PGRST301" }), false)
    assert.equal(isSupabaseNoRowError({ code: "42P01" }), false)
  })

  it("retorna false para erro sem code", () => {
    assert.equal(isSupabaseNoRowError({}), false)
  })

  it("retorna false para code null/undefined", () => {
    assert.equal(isSupabaseNoRowError({ code: null }), false)
    assert.equal(isSupabaseNoRowError({ code: undefined }), false)
  })

  it("retorna false para error null/undefined", () => {
    assert.equal(isSupabaseNoRowError(null), false)
    assert.equal(isSupabaseNoRowError(undefined), false)
  })
})

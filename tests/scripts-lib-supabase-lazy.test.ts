/**
 * Regressão: import de scripts/lib/supabase não deve lançar no carregamento.
 *
 * Se SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não estiverem definidos, o throw
 * precisa acontecer **apenas** no primeiro uso de `supabase.*`, não no import.
 * Isso permite que testes que importam transitivamente `./lib/supabase`
 * rodem sem precisar de envs de produção no runner de CI.
 */

import assert from "node:assert/strict"
import { describe, it } from "node:test"

describe("scripts/lib/supabase — lazy init", () => {
  it("import do módulo não lança quando envs estão ausentes", async () => {
    // Remove envs para forçar o cenário de CI sem secrets no job.
    const priorUrl = process.env.SUPABASE_URL
    const priorPubUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const priorKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    delete process.env.SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY

    try {
      const mod = await import("../scripts/lib/supabase")
      assert.ok(mod, "módulo deve carregar sem lançar")
      assert.equal(typeof mod.supabase, "object", "export supabase deve existir")
      assert.equal(typeof mod.ensureSupabaseClient, "function", "helper explícito deve existir")
    } finally {
      if (priorUrl !== undefined) process.env.SUPABASE_URL = priorUrl
      if (priorPubUrl !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = priorPubUrl
      if (priorKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = priorKey
    }
  })
})

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260819140300_renan_santos_processos_assunto_absolvido.sql"),
  "utf8",
)

describe("processos do Renan Santos: assunto e absolvição", () => {
  it("reescreve os quatro CNJs com lead de classe e disclaimer no fim", () => {
    for (const cnj of [
      "0000349-29.2026.2.00.0515",
      "0600089-03.2025.6.16.0144",
      "0262930-72.2017.8.19.0001",
      "1039971-32.2024.8.26.0002",
    ]) {
      assert.match(sql, new RegExp(cnj.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    }
    assert.match(sql, /Reclamação disciplinar/)
    assert.match(sql, /Lista de apoiamento para criação de partido político/)
    assert.match(sql, /Recurso especial e recurso extraordinário/)
    assert.match(sql, /indenização por dano moral/)
    assert.match(sql, /Sleeping Giants Brasil/)
    assert.match(sql, /não informa, por si só, mérito, culpa ou desfecho/)
  })

  it("insere o caso criminal absolvido sem CNJ e com confirmação do MP-SP", () => {
    assert.match(sql, /INSERT INTO public\.processos/)
    assert.match(sql, /'criminal'/)
    assert.match(sql, /'absolvido'/)
    assert.match(sql, /Justiça de São Paulo',\s*NULL,\s*'Renan Santos foi absolvido/)
    assert.match(sql, /número do processo não é público/)
    assert.match(sql, /Ministério Público de São Paulo/)
    assert.match(sql, /g1\.globo\.com/)
    assert.doesNotMatch(sql, /\bB\.O\./)
  })
})

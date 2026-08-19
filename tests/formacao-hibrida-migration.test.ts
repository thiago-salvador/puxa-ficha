import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { classificarMigration } from "../scripts/audit/lib/migrations-classificacao"

const ROOT = process.cwd()
const schemaPath = join(ROOT, "supabase/migrations/20260819140000_formacao_instituicao_schema_publico.sql")
const higienePath = join(ROOT, "supabase/migrations/20260819140200_formacao_instituicao_higiene.sql")
const schema = readFileSync(schemaPath, "utf8")
const higiene = readFileSync(higienePath, "utf8")

const HIGIENE = [
  ["renan-santos", "SUPERIOR INCOMPLETO", "Universidade de São Paulo"],
  ["acm-neto", "SUPERIOR COMPLETO", "Universidade Federal da Bahia"],
  ["joao-henrique-catan", "SUPERIOR COMPLETO", "Instituto Presbiteriano Mackenzie"],
] as const

describe("formação híbrida", () => {
  it("mantém schema e higiene em migrations separadas e não mistas", () => {
    assert.doesNotMatch(schema, /\b(INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM)\b/i)
    assert.doesNotMatch(higiene, /\b(CREATE|ALTER|DROP)\s+(TABLE|VIEW|INDEX)\b/i)
    assert.equal(classificarMigration(schemaPath, schema).mista, false)
    assert.equal(classificarMigration(higienePath, higiene).classe, "curadoria")
  })

  it("não concatena grau e instituição na coluna de grau", () => {
    assert.doesNotMatch(higiene, /formacao = 'SUPERIOR INCOMPLETO ·/)
    assert.match(higiene, /formacao_instituicao = 'Universidade de São Paulo'/)
  })

  it("restaura o grau TSE e a instituição curada nos slugs de instituição-como-grau", () => {
    for (const [slug, grau, instituicao] of HIGIENE) {
      assert.match(higiene, new RegExp(`slug=${slug} campos=formacao,formacao_instituicao`))
      assert.match(higiene, new RegExp(`formacao = '${grau}'`))
      assert.match(higiene, new RegExp(`formacao_instituicao = '${instituicao.replace(/[()]/g, "\\$&")}'`))
    }
  })
})

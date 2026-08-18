import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

const ROOT = join(import.meta.dirname, "..")
const VERSION = "20260812124000"
const MIGRATION = join(ROOT, `supabase/migrations/${VERSION}_orleans_destaques_proveniencia.sql`)
const ROLLBACK = join(ROOT, `supabase/rollback/${VERSION}_orleans_destaques_proveniencia.rollback.sql`)
const READBACK = join(ROOT, `supabase/readback/${VERSION}_orleans_destaques_proveniencia.readback.sql`)
const MANIFESTO = join(ROOT, "QA/evidencias/2026-08-12-orleans-destaques-proveniencia/manifesto.json")
const HARNESS = join(ROOT, "scripts/audit/provar-migration-orleans-destaques-proveniencia.sh")

describe("proveniência dos destaques após o split de Orleans", () => {
  test("manifesta exatamente cinco fontes sem fabricar ausência", () => {
    assert.ok(existsSync(MANIFESTO), MANIFESTO)
    const manifesto = JSON.parse(readFileSync(MANIFESTO, "utf8")) as {
      candidato: { id: string; slug: string; nome_completo: string; data_nascimento: string }
      celulas: Array<{
        fonte: string
        resultado: string
        tentativa_executada: boolean
        detalhe: string
        url: string | null
      }>
    }
    assert.deepEqual(manifesto.candidato, {
      id: "b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601",
      slug: "orleans-brandao",
      nome_completo: "Carlos Orleans Braide Brandão",
      data_nascimento: "1994-12-08",
    })
    assert.deepEqual(
      manifesto.celulas.map((item) => item.fonte).sort(),
      ["destaques-patrimonio", "destaques-processos", "destaques-sancoes", "destaques-trajetoria", "destaques-votacoes"],
    )
    assert.equal(manifesto.celulas.length, 5)
    assert.equal(manifesto.celulas.filter((item) => item.resultado === "indeterminado").length, 4)
    assert.equal(manifesto.celulas.filter((item) => item.resultado === "sem_achado_no_escopo").length, 1)
    assert.equal(manifesto.celulas.filter((item) => ["vazio_confirmado", "nao_aplicavel"].includes(item.resultado)).length, 0)
    assert.ok(manifesto.celulas.every((item) => item.detalhe.length > 30))
    const trajetoria = manifesto.celulas.find((item) => item.fonte === "destaques-trajetoria")
    assert.equal(trajetoria?.tentativa_executada, true)
    assert.match(trajetoria?.url ?? "", /consulta_cand_2026\.zip$/)
  })

  test("migration, rollback, readback e harness são fail-closed por identidade e payload", () => {
    for (const path of [MIGRATION, ROLLBACK, READBACK, HARNESS]) assert.ok(existsSync(path), path)
    const migration = readFileSync(MIGRATION, "utf8")
    const rollback = readFileSync(ROLLBACK, "utf8")
    const readback = readFileSync(READBACK, "utf8")
    const harness = readFileSync(HARNESS, "utf8")

    for (const sql of [migration, readback]) {
      assert.match(sql, /b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601/)
      assert.match(sql, /Carlos Orleans Braide Brandão/)
      assert.match(sql, /1994-12-08/)
      assert.match(sql, /20260811102100/)
    }
    assert.match(migration, /verificacao igual ou posterior/i)
    assert.match(migration, /@write tabela=coleta_log ref=orleans-destaques-proveniencia:5/)
    const valores = migration.match(/insert into _orleans_destaques_proveniencia[\s\S]*?;\n/)?.[0] ?? ""
    assert.doesNotMatch(valores, /vazio_confirmado|nao_aplicavel/)
    assert.match(readback, /silenciosas/i)
    assert.match(readback, /expected_payload_mismatch/i)
    assert.match(rollback, /payload atual diverge/i)
    assert.match(rollback, new RegExp(`version\\s*=\\s*'${VERSION}'`, "i"))
    assert.match(harness, /readback recusa payload adulterado/i)
    assert.match(harness, /rollback recusa curadoria posterior/i)
  })

  test("Fase 4 passa a exigir ledger 395, topo 125000 e os 24 readbacks", () => {
    const runner = readFileSync(join(ROOT, "scripts/audit/readback-publico-fase4.sh"), "utf8")
    const operational = readFileSync(join(ROOT, "tests/release-operational-artifacts.test.ts"), "utf8")
    assert.match(runner, /ledger_total[^\n]*395|total [^\n]*\/395/)
    assert.match(runner, /ledger_top[^\n]*20260812125000|topo [^\n]*20260812125000/)
    assert.match(runner, /release_versions=\([\s\S]*20260812124000/)
    assert.match(runner, /release_versions=\([\s\S]*20260812125000/)
    assert.match(operational, /20260812125000/)
    assert.match(operational, /size, 24/)
  })
})
